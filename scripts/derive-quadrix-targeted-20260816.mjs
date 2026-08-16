import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.join(root, "dist", "data", "release");
const snapshotDir = path.join(root, "data", "notion", "quadrix-targeted-20260816");
const readJSON = file => JSON.parse(fs.readFileSync(file, "utf8"));
const clean = value => String(value ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
const key = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const slug = value => key(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
const unique = values => [...new Set(values)];

const snapshotManifest = readJSON(path.join(snapshotDir, "manifest.json"));
if (snapshotManifest.operation_id !== "SEDES-QDX-TARGETED-IMPORT-20260816" || Number(snapshotManifest.expected_count) !== 22) throw new Error("Manifesto Quadrix direcionado inválido.");
const expectedCodes = snapshotManifest.expected_codes || [];
const expectedQuestions = Number(snapshotManifest.source?.expected_public_questions || 0);
const catalog = readJSON(path.join(releaseDir, "catalogo.json"));
if (Number(catalog.summary?.questoes || 0) !== expectedQuestions || Object.keys(catalog.question_index || {}).length !== expectedQuestions) {
  throw new Error(`Catálogo final divergente para o mapeamento Quadrix: ${catalog.summary?.questoes}/${expectedQuestions}.`);
}
const questionIndex = catalog.question_index || {};
const expectedIds = expectedCodes.map(slug);
for (const id of expectedIds) if (!questionIndex[id]) throw new Error(`Questão do lote Quadrix ausente do catálogo final: ${id}.`);

const editalMapPath = path.join(releaseDir, "edital-map-v1.json");
const editalMap = readJSON(editalMapPath);
const editalItems = new Map((editalMap.sections || []).flatMap(section => (section.items || []).map(item => [item.id, item])));
const id = code => slug(code);
const explicitAssignments = new Map([
  [id("PROVA-QDX-NOVACAP-2024-ADMINISTRADOR-400-086"), ["400-gp-5-9"]],
  [id("PROVA-QDX-NOVACAP-2024-ADMINISTRADOR-400-087"), ["400-gp-5-2"]],
  [id("PROVA-QDX-NOVACAP-2024-ADMINISTRADOR-400-088"), ["400-gp-5-7"]],
  [id("PROVA-QDX-NOVACAP-2024-ADMINISTRADOR-400-089"), ["400-gp-5-10"]],
  [id("PROVA-QDX-NOVACAP-2024-ADMINISTRADOR-400-090"), ["400-gp-5-9"]],
  [id("PROVA-QDX-NOVACAP-2024-ADMINISTRADOR-400-096"), ["400-afo-4-1"]],
  [id("PROVA-QDX-NOVACAP-2024-ADMINISTRADOR-400-097"), ["400-afo-4-3"]],
  [id("PROVA-QDX-NOVACAP-2024-ADMINISTRADOR-400-098"), ["400-afo-4-4"]],
  [id("PROVA-QDX-NOVACAP-2024-ADMINISTRADOR-400-099"), ["400-afo-4-2"]],
  [id("PROVA-QDX-NOVACAP-2024-ADMINISTRADOR-400-100"), ["400-afo-4-1"]],
  [id("PROVA-QDX-CRMTO-2023-ADMINISTRADOR-400-088"), ["400-gp-5-1"]],
  [id("PROVA-QDX-CRMTO-2023-ADMINISTRADOR-400-089"), ["400-gp-5-7"]],
  [id("PROVA-QDX-CRMTO-2023-ADMINISTRADOR-400-090"), ["400-gp-5-7"]],
  [id("PROVA-QDX-CRMTO-2023-ADMINISTRADOR-400-091"), ["400-gp-5-9"]],
  [id("PROVA-QDX-CRESSPR-2025-AGENTE-FISCAL-400-097"), ["edas-suas-1"]],
  [id("PROVA-QDX-CRESSPR-2025-AGENTE-FISCAL-400-098"), ["edas-suas-1"]],
  [id("PROVA-QDX-CRESSPR-2025-AGENTE-FISCAL-400-099"), ["edas-suas-6"]],
  [id("PROVA-QDX-CRESSPR-2025-AGENTE-FISCAL-400-100"), ["edas-suas-2", "tdas-suas-3"]],
  [id("PROVA-QDX-CRESSSC-2019-AGENTE-FISCAL-400-103"), ["edas-suas-1", "tdas-suas-2"]],
  [id("PROVA-QDX-CRESSSC-2019-AGENTE-FISCAL-400-104"), ["edas-suas-1", "tdas-suas-2"]],
  [id("PROVA-QDX-CRESSSC-2019-AGENTE-FISCAL-400-105"), ["edas-suas-2", "tdas-suas-3"]],
  [id("PROVA-QDX-CRESSSC-2019-AGENTE-FISCAL-400-106"), ["edas-suas-2", "tdas-suas-3"]],
]);
if (explicitAssignments.size !== expectedIds.length) throw new Error("Mapeamento explícito do lote Quadrix incompleto.");

const editalQuestionFormats = {...(editalMap.question_formats || {})};
for (const questionId of expectedIds) editalQuestionFormats[questionId] = "Certo/Errado";
for (const [questionId, itemIds] of explicitAssignments) {
  if (!questionIndex[questionId]) throw new Error(`Mapeamento Quadrix referencia questão inexistente: ${questionId}.`);
  for (const itemId of itemIds) {
    const item = editalItems.get(itemId);
    if (!item) throw new Error(`Item do edital inexistente no mapeamento Quadrix: ${itemId}.`);
    item.question_ids = unique([...(item.question_ids || []), questionId]);
    item.ce_question_ids = unique([...(item.ce_question_ids || []), questionId]);
    item.exam_question_ids = unique([...(item.exam_question_ids || []), questionId]);
  }
}
for (const item of editalItems.values()) {
  item.question_ids = unique(item.question_ids || []);
  item.ae_question_ids = unique(item.ae_question_ids || []);
  item.ce_question_ids = unique(item.ce_question_ids || []);
  item.exam_question_ids = unique(item.exam_question_ids || []);
  item.question_count = item.question_ids.length;
  item.ae_question_count = item.ae_question_ids.length;
  item.ce_question_count = item.ce_question_ids.length;
  item.exam_question_count = item.exam_question_ids.length;
}

const unionForItems = (itemIds, field) => unique((itemIds || []).flatMap(itemId => editalItems.get(itemId)?.[field] || []));
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
  const blueprint = editalMap.objective_blueprint || {};
  const deficits = {
    general: Math.max(0, Number(blueprint.general_questions || 20) - target.general_exam_question_ids.length),
    specific: Math.max(0, Number(blueprint.specific_questions || 40) - target.specific_exam_question_ids.length),
    maria_da_penha: Math.max(0, Number(blueprint.maria_da_penha_minimum_questions || 3) - maria.length),
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

const mappedIds = new Set([...editalItems.values()].flatMap(item => item.question_ids || []));
editalMap.generated_at = snapshotManifest.captured_at;
editalMap.question_formats = editalQuestionFormats;
const editalAe = Object.values(editalQuestionFormats).filter(format => format === "A–E").length;
const editalCe = Object.values(editalQuestionFormats).filter(format => format === "Certo/Errado").length;
editalMap.summary = {...(editalMap.summary || {}), catalog_questions: expectedQuestions, catalog_multiple_choice_ae: editalAe, catalog_true_false: editalCe, catalog_exam_eligible: editalAe + editalCe, mapped_questions: mappedIds.size, unmapped_questions: expectedQuestions - mappedIds.size, official_items: editalItems.size};
if (Object.keys(editalQuestionFormats).length !== expectedQuestions) throw new Error(`Formatos do mapa não fecham com o catálogo: ${Object.keys(editalQuestionFormats).length}/${expectedQuestions}.`);

for (const code of ["202", "400"]) {
  const target = editalMap.targets?.[code];
  const generalSections = new Set(editalMap.general_section_ids || []);
  const specificItems = new Set(target?.specific_item_ids || []);
  const topics = (editalMap.sections || []).filter(section => generalSections.has(section.id) || (section.items || []).some(item => specificItems.has(item.id))).flatMap(section => (section.items || []).filter(item => generalSections.has(section.id) || specificItems.has(item.id)));
  const empty = topics.filter(item => Number(item.question_count || 0) < 1).map(item => item.id);
  if (empty.length) throw new Error(`Cargo ${code} possui tópicos vazios após o lote Quadrix: ${empty.join(", ")}.`);
}
fs.writeFileSync(editalMapPath, `${JSON.stringify(editalMap, null, 2)}\n`);
console.log(`✓ Lote Quadrix mapeado explicitamente: ${expectedIds.length} questões novas; ${expectedQuestions} no catálogo; cargos 202 e 400 sem tópicos vazios.`);
