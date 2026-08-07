import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));
const fail = message => { throw new Error(message); };
const packageData = JSON.parse(read("package.json"));
const expectedCacheVersion = `sedes-questoes-v${String(packageData.version || "").replace(/\./g, "-")}-r5`;

for (const file of [
  "dist/index.html", "dist/manifest.webmanifest", "dist/service-worker.js",
  "dist/assets/learning-v2-9.js", "dist/assets/pwa-v2-9.js", "dist/assets/intelligence-v2-9.css",
  "dist/assets/ux-v2-14.js", "dist/assets/ux-v2-14-guardrails.js",
  "dist/assets/navigation-v2-15.js", "dist/assets/navigation-v2-15-polish.js",
  "dist/data/release/catalogo.json", "dist/data/release/study-index.json",
]) if (!exists(file)) fail(`Arquivo da plataforma inteligente ausente: ${file}`);

const index = read("dist/index.html");
for (const feature of [
  "manifest.webmanifest", "intelligence-v2-9.css", "app-v4.js?v=13", "learning-v2-9.js", "pwa-v2-9.js",
  "ux-v2-14.js?v=1", "ux-v2-14-guardrails.js?v=1", "navigation-v2-15.js?v=1", "navigation-v2-15-polish.js?v=1",
]) {
  if (!index.includes(feature)) fail(`Integração ausente no HTML: ${feature}`);
}
const learning = read("dist/assets/learning-v2-9.js");
for (const feature of [
  "reviewSchedule", "D0/D7/D20", "data-smart-today", "Por que eu errei?", "Exportar para Anki", "Simulado por cargo", "Selecionar pontos fracos", "Minha anotação",
  "cleanHomeLayerEnabled", 'script[src*="navigation-v2-15.js"]', "if (cleanHomeLayerEnabled()) return;",
]) {
  if (!learning.includes(feature)) fail(`Recurso inteligente ausente: ${feature}`);
}
const navigation = read("dist/assets/navigation-v2-15.js");
for (const feature of ["Seu estudo, sem ruído.", "#/perfil/configuracoes", "Última sincronização do catálogo"]) {
  if (!navigation.includes(feature)) fail(`Navegação v2.15 ausente: ${feature}`);
}
const polish = read("dist/assets/navigation-v2-15-polish.js");
for (const feature of ["injectRoleTemplatesInStudy", "enhanceSearchResultActions", "data-ux15-open-question", 'aria-current="page"', "aria-controls", "tabpanel", "aria-labelledby"]) {
  if (!polish.includes(feature)) fail(`Polimento v2.15 ausente: ${feature}`);
}
const serviceWorker = read("dist/service-worker.js");
for (const feature of ["data/release/catalogo.json", "CACHE_VERSION", "networkFirst", expectedCacheVersion, "navigation-v2-15-polish.js?v=1"]) {
  if (!serviceWorker.includes(feature)) fail(`Cache offline incompleto: ${feature}`);
}
if (!/release\\\/materials/.test(serviceWorker)) fail("Cache offline dos materiais não está ativo.");

const catalog = JSON.parse(read("dist/data/release/catalogo.json"));
const study = JSON.parse(read("dist/data/release/study-index.json"));
const questionCount = Object.keys(catalog.question_index || {}).length;
const materialCount = (catalog.materials || []).length;
if (catalog.summary.questoes !== questionCount || catalog.summary.materiais !== materialCount) fail("Catálogo final divergente.");
if (study.summary.questions !== questionCount) fail("Índice por matéria não cobre todas as questões.");
if (!Number.isInteger(study.summary.disciplines) || study.summary.disciplines <= 0) fail("Índice sem matérias válidas.");
if (!Number.isInteger(study.summary.topics) || study.summary.topics <= 0) fail("Índice sem tópicos válidos.");

const indexedIds = new Set();
for (const discipline of study.disciplines || []) {
  for (const id of discipline.question_ids || []) {
    if (indexedIds.has(id)) fail(`Questão repetida no índice inteligente: ${id}`);
    indexedIds.add(id);
  }
}
if (indexedIds.size !== questionCount) fail(`Cobertura inteligente divergente: ${indexedIds.size}/${questionCount}.`);

const workflow = read(".github/workflows/pages.yml");
const suspensionPath = path.join(root, "data", "operations", "site-automations-suspended.json");
const suspension = fs.existsSync(suspensionPath) ? JSON.parse(fs.readFileSync(suspensionPath, "utf8")) : null;
const manualOnly = suspension?.mode === "manual_only";
if (manualOnly) {
  if (!workflow.includes("workflow_dispatch:")) fail("Workflow de Pages suspenso sem acionamento manual.");
  if (/^  (push|pull_request|schedule):/m.test(workflow)) fail("Workflow de Pages suspenso contém gatilho automático.");
  if (!workflow.includes("SUSPENSO")) fail("Workflow permanente não registra explicitamente a suspensão.");
} else {
  for (const marker of ["path: dist", "playwright", "verify-deployment.mjs", "playwright.public.config.js", "rollback-deployment.mjs", "PUBLICATION_PLAN_PATH", "source_sha:", "steps.traceability.outcome == 'failure'"]) {
    if (!workflow.includes(marker)) fail(`Workflow incompleto: ${marker}`);
  }
  if (workflow.includes("export-notion-snapshot.mjs")) fail("O workflow de Pages não pode substituir o snapshot versionado por leitura ao vivo do Notion.");
}
console.log(`✓ Plataforma inteligente validada: ${questionCount} questões, ${materialCount} materiais, ${study.summary.disciplines} matérias, ${study.summary.topics} tópicos, cache ${expectedCacheVersion}, Home v2.15 sem montagem legada e governança ${manualOnly ? "manual" : "automática"}.`);