import "./build-release.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resolve = relative => path.join(root, relative.replace(/^\.\//, ""));
const readJSON = relative => JSON.parse(fs.readFileSync(resolve(relative), "utf8"));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const fail = message => { throw new Error(message); };
const indexPath = resolve("data/true-false/index.json");

if (!fs.existsSync(indexPath)) {
  console.log("✓ Nenhum lote Certo/Errado configurado; release-base preservada.");
  process.exit(0);
}

const index = readJSON("data/true-false/index.json");
const catalogPath = resolve("data/release/catalogo.json");
const manifestPath = resolve("data/release/manifest.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const knownIds = new Set(Object.keys(catalog.question_index || {}));
const knownCodes = new Set();

for (const meta of catalog.materials) {
  const material = readJSON(meta.file);
  for (const question of material.questoes || []) knownCodes.add(question.codigo);
}

function normalizedFormat(question, material) {
  const declared = question.formato_questao || material.formato_questao || material.formato || "";
  if (/certo\s*\/\s*errado/i.test(declared)) return "Certo / Errado";
  if (["Certo", "Errado"].includes(question.gabarito)) return "Certo / Errado";
  return "Múltipla escolha A–E";
}

function validateQuestion(question, material) {
  if (!question.id || !question.codigo || !question.enunciado) fail(`${material.id}: questão sem identificação ou enunciado.`);
  if (knownIds.has(question.id)) fail(`ID duplicado: ${question.id}`);
  if (knownCodes.has(question.codigo)) fail(`Código duplicado: ${question.codigo}`);
  const format = normalizedFormat(question, material);
  if (format === "Certo / Errado") {
    if (!["Certo", "Errado", "Anulada"].includes(question.gabarito)) fail(`${question.codigo}: gabarito C/E inválido.`);
    question.formato_questao = "Certo / Errado";
    question.alternativas = {Certo: "Certo", Errado: "Errado"};
  } else {
    for (const letter of ["A", "B", "C", "D", "E"]) {
      if (!question.alternativas?.[letter]) fail(`${question.codigo}: alternativa ${letter} ausente.`);
    }
    if (!["A", "B", "C", "D", "E", "Anulada"].includes(question.gabarito)) fail(`${question.codigo}: gabarito A–E inválido.`);
    question.formato_questao = "Múltipla escolha A–E";
  }
  const pendingComment = question.comentario_status === "pendente" || material.comentarios_status === "pendente";
  if (!question.comentario && !pendingComment) fail(`${question.codigo}: comentário ausente sem indicação editorial.`);
  if (pendingComment && material.tipo_material !== "prova") fail(`${question.codigo}: comentário pendente permitido somente em prova anterior.`);
  knownIds.add(question.id);
  knownCodes.add(question.codigo);
}

for (const entry of index.materials || []) {
  const sourcePath = entry.file;
  if (!sourcePath || !fs.existsSync(resolve(sourcePath))) fail(`Arquivo C/E ausente: ${sourcePath || "sem caminho"}`);
  const material = readJSON(sourcePath);
  if (!material.id || !material.nome || !Array.isArray(material.questoes)) fail(`${sourcePath}: material inválido.`);
  if (catalog.materials.some(item => item.id === material.id)) fail(`Material duplicado: ${material.id}`);
  material.formato_questao = material.formato_questao || "Certo / Errado";
  material.questoes.forEach(question => validateQuestion(question, material));
  material.quantidade_questoes = material.questoes.length;
  material.tempo_sugerido_minutos ||= material.questoes.length;
  const outputFile = `./data/release/materials/${material.id}.json`;
  const outputContent = `${JSON.stringify(material)}\n`;
  fs.writeFileSync(resolve(outputFile), outputContent);
  const {questoes, ...metadata} = material;
  catalog.materials.push({...metadata, file: outputFile});
  for (const question of questoes) catalog.question_index[question.id] = material.id;
}

catalog.summary.materials = catalog.materials.length;
catalog.summary.questoes = Object.keys(catalog.question_index).length;
catalog.summary.provas = catalog.materials.filter(item => String(item.tipo_material).toLowerCase() === "prova").length;
catalog.summary.simulados = catalog.materials.filter(item => String(item.tipo_material).toLowerCase() === "simulado").length;
catalog.source.criteria = `${catalog.summary.questoes} questões publicadas nos formatos A–E e Certo/Errado; ${catalog.summary.aguardando_auditoria} registros permanecem em auditoria editorial.`;
const catalogContent = `${JSON.stringify(catalog, null, 2)}\n`;
fs.writeFileSync(catalogPath, catalogContent);

const manifest = {
  schema_version: "2.0",
  release_version: catalog.release_version,
  generated_at: new Date().toISOString(),
  summary: catalog.summary,
  catalog_sha256: sha256(catalogContent),
  materials: catalog.materials.map(meta => {
    const content = fs.readFileSync(resolve(meta.file));
    return {id: meta.id, file: meta.file, questions: meta.quantidade_questoes, bytes: content.length, sha256: sha256(content)};
  }),
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`✓ Release híbrida gerada: ${catalog.summary.materials} materiais e ${catalog.summary.questoes} questões.`);
