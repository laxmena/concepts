// Network first for same-origin GETs, so a deploy shows up on the next load. The cache is only the offline fallback.
// `no-cache` makes the browser ask the server whether the file changed (a cheap 304) instead of trusting GitHub Pages' 10 minute max-age.
const CACHE = 'concepts-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const cached = await cache.match(req);
      if (cached) return cached;
      throw err;
    }
  }));
});
