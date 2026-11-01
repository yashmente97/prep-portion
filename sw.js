// Network first for the app's own files, so new versions arrive as soon as you're online;
// cached copies keep the app working offline.
const CACHE = 'pp-2026.11.01-2030';
const SHELL = ['./', 'index.html', 'app.js', 'db.js', 'style.css', 'firebase-config.js', 'library.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))));
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  const save = (r) => { if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; };
  if (u.origin === location.origin) {
    if (u.pathname.endsWith('version.json')) return;
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(save).catch(() =>
      caches.match(req, { ignoreSearch: true }).then((m) => m || caches.match('index.html'))));
  } else if (u.hostname === 'www.gstatic.com' || u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(req).then((m) => m || fetch(req).then(save)));
  }
});
