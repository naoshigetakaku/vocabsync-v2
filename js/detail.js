/**
 * detail.js — the dialog that shows every field of one word.
 */

import { getWord, deleteWord, isPending, setArchived, isArchived } from './store.js';
import { DEFAULT_COLOR } from './config.js';
import { openDialog, closeDialog, wireDismiss } from './dialog.js';
import { askConfirm, confirmArchive } from './confirm.js';
import { pointLinks } from './links.js';
import { toast } from './toast.js';

const dialog = document.getElementById('detail-dialog');
const posElement = document.getElementById('detail-pos');
const archiveButton = document.getElementById('detail-archive');
const archiveText = document.getElementById('detail-archive-text');
const wordElement = document.getElementById('detail-word');
const definitionBlock = document.getElementById('detail-definition-block');
const definitionElement = document.getElementById('detail-definition');
const noteBlock = document.getElementById('detail-note-block');
const noteElement = document.getElementById('detail-note');
const youglishLink = document.getElementById('detail-youglish');
const duckduckgoLink = document.getElementById('detail-duckduckgo');
const deleteButton = document.getElementById('detail-delete');
const editButton = document.getElementById('detail-edit');

let currentId = null;
let onEdit = () => {};

function fill(word) {
  posElement.textContent = word.pos || '';
  posElement.hidden = !word.pos;

  // The same control both ways round: put the word aside, or bring it back.
  const archived = isArchived(word);
  archiveButton.dataset.archived = archived ? '1' : '';
  archiveButton.setAttribute('aria-pressed', archived ? 'true' : 'false');
  archiveText.textContent = archived ? 'Archived' : 'Archive';

  wordElement.textContent = word.word;
  wordElement.dataset.color = word.color || DEFAULT_COLOR;

  // Opens the web pages; on iOS the YouGlish app may claim its link itself,
  // which is up to the OS rather than anything this page can force.
  pointLinks(youglishLink, duckduckgoLink, word);

  definitionElement.textContent = word.definition || '';
  definitionBlock.hidden = !word.definition;

  noteElement.textContent = word.note || '';
  noteBlock.hidden = !word.note;
}

export function openDetail(id) {
  const word = getWord(id);
  if (!word) return;

  currentId = id;
  fill(word);
  openDialog(dialog);
}

export function closeDetail() {
  closeDialog(dialog);
  currentId = null;
}

/** Refresh the open dialog after an edit lands. */
export function syncDetail() {
  if (!currentId || !dialog.open) return;
  const word = getWord(currentId);
  if (word) fill(word);
  else closeDetail();
}

export function initDetail(handlers) {
  onEdit = handlers.onEdit;

  archiveButton.addEventListener('click', async () => {
    if (!currentId) return;
    const word = getWord(currentId);
    if (!word) return;

    const archived = isArchived(word);
    // Archiving takes a word off three screens, so it asks first. Restoring
    // only undoes that, and asking twice for one decision reads as nagging.
    if (!archived && !(await confirmArchive(word))) return;

    try {
      await setArchived(currentId, !archived);
      syncDetail();
      toast(archived ? 'Restored.' : 'Archived.');
    } catch (error) {
      toast(error.message);
    }
  });

  wireDismiss(dialog, () => {
    currentId = null;
  });

  editButton.addEventListener('click', () => {
    if (!currentId) return;
    if (isPending(currentId)) {
      toast('Still syncing — try again in a moment.');
      return;
    }
    const word = getWord(currentId);
    closeDetail();
    // Let the sheet finish closing before the form takes its place.
    setTimeout(() => onEdit(word), 180);
  });

  deleteButton.addEventListener('click', async () => {
    if (!currentId) return;

    if (isPending(currentId)) {
      toast('Still syncing — try again in a moment.');
      return;
    }

    const word = getWord(currentId);
    if (!word) return;

    const confirmed = await askConfirm({
      title: 'Delete this word?',
      text: '“' + word.word + '” will be removed from the sheet. This cannot be undone.',
      accept: 'Delete',
    });
    if (!confirmed) return;

    const id = word.id;
    closeDetail();
    try {
      await deleteWord(id);
      toast('Deleted.');
    } catch (error) {
      toast(error.message);
    }
  });
}
