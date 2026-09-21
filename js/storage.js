/**
 * storage.js — localStorage wrapper.
 *
 * Every call is guarded: Safari throws on write in private mode, and iOS may
 * evict the whole store at any time. Storage is a cache here, never the truth,
 * so a failure must never break the app.
 */

export function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (error) {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
}

export function remove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    /* nothing to do */
  }
}
