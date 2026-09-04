const CACHE_VERSION = "sedes-questoes-v2-13-0-r7";
const INDEX_URL = new URL("./index.html", self.location.href).toString();
const STUDY_BY_ROLE_URL = new URL("./estudo-por-cargo.html", self.location.href).toString();
const SHELL = [
  "./", "./index.html", "./estudo-por-cargo.html", "./manifest.webmanifest", "./assets/styles.css?v=2", "./assets/dashboard.css?v=1", "./assets/quality-v2-3.css?v=1", "./assets/true-false.css?v=2", "./assets/question-images-v2-5.css?v=1", "./assets/study-navigation-v2-6.css?v=1", "./assets/intelligence-v2-9.css?v=1", "./assets/reports-v2-10.css?v=2", "./assets/material-downloads-v1.css?v=1", "./assets/platform-v2-13.css?v=1", "./assets/discursive-display-v2-13.css?v=1", "./assets/ux-v2-14.css?v=1", "./assets/navigation-v2-15.css?v=1", "./assets/navigation-v2-15-polish.css?v=1", "./assets/home-study-today-v2-16.css?v=1", "./assets/home-study-subjects-v2-17.css?v=7", "./assets/resolver-context-v2-19.css?v=1", "./assets/resolver-stability-v2-23.css?v=1", "./assets/cloud-progress-v1.css?v=1", "./assets/work-convergence-v1.css?v=1", "./assets/work-command-center-v1.css?v=1", "./assets/estudo-por-cargo-v1.css?v=1", "./assets/progress-migration-v2-3.js?v=1", "./assets/question-images-v2-5.js?v=1", "./assets/app-v4.js?v=13", "./assets/discursive-display-v2-13.js?v=1", "./assets/learning-v2-9.js?v=1", "./assets/pwa-v2-9.js?v=1", "./assets/reports-v2-10.js?v=2", "./assets/material-downloads-v1.js?v=1", "./assets/shared-v2-13.js?v=1", "./assets/release-v2-13.js?v=1", "./assets/vault-v2-13.js?v=1", "./assets/report-v2-13.js?v=2", "./assets/official-exam-v2-13.js?v=1", "./assets/adaptive-review-v2-13.js?v=1", "./assets/ux-v2-14.js?v=1", "./assets/ux-v2-14-guardrails.js?v=1", "./assets/navigation-v2-15.js?v=1", "./assets/navigation-v2-15-polish.js?v=1", "./assets/home-study-edital-v2-18.js?v=1", "./assets/home-study-today-v2-16.js?v=5", "./assets/home-study-subjects-v2-17-stable.js?v=7", "./assets/resolver-context-v2-19.js?v=2", "./assets/theme-preference-bridge-v1.js?v=1", "./assets/cloud-progress-v1.js?v=1", "./assets/performance-reset-v1.js?v=1", "./assets/work-convergence-v1.js?v=1", "./assets/question-report-queue-v2.js?v=1", "./assets/pdf-fidelity-v2.js?v=1", "./assets/work-command-center-v1.js?v=1", "./assets/estudo-por-cargo-v1.js?v=1", "./assets/product-integrity-v1.js?v=1", "./data/concurso.json", "./data/release/question-format-index.json", "./data/release/question-search-index.json", "./data/release/content-model-v1.json", "./data/release/catalogo.json", "./data/release/study-index.json", "./data/release/edital-map-v1.json", "./data/release/build-info.json", "./data/release/release-meta.json"
];
async function putSuccessful(cacheKey, response) { if (!response?.ok) return response; const cache = await caches.open(CACHE_VERSION); await cache.put(cacheKey, response.clone()); return response; }
async function networkFirst(request, {cacheKey = request, fallback = cacheKey, noStore = false} = {}) { try { const response = await fetch(request, noStore ? {cache: "no-store"} : undefined); return putSuccessful(cacheKey, response); } catch (error) { const cached = await caches.match(fallback); if (cached) return cached; throw error; } }
function canonicalMutableDataUrl(url) { return new URL(url.pathname, self.location.origin).toString(); }
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("message", event => { if (event.data?.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === "navigate";
  const isStudyByRoleNavigation = isNavigation && /\/estudo-por-cargo\.html$/.test(url.pathname);
  const isMutableData = /\/data\/(release\/(catalogo|study-index|question-search-index|question-format-index|content-model-v1|edital-map-v1|build-info|release-meta)|concurso)\.json$/.test(url.pathname);
  const isVersionedApplicationAsset = /\/assets\//.test(url.pathname);
  const isMaterial = /\/data\/release\/materials\//.test(url.pathname);
  if (isStudyByRoleNavigation) { event.respondWith(networkFirst(event.request, {cacheKey: STUDY_BY_ROLE_URL, fallback: STUDY_BY_ROLE_URL, noStore: true})); return; }
  if (isNavigation) { event.respondWith(networkFirst(event.request, {cacheKey: INDEX_URL, fallback: INDEX_URL, noStore: true})); return; }
  if (isMutableData) {
    const canonicalKey = canonicalMutableDataUrl(url);
    event.respondWith(networkFirst(event.request, {cacheKey: canonicalKey, fallback: canonicalKey, noStore: true}));
    return;
  }
  if (isVersionedApplicationAsset || isMaterial) { event.respondWith(networkFirst(event.request, {noStore: true})); return; }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => putSuccessful(event.request, response))));
});
