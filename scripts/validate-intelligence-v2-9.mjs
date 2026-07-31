import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));
const fail = message => { throw new Error(message); };

for (const file of [
  "dist/index.html", "dist/manifest.webmanifest", "dist/service-worker.js",
  "dist/assets/learning-v2-9.js", "dist/assets/pwa-v2-9.js", "dist/assets/intelligence-v2-9.css",
  "dist/data/release/catalogo.json", "dist/data/release/study-index.json",
]) if (!exists(file)) fail(`Arquivo da plataforma inteligente ausente: ${file}`);

const index = read("dist/index.html");
for (const feature of ["manifest.webmanifest", "intelligence-v2-9.css", "app-v4.js?v=7", "learning-v2-9.js", "pwa-v2-9.js"]) {
  if (!index.includes(feature)) fail(`Integração ausente no HTML: ${feature}`);
}
const learning = read("dist/assets/learning-v2-9.js");
for (const feature of ["reviewSchedule", "D0/D7/D20", "data-smart-today", "Por que eu errei?", "Exportar para Anki", "Simulado por cargo", "Selecionar pontos fracos", "Minha anotação"]) {
  if (!learning.includes(feature)) fail(`Recurso inteligente ausente: ${feature}`);
}
const serviceWorker = read("dist/service-worker.js");
for (const feature of ["data/release/catalogo.json", "CACHE_VERSION", "networkFirst", "sedes-questoes-v2-12"]) {
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
for (const marker of ["path: dist", "playwright", "verify-deployment.mjs", "playwright.public.config.js", "rollback-deployment.mjs", "export-notion-snapshot.mjs"]) {
  if (!workflow.includes(marker)) fail(`Workflow incompleto: ${marker}`);
}
console.log(`✓ Plataforma inteligente validada: ${questionCount} questões, ${materialCount} materiais, ${study.summary.disciplines} matérias, ${study.summary.topics} tópicos, PWA e auditoria pública com rollback.`);
