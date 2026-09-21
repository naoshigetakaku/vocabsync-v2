/**
 * footer.js — the five slots along the bottom, and their order.
 *
 * The bar used to be five lines of markup in index.html. It is built here
 * instead because the order is the user's to change from Settings, and a
 * static bar cannot be reordered without moving DOM nodes around by hand.
 *
 * Four of the slots are tabs — they change which screen is up. The fifth,
 * 'add', is an action: it opens the new-word form and leaves the screen
 * alone, which is why it is drawn as a button rather than a tab and why it
 * never takes the active state.
 */

import { FOOTER_SLOTS, STORAGE_KEYS } from './config.js';
import { readJson, writeJson } from './storage.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Every slot the footer can hold. `tab` is the view it opens; the add slot
 * has none. The paths are single-stroke outlines at 24x24.
 */
export const SLOTS = {
  list: {
    name: 'List',
    tab: 'list',
    path: 'M4 7h16M4 12h16M4 17h10',
  },
  cards: {
    name: 'Reel',
    tab: 'cards',
    path: 'M5 4h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zM9 10h6M9 14h4',
  },
  add: {
    name: 'New word',
    tab: null,
    path: 'M12 5v14M5 12h14',
  },
  quiz: {
    name: 'Quiz',
    tab: 'quiz',
    path: 'M8.6 8.4a3.5 3.5 0 1 1 4.6 3.3c-1 .4-1.6 1.2-1.6 2.3v.6M12 18.6h.01',
  },
  archived: {
    name: 'Archived',
    tab: 'archived',
    path: 'M4 5.5h16v3H4zM5.5 8.5v10a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-10M10 12.5h4',
  },
};

const ALL = Object.keys(SLOTS);

/**
 * A stored order is only trusted as far as it names real slots. Anything
 * unknown is dropped and anything missing is appended, so a half-written
 * setting — or one from a build that had different slots — still produces a
 * usable bar rather than an empty one.
 */
function settle(order) {
  const seen = new Set();
  const kept = (Array.isArray(order) ? order : []).filter((id) => {
    if (!SLOTS[id] || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return kept.concat(ALL.filter((id) => !seen.has(id)));
}

let order = settle(readJson(STORAGE_KEYS.footer, FOOTER_SLOTS));

export function getFooterOrder() {
  return order.slice();
}

export function setFooterOrder(next) {
  order = settle(next);
  writeJson(STORAGE_KEYS.footer, order);
}

/** Swaps a slot with its neighbour. Returns false at either end. */
export function moveSlot(id, delta) {
  const at = order.indexOf(id);
  const to = at + delta;
  if (at === -1 || to < 0 || to >= order.length) return false;
  const next = order.slice();
  next[at] = next[to];
  next[to] = id;
  setFooterOrder(next);
  return true;
}

function icon(path) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('d', path);
  svg.appendChild(line);
  return svg;
}

function buildAdd() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tabbar__tab tabbar__tab--add';
  button.id = 'add-button';
  button.dataset.slot = 'add';
  button.setAttribute('aria-label', 'New word');

  // The glow lives on a ring behind the glyph rather than on the button, so
  // the button keeps a plain square hit area the full height of the bar.
  const ring = document.createElement('span');
  ring.className = 'tabbar__add-ring';
  ring.appendChild(icon(SLOTS.add.path));
  button.appendChild(ring);
  return button;
}

function buildTab(id) {
  const slot = SLOTS[id];
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tabbar__tab';
  button.dataset.tab = slot.tab;
  button.dataset.slot = id;
  button.appendChild(icon(slot.path));

  const label = document.createElement('span');
  label.className = 'tabbar__label';
  // The List tab's label is the sort order, written in by paintFooter.
  if (id === 'list') label.id = 'tab-list-label';
  label.textContent = slot.name;
  button.appendChild(label);

  if (id === 'quiz') {
    const badge = document.createElement('span');
    badge.className = 'tabbar__badge';
    badge.id = 'quiz-badge';
    badge.hidden = true;
    button.appendChild(badge);
  }

  return button;
}

/**
 * Draws the bar in the stored order.
 *
 * Called on start and whenever the order changes. Rebuilding wholesale is
 * safe here: the bar holds no state of its own, and the ids the rest of the
 * app looks up are put back on the same elements every time.
 */
export function renderFooter(element) {
  const fragment = document.createDocumentFragment();
  order.forEach((id) => {
    fragment.appendChild(id === 'add' ? buildAdd() : buildTab(id));
  });
  element.replaceChildren(fragment);
}
