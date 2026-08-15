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

const normalize = value => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
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

function matchesItem(question, item) {
  const match = item.match || {};
  const discipline = normalize(question.disciplina);
  const topic = normalize(question.assunto);
  const subtopic = normalize(question.subassunto);
  const all = [discipline, topic, subtopic];
  if (match.discipline_any?.length && !matchesAny([discipline], match.discipline_any)) return false;
  if (match.topic_any?.length && !matchesAny([topic, subtopic], match.topic_any)) return false;
  if (match.subtopic_any?.length && !matchesAny([subtopic], match.subtopic_any)) return false;
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

const sectionsById = new Map((matrix.sections || []).map(section => [section.id, section]));
const items = new Map();
for (const section of matrix.sections || []) {
  for (const item of section.items || []) {
    if (!item.id || items.has(item.id)) throw new Error(`ID de item do edital inválido ou duplicado: ${item.id || "ausente"}.`);
    items.set(item.id, {
      id: item.id,
      label: item.label,
      section_id: section.id,
      section_label: section.label,
      scope: section.scope,
      targets: section.targets || ["202", "400"],
      question_ids: [],
      ae_question_ids: [],
    });
  }
}

const allQuestionIds = new Set();
const mappedQuestionIds = new Set();
const aeQuestionIds = new Set();
for (const materialMeta of catalog.materials || []) {
  const file = materialMeta.file;
  if (!file || !fs.existsSync(resolve(file))) throw new Error(`Material do catálogo não encontrado: ${file || materialMeta.id}.`);
  const material = JSON.parse(fs.readFileSync(resolve(file), "utf8"));
  for (const question of material.questoes || []) {
    if (!question.id || allQuestionIds.has(question.id)) throw new Error(`Questão ausente ou repetida durante o mapeamento: ${question.id || "sem ID"}.`);
    allQuestionIds.add(question.id);
    const ae = isMultipleChoiceAE(question);
    if (ae) aeQuestionIds.add(question.id);
    for (const section of matrix.sections || []) {
      for (const sourceItem of section.items || []) {
        if (!matchesItem(question, sourceItem)) continue;
        const targetItem = items.get(sourceItem.id);
        targetItem.question_ids.push(question.id);
        if (ae) targetItem.ae_question_ids.push(question.id);
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
  const specificIds = unionForItems(specificItemIds, "question_ids");
  const specificAeIds = unionForItems(specificItemIds, "ae_question_ids");
  const mariaAeIds = items.get("geral-df-maria-penha")?.ae_question_ids || [];
  const blueprint = matrix.objective_blueprint || {};
  const deficits = {
    general: Math.max(0, Number(blueprint.general_questions || 20) - generalAeIds.length),
    specific: Math.max(0, Number(blueprint.specific_questions || 40) - specificAeIds.length),
    maria_da_penha: Math.max(0, Number(blueprint.maria_da_penha_minimum_questions || 3) - mariaAeIds.length),
  };
  targets[targetCode] = {
    label: target.label,
    subtitle: target.subtitle,
    general_item_ids: generalItemIds,
    specific_item_ids: specificItemIds,
    general_question_ids: generalIds,
    general_ae_question_ids: generalAeIds,
    specific_question_ids: specificIds,
    specific_ae_question_ids: specificAeIds,
    maria_da_penha_ae_question_ids: unique(mariaAeIds),
    readiness: {
      ready: deficits.general === 0 && deficits.specific === 0 && deficits.maria_da_penha === 0,
      deficits,
      general_ae: generalAeIds.length,
      specific_ae: specificAeIds.length,
      maria_da_penha_ae: unique(mariaAeIds).length,
    },
  };
}

const publicSections = (matrix.sections || []).map(section => ({
  id: section.id,
  scope: section.scope,
  targets: section.targets || ["202", "400"],
  label: section.label,
  items: (section.items || []).map(sourceItem => {
    const item = items.get(sourceItem.id);
    return {
      id: item.id,
      label: item.label,
      question_count: item.question_ids.length,
      ae_question_count: item.ae_question_ids.length,
      question_ids: unique(item.question_ids),
      ae_question_ids: unique(item.ae_question_ids),
    };
  }),
}));

const output = {
  schema_version: "1.0",
  matrix_version: matrix.matrix_version,
  generated_at: new Date().toISOString(),
  matrix_sha256: sha256(matrixText),
  source: matrix.source,
  objective_blueprint: matrix.objective_blueprint,
  general_section_ids: matrix.general_section_ids,
  targets,
  sections: publicSections,
  summary: {
    catalog_questions: allQuestionIds.size,
    catalog_multiple_choice_ae: aeQuestionIds.size,
    mapped_questions: mappedQuestionIds.size,
    unmapped_questions: allQuestionIds.size - mappedQuestionIds.size,
    official_items: items.size,
  },
};

fs.mkdirSync(path.dirname(distPath), {recursive: true});
fs.writeFileSync(distPath, `${JSON.stringify(output, null, 2)}\n`);
for (const [code, target] of Object.entries(targets)) {
  const status = target.readiness.ready ? "apta" : `bloqueada (${JSON.stringify(target.readiness.deficits)})`;
  console.log(`✓ Matriz ${code}: ${target.readiness.general_ae} gerais A–E, ${target.readiness.specific_ae} específicas A–E, ${target.readiness.maria_da_penha_ae} Maria da Penha A–E — Prova Real ${status}.`);
}
console.log(`✓ Edital verticalizado gerado: ${items.size} itens oficiais, ${mappedQuestionIds.size}/${allQuestionIds.size} questões mapeadas sem usar enunciado como classificador.`);
