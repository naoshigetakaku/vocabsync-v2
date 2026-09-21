/**
 * scheduler.js — when a word comes back in the quiz.
 *
 * Spaced repetition measured in answers rather than days, shaped like Anki's
 * SM-2. The clock is the total number of answers ever given, across every
 * word (`tick`); each word records the tick at which it is due again.
 *
 * Anki's day intervals map onto answer counts: its two learning steps become
 * LEARNING_GAP, its graduating interval GRADUATING_GAP, and from there a
 * right answer multiplies the gap by the word's ease. A miss is a lapse: the
 * ease drops, the word goes back to the relearning step, and the next two
 * right answers walk it out to the graduating interval again — which is what
 * Anki's "new interval 0%, minimum interval 1 day" does.
 *
 * Counting answers instead of days means a week off leaves no backlog, and a
 * long sitting never runs dry. The trade-off is that real forgetting happens
 * in time, not in questions — which holds up as long as the quiz is used
 * with some regularity.
 *
 * The "don't know this" label is the other half. A missed word gets it; a
 * labelled word comes round at a fraction of its usual gap and ahead of
 * anything else due; and LABEL_CLEAR_STREAK right answers in a row take it
 * off again.
 *
 * Everything here is a pure function of the words passed in, so it can be
 * reasoned about (and tested) without the rest of the app.
 */

import { STATUS_UNKNOWN, LABEL_CLEAR_STREAK, NEW_WORD_EVERY } from './config.js';

export const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const EASE_PENALTY = 0.2;

/**
 * Gaps, in answers.
 *
 * LEARNING_GAP stands in for Anki's second learning step and for its
 * relearning step — a word just missed, or just met, comes back very soon.
 * GRADUATING_GAP is the interval a word leaves the learning phase on, and the
 * floor every later gap is multiplied up from.
 */
const LEARNING_GAP = 2;
const GRADUATING_GAP = 10;
const MAX_GAP = 5000;

/** A labelled word's gap is scaled down by this, and never longer than the cap. */
const LABEL_FACTOR = 0.4;
const LABEL_MAX_GAP = 10;

/** A word counts as solid once it has this many right answers in a row. */
const SOLID_STREAK = 3;

export function hasLabel(word) {
  return word.status === STATUS_UNKNOWN;
}

/**
 * Never asked, and not labelled. A word labelled by hand before it was ever
 * asked is due straight away instead: asking about it is the whole point of
 * the label.
 */
export function isNew(word) {
  return !(word.reviews > 0) && !hasLabel(word);
}

/** The clock: every answer ever given, across every word. */
export function currentTick(words) {
  return words.reduce((sum, word) => sum + (word.reviews || 0), 0);
}

export function isDue(word, tick) {
  return !isNew(word) && (word.dueTick || 0) <= tick;
}

/** 'new', 'learning' or 'solid' — for the progress bar on the quiz home. */
export function stageOf(word) {
  if (isNew(word)) return 'new';
  if (hasLabel(word) || (word.streak || 0) < SOLID_STREAK) return 'learning';
  return 'solid';
}

function nextGap(word, correct, streak) {
  // A lapse drops the word onto the relearning step, whatever it had reached.
  if (!correct) return LEARNING_GAP;
  if (streak === 1) return LEARNING_GAP;
  if (streak === 2) return GRADUATING_GAP;
  const ease = Number(word.ease) || DEFAULT_EASE;
  return Math.max(word.gap || 0, GRADUATING_GAP) * ease;
}

/**
 * The word's new schedule after one answer.
 *
 * Returns the fields to store, plus whether this answer put the label on or
 * took it off, so the quiz can say so. `random` is injectable so previews and
 * tests are deterministic; it only spreads gaps by ±5%, so that words learnt
 * together do not stay bunched together for good.
 */
