import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resolve = relative => path.join(root, relative.replace(/^\.\//, ""));
const read = relative => fs.readFileSync(resolve(relative), "utf8");
const readJSON = relative => JSON.parse(read(relative));
const fail = message => { throw new Error(message); };
const clean = value => String(value || "")
  .replace(/\r/g, "")
  .replace(/^\s+|\s+$/g, "")
  .replace(/\n{3,}/g, "\n\n");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

const config = readJSON("data/release-config.json");
const baseCatalog = readJSON("data/catalogo.json");
const update = readJSON("data/updates/update-2026-07-29.json");
const consolidatedIndex = readJSON("data/consolidated/index.json");
const partialIds = new Set([
  "sim-emilia-2026-tdas-pt03",
  "sim-emilia-2026-tdas-pt05",
  "sim-emilia-2026-tdas-pt15",
]);

function reconstructBaseBundle() {
  const encoded = baseCatalog.bundle_chunks
    .map(relative => read(relative).trim())
    .join("");
  return JSON.parse(zlib.gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"));
}

function applyIncrementalUpdate(bundle) {
  for (const patch of update.materials || []) {
    let material = bundle.materials.find(item => item.id === patch.id);
    const metadata = Object.fromEntries(
      Object.entries(patch).filter(([key]) => !["mode", "questoes"].includes(key)),
    );
    if (!material) {
      material = {...metadata, questoes: []};
      bundle.materials.push(material);
    } else {
      Object.assign(material, metadata);
    }
    for (const question of patch.questoes || []) {
      const position = material.questoes.findIndex(
        item => item.id === question.id || item.codigo === question.codigo,
      );
      if (position >= 0) material.questoes[position] = question;
      else material.questoes.push(question);
    }
  }
  return bundle;
}

function extractTextBase(markdown) {
  const match = markdown.match(
    /##\s+Texto(?: de apoio|-base)[^\n]*\n([\s\S]*?)(?=\n##\s+Questões|\n###\s+[A-Z0-9]+-\d+|$)/i,
  );
  return match ? clean(match[1].replace(/^>\s?/gm, "")) : "";
}

function parseMarkdownQuestion(code, block, meta, textBase) {
  const alternatives = {};
  const prompt = [];
  const comments = [];
  const foundations = [];
  const notes = [];
  let mode = "prompt";
  let currentAlternative = "";
  let answer = "";

  for (const raw of clean(block).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const alternative = line.match(/^([A-E])\)\s*(.*)$/);
    if (alternative) {
      currentAlternative = alternative[1];
      alternatives[currentAlternative] = alternative[2].trim();
      mode = "alternative";
      continue;
    }
    const answerMatch = line.match(/^\*\*Gabarito:\*\*\s*(A|B|C|D|E|Certo|Errado|Anulada)\.?\s*$/i);
    if (answerMatch) {
      answer = answerMatch[1][0].toUpperCase() + answerMatch[1].slice(1).toLowerCase();
      mode = "answer";
      currentAlternative = "";
      continue;
    }
    const commentMatch = line.match(/^\*\*Comentário:\*\*\s*(.*)$/i);
    if (commentMatch) {
      comments.push(commentMatch[1]);
      mode = "comment";
      currentAlternative = "";
      continue;
    }
    const foundationMatch = line.match(/^\*\*Fundamento(?: legal)?:\*\*\s*(.*)$/i);
    if (foundationMatch) {
      foundations.push(foundationMatch[1]);
      mode = "foundation";
      currentAlternative = "";
      continue;
    }
    const noteMatch = line.match(/^\*\*(?:Origem final|Origem|Observação|Observações):\*\*\s*(.*)$/i);
    if (noteMatch) {
      notes.push(noteMatch[1]);
      mode = "notes";
      currentAlternative = "";
      continue;
    }
    if (mode === "alternative" && currentAlternative) alternatives[currentAlternative] += ` ${line}`;
    else if (mode === "comment") comments.push(line);
    else if (mode === "foundation") foundations.push(line);
    else if (mode === "answer" || mode === "notes") notes.push(line.replace(/^\*\*|\*\*$/g, ""));
    else prompt.push(line);
  }

  const number = Number(code.match(/(\d+)$/)?.[1] || 0);
  return {
    id: `consol-${meta.code.toLowerCase()}-${String(number).padStart(2, "0")}`,
    codigo: `CONSOL-${meta.code}-${String(number).padStart(2, "0")}`,
    numero: number,
    assunto: meta.name.replace(/^Simulado\s+[A-Z0-9]+\s+—\s+/, ""),
    subassunto: "",
    texto_base: textBase,
    enunciado: clean(prompt.join(" ")),
    alternativas: Object.fromEntries(
      ["A", "B", "C", "D", "E"].map(letter => [letter, clean(alternatives[letter])]),
    ),
    gabarito: answer,
    comentario: clean(comments.join(" ")),
    fundamento: clean(foundations.join(" ")),
    pegadinha: "",
    observacoes: clean(notes.join(" ")),
    fonte_consolidada: meta.source_url,
    auditoria: "CONSOL01 — versão final saneada",
  };
}

function materialShell(meta, questions) {
  return {
    id: `sim-emilia-2026-tdas-${meta.code.toLowerCase()}`,
    tipo_material: "simulado",
    fonte: "Emília Adelino — CONSOL01",
    nome: meta.name,
    ano: 2026,
    orgao: "SEDES/DF",
    cargo: "TDAS — Técnico Administrativo",
    codigo_cargo: "202",
    disciplina: meta.discipline,
    bloco: meta.block,
    quantidade_questoes: questions.length,
    tempo_sugerido_minutos: questions.length * 2,
    status: "publicado",
    source_url: meta.source_url,
    questoes: questions,
  };
}

function parseConsolidatedMaterial(meta) {
  const source = read(meta.file);
  if (meta.file.endsWith(".json")) return JSON.parse(source);
  const markdown = source.replace(/\r/g, "");
  const parts = markdown.split(/^###\s+([A-Z0-9]+-\d+)\s*$/gm);
  const textBase = extractTextBase(markdown);
  const questions = [];
  for (let index = 1; index < parts.length; index += 2) {
    questions.push(parseMarkdownQuestion(parts[index], parts[index + 1] || "", meta, textBase));
  }
  return materialShell(meta, questions);
}

function validateMaterial(material, expectedCount = null) {
  if (!material?.id || !material?.nome || !material?.disciplina) fail("Material sem metadados essenciais.");
  if (!Array.isArray(material.questoes)) fail(`${material.id}: lista de questões ausente.`);
  if (expectedCount !== null && material.questoes.length !== Number(expectedCount)) {
    fail(`${material.id}: esperado ${expectedCount}, encontrado ${material.questoes.length}.`);
  }
  const localIds = new Set();
  const localCodes = new Set();
  for (const question of material.questoes) {
    if (!question.id || !question.codigo || !question.enunciado || !question.comentario) {
      fail(`${material.id}: questão incompleta (${question.codigo || question.id || "sem código"}).`);
    }
    if (localIds.has(question.id) || localCodes.has(question.codigo)) fail(`${material.id}: questão duplicada.`);
    localIds.add(question.id);
    localCodes.add(question.codigo);
    for (const letter of ["A", "B", "C", "D", "E"]) {
      if (!question.alternativas?.[letter]) fail(`${question.codigo}: alternativa ${letter} ausente.`);
    }
    if (!["A", "B", "C", "D", "E", "Certo", "Errado", "Anulada"].includes(question.gabarito)) {
      fail(`${question.codigo}: gabarito inválido.`);
    }
  }
  material.quantidade_questoes = material.questoes.length;
  material.tempo_sugerido_minutos = material.tempo_sugerido_minutos || material.questoes.length * 2;
  return material;
}

const baseBundle = applyIncrementalUpdate(reconstructBaseBundle());
const retained = baseBundle.materials.filter(material => !partialIds.has(material.id));
const consolidated = consolidatedIndex.materials.map(meta => validateMaterial(parseConsolidatedMaterial(meta), meta.count));
const materials = [...retained, ...consolidated];

const globalIds = new Set();
const globalCodes = new Set();
let totalQuestions = 0;
for (const material of materials) {
  validateMaterial(material);
  for (const question of material.questoes) {
    if (globalIds.has(question.id)) fail(`ID global duplicado: ${question.id}`);
    if (globalCodes.has(question.codigo)) fail(`Código global duplicado: ${question.codigo}`);
    globalIds.add(question.id);
    globalCodes.add(question.codigo);
    totalQuestions += 1;
  }
}

if (materials.length !== Number(config.expected_materials)) {
  fail(`Esperados ${config.expected_materials} materiais; encontrados ${materials.length}.`);
}
if (totalQuestions !== Number(config.expected_questions)) {
  fail(`Esperadas ${config.expected_questions} questões; encontradas ${totalQuestions}.`);
}

const outputDir = resolve("data/release");
const materialsDir = path.join(outputDir, "materials");
fs.rmSync(outputDir, {recursive: true, force: true});
fs.mkdirSync(materialsDir, {recursive: true});

const questionIndex = {};
const catalogMaterials = materials.map(material => {
  const fileName = `${material.id}.json`;
  const content = `${JSON.stringify(material)}\n`;
  fs.writeFileSync(path.join(materialsDir, fileName), content);
  for (const question of material.questoes) questionIndex[question.id] = material.id;
  const {questoes, ...metadata} = material;
  return {...metadata, file: `./data/release/materials/${fileName}`};
});

const exportedAt = new Date().toISOString();
const summary = {
  banco_mestre: Number(config.banco_mestre),
  materiais: materials.length,
  questoes: totalQuestions,
  aguardando_auditoria: Number(config.aguardando_auditoria),
  provas: materials.filter(material => String(material.tipo_material).toLowerCase() === "prova").length,
  simulados: materials.filter(material => String(material.tipo_material).toLowerCase() === "simulado").length,
};
const catalog = {
  schema_version: "5.0",
  release_version: config.release_version,
  exported_at: exportedAt,
  source: {
    name: "Banco Mestre — Provas e Simulados SEDES/DF",
    notion_url: baseCatalog.source.notion_url,
    criteria: `${config.expected_questions} questões consolidadas; ${config.aguardando_auditoria} registros permanecem em auditoria editorial.`,
    consolidated_source: config.source,
    consolidated_source_url: config.source_url,
  },
  summary,
  materials: catalogMaterials,
  question_index: questionIndex,
  manifest: "./data/release/manifest.json",
};
const catalogContent = `${JSON.stringify(catalog, null, 2)}\n`;
fs.writeFileSync(path.join(outputDir, "catalogo.json"), catalogContent);

const manifest = {
  schema_version: "1.0",
  release_version: config.release_version,
  generated_at: exportedAt,
  summary,
  catalog_sha256: sha256(catalogContent),
  materials: catalogMaterials.map(material => {
    const filePath = resolve(material.file);
    const content = fs.readFileSync(filePath);
    return {
      id: material.id,
      file: material.file,
      questions: material.quantidade_questoes,
      bytes: content.length,
      sha256: sha256(content),
    };
  }),
};
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`✓ Release ${config.release_version} gerada: ${materials.length} materiais, ${totalQuestions} questões e ${config.aguardando_auditoria} em auditoria.`);
