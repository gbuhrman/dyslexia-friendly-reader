/* service-worker.js — cache-first app shell (generated 2025-08-10T22:20:22.551904Z) */
const CACHE_VERSION = 'v1-1754864422';
const CACHE_NAME = 'dfr-cache-' + CACHE_VERSION;

const APP_SHELL = [
  "./",
  "./dyslexia-friendly-reader.html",
  "./reader.css",
  "./reader.js",
  "./catalog.json",
  "./books/PG0001.txt",
  "./books/PG0002.txt",
  "./fonts/OpenDyslexic-Regular.woff2",
  "./fonts/OpenDyslexic-Bold.woff2",
  "./fonts/OpenDyslexic-Italic.woff2"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k.startsWith('dfr-cache-') && k !== CACHE_NAME)
            .map((oldKey) => caches.delete(oldKey))
      )
    ).then(() => self.clients.claim())
  );
});

/* Cache-first for same-origin GET requests; falls back to network. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
