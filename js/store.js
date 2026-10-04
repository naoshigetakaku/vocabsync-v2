/**
 * store.js — word and folder state, offline cache and the outbox.
 *
 * The spreadsheet is the source of truth. Everything here is a cache in front
 * of it, plus a queue of changes that have not reached it yet.
 */

import { api, ApiError, isRetryable, getKnownBackendVersion } from './api.js';
import { STORAGE_KEYS, ARCHIVED_ON } from './config.js';
import { readJson, writeJson, remove } from './storage.js';

let words = readJson(STORAGE_KEYS.words, []);
let folders = readJson(STORAGE_KEYS.folders, []);
let outbox = readJson(STORAGE_KEYS.outbox, []);

// The first folder cache carried photo data URLs, tens of kilobytes each.
remove('vocabsync.folders.v1');

/**
 * Every field the sheet stores for a word. An update rewrites the whole row,
 * so anything a caller leaves out has to be filled from what is already
 * known — including the quiz schedule, which no form edits.
 */
const STORED_FIELDS = [
  'word', 'pos', 'definition', 'note', 'color', 'folder', 'archivedFrom', 'status',
  'reviews', 'streak', 'labelStreak', 'gap', 'ease', 'dueTick',
  'archived', 'lapses',
];

/** Must not exceed MAX_BATCH in Code.gs. */
const BATCH_LIMIT = 25;

/** The first Code.gs version that understands updateMany. */
const BATCH_VERSION = 8;

const listeners = new Set();

/* --- Subscriptions -------------------------------------------------------- */

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  const snapshot = getWords();
  listeners.forEach((listener) => listener(snapshot));
}

/* --- Reads ---------------------------------------------------------------- */

/** Unordered copy; the view applies whichever sort the user picked. */
export function getWords() {
  return words.slice();
}

export function getWord(id) {
  return words.find((word) => word.id === id) || null;
}

export function isPending(id) {
  const word = getWord(id);
  return Boolean(word && word.pending);
}

