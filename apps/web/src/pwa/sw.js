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
  // big immutable assets (models/textures/audio/icons/fonts/hashed bundles): cache-first
  if (/\/assets\/(models|textures|audio|icons)\//.test(url.pathname) || /\.(woff2?|js|css)$/.test(url.pathname)) {
    e.respondWith(
      caches.open(url.pathname.includes('/assets/') && !/\.(js|css)$/.test(url.pathname) ? ASSETS : SHELL).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
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
