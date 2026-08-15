import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.join(root, "dist", "data", "release");
const source = path.join(release, "catalogo.json");
const target = path.join(release, "content-model-v1.json");
if (!fs.existsSync(source)) throw new Error("Catálogo público ausente para normalização.");
const catalog = JSON.parse(fs.readFileSync(source, "utf8"));
const materialId = raw => {
  if (typeof raw === "string") return raw;
  const meta = raw || {};
  return meta.material_id || meta.materialId || meta.material || meta.id_material || null;
};
const materials = (catalog.materials || []).map(item => ({
  id: item.id,
  name: item.nome || null,
  type: item.tipo_material || null,
  discipline: item.disciplina || null,
  cargo: item.codigo_cargo || null,
  year: item.ano || null,
  source: item.fonte || null,
  file: item.file || null,
}));
const questions = Object.entries(catalog.question_index || {}).map(([id, raw]) => {
  const meta = typeof raw === "string" ? {} : (raw || {});
  return {
    id,
    code: meta.codigo || meta.code || id,
    material_id: materialId(raw),
    discipline: meta.disciplina || meta.discipline || null,
  };
});
const relations = questions.filter(item => item.material_id).map(item => ({material_id: item.material_id, question_id: item.id}));
const payload = {
  schema: 1,
  source: "catalogo.json",
  material_count: materials.length,
  question_count: questions.length,
  relation_count: relations.length,
  materials,
  questions,
  material_question: relations,
};
fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`✓ Modelo normalizado gerado: ${materials.length} materiais, ${questions.length} questões, ${relations.length} relações.`);
