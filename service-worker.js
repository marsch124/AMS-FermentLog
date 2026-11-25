// service-worker.js — offline app shell caching.
// Bump CACHE when you change any of the cached files to force an update.
/* Named after the app version itself: app.js registers this file as
   service-worker.js?v=<APP_VERSION from js/changelog.js>, and that query rides
   along on this script's own URL — so the store can never carry a number of
   its own again. We only ever bin OUR older copies: the sibling AMS apps share
   this web address. */
const APP_V = (new URL(self.location.href).searchParams.get('v') || 'dev').replace(/^v/, '');
const PREFIX = 'fermentlog-v';
const CACHE = PREFIX + APP_V;
/* A FermentLog page from before 5.21 asks for this file WITHOUT ?v=, and it has no way to tell a new
   worker to take over. On the iPhone such a worker can wait for ever (found 25 Nov 2026: a Home Screen
   icon stuck on 5.17). So for those old pages we take over at once and reload them into the new app.
   Pages from 5.21 on always send ?v= and keep their "update ready" prompt. */
const OLD_PAGE = !new URL(self.location.href).searchParams.get('v');
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/model.js',
  './js/db.js',
  './js/charts.js',
  './js/changelog.js',
  './js/ai.js',
  './js/xlsx.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  // Don't auto-skip: a new version waits until the page tells it to activate,
  // so we can show an "update ready" prompt instead of swapping under the user.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => (OLD_PAGE ? self.skipWaiting() : undefined)));
});

// The page posts 'SKIP_WAITING' when the user taps "Refresh".
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
  /* Reload an old page into the new app — but NOT inside waitUntil. 5.25 waited here for the reload to
     finish, while the reload waited for this worker to finish starting: each waited for the other and the
     app froze. Now the worker finishes starting first, and only then asks the page to reload. */
  if (OLD_PAGE) {
    setTimeout(() => {
      self.clients.matchAll({ type: 'window' })
        .then((cs) => cs.forEach((c) => { c.navigate(c.url).catch(() => {}); }))
        .catch(() => {});
    }, 300);
  }
});

// Cache-first for our own assets; network fallback for everything else.
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  e.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      const copy = res.clone();
      if (res.ok && new URL(request.url).origin === location.origin) {
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
