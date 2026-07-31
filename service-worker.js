const CACHE_VERSION = "sedes-questoes-v2-12-3";
const INDEX_URL = new URL("./index.html", self.location.href).toString();
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

async function putSuccessful(cacheKey, response) {
  if (!response?.ok) return response;
  const cache = await caches.open(CACHE_VERSION);
  await cache.put(cacheKey, response.clone());
  return response;
}

async function networkFirst(request, {cacheKey = request, fallback = cacheKey, noStore = false} = {}) {
  try {
    const response = await fetch(request, noStore ? {cache: "no-store"} : undefined);
    return putSuccessful(cacheKey, response);
  } catch (error) {
    const cached = await caches.match(fallback);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === "navigate";
  const isMutableData = /\/data\/(release\/(catalogo|study-index|build-info)|concurso)\.json$/.test(url.pathname);
  const isVersionedApplicationAsset = /\/assets\//.test(url.pathname);
  const isMaterial = /\/data\/release\/materials\//.test(url.pathname);

  if (isNavigation) {
    event.respondWith(networkFirst(event.request, {cacheKey: INDEX_URL, fallback: INDEX_URL, noStore: true}));
    return;
  }

  if (isMutableData || isVersionedApplicationAsset || isMaterial) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => putSuccessful(event.request, response)))
  );
});
