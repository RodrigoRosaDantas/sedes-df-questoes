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
  "assets/learning-v2-9.js",
  "assets/reports-v2-10.js",
  "assets/reports-v2-10.css",
  "data/release/catalogo.json",
  "data/release/study-index.json",
  "data/release/build-info.json",
];

for (const entry of required) {
  if (!fs.existsSync(path.join(dist, entry))) throw new Error(`Arquivo ausente no dist: ${entry}`);
}

const index = fs.readFileSync(path.join(dist, "index.html"), "utf8");
for (const reference of ["reports-v2-10.css?v=2", "reports-v2-10.js?v=2", "app-v4.js?v=7"]) {
  if (!index.includes(reference)) throw new Error(`Referência ausente no HTML: ${reference}`);
}

const packageData = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const catalog = JSON.parse(fs.readFileSync(path.join(dist, "data/release/catalogo.json"), "utf8"));
const buildInfo = JSON.parse(fs.readFileSync(path.join(dist, "data/release/build-info.json"), "utf8"));
const materialFiles = fs.readdirSync(path.join(dist, "data/release/materials")).filter(file => file.endsWith(".json")).length;
const questionCount = Object.keys(catalog.question_index || {}).length;
const materialCount = (catalog.materials || []).length;

if (packageData.version !== "2.12.0") throw new Error(`Versão inesperada: ${packageData.version}`);
if (buildInfo.version !== packageData.version) throw new Error("Versão do build-info diverge do package.json.");
if (buildInfo.builder !== "copy-public-v2-11-1") throw new Error("Cópia canônica não identificada.");
if (!buildInfo.source_files_sha256?.index_html || !buildInfo.source_files_sha256?.app_js) throw new Error("Hashes das fontes canônicas ausentes.");
if ("generated_at" in buildInfo) throw new Error("Build-info contém horário variável.");
if (buildInfo.data_release_version !== (catalog.release_version || null)) throw new Error("Versão da base diverge do catálogo publicado.");
if (buildInfo.catalog_schema_version !== (catalog.schema_version || null)) throw new Error("Schema da base diverge do catálogo publicado.");
if (buildInfo.questions !== questionCount || buildInfo.materials !== materialCount || buildInfo.material_files !== materialFiles) throw new Error("Proveniência do pacote diverge do catálogo publicado.");
if (questionCount !== Number(catalog.summary?.questoes) || materialCount !== Number(catalog.summary?.materiais)) throw new Error("Resumo do catálogo diverge dos dados reais.");

const reports = fs.readFileSync(path.join(dist, "assets/reports-v2-10.js"), "utf8");
for (const marker of ["data-progress-reports", "schema_version: \"2.10\"", "America/Sao_Paulo", "restoreBackupTransaction", "Motivos classificados no período", "Questões por mês", "Exportar relatório CSV"]) {
  if (!reports.includes(marker)) throw new Error(`Recurso auditado ausente: ${marker}`);
}

const worker = fs.readFileSync(path.join(dist, "service-worker.js"), "utf8");
if (!worker.includes('sedes-questoes-v2-12') || !worker.includes("app-v4.js?v=7") || !worker.includes("reports-v2-10.js?v=2") || !worker.includes("build-info.json")) throw new Error("Service worker não foi atualizado para a release 2.12.");

for (const forbidden of ["scripts", ".github", "data/consolidated", "data/true-false", "data/notion"]) {
  if (fs.existsSync(path.join(dist, forbidden))) throw new Error(`Conteúdo privado exposto no dist: ${forbidden}`);
}

console.log(`✓ Dist 2.12 validado: ${questionCount} questões, ${materialCount} materiais, snapshot do Notion e proveniência reproduzível.`);
