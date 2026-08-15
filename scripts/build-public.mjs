import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const copy = (source, target = source) => {
  const sourcePath = path.join(root, source);
  if (!fs.existsSync(sourcePath)) throw new Error(`Arquivo obrigatório ausente: ${source}`);
  fs.cpSync(sourcePath, path.join(dist, target), {recursive: true});
};
const requireMarker = (content, marker, context) => {
  if (!content.includes(marker)) throw new Error(`${context}: marcador obrigatório ausente: ${marker}`);
};

const packageData = JSON.parse(read("package.json"));
const versionToken = String(packageData.version || "").replace(/\./g, "-");
if (!/^\d+-\d+-\d+$/.test(versionToken)) throw new Error(`Versão inválida no package.json: ${packageData.version || "ausente"}.`);
const expectedCacheVersion = `sedes-questoes-v${versionToken}-r6`;
const expectedBuilder = `copy-public-v${versionToken}`;

const canonicalFiles = {
  index_html: "index.html",
  app_js: "assets/app-v4.js",
  service_worker_js: "service-worker.js",
  learning_js: "assets/learning-v2-9.js",
  pwa_js: "assets/pwa-v2-9.js",
  material_downloads_js: "assets/material-downloads-v1.js",
  material_downloads_css: "assets/material-downloads-v1.css",
  platform_shared_js: "assets/shared-v2-13.js",
  platform_release_js: "assets/release-v2-13.js",
  platform_vault_js: "assets/vault-v2-13.js",
  platform_report_js: "assets/report-v2-13.js",
  platform_official_exam_js: "assets/official-exam-v2-13.js",
  platform_adaptive_review_js: "assets/adaptive-review-v2-13.js",
  platform_css: "assets/platform-v2-13.css",
  platform_ux_js: "assets/ux-v2-14.js",
  platform_ux_guardrails_js: "assets/ux-v2-14-guardrails.js",
  platform_ux_css: "assets/ux-v2-14.css",
  platform_navigation_js: "assets/navigation-v2-15.js",
  platform_navigation_css: "assets/navigation-v2-15.css",
  platform_navigation_polish_js: "assets/navigation-v2-15-polish.js",
  platform_navigation_polish_css: "assets/navigation-v2-15-polish.css",
};
const sources = Object.fromEntries(Object.entries(canonicalFiles).map(([key, file]) => [key, read(file)]));

