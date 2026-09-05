import fs from "node:fs";
import path from "node:path";

const [beforeArg, afterArg] = process.argv.slice(2);
if (!beforeArg || !afterArg) throw new Error("Uso: node scripts/audit-notion-release-delta.mjs <release-before> <release-after>");

const beforeRoot = path.resolve(beforeArg);
const afterRoot = path.resolve(afterArg);
const readJSON = file => JSON.parse(fs.readFileSync(file, "utf8"));
const clean = value => String(value ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
const stable = value => JSON.stringify(value ?? null);

function loadRelease(root) {
  const catalog = readJSON(path.join(root, "catalogo.json"));
  const questions = new Map();
  const materials = new Map();
  for (const meta of catalog.materials || []) {
    const materialPath = path.join(root, "materials", path.basename(String(meta.file || "")));
    const material = readJSON(materialPath);
    materials.set(material.id, material);
    for (const q of material.questoes || []) {
      const key = clean(q.codigo) || clean(q.id);
      questions.set(key, {q, material});
    }
  }
  return {catalog, questions, materials};
}

const before = loadRelease(beforeRoot);
const after = loadRelease(afterRoot);
const allKeys = [...new Set([...before.questions.keys(), ...after.questions.keys()])].sort();
const added = [];
const removed = [];
const changed = [];
const fields = [
  "disciplina", "assunto", "subassunto", "bloco", "enunciado", "texto_base", "alternativas", "gabarito",
  "comentario", "comentarios_alternativas", "fundamento", "pegadinha", "observacoes", "formato_questao",
  "fonte_oficial", "fonte_consolidada", "possui_imagem", "descricao_imagem", "pagina_pdf",
];
const sensitive = new Set(["disciplina", "assunto", "subassunto", "bloco", "formato_questao", "gabarito"]);
const fieldCounts = Object.fromEntries(fields.map(field => [field, 0]));
const sensitiveRows = [];

for (const key of allKeys) {
  const left = before.questions.get(key);
  const right = after.questions.get(key);
  if (!left && right) { added.push(key); continue; }
  if (left && !right) { removed.push(key); continue; }
  const changedFields = [];
  for (const field of fields) {
    if (stable(left.q[field]) !== stable(right.q[field])) {
      fieldCounts[field] += 1;
      changedFields.push(field);
    }
  }
  const materialFields = ["cargo", "codigo_cargo", "disciplina", "bloco", "tipo_material", "nome"];
  for (const field of materialFields) {
    if (stable(left.material[field]) !== stable(right.material[field])) changedFields.push(`material.${field}`);
  }
  if (changedFields.length) {
    changed.push({key, fields: changedFields});
    if (changedFields.some(field => sensitive.has(field) || field.startsWith("material."))) {
      sensitiveRows.push({
        key,
        fields: changedFields,
        before: {
          material: left.material.nome,
          cargo: left.material.cargo,
          codigo_cargo: left.material.codigo_cargo,
          disciplina: left.q.disciplina,
          assunto: left.q.assunto,
          subassunto: left.q.subassunto,
          bloco: left.q.bloco,
          formato: left.q.formato_questao,
          gabarito: left.q.gabarito,
        },
        after: {
          material: right.material.nome,
          cargo: right.material.cargo,
          codigo_cargo: right.material.codigo_cargo,
          disciplina: right.q.disciplina,
          assunto: right.q.assunto,
          subassunto: right.q.subassunto,
          bloco: right.q.bloco,
          formato: right.q.formato_questao,
          gabarito: right.q.gabarito,
        },
      });
    }
  }
}

const materialChanges = [];
for (const id of [...new Set([...before.materials.keys(), ...after.materials.keys()])].sort()) {
  const left = before.materials.get(id);
  const right = after.materials.get(id);
  if (!left || !right) continue;
  const changedFields = ["cargo", "codigo_cargo", "disciplina", "bloco", "tipo_material", "nome"]
    .filter(field => stable(left[field]) !== stable(right[field]));
  if (changedFields.length) materialChanges.push({id, fields: changedFields, before: Object.fromEntries(changedFields.map(field => [field, left[field]])), after: Object.fromEntries(changedFields.map(field => [field, right[field]]))});
}

console.log(`AUDITORIA DELTA NOTION: ${added.length} adicionada(s), ${removed.length} removida(s), ${changed.length} alterada(s).`);
console.log(`Campos alterados: ${Object.entries(fieldCounts).filter(([, count]) => count).map(([field, count]) => `${field}=${count}`).join(", ") || "nenhum"}.`);
if (materialChanges.length) console.log(`Materiais com metadados alterados (${materialChanges.length}): ${JSON.stringify(materialChanges.slice(0, 50))}`);
if (sensitiveRows.length) console.log(`Questões com alterações sensíveis (${sensitiveRows.length}): ${JSON.stringify(sensitiveRows.slice(0, 200))}`);
if (added.length) console.log(`Questões adicionadas (${added.length}): ${added.slice(0, 200).join(", ")}`);
if (removed.length) console.log(`Questões removidas (${removed.length}): ${removed.slice(0, 200).join(", ")}`);

if (removed.length) throw new Error(`Delta do Notion tentou remover ${removed.length} questão(ões) já publicadas.`);
