/**
 * list.js — the home screen: the words in the open folder.
 *
 * Deliberately shows the word and nothing else; every other field lives behind
 * the detail dialog. Under All these are the folder's live words; under
 * Archived, the ones put aside.
 */

import { sortWords } from './sort.js';
import { wordsInScope, archivedInScope, isArchivedFilter, selectionLabel } from './view.js';
import { DEFAULT_COLOR } from './config.js';

const listElement = document.getElementById('word-list');
const emptyElement = document.getElementById('empty-state');
const emptyTitle = document.getElementById('empty-title');
const emptyHint = document.getElementById('empty-hint');

/** The two labels a swipe uncovers; see action(). */
const RESTORE = 'restore';
const ARCHIVE = 'archive';

let staggerDone = false;
let staggerTimer;
let newestId = null;
let reflowNext = false;
let reflowUntil = 0;
let lastSignature = '';

/** Must match .word-item.is-reflowing in layout.css. */
const REFLOW_MS = 260;

const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(path) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'word-item__icon');
  svg.setAttribute('focusable', 'false');
  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('d', path);
  svg.appendChild(line);
  return svg;
}

/**
 * The label a swipe uncovers. "Restore" sits on the left, under a row dragged
 * right; "Archive" on the right, under a row dragged left.
 */
function action(kind) {
  const restore = kind === RESTORE;
  const element = document.createElement('span');
  element.className = 'word-item__action word-item__action--' + kind;
  element.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.textContent = restore ? 'Restore' : 'Archive';
  const glyph = icon(restore
    ? 'M4 12a8 8 0 1 1 2.3 5.6M4 18v-5h5'
    : 'M4 5.5h16v3H4zM5.5 8.5v10a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-10M10 12.5h4');

  if (restore) {
    element.appendChild(glyph);
    element.appendChild(label);
  } else {
    element.appendChild(label);
    element.appendChild(glyph);
  }
  return element;
}

function buildRow(word) {
  const item = document.createElement('li');
  item.className = 'word-item';

  // Both sit behind the row and are uncovered as it slides; see
  // js/swipe-row.js. Only the one for the direction of travel is shown.
  item.appendChild(action(RESTORE));
  item.appendChild(action(ARCHIVE));

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-row';
  if (word.pending) button.classList.add('word-row--pending');
  if (word.id === newestId) button.classList.add('is-new');
  button.dataset.id = word.id;
  // The colour is applied through the attribute so the stylesheet keeps
  // control of the actual shade in each theme.
  button.dataset.color = word.color || DEFAULT_COLOR;

  // textContent, never innerHTML — the content comes from a shared sheet.
  const text = document.createElement('span');
  text.className = 'word-row__text';
  text.textContent = word.word;
  button.appendChild(text);

  item.appendChild(button);
  return item;
}

/** The open folder's words under the current tab, in the current sort order. */
export function visibleWords() {
  return sortWords(isArchivedFilter() ? archivedInScope() : wordsInScope());
}

/** True in the wide browser layout, where the list is a grid of cells. */
function isMultiColumn() {
  return getComputedStyle(listElement).gridTemplateColumns.split(' ').length > 1;
}

/** Where each row sits now, keyed by word id. */
function measureRows() {
  const boxes = new Map();
  listElement.querySelectorAll('.word-row').forEach((row) => {
    boxes.set(row.dataset.id, row.closest('.word-item').getBoundingClientRect());
  });
  return boxes;
}

/**
 * Slides each row from where it was to where it now is.
 *
 * In a single column a row that leaves takes its gap with it, and nothing
 * else moves sideways. In a grid every row after it shifts back one cell —
 * some of them up a line and across the page — which reads as a jump unless
 * the move is shown.
 */
function playReflow(before) {
  const moved = [];

  listElement.querySelectorAll('.word-row').forEach((row) => {
    const was = before.get(row.dataset.id);
    if (!was) return;
    const item = row.closest('.word-item');
    const now = item.getBoundingClientRect();
    const dx = was.left - now.left;
    const dy = was.top - now.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    item.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
    moved.push(item);
  });

  if (!moved.length) return;
  reflowUntil = performance.now() + REFLOW_MS;

  // Commit the starting offsets before they are released, or the browser
  // folds both steps into one style change and nothing animates.
  void listElement.offsetWidth;

  moved.forEach((item) => {
    item.classList.add('is-reflowing');
    item.style.removeProperty('transform');
  });

  setTimeout(() => {
    moved.forEach((item) => item.classList.remove('is-reflowing'));
  }, REFLOW_MS + 60);
}

/** Everything a row shows, so an identical render can be recognised. */
function signatureOf(words) {
  return selectionLabel() + '\n' + String(isArchivedFilter()) + '\n' + words
    .map((word) => [word.id, word.word, word.color, word.pending ? 1 : 0].join('\t'))
    .join('\n');
}

/** Shared with the card deck, which shows the same message. */
export function paintEmpty(count) {
  if (isArchivedFilter()) {
    emptyTitle.textContent = 'Nothing archived in ' + selectionLabel();
    emptyHint.textContent = 'Swipe a word left to put it here.';
  } else {
    emptyTitle.textContent = 'No words in ' + selectionLabel();
    emptyHint.textContent = 'Tap + to add one.';
  }
  emptyElement.hidden = count !== 0;
}

/** Hides the list's empty message while another screen is up. */
export function hideEmpty() {
  emptyElement.hidden = true;
}

export function render() {
  const words = visibleWords();
  listElement.dataset.filter = isArchivedFilter() ? 'archived' : 'all';

  // The store notifies on every change anywhere — the server confirming a
  // word that has just left this tab, a background sync that found nothing
  // new. Rebuilding for those would restart whatever the rows are doing: a
  // slide into a new cell, a swipe under the finger.
  const signature = signatureOf(words);
  if (signature === lastSignature && newestId === null && listElement.childElementCount) {
    paintEmpty(words.length);
    reflowNext = false;
    return;
  }
  lastSignature = signature;

  // A real change landing mid-slide — a sync bringing in an edit from another
  // device — would otherwise swap in fresh rows at their final spots and cut
  // the slide off. Measured boxes include the transform in flight, so the new
  // rows carry on from wherever the old ones had got to.
  const sliding = performance.now() < reflowUntil;
  const before = (reflowNext || sliding) && isMultiColumn() ? measureRows() : null;
  reflowNext = false;

  const fragment = document.createDocumentFragment();
  words.forEach((word) => fragment.appendChild(buildRow(word)));
  listElement.replaceChildren(fragment);

  if (before) playReflow(before);

  paintEmpty(words.length);

  // Stagger the entrance once per session, not on every re-render.
  if (!staggerDone && words.length) {
    staggerDone = true;
    listElement.classList.add('is-entering');
    clearTimeout(staggerTimer);
    staggerTimer = setTimeout(() => listElement.classList.remove('is-entering'), 900);
  }

  newestId = null;
}

/** Called before a row is moved out, so the rest glide into its place. */
export function animateNextReflow() {
  reflowNext = true;
}

/** Called after a create so the new row animates in on its own. */
export function highlightNew(id) {
  newestId = id;
}

export function initList(onSelect) {
  listElement.addEventListener('click', (event) => {
    const row = event.target.closest('.word-row');
    if (row && row.dataset.id) onSelect(row.dataset.id);
  });
}