for (const marker of ["manifest.webmanifest", "study-navigation-v2-6.css?v=1", "intelligence-v2-9.css?v=1", "reports-v2-10.css?v=2", "material-downloads-v1.css?v=1", "platform-v2-13.css?v=1", "ux-v2-14.css?v=1", "navigation-v2-15.css?v=1", "navigation-v2-15-polish.css?v=1", "cloud-progress-v1.css?v=1", "work-convergence-v1.css?v=1", "app-v4.js?v=13", "learning-v2-9.js?v=1", "pwa-v2-9.js?v=1", "reports-v2-10.js?v=2", "material-downloads-v1.js?v=1", "release-v2-13.js?v=1", "vault-v2-13.js?v=1", "report-v2-13.js?v=2", "official-exam-v2-13.js?v=1", "adaptive-review-v2-13.js?v=1", "ux-v2-14.js?v=1", "ux-v2-14-guardrails.js?v=1", "navigation-v2-15.js?v=1", "navigation-v2-15-polish.js?v=1", "cloud-progress-v1.js?v=1", "work-convergence-v1.js?v=1", "work-command-center-v1.js?v=1"]) requireMarker(sources.index_html, marker, "HTML canônico");
for (const marker of ['const STUDY_INDEX_URL = "./data/release/study-index.json?release=3048-3046-71-r5";', "const indexedQuestions = Object.keys(state.catalog?.question_index || {}).length;", 'data-study-view="materias"', 'data-study-view="simulados"', 'data-study-view="provas"', "function renderDisciplineTopics()", "Catálogo inconsistente."]) requireMarker(sources.app_js, marker, "Aplicação canônica");
for (const marker of ["cleanHomeLayerEnabled", 'script[src*="navigation-v2-15.js"]', "if (cleanHomeLayerEnabled()) return;"]) requireMarker(sources.learning_js, marker, "Inteligência v2.9");
for (const marker of [expectedCacheVersion, 'event.request.mode === "navigate"', 'cache: "no-store"', 'type === "SKIP_WAITING"', "learning-v2-9.js?v=1", "shared-v2-13.js?v=1", "release-v2-13.js?v=1", "vault-v2-13.js?v=1", "report-v2-13.js?v=2", "official-exam-v2-13.js?v=1", "adaptive-review-v2-13.js?v=1", "platform-v2-13.css?v=1", "ux-v2-14.js?v=1", "ux-v2-14-guardrails.js?v=1", "ux-v2-14.css?v=1", "navigation-v2-15.js?v=1", "navigation-v2-15.css?v=1", "navigation-v2-15-polish.js?v=1", "navigation-v2-15-polish.css?v=1", "cloud-progress-v1.js?v=1", "work-convergence-v1.js?v=1", "work-convergence-v1.css?v=1", "question-search-index", "content-model-v1", "release-meta"]) requireMarker(sources.service_worker_js, marker, "Service worker canônico");
for (const marker of ['updateViaCache: "none"', "controllerchange", "registration.update()"]) requireMarker(sources.pwa_js, marker, "Registro PWA canônico");
for (const marker of ["data-material-download-card", "PDF para responder", "PDF comentado", "printableDocument"]) requireMarker(sources.material_downloads_js, marker, "Download de materiais canônico");
for (const marker of ["material-download-card", "material-download-actions"]) requireMarker(sources.material_downloads_css, marker, "Estilos de download canônicos");
for (const marker of ["release-meta.json", "createCompatibleSession", "let scheduled = false"]) requireMarker(sources.platform_shared_js, marker, "Base das melhorias");
for (const marker of ["enhanceReleaseMetadata", "data-release-footer", "#sync-label", "state.release.app_version"]) requireMarker(sources.platform_release_js, marker, "Metadados da release");
for (const marker of ["sedes-protected-backup", "PBKDF2", "vault-tools"]) requireMarker(sources.platform_vault_js, marker, "Proteção do progresso");
for (const marker of ["Reportar problema nesta questão", "questionReports.v1", "Enviar relato para revisão"]) requireMarker(sources.platform_report_js, marker, "Reporte interno por questão");
if (sources.platform_report_js.includes("issues/new")) throw new Error("Reporte canônico voltou a depender de GitHub Issue.");
for (const marker of ["Prova Real SEDES/DF 2026", "generalIds", "specificIds", "240"]) requireMarker(sources.platform_official_exam_js, marker, "Prova real");
for (const marker of ["Revisão adaptativa", "mastery", "averageSeconds"]) requireMarker(sources.platform_adaptive_review_js, marker, "Revisão adaptativa");
for (const marker of ["official-exam-card", "vault-tools", "platform-dialog-backdrop", "adaptive-review"]) requireMarker(sources.platform_css, marker, "Estilos da plataforma");
for (const marker of ["Estudo de hoje", "Busca inteligente", "Mapa de domínio por matéria", "Por que você errou?"]) requireMarker(sources.platform_ux_js, marker, "Experiência de estudo v2.14");
for (const marker of ["closeAfterConsecutiveCorrect: 3", "correctedFilteredIds", "data-ux-run-filter"]) requireMarker(sources.platform_ux_guardrails_js, marker, "Guardrails da experiência v2.14");
for (const marker of ["ux-focus-mode", "ux-today", "ux-mastery-grid", "ux-error-reasons"]) requireMarker(sources.platform_ux_css, marker, "Estilos da experiência v2.14");
for (const marker of ["Seu estudo, sem ruído.", "Última sincronização do catálogo", "#/perfil/configuracoes", "America/Sao_Paulo", "Dados do projeto", "setNodeText"]) requireMarker(sources.platform_navigation_js, marker, "Navegação e Home v2.15");
for (const marker of ["ux15-home-active", "ux15-settings-page", "ux15-facts-grid", "ux15-sync-card"]) requireMarker(sources.platform_navigation_css, marker, "Estilos da navegação v2.15");
for (const marker of ["relativeSync", "ux15-breadcrumb", 'aria-current="page"', "aria-controls", "tabpanel", 'event.key === "/"', "sincronizado há", "enhanceSearchResultActions", "data-ux15-open-question", "moveSettingsTabFocus"]) requireMarker(sources.platform_navigation_polish_js, marker, "Polimento da navegação v2.15");
for (const marker of ["ux15-sync-age", "ux15-breadcrumb", "data-ux15-open-question", ".brand strong{display:none}", "attention", "stale"]) requireMarker(sources.platform_navigation_polish_css, marker, "Estilos do polimento v2.15");
if (sources.app_js.includes("Release incompleta.")) throw new Error("A fonte canônica ainda contém a trava antiga de totais fixos.");

fs.rmSync(dist, {recursive: true, force: true});
fs.mkdirSync(dist, {recursive: true});
copy("index.html"); copy("manifest.webmanifest"); copy("service-worker.js"); copy("assets"); copy("data/concurso.json"); copy("data/release");
fs.writeFileSync(path.join(dist, ".nojekyll"), "");
for (const forbidden of ["scripts", ".github", "data/consolidated", "data/true-false"]) if (fs.existsSync(path.join(dist, forbidden))) throw new Error(`Conteúdo de desenvolvimento exposto no dist: ${forbidden}`);
for (const [key, relative] of Object.entries(canonicalFiles)) if (fs.readFileSync(path.join(dist, relative), "utf8") !== sources[key]) throw new Error(`O pacote público diverge da fonte canônica: ${relative}.`);

