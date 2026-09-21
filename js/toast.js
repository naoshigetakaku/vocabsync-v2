/**
 * toast.js — brief, non-blocking status messages.
 */

const VISIBLE_MS = 2600;
const EXIT_MS = 220;

let element;
let hideTimer;
let removeTimer;

export function toast(message) {
  if (!element) element = document.getElementById('toast');
  if (!element) return;

  clearTimeout(hideTimer);
  clearTimeout(removeTimer);

  element.classList.remove('is-leaving');
  element.textContent = message;
  element.hidden = false;

  hideTimer = setTimeout(() => {
    element.classList.add('is-leaving');
    removeTimer = setTimeout(() => {
      element.hidden = true;
      element.classList.remove('is-leaving');
    }, EXIT_MS);
  }, VISIBLE_MS);
}
