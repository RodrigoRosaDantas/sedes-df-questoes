import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "catalogo.json"), "utf8"));
const fail = message => { throw new Error(message); };
const required = (value, label) => {
  if (typeof value !== "string" || !value.trim()) fail(`${label} ausente.`);
};

if (!Array.isArray(catalog.materials) || !catalog.materials.length) fail("Catálogo sem materiais.");
required(catalog.bundle, "Bundle");
const bundlePath = path.join(root, catalog.bundle.replace(/^\.\//, ""));
if (!fs.existsSync(bundlePath)) fail("Bundle compactado inexistente.");
const packed = Buffer.from(fs.readFileSync(bundlePath, "utf8").trim(), "base64");
const bundle = JSON.parse(zlib.gunzipSync(packed).toString("utf8"));
if (!Array.isArray(bundle.materials)) fail("Bundle sem materiais.");

const materialIds = new Set();
const questionIds = new Set();
const questionCodes = new Set();
let total = 0;
let provas = 0;
let simulados = 0;

for (const meta of catalog.materials) {
  required(meta.id, "ID do material");
  if (materialIds.has(meta.id)) fail(`Material duplicado: ${meta.id}`);
  materialIds.add(meta.id);
  if (meta.tipo_material === "prova") provas++;
  else if (meta.tipo_material === "simulado") simulados++;
  else fail(`Tipo inválido: ${meta.id}`);

  const material = bundle.materials.find(item => item.id === meta.id);
  if (!material) fail(`Material ausente no bundle: ${meta.id}`);
  if (!Array.isArray(material.questoes) || material.questoes.length !== meta.quantidade_questoes) fail(`Quantidade divergente: ${meta.id}`);

  for (const question of material.questoes) {
    required(question.id, `ID em ${meta.id}`);
    required(question.codigo, `Código de ${question.id}`);
    required(question.enunciado, `Enunciado de ${question.id}`);
    required(question.comentario, `Comentário de ${question.id}`);
    if (questionIds.has(question.id)) fail(`ID duplicado: ${question.id}`);
    if (questionCodes.has(question.codigo)) fail(`Código duplicado: ${question.codigo}`);
    questionIds.add(question.id);
    questionCodes.add(question.codigo);
    const keys = Object.keys(question.alternativas || {}).sort().join("");
    if (keys !== "ABCDE") fail(`Alternativas incompletas: ${question.id}`);
    for (const letter of "ABCDE") required(question.alternativas[letter], `Alternativa ${letter} de ${question.id}`);
    if (!"ABCDE".includes(question.gabarito)) fail(`Gabarito inválido: ${question.id}`);
  }
  total += material.questoes.length;
}

if (bundle.materials.length !== catalog.materials.length) fail("Materiais excedentes ou ausentes no bundle.");
if (catalog.summary.materiais !== catalog.materials.length) fail("Resumo de materiais divergente.");
if (catalog.summary.questoes !== total) fail("Resumo de questões divergente.");
if (catalog.summary.provas !== provas || catalog.summary.simulados !== simulados) fail("Resumo por tipo divergente.");
if (total !== 180 || catalog.materials.length !== 9) fail(`Publicação esperada: 9 materiais e 180 questões; encontrada: ${catalog.materials.length} e ${total}.`);

console.log(`✓ Catálogo válido: ${catalog.materials.length} materiais, ${total} questões, ${simulados} simulados e ${provas} provas.`);
