import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const fail = message => { throw new Error(message); };

const catalog = JSON.parse(read("data/catalogo.json"));
const update = JSON.parse(read("data/updates/update-2026-07-29.json"));
const index = read("index.html");
const updateScript = read("assets/data-updates.js");

const encoded = catalog.bundle_chunks
  .map(relative => read(relative.replace(/^\.\//, "")).trim())
  .join("");
const bundle = JSON.parse(zlib.gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"));

for (const patch of update.materials || []) {
  let material = bundle.materials.find(item => item.id === patch.id);
  const metadata = Object.fromEntries(Object.entries(patch).filter(([key]) => !["mode", "questoes"].includes(key)));

  if (!material) {
    material = {...metadata, questoes: []};
    bundle.materials.push(material);
  } else {
    Object.assign(material, metadata);
  }

  for (const question of patch.questoes || []) {
    const index = material.questoes.findIndex(item => item.id === question.id || item.codigo === question.codigo);
    if (index >= 0) material.questoes[index] = question;
    else material.questoes.push(question);
  }
}

const questions = bundle.materials.flatMap(material => material.questoes.map(question => ({material, question})));
const ids = new Set();
const codes = new Set();

if (bundle.materials.length !== catalog.summary.materiais) fail(`Materiais divergentes: pacote ${bundle.materials.length}, catálogo ${catalog.summary.materiais}.`);
if (questions.length !== catalog.summary.questoes) fail(`Questões divergentes: pacote ${questions.length}, catálogo ${catalog.summary.questoes}.`);
if (catalog.summary.materiais !== 12 || catalog.summary.questoes !== 183) fail("A atualização deve resultar em 12 materiais e 183 questões.");
if (catalog.summary.banco_mestre !== 570 || catalog.summary.aguardando_exportacao !== 387) fail("Resumo do Banco Mestre divergente.");

for (const {material, question} of questions) {
  if (!question.id || !question.codigo || !question.enunciado || !question.comentario) fail(`Questão incompleta em ${material.id}.`);
  if (ids.has(question.id)) fail(`ID duplicado: ${question.id}`);
  if (codes.has(question.codigo)) fail(`Código duplicado: ${question.codigo}`);
  ids.add(question.id);
  codes.add(question.codigo);
  const letters = Object.keys(question.alternativas || {}).sort().join("");
  if (letters !== "ABCDE") fail(`Alternativas incompletas: ${question.codigo}`);
  if (!Object.hasOwn(question.alternativas, question.gabarito)) fail(`Gabarito inválido: ${question.codigo}`);
}

const newMaterialIds = ["sim-emilia-2026-tdas-pt03", "sim-emilia-2026-tdas-pt05", "sim-emilia-2026-tdas-pt15"];
for (const id of newMaterialIds) {
  const material = bundle.materials.find(item => item.id === id);
  if (!material || material.questoes.length !== 1) fail(`Material incremental ausente ou com quantidade inesperada: ${id}`);
  const catalogMaterial = catalog.materials.find(item => item.id === id);
  if (!catalogMaterial || catalogMaterial.quantidade_questoes !== 1) fail(`Catálogo incremental inconsistente: ${id}`);
}

const replacements = [
  "sim-emilia-2026-tdas-arq01-378",
  "sim-emilia-2026-tdas-arq01-379",
  "sim-emilia-2026-tdas-mat01-399"
];
for (const id of replacements) {
  const occurrences = questions.filter(item => item.question.id === id);
  if (occurrences.length !== 1 || occurrences[0].question.status_editorial !== "Ajustada") fail(`Substituição não aplicada: ${id}`);
}

const bundleScriptPosition = index.indexOf("assets/bundle-fetch.js");
const updateScriptPosition = index.indexOf("assets/data-updates.js");
const appScriptPosition = index.indexOf("assets/app-v3.js");
if (bundleScriptPosition < 0 || updateScriptPosition < 0 || appScriptPosition < 0) fail("Scripts obrigatórios não estão referenciados no HTML.");
if (!(bundleScriptPosition < updateScriptPosition && updateScriptPosition < appScriptPosition)) fail("A ordem dos scripts de dados está incorreta.");
if (!updateScript.includes("CompressionStream") || !updateScript.includes("DecompressionStream")) fail("Camada incremental não recompõe o pacote compactado.");

console.log("✓ Atualização incremental válida: 3 correções, 3 novas questões, 12 materiais, 183 publicadas e 570 no Banco Mestre.");
