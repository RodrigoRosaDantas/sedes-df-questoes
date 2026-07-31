const CACHE_VERSION = "sedes-questoes-v2-12";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/styles.css?v=2",
  "./assets/dashboard.css?v=1",
  "./assets/quality-v2-3.css?v=1",
  "./assets/true-false.css?v=1",
  "./assets/question-images-v2-5.css?v=1",
  "./assets/study-navigation-v2-6.css?v=1",
  "./assets/intelligence-v2-9.css?v=1",
  "./assets/reports-v2-10.css?v=2",
  "./assets/progress-migration-v2-3.js?v=1",
  "./assets/question-images-v2-5.js?v=1",
  "./assets/app-v4.js?v=7",
  "./assets/learning-v2-9.js?v=1",
  "./assets/pwa-v2-9.js?v=1",
  "./assets/reports-v2-10.js?v=2",
  "./data/concurso.json",
  "./data/release/catalogo.json",
  "./data/release/study-index.json",
  "./data/release/build-info.json"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  const networkFirst = /\/data\/(release\/(catalogo|study-index|build-info)|concurso)\.json$/.test(url.pathname);
  if (networkFirst) {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && (/\/assets\//.test(url.pathname) || /\/data\/release\/materials\//.test(url.pathname))) {
      const copy = response.clone();
      caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
    }
    return response;
  })));
});
