/**
 * quiz.js — the Quiz tab: what is waiting, and the session itself.
 *
 * One card at a time, front first: the word alone, then a tap turns it over
 * to everything else, then Missed or Got it. The turn is the same pure CSS
 * transform between two faces the card mode used, so nothing is built or
 * measured at the moment of the tap.
 *
 * On a keyboard: S or Enter starts a session from the quiz home, E ends one,
 * Enter or Space turns the card, and once it is turned the left and right
 * arrows answer it — left for Missed, right for Got it, which is the order
 * the two buttons sit in. Before the turn the arrows do nothing, for the same
 * reason the buttons are not there yet.
 *
 * What to ask and when lives in scheduler.js; this file is the screen.
 */

import { DEFAULT_COLOR, QUIZ_FLUSH_EVERY } from './config.js';
import { getWords, getWord, recordAnswer, flush, isLocalOnly } from './store.js';
import { isRetryable } from './api.js';
import { wordsInScope } from './view.js';
import { currentTick, pickNext, preview, schedule, summarise, isNew } from './scheduler.js';
import { wordLinks } from './links.js';
import { toast } from './toast.js';

const homeElement = document.getElementById('quiz-home');
const readyElement = document.getElementById('quiz-ready');
const unknownElement = document.getElementById('quiz-unknown');
const newElement = document.getElementById('quiz-new');
const startButton = document.getElementById('quiz-start');
const progressElement = document.getElementById('quiz-progress');
const emptyElement = document.getElementById('quiz-empty');
const barParts = {
  new: document.getElementById('bar-new'),
  learning: document.getElementById('bar-learning'),
  solid: document.getElementById('bar-solid'),
};
const legends = {
  new: document.getElementById('legend-new'),
  learning: document.getElementById('legend-learning'),
  solid: document.getElementById('legend-solid'),
};

const quizElement = document.getElementById('quiz');
const stageElement = document.getElementById('quiz-stage');
const actionsElement = document.getElementById('quiz-actions');
const flipHint = document.getElementById('quiz-flip-hint');
const answeredElement = document.getElementById('quiz-answered');
const endButton = document.getElementById('quiz-end');
const missedButton = document.getElementById('grade-missed');
const missedHint = document.getElementById('grade-missed-hint');
const gotButton = document.getElementById('grade-got');
const gotHint = document.getElementById('grade-got-hint');

/** Must match the card swap in animations.css. */
const SWAP_MS = 170;
const SVG_NS = 'http://www.w3.org/2000/svg';

let session = null;
let onChange = () => {};

/** Words this quiz may ask: the open folder, minus anything not saved yet. */
function pool() {
  return wordsInScope().filter((word) => !isLocalOnly(word));
}

function tickNow() {
  return currentTick(getWords());
}

/* --- The quiz home -------------------------------------------------------- */

export function renderQuizHome() {
  const words = pool();
  const counts = summarise(words, tickNow());

  readyElement.textContent = String(counts.ready);
  // The "don't know this" label still drives the schedule, but it is not
  // something the reader is told about; see js/config.js.
  unknownElement.hidden = true;
  newElement.textContent = counts.fresh ? counts.fresh + ' new' : '';
  newElement.hidden = !counts.fresh;

  const total = words.length;
  startButton.disabled = total === 0;
  progressElement.hidden = total === 0;
  emptyElement.hidden = total !== 0;

  if (!total) return;

  ['new', 'learning', 'solid'].forEach((stage) => {
    barParts[stage].style.width = (counts[stage] / total) * 100 + '%';
    legends[stage].textContent = stage === 'new'
      ? counts.new + ' new'
      : stage === 'learning' ? counts.learning + ' learning' : counts.solid + ' solid';
  });
}

