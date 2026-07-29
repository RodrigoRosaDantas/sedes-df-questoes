import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "catalogo.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "data", "export-manifest.json"), "utf8"));
const fail = message => { throw new Error(message); };
const required = (value, label) => {
  if (typeof value !== "string" || !value.trim()) fail(`${label} ausente.`);
};

if (!Array.isArray(catalog.bundle_chunks) || !catalog.bundle_chunks.length) fail("Partes do bundle-base ausentes.");
const encoded = catalog.bundle_chunks.map(relative => {
  const filePath = path.join(root, relative.replace(/^\.\//, ""));
  if (!fs.existsSync(filePath)) fail(`Parte inexistente: ${relative}`);
  return fs.readFileSync(filePath, "utf8").trim();
}).join("");

const bundle = JSON.parse(zlib.gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"));
if (!Array.isArray(bundle.materials)) fail("Bundle-base sem materiais.");

const materialIds = new Set();
const questionIds = new Set();
const questionCodes = new Set();
let total = 0;

for (const material of bundle.materials) {
  required(material.id, "ID do material-base");
  if (materialIds.has(material.id)) fail(`Material-base duplicado: ${material.id}`);
  materialIds.add(material.id);
  if (!Array.isArray(material.questoes) || !material.questoes.length) fail(`Material-base sem questões: ${material.id}`);

  for (const question of material.questoes) {
    required(question.id, `ID em ${material.id}`);
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

if (bundle.materials.length !== manifest.release.materials || total !== manifest.release.questions) {
  fail(`Base divergente do manifesto: ${bundle.materials.length} materiais e ${total} questões.`);
}
if (bundle.materials.length !== 9 || total !== 180) fail(`Esperada base imutável de 9 materiais e 180 questões; encontrados ${bundle.materials.length} e ${total}.`);

console.log(`✓ Base válida e preservada: ${bundle.materials.length} materiais e ${total} questões.`);
