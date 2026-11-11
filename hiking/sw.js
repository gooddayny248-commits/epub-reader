// 등산 지도 - 오프라인 캐시 (앱 파일 + 한 번 본 지도 타일)
const CACHE = 'hike-app-v1';
const TILES = 'hike-tiles-v1';
const MAX_TILES = 6000; // 대략 100~150MB. 넘으면 오래된 타일부터 지움
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './vendor/leaflet.js', './vendor/leaflet.css'];
const TILE_HOST = /(^|\.)(tile\.opentopomap\.org|tile\.openstreetmap\.org|server\.arcgisonline\.com|tile\.waymarkedtrails\.org)$/;
const noCors = new Set(); // CORS를 안 주는 타일 서버는 캐시하지 않고 그대로 통과
let puts = 0;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== TILES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trimTiles(c) {
  const keys = await c.keys();
  if (keys.length > MAX_TILES) await Promise.all(keys.slice(0, keys.length - MAX_TILES).map(k => c.delete(k)));
}

async function tile(req, url) {
  const c = await caches.open(TILES);
  const key = url.href;
  const hit = await c.match(key);
  if (hit) return hit;
  if (!noCors.has(url.hostname)) {
    try {
      const r = await fetch(key, { mode: 'cors', credentials: 'omit' });
      if (r.ok) {
        c.put(key, r.clone()).then(() => { if (++puts % 50 === 0) trimTiles(c); }).catch(() => {});
      }
      return r;
    } catch (err) {
      const r = await fetch(req); // 오프라인이면 여기서 실패 → CORS 문제로 오인하지 않음
      noCors.add(url.hostname);
      return r;
    }
  }
  return fetch(req);
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (TILE_HOST.test(url.hostname)) { e.respondWith(tile(e.request, url)); return; }
  if (url.origin !== self.location.origin) return; // 검색 등 외부 요청은 그대로
  e.respondWith((async () => {
    const hit = await caches.match(e.request, { ignoreSearch: true });
    if (hit) {
      fetch(e.request).then(r => { if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r)); }).catch(() => {});
      return hit;
    }
    try {
      const r = await fetch(e.request);
      if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
      return r;
    } catch (err) {
      if (e.request.mode === 'navigate') return caches.match('./index.html');
      throw err;
    }
  })());
});
