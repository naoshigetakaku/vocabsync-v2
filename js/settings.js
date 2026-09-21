/**
 * settings.js — the sheet behind the gear.
 *
 * Four things live here, in the order you are likely to want them: the
 * footer's slot order, the order the list is in, whether the quiz runs a
 * timer, and the connection to the sheet.
 *
 * The footer is reordered with a pair of arrows per row rather than by
 * dragging. Dragging is nicer when it works, but on iOS a drag inside a
 * scrolling sheet fights the sheet's own swipe-to-dismiss, and a bar that
 * ends up in an order nobody asked for is worse than two taps.
 *
 * Connection keeps its own sheet — it has a form, a passphrase and its own
 * busy states — so this one shows its status and opens it.
 */

import { openDialog, closeDialog } from './dialog.js';
import { getFooterOrder, moveSlot, SLOTS } from './footer.js';
import { getSortModes, getSortMode, setSortMode } from './sort.js';
import { openSetup } from './setup.js';
import { getCredentials } from './auth.js';
import { getBackendVersion, isBackendStale } from './api.js';
import { STORAGE_KEYS, REQUIRED_BACKEND_VERSION } from './config.js';
import { readJson, writeJson } from './storage.js';

const dialog = document.getElementById('settings-dialog');
const closeButton = document.getElementById('settings-close');
const footerList = document.getElementById('settings-footer');
const sortRow = document.getElementById('settings-sort');
const timerToggle = document.getElementById('settings-timer');
const connectionLine = document.getElementById('settings-connection');
const connectionButton = document.getElementById('settings-connect');

const SVG_NS = 'http://www.w3.org/2000/svg';

let onChange = () => {};

/* --- The quiz timer preference -------------------------------------------- */

let timerOn = readJson(STORAGE_KEYS.quizTimer, true) !== false;

/** Whether a quiz card is answered against the clock. */
export function isTimerOn() {
  return timerOn;
}

function setTimerOn(on) {
  timerOn = Boolean(on);
  writeJson(STORAGE_KEYS.quizTimer, timerOn);
}

/* --- Painting ------------------------------------------------------------- */

function arrow(up) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', up ? 'M6 14l6-6 6 6' : 'M6 10l6 6 6-6');
  svg.appendChild(path);
  return svg;
}

function moveButton(id, delta, disabled) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'settings__move';
  button.dataset.slot = id;
  button.dataset.delta = String(delta);
  button.disabled = disabled;
  button.setAttribute('aria-label', (delta < 0 ? 'Move ' : 'Move ')
    + SLOTS[id].name + (delta < 0 ? ' left' : ' right'));
  button.appendChild(arrow(delta < 0));
  return button;
}

function paintFooterSection() {
  const order = getFooterOrder();
  const fragment = document.createDocumentFragment();

  order.forEach((id, at) => {
    const row = document.createElement('li');
    row.className = 'settings__row';

    const position = document.createElement('span');
    position.className = 'settings__position';
    position.textContent = String(at + 1);
    row.appendChild(position);

    const name = document.createElement('span');
    name.className = 'settings__name';
    name.textContent = SLOTS[id].name;
    row.appendChild(name);

    row.appendChild(moveButton(id, -1, at === 0));
    row.appendChild(moveButton(id, 1, at === order.length - 1));
    fragment.appendChild(row);
  });

  footerList.replaceChildren(fragment);
}

function paintSortSection() {
  const current = getSortMode();
  const fragment = document.createDocumentFragment();

  getSortModes().forEach((mode) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings__choice';
    button.dataset.sort = mode.value;
    button.textContent = mode.label;
    const active = mode.value === current;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    fragment.appendChild(button);
  });

  sortRow.replaceChildren(fragment);
}

function paintTimerSection() {
  timerToggle.setAttribute('aria-checked', timerOn ? 'true' : 'false');
  timerToggle.classList.toggle('is-on', timerOn);
}

function paintConnectionSection() {
  const credentials = getCredentials();
  const version = getBackendVersion();

  if (!credentials) {
    connectionLine.textContent = 'Not connected yet.';
    connectionLine.classList.remove('is-stale');
    return;
  }

  if (version === null) {
    connectionLine.textContent = 'Connected. Version unknown until the next sync.';
    connectionLine.classList.remove('is-stale');
    return;
  }

  const stale = isBackendStale();
  connectionLine.textContent = stale
    ? 'Apps Script v' + version + ', and this app needs v' + REQUIRED_BACKEND_VERSION + '.'
    : 'Apps Script v' + version + ' · up to date';
  connectionLine.classList.toggle('is-stale', stale);
}

function paint() {
  paintFooterSection();
  paintSortSection();
  paintTimerSection();
  paintConnectionSection();
}

/* --- Opening -------------------------------------------------------------- */

export function openSettings() {
  paint();
  openDialog(dialog);
}

export function initSettings(handlers) {
  onChange = (handlers && handlers.onChange) || (() => {});

  closeButton.addEventListener('click', () => closeDialog(dialog));

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog(dialog);
  });

  footerList.addEventListener('click', (event) => {
    const button = event.target.closest('.settings__move');
    if (!button || button.disabled) return;
    if (!moveSlot(button.dataset.slot, Number(button.dataset.delta))) return;
    paintFooterSection();
    onChange();
  });

  sortRow.addEventListener('click', (event) => {
    const button = event.target.closest('.settings__choice');
    if (!button) return;
    setSortMode(button.dataset.sort);
    paintSortSection();
  });

  timerToggle.addEventListener('click', () => {
    setTimerOn(!timerOn);
    paintTimerSection();
  });

  connectionButton.addEventListener('click', () => {
    // Two sheets stacked would trap the scroll lock; hand over instead.
    closeDialog(dialog).then(() => openSetup({ manual: true }));
  });
}
