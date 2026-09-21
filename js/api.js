/**
 * api.js — transport layer to the Apps Script Web App.
 */

import { getCredentials } from './auth.js';
import { REQUEST_TIMEOUT_MS, REQUIRED_BACKEND_VERSION, STORAGE_KEYS } from './config.js';
import { readJson, writeJson } from './storage.js';

export class ApiError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'ApiError';
    this.code = code;
  }
}

const MESSAGES = {
  NOT_CONFIGURED: 'Not connected yet.',
  NETWORK: 'Could not reach the server.',
  TIMEOUT: 'The server took too long to answer.',
  UNAUTHORIZED: 'Wrong passphrase.',
  NOT_FOUND: 'That word no longer exists.',
  BAD_REQUEST: 'The server rejected the request.',
  BUSY: 'Another change is in flight. Try again.',
};

function describe(code, detail) {
  if (MESSAGES[code]) return MESSAGES[code];
  // The backend sends a `detail` string for anything it could not classify.
  // Passing it through is what makes a version mismatch diagnosable instead
  // of showing the same blank "something went wrong" every time.
  return detail ? 'Server: ' + detail : 'Something went wrong on the server.';
}

/**
 * Version reported by the last successful response. A deployment older than
 * this build answers without the field at all, which reads as 0.
 */
let backendVersion = null;

/** null until a request has succeeded; then the deployment's own version. */
export function getBackendVersion() {
  return backendVersion;
}

/** What the last session saw, so a first request can already rely on it. */
let lastKnownVersion = Number(readJson(STORAGE_KEYS.backendVersion, 0)) || 0;

/**
 * This session's answer if there is one, else the last session's. Used to
 * pick a request format before anything has been asked of the server yet —
 * the queue is flushed before the first list — never to warn about anything.
 */
export function getKnownBackendVersion() {
  return backendVersion === null ? lastKnownVersion : backendVersion;
}

/** True once a response has proved the deployment predates this build. */
export function isBackendStale() {
  return backendVersion !== null && backendVersion < REQUIRED_BACKEND_VERSION;
}

/** True for failures that are worth retrying later rather than surfacing. */
export function isRetryable(error) {
  return error instanceof ApiError && (error.code === 'NETWORK' || error.code === 'TIMEOUT');
}

async function call(action, payload) {
  const credentials = getCredentials();
  if (!credentials) throw new ApiError('NOT_CONFIGURED', describe('NOT_CONFIGURED'));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(credentials.url, {
      method: 'POST',
      // text/plain keeps this a CORS "simple request". Apps Script cannot answer
      // the OPTIONS preflight that application/json would trigger, so the
      // Content-Type must stay in the simple set and the body is parsed by hand.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action, passphrase: credentials.passphrase }, payload)),
      // Apps Script answers with a redirect to googleusercontent.com.
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (error) {
    const code = error && error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
    throw new ApiError(code, describe(code));
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ApiError('HTTP_' + response.status, 'Server returned ' + response.status + '.');
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    // Usually means the deployment URL points at a login page rather than /exec.
    throw new ApiError('BAD_RESPONSE', 'Unexpected response — check the Web App URL and its access setting.');
  }

  if (!data || data.ok !== true) {
    const code = (data && data.error) || 'SERVER';
    throw new ApiError(code, describe(code, data && data.detail));
  }

  backendVersion = Number(data.version) || 0;
  if (backendVersion !== lastKnownVersion) {
    lastKnownVersion = backendVersion;
    writeJson(STORAGE_KEYS.backendVersion, backendVersion);
  }
  return data;
}

MESSAGES.DUPLICATE = 'A folder with that name already exists.';

export const api = {
  /** The whole snapshot: words and the folders they live in. */
  list: () => call('list', {}).then((data) => ({
    words: data.words || [],
    folders: data.folders || [],
  })),
  create: (fields) => call('create', { word: fields }).then((data) => data.word),
  update: (fields) => call('update', { word: fields }).then((data) => data.word),
  /** Several rewrites in one request; see updateMany_ in Code.gs. */
  updateMany: (list) => call('updateMany', { words: list }).then((data) => ({
    words: data.words || [],
    missing: data.missing || [],
  })),
  remove: (id) => call('delete', { id }).then(() => true),

  createFolder: (name) => call('createFolder', { name }).then((data) => data.folder),
  renameFolder: (id, name) => call('renameFolder', { id, name }).then((data) => data.folder),
  removeFolder: (id) => call('deleteFolder', { id }).then(() => true),
};
