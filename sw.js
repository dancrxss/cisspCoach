// Service worker: precache the app shell + bundled content, cache-first.
// The content manifest is network-first so new packs are noticed.
// Bump CACHE_VERSION in the same commit as any change to cached assets.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `cisspcoach-${CACHE_VERSION}`;
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css', './icons/icon.svg',
  './js/util.js', './js/db.js', './js/content.js', './js/fsrs.js', './js/engine.js', './js/session.js', './js/export.js', './js/ui.js',
  './js/screens/coach.js', './js/screens/drill.js', './js/screens/domain.js', './js/screens/cards.js', './js/screens/cardplay.js',
  './js/screens/mock.js', './js/screens/mockrun.js', './js/screens/play.js', './js/screens/progress.js', './js/screens/settings.js',
  './content/domains.json', './content/packs/manifest.json', './content/packs/pack-000-base.json',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  const networkFirst = url.pathname.endsWith('/content/packs/manifest.json') || /\/content\/packs\/pack-.*\.json$/.test(url.pathname);
  if (networkFirst) {
    e.respondWith(fetch(e.request).then((res) => { if (res.ok) caches.open(CACHE_NAME).then((c) => c.put(e.request, res.clone())); return res; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((cached) => cached || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
