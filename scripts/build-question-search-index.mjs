import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "data/release/catalogo.json");
const outputPath = path.join(root, "data/release/question-search-index.json");
const formatOutputPath = path.join(root, "data/release/question-format-index.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
const clean = value => String(value || "").replace(/\s+/g, " ").trim();
const items = [];
const formats = {};
const formatSummary = {"true-false": 0, "multiple-choice": 0};
const seen = new Set();

function classifyQuestionFormat(question, material, meta) {
  const declared = normalize(question?.formato_questao || material?.formato_questao || meta?.formato_questao);
  if (declared.includes("certo") && declared.includes("errado")) return "true-false";
  if (declared.includes("multipla") || declared.includes("escolha") || declared.includes("alternativa")) return "multiple-choice";

  const alternatives = question?.alternativas && typeof question.alternativas === "object" && !Array.isArray(question.alternativas)
    ? Object.entries(question.alternativas).filter(([key, value]) => String(key || "").trim() && String(value ?? "").trim())
    : [];
  const tokens = new Set(alternatives.flatMap(([key, value]) => [normalize(key), normalize(value)]));
  if (alternatives.length === 2 && tokens.has("certo") && tokens.has("errado")) return "true-false";
  if (alternatives.length >= 2) return "multiple-choice";
  return null;
}

for (const meta of catalog.materials || []) {
  const relative = String(meta.file || "").replace(/^\.\//, "");
  if (!relative) throw new Error(`Material sem arquivo: ${meta.id || meta.nome || "desconhecido"}`);
  const file = path.resolve(root, relative);
  const relativeToRoot = path.relative(root, file);
  const outsideRoot = relativeToRoot.startsWith(`..${path.sep}`) || relativeToRoot === ".." || path.isAbsolute(relativeToRoot);
  if (outsideRoot || !fs.existsSync(file)) throw new Error(`Arquivo de material inválido: ${relative}`);
  const material = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const question of material.questoes || []) {
    if (!question.id || seen.has(question.id)) throw new Error(`ID de questão ausente ou duplicado: ${question.id || "sem-id"}`);
    seen.add(question.id);
    const discipline = question.disciplina || material.disciplina || meta.disciplina || "";
    const subject = question.assunto || "";
    const source = material.fonte || meta.fonte || "";
    const year = material.ano || meta.ano || "";
    const alternatives = Object.values(question.alternativas || {}).join(" ");
    const search = normalize([
      material.nome, discipline, subject, source, year, question.texto_base, question.enunciado,
      alternatives, question.comentario, question.fundamento, question.pegadinha,
    ].filter(Boolean).join(" "));
    const format = classifyQuestionFormat(question, material, meta);
    if (!format) throw new Error(`Formato de questão não reconhecido: ${question.id} (${material.id || meta.id}).`);
    formats[question.id] = format;
    formatSummary[format] += 1;
    items.push({
      id: question.id,
      material_id: material.id || meta.id,
      discipline,
      subject,
      source,
      year,
      snippet: clean(question.enunciado).slice(0, 280),
      search,
    });
  }
}

const expectedIds = new Set(Object.keys(catalog.question_index || {}));
const missing = [...expectedIds].filter(id => !seen.has(id));
const unexpected = [...seen].filter(id => !expectedIds.has(id));
const missingFormats = [...expectedIds].filter(id => !formats[id]);
if (!expectedIds.size || items.length !== expectedIds.size || missing.length || unexpected.length || missingFormats.length || Object.keys(formats).length !== expectedIds.size) {
  throw new Error(`Índices divergentes: texto=${items.length}/${expectedIds.size}; formatos=${Object.keys(formats).length}/${expectedIds.size}; ausentes=${missing.length}; inesperados=${unexpected.length}; sem_formato=${missingFormats.length}.`);
}
const payload = {
  schema_version: "1.0",
  release_version: catalog.release_version || null,
  exported_at: catalog.exported_at || null,
  questions: items.length,
  items,
};
const formatPayload = {
  schema_version: "1.0",
  release_version: catalog.release_version || null,
  exported_at: catalog.exported_at || null,
  question_count: expectedIds.size,
  summary: formatSummary,
  formats,
};
fs.writeFileSync(outputPath, `${JSON.stringify(payload)}\n`);
fs.writeFileSync(formatOutputPath, `${JSON.stringify(formatPayload)}\n`);
console.log(`✓ Índice textual: ${items.length} questões, identidade 1:1 com o catálogo.`);
console.log(`✓ Índice de formato: ${formatSummary["true-false"]} C/E + ${formatSummary["multiple-choice"]} múltipla escolha = ${expectedIds.size}.`);
