// 편한 EPUB 리더 - 오프라인 캐시 + 안드로이드 "공유하기"로 EPUB 받기
const CACHE = 'epub-reader-v2';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js'];
const EXTERNAL = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'share-inbox').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const f = fd.get('book');
        if (f) {
          const c = await caches.open('share-inbox');
          await c.put('shared-epub', new Response(f, { headers: { 'Content-Type': 'application/epub+zip', 'X-Name': encodeURIComponent(f.name || 'shared.epub') } }));
        }
      } catch (err) {}
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  const same = url.origin === self.location.origin;
  if (!same && !EXTERNAL.includes(url.hostname)) return;
  e.respondWith((async () => {
    const hit = await caches.match(e.request, { ignoreSearch: same });
    if (hit) {
      if (same) fetch(e.request).then(r => { if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r)); }).catch(() => {});
      return hit;
    }
    try {
      const r = await fetch(e.request);
      if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
      return r;
    } catch (err) {
      if (e.request.mode === 'navigate') return caches.match('./index.html');
      throw err;
    }
  })());
});
