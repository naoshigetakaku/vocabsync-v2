/**
 * sort.js — ordering of the word list.
 *
 * There is no sort screen: the List tab's own label is the order, and tapping
 * that tab again steps to the next one. This module owns the order and the
 * wording; the tab bar just shows what it is told.
 */

import { STORAGE_KEYS } from './config.js';
import { readJson, writeJson } from './storage.js';

/** The order they step through, and the label each shows on the tab. */
const MODES = [
  { value: 'az', label: 'A–Z' },
  { value: 'za', label: 'Z–A' },
  { value: 'newest', label: 'New–Old' },
  { value: 'oldest', label: 'Old–New' },
];

const COMPARATORS = {
  newest: (a, b) => byDate(b, a),
  oldest: (a, b) => byDate(a, b),
  az: (a, b) => byWord(a, b),
  za: (a, b) => byWord(b, a),
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

let current = readJson(STORAGE_KEYS.sort, 'az');
if (!isKnown(current)) current = 'az';

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
