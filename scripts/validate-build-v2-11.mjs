import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));
const fail = message => { throw new Error(message); };
const requireMarkers = (content, markers, context) => { for (const marker of markers) if (!content.includes(marker)) fail(`${context}: marcador obrigatório ausente: ${marker}`); };
const packageData = JSON.parse(read("package.json"));
if (packageData.version !== "2.13.0") fail(`Versão inesperada: ${packageData.version}`);
const versionToken = packageData.version.replace(/\./g, "-");
const expectedBuilder = `copy-public-v${versionToken}`;
const expectedCacheVersion = `sedes-questoes-v${versionToken}-r5`;
const buildCommand = String(packageData.scripts?.build || "");
for (const required of ["build-release-v2-4.mjs", "apply-notion-snapshot.mjs", "apply-gppgadm-site-correction.mjs", "build-study-index.mjs", "build-question-search-index.mjs", "build-public.mjs", "fixed-build-time.mjs"]) if (!buildCommand.includes(required)) fail(`Etapa obrigatória ausente no build: ${required}`);
if (buildCommand.indexOf("apply-notion-snapshot.mjs") > buildCommand.indexOf("build-study-index.mjs")) fail("O índice está sendo gerado antes da aplicação do snapshot.");
if (buildCommand.indexOf("apply-gppgadm-site-correction.mjs") < buildCommand.indexOf("apply-pedagogia-editorial-sync.mjs") || buildCommand.indexOf("apply-gppgadm-site-correction.mjs") > buildCommand.indexOf("build-study-index.mjs")) fail("A correção GPPGADM deve ocorrer após os saneamentos editoriais e antes do índice público.");
for (const legacy of ["patch-runtime-catalog", "patch-study-navigation", "patch-intelligence", "build-dist.mjs"]) if (buildCommand.includes(legacy)) fail(`Build ainda depende de ${legacy}.`);
for (const legacyFile of ["scripts/patch-runtime-catalog.mjs", "scripts/patch-study-navigation-v2-6.mjs", "scripts/patch-intelligence-v2-9.mjs", "scripts/build-dist.mjs", "scripts/fragments/study-navigation-v2-6.js.txt", "scripts/consolidate-source-once.mjs", ".github/workflows/consolidate-source-once.yml"]) if (exists(legacyFile)) fail(`Artefato temporário ou mutável ainda existe: ${legacyFile}`);
const checkCommand = String(packageData.scripts?.check || ""), testCommand = String(packageData.scripts?.test || "");
for (const marker of [
  "node --check assets/material-downloads-v1.js",
  "node --check assets/shared-v2-13.js",
  "node --check assets/release-v2-13.js",
  "node --check assets/vault-v2-13.js",
  "node --check assets/report-v2-13.js",
  "node --check assets/official-exam-v2-13.js",
  "node --check assets/adaptive-review-v2-13.js",
  "node --check assets/ux-v2-14.js",
  "node --check assets/ux-v2-14-guardrails.js",
  "node --check assets/navigation-v2-15.js",
  "node --check assets/navigation-v2-15-polish.js",
  "node --check scripts/validate-material-downloads.mjs",
  "node --check scripts/validate-platform-v2-13.mjs",
  "node --check scripts/validate-ux-v2-14.mjs",
  "node --check scripts/validate-navigation-v2-15.mjs",
]) if (!checkCommand.includes(marker)) fail(`Comando de auditoria sem cobertura: ${marker}`);
for (const validator of ["validate-material-downloads.mjs", "validate-platform-v2-13.mjs", "validate-ux-v2-14.mjs", "validate-navigation-v2-15.mjs"]) if (!testCommand.includes(validator)) fail(`Validador fora do npm test: ${validator}`);
const builder = read("scripts/build-public.mjs");
for (const forbidden of [".replace(\"Release incompleta", "staleGuard", "compileApplication", "compileIndex", "study-navigation-v2-6.js.txt"]) if (builder.includes(forbidden)) fail(`Build público ainda transforma fontes: ${forbidden}`);
requireMarkers(builder, [
  "expectedBuilder", "expectedCacheVersion", "service_worker_js", "pwa_js", "material_downloads_js", "material_downloads_css",
  "platform_shared_js", "platform_release_js", "platform_vault_js", "platform_report_js", "platform_official_exam_js", "platform_adaptive_review_js", "platform_css",
  "platform_ux_js", "platform_ux_guardrails_js", "platform_ux_css",
  "platform_navigation_js", "platform_navigation_css", "platform_navigation_polish_js", "platform_navigation_polish_css",
  "release-meta.json", "official_exam",
], "Build público");
requireMarkers(read("scripts/export-notion-snapshot.mjs"), ["alternativesAreBlank", "alternativas_A_E_vazias", "Pode publicar = true", "released_for_export", "publication_lot"], "Exportador do Notion");
if (!read("scripts/apply-notion-snapshot.mjs").includes("Snapshot do Notion aplicado")) fail("Aplicação do snapshot não está ativa.");
const buildInfo = JSON.parse(read("dist/data/release/build-info.json")), releaseMeta = JSON.parse(read("dist/data/release/release-meta.json")), catalog = JSON.parse(read("dist/data/release/catalogo.json"));
if (buildInfo.version !== packageData.version || buildInfo.builder !== expectedBuilder || buildInfo.cache_version !== expectedCacheVersion) fail("Proveniência da cópia canônica ou versão de cache ausente.");
if (releaseMeta.app_version !== packageData.version || releaseMeta.builder !== expectedBuilder || releaseMeta.cache_version !== expectedCacheVersion) fail("release-meta sem proveniência coerente.");
if (releaseMeta.questions !== Number(catalog.summary.questoes) || releaseMeta.materials !== Number(catalog.summary.materiais)) fail("release-meta diverge do catálogo.");
for (const hash of [
  "index_html", "app_js", "service_worker_js", "pwa_js", "material_downloads_js", "material_downloads_css",
  "platform_shared_js", "platform_release_js", "platform_vault_js", "platform_report_js", "platform_official_exam_js", "platform_adaptive_review_js", "platform_css",
  "platform_ux_js", "platform_ux_guardrails_js", "platform_ux_css",
  "platform_navigation_js", "platform_navigation_css", "platform_navigation_polish_js", "platform_navigation_polish_css",
]) if (!buildInfo.source_files_sha256?.[hash] || !releaseMeta.source_files_sha256?.[hash]) fail(`Hash canônico ausente: ${hash}`);
if ("generated_at" in buildInfo || "generated_at" in releaseMeta) fail("Metadados contêm horário variável.");
for (const file of [
  "index.html", "assets/app-v4.js", "service-worker.js", "assets/pwa-v2-9.js", "assets/material-downloads-v1.js", "assets/material-downloads-v1.css",
  "assets/shared-v2-13.js", "assets/release-v2-13.js", "assets/vault-v2-13.js", "assets/report-v2-13.js", "assets/official-exam-v2-13.js", "assets/adaptive-review-v2-13.js", "assets/platform-v2-13.css",
  "assets/ux-v2-14.js", "assets/ux-v2-14-guardrails.js", "assets/ux-v2-14.css",
  "assets/navigation-v2-15.js", "assets/navigation-v2-15.css", "assets/navigation-v2-15-polish.js", "assets/navigation-v2-15-polish.css",
]) if (read(file) !== read(`dist/${file}`)) fail(`O dist diverge da fonte canônica: ${file}`);
const sourceIndex = read("index.html"), sourceApp = read("assets/app-v4.js"), sourceWorker = read("service-worker.js"), sourcePwa = read("assets/pwa-v2-9.js"), sourceMaterialDownloads = read("assets/material-downloads-v1.js");
const sourceLearning = read("assets/learning-v2-9.js");
const sourcePlatform = ["shared", "release", "vault", "report", "official-exam", "adaptive-review"].map(name => read(`assets/${name}-v2-13.js`)).join("\n");
const sourceUx = `${read("assets/ux-v2-14.js")}\n${read("assets/ux-v2-14-guardrails.js")}`;
const sourceNavigation = `${read("assets/navigation-v2-15.js")}\n${read("assets/navigation-v2-15-polish.js")}`;
requireMarkers(sourceIndex, [
  "app-v4.js?v=13", "study-navigation-v2-6.css?v=1", "reports-v2-10.js?v=2", "material-downloads-v1.css?v=1", "material-downloads-v1.js?v=1",
  "platform-v2-13.css?v=1", "release-v2-13.js?v=1", "vault-v2-13.js?v=1", "report-v2-13.js?v=1", "official-exam-v2-13.js?v=1", "adaptive-review-v2-13.js?v=1",
  "ux-v2-14.css?v=1", "ux-v2-14.js?v=1", "ux-v2-14-guardrails.js?v=1",
  "navigation-v2-15.css?v=1", "navigation-v2-15-polish.css?v=1", "navigation-v2-15.js?v=1", "navigation-v2-15-polish.js?v=1",
], "HTML canônico");
requireMarkers(sourceApp, ["Catálogo inconsistente.", 'data-study-view="materias"', 'data-study-view="provas"', "function renderDisciplineTopics()"], "Aplicação canônica");
if (sourceApp.includes("Release incompleta.")) fail("Aplicação canônica ainda contém trava antiga.");
requireMarkers(sourceWorker, [
  expectedCacheVersion, 'event.request.mode === "navigate"', 'cache: "no-store"', 'type === "SKIP_WAITING"',
  "material-downloads-v1.css?v=1", "material-downloads-v1.js?v=1", "platform-v2-13.css?v=1", "shared-v2-13.js?v=1", "release-v2-13.js?v=1", "vault-v2-13.js?v=1", "report-v2-13.js?v=1", "official-exam-v2-13.js?v=1", "adaptive-review-v2-13.js?v=1",
  "ux-v2-14.css?v=1", "ux-v2-14.js?v=1", "ux-v2-14-guardrails.js?v=1",
  "navigation-v2-15.css?v=1", "navigation-v2-15-polish.css?v=1", "navigation-v2-15.js?v=1", "navigation-v2-15-polish.js?v=1",
  "question-search-index", "release-meta",
], "Service worker");
requireMarkers(sourcePwa, ['updateViaCache: "none"', "controllerchange", "registration.update()"], "Registro PWA");
requireMarkers(sourceMaterialDownloads, ["data-material-download-card", "PDF para responder", "PDF comentado", "printableDocument"], "Downloads");
requireMarkers(sourcePlatform, ["Prova Real SEDES/DF 2026", "sedes-protected-backup", "Reportar problema nesta questão", "Revisão adaptativa", "release-meta.json", "let scheduled = false"], "Plataforma 2.13");
requireMarkers(sourceLearning, ["cleanHomeLayerEnabled", 'script[src*="navigation-v2-15.js"]', "if (cleanHomeLayerEnabled()) return;"], "Compatibilidade da inteligência v2.9");
requireMarkers(sourceUx, ["Estudo de hoje", "Busca inteligente", "closeAfterConsecutiveCorrect: 3", "data-ux-run-filter"], "UX v2.14");
requireMarkers(sourceNavigation, ["Seu estudo, sem ruído.", "#/perfil/configuracoes", "data-ux15-open-question", "aria-controls", "tabpanel", 'aria-current="page"'], "Navegação v2.15");
requireMarkers(read("scripts/validate-material-downloads.mjs"), ["question_index", "tipo de material inválido", "todos indexados e comentados"], "Validador dos downloads");
requireMarkers(read("scripts/validate-ux-v2-14.mjs"), ["closeAfterConsecutiveCorrect: 3", "question-search-index"], "Validador UX v2.14");
requireMarkers(read("scripts/validate-navigation-v2-15.mjs"), ["PWA mobile sem overflow", "data-ux15-open-question", "aria-controls"], "Validador de navegação v2.15");
requireMarkers(read("tests-public/material-downloads.spec.js"), ["provas", "simulados", "PDF para responder", "PDF comentado"], "Teste público dos downloads");
requireMarkers(read("tests-public/ux-v2-14.spec.js"), ["question-search-index.json", "data-ux15-open-question"], "Teste público da UX v2.14");
requireMarkers(read("tests-public/navigation-v2-15.spec.js"), ["data-ux15-home", "perfil/configuracoes", "data-official-exam-card"], "Teste público da navegação v2.15");
const pagesWorkflow = read(".github/workflows/pages.yml");
requireMarkers(pagesWorkflow, ["verify-deployment.mjs", "playwright.public.config.js", "rollback-deployment.mjs", "mark-notion-published.mjs", "PUBLICATION_PLAN_PATH", "source_sha:", "steps.traceability.outcome == 'failure'", "actions: write", "contents: read"], "Workflow de Pages");
for (const forbidden of ["contents: write", "deployment-receipt.json", "git push origin HEAD:main", "export-notion-snapshot.mjs"]) if (pagesWorkflow.includes(forbidden)) fail(`Workflow de Pages contém marcador proibido: ${forbidden}`);
const notionWorkflow = read(".github/workflows/notion-sync.yml");
requireMarkers(notionWorkflow, ["workflow_dispatch:", "schedule:", "export-notion-snapshot.mjs", "create-publication-plan.mjs", "git push origin HEAD:main", "actions: write", "build-info.json", "gh workflow run pages.yml", "-f source_sha=", "gh run watch", "--exit-status"], "Workflow do Notion");
if (/^  push:/m.test(notionWorkflow)) fail("Workflow do Notion não pode reagir ao próprio push.");
const dispatchCount = (notionWorkflow.match(/gh workflow run pages\.yml/g) || []).length;
if (dispatchCount !== 1) fail(`Workflow do Notion deve criar uma única publicação explícita; encontrado: ${dispatchCount}.`);
console.log("✓ Build 2.13.0 validado: release-meta, UX v2.14/v2.15, PWA, vault, reporte, prova real, revisão adaptativa e publicação protegida.");
