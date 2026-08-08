import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const required = [
  "index.html",
  "service-worker.js",
  "manifest.webmanifest",
  "assets/app-v4.js",
  "assets/pwa-v2-9.js",
  "assets/learning-v2-9.js",
  "assets/reports-v2-10.js",
  "assets/reports-v2-10.css",
  "assets/material-downloads-v1.js",
  "assets/material-downloads-v1.css",
  "assets/ux-v2-14.js",
  "assets/ux-v2-14-guardrails.js",
  "assets/ux-v2-14.css",
  "assets/navigation-v2-15.js",
  "assets/navigation-v2-15.css",
  "assets/navigation-v2-15-polish.js",
  "assets/navigation-v2-15-polish.css",
  "data/release/catalogo.json",
  "data/release/study-index.json",
  "data/release/build-info.json",
  "data/release/release-meta.json",
];

for (const entry of required) {
  if (!fs.existsSync(path.join(dist, entry))) throw new Error(`Arquivo ausente no dist: ${entry}`);
}

const index = fs.readFileSync(path.join(dist, "index.html"), "utf8");
for (const reference of [
  "reports-v2-10.css?v=2",
  "reports-v2-10.js?v=2",
  "material-downloads-v1.css?v=1",
  "material-downloads-v1.js?v=1",
  "app-v4.js?v=13",
  "learning-v2-9.js?v=1",
  "pwa-v2-9.js?v=1",
  "ux-v2-14.css?v=1",
  "ux-v2-14.js?v=1",
  "ux-v2-14-guardrails.js?v=1",
  "navigation-v2-15.css?v=1",
  "navigation-v2-15-polish.css?v=1",
  "navigation-v2-15.js?v=1",
  "navigation-v2-15-polish.js?v=1",
]) {
  if (!index.includes(reference)) throw new Error(`Referência ausente no HTML: ${reference}`);
}

const packageData = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const versionToken = String(packageData.version || "").replace(/\./g, "-");
if (!/^\d+-\d+-\d+$/.test(versionToken)) throw new Error(`Versão inválida no package.json: ${packageData.version || "ausente"}.`);
const expectedBuilder = `copy-public-v${versionToken}`;
const expectedCacheVersion = `sedes-questoes-v${versionToken}-r5`;

const catalog = JSON.parse(fs.readFileSync(path.join(dist, "data/release/catalogo.json"), "utf8"));
const buildInfo = JSON.parse(fs.readFileSync(path.join(dist, "data/release/build-info.json"), "utf8"));
const releaseMeta = JSON.parse(fs.readFileSync(path.join(dist, "data/release/release-meta.json"), "utf8"));
const materialFiles = fs.readdirSync(path.join(dist, "data/release/materials")).filter(file => file.endsWith(".json")).length;
const questionCount = Object.keys(catalog.question_index || {}).length;
const materialCount = (catalog.materials || []).length;

