import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const fail = message => { throw new Error(message); };

const sourceApp = read("assets/app-v4.js");
const sourceIndex = read("index.html");
const app = read("dist/assets/app-v4.js");
const index = read("dist/index.html");
if (sourceApp !== app || sourceIndex !== index) fail("O runtime público diverge das fontes canônicas.");

if (/state\.catalog\.summary\.questoes\s*!==\s*\d+|state\.catalog\.summary\.materiais\s*!==\s*\d+/.test(app)) {
  fail("O aplicativo público ainda contém totais fixos de questões ou materiais.");
}
for (const feature of [
  "const declaredQuestions = Number(state.catalog?.summary?.questoes);",
  "const declaredMaterials = Number(state.catalog?.summary?.materiais);",
  "const indexedQuestions = Object.keys(state.catalog?.question_index || {}).length;",
  "const listedMaterials = Array.isArray(state.catalog?.materials) ? state.catalog.materials.length : 0;",
  "Catálogo inconsistente.",
]) {
  if (!app.includes(feature)) fail(`Validação dinâmica ausente no pacote público: ${feature}`);
}
const cacheVersion = index.match(/assets\/app-v4\.js\?v=(\d+)/)?.[1];
if (!cacheVersion || Number(cacheVersion) < 7) fail("Cache-busting do aplicativo não foi renovado para a release 2.11.1.");

console.log(`✓ Runtime canônico validado: catálogo dinâmico, fontes idênticas ao dist e cache v${cacheVersion}.`);
