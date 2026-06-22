const CACHE = 'shiba-v1';
const ASSETS = [
  './', './index.html', './style.css',
  './src/main.js', './src/ui.js', './src/game-rules.js', './src/ai.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
