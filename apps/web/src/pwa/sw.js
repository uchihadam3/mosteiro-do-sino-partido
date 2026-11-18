/* Mosteiro do Sino Partido — service worker. Build: __BUILD_ID__ */
const VERSION = '__BUILD_ID__';
const SHELL = `mosteiro-shell-${VERSION}`;
const ASSETS = 'mosteiro-assets-v1';
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).catch(() => undefined));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('mosteiro-shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // hashed bundles (js/css/fonts): immutable → cache-first in the per-build shell cache
  if (/\.(woff2?|js|css)$/.test(url.pathname) && !/\/assets\/(models|textures|audio|icons|characters)\//.test(url.pathname)) {
    e.respondWith(
      caches.open(SHELL).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
  // big game assets (not content-hashed): stale-while-revalidate — instant & offline from cache,
  // refreshed in the background so an update to a model/sound reaches installed players on the next launch.
  if (/\/assets\/(models|textures|audio|icons|characters)\//.test(url.pathname)) {
    e.respondWith(
      caches.open(ASSETS).then(async (c) => {
        const hit = await c.match(req);
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok) c.put(req, res.clone());
            return res;
          })
          .catch(() => undefined);
        if (hit) {
          e.waitUntil(refresh);
          return hit;
        }
        const res = await refresh;
        return res || Response.error();
      }),
    );
    return;
  }
  // navigation & version: network-first, fall back to cache (offline play)
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))),
  );
});
