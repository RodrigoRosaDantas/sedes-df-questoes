import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "data/release/catalogo.json");
const materialsRoot = path.join(root, "data/release/materials");
const clean = value => String(value ?? "").trim();
const fail = message => { throw new Error(`Downloads de materiais: ${message}`); };

if (!fs.existsSync(catalogPath)) fail("catálogo público ausente.");
if (!fs.existsSync(materialsRoot)) fail("diretório de materiais ausente.");

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const materials = Array.isArray(catalog.materials) ? catalog.materials : [];
const questionIndex = catalog.question_index || {};
if (!materials.length) fail("nenhum material publicado no catálogo.");

const seenMaterialIds = new Set();
const seenFiles = new Set();
const seenQuestionIds = new Set();
let questionCount = 0;
let proofCount = 0;
let simulationCount = 0;
let commentedCount = 0;

for (const metadata of materials) {
  const materialId = clean(metadata?.id);
  const relativeFile = clean(metadata?.file).replace(/^\.\//, "");
  if (!materialId) fail("material sem ID.");
  if (!relativeFile) fail(`${materialId}: caminho do arquivo ausente.`);
  if (seenMaterialIds.has(materialId)) fail(`ID de material duplicado: ${materialId}.`);
  if (seenFiles.has(relativeFile)) fail(`arquivo associado a mais de um material: ${relativeFile}.`);
  seenMaterialIds.add(materialId);
  seenFiles.add(relativeFile);

  const absoluteFile = path.resolve(root, relativeFile);
  const allowedPrefix = `${path.resolve(materialsRoot)}${path.sep}`;
  if (!absoluteFile.startsWith(allowedPrefix)) fail(`${materialId}: caminho fora de data/release/materials.`);
  if (!fs.existsSync(absoluteFile)) fail(`${materialId}: arquivo inexistente (${relativeFile}).`);

  const material = JSON.parse(fs.readFileSync(absoluteFile, "utf8"));
  if (clean(material.id) !== materialId) fail(`${materialId}: ID interno diverge do catálogo.`);
  const materialType = clean(material.tipo_material || metadata.tipo_material).toLocaleLowerCase("pt-BR");
  if (materialType === "prova") proofCount += 1;
  else if (materialType === "simulado") simulationCount += 1;
  else fail(`${materialId}: tipo de material inválido (${materialType || "ausente"}).`);

  const questions = Array.isArray(material.questoes) ? material.questoes : [];
  if (!questions.length) fail(`${materialId}: material sem questões.`);
  if (Number(metadata.quantidade_questoes) !== questions.length) {
    fail(`${materialId}: catálogo informa ${metadata.quantidade_questoes}, mas o arquivo contém ${questions.length} questões.`);
  }

  for (const [index, question] of questions.entries()) {
    const questionId = clean(question?.id);
    const prompt = clean(question?.enunciado);
    const answer = clean(question?.gabarito);
    const number = clean(question?.numero_original ?? question?.numero ?? index + 1);
    if (!questionId) fail(`${materialId}: questão ${index + 1} sem ID.`);
    if (seenQuestionIds.has(questionId)) fail(`ID de questão duplicado: ${questionId}.`);
    seenQuestionIds.add(questionId);
    if (!number) fail(`${questionId}: numeração ausente para o caderno.`);
    if (!prompt) fail(`${questionId}: enunciado ausente para o caderno.`);
    if (!answer) fail(`${questionId}: gabarito ausente para a versão comentada.`);

    const entries = Array.isArray(question.alternativas)
      ? question.alternativas.map((text, alternativeIndex) => [String.fromCharCode(65 + alternativeIndex), text])
      : Object.entries(question.alternativas || {});
    if (!entries.length) fail(`${questionId}: alternativas ausentes.`);
    if (entries.some(([label, text]) => !clean(label) || !clean(text))) fail(`${questionId}: alternativa vazia.`);

    const trueFalse = entries.length === 2
      && entries.every(([label, text]) => ["Certo", "Errado"].includes(clean(label)) && clean(text) === clean(label));
    if (trueFalse && !["Certo", "Errado", "Anulada"].includes(answer)) {
      fail(`${questionId}: gabarito incompatível com Certo/Errado (${answer}).`);
    }
    if (!trueFalse && !["A", "B", "C", "D", "E", "Anulada"].includes(answer)) {
      fail(`${questionId}: gabarito incompatível com múltipla escolha (${answer}).`);
    }

    if (clean(question.comentario) || clean(question.fundamento) || clean(question.pegadinha)) commentedCount += 1;
    if (questionIndex[questionId] !== materialId) fail(`${questionId}: índice aponta para ${questionIndex[questionId] || "nenhum material"}, esperado ${materialId}.`);
    questionCount += 1;
  }
}

const indexedIds = Object.keys(questionIndex);
if (indexedIds.length !== questionCount) fail(`índice possui ${indexedIds.length} IDs para ${questionCount} questões.`);
if (Number(catalog.summary?.materiais) !== materials.length) fail("total de materiais do resumo diverge do catálogo.");
if (Number(catalog.summary?.questoes) !== questionCount) fail("total de questões do resumo diverge dos arquivos.");
if (Number(catalog.summary?.provas) !== proofCount) fail("total de provas do resumo diverge dos arquivos.");
if (Number(catalog.summary?.simulados) !== simulationCount) fail("total de simulados do resumo diverge dos arquivos.");
if (commentedCount !== questionCount) fail(`${questionCount - commentedCount} questão(ões) não possuem comentário, fundamento ou pegadinha para a versão comentada.`);

console.log(`✓ Downloads compatíveis: ${questionCount} questões em ${materials.length} materiais (${proofCount} provas e ${simulationCount} simulados), todos indexados e comentados.`);
