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
const catalog = JSON.parse(fs.readFileSync(path.join(dist, "data/release/catalogo.json"), "utf8"));
if (catalog.summary.questoes !== 690 || catalog.summary.materiais !== 36) throw new Error("Dist gerado com totais divergentes.");
console.log(`✓ Pacote dist gerado: ${catalog.summary.questoes} questões, ${catalog.summary.materiais} materiais e somente arquivos públicos.`);
