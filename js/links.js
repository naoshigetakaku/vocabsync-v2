/**
 * links.js — the two places a word can be looked up.
 *
 * YouGlish answers "how is this said"; DuckDuckGo answers everything else.
 * They are built here rather than in each screen because the detail dialog,
 * the card deck and the quiz all show the same pair, and a pair that drifts
 * apart between screens is worse than no pair at all.
 *
 * Stacked rather than side by side: at phone width two of these in a row
 * crowd the word they belong to, and the second one would have to lose its
 * label to fit — which is the only thing saying where it goes.
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
  svg.setAttribute('class', 'youglish__chevron');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M9 6l6 6-6 6');
  svg.appendChild(path);
  return svg;
}

function link(text, href, label) {
  const element = document.createElement('a');
  element.className = 'youglish';
  element.href = href;
  element.target = '_blank';
  element.rel = 'noopener noreferrer';
  element.setAttribute('aria-label', label);

  const name = document.createElement('span');
  name.className = 'youglish__label';
  name.textContent = text;
  element.appendChild(name);
  element.appendChild(chevron());
  return element;
}

export function youglishLabel(word) {
  return 'Hear “' + word.word + '” on YouGlish';
}

export function duckduckgoLabel(word) {
  return 'Search “' + word.word + '” on DuckDuckGo';
}

/** Both links for one word, ready to drop into a card. */
export function wordLinks(word) {
  const group = document.createElement('div');
  group.className = 'wordlinks';
  group.appendChild(link('youglish', youglishUrl(word), youglishLabel(word)));
  group.appendChild(link('duckduckgo', duckduckgoUrl(word), duckduckgoLabel(word)));
  return group;
}

/** Points a pair already in the markup at a different word. */
export function pointLinks(youglish, duckduckgo, word) {
  youglish.href = youglishUrl(word);
  youglish.setAttribute('aria-label', youglishLabel(word));
  duckduckgo.href = duckduckgoUrl(word);
  duckduckgo.setAttribute('aria-label', duckduckgoLabel(word));
}
