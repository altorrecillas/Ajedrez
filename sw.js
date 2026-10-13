/* Service worker: cachea el shell de la app para que funcione offline (PWA). */
var CACHE_NAME = 'ajedrez-v2';
var ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/engine.js',
  './js/ai.js',
  './js/ai-worker.js',
  './js/opening-book.js',
  './js/stockfish-bridge.js',
  './js/vendor/stockfish/stockfish-19-lite-single.js',
  './js/vendor/stockfish/stockfish-19-lite-single.wasm',
  './js/pieces.js',
  './js/app.js',
  './js/lessons-data.js',
  './js/puzzle-trainer.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(ASSETS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        if (response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        }
        return response;
      }).catch(function () { return cached; });
    })
  );
});