export function schedule(word, correct, tick, random = Math.random) {
  const hadLabel = hasLabel(word);
  let ease = Number(word.ease) || DEFAULT_EASE;
  let streak = word.streak || 0;
  let labelStreak = word.labelStreak || 0;
  let labelled = hadLabel;

  if (correct) {
    streak += 1;
    if (labelled) {
      labelStreak += 1;
      if (labelStreak >= LABEL_CLEAR_STREAK) {
        labelled = false;
        labelStreak = 0;
      }
    }
  } else {
    streak = 0;
    labelStreak = 0;
    labelled = true;
    ease = Math.max(MIN_EASE, ease - EASE_PENALTY);
  }

  let gap = nextGap(Object.assign({}, word, { ease }), correct, streak);
  // A labelled word comes round at a fraction of its gap. Only after a right
  // answer: a miss already puts it a few questions away, and scaling that
  // down again would ask it almost immediately.
  //
  // Never below the learning step, though. Anki's intervals start small, so
  // scaling one of those down lands on 1 — the very next question — which
  // reads as the app not having heard the right answer at all.
  if (labelled && correct) {
    gap = Math.max(LEARNING_GAP, Math.min(LABEL_MAX_GAP, gap * LABEL_FACTOR));
  }
  gap = Math.max(1, Math.min(MAX_GAP, Math.round(gap * (0.95 + random() * 0.1))));

  // This answer is itself a tick, so "due in 3" means three other answers
  // from now.
  const after = tick + 1;

  return {
    fields: {
      reviews: (word.reviews || 0) + 1,
      // Every miss is counted, whether or not anything on screen says so.
      lapses: (word.lapses || 0) + (correct ? 0 : 1),
      streak,
      labelStreak,
      gap,
      ease: Math.round(ease * 100) / 100,
      dueTick: after + gap,
      status: labelled ? STATUS_UNKNOWN : '',
    },
    labelAdded: labelled && !hadLabel,
    labelCleared: hadLabel && !labelled,
  };
}

/** What each button would do, for the hints under them. No randomness. */
export function preview(word, tick) {
  const half = () => 0.5;
  return {
    missed: schedule(word, false, tick, half),
    correct: schedule(word, true, tick, half),
  };
}

/** Labelled first; then the furthest past due, relative to its own gap. */
function byUrgency(tick) {
  return (a, b) => {
    const label = Number(hasLabel(b)) - Number(hasLabel(a));
    if (label) return label;
    const late = (word) => (tick - (word.dueTick || 0)) / Math.max(1, word.gap || 1);
    return late(b) - late(a);
  };
}

function byCreated(a, b) {
  return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

/**
 * The next word to ask, or null when there is nothing at all.
 *
 *   1. Anything due, labelled words first — except that a new word is let in
 *      once NEW_WORD_EVERY - 1 questions have passed without one, so a long
 *      backlog does not stop new words arriving altogether.
 *   2. With nothing due, a new word, oldest first.
 *   3. With no new words either, whatever comes due next, early.
 *
 * The word just asked is skipped unless it is the only one there is, so the
 * same card never appears twice in a row.
 */
export function pickNext(words, tick, lastId, sinceNew) {
  const pool = words.length > 1 ? words.filter((word) => word.id !== lastId) : words;

  const due = [];
  const fresh = [];
  const later = [];
  pool.forEach((word) => {
    if (isNew(word)) fresh.push(word);
    else if (isDue(word, tick)) due.push(word);
    else later.push(word);
  });

  due.sort(byUrgency(tick));
  fresh.sort(byCreated);
  later.sort((a, b) => (a.dueTick || 0) - (b.dueTick || 0));

  if (due.length) {
    if (fresh.length && sinceNew >= NEW_WORD_EVERY - 1) return fresh[0];
    return due[0];
  }
  if (fresh.length) return fresh[0];
  return later[0] || null;
}

/** Counts for the quiz home. */
export function summarise(words, tick) {
  const counts = { ready: 0, labelled: 0, fresh: 0, new: 0, learning: 0, solid: 0 };
  words.forEach((word) => {
    if (isDue(word, tick)) counts.ready += 1;
    if (hasLabel(word)) counts.labelled += 1;
    if (isNew(word)) counts.fresh += 1;
    counts[stageOf(word)] += 1;
  });
  return counts;
}
