import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));
const fail = message => { throw new Error(message); };

const packageData = JSON.parse(read("package.json"));
if (packageData.version !== "2.12.4") fail(`Versão inesperada: ${packageData.version}`);
const versionToken = packageData.version.replace(/\./g, "-");
const expectedBuilder = `copy-public-v${versionToken}`;
const expectedCacheVersion = `sedes-questoes-v${versionToken}`;
const buildCommand = String(packageData.scripts?.build || "");
for (const required of ["build-release-v2-4.mjs", "apply-notion-snapshot.mjs", "build-study-index.mjs", "build-public.mjs", "fixed-build-time.mjs"]) {
  if (!buildCommand.includes(required)) fail(`Etapa obrigatória ausente no build: ${required}`);
}
if (buildCommand.indexOf("apply-notion-snapshot.mjs") > buildCommand.indexOf("build-study-index.mjs")) {
  fail("O índice de matérias está sendo gerado antes da aplicação do snapshot do Notion.");
}
for (const legacy of ["patch-runtime-catalog", "patch-study-navigation", "patch-intelligence", "build-dist.mjs"]) {
  if (buildCommand.includes(legacy)) fail(`Build ainda depende de ${legacy}.`);
}
for (const legacyFile of [
  "scripts/patch-runtime-catalog.mjs",
  "scripts/patch-study-navigation-v2-6.mjs",
  "scripts/patch-intelligence-v2-9.mjs",
  "scripts/build-dist.mjs",
  "scripts/fragments/study-navigation-v2-6.js.txt",
  "scripts/consolidate-source-once.mjs",
  ".github/workflows/consolidate-source-once.yml",
]) if (exists(legacyFile)) fail(`Artefato temporário ou mutável ainda existe: ${legacyFile}`);

const checkCommand = String(packageData.scripts?.check || "");
const testCommand = String(packageData.scripts?.test || "");
for (const marker of ["node --check assets/material-downloads-v1.js", "node --check scripts/validate-material-downloads.mjs"]) {
  if (!checkCommand.includes(marker)) fail(`Comando de auditoria sem cobertura dos downloads: ${marker}`);
}
if (!testCommand.includes("validate-material-downloads.mjs")) fail("Validação integral dos materiais não participa do npm test.");

const builder = read("scripts/build-public.mjs");
for (const forbidden of [".replace(\"Release incompleta", "staleGuard", "compileApplication", "compileIndex", "study-navigation-v2-6.js.txt"]) {
  if (builder.includes(forbidden)) fail(`Build público ainda transforma fontes: ${forbidden}`);
}
for (const marker of ["expectedBuilder", "expectedCacheVersion", "service_worker_js", "pwa_js", "material_downloads_js", "material_downloads_css"]) {
  if (!builder.includes(marker)) fail(`Build público sem controle dinâmico: ${marker}`);
}

const exporter = read("scripts/export-notion-snapshot.mjs");
for (const marker of ["alternativesAreBlank", "alternativas_A_E_vazias", "Pode publicar = true", "released_for_export", "publication_lot"]) {
  if (!exporter.includes(marker)) fail(`Exportador do Notion sem regra obrigatória: ${marker}`);
}
const snapshotApplier = read("scripts/apply-notion-snapshot.mjs");
if (!snapshotApplier.includes("Snapshot do Notion aplicado")) fail("Aplicação do snapshot não está ativa.");

const buildInfo = JSON.parse(read("dist/data/release/build-info.json"));
if (buildInfo.version !== packageData.version || buildInfo.builder !== expectedBuilder || buildInfo.cache_version !== expectedCacheVersion) {
  fail("Proveniência da cópia canônica ou versão de cache ausente.");
}
if (
  !buildInfo.source_files_sha256?.index_html
  || !buildInfo.source_files_sha256?.app_js
  || !buildInfo.source_files_sha256?.service_worker_js
  || !buildInfo.source_files_sha256?.pwa_js
  || !buildInfo.source_files_sha256?.material_downloads_js
  || !buildInfo.source_files_sha256?.material_downloads_css
) {
  fail("Hashes das fontes canônicas ausentes.");
}
if ("generated_at" in buildInfo) fail("Build-info ainda contém horário variável.");

