/**
 * scroll-lock.js — freeze the list behind an open dialog.
 *
 * The shell already keeps <body> from scrolling, but the list itself is a
 * scroller. Without this, a swipe that starts on a sheet and continues past it
 * would carry on scrolling the page underneath.
 *
 * Reference counted, because a picker can open on top of the form sheet.
 */

let depth = 0;
let savedScrollTop = 0;

function scroller() {
  return document.querySelector('.app-main');
}

export function lock() {
  depth += 1;
  if (depth > 1) return;

  const element = scroller();
  if (!element) return;
  savedScrollTop = element.scrollTop;
  element.classList.add('is-locked');
}

export function unlock() {
  if (depth === 0) return;
  depth -= 1;
  if (depth > 0) return;

  const element = scroller();
  if (!element) return;
  element.classList.remove('is-locked');
  element.scrollTop = savedScrollTop;
}
