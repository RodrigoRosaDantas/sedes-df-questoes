import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative.replace(/^\.\//, "")), "utf8");
const fail = message => { throw new Error(message); };

const index = JSON.parse(read("data/consolidated/index.json"));
const loader = read("assets/consolidated-data-v2.js");

if (index.schema_version !== "1.2") fail(`Schema do índice inesperado: ${index.schema_version}`);
if (index.materials.length !== 26) fail(`Esperados 26 materiais adicionais; encontrados ${index.materials.length}.`);
if (Number(index.expected_questions) !== 390) fail(`O índice deve declarar 390 questões; declarou ${index.expected_questions}.`);

const expectedCodes = [
  "DFR01",
  ...Array.from({length: 16}, (_, index) => `PT${String(index + 1).padStart(2, "0")}`),
  "MUL01", "MUL02", "LEG01", "LEG02", "LEG03", "SOC01", "AS01", "AS02", "AS03",
];
const actualCodes = index.materials.map(material => material.code);
if (actualCodes.join(",") !== expectedCodes.join(",")) {
  fail(`Ordem/códigos dos materiais divergentes: ${actualCodes.join(", ")}`);
}

const globalCodes = new Set();
let totalQuestions = 0;

for (const material of index.materials) {
  if (!material.file.endsWith(".md")) fail(`${material.code}: somente arquivos Markdown consolidados são permitidos.`);
  const absolute = path.join(root, material.file.replace(/^\.\//, ""));
  if (!fs.existsSync(absolute)) fail(`${material.code}: arquivo ausente (${material.file}).`);
  const markdown = fs.readFileSync(absolute, "utf8").replace(/\r/g, "");
  const parts = markdown.split(/^###\s+([A-Z0-9]+-\d+)\s*$/gm);
  const questions = [];
  for (let index = 1; index < parts.length; index += 2) {
    questions.push({code: parts[index], body: parts[index + 1] || ""});
  }

  if (questions.length !== Number(material.count)) {
    fail(`${material.code}: esperadas ${material.count} questões; encontradas ${questions.length}.`);
  }

  const localCodes = new Set();
  for (const question of questions) {
    if (!question.code.startsWith(`${material.code}-`)) fail(`${material.code}: código fora do bloco (${question.code}).`);
    if (localCodes.has(question.code) || globalCodes.has(question.code)) fail(`Código duplicado: ${question.code}.`);
    localCodes.add(question.code);
    globalCodes.add(question.code);

    const body = question.body.trim();
    const firstAlternative = body.search(/^A\)\s+.+/m);
    if (firstAlternative <= 0 || !body.slice(0, firstAlternative).trim()) fail(`${question.code}: enunciado ausente.`);
    for (const letter of ["A", "B", "C", "D", "E"]) {
      const expression = new RegExp(`^${letter}\\)\\s+.+`, "m");
      if (!expression.test(body)) fail(`${question.code}: alternativa ${letter} ausente.`);
    }
    const answer = body.match(/^\*\*Gabarito:\*\*\s*(A|B|C|D|E|Certo|Errado|Anulada)\.?\s*$/mi)?.[1];
    if (!answer) fail(`${question.code}: gabarito ausente ou inválido.`);
    const comment = body.match(/^\*\*Comentário:\*\*\s*(.+)$/mi)?.[1]?.trim();
    if (!comment) fail(`${question.code}: comentário ausente.`);
  }
  totalQuestions += questions.length;
}

if (totalQuestions !== 390 || globalCodes.size !== 390) {
  fail(`Lote consolidado inválido: ${totalQuestions} questões e ${globalCodes.size} códigos únicos.`);
}

for (const expected of [
  "partialIds",
  "questoes !== 570",
  "materials.length !== 35",
  "banco_mestre: 870",
  "aguardando_exportacao: 300",
  "parseMarkdownMaterial",
  "validateMaterial",
]) {
  if (!loader.includes(expected)) fail(`Proteção ausente no carregador: ${expected}`);
}

for (const partialId of [
  "sim-emilia-2026-tdas-pt03",
  "sim-emilia-2026-tdas-pt05",
  "sim-emilia-2026-tdas-pt15",
]) {
  if (!loader.includes(partialId)) fail(`Material parcial não está protegido para substituição: ${partialId}`);
}

console.log(`✓ CONSOL01 validado: ${index.materials.length} materiais, ${totalQuestions} questões adicionais, fechamento previsto em 570 questões e 35 materiais.`);