/* --- The card ------------------------------------------------------------- */

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
  const card = document.createElement('div');
  // Always live: the quiz only ever has the one card; see components.css.
  card.className = 'flashcard is-live';
  card.dataset.id = word.id;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', 'Tap to show the answer.');

  const front = document.createElement('div');
  front.className = 'flashcard__face flashcard__face--front';

  const heading = document.createElement('h2');
  heading.className = 'flashcard__word';
  heading.dataset.color = word.color || DEFAULT_COLOR;
  heading.textContent = word.word;
  front.appendChild(heading);
  front.appendChild(wordLinks(word));

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
  return card;
}

function currentCard() {
  return stageElement.querySelector('.flashcard');
}

/** Wording under each button: where this answer would put the word. */
function paintHints(word) {
  const outlook = preview(word, tickNow());
  missedHint.textContent = 'again in ' + outlook.missed.fields.gap;
  gotHint.textContent = 'in ' + outlook.correct.fields.gap;
}

function showFace(card, showBack) {
  card.classList.toggle('is-flipped', showBack);
  card.setAttribute('aria-label', showBack ? 'Showing the answer.' : 'Tap to show the answer.');
  const [front, back] = card.querySelectorAll('.flashcard__face');
  front.setAttribute('aria-hidden', showBack ? 'true' : 'false');
  back.setAttribute('aria-hidden', showBack ? 'false' : 'true');
  front.querySelectorAll('a').forEach((link) => { link.tabIndex = showBack ? -1 : 0; });
  back.querySelectorAll('a').forEach((link) => { link.tabIndex = showBack ? 0 : -1; });

  // Grading only makes sense once the answer has been seen.
  actionsElement.hidden = !showBack;
  flipHint.hidden = showBack;
}

function flip() {
  const card = currentCard();
  if (!card || !session) return;
  session.flipped = !session.flipped;
  card.classList.add('is-primed');
  showFace(card, session.flipped);
}

/**
 * Promotes the card to its own layer as the finger lands, ~100ms before the
 * tap that turns it, so the first frame of the turn is not spent making one.
 */
/** Somewhere text is being entered, where every key means itself. */
function isTyping(element) {
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    || element.isContentEditable;
}

/**
 * The keyboard, on the quiz home and during a session.
 *
 * Guarded on the session rather than on the screen once one is running: the
 * quiz covers everything while it is up, so there is nothing else these keys
 * could mean.
 */
function onKey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  // A dialog is in front, and its own controls own the keyboard.
  if (document.querySelector('dialog[open]')) return;

  const active = document.activeElement;
  if (isTyping(active)) return;

  const key = event.key;

  // No session yet: the quiz home, if that is the tab showing.
  if (!session) {
    if (homeElement.hidden || startButton.disabled) return;
    if (key !== 'Enter' && key !== ' ' && key !== 's' && key !== 'S') return;
    // A focused button already means Enter and Space; let it do its own job
    // rather than starting the session twice.
    if (key !== 's' && key !== 'S' && active && active.closest('a, button')) return;
    event.preventDefault();
    startQuiz();
    return;
  }

  if (!session.currentId) return;

  // The same thing the End button does, and available at any point — there is
  // no card state in which stopping should be refused.
  if (key === 'e' || key === 'E') {
    event.preventDefault();
    finish();
    return;
  }

  if (key === 'Enter' || key === ' ') {
    event.preventDefault();
    flip();
    return;
  }

  // Left and right match where Missed and Got it sit on screen. They only
  // answer once the card has been turned, exactly as the buttons do.
  if (!session.flipped) return;
  if (key === 'ArrowLeft') {
    event.preventDefault();
    grade(false);
  } else if (key === 'ArrowRight') {
    event.preventDefault();
    grade(true);
  }
}

function prime(event) {
  const card = event.target.closest('.flashcard');
  if (!card || event.target.closest('a')) return;
  card.classList.add('is-primed');
}

