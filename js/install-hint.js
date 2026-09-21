/**
 * install-hint.js — one-off "Add to Home Screen" nudge for iOS.
 *
 * iOS has no beforeinstallprompt event, so the only option is to explain the
 * Share-sheet route in words. Shown once, then never again.
 */

import { STORAGE_KEYS } from './config.js';
import { readJson, writeJson } from './storage.js';

const SHOW_AFTER_MS = 4000;

function isIos() {
  const ua = window.navigator.userAgent;
  const iPhoneOrIPad = /iPad|iPhone|iPod/.test(ua);
  // iPadOS reports itself as a Mac; the touch point count gives it away.
  const iPadDesktopMode = /Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1;
  return iPhoneOrIPad || iPadDesktopMode;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export function initInstallHint() {
  const banner = document.getElementById('install-hint');
  const dismiss = document.getElementById('install-dismiss');
  if (!banner || !dismiss) return;

  if (!isIos() || isStandalone()) return;
  if (readJson(STORAGE_KEYS.installHint, false)) return;

  setTimeout(() => {
    banner.hidden = false;
  }, SHOW_AFTER_MS);

  dismiss.addEventListener('click', () => {
    banner.hidden = true;
    writeJson(STORAGE_KEYS.installHint, true);
  });
}
