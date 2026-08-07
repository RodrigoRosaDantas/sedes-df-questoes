import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "data/release/catalogo.json");
const outputPath = path.join(root, "data/release/question-search-index.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
const clean = value => String(value || "").replace(/\s+/g, " ").trim();
const items = [];
const seen = new Set();

for (const meta of catalog.materials || []) {
  const relative = String(meta.file || "").replace(/^\.\//, "");
  if (!relative) throw new Error(`Material sem arquivo: ${meta.id || meta.nome || "desconhecido"}`);
  const file = path.resolve(root, relative);
  if (!file.startsWith(root) || !fs.existsSync(file)) throw new Error(`Arquivo de material inválido: ${relative}`);
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

const expected = Object.keys(catalog.question_index || {}).length;
if (!expected || items.length !== expected) throw new Error(`Índice textual divergente: ${items.length} itens para ${expected} questões catalogadas.`);
const payload = {
  schema_version: "1.0",
  release_version: catalog.release_version || null,
  exported_at: catalog.exported_at || null,
  questions: items.length,
  items,
};
fs.writeFileSync(outputPath, `${JSON.stringify(payload)}\n`);
console.log(`✓ Índice textual: ${items.length} questões.`);
