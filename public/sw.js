const CACHE_NAME = 'fmc-comic-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
  // Abaikan request ke API agar data selalu fresh
  if (e.request.url.includes('/api/')) return;
  
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