function showCard(word, direction) {
  const card = buildCard(word);
  session.currentId = word.id;
  session.flipped = false;

  const outgoing = currentCard();
  if (outgoing && direction) {
    outgoing.classList.add('is-leaving');
    setTimeout(() => {
      stageElement.replaceChildren(card);
      card.classList.add('is-entering');
      showFace(card, false);
      paintHints(word);
    }, SWAP_MS);
    return;
  }

  stageElement.replaceChildren(card);
  card.classList.add('is-entering');
  showFace(card, false);
  paintHints(word);
}

/* --- The session ---------------------------------------------------------- */

function nextCard(direction) {
  const word = pickNext(pool(), tickNow(), session.lastId, session.sinceNew);
  if (!word) {
    finish();
    return;
  }
  session.sinceNew = isNew(word) ? 0 : session.sinceNew + 1;
  showCard(word, direction);
}

function paintCounter() {
  answeredElement.textContent = session.answered === 1 ? '1 answered' : session.answered + ' answered';
}

async function grade(correct) {
  if (!session || !session.currentId || !session.flipped) return;

  const word = getWord(session.currentId);
  if (!word) {
    nextCard(true);
    return;
  }

  const outcome = schedule(word, correct, tickNow());
  recordAnswer(word.id, outcome.fields);

  session.answered += 1;
  if (correct) session.correct += 1;
  else session.missed += 1;
  session.lastId = word.id;
  paintCounter();

  nextCard(true);
  onChange();

  // Sent a few at a time; the card never waits on the network.
  if (session.answered % QUIZ_FLUSH_EVERY === 0) push();
}

/**
 * Sends what has been answered so far. A timeout or a dropped connection is
 * not worth a message: the answers stay queued and go with the next sync.
 */
function push() {
  flush().catch((error) => {
    if (!isRetryable(error)) toast(error.message);
  });
}

/**
 * Ends the session and goes straight back to the quiz home.
 *
 * The result used to be a screen of its own with a button to leave it, which
 * meant every session ended with one more tap that told you nothing you had
 * not already seen counted up in the corner. It is a toast now: the same
 * numbers, on the way out rather than in the way.
 */
function finish() {
  if (!session) return;

  const { answered, correct, missed } = session;
  closeQuiz();

  if (!answered) return;

  const percent = Math.round((correct / answered) * 100);
  const parts = [answered + (answered === 1 ? ' answer' : ' answers'), percent + '% right'];
  if (missed) parts.push(missed + ' to see again');
  toast(parts.join(' · '));
}

export function isQuizRunning() {
  return session !== null;
}

export function startQuiz() {
  const words = pool();
  if (!words.length) return;

  session = {
    currentId: null,
    lastId: null,
    sinceNew: 0,
    answered: 0,
    correct: 0,
    missed: 0,
    flipped: false,
  };

  stageElement.hidden = false;
  actionsElement.hidden = true;
  flipHint.hidden = false;
  endButton.hidden = false;
  quizElement.hidden = false;
  document.body.classList.add('is-quizzing');
  paintCounter();
  nextCard(false);
}

export function closeQuiz() {
  if (!session) return;
  session = null;
  quizElement.hidden = true;
  stageElement.replaceChildren();
  document.body.classList.remove('is-quizzing');
  push();
  onChange();
}

export function initQuiz(handlers) {
  onChange = handlers.onChange || (() => {});

  startButton.addEventListener('click', startQuiz);
  endButton.addEventListener('click', finish);

  stageElement.addEventListener('touchstart', prime, { passive: true });
  stageElement.addEventListener('click', (event) => {
    // The YouGlish link opens; it does not turn the card.
    if (event.target.closest('a')) return;
    if (event.target.closest('.flashcard')) flip();
  });
  // On the document rather than the stage: the card only receives the key
  // when it has been tabbed to, and on a Mac nothing has been.
  document.addEventListener('keydown', onKey);

  missedButton.addEventListener('click', () => grade(false));
  gotButton.addEventListener('click', () => grade(true));
}
