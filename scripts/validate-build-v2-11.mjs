import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));
const fail = message => { throw new Error(message); };

const packageData = JSON.parse(read("package.json"));
if (packageData.version !== "2.12.0") fail(`Versão inesperada: ${packageData.version}`);
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

const builder = read("scripts/build-public.mjs");
for (const forbidden of [".replace(", "staleGuard", "compileApplication", "compileIndex", "study-navigation-v2-6.js.txt"]) {
  if (builder.includes(forbidden)) fail(`Build público ainda transforma fontes: ${forbidden}`);
}

const exporter = read("scripts/export-notion-snapshot.mjs");
for (const marker of ["alternativesAreBlank", "alternativas_A_E_vazias", "Pode publicar = true", "released_for_export", "publication_lot"]) {
  if (!exporter.includes(marker)) fail(`Exportador do Notion sem regra obrigatória: ${marker}`);
}
const snapshotApplier = read("scripts/apply-notion-snapshot.mjs");
if (!snapshotApplier.includes("Snapshot do Notion aplicado")) fail("Aplicação do snapshot não está ativa.");

const buildInfo = JSON.parse(read("dist/data/release/build-info.json"));
if (buildInfo.version !== packageData.version || buildInfo.builder !== "copy-public-v2-11-1") fail("Proveniência da cópia canônica ausente.");
if (!buildInfo.source_files_sha256?.index_html || !buildInfo.source_files_sha256?.app_js) fail("Hashes das fontes canônicas ausentes.");
if ("generated_at" in buildInfo) fail("Build-info ainda contém horário variável.");

const sourceIndex = read("index.html");
const sourceApp = read("assets/app-v4.js");
const distIndex = read("dist/index.html");
const distApp = read("dist/assets/app-v4.js");
if (sourceIndex !== distIndex || sourceApp !== distApp) fail("O dist não é cópia exata das fontes canônicas.");
for (const marker of ["app-v4.js?v=7", "study-navigation-v2-6.css?v=1", "reports-v2-10.js?v=2"]) {
  if (!sourceIndex.includes(marker)) fail(`HTML canônico sem ${marker}.`);
}
for (const marker of ["Catálogo inconsistente.", 'data-study-view="materias"', 'data-study-view="provas"', "function renderDisciplineTopics()"] ) {
  if (!sourceApp.includes(marker)) fail(`Aplicação canônica sem ${marker}.`);
}
if (sourceApp.includes("Release incompleta.")) fail("Aplicação canônica ainda contém trava antiga.");

const pagesWorkflow = read(".github/workflows/pages.yml");
for (const marker of ["verify-deployment.mjs", "playwright.public.config.js", "rollback-deployment.mjs", "mark-notion-published.mjs", "actions: write"]) {
  if (!pagesWorkflow.includes(marker)) fail(`Workflow sem proteção de produção: ${marker}`);
}
const notionWorkflow = read(".github/workflows/notion-sync.yml");
for (const marker of ["push:", "export-notion-snapshot.mjs", "gh workflow run pages.yml", "actions: write"]) {
  if (!notionWorkflow.includes(marker)) fail(`Workflow do Notion incompleto: ${marker}`);
}

console.log("✓ Build 2.12 validado: fontes canônicas, snapshot do Notion aplicado, C/E inferido por alternativas vazias e publicação encadeada.");
