/*
 * 4Life offline support.
 * Keeps the app itself on the phone so Instant EMS (call buttons, hotlines,
 * the list of places, "send my location") still opens without internet.
 * AI replies, the Village and map tiles still need a connection.
 */
const CACHE = '4life-shell-v4';

/** Save the app page and every script and style it loads, so it opens offline from the first visit. */
async function saveShell() {
  const res = await fetch('/index.html', { cache: 'no-store' });
  if (!res.ok) return;
  const html = await res.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]);
  // Pages that load on demand (AI Therapy, Village, Settings…) are listed by the build
  try {
    const list = await fetch('/asset-list.json', { cache: 'no-store' });
    if (list.ok) for (const a of await list.json()) if (typeof a === 'string' && a.startsWith('/assets/') && !assets.includes(a)) assets.push(a);
  } catch {}
  // the home-screen icon and its shortcuts work offline too
  assets.push('/manifest.webmanifest', '/icons/icon-192.png');
  const cache = await caches.open(CACHE);
  await cache.put('/index.html', res);
  await cache.addAll(assets);
  // Drop files from older versions of the app
  const keep = new Set(assets.map(a => new URL(a, self.location.origin).href));
  for (const req of await cache.keys()) {
    if (new URL(req.url).pathname.startsWith('/assets/') && !keep.has(req.url)) await cache.delete(req);
  }
}

self.addEventListener('install', event => {
  event.waitUntil(saveShell().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Pages: try the network first so updates arrive, fall back to the saved app
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          // Only a real copy of the app replaces the saved one (not an error page)
          if (res.ok && res.type === 'basic' && (res.headers.get('content-type') || '').includes('text/html')) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put('/index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Built files have a content hash in their name, so a saved copy is always right
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        hit =>
          hit ||
          fetch(req).then(res => {
            if (res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE).then(c => c.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});
