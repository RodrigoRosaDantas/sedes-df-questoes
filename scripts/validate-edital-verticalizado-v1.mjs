import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const readJSON = relative => JSON.parse(read(relative));
const fail = message => { throw new Error(message); };

const matrix = readJSON("data/edital/sedes-2026-matrix-v1.json");
const map = readJSON("dist/data/release/edital-map-v1.json");
const catalog = readJSON("dist/data/release/catalogo.json");
const builder = read("scripts/build-edital-map-v1.mjs");
const official = read("assets/official-exam-v2-13.js");
const vertical = read("assets/edital-verticalizado-v1.js");

if (matrix.schema_version !== "1.0" || map.schema_version !== "1.0") fail("Schema do edital verticalizado inválido.");
if (matrix.matrix_version !== map.matrix_version) fail("Versão da matriz diverge do mapa gerado.");
const blueprint = matrix.objective_blueprint || {};
for (const [key, expected] of Object.entries({
  objective_questions: 60,
  general_questions: 20,
  general_weight: 1,
  specific_questions: 40,
  specific_weight: 2,
  total_points: 100,
  general_minimum_points: 10,
  specific_minimum_points: 40,
  joint_duration_minutes: 240,
  maria_da_penha_minimum_questions: 3,
})) if (Number(blueprint[key]) !== expected) fail(`Regra oficial divergente em ${key}: ${blueprint[key]}.`);
if (blueprint.allowed_format !== "multiple_choice_ae") fail("Prova Real deixou de exigir múltipla escolha A–E.");

for (const code of ["202", "400"]) if (!matrix.targets?.[code] || !map.targets?.[code]) fail(`Cargo ${code} ausente da matriz ou do mapa.`);
if (!matrix.targets["202"].specific_section_ids.includes("202-administrativo")) fail("Matriz 202 perdeu Direito Administrativo.");
if (!matrix.targets["202"].specific_section_ids.includes("202-materiais-patrimonio-compras")) fail("Matriz 202 perdeu Materiais/Patrimônio/Compras.");
if (!matrix.targets["400"].specific_section_ids.includes("400-tga") || !matrix.targets["400"].specific_section_ids.includes("400-pessoas")) fail("Matriz 400 perdeu TGA ou Gestão de Pessoas.");

const sections = new Map();
const itemIds = new Set();
for (const section of map.sections || []) {
  if (!section.id || sections.has(section.id)) fail(`Seção duplicada: ${section.id}.`);
  sections.set(section.id, section);
  for (const item of section.items || []) {
    if (!item.id || itemIds.has(item.id)) fail(`Item oficial duplicado: ${item.id}.`);
    itemIds.add(item.id);
    const ids = item.question_ids || [];
    const aeIds = item.ae_question_ids || [];
    if (new Set(ids).size !== ids.length) fail(`Questões duplicadas no item ${item.id}.`);
    if (new Set(aeIds).size !== aeIds.length) fail(`Questões A–E duplicadas no item ${item.id}.`);
    const idSet = new Set(ids);
    if (aeIds.some(id => !idSet.has(id))) fail(`Item ${item.id} possui A–E fora da cobertura geral.`);
  }
}
if (!itemIds.has("geral-df-maria-penha")) fail("Item canônico da Lei Maria da Penha ausente.");
if (itemIds.size < 70) fail(`Verticalizado excessivamente resumido: apenas ${itemIds.size} itens oficiais.`);

const catalogIds = new Set(Object.keys(catalog.question_index || {}));
const allMappedIds = new Set();
for (const section of map.sections || []) for (const item of section.items || []) {
  for (const id of item.question_ids || []) {
    if (!catalogIds.has(id)) fail(`Mapa referencia questão inexistente no catálogo: ${id}.`);
    allMappedIds.add(id);
  }
}
if (Number(map.summary?.catalog_questions) !== catalogIds.size) fail("Resumo do mapa não fecha com o catálogo.");
if (Number(map.summary?.mapped_questions) !== allMappedIds.size) fail("Resumo de questões mapeadas divergente.");
if (Number(map.summary?.mapped_questions) + Number(map.summary?.unmapped_questions) !== catalogIds.size) fail("Mapeadas + não mapeadas não fecham com o catálogo.");

const itemById = new Map((map.sections || []).flatMap(section => (section.items || []).map(item => [item.id, item])));
const union = (ids, key) => [...new Set(ids.flatMap(id => itemById.get(id)?.[key] || []))];
for (const code of ["202", "400"]) {
  const target = map.targets[code];
  const general = union(target.general_item_ids || [], "ae_question_ids");
  const specific = union(target.specific_item_ids || [], "ae_question_ids");
  if (new Set(target.general_ae_question_ids || []).size !== general.length || general.some(id => !(target.general_ae_question_ids || []).includes(id))) fail(`Pool geral ${code} diverge dos itens.`);
  if (new Set(target.specific_ae_question_ids || []).size !== specific.length || specific.some(id => !(target.specific_ae_question_ids || []).includes(id))) fail(`Pool específico ${code} diverge dos itens.`);
  const deficits = target.readiness?.deficits || {};
  const expectedDeficits = {
    general: Math.max(0, 20 - general.length),
    specific: Math.max(0, 40 - specific.length),
    maria_da_penha: Math.max(0, 3 - (target.maria_da_penha_ae_question_ids || []).length),
  };
  for (const key of Object.keys(expectedDeficits)) if (Number(deficits[key]) !== expectedDeficits[key]) fail(`Déficit ${key} do cargo ${code} divergente.`);
  const expectedReady = Object.values(expectedDeficits).every(value => value === 0);
  if (Boolean(target.readiness?.ready) !== expectedReady) fail(`Readiness do cargo ${code} incoerente.`);
}

if (builder.includes("question.enunciado") || builder.includes("question.texto_base")) fail("Classificador do edital não pode inferir tópico pelo enunciado/texto-base.");
for (const marker of ["discipline_any", "topic_any", "subtopic_any", "any_any", "isMultipleChoiceAE", "edital-map-v1.json"]) if (!builder.includes(marker)) fail(`Builder sem contrato de mapeamento: ${marker}.`);
for (const marker of ["data-start-official-exam", "generalIds", "specificIds", "general < 10", "specific < 40", "maria_da_penha_ae_question_ids", "readiness?.ready"]) if (!official.includes(marker)) fail(`Prova Real sem gate obrigatório: ${marker}.`);
for (const marker of ["Edital verticalizado", "data-edital-target", "data-edital-run", "question_ids", "activeHistory", "createCompatibleSession"]) if (!vertical.includes(marker)) fail(`Verticalizado sem contrato operacional: ${marker}.`);

console.log(`✓ Edital verticalizado validado: ${itemIds.size} itens oficiais, ${allMappedIds.size}/${catalogIds.size} questões mapeadas; Prova Real 202/400 usa somente pools A–E do mesmo mapa, sem fallback fora do edital.`);
