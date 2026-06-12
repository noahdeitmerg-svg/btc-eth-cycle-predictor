/* Service Worker: App-Shell cache-first, Daten network-first (frisch wenn online, offline aus Cache). */
const SHELL = 'shell-v3';
const DATA = 'data-v1';
const SHELL_FILES = ['./', 'index.html', 'src/analytics.js', 'src/app.live.js', 'src/i18n.js', 'vendor/chart.umd.min.js', 'vendor/hammer.min.js', 'vendor/chartjs-plugin-zoom.min.js', 'vendor/chartjs-chart-financial.min.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/data/')) {
    e.respondWith(
      fetch(e.request).then(r => { const cp = r.clone(); caches.open(DATA).then(c => c.put(e.request, cp)); return r; })
        .catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
  }
});
