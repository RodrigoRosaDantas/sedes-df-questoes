import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));
const fail = message => { throw new Error(message); };

const packageData = JSON.parse(read("package.json"));
if (packageData.version !== "2.11.1") fail(`Versão inesperada: ${packageData.version}`);
const buildCommand = String(packageData.scripts?.build || "");
if (!buildCommand.includes("build-public.mjs") || !buildCommand.includes("fixed-build-time.mjs")) fail("Build canônico ou relógio reproduzível não estão ativos.");
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

const buildInfo = JSON.parse(read("dist/data/release/build-info.json"));
if (buildInfo.version !== packageData.version || buildInfo.builder !== "copy-public-v2-11-1") fail("Proveniência da cópia canônica 2.11.1 ausente.");
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

const workflow = read(".github/workflows/pages.yml");
for (const marker of ["verify-deployment.mjs", "playwright.public.config.js", "rollback-deployment.mjs", "actions: write"]) {
  if (!workflow.includes(marker)) fail(`Workflow sem proteção de produção: ${marker}`);
}

console.log("✓ Build 2.11.1 validado: fontes canônicas, cópia sem transformação, reprodutibilidade e rollback configurados.");
