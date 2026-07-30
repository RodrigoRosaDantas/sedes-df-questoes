import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));
const fail = message => { throw new Error(message); };

const packageData = JSON.parse(read("package.json"));
if (packageData.version !== "2.11.0") fail(`Versão inesperada: ${packageData.version}`);
const buildCommand = String(packageData.scripts?.build || "");
if (!buildCommand.includes("build-public.mjs")) fail("Build público 2.11 não está ativo.");
for (const legacy of ["patch-runtime-catalog", "patch-study-navigation", "patch-intelligence", "build-dist.mjs"]) {
  if (buildCommand.includes(legacy)) fail(`Build ainda depende de ${legacy}.`);
}
for (const legacyFile of [
  "scripts/patch-runtime-catalog.mjs",
  "scripts/patch-study-navigation-v2-6.mjs",
  "scripts/patch-intelligence-v2-9.mjs",
  "scripts/build-dist.mjs",
]) if (exists(legacyFile)) fail(`Script mutável legado ainda existe: ${legacyFile}`);

const buildInfo = JSON.parse(read("dist/data/release/build-info.json"));
if (buildInfo.version !== packageData.version || buildInfo.builder !== "build-public-v2-11") fail("Proveniência do compilador 2.11 ausente.");

const index = read("dist/index.html");
const app = read("dist/assets/app-v4.js");
for (const marker of ["app-v4.js?v=6", "study-navigation-v2-6.css?v=1", "reports-v2-10.js?v=2"]) {
  if (!index.includes(marker)) fail(`HTML compilado sem ${marker}.`);
}
for (const marker of ["Catálogo inconsistente.", 'data-study-view="materias"', 'data-study-view="provas"', "function renderDisciplineTopics()"] ) {
  if (!app.includes(marker)) fail(`Aplicação compilada sem ${marker}.`);
}

const workflow = read(".github/workflows/pages.yml");
if (!workflow.includes("verify-deployment.mjs") || !workflow.includes("steps.deployment.outputs.page_url")) fail("Verificação pós-deploy não está configurada.");

console.log("✓ Build 2.11 validado: compilação determinística, scripts mutáveis removidos e verificação pós-deploy ativa.");
