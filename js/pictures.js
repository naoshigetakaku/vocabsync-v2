/**
 * pictures.js — the picture on a card.
 *
 * A word's picture is stored as the address it was found at, which points at
 * whatever site happened to have it. The app never loads that address
 * directly: it goes through DuckDuckGo's image proxy, so the content policy
 * has one host to allow instead of hundreds, hosts that refuse to serve
 * images to other sites still work, and none of them learn who is reading.
 *
 * Nothing here reads a pixel. The back of a card takes its colours from the
 * picture by blurring a copy of it, not by sampling it — the proxy sends no
 * CORS header, so a canvas drawn from it cannot be read back. Blurring it is
 * also the cheaper of the two: no decode pass, no main-thread work.
 */

import { PICTURE_PROXY } from './config.js';

/** The address to actually load, or '' when there is no picture. */
export function pictureUrl(address) {
  const raw = String(address || '').trim();
  if (raw.indexOf('https://') !== 0) return '';
  return PICTURE_PROXY + encodeURIComponent(raw);
}

export function hasPicture(word) {
  return Boolean(word && String(word.image || '').trim());
}

/**
 * An <img> that holds its address without loading it.
 *
 * The address sits in a data attribute until the card comes within the
 * window; see showPictures in js/cards.js. An img with no src renders as
 * nothing, which is what an empty card should look like.
 */
export function picture(address, className) {
  const image = document.createElement('img');
  image.className = className;
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.loading = 'lazy';
  image.decoding = 'async';

  const url = pictureUrl(address);
  if (url) image.dataset.src = url;
  return image;
}

/** Loads the pictures inside an element, or unloads them. */
export function showPictures(element, show) {
  element.querySelectorAll('img[data-src]').forEach((image) => {
    if (show) {
      if (image.getAttribute('src') !== image.dataset.src) {
        image.setAttribute('src', image.dataset.src);
      }
    } else if (image.hasAttribute('src')) {
      // Dropping the attribute lets the browser release the decoded bitmap.
      // Keeping hundreds of those is how a large deck runs out of memory.
      image.removeAttribute('src');
    }
  });
}
