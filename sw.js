const VERSION = 'v5';
const CACHE = `shiba-${VERSION}`;
const ASSETS = [
  './', './index.html', './style.css', './manifest.json',
  './src/main.js', './src/ui.js', './src/game-rules.js', './src/ai.js', './src/effects.js',
  './img/hikoki.jpg', './img/hesoten.jpg', './img/kyohi.jpg',
  './img/kyomu.jpg', './img/shibakyori.jpg', './img/sukima.jpg',
  './img/drill.jpg', './img/zoomies.jpg', './img/kangeki.jpg',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Network-first: always try the network so updates land; fall back to cache offline.
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    } catch {
      const cached = await caches.match(req);
      return cached || Response.error();
    }
  })());
});
