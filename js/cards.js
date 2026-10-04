/**
 * cards.js — one flash card per screen, in random order.
 *
 * The front carries the word and nothing else; a tap turns the card over to
 * everything else, and another tap turns it back. YouGlish is on both faces,
 * so hearing the word never means giving the answer away.
 *
 * The turn is a pure CSS transform between two faces that already exist, so
 * nothing is built, measured or swapped at the moment of the tap. The tap
 * toggles one class, and the compositor does the rest — which is what keeps
 * it smooth in the installed app, where the main thread is the first thing
 * iOS starves.
 *
 * On a keyboard, Enter and Space turn whichever card is on screen, without
 * having to Tab to it first — with one card to a screen there is never any
 * doubt about which one is meant. Up and down move through the deck.
 *
 * A card turns back to its front as soon as it leaves the screen, so coming
 * back to one always asks the question again rather than showing the answer
 * you left it on. That is watched with an IntersectionObserver rather than a
 * scroll handler: the browser reports the crossings, and a deck of hundreds
 * costs the same as a deck of three.
 */

import { visibleWords, paintEmpty } from './list.js';
import { isArchivedFilter, selectionLabel } from './view.js';
import { wordLinks } from './links.js';
import { DEFAULT_COLOR } from './config.js';

const cardsElement = document.getElementById('cards');

/** Must match the .flashcard transition in components.css. */
const FLIP_MS = 520;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let order = [];
let lastSignature = '';

/** Cards currently showing their back, so a re-render keeps them that way. */
const flipped = new Set();

/** Turns a card back over once it has left the screen; see initCards. */
let watcher = null;

/**
 * Sets up the 3D turn only on cards on screen or a screen away from it.
 * Each face with a 3D transform is a screen-sized compositing layer, and iOS
 * refuses a few hundred of them — a large folder's deck would not open.
 */
let nearby = null;