const catalog = JSON.parse(fs.readFileSync(path.join(dist, "data/release/catalogo.json"), "utf8"));
const materialCount = Array.isArray(catalog.materials) ? catalog.materials.length : 0;
const questionCount = Object.keys(catalog.question_index || {}).length;
const materialDir = path.join(dist, "data/release/materials");
const materialFiles = fs.existsSync(materialDir) ? fs.readdirSync(materialDir).filter(file => file.endsWith(".json")).length : 0;
const proofCount = (catalog.materials || []).filter(item => String(item.tipo_material || "").toLowerCase() === "prova").length;
const simulationCount = materialCount - proofCount;
if (!materialCount || !questionCount) throw new Error("Dist gerado sem materiais ou questões.");
if (Number(catalog.summary?.questoes) !== questionCount) throw new Error(`Catálogo divergente: summary.questoes=${catalog.summary?.questoes}, índice=${questionCount}.`);
if (Number(catalog.summary?.materiais) !== materialCount) throw new Error(`Catálogo divergente: summary.materiais=${catalog.summary?.materiais}, lista=${materialCount}.`);
if (materialFiles !== materialCount) throw new Error(`Arquivos de material divergentes: ${materialFiles} arquivos para ${materialCount} materiais.`);

let activeBancoMestre = Number(catalog.summary?.banco_mestre || questionCount);
const cleanupReceiptPath = path.join(root, "data/editorial/notion-trash-classified-20260804-execution-receipt.json");
if (fs.existsSync(cleanupReceiptPath)) {
  const cleanupReceipt = JSON.parse(fs.readFileSync(cleanupReceiptPath, "utf8"));
  const cleanupFinishedAt = Date.parse(cleanupReceipt.finished_at || "");
  const catalogExportedAt = Date.parse(catalog.exported_at || "");
  const cleanupIsNewer = Number.isFinite(cleanupFinishedAt)
    && (!Number.isFinite(catalogExportedAt) || cleanupFinishedAt > catalogExportedAt);
  if (cleanupIsNewer) {
    const reconciledActive = Number(cleanupReceipt.active_after);
    const completePublic = Number(cleanupReceipt.after_counts?.complete_public_records);
    const publicCatalog = Number(cleanupReceipt.after_counts?.public_catalog);
    if (cleanupReceipt.status !== "success"
      || Number(cleanupReceipt.target_count) !== 2088
      || Number(cleanupReceipt.remaining_active_count) !== 0
      || !Array.isArray(cleanupReceipt.failures)
      || cleanupReceipt.failures.length !== 0
      || completePublic !== publicCatalog
      || questionCount > completePublic
      || !Number.isInteger(reconciledActive)
      || reconciledActive < questionCount) {
      throw new Error("O recibo da limpeza do Notion não permite reconciliar o painel público com segurança.");
    }
    activeBancoMestre = reconciledActive;
  }
}
const awaitingAudit = Math.max(0, activeBancoMestre - questionCount);

const sourceHashes = Object.fromEntries(Object.entries(sources).map(([key, content]) => [key, sha256(content)]));
const sourceSha = process.env.GITHUB_SHA || "local";
const buildInfo = {version: packageData.version, data_release_version: catalog.release_version || null, catalog_schema_version: catalog.schema_version || null, source_sha: sourceSha, builder: expectedBuilder, cache_version: expectedCacheVersion, source_files_sha256: sourceHashes, questions: questionCount, materials: materialCount, material_files: materialFiles};
fs.writeFileSync(path.join(dist, "data/release/build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);
const releaseMeta = {schema_version: "1.0", app_version: packageData.version, data_release_version: catalog.release_version || null, catalog_schema_version: catalog.schema_version || null, source_sha: sourceSha, builder: expectedBuilder, cache_version: expectedCacheVersion, exported_at: catalog.exported_at || null, questions: questionCount, materials: materialCount, proofs: proofCount, simulations: simulationCount, banco_mestre: activeBancoMestre, awaiting_audit: awaitingAudit, source_files_sha256: sourceHashes, official_exam: {objective_questions: 60, general_questions: 20, general_weight: 1, specific_questions: 40, specific_weight: 2, total_points: 100, joint_duration_minutes: 240, general_minimum_points: 10, specific_minimum_points: 40, notice: "A duração de 4 horas é conjunta para as provas objetiva e discursiva.", source: "Edital SEDES/DF nº 1/2026, itens 11.1, 11.2, 11.3 e 12.4."}};
fs.writeFileSync(path.join(dist, "data/release/release-meta.json"), `${JSON.stringify(releaseMeta, null, 2)}\n`);
console.log(`✓ Build público canônico ${packageData.version}: cache ${expectedCacheVersion}, ${questionCount} questões, ${materialCount} materiais e release-meta unificado.`);