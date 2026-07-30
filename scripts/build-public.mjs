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

const sourceIndex = read("index.html");
const sourceApp = read("assets/app-v4.js");
for (const marker of [
  "manifest.webmanifest",
  "study-navigation-v2-6.css?v=1",
  "intelligence-v2-9.css?v=1",
  "reports-v2-10.css?v=2",
  "app-v4.js?v=7",
  "learning-v2-9.js?v=1",
  "pwa-v2-9.js?v=1",
  "reports-v2-10.js?v=2",
]) requireMarker(sourceIndex, marker, "HTML canônico");
for (const marker of [
  'const STUDY_INDEX_URL = "./data/release/study-index.json";',
  "const indexedQuestions = Object.keys(state.catalog?.question_index || {}).length;",
  'data-study-view="materias"',
  'data-study-view="simulados"',
  'data-study-view="provas"',
  "function renderDisciplineTopics()",
  "Catálogo inconsistente.",
]) requireMarker(sourceApp, marker, "Aplicação canônica");
if (sourceApp.includes("Release incompleta.")) throw new Error("A fonte canônica ainda contém a trava antiga de totais fixos.");

fs.rmSync(dist, {recursive: true, force: true});
fs.mkdirSync(dist, {recursive: true});
copy("index.html");
copy("manifest.webmanifest");
copy("service-worker.js");
copy("assets");
copy("data/concurso.json");
copy("data/release");
fs.writeFileSync(path.join(dist, ".nojekyll"), "");

for (const forbidden of ["scripts", ".github", "data/consolidated", "data/true-false"]) {
  if (fs.existsSync(path.join(dist, forbidden))) throw new Error(`Conteúdo de desenvolvimento exposto no dist: ${forbidden}`);
}

const distIndex = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const distApp = fs.readFileSync(path.join(dist, "assets", "app-v4.js"), "utf8");
if (distIndex !== sourceIndex || distApp !== sourceApp) throw new Error("O pacote público diverge das fontes canônicas.");

const catalog = JSON.parse(fs.readFileSync(path.join(dist, "data/release/catalogo.json"), "utf8"));
const packageData = JSON.parse(read("package.json"));
const materialCount = Array.isArray(catalog.materials) ? catalog.materials.length : 0;
const questionCount = Object.keys(catalog.question_index || {}).length;
const materialDir = path.join(dist, "data/release/materials");
const materialFiles = fs.existsSync(materialDir) ? fs.readdirSync(materialDir).filter(file => file.endsWith(".json")).length : 0;

if (!materialCount || !questionCount) throw new Error("Dist gerado sem materiais ou questões.");
if (Number(catalog.summary?.questoes) !== questionCount) throw new Error(`Catálogo divergente: summary.questoes=${catalog.summary?.questoes}, índice=${questionCount}.`);
if (Number(catalog.summary?.materiais) !== materialCount) throw new Error(`Catálogo divergente: summary.materiais=${catalog.summary?.materiais}, lista=${materialCount}.`);
if (materialFiles !== materialCount) throw new Error(`Arquivos de material divergentes: ${materialFiles} arquivos para ${materialCount} materiais.`);

const buildInfo = {
  version: packageData.version,
  data_release_version: catalog.release_version || null,
  catalog_schema_version: catalog.schema_version || null,
  source_sha: process.env.GITHUB_SHA || "local",
  builder: "copy-public-v2-11-1",
  source_files_sha256: {
    index_html: sha256(sourceIndex),
    app_js: sha256(sourceApp),
  },
  questions: questionCount,
  materials: materialCount,
  material_files: materialFiles,
};
fs.writeFileSync(path.join(dist, "data/release/build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);

console.log(`✓ Build público canônico ${packageData.version}: ${questionCount} questões, ${materialCount} materiais e fontes copiadas sem transformação.`);
