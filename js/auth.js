/**
 * auth.js — device-local credentials.
 *
 * The Apps Script deployment is published as "Anyone", so the URL alone would
 * let any visitor read and write the sheet. The passphrase checked server-side
 * is what actually protects the data, and it lives only on the device.
 *
 * Note for iOS: a page opened in Safari and the same page launched from the
 * Home Screen use separate storage, so each one needs its own setup.
 */

import { DEFAULT_API_URL, STORAGE_KEYS } from './config.js';
import { readJson, writeJson, remove } from './storage.js';

let cache;

export function getCredentials() {
  if (cache !== undefined) return cache;

  const stored = readJson(STORAGE_KEYS.credentials, null);
  const url = (stored && stored.url) || DEFAULT_API_URL;
  const passphrase = stored && stored.passphrase;

  cache = url && passphrase ? { url, passphrase } : null;
  return cache;
}

export function hasCredentials() {
  return getCredentials() !== null;
}

export function saveCredentials(url, passphrase) {
  const value = { url: url.trim(), passphrase: passphrase.trim() };
  writeJson(STORAGE_KEYS.credentials, value);
  cache = value;
  return value;
}

export function clearCredentials() {
  remove(STORAGE_KEYS.credentials);
  cache = null;
}
