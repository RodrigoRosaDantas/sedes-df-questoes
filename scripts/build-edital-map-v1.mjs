import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resolve = relative => path.join(root, String(relative).replace(/^\.\//, ""));
const matrixPath = resolve("data/edital/sedes-2026-matrix-v1.json");
const catalogPath = resolve("data/release/catalogo.json");
const distPath = resolve("dist/data/release/edital-map-v1.json");

if (!fs.existsSync(matrixPath)) throw new Error("Matriz canônica do edital ausente.");
if (!fs.existsSync(catalogPath)) throw new Error("Catálogo canônico ausente para mapear o edital.");
if (!fs.existsSync(resolve("dist"))) throw new Error("O dist precisa existir antes da geração do mapa do edital.");

const matrixText = fs.readFileSync(matrixPath, "utf8");
const matrix = JSON.parse(matrixText);
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

const MATERIAL_TOPIC_ALIASES = new Map([
  ["sim-emilia-2026-tdas-prog01", ["cartão prato cheio", "prato cheio", "lei 7.009", "decreto 42.873"]],
  ["sim-emilia-2026-tdas-prog02", ["cartão gás", "cartao gas", "lei 6.938", "decreto 42.376"]],
  ["sim-emilia-2026-tdas-prog03", ["plano df social", "df social", "lei 7.008", "decreto 42.872"]],
]);

const normalize = value => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
  .replace(/\bn[.\s]*[º°]\s*/gu, "")
  .replace(/\bpoliticas para as mulheres\b/gu, "politica para mulheres")
  .replace(/[–—]/g, "-")
  .replace(/\s+/g, " ")
  .trim();
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const containsTerm = (value, rawTerm) => {
  const term = normalize(rawTerm);
  if (!term) return false;
  const normalized = normalize(value);
  if (!normalized) return false;
  const escaped = escapeRegex(term);
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "u").test(normalized);
};
const matchesAny = (values, terms = []) => !terms.length || terms.some(term => values.some(value => containsTerm(value, term)));
const normalizedValues = values => values.map(normalize).filter(Boolean);

function matchesItem(question, item, material) {
  const match = item.match || {};
  const discipline = normalizedValues([question.disciplina, material?.disciplina]);
  const topic = normalizedValues([question.assunto, material?.assunto]);
  const subtopic = normalizedValues([question.subassunto, material?.subassunto]);
  const materialAliases = normalizedValues(MATERIAL_TOPIC_ALIASES.get(material?.id) || []);
  const all = [...discipline, ...topic, ...subtopic, ...materialAliases];
  if (match.discipline_any?.length && !matchesAny(discipline, match.discipline_any)) return false;
  if (match.topic_any?.length && !matchesAny([...topic, ...subtopic, ...materialAliases], match.topic_any)) return false;
  if (match.subtopic_any?.length && !matchesAny([...subtopic, ...materialAliases], match.subtopic_any)) return false;
  if (match.any_any?.length && !matchesAny(all, match.any_any)) return false;
  return Boolean(match.discipline_any?.length || match.topic_any?.length || match.subtopic_any?.length || match.any_any?.length);
}

function isMultipleChoiceAE(question) {
  if (question?.anulada === true) return false;
  const alternatives = question?.alternativas;
  if (!alternatives || Array.isArray(alternatives) || typeof alternatives !== "object") return false;
  const keys = Object.keys(alternatives).map(key => String(key).trim().toUpperCase());
  if (!["A", "B", "C", "D", "E"].every(key => keys.includes(key))) return false;
  return /^[A-E]$/i.test(String(question.gabarito || "").trim());
}

function isTrueFalse(question) {
  if (question?.anulada === true) return false;
  const alternatives = question?.alternativas;
  if (!alternatives || Array.isArray(alternatives) || typeof alternatives !== "object") return false;
  const keys = Object.keys(alternatives).map(key => normalize(key));
  const hasPair = keys.includes("certo") && keys.includes("errado");
  const answer = normalize(question.gabarito);
  return hasPair && (answer === "certo" || answer === "errado");
}

const sectionsById = new Map((matrix.sections || []).map(section => [section.id, section]));
const items = new Map();
for (const section of matrix.sections || []) {
  for (const item of section.items || []) {
    if (!item.id || items.has(item.id)) throw new Error(`ID de item do edital inválido ou duplicado: ${item.id || "ausente"}.`);
    items.set(item.id, {
      id: item.id, label: item.label, section_id: section.id, section_label: section.label,
      scope: section.scope, targets: section.targets || ["202", "400"], question_ids: [],
      ae_question_ids: [], ce_question_ids: [], exam_question_ids: [],
    });
  }
}

const allQuestionIds = new Set();
const mappedQuestionIds = new Set();
const aeQuestionIds = new Set();
const ceQuestionIds = new Set();
const questionFormats = {};
for (const materialMeta of catalog.materials || []) {
  const file = materialMeta.file;
  if (!file || !fs.existsSync(resolve(file))) throw new Error(`Material do catálogo não encontrado: ${file || materialMeta.id}.`);
  const material = JSON.parse(fs.readFileSync(resolve(file), "utf8"));
  for (const question of material.questoes || []) {
    if (!question.id || allQuestionIds.has(question.id)) throw new Error(`Questão ausente ou repetida durante o mapeamento: ${question.id || "sem ID"}.`);
    allQuestionIds.add(question.id);
    const ae = isMultipleChoiceAE(question);
    const ce = isTrueFalse(question);
    if (ae) aeQuestionIds.add(question.id);
    if (ce) ceQuestionIds.add(question.id);
    questionFormats[question.id] = ae ? "A–E" : ce ? "Certo/Errado" : "Outro";
    for (const section of matrix.sections || []) {
      for (const sourceItem of section.items || []) {
        if (!matchesItem(question, sourceItem, material)) continue;
        const targetItem = items.get(sourceItem.id);
        targetItem.question_ids.push(question.id);
        if (ae) targetItem.ae_question_ids.push(question.id);
        if (ce) targetItem.ce_question_ids.push(question.id);
        if (ae || ce) targetItem.exam_question_ids.push(question.id);
        mappedQuestionIds.add(question.id);
      }
    }
  }
}

if (allQuestionIds.size !== Number(catalog.summary?.questoes || 0)) {
  throw new Error(`Mapa do edital leu ${allQuestionIds.size} questões para um catálogo de ${catalog.summary?.questoes || 0}.`);
}

const unique = values => [...new Set(values)];
const unionForItems = (itemIds, key) => unique(itemIds.flatMap(id => items.get(id)?.[key] || []));
const sectionItemIds = sectionId => (sectionsById.get(sectionId)?.items || []).map(item => item.id);
const generalItemIds = (matrix.general_section_ids || []).flatMap(sectionItemIds);
const targets = {};

for (const [targetCode, target] of Object.entries(matrix.targets || {})) {
  const specificItemIds = (target.specific_section_ids || []).flatMap(sectionItemIds);
  const generalIds = unionForItems(generalItemIds, "question_ids");
  const generalAeIds = unionForItems(generalItemIds, "ae_question_ids");
  const generalCeIds = unionForItems(generalItemIds, "ce_question_ids");
  const generalExamIds = unionForItems(generalItemIds, "exam_question_ids");
  const specificIds = unionForItems(specificItemIds, "question_ids");
  const specificAeIds = unionForItems(specificItemIds, "ae_question_ids");
  const specificCeIds = unionForItems(specificItemIds, "ce_question_ids");
  const specificExamIds = unionForItems(specificItemIds, "exam_question_ids");
  const mariaExamIds = items.get("geral-df-maria-penha")?.exam_question_ids || [];
  const blueprint = matrix.objective_blueprint || {};
  const deficits = {
    general: Math.max(0, Number(blueprint.general_questions || 20) - generalExamIds.length),
    specific: Math.max(0, Number(blueprint.specific_questions || 40) - specificExamIds.length),
    maria_da_penha: Math.max(0, Number(blueprint.maria_da_penha_minimum_questions || 3) - mariaExamIds.length),
  };
  targets[targetCode] = {
    label: target.label, subtitle: target.subtitle, general_item_ids: generalItemIds,
    specific_item_ids: specificItemIds, general_question_ids: generalIds,
    general_ae_question_ids: generalAeIds, general_ce_question_ids: generalCeIds,
    general_exam_question_ids: generalExamIds, specific_question_ids: specificIds,
    specific_ae_question_ids: specificAeIds, specific_ce_question_ids: specificCeIds,
    specific_exam_question_ids: specificExamIds, maria_da_penha_exam_question_ids: unique(mariaExamIds),
    readiness: {
      ready: deficits.general === 0 && deficits.specific === 0 && deficits.maria_da_penha === 0,
      deficits, general_exam: generalExamIds.length, general_ae: generalAeIds.length,
      general_ce: generalCeIds.length, specific_exam: specificExamIds.length,
      specific_ae: specificAeIds.length, specific_ce: specificCeIds.length,
      maria_da_penha_exam: unique(mariaExamIds).length,
    },
  };
}

const publicSections = (matrix.sections || []).map(section => ({
  id: section.id, scope: section.scope, targets: section.targets || ["202", "400"], label: section.label,
  items: (section.items || []).map(sourceItem => {
    const item = items.get(sourceItem.id);
    return {
      id: item.id, label: item.label, question_count: item.question_ids.length,
      ae_question_count: item.ae_question_ids.length, ce_question_count: item.ce_question_ids.length,
      exam_question_count: item.exam_question_ids.length, question_ids: unique(item.question_ids),
      ae_question_ids: unique(item.ae_question_ids), ce_question_ids: unique(item.ce_question_ids),
      exam_question_ids: unique(item.exam_question_ids),
    };
  }),
}));

const output = {
  schema_version: "1.1", matrix_version: matrix.matrix_version, generated_at: new Date().toISOString(),
  matrix_sha256: sha256(matrixText), source: matrix.source, objective_blueprint: matrix.objective_blueprint,
  simulation_policy: {
    preserves_official_blocks_and_weights: true, preserves_original_question_format: true,
    accepted_question_formats: ["multiple_choice_ae", "true_false"],
    note: "A prova oficial prevista no edital é A–E; a simulação aceita também Certo/Errado do acervo Quadrix para ampliar a prática de conteúdo sem converter a questão original.",
  },
  general_section_ids: matrix.general_section_ids, targets, sections: publicSections, question_formats: questionFormats,
  summary: {
    catalog_questions: allQuestionIds.size, catalog_multiple_choice_ae: aeQuestionIds.size,
    catalog_true_false: ceQuestionIds.size, catalog_exam_eligible: new Set([...aeQuestionIds, ...ceQuestionIds]).size,
    mapped_questions: mappedQuestionIds.size, unmapped_questions: allQuestionIds.size - mappedQuestionIds.size,
    official_items: items.size,
  },
};

fs.mkdirSync(path.dirname(distPath), {recursive: true});
fs.writeFileSync(distPath, `${JSON.stringify(output, null, 2)}\n`);
for (const [code, target] of Object.entries(targets)) {
  const status = target.readiness.ready ? "apta" : `bloqueada (${JSON.stringify(target.readiness.deficits)})`;
  console.log(`✓ Matriz ${code}: ${target.readiness.general_exam} gerais elegíveis (${target.readiness.general_ae} A–E + ${target.readiness.general_ce} C/E), ${target.readiness.specific_exam} específicas elegíveis (${target.readiness.specific_ae} A–E + ${target.readiness.specific_ce} C/E), ${target.readiness.maria_da_penha_exam} Maria da Penha — Prova Real ${status}.`);
}
console.log(`✓ Edital verticalizado gerado: ${items.size} itens oficiais, ${mappedQuestionIds.size}/${allQuestionIds.size} questões mapeadas sem usar enunciado como classificador.`);
