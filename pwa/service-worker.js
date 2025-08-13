/* Dyslexia-Friendly Reader — Service Worker
   Robust PWA caching with safe precache, navigation fallback, and strategy tuning.
   Built: 2025-08-13

   Notes:
   - Pre-caches the core app shell (index, css, js, manifest, epub vendor, fonts).
   - Uses Network-First for HTML navigations (so updates appear quickly).
   - Uses Stale-While-Revalidate for CSS/JS/vendor files.
   - Uses Cache-First for font files (.woff2).
   - Leaves cross-origin requests (e.g., dictionary API) to the network.
   - Ignores files that aren't present during install — install won't fail if a file is missing.
*/

const CACHE_VERSION = 'v20250813-1';
const CACHE_PREFIX  = 'dfr-cache-';
const CACHE_NAME    = CACHE_PREFIX + CACHE_VERSION;

// Core files you ship with the app. Keep this list lean; runtime caching will catch others.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './reader.css',
  './reader.js',
  './vendor/epub/epub.min.js',

  // Fonts (optional but helpful for offline)
  './fonts/OpenDyslexic-Regular.woff2',
  './fonts/OpenDyslexic-Bold.woff2',
  './fonts/OpenDyslexic-Italic.woff2',
  './fonts/OpenDyslexic-BoldItalic.woff2',
];

// ---- Helpers ----
async function safePrecacheAll(cache, urls) {
  const results = await Promise.allSettled(
    urls.map(async (u) => {
      try {
        // Cache each file individually; if one fails, we continue.
        const req = new Request(u, { cache: 'no-store' });
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) {
          await cache.put(req, res.clone());
        }
      } catch (e) {
        // Swallow errors; we'll rely on runtime caching later.
      }
    })
  );
  return results;
}

function isSameOrigin(request) {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch { return false; }
}

function isFontRequest(request) {
  return /\.(?:woff2)(\?|$)/i.test(new URL(request.url).pathname);
}

function isScriptOrStyle(request) {
  const p = new URL(request.url).pathname;
  return /\.(?:js|css)(\?|$)/i.test(p) || p.includes('/vendor/');
}

// ---- Install ----
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await safePrecacheAll(cache, APP_SHELL);
    await self.skipWaiting();
  })());
});

// ---- Activate ----
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Cleanup old versions
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );

    // Enable navigation preload for faster navigations when supported
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch { /* ignore */ }
    }
    await self.clients.claim();
  })());
});

// ---- Fetch strategies ----
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle same-origin GET requests; let the browser handle others.
  if (req.method !== 'GET') return;

  // For top-level navigations: network-first with offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);

      // Try the navigation preload response first
      try {
        const preload = await event.preloadResponse;
        if (preload) {
          // Update cached index for offline later
          cache.put('./index.html', preload.clone()).catch(() => {});
          return preload;
        }
      } catch { /* ignore */ }

      // Network first
      try {
        const network = await fetch(req);
        // Optionally update cached index
        if (isSameOrigin(req)) {
          cache.put('./index.html', network.clone()).catch(() => {});
        }
        return network;
      } catch (err) {
        // Offline fallback to cached index.html
        const offline = await cache.match('./index.html') || await cache.match('/index.html') || await cache.match('./');
        return offline || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Same-origin: choose strategy by asset type
  if (isSameOrigin(req)) {
    const url = new URL(req.url);

    // Fonts: Cache-First
    if (isFontRequest(req)) {
      event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch (err) {
          return cached || new Response('Offline font', { status: 503 });
        }
      })());
      return;
    }

    // Scripts & Styles (incl. vendor): Stale-While-Revalidate
    if (isScriptOrStyle(req)) {
      event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        const fetchPromise = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })());
      return;
    }

    // Everything else same-origin: Cache-First with network fallback
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
    return;
  }

  // Cross-origin (e.g., dictionary API): pass through to the network.
  // You can add a small runtime cache here if you want, but be mindful of CORS and staleness.
  // event.respondWith(fetch(req));
});
