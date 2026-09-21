/**
 * picker.js — the app's own option list, shared by the part-of-speech field
 * and the sort control.
 *
 * A native <select> would open the iOS wheel, which cannot be styled and looks
 * nothing like the rest of the app.
 */

import { openDialog, closeDialog, wireDismiss } from './dialog.js';

const dialog = document.getElementById('picker-dialog');
const titleElement = document.getElementById('picker-title');
const listElement = document.getElementById('picker-options');

let pending = null;
/** The picker's own close, when one is in flight. */
let closing = null;

function checkIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'option__check');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M5 13l4 4L19 7');
  svg.appendChild(path);

  return svg;
}

export function initPicker() {
  wireDismiss(dialog, () => {
    pending = null;
  });

  listElement.addEventListener('click', (event) => {
    const option = event.target.closest('.option');
    if (!option) return;

    const callback = pending;
    pending = null;
    closing = closeDialog(dialog);
    // Called synchronously, on purpose: one of these choices opens the file
    // picker, and Safari only allows that inside the gesture that asked for it.
    if (callback) callback(option.dataset.value);
  });
}

/**
 * @param {{title: string, options: Array<{value: string, label: string}>,
 *          value: string, onSelect: (value: string) => void}} config
 */
export function openPicker(config) {
  // Re-entrant: an option in this very list opens another list — the folder
  // settings offering the sort order. The sheet has to finish leaving first,
  // because showModal() does nothing while it is still open. Guessing at a
  // delay is what stopped the sort menu from ever appearing.
  if (dialog.open) {
    (closing || Promise.resolve()).then(() => openPicker(config));
    return;
  }

  titleElement.textContent = config.title;

  const fragment = document.createDocumentFragment();

  config.options.forEach((option) => {
    const selected = option.value === config.value;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'option' + (selected ? ' is-selected' : '');
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    button.dataset.value = option.value;

    const label = document.createElement('span');
    label.className = 'option__label';
    label.textContent = option.label;
    button.appendChild(label);

    if (selected) button.appendChild(checkIcon());

    const item = document.createElement('li');
    item.appendChild(button);
    fragment.appendChild(item);
  });

  listElement.replaceChildren(fragment);
  pending = config.onSelect;
  openDialog(dialog);
}
