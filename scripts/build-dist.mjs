import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const copy = (source, target) => {
  const sourcePath = path.join(root, source);
  if (!fs.existsSync(sourcePath)) throw new Error(`Arquivo obrigatório ausente: ${source}`);
  fs.cpSync(sourcePath, path.join(dist, target || source), {recursive: true});
};

fs.rmSync(dist, {recursive: true, force: true});
fs.mkdirSync(dist, {recursive: true});
copy("index.html");
copy("manifest.webmanifest");
copy("service-worker.js");
copy("assets");
copy("data/concurso.json");
copy("data/release");
fs.writeFileSync(path.join(dist, ".nojekyll"), "");

const forbidden = ["scripts", ".github", "data/consolidated", "data/true-false"];
for (const entry of forbidden) {
  if (fs.existsSync(path.join(dist, entry))) throw new Error(`Conteúdo de desenvolvimento exposto no dist: ${entry}`);
}

const catalogPath = path.join(dist, "data/release/catalogo.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const packageData = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
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
  generated_at: new Date().toISOString(),
  source_sha: process.env.GITHUB_SHA || "local",
  questions: questionCount,
  materials: materialCount,
  material_files: materialFiles,
};
fs.writeFileSync(path.join(dist, "data/release/build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);
console.log(`✓ Pacote dist ${packageData.version}: ${questionCount} questões, ${materialCount} materiais e proveniência registrada.`);
