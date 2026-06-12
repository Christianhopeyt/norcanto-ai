const CACHE = 'norcanto-shell-v1';
const SHELL = [
  '/', '/index.html', '/pages/app.html', '/pages/analysis.html', '/pages/signin.html',
  '/css/design-system.css', '/css/nav.css', '/css/app.css', '/css/landing.css',
  '/js/app-shell.js', '/js/auth.js', '/js/main.js', '/assets/norcanto_logo.png', '/assets/icon-192.png', '/assets/icon-512.png',
  '/offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/offline.html'))));
});
