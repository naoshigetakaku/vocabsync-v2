/**
 * sw.js — offline shell for the standalone web app.
 *
 * iOS drops standalone web apps from memory quickly, so a cold start happens
 * far more often than in a browser tab. Serving the shell from cache is what
 * makes that relaunch feel instant.
 *
 * Two rules keep an update from breaking the app, both learned the hard way:
 *
 *   1. The page and its modules must come from the SAME cache generation.
 *      Serving fresh HTML from the network while the scripts still come from
 *      the previous cache pairs new markup with old code, and the old code
 *      reaches for elements that no longer exist. Navigations are therefore
 *      cache-first, exactly like every other asset.
 *
 *   2. A new worker takes over on its own. Waiting for the user to accept an
 *      update is fine until the release that needs accepting is the one that
 *      crashed on load — then nothing is left running to accept it.
 *
 *   3. The precache must bypass the HTTP cache. cache.addAll() is allowed to
 *      answer from it, and GitHub Pages serves assets with a ten-minute
 *      max-age — so a new worker can happily fill its brand-new cache with the
 *      previous release's files and look, from the outside, like it updated.
 *
 * Bump CACHE_VERSION on every release.
 */

var CACHE_VERSION = 'v33';
var CACHE_NAME = 'vocabsync-' + CACHE_VERSION;

var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/theme.css',
  './css/layout.css',
  './css/components.css',
  './css/animations.css',
  './js/app.js',
  './js/api.js',
  './js/auth.js',
  './js/cards.js',
  './js/config.js',
  './js/confirm.js',
  './js/detail.js',
  './js/dialog.js',
  './js/folder-form.js',
  './js/folder-menu.js',
  './js/form.js',
  './js/install-hint.js',
  './js/links.js',
  './js/list.js',
  './js/picker.js',
  './js/quiz.js',
  './js/scheduler.js',
  './js/scroll-lock.js',
  './js/setup.js',
  './js/sort.js',
  './js/storage.js',
  './js/store.js',
  './js/swipe-row.js',
  './js/swipe.js',
  './js/toast.js',
  './js/view.js',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // cache: 'reload' forces every request past the HTTP cache. See rule 3.
      return Promise.all(
        SHELL.map(function (url) {
          var request = new Request(url, { cache: 'reload' });
          return fetch(request).then(function (response) {
            if (!response || !response.ok) {
              throw new Error('Could not cache ' + url);
            }
            return cache.put(url, response);
          });
        })
      );
    })
  );
  // Take over as soon as the new shell is cached. See rule 2 above.
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.map(function (name) {
          return name === CACHE_NAME ? null : caches.delete(name);
        })
      );
    }).then(function () {
      // Control the open page immediately so it is not left half on the old
      // generation; the page reloads itself once when this lands.
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  // Apps Script calls must always hit the network, never a cache.
  if (url.origin !== self.location.origin) return;

  // Navigations come from the cache like everything else, so the markup and
  // the modules are always the same generation. A new deploy arrives when the
  // worker updates, not halfway through a page load.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(function (cached) {
        return cached || fetch(request);
      })
    );
    return;
  }

  // Static assets: cache first. The version bump is what invalidates them.
  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;

      return fetch(request).then(function (response) {
        if (response && response.ok && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      });
    })
  );
});
