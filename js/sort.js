/**
 * sort.js — ordering of the word list.
 *
 * There is no sort screen: the List tab's own label is the order, and tapping
 * that tab again steps to the next one. This module owns the order and the
 * wording; the tab bar just shows what it is told.
 *
 * Two orders, both by date. A–Z and Z–A were dropped: with the tab label as
 * the only control, four orders meant up to three taps to reach the one you
 * wanted, and the alphabet is the order you can already navigate by eye.
 * When a word was added is the thing the list cannot show you.
 */

import { STORAGE_KEYS } from './config.js';
import { readJson, writeJson } from './storage.js';

/** The order they step through, and the label each shows on the tab. */
const MODES = [
  { value: 'newest', label: 'New–Old' },
  { value: 'oldest', label: 'Old–New' },
];

const COMPARATORS = {
  newest: (a, b) => byDate(b, a),
  oldest: (a, b) => byDate(a, b),
};

function byDate(a, b) {
  const result = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  // Same timestamp: fall back to the word so the order never flickers.
  return result !== 0 ? result : byWord(a, b);
}

function byWord(a, b) {
  return String(a.word || '').localeCompare(String(b.word || ''), undefined, {
    sensitivity: 'base',
  });
}

function isKnown(value) {
  return MODES.some((mode) => mode.value === value);
}

// A device that was left on A–Z lands on the first of these instead.
let current = readJson(STORAGE_KEYS.sort, MODES[0].value);
if (!isKnown(current)) current = MODES[0].value;

let onChange = () => {};

export function getSortMode() {
  return current;
}

export function sortWords(words) {
  return words.slice().sort(COMPARATORS[current]);
}

/** What the List tab reads right now. */
export function getSortLabel() {
  const mode = MODES.find((entry) => entry.value === current);
  return mode ? mode.label : MODES[0].label;
}

/** Steps to the next order and returns its label. */
export function cycleSort() {
  const at = MODES.findIndex((entry) => entry.value === current);
  current = MODES[(at + 1) % MODES.length].value;
  writeJson(STORAGE_KEYS.sort, current);
  onChange();
  return getSortLabel();
}

export function initSort(handler) {
  onChange = handler || (() => {});
}
