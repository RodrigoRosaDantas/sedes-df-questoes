import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.join(root, "dist", "data", "release");
const manifestPath = path.join(root, "data", "notion", "quadrix-residual-density-20260816", "manifest.json");
const readJSON = file => JSON.parse(fs.readFileSync(file, "utf8"));
const clean = value => String(value ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const unique = values => [...new Set(values)];

const manifest = readJSON(manifestPath);
if (manifest.schema_version !== "1.0" || manifest.operation_id !== "SEDES-QDX-RESIDUAL-DENSITY-20260816") throw new Error("Manifesto residual ausente ou incompatível.");
if (!Array.isArray(manifest.mappings) || manifest.mappings.length !== Number(manifest.mapping_count) || Number(manifest.mapping_count) !== 5) throw new Error("Escopo do lote residual divergente.");
if (new Set(manifest.mappings.map(item => item.question_id)).size !== Number(manifest.distinct_questions) || Number(manifest.distinct_questions) !== 5) throw new Error("Quantidade de questões distintas do lote residual divergente.");

const catalog = readJSON(path.join(releaseDir, "catalogo.json"));
const editalMapPath = path.join(releaseDir, "edital-map-v1.json");
const editalMap = readJSON(editalMapPath);
const totals = manifest.catalog_totals || {};
if (
  Number(catalog.summary?.banco_mestre) !== Number(totals.banco_mestre) ||
  Number(catalog.summary?.questoes) !== Number(totals.public_questions) ||
  Number(catalog.summary?.materiais) !== Number(totals.materials) ||
  Number(catalog.summary?.provas) !== Number(totals.proofs) ||
  Number(catalog.summary?.simulados) !== Number(totals.simulations) ||
  Number(catalog.summary?.discursivas_consulta) !== Number(totals.discursive_display_items) ||
  Number(catalog.summary?.aguardando_auditoria) !== Number(totals.awaiting_audit)
) throw new Error("Catálogo mudou; o lote residual exige reauditoria editorial.");

const materialsDir = path.join(releaseDir, "materials");
const questionById = new Map();
for (const meta of catalog.materials || []) {
  const file = path.join(materialsDir, path.basename(String(meta.file || "")));
  const material = readJSON(file);
  for (const q of material.questoes || []) questionById.set(q.id, {q, material});
}

const editalItems = new Map((editalMap.sections || []).flatMap(section => (section.items || []).map(item => [item.id, item])));
const formats = editalMap.question_formats || {};
const mappedBefore = new Set([...editalItems.values()].flatMap(item => item.question_ids || []));
let newlyMapped = 0;

for (const mapping of manifest.mappings) {
  const record = questionById.get(mapping.question_id);
  if (!record || !catalog.question_index?.[mapping.question_id]) throw new Error(`Questão pública ausente: ${mapping.question_id}.`);
  if (!String(record.material.fonte || "").toLocaleLowerCase("pt-BR").includes("quadrix")) throw new Error(`${mapping.question_id}: fonte não é Instituto Quadrix.`);
  if (clean(record.q.gabarito) !== clean(mapping.answer)) throw new Error(`${mapping.question_id}: gabarito diverge do manifesto.`);
  if (sha256(clean(record.q.enunciado)) !== mapping.prompt_sha256) throw new Error(`${mapping.question_id}: fingerprint do enunciado diverge do manifesto.`);
  if (formats[mapping.question_id] !== mapping.format) throw new Error(`${mapping.question_id}: formato ${formats[mapping.question_id]} diverge de ${mapping.format}.`);
  const item = editalItems.get(mapping.item_id);
  if (!item) throw new Error(`Item do edital inexistente: ${mapping.item_id}.`);
  if (!mappedBefore.has(mapping.question_id)) newlyMapped += 1;
  item.question_ids = unique([...(item.question_ids || []), mapping.question_id]);
  item.exam_question_ids = unique([...(item.exam_question_ids || []), mapping.question_id]);
  if (mapping.format === "A–E") item.ae_question_ids = unique([...(item.ae_question_ids || []), mapping.question_id]);
  else if (mapping.format === "Certo/Errado") item.ce_question_ids = unique([...(item.ce_question_ids || []), mapping.question_id]);
  else throw new Error(`${mapping.question_id}: formato não suportado no lote residual.`);
}
if (newlyMapped !== Number(manifest.newly_mapped_distinct_questions)) throw new Error(`Questões recém-mapeadas divergentes: ${newlyMapped}.`);

for (const item of editalItems.values()) {
  for (const field of ["question_ids", "ae_question_ids", "ce_question_ids", "exam_question_ids"]) item[field] = unique(item[field] || []);
  item.question_count = item.question_ids.length;
  item.ae_question_count = item.ae_question_ids.length;
  item.ce_question_count = item.ce_question_ids.length;
  item.exam_question_count = item.exam_question_ids.length;
}

const unionForItems = (ids, field) => unique((ids || []).flatMap(id => editalItems.get(id)?.[field] || []));
for (const target of Object.values(editalMap.targets || {})) {
  target.general_question_ids = unionForItems(target.general_item_ids, "question_ids");
  target.general_ae_question_ids = unionForItems(target.general_item_ids, "ae_question_ids");
  target.general_ce_question_ids = unionForItems(target.general_item_ids, "ce_question_ids");
  target.general_exam_question_ids = unionForItems(target.general_item_ids, "exam_question_ids");
  target.specific_question_ids = unionForItems(target.specific_item_ids, "question_ids");
  target.specific_ae_question_ids = unionForItems(target.specific_item_ids, "ae_question_ids");
  target.specific_ce_question_ids = unionForItems(target.specific_item_ids, "ce_question_ids");
  target.specific_exam_question_ids = unionForItems(target.specific_item_ids, "exam_question_ids");
  const maria = unique(editalItems.get("geral-df-maria-penha")?.exam_question_ids || []);
  target.maria_da_penha_exam_question_ids = maria;
  const bp = editalMap.objective_blueprint || {};
  const deficits = {
    general: Math.max(0, Number(bp.general_questions || 20) - target.general_exam_question_ids.length),
    specific: Math.max(0, Number(bp.specific_questions || 40) - target.specific_exam_question_ids.length),
    maria_da_penha: Math.max(0, Number(bp.maria_da_penha_minimum_questions || 3) - maria.length),
  };
  target.readiness = {
    ready: deficits.general === 0 && deficits.specific === 0 && deficits.maria_da_penha === 0,
    deficits,
    general_exam: target.general_exam_question_ids.length,
    general_ae: target.general_ae_question_ids.length,
    general_ce: target.general_ce_question_ids.length,
    specific_exam: target.specific_exam_question_ids.length,
    specific_ae: target.specific_ae_question_ids.length,
    specific_ce: target.specific_ce_question_ids.length,
    maria_da_penha_exam: maria.length,
  };
}

for (const code of ["202", "400"]) {
  const target = editalMap.targets?.[code];
  const generalSections = new Set(editalMap.general_section_ids || []);
  const specificItems = new Set(target?.specific_item_ids || []);
  const topics = (editalMap.sections || [])
    .filter(section => generalSections.has(section.id) || (section.items || []).some(item => specificItems.has(item.id)))
    .flatMap(section => (section.items || []).filter(item => generalSections.has(section.id) || specificItems.has(item.id)));
  const empty = topics.filter(item => Number(item.question_count || 0) < 1).map(item => item.id);
  if (empty.length) throw new Error(`Cargo ${code} possui tópicos vazios: ${empty.join(", ")}.`);
}

for (const [itemId, minimum] of Object.entries(manifest.expected_minimums || {})) {
  const count = Number(editalItems.get(itemId)?.question_count || 0);
  if (count < Number(minimum)) throw new Error(`${itemId}: cobertura ${count}, mínimo ${minimum}.`);
}
for (const [itemId, exact] of Object.entries(manifest.protected_singletons || {})) {
  const count = Number(editalItems.get(itemId)?.question_count || 0);
  if (count !== Number(exact)) throw new Error(`${itemId}: singleton protegido mudou de ${exact} para ${count}; exige revisão humana.`);
}

const mappedIds = new Set([...editalItems.values()].flatMap(item => item.question_ids || []));
const expectedQuestions = Number(totals.public_questions);
if (
  mappedIds.size !== Number(manifest.expected_mapped_questions) ||
  expectedQuestions - mappedIds.size !== Number(manifest.expected_unmapped_questions)
) throw new Error(`Mapa final inesperado: ${mappedIds.size} mapeadas / ${expectedQuestions - mappedIds.size} não mapeadas.`);

editalMap.generated_at = manifest.captured_at;
editalMap.summary = {...(editalMap.summary || {}), mapped_questions: mappedIds.size, unmapped_questions: expectedQuestions - mappedIds.size};
fs.writeFileSync(editalMapPath, `${JSON.stringify(editalMap, null, 2)}\n`);

const receipt = {
  schema_version: "1.0",
  operation_id: manifest.operation_id,
  status: "success",
  catalog_additions: 0,
  mapping_pairs: manifest.mappings.length,
  distinct_questions: new Set(manifest.mappings.map(item => item.question_id)).size,
  newly_mapped_distinct_questions: newlyMapped,
  mapped_questions: mappedIds.size,
  unmapped_questions: expectedQuestions - mappedIds.size,
  expected_minimums: manifest.expected_minimums,
  protected_singletons: manifest.protected_singletons,
};
fs.writeFileSync(path.join(releaseDir, "quadrix-residual-density-20260816-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`✓ Residual density: 0 novas questões; ${receipt.mapping_pairs} vínculos em ${receipt.distinct_questions} questões Quadrix; ${receipt.newly_mapped_distinct_questions} novas no mapa; ${receipt.mapped_questions} mapeadas.`);
