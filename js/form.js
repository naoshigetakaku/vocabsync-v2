/**
 * form.js — the add / edit sheet.
 *
 * Field order is fixed by design: word, part of speech, definition, note.
 */

import { PARTS_OF_SPEECH, WORD_COLORS, DEFAULT_COLOR, UNSORTED_LABEL } from './config.js';
import { createWord, updateWord, getFolders } from './store.js';
import { folderForNewWord } from './view.js';
import { openDialog, closeDialog, wireDismiss } from './dialog.js';
import { openPicker } from './picker.js';

const PLACEHOLDER = 'Choose…';

const dialog = document.getElementById('form-dialog');
const form = document.getElementById('word-form');
const titleElement = document.getElementById('form-title');
const wordField = document.getElementById('field-word');
const posTrigger = document.getElementById('field-pos');
const posValue = document.getElementById('field-pos-value');
const definitionField = document.getElementById('field-definition');
const noteField = document.getElementById('field-note');
const colorField = document.getElementById('field-color');
const folderTrigger = document.getElementById('field-folder');
const folderValue = document.getElementById('field-folder-value');
const errorElement = document.getElementById('form-error');
const submitButton = document.getElementById('form-submit');
const cancelButton = document.getElementById('form-cancel');

let editingId = null;
let pos = '';
let color = DEFAULT_COLOR;
let folder = '';
let busy = false;
let afterSave = () => {};

/**
 * Swatches rather than a picker sheet: seven options fit on one line, and a
 * colour is easier to recognise than to read.
 */
function buildSwatches() {
  const fragment = document.createDocumentFragment();

  WORD_COLORS.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.dataset.color = option.value;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', 'false');
    button.setAttribute('aria-label', option.label);

    const dot = document.createElement('span');
    dot.className = 'swatch__dot';
    button.appendChild(dot);

    fragment.appendChild(button);
  });

  colorField.replaceChildren(fragment);
}

function setColor(value) {
  const known = WORD_COLORS.some((option) => option.value === value);
  color = known ? value : DEFAULT_COLOR;

  colorField.querySelectorAll('.swatch').forEach((swatch) => {
    swatch.setAttribute('aria-checked', swatch.dataset.color === color ? 'true' : 'false');
  });
}

function setPos(value) {
  pos = PARTS_OF_SPEECH.includes(value) ? value : '';
  posValue.textContent = pos || PLACEHOLDER;
  posTrigger.classList.toggle('is-empty', !pos);
  posTrigger.removeAttribute('aria-invalid');
}

/** An empty name is the unsorted bucket, which is a real destination here. */
function setFolder(name) {
  folder = typeof name === 'string' ? name : '';
  folderValue.textContent = folder || UNSORTED_LABEL;
  folderTrigger.classList.toggle('is-empty', !folder);
}

function showError(message) {
  errorElement.textContent = message;
  errorElement.hidden = false;
  form.classList.remove('is-invalid');
  // Restart the shake animation on a repeated failure.
  void form.offsetWidth;
  form.classList.add('is-invalid');
}

function clearError() {
  errorElement.hidden = true;
  errorElement.textContent = '';
  form.classList.remove('is-invalid');
  wordField.removeAttribute('aria-invalid');
  posTrigger.removeAttribute('aria-invalid');
}

function setBusy(value) {
  busy = value;
  submitButton.disabled = value;
  cancelButton.disabled = value;
  submitButton.textContent = value ? 'Saving…' : 'Save';
}

export function openCreateForm() {
  editingId = null;
  titleElement.textContent = 'New word';
  form.reset();
  setPos('');
  setColor(DEFAULT_COLOR);
  // A word made inside a folder belongs to it without being asked.
  setFolder(folderForNewWord());
  clearError();
  setBusy(false);
  openDialog(dialog);
  // Opening the keyboard while the sheet animates fights the transition on iOS.
  setTimeout(() => wordField.focus(), 320);
}

export function openEditForm(word) {
  editingId = word.id;
  titleElement.textContent = 'Edit word';
  wordField.value = word.word || '';
  setPos(word.pos);
  definitionField.value = word.definition || '';
  noteField.value = word.note || '';
  setColor(word.color || DEFAULT_COLOR);
  setFolder(word.folder || '');
  clearError();
  setBusy(false);
  openDialog(dialog);
}

function readFields() {
  return {
    word: wordField.value.trim(),
    pos: pos,
    definition: definitionField.value.trim(),
    note: noteField.value.trim(),
    color: color,
    folder: folder,
  };
}

function validate(fields) {
  if (!fields.word) {
    wordField.setAttribute('aria-invalid', 'true');
    wordField.focus();
    return 'Enter a word.';
  }
  if (!fields.pos) {
    posTrigger.setAttribute('aria-invalid', 'true');
    return 'Choose a part of speech.';
  }
  return null;
}

export function initForm(handlers) {
  afterSave = handlers.afterSave || (() => {});
  setPos('');
  buildSwatches();
  setColor(DEFAULT_COLOR);

  colorField.addEventListener('click', (event) => {
    const swatch = event.target.closest('.swatch');
    if (swatch) setColor(swatch.dataset.color);
  });

  folderTrigger.addEventListener('click', () => {
    const options = getFolders().map((entry) => ({ value: entry.name, label: entry.name }));
    options.push({ value: '', label: UNSORTED_LABEL });

    openPicker({
      title: 'Folder',
      options,
      value: folder,
      onSelect: setFolder,
    });
  });

  wireDismiss(dialog, () => {
    editingId = null;
  });

  posTrigger.addEventListener('click', () => {
    openPicker({
      title: 'Part of speech',
      options: PARTS_OF_SPEECH.map((value) => ({ value, label: value })),
      value: pos,
      onSelect: (value) => {
        setPos(value);
        clearError();
      },
    });
  });

  cancelButton.addEventListener('click', () => {
    if (busy) return;
    closeDialog(dialog);
    editingId = null;
  });

  wordField.addEventListener('input', clearError);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;

    const fields = readFields();
    const problem = validate(fields);
    if (problem) {
      showError(problem);
      return;
    }

    setBusy(true);
    try {
      const saved = editingId
        ? await updateWord(Object.assign({ id: editingId }, fields))
        : await createWord(fields);

      closeDialog(dialog);
      editingId = null;
      afterSave(saved);
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  });
}