/** Creation order, so a folder keeps the same place in the menu for good. */
export function getFolders() {
  return folders.slice().sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

export function getFolder(id) {
  return folders.find((folder) => folder.id === id) || null;
}

export function findFolderByName(name) {
  return folders.find((folder) => folder.name === name) || null;
}

export function isArchived(word) {
  return word.archived === ARCHIVED_ON;
}

/**
 * Words in one folder, archived ones left out. Passing null gathers the
 * unsorted ones: no folder at all, or a folder that has since been deleted.
 */
export function getWordsInFolder(name) {
  return everythingIn(name).filter((word) => !isArchived(word));
}

/** The archived words of one folder. */
export function getArchivedInFolder(name) {
  return everythingIn(name).filter(isArchived);
}

function everythingIn(name) {
  if (name === null) {
    const names = new Set(folders.map((folder) => folder.name));
    return words.filter((word) => !word.folder || !names.has(word.folder));
  }
  return words.filter((word) => word.folder === name);
}

export function countUnsorted() {
  return getWordsInFolder(null).length;
}

/* --- Persistence ---------------------------------------------------------- */

function persist() {
  writeJson(STORAGE_KEYS.words, words);
  writeJson(STORAGE_KEYS.folders, folders);
  writeJson(STORAGE_KEYS.outbox, outbox);
}

function commit() {
  persist();
  emit();
}

function localId() {
  return 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/** True for a word created offline that the sheet has not given an id yet. */
export function isLocalOnly(word) {
  return String(word.id || '').startsWith('local-');
}

/* --- Outbox --------------------------------------------------------------- */

function enqueue(entry) {
  outbox = outbox.concat([entry]);
}

function dequeue(entry) {
  outbox = outbox.filter((item) => item !== entry);
}

/**
 * Queued rewrites of this word are superseded by any newer one: each carries
 * the whole row, so sending the older one afterwards could only undo the
 * newer. Dropping them keeps the queue short and makes that impossible.
 */
function dropQueuedUpdates(id) {
  outbox = outbox.filter((entry) => !(entry.op === 'update' && entry.fields.id === id));
}

function hasQueuedUpdate(id) {
  return outbox.some((entry) => entry.op === 'update' && entry.fields.id === id);
}

/**
 * Takes the server's copy of a word — unless something newer for it is still
 * queued, in which case the local copy is already ahead and stays.
 */
/**
 * The newest change sent for each word, as a token.
 *
 * Several changes to one word can now be on their way at once — swipe a word
 * into the archive and straight back out again, and the second request leaves
 * before the first has answered. Responses can then arrive in either order,
 * and the older one would otherwise overwrite the newer: replaceLocal even
 * puts a word back that a later delete had removed.
 *
 * So every request takes a token, superseding whatever was outstanding, and
 * only the holder of the current token is allowed to write the answer back.
 * A superseded reply is simply dropped: something newer is already on screen
 * and already on its way to the sheet.
 */
const latest = new Map();

function supersede(id) {
  const token = {};
  latest.set(id, token);
  return token;
}

function isLatest(id, token) {
  return latest.get(id) === token;
}

function settle(id, token) {
  if (isLatest(id, token)) latest.delete(id);
}

function acceptSaved(saved) {
  if (hasQueuedUpdate(saved.id)) return;
  replaceLocal(saved.id, Object.assign({}, saved, { pending: false }));
}

/** The run of consecutive updates at the head of the queue, up to the limit. */
function leadingUpdates() {
  const batch = [];
  for (const entry of outbox) {
    if (entry.op !== 'update' || batch.length >= BATCH_LIMIT) break;
    batch.push(entry);
  }
  return batch;
}

/**
 * Replay queued changes in order. Stops at the first retryable failure so the
 * queue keeps its ordering; entries the server rejects outright are dropped,
 * because retrying them forever would wedge the queue.
 *
 * Consecutive updates — a run of quiz answers, usually — go in one request
 * when the deployment is new enough to take them that way.
 */
async function runFlush() {
  const failures = [];

  while (outbox.length) {
    const entry = outbox[0];
    const batched = entry.op === 'update' && getKnownBackendVersion() >= BATCH_VERSION;
    const batch = batched ? leadingUpdates() : [entry];

    try {
      if (batched) {
        const result = await api.updateMany(batch.map((item) => item.fields));
        batch.forEach(dequeue);
        result.words.forEach(acceptSaved);
        // Deleted on another device while the answers were waiting.
        result.missing.forEach(removeLocal);
      } else if (entry.op === 'create') {
        const saved = await api.create(entry.fields);
        dequeue(entry);
        replaceLocal(entry.localId, Object.assign({}, saved, { pending: false }));
      } else if (entry.op === 'update') {
        const saved = await api.update(entry.fields);
        dequeue(entry);
        acceptSaved(saved);
      } else if (entry.op === 'delete') {
        await api.remove(entry.id);
        dequeue(entry);
      } else {
        dequeue(entry);
      }
    } catch (error) {
      if (isRetryable(error)) {
        persist();
        throw error;
      }
      batch.forEach(dequeue);
      failures.push(error);
    }
  }

  persist();
  if (failures.length) throw failures[0];
}

let flushing = null;

/**
 * One flush at a time. A second caller shares the one in flight, which picks
 * up anything queued meanwhile because it reads the queue afresh each round.
 */
function flushOutbox() {
  if (!flushing) {
    flushing = runFlush().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

export function pendingCount() {
  return outbox.length;
}

/* --- Local mutation helpers ----------------------------------------------- */

function replaceLocal(id, next) {
  let found = false;
  words = words.map((word) => {
    if (word.id !== id) return word;
    found = true;
    return next;
  });
  if (!found && next) words = [next].concat(words);
}

function removeLocal(id) {
  words = words.filter((word) => word.id !== id);
}

/** Every stored field of this word, ready to be overlaid with changes. */
function storedFieldsOf(word) {
  const fields = { id: word.id };
  STORED_FIELDS.forEach((field) => {
    if (word[field] !== undefined) fields[field] = word[field];
  });
  return fields;
}

/**
 * Remote list wins, but anything still queued locally is layered back on top so
 * an unsynced word does not vanish from the screen after a refresh.
 */
function mergeRemote(remote) {
  const queuedCreates = outbox
    .filter((entry) => entry.op === 'create')
    .map((entry) => words.find((word) => word.id === entry.localId))
    .filter(Boolean);

  const deletedIds = new Set(outbox.filter((entry) => entry.op === 'delete').map((entry) => entry.id));
  const editedById = new Map(
    outbox.filter((entry) => entry.op === 'update').map((entry) => [entry.fields.id, entry.fields])
  );

  const reconciled = remote
    .filter((word) => !deletedIds.has(word.id))
    .map((word) => {
      const edit = editedById.get(word.id);
      return edit ? Object.assign({}, word, edit, { pending: true }) : Object.assign({}, word, { pending: false });
    });

  words = queuedCreates.concat(reconciled);
}

/* --- Public actions ------------------------------------------------------- */

/** Push anything queued, then pull the authoritative snapshot. */
export async function refresh() {
  await flushOutbox();
  const snapshot = await api.list();
  folders = snapshot.folders;
  mergeRemote(snapshot.words);
  commit();
}

/** Push anything queued, without pulling. Used as the quiz goes along. */
export async function flush() {
  if (!outbox.length) return;
  try {
    await flushOutbox();
  } finally {
    commit();
  }
}

/* --- Folders --------------------------------------------------------------
   No outbox here. A folder change is rare and deliberate, and replaying one
   offline against a name another device may have taken in the meantime is a
   conflict worth refusing rather than guessing at. */

export async function createFolder(name) {
  const saved = await api.createFolder(name);
  folders = folders.concat([saved]);
  commit();
  return saved;
}

export async function renameFolder(id, name) {
  const previous = getFolder(id);
  const saved = await api.renameFolder(id, name);

  folders = folders.map((folder) => (folder.id === id ? saved : folder));
  // Words point at the folder by name, so they follow the rename locally too.
  if (previous && previous.name !== saved.name) {
    words = words.map((word) =>
      (word.folder === previous.name ? Object.assign({}, word, { folder: saved.name }) : word));
  }
  commit();
  return saved;
}

export async function deleteFolder(id) {
  const previous = getFolder(id);
  await api.removeFolder(id);

  folders = folders.filter((folder) => folder.id !== id);
  // The words survive as unsorted.
  if (previous) {
    words = words.map((word) =>
      (word.folder === previous.name ? Object.assign({}, word, { folder: '' }) : word));
  }
  commit();
}

/* --- Words ---------------------------------------------------------------- */

export async function createWord(fields) {
  const now = new Date().toISOString();
  const draft = Object.assign({}, fields, {
    id: localId(),
    createdAt: now,
    updatedAt: now,
    pending: true,
  });

  words = [draft].concat(words);
  commit();

  try {
    const saved = await api.create(fields);
    replaceLocal(draft.id, Object.assign({}, saved, { pending: false }));
    commit();
    return saved;
  } catch (error) {
    if (isRetryable(error)) {
      enqueue({ op: 'create', localId: draft.id, fields });
      commit();
      return draft;
    }
    // A rejected write must not leave a phantom row behind.
    removeLocal(draft.id);
    commit();
    throw error;
  }
}

export async function updateWord(changes) {
  const previous = getWord(changes.id);
  if (!previous) throw new ApiError('NOT_FOUND', 'That word no longer exists.');

  // Carry every stored field forward unless the caller means to change it.
  // See STORED_FIELDS.
  const fields = Object.assign(storedFieldsOf(previous), changes);

  const optimistic = Object.assign({}, previous, fields, {
    updatedAt: new Date().toISOString(),
    pending: true,
  });
  replaceLocal(fields.id, optimistic);
  // This rewrite carries the latest of everything, quiz progress included,
  // so anything older still waiting for this word is obsolete.
  dropQueuedUpdates(fields.id);
  const token = supersede(fields.id);
  commit();

  try {
    const saved = await api.update(fields);
    if (isLatest(fields.id, token)) {
      acceptSaved(saved);
      commit();
    }
    return saved;
  } catch (error) {
    if (isRetryable(error)) {
      enqueue({ op: 'update', fields });
      commit();
      return optimistic;
    }
    // Only roll back what is still on screen. Something newer has replaced
    // this, and putting the old row back would undo that too.
    if (isLatest(fields.id, token)) {
      replaceLocal(fields.id, previous);
      commit();
    }
    throw error;
  } finally {
    settle(fields.id, token);
  }
}

/**
 * Archives a word, or puts it back.
 *
 * The folder column is never touched, so restoring needs no bookkeeping at
 * all: the word simply reappears where it always was, with its quiz schedule
 * and its hidden label intact. archivedFrom is written alongside as a record
 * of that folder, for the one case the folder column cannot cover — the
 * folder being deleted while the word is away.
 */
export function setArchived(id, on) {
  const word = getWord(id);
  if (!word) return Promise.resolve(null);

  const archived = on ? ARCHIVED_ON : '';
  if ((word.archived || '') === archived) return Promise.resolve(word);

  const changes = { id, archived };
  if (on) changes.archivedFrom = word.folder || '';
  return updateWord(changes);
}

/**
 * Records one quiz answer: the new schedule, and the label if it changed.
 *
 * Applied locally at once and queued rather than sent, so the next card never
 * waits on the network. The quiz calls flush() every few answers and when it
 * ends; anything still queued goes with the next sync regardless.
 */
export function recordAnswer(id, changes) {
  const previous = getWord(id);
  if (!previous) return null;

  const fields = Object.assign(storedFieldsOf(previous), changes);
  const next = Object.assign({}, previous, fields, { pending: true });

  replaceLocal(id, next);
  dropQueuedUpdates(id);
  enqueue({ op: 'update', fields });
  commit();
  return next;
}

export async function deleteWord(id) {
  const previous = getWord(id);
  if (!previous) return;

  removeLocal(id);
  dropQueuedUpdates(id);
  // An update already on its way would otherwise answer after this and put
  // the word back; see the note on `latest`.
  supersede(id);
  commit();

  try {
    await api.remove(id);
  } catch (error) {
    if (isRetryable(error)) {
      enqueue({ op: 'delete', id });
      commit();
      return;
    }
    words = [previous].concat(words);
    commit();
    throw error;
  }
}

/** Drop every cached record — used when the credentials are replaced. */
export function reset() {
  words = [];
  folders = [];
  outbox = [];
  // Nothing still in the air belongs to this account any more.
  latest.clear();
  commit();
}