function shuffled(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Deals a fresh order, every card face up. Called when the tab is opened. */
export function shuffleCards() {
  order = shuffled(visibleWords().map((word) => word.id));
  flipped.clear();
  lastSignature = '';
  cardsElement.scrollTop = 0;
}

function block(label, text) {
  const section = document.createElement('section');
  section.className = 'detail__block';

  const heading = document.createElement('h4');
  heading.className = 'detail__heading';
  heading.textContent = label;

  const body = document.createElement('p');
  body.className = 'detail__text';
  body.textContent = text;

  section.appendChild(heading);
  section.appendChild(body);
  return section;
}

function buildCard(word) {
  const slot = document.createElement('article');
  slot.className = 'card-slot';

  const card = document.createElement('div');
  card.className = 'flashcard';
  card.dataset.id = word.id;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');

  // Front: the word, alone.
  const front = document.createElement('div');
  front.className = 'flashcard__face flashcard__face--front';

  const heading = document.createElement('h2');
  heading.className = 'flashcard__word';
  heading.dataset.color = word.color || DEFAULT_COLOR;
  heading.textContent = word.word;
  front.appendChild(heading);
  front.appendChild(wordLinks(word));

  // Back: everything else, laid out like the detail card.
  const back = document.createElement('div');
  back.className = 'flashcard__face flashcard__face--back';

  const body = document.createElement('div');
  body.className = 'flashcard__body';

  if (word.pos) {
    const pos = document.createElement('p');
    pos.className = 'detail__pos';
    pos.textContent = word.pos;
    body.appendChild(pos);
  }

  const title = document.createElement('h3');
  title.className = 'flashcard__title';
  title.dataset.color = word.color || DEFAULT_COLOR;
  title.textContent = word.word;
  body.appendChild(title);

  if (word.definition) body.appendChild(block('Definition', word.definition));
  if (word.note) body.appendChild(block('Note', word.note));
  if (!word.definition && !word.note) {
    const nothing = document.createElement('p');
    nothing.className = 'flashcard__empty';
    nothing.textContent = 'No definition yet.';
    body.appendChild(nothing);
  }

  back.appendChild(body);
  back.appendChild(wordLinks(word));

  card.appendChild(front);
  card.appendChild(back);
  paintSide(card, flipped.has(word.id));

  slot.appendChild(card);
  return slot;
}

/** Keeps the class, the pressed state and what a screen reader sees in step. */
function paintSide(card, showBack) {
  card.classList.toggle('is-flipped', showBack);
  card.setAttribute('aria-pressed', showBack ? 'true' : 'false');
  card.setAttribute('aria-label', showBack ? 'Showing details. Tap to show the word.' : 'Tap to show details.');
  const [front, back] = card.querySelectorAll('.flashcard__face');
  front.setAttribute('aria-hidden', showBack ? 'true' : 'false');
  back.setAttribute('aria-hidden', showBack ? 'false' : 'true');
  // Links on the hidden face must not be reachable by Tab either.
  front.querySelectorAll('a').forEach((link) => { link.tabIndex = showBack ? -1 : 0; });
  back.querySelectorAll('a').forEach((link) => { link.tabIndex = showBack ? 0 : -1; });
}

function flip(card) {
  // A tap can only land on a card on screen, which is live already; this is
  // the guarantee rather than the mechanism.
  card.classList.add('is-live');
  const id = card.dataset.id;
  const showBack = !flipped.has(id);
  if (showBack) flipped.add(id);
  else flipped.delete(id);

  // Promoted just for the turn; see prime(). Dropped afterwards so a long
  // deck does not keep a compositor layer per card.
  card.classList.add('is-primed');
  paintSide(card, showBack);
  clearTimeout(card.primeTimer);
  card.primeTimer = setTimeout(() => card.classList.remove('is-primed'), FLIP_MS + 80);
}

/**
 * Promotes the card to its own layer as the finger lands, which is ~100ms
 * before the click that turns it. By the time the transition starts the layer
 * already exists, so the first frame is not spent creating it.
 */
function prime(event) {
  const card = event.target.closest('.flashcard');
  if (!card || event.target.closest('a')) return;
  card.classList.add('is-primed');
  clearTimeout(card.primeTimer);
  card.primeTimer = setTimeout(() => card.classList.remove('is-primed'), 1500);
}

function signatureOf(words) {
  return selectionLabel() + '\n' + String(isArchivedFilter()) + '\n' + words
    .map((word) => [
      word.id, word.word, word.pos, word.definition, word.note, word.color,
    ].join('\t'))
    .join('\n');
}

export function renderCards() {
  const words = visibleWords();
  const byId = new Map(words.map((word) => [word.id, word]));
  cardsElement.dataset.filter = isArchivedFilter() ? 'archived' : 'all';

  // Keep the dealt order, but drop anything that left and append anything
  // new rather than reshuffling under the reader's thumb.
  const kept = order.filter((id) => byId.has(id));
  const fresh = words.filter((word) => !kept.includes(word.id)).map((word) => word.id);
  order = kept.concat(fresh);

  const ordered = order.map((id) => byId.get(id));
  paintEmpty(ordered.length);

  // A sync that changed nothing on screen must not rebuild the deck: it would
  // cancel a turn in progress and throw away the scroll position.
  const signature = signatureOf(ordered);
  if (signature === lastSignature && cardsElement.childElementCount) return;
  lastSignature = signature;

  const fragment = document.createDocumentFragment();
  ordered.forEach((word) => fragment.appendChild(buildCard(word)));
  cardsElement.replaceChildren(fragment);
  // The old nodes are gone; the watcher follows the new ones.
  watch();
}

/** Face up again, quietly: the card is off screen when this happens. */
function turnBack(card) {
  const id = card.dataset.id;
  if (!flipped.has(id)) return;
  flipped.delete(id);
  // No transition to see, so the layer it was promoted to can go too.
  card.classList.remove('is-primed');
  paintSide(card, false);
}

/**
 * The card the reader is looking at: the one nearest the middle of the deck.
 *
 * Measured on the keypress rather than tracked as the deck scrolls. It costs
 * one pass over the cards at the moment a key goes down, which is nothing,
 * and it cannot drift out of step with where the deck actually is.
 */
function cardInView() {
  const cards = cardsElement.querySelectorAll('.flashcard');
  if (!cards.length) return null;

  const middle = cardsElement.getBoundingClientRect().top + cardsElement.clientHeight / 2;
  let best = null;
  let closest = Infinity;

  cards.forEach((card) => {
    const box = card.getBoundingClientRect();
    const distance = Math.abs(box.top + box.height / 2 - middle);
    if (distance < closest) {
      closest = distance;
      best = card;
    }
  });

  return best;
}

/** Somewhere text is being entered, where every key means itself. */
function isTyping(element) {
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    || element.isContentEditable;
}

/**
 * Moves one card up or down the deck.
 *
 * Scrolls rather than jumping, and lets the deck's own scroll snapping settle
 * the landing — so a keypress and a flick end in exactly the same place.
 */
function step(delta) {
  const slots = Array.from(cardsElement.querySelectorAll('.card-slot'));
  if (!slots.length) return;

  const card = cardInView();
  const at = card ? slots.indexOf(card.closest('.card-slot')) : 0;
  const to = Math.max(0, Math.min(slots.length - 1, at + delta));
  if (to === at) return;

  const slot = slots[to];
  const top = slot.getBoundingClientRect().top
    - cardsElement.getBoundingClientRect().top + cardsElement.scrollTop;
  cardsElement.scrollTo({ top, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

/** Enter or Space turns the card on screen; up and down move; see the top. */
function onKey(event) {
  if (cardsElement.hidden) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  // A dialog is in front, and its own controls own the keyboard.
  if (document.querySelector('dialog[open]')) return;

  const active = document.activeElement;
  if (isTyping(active)) return;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    step(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }

  if (event.key !== 'Enter' && event.key !== ' ') return;

  // Anything focusable already means something by Enter — a link opens, a
  // button presses. Only take the key when nothing has claimed it.
  const focused = active && active.closest && active.closest('.flashcard');
  if (active && !focused && active !== document.body && active.closest('a, button')) {
    return;
  }

  const card = focused || cardInView();
  if (!card) return;
  event.preventDefault();
  flip(card);
}

function watch() {
  const cards = cardsElement.querySelectorAll('.flashcard');
  [watcher, nearby].forEach((observer) => {
    if (!observer) return;
    observer.disconnect();
    cards.forEach((card) => observer.observe(card));
  });
  // Without IntersectionObserver there is no way to limit it; a small deck
  // is still fine, and it is the only way the turn works at all.
  if (!nearby) cards.forEach((card) => card.classList.add('is-live'));
}

/**
 * How much taller the header is than the tab bar, for centring on the whole
 * screen rather than on what is left between the two bars. Measured rather
 * than assumed, because both change with the safe areas, the folder name and
 * the window size.
 *
 * Set on the root so the quiz home can centre the same way; see .card-slot
 * and .quiz-home.
 */
function trackChrome() {
  const header = document.querySelector('.app-header');
  const tabbar = document.getElementById('tabbar');
  if (!header || !tabbar) return;

  const update = () => {
    const diff = Math.max(0, header.offsetHeight - tabbar.offsetHeight);
    document.documentElement.style.setProperty('--chrome-diff', diff + 'px');
  };

  update();
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(update);
    // The border box, because the safe areas are padding: watching only the
    // content box would miss a notch appearing or going on rotation.
    observer.observe(header, { box: 'border-box' });
    observer.observe(tabbar, { box: 'border-box' });
  }
  // Belt and braces for engines that ignore the box option.
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
}

export function initCards() {
  trackChrome();

  if ('IntersectionObserver' in window) {
    watcher = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) turnBack(entry.target);
      });
    }, { root: cardsElement, threshold: 0 });

    // A screen's margin either side, so a card is ready before it arrives.
    nearby = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle('is-live', entry.isIntersecting);
      });
    }, { root: cardsElement, rootMargin: '100% 0px', threshold: 0 });
  }

  cardsElement.addEventListener('touchstart', prime, { passive: true });

  cardsElement.addEventListener('click', (event) => {
    // The YouGlish link opens; it does not turn the card.
    if (event.target.closest('a')) return;
    const card = event.target.closest('.flashcard');
    if (card) flip(card);
  });

  // On the document rather than the deck: a card only receives the key when
  // it has been tabbed to, and on a Mac nothing has been.
  document.addEventListener('keydown', onKey);
}
