/**
 * folder-menu.js — the panel that drops from under the header.
 *
 * Picking a folder, making one, and (behind Edit) renaming or deleting one.
 * It lives inside the header so it can hang off its bottom edge, and it is
 * the only way to change folders: the header title is the button.
 */

import { UNSORTED_LABEL } from './config.js';
import {
  getFolders, getWordsInFolder, countUnsorted, createFolder, deleteFolder,
} from './store.js';
import { UNSORTED, FOLDER, getSelection, setSelection, isSelected } from './view.js';
import { askConfirm } from './confirm.js';
import { toast } from './toast.js';

const button = document.getElementById('folder-button');
const menu = document.getElementById('folder-menu');
const scrim = document.getElementById('folder-scrim');
const listElement = document.getElementById('folder-list');
const editButton = document.getElementById('folder-edit');
const createForm = document.getElementById('folder-create');
const nameField = document.getElementById('field-new-folder');
const createButton = document.getElementById('folder-create-submit');
const errorElement = document.getElementById('folder-menu-error');

/** Must match the transition in components.css. */
const CLOSE_MS = 180;

let open = false;
let editing = false;
let closeTimer;
let onRename = () => {};

const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(path, className) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('d', path);
  svg.appendChild(line);
  return svg;
}

function showError(message) {
  errorElement.textContent = message;
  errorElement.hidden = false;
}

function clearError() {
  errorElement.hidden = true;
  errorElement.textContent = '';
}

/** One row: the folder itself, plus its controls while Edit is on. */
function buildRow(entry) {
  const item = document.createElement('li');
  item.className = 'folder-row';

  const choose = document.createElement('button');
  choose.type = 'button';
  choose.className = 'folder-row__choose';
  choose.dataset.kind = entry.kind;
  if (entry.name) choose.dataset.name = entry.name;

  const name = document.createElement('span');
  name.className = 'folder-row__name';
  name.textContent = entry.label;
  choose.appendChild(name);

  const count = document.createElement('span');
  count.className = 'folder-row__count';
  count.textContent = String(entry.count);
  choose.appendChild(count);

  if (entry.selected) {
    choose.setAttribute('aria-current', 'true');
    choose.appendChild(icon('M5 12.5l4.5 4.5L19 7.5', 'folder-row__check'));
  }

  item.appendChild(choose);

  // Only real folders can be renamed or deleted; Unsorted is a view of what
  // the folders leave over.
  if (editing && entry.kind === FOLDER) {
    const tools = document.createElement('span');
    tools.className = 'folder-row__tools';

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'icon-button';
    rename.dataset.action = 'rename';
    rename.dataset.id = entry.id;
    rename.setAttribute('aria-label', 'Rename ' + entry.label);
    rename.appendChild(icon('M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4', 'folder-row__icon'));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button icon-button--danger';
    remove.dataset.action = 'delete';
    remove.dataset.id = entry.id;
    remove.setAttribute('aria-label', 'Delete ' + entry.label);
    remove.appendChild(icon('M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', 'folder-row__icon'));

    tools.appendChild(rename);
    tools.appendChild(remove);
    item.appendChild(tools);
    item.classList.add('is-editing');
  }

  return item;
}

function entries() {
  const list = [];

  getFolders().forEach((folder) => {
    list.push({
      kind: FOLDER,
      id: folder.id,
      name: folder.name,
      label: folder.name,
      count: getWordsInFolder(folder.name).length,
      selected: isSelected({ kind: FOLDER, name: folder.name }),
    });
  });

  // Worth a row only when something actually landed there.
  const stray = countUnsorted();
  if (stray > 0 || isSelected({ kind: UNSORTED })) {
    list.push({
      kind: UNSORTED,
      label: UNSORTED_LABEL,
      count: stray,
      selected: isSelected({ kind: UNSORTED }),
    });
  }

  return list;
}