if (buildInfo.version !== packageData.version) throw new Error("Versão do build-info diverge do package.json.");
if (buildInfo.builder !== expectedBuilder) throw new Error(`Builder divergente: ${buildInfo.builder || "ausente"}; esperado ${expectedBuilder}.`);
if (buildInfo.cache_version !== expectedCacheVersion) throw new Error(`Cache divergente: ${buildInfo.cache_version || "ausente"}; esperado ${expectedCacheVersion}.`);
if (releaseMeta.app_version !== packageData.version || releaseMeta.builder !== expectedBuilder || releaseMeta.cache_version !== expectedCacheVersion) throw new Error("Release-meta diverge da proveniência esperada.");
const canonicalHashes = [
  "index_html", "app_js", "service_worker_js", "learning_js", "pwa_js", "material_downloads_js", "material_downloads_css",
  "platform_shared_js", "platform_release_js", "platform_vault_js", "platform_report_js", "platform_official_exam_js", "platform_adaptive_review_js", "platform_css",
  "platform_ux_js", "platform_ux_guardrails_js", "platform_ux_css",
  "platform_navigation_js", "platform_navigation_css", "platform_navigation_polish_js", "platform_navigation_polish_css",
];
for (const key of canonicalHashes) {
  if (!buildInfo.source_files_sha256?.[key] || !releaseMeta.source_files_sha256?.[key]) throw new Error(`Hash de fonte canônica ausente: ${key}.`);
  if (buildInfo.source_files_sha256[key] !== releaseMeta.source_files_sha256[key]) throw new Error(`Hash divergente entre build-info e release-meta: ${key}.`);
}
if ("generated_at" in buildInfo || "generated_at" in releaseMeta) throw new Error("Metadados contêm horário variável.");
if (buildInfo.data_release_version !== (catalog.release_version || null)) throw new Error("Versão da base diverge do catálogo publicado.");
if (buildInfo.catalog_schema_version !== (catalog.schema_version || null)) throw new Error("Schema da base diverge do catálogo publicado.");
if (buildInfo.questions !== questionCount || buildInfo.materials !== materialCount || buildInfo.material_files !== materialFiles) throw new Error("Proveniência do pacote diverge do catálogo publicado.");
if (releaseMeta.questions !== questionCount || releaseMeta.materials !== materialCount) throw new Error("Release-meta diverge do catálogo publicado.");
if (questionCount !== Number(catalog.summary?.questoes) || materialCount !== Number(catalog.summary?.materiais)) throw new Error("Resumo do catálogo diverge dos dados reais.");

const learning = fs.readFileSync(path.join(dist, "assets/learning-v2-9.js"), "utf8");
for (const marker of ["cleanHomeLayerEnabled", 'script[src*="navigation-v2-15.js"]', "if (cleanHomeLayerEnabled()) return;"]) {
  if (!learning.includes(marker)) throw new Error(`Compatibilidade da Home limpa ausente: ${marker}`);
}

const reports = fs.readFileSync(path.join(dist, "assets/reports-v2-10.js"), "utf8");
for (const marker of ["data-progress-reports", "schema_version: \"2.10\"", "America/Sao_Paulo", "restoreBackupTransaction", "Motivos classificados no período", "Questões por mês", "Exportar relatório CSV"]) {
  if (!reports.includes(marker)) throw new Error(`Recurso auditado ausente: ${marker}`);
}

const downloads = fs.readFileSync(path.join(dist, "assets/material-downloads-v1.js"), "utf8");
for (const marker of ["data-material-download-card", "PDF para responder", "PDF comentado", "printableDocument"]) {
  if (!downloads.includes(marker)) throw new Error(`Download de materiais ausente: ${marker}`);
}

const worker = fs.readFileSync(path.join(dist, "service-worker.js"), "utf8");
for (const marker of [
  expectedCacheVersion,
  "app-v4.js?v=13",
  "learning-v2-9.js?v=1",
  "pwa-v2-9.js?v=1",
  "reports-v2-10.js?v=2",
  "material-downloads-v1.js?v=1",
  "material-downloads-v1.css?v=1",
  "ux-v2-14.js?v=1",
  "ux-v2-14-guardrails.js?v=1",
  "navigation-v2-15.js?v=1",
  "navigation-v2-15-polish.js?v=1",
  "question-search-index",
  "build-info.json",
  'event.request.mode === "navigate"',
  'cache: "no-store"',
]) {
  if (!worker.includes(marker)) throw new Error(`Service worker sem marcador obrigatório: ${marker}`);
}

const pwa = fs.readFileSync(path.join(dist, "assets/pwa-v2-9.js"), "utf8");
for (const marker of ['updateViaCache: "none"', "controllerchange", "registration.update()"]) {
  if (!pwa.includes(marker)) throw new Error(`Registro PWA sem marcador obrigatório: ${marker}`);
}

for (const forbidden of ["scripts", ".github", "data/consolidated", "data/true-false", "data/notion"]) {
  if (fs.existsSync(path.join(dist, forbidden))) throw new Error(`Conteúdo privado exposto no dist: ${forbidden}`);
}

console.log(`✓ Dist ${packageData.version} validado: cache ${expectedCacheVersion}, ${questionCount} questões, ${materialCount} materiais, UX v2.15, PWA e proveniência canônica completa.`);
