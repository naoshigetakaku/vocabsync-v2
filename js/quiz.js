/**
 * quiz.js — the Quiz tab: what is waiting, and the session itself.
 *
 * One card at a time, front first: the word alone, then a tap turns it over
 * to everything else. Missed and Got it are there from the moment the card
 * arrives, not only once it has been turned — you can know an answer without
 * needing to see it, and waiting for the turn made that a chore.
 *
 * With the timer on, a card unanswered after QUIZ_TIMER_MS counts as missed.
 * The clock does not stop when the card is turned: seeing the answer is not
 * the same as having known it. It stops only when a button is pressed, when
 * the session ends, or when the app goes into the background — that last one
 * so a phone call does not silently cost you a word.
 *
 * What to ask and when lives in scheduler.js; this file is the screen.
 */

import { DEFAULT_COLOR, QUIZ_FLUSH_EVERY, QUIZ_TIMER_MS } from './config.js';
import { getWords, getWord, recordAnswer, flush, isLocalOnly } from './store.js';
import { isRetryable } from './api.js';
import { folderWords } from './view.js';
import { currentTick, pickNext, schedule, summarise, isNew } from './scheduler.js';
import { wordLinks } from './links.js';
import { isTimerOn } from './settings.js';
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
const timerElement = document.getElementById('quiz-timer');
const timerFill = document.getElementById('quiz-timer-fill');
const answeredElement = document.getElementById('quiz-answered');
const endButton = document.getElementById('quiz-end');
const missedButton = document.getElementById('grade-missed');
const gotButton = document.getElementById('grade-got');
const summaryElement = document.getElementById('quiz-summary');
const summaryAnswered = document.getElementById('summary-answered');
const summaryLabels = document.getElementById('summary-labels');
const doneButton = document.getElementById('quiz-done');

/** Must match the card swap in animations.css. */
const SWAP_MS = 170;
const SVG_NS = 'http://www.w3.org/2000/svg';

let session = null;
let onChange = () => {};

/** Words this quiz may ask: the open folder, minus anything not saved yet. */
function pool() {
  return folderWords().filter((word) => !isLocalOnly(word));
}

function tickNow() {
  return currentTick(getWords());
}

/* --- The quiz home -------------------------------------------------------- */

export function renderQuizHome() {
  const words = pool();
  const counts = summarise(words, tickNow());

  readyElement.textContent = String(counts.ready);
  // The "don't know this" label still drives the schedule, but it is no
  // longer something the reader is told about; see js/config.js.
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

/** For the badge on the tab bar. */
export function readyCount() {
  return summarise(pool(), tickNow()).ready;
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

/* --- The clock ------------------------------------------------------------ */

/**
 * One timeout, and one CSS animation that shows it running down.
 *
 * Every path out of a card clears the timeout before anything else happens,
 * so a card can never be graded twice — by the reader and then by the clock
 * a moment later.
 */
function stopTimer() {
  if (session && session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }
  timerElement.hidden = true;
  timerFill.classList.remove('is-running');
}

function startTimer() {
  stopTimer();
  if (!session || !isTimerOn()) return;

  timerElement.hidden = false;
  // Restart the animation even when one card follows another immediately.
  void timerFill.offsetWidth;
  timerFill.classList.add('is-running');

  session.timer = setTimeout(() => {
    if (!session) return;
    session.timer = null;
    grade(false, true);
  }, QUIZ_TIMER_MS);
}

function showFace(card, showBack) {
  card.classList.toggle('is-flipped', showBack);
  card.setAttribute('aria-label', showBack ? 'Showing the answer.' : 'Tap to show the answer.');
  const [front, back] = card.querySelectorAll('.flashcard__face');
  front.setAttribute('aria-hidden', showBack ? 'true' : 'false');
  back.setAttribute('aria-hidden', showBack ? 'false' : 'true');
  face(front).forEach((link) => { link.tabIndex = showBack ? -1 : 0; });
  face(back).forEach((link) => { link.tabIndex = showBack ? 0 : -1; });

  // Both buttons are there from the start; only the nudge to turn the card
  // goes away once it has been turned.
  flipHint.hidden = showBack;
}

/** The links on one face, which must not be reachable by Tab when hidden. */
function face(element) {
  return Array.from(element.querySelectorAll('a'));
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
      // The clock starts with the card the reader can actually see.
      startTimer();
    }, SWAP_MS);
    return;
  }

  stageElement.replaceChildren(card);
  card.classList.add('is-entering');
  showFace(card, false);
  startTimer();
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

/**
 * Records one answer. `timedOut` marks the ones the clock gave, which are
 * counted separately so the summary can say how many went that way.
 */
async function grade(correct, timedOut) {
  if (!session || !session.currentId) return;
  stopTimer();

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
  if (timedOut) session.timedOut += 1;
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

function finish() {
  if (!session) return;

  const answered = session.answered;
  if (!answered) {
    closeQuiz();
    return;
  }

  const percent = Math.round((session.correct / answered) * 100);
  summaryAnswered.textContent = answered + (answered === 1 ? ' answer' : ' answers')
    + ' · ' + percent + '% right';

  const parts = [];
  if (session.missed) parts.push(session.missed + ' missed');
  if (session.timedOut) parts.push(session.timedOut + ' out of time');
  summaryLabels.textContent = parts.join(' · ');
  summaryLabels.hidden = !parts.length;

  stopTimer();
  stageElement.hidden = true;
  actionsElement.hidden = true;
  flipHint.hidden = true;
  summaryElement.hidden = false;
  endButton.hidden = true;

  push();
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
    timedOut: 0,
    flipped: false,
    timer: null,
  };

  summaryElement.hidden = true;
  stageElement.hidden = false;
  actionsElement.hidden = false;
  endButton.hidden = false;
  quizElement.hidden = false;
  document.body.classList.add('is-quizzing');
  paintCounter();
  nextCard(false);
}

export function closeQuiz() {
  if (!session) return;
  stopTimer();
  session = null;
  quizElement.hidden = true;
  stageElement.replaceChildren();
  summaryElement.hidden = true;
  document.body.classList.remove('is-quizzing');
  push();
  onChange();
}

export function initQuiz(handlers) {
  onChange = handlers.onChange || (() => {});

  // The bar and the timeout read the same number, so they cannot drift.
  timerFill.style.setProperty('--quiz-timer-ms', QUIZ_TIMER_MS + 'ms');

  startButton.addEventListener('click', startQuiz);
  endButton.addEventListener('click', finish);
  doneButton.addEventListener('click', closeQuiz);

  stageElement.addEventListener('touchstart', prime, { passive: true });
  stageElement.addEventListener('click', (event) => {
    // The YouGlish link opens; it does not turn the card.
    if (event.target.closest('a')) return;
    if (event.target.closest('.flashcard')) flip();
  });
  stageElement.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!event.target.classList.contains('flashcard')) return;
    event.preventDefault();
    flip();
  });

  missedButton.addEventListener('click', () => grade(false, false));
  gotButton.addEventListener('click', () => grade(true, false));

  // A card left running while the app is in the background would come back
  // already expired, or expire unseen. Stop the clock and leave the card up.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') stopTimer();
  });
}