export function renderFolderMenu() {
  if (!open) return;
  const fragment = document.createDocumentFragment();
  entries().forEach((entry) => fragment.appendChild(buildRow(entry)));
  listElement.replaceChildren(fragment);
  editButton.textContent = editing ? 'Done' : 'Edit';
  editButton.setAttribute('aria-pressed', editing ? 'true' : 'false');
}

export function isFolderMenuOpen() {
  return open;
}

export function openFolderMenu() {
  if (open) return;
  open = true;
  editing = false;
  clearError();
  nameField.value = '';

  clearTimeout(closeTimer);
  menu.hidden = false;
  scrim.hidden = false;
  // The add button floats above the scrim, so it has to be taken out of
  // reach with it; otherwise the form opens behind the open menu.
  document.body.classList.add('is-menu-open');
  renderFolderMenu();

  // The panel has to be in the document at its closed position for one frame,
  // or the browser folds both states into one style change and it appears
  // instead of dropping.
  void menu.offsetHeight;
  menu.classList.add('is-open');
  scrim.classList.add('is-open');
  button.setAttribute('aria-expanded', 'true');
}

export function closeFolderMenu() {
  if (!open) return;
  open = false;
  editing = false;

  menu.classList.remove('is-open');
  scrim.classList.remove('is-open');
  document.body.classList.remove('is-menu-open');
  button.setAttribute('aria-expanded', 'false');

  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    menu.hidden = true;
    scrim.hidden = true;
  }, CLOSE_MS);
}

function toggle() {
  if (open) closeFolderMenu();
  else openFolderMenu();
}

function choose(element) {
  const kind = element.dataset.kind;
  if (kind === FOLDER) setSelection({ kind: FOLDER, name: element.dataset.name });
  else setSelection({ kind });
  closeFolderMenu();
}

async function confirmDelete(id) {
  const folder = getFolders().find((entry) => entry.id === id);
  if (!folder) return;

  const count = getWordsInFolder(folder.name).length;
  const text = count === 0
    ? '“' + folder.name + '” is empty.'
    : count + (count === 1 ? ' word' : ' words') + ' will move to ' + UNSORTED_LABEL
      + '. Nothing is deleted from the sheet.';

  const confirmed = await askConfirm({ title: 'Delete this folder?', text, accept: 'Delete' });
  if (!confirmed) return;

  try {
    // Deleting the folder that is open moves the words to Unsorted, so that
    // is where the view follows them.
    if (getSelection().kind === FOLDER && getSelection().name === folder.name) {
      setSelection({ kind: UNSORTED });
    }
    await deleteFolder(id);
    renderFolderMenu();
    toast('Folder deleted.');
  } catch (error) {
    toast(error.message);
  }
}

export function initFolderMenu(handlers) {
  onRename = handlers.onRename || (() => {});

  button.addEventListener('click', toggle);
  scrim.addEventListener('click', closeFolderMenu);

  editButton.addEventListener('click', () => {
    editing = !editing;
    renderFolderMenu();
  });

  listElement.addEventListener('click', (event) => {
    const tool = event.target.closest('[data-action]');
    if (tool) {
      const folder = getFolders().find((entry) => entry.id === tool.dataset.id);
      if (!folder) return;
      if (tool.dataset.action === 'rename') {
        closeFolderMenu();
        // Let the panel finish leaving before the sheet takes its place.
        setTimeout(() => onRename(folder), CLOSE_MS);
      } else {
        confirmDelete(folder.id);
      }
      return;
    }

    const choice = event.target.closest('.folder-row__choose');
    if (choice && !editing) choose(choice);
  });

  nameField.addEventListener('input', clearError);

  createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = nameField.value.trim();
    if (!name) {
      showError('Enter a name.');
      return;
    }

    createButton.disabled = true;
    try {
      const saved = await createFolder(name);
      nameField.value = '';
      nameField.blur();
      // A folder just made is almost certainly the one you want to fill.
      setSelection({ kind: FOLDER, name: saved.name });
      closeFolderMenu();
      toast('Folder created.');
    } catch (error) {
      showError(error.message);
    } finally {
      createButton.disabled = false;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) closeFolderMenu();
  });
}
