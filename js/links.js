/**
 * links.js — the two places a word can be looked up.
 *
 * YouGlish answers "how is this said", DuckDuckGo answers everything else.
 * They are built here rather than in each screen because the card, the deck,
 * the quiz and the detail dialog all show the same pair, and a pair that
 * drifts apart between screens is worse than no pair at all.
 *
 * Stacked rather than side by side: at phone width two pills in a row leave
 * no room for either label, and the labels are the whole point.
 */

import { YOUGLISH_BASE, YOUGLISH_LANGUAGE, DUCKDUCKGO_BASE } from './config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function youglishUrl(word) {
  return YOUGLISH_BASE + encodeURIComponent(word.word) + '/' + YOUGLISH_LANGUAGE;
}

export function duckduckgoUrl(word) {
  return DUCKDUCKGO_BASE + encodeURIComponent(word.word);
}

function chevron() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'wordlink__chevron');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M9 6l6 6-6 6');
  svg.appendChild(path);
  return svg;
}

function link(text, href, label) {
  const element = document.createElement('a');
  element.className = 'wordlink';
  element.href = href;
  element.target = '_blank';
  element.rel = 'noopener noreferrer';
  element.setAttribute('aria-label', label);

  const name = document.createElement('span');
  name.textContent = text;
  element.appendChild(name);
  element.appendChild(chevron());
  return element;
}

/** Both links for one word, ready to drop into a card. */
export function wordLinks(word) {
  const group = document.createElement('div');
  group.className = 'wordlinks';
  group.appendChild(link('youglish', youglishUrl(word), 'Hear “' + word.word + '” on YouGlish'));
  group.appendChild(link('duckduckgo', duckduckgoUrl(word), 'Search “' + word.word + '” on DuckDuckGo'));
  return group;
}

/** Points a pair already in the markup at a different word. */
export function pointLinks(youglish, duckduckgo, word) {
  youglish.href = youglishUrl(word);
  youglish.setAttribute('aria-label', 'Hear “' + word.word + '” on YouGlish');
  duckduckgo.href = duckduckgoUrl(word);
  duckduckgo.setAttribute('aria-label', 'Search “' + word.word + '” on DuckDuckGo');
}
