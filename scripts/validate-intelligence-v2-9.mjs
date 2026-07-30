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
for (const feature of ["manifest.webmanifest", "intelligence-v2-9.css", "app-v4.js?v=4", "learning-v2-9.js", "pwa-v2-9.js"]) if (!index.includes(feature)) fail(`Integração ausente no HTML: ${feature}`);
const learning = read("dist/assets/learning-v2-9.js");
for (const feature of ["reviewSchedule", "D0/D7/D20", "data-smart-today", "Por que eu errei?", "Exportar para Anki", "Simulado por cargo", "Selecionar pontos fracos", "Minha anotação"]) if (!learning.includes(feature)) fail(`Recurso inteligente ausente: ${feature}`);
const serviceWorker = read("dist/service-worker.js");
for (const feature of ["data/release/catalogo.json", "data/release/materials", "CACHE_VERSION", "networkFirst"]) if (!serviceWorker.includes(feature)) fail(`Cache offline incompleto: ${feature}`);
const catalog = JSON.parse(read("dist/data/release/catalogo.json"));
const study = JSON.parse(read("dist/data/release/study-index.json"));
if (catalog.summary.questoes !== 690 || catalog.summary.materiais !== 36) fail("Catálogo final divergente.");
if (study.summary.questions !== 690 || study.summary.disciplines !== 17 || study.summary.topics !== 95) fail("Índice por matéria divergente.");
const workflow = read(".github/workflows/pages.yml");
if (!workflow.includes("path: dist") || !workflow.includes("playwright")) fail("Workflow não publica dist ou não executa teste real de navegador.");
console.log("✓ Plataforma inteligente validada: revisão espaçada, painel Hoje, tópicos, Anki, PWA, dist e teste de navegador.");