const sourceIndex = read("index.html");
const sourceApp = read("assets/app-v4.js");
const sourceWorker = read("service-worker.js");
const sourcePwa = read("assets/pwa-v2-9.js");
const sourceMaterialDownloads = read("assets/material-downloads-v1.js");
const sourceMaterialDownloadsCss = read("assets/material-downloads-v1.css");
const distIndex = read("dist/index.html");
const distApp = read("dist/assets/app-v4.js");
const distWorker = read("dist/service-worker.js");
const distPwa = read("dist/assets/pwa-v2-9.js");
const distMaterialDownloads = read("dist/assets/material-downloads-v1.js");
const distMaterialDownloadsCss = read("dist/assets/material-downloads-v1.css");
if (
  sourceIndex !== distIndex
  || sourceApp !== distApp
  || sourceWorker !== distWorker
  || sourcePwa !== distPwa
  || sourceMaterialDownloads !== distMaterialDownloads
  || sourceMaterialDownloadsCss !== distMaterialDownloadsCss
) {
  fail("O dist não é cópia exata das fontes canônicas.");
}
for (const marker of [
  "app-v4.js?v=8",
  "study-navigation-v2-6.css?v=1",
  "reports-v2-10.js?v=2",
  "material-downloads-v1.css?v=1",
  "material-downloads-v1.js?v=1",
]) {
  if (!sourceIndex.includes(marker)) fail(`HTML canônico sem ${marker}.`);
}
for (const marker of ["Catálogo inconsistente.", 'data-study-view="materias"', 'data-study-view="provas"', "function renderDisciplineTopics()"]) {
  if (!sourceApp.includes(marker)) fail(`Aplicação canônica sem ${marker}.`);
}
if (sourceApp.includes("Release incompleta.")) fail("Aplicação canônica ainda contém trava antiga.");
for (const marker of [
  expectedCacheVersion,
  'event.request.mode === "navigate"',
  'cache: "no-store"',
  'type === "SKIP_WAITING"',
  "material-downloads-v1.css?v=1",
  "material-downloads-v1.js?v=1",
]) {
  if (!sourceWorker.includes(marker)) fail(`Service worker sem proteção de atualização: ${marker}.`);
}
for (const marker of ['updateViaCache: "none"', "controllerchange", "registration.update()"]) {
  if (!sourcePwa.includes(marker)) fail(`Registro PWA sem atualização controlada: ${marker}.`);
}
for (const marker of ["data-material-download-card", "PDF para responder", "PDF comentado", "printableDocument"]) {
  if (!sourceMaterialDownloads.includes(marker)) fail(`Recurso de download sem marcador: ${marker}.`);
}

const downloadValidator = read("scripts/validate-material-downloads.mjs");
for (const marker of ["question_index", "tipo de material inválido", "todos indexados e comentados"]) {
  if (!downloadValidator.includes(marker)) fail(`Validador dos downloads incompleto: ${marker}.`);
}
const publicDownloadTest = read("tests-public/material-downloads.spec.js");
for (const marker of ["provas", "simulados", "PDF para responder", "PDF comentado"]) {
  if (!publicDownloadTest.includes(marker)) fail(`Teste público dos downloads incompleto: ${marker}.`);
}

const pagesWorkflow = read(".github/workflows/pages.yml");
for (const marker of [
  "verify-deployment.mjs",
  "playwright.public.config.js",
  "rollback-deployment.mjs",
  "mark-notion-published.mjs",
  "PUBLICATION_PLAN_PATH",
  "source_sha:",
  "steps.traceability.outcome == 'failure'",
  "actions: write",
  "contents: read",
]) {
  if (!pagesWorkflow.includes(marker)) fail(`Workflow sem proteção de produção: ${marker}`);
}
for (const forbidden of ["contents: write", "deployment-receipt.json", "git push origin HEAD:main", "export-notion-snapshot.mjs"]) {
  if (pagesWorkflow.includes(forbidden)) fail(`Workflow de Pages ainda pode gerar loop ou build não versionado: ${forbidden}`);
}

const notionWorkflow = read(".github/workflows/notion-sync.yml");
for (const marker of [
  "workflow_dispatch:",
  "schedule:",
  "export-notion-snapshot.mjs",
  "create-publication-plan.mjs",
  "git push origin HEAD:main",
  "actions: write",
  "build-info.json",
  "gh workflow run pages.yml",
  "-f source_sha=",
  "gh run watch",
  "--exit-status",
]) {
  if (!notionWorkflow.includes(marker)) fail(`Workflow do Notion incompleto: ${marker}`);
}
if (/^  push:/m.test(notionWorkflow)) fail("Workflow do Notion não pode reagir ao próprio push.");
for (const forbidden of ["Preparar branch isolada", "refs/heads/"]) {
  if (notionWorkflow.includes(forbidden)) fail(`Workflow do Notion mantém mecanismo recursivo ou obsoleto: ${forbidden}`);
}
const dispatchCount = (notionWorkflow.match(/gh workflow run pages\.yml/g) || []).length;
if (dispatchCount !== 1) fail(`Workflow do Notion deve criar uma única publicação explícita; encontrado: ${dispatchCount}.`);

console.log("✓ Build 2.12.4 validado: cache coerente, downloads auditados, snapshot versionado, plano restrito e dispatch único acompanhado sem recursão.");
