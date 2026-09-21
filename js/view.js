/**
 * view.js — what the screen is showing.
 *
 * Two independent choices:
 *   - which folder is open (or Unsorted) — shared by every tab, and
 *     remembered across launches;
 *   - which tab is up — not remembered, so the app always opens on the list.
 *
 * Archived is a tab like the others, except that it ignores the open folder
 * entirely: archived words collect in one place wherever they came from.
 */

import { STORAGE_KEYS, UNSORTED_LABEL } from './config.js';
import { readJson, writeJson } from './storage.js';
import {
  getFolders, getWordsInFolder, findFolderByName, countUnsorted, getArchivedWords,
} from './store.js';

export const UNSORTED = 'unsorted';
export const FOLDER = 'folder';

/** The tab whose scope is every archived word rather than one folder. */
export const ARCHIVED = 'archived';

const listeners = new Set();

/** { kind: 'unsorted' } | { kind: 'folder', name } | null */
let selection = readJson(STORAGE_KEYS.folder, null);

/** 'list', 'cards', 'quiz' or 'archived'. */
let tab = 'list';

export function subscribeView(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => listener());
}

/* --- Folder --------------------------------------------------------------- */

/**
 * The folder that is open, settled against what the sheet actually holds.
 *
 * A remembered folder may have been renamed or deleted on another device, and
 * Unsorted stops being a place at all once its last word is filed — which is
 * how an app left on Unsorted could show nothing while every word sat in a
 * folder one tap away. Either way the first folder is where to land, and
 * Unsorted only when there are no folders to land in.
 */
export function getSelection() {
  if (selection && selection.kind === UNSORTED && countUnsorted() > 0) return selection;
  if (selection && selection.kind === FOLDER && findFolderByName(selection.name)) return selection;

  const first = getFolders()[0];
  return first ? { kind: FOLDER, name: first.name } : { kind: UNSORTED };
}

export function setSelection(next) {
  selection = next;
  writeJson(STORAGE_KEYS.folder, selection);
  emit();
}

export function isSelected(candidate) {
  const current = getSelection();
  return current.kind === candidate.kind
    && (current.kind !== FOLDER || current.name === candidate.name);
}

export function selectionLabel() {
  const current = getSelection();
  return current.kind === UNSORTED ? UNSORTED_LABEL : current.name;
}

/**
 * The words the current tab is about: everything archived, or everything
 * live in the open folder.
 */
export function wordsInScope() {
  if (tab === ARCHIVED) return getArchivedWords();
  return folderWords();
}

/**
 * The open folder's live words, whichever tab is up.
 *
 * The quiz asks about a folder, not about whatever screen happens to be
 * showing, so its count has to keep meaning the same thing while the
 * Archived tab is open.
 */
export function folderWords() {
  const current = getSelection();
  return getWordsInFolder(current.kind === UNSORTED ? null : current.name);
}

/** The folder a word added right now belongs to; blank means unsorted. */
export function folderForNewWord() {
  const current = getSelection();
  return current.kind === FOLDER ? current.name : '';
}

/* --- List / Cards / Quiz / Archived --------------------------------------- */

/** Which tab is up. */
export function getTab() {
  return tab;
}

/** Archived shows one collection, so the folder in the header does not apply. */
export function isArchivedTab() {
  return tab === ARCHIVED;
}

export function setTab(next) {
  if (next === tab) return;
  tab = next;
  emit();
}


