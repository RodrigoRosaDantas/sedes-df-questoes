import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.join(root, "dist", "data", "release");
const cressDir = path.join(root, "data", "notion", "cress-mg-df-20260816");
const targetedDir = path.join(root, "data", "notion", "quadrix-targeted-20260816");
const edasDir = path.join(root, "data", "notion", "edas-coverage-400");
const readJSON = file => JSON.parse(fs.readFileSync(file, "utf8"));
const clean = value => String(value ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
const key = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const slug = value => key(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
const unique = values => [...new Set(values)];

const cressManifest = readJSON(path.join(cressDir, "manifest.json"));
const targetedManifest = readJSON(path.join(targetedDir, "manifest.json"));
const edasManifest = readJSON(path.join(edasDir, "manifest.json"));
if (cressManifest.operation_id !== "SEDES-QDX-CRESS-MG-DF-20260816" || Number(cressManifest.expected_count) !== 12) throw new Error("Manifesto CRESS MG/DF inválido.");
if (targetedManifest.operation_id !== "SEDES-QDX-TARGETED-IMPORT-20260816" || Number(targetedManifest.expected_count) !== 22) throw new Error("Manifesto Quadrix direcionado inválido.");
if (edasManifest.operation_id !== "SEDES-EDAS-400-COVERAGE-20260815" || Number(edasManifest.expected_count) !== 11) throw new Error("Manifesto EDAS 400 inválido.");
const expectedQuestions = Number(cressManifest.source?.expected_public_questions || 0);
const cressIds = (cressManifest.expected_codes || []).map(slug);
const targetedIds = (targetedManifest.expected_codes || []).map(slug);
const edasIds = (edasManifest.expected_codes || []).map(slug);

const catalog = readJSON(path.join(releaseDir, "catalogo.json"));
const materialsDir = path.join(releaseDir, "materials");
const materials = new Map();
const questionById = new Map();
const questionIndex = catalog.question_index || {};
for (const meta of catalog.materials || []) {
  const file = path.join(materialsDir, path.basename(String(meta.file || "")));
  if (!fs.existsSync(file)) throw new Error(`Material público ausente: ${meta.file || meta.id}.`);
  const material = readJSON(file);
  materials.set(material.id, material);
  for (const question of material.questoes || []) {
    if (!question.id || questionById.has(key(question.id))) throw new Error(`Questão pública inválida ou duplicada: ${question.id || "sem-id"}.`);
    questionById.set(key(question.id), question);
  }
}
if (questionById.size !== expectedQuestions || Number(catalog.summary?.questoes || 0) !== expectedQuestions) throw new Error(`Catálogo final divergente: ${questionById.size}/${expectedQuestions}.`);
for (const questionId of [...cressIds, ...targetedIds, ...edasIds]) if (!questionIndex[questionId]) throw new Error(`Questão de overlay ausente do catálogo final: ${questionId}.`);

const normalizeForSearch = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
function classifyQuestionFormat(question, material) {
  const declared = normalizeForSearch(question?.formato_questao || material?.formato_questao);
  if (declared.includes("certo") && declared.includes("errado")) return "true-false";
  if (declared.includes("multipla") || declared.includes("escolha") || declared.includes("alternativa")) return "multiple-choice";
  const alternatives = question?.alternativas && typeof question.alternativas === "object" && !Array.isArray(question.alternativas)
    ? Object.entries(question.alternativas).filter(([letter, value]) => clean(letter) && clean(value)) : [];
  const tokens = new Set(alternatives.flatMap(([letter, value]) => [normalizeForSearch(letter), normalizeForSearch(value)]));
  if (alternatives.length === 2 && tokens.has("certo") && tokens.has("errado")) return "true-false";
  if (alternatives.length >= 2) return "multiple-choice";
  throw new Error(`Formato não reconhecido: ${question?.id || "sem-id"}.`);
}

const searchItems = [];
const formats = {};
const formatSummary = {"true-false": 0, "multiple-choice": 0};
const studyDisciplines = new Map();
for (const material of materials.values()) {
  for (const question of material.questoes || []) {
    const discipline = clean(question.disciplina || material.disciplina || "");
    const subject = clean(question.assunto || "");
    const alternativesText = Object.values(question.alternativas || {}).join(" ");
    const format = classifyQuestionFormat(question, material);
    formats[question.id] = format;
    formatSummary[format] += 1;
    searchItems.push({id: question.id, material_id: material.id, discipline, subject, source: material.fonte || "", year: material.ano || "", snippet: clean(question.enunciado).slice(0, 280), search: normalizeForSearch([material.nome, discipline, subject, material.fonte, material.ano, question.texto_base, question.enunciado, alternativesText, question.comentario, question.fundamento, question.pegadinha].filter(Boolean).join(" "))});
    const disciplineName = discipline || "Sem classificação";
    const topicName = subject || "Outros tópicos";
    if (!studyDisciplines.has(disciplineName)) studyDisciplines.set(disciplineName, {name: disciplineName, question_ids: [], material_ids: new Set(), topics: new Map()});
    const study = studyDisciplines.get(disciplineName);
    study.question_ids.push(question.id);
    study.material_ids.add(material.id);
    if (!study.topics.has(topicName)) study.topics.set(topicName, []);
    study.topics.get(topicName).push(question.id);
  }
}
if (searchItems.length !== expectedQuestions || Object.keys(formats).length !== expectedQuestions || formatSummary["true-false"] + formatSummary["multiple-choice"] !== expectedQuestions) throw new Error("Índices derivados não fecham com o catálogo final.");
if (formatSummary["true-false"] !== 2560 || formatSummary["multiple-choice"] !== 932) throw new Error(`Formatos finais inesperados: ${formatSummary["true-false"]} C/E + ${formatSummary["multiple-choice"]} múltipla escolha.`);
fs.writeFileSync(path.join(releaseDir, "question-search-index.json"), `${JSON.stringify({schema_version: "1.0", release_version: catalog.release_version || null, exported_at: catalog.exported_at || null, questions: searchItems.length, items: searchItems})}\n`);
fs.writeFileSync(path.join(releaseDir, "question-format-index.json"), `${JSON.stringify({schema_version: "1.0", release_version: catalog.release_version || null, exported_at: catalog.exported_at || null, question_count: expectedQuestions, summary: formatSummary, formats})}\n`);
const studyOutput = {schema_version: "1.0", release_version: catalog.release_version, generated_at: cressManifest.captured_at, summary: {disciplines: studyDisciplines.size, topics: [...studyDisciplines.values()].reduce((sum, item) => sum + item.topics.size, 0), questions: expectedQuestions}, disciplines: [...studyDisciplines.values()].map(discipline => ({name: discipline.name, question_count: discipline.question_ids.length, question_ids: discipline.question_ids, material_count: discipline.material_ids.size, material_ids: [...discipline.material_ids], topics: [...discipline.topics.entries()].map(([name, ids]) => ({name, question_count: ids.length, question_ids: ids})).sort((a, b) => b.question_count - a.question_count || a.name.localeCompare(b.name, "pt-BR"))})).sort((a, b) => b.question_count - a.question_count || a.name.localeCompare(b.name, "pt-BR"))};
fs.writeFileSync(path.join(releaseDir, "study-index.json"), `${JSON.stringify(studyOutput, null, 2)}\n`);

const editalMapPath = path.join(releaseDir, "edital-map-v1.json");
const editalMap = readJSON(editalMapPath);
const editalItems = new Map((editalMap.sections || []).flatMap(section => (section.items || []).map(item => [item.id, item])));
const id = code => slug(code);
const explicitAssignments = new Map([
  ["edas-s15-q001", ["400-gp-5-1"]], ["edas-s15-q002", ["400-gp-5-3"]], ["edas-s15-q003", ["400-gp-5-2"]],
  ["edas-s17-q001", ["400-gp-5-7"]], ["edas-s17-q022", ["400-gp-5-11"]], ["edas-s19-q022", ["400-gp-5-6"]],
  ["edas-s19-q031", ["edas-suas-3"]], ["edas-s19-q032", ["edas-suas-4"]], ["edas-s19-q033", ["edas-suas-5"]],
  ["edas-s26-q026", ["400-afo-4-5"]], ["edas-s26-q031", ["edas-suas-7"]], ["consol-as03-210", ["edas-suas-6"]],
  ["consol-as02-195", ["edas-dir-4"]], ["consol-as02-196", ["edas-dir-4"]],
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
  [id("PROVA-QDX-CRESSMG-2024-ASSISTENTE-SOCIAL-400-011"), ["202-adm-2-3"]],
  [id("PROVA-QDX-CRESSMG-2024-ASSISTENTE-SOCIAL-400-012"), ["202-adm-2-3"]],
  [id("PROVA-QDX-CRESSMG-2024-ASSISTENTE-SOCIAL-400-013"), ["202-adm-2-3"]],
  [id("PROVA-QDX-CRESSMG-2024-ASSISTENTE-SOCIAL-400-014"), ["202-adm-2-3"]],
  [id("PROVA-QDX-CRESSMG-2024-ASSISTENTE-SOCIAL-400-015"), ["202-adm-2-3"]],
  [id("PROVA-QDX-CRESSMG-2024-ASSISTENTE-SOCIAL-400-020"), ["202-mat-4-3"]],
  [id("PROVA-QDX-CRESSDF-2021-AGENTE-FISCAL-400-038"), ["edas-suas-2", "tdas-suas-3"]],
  [id("PROVA-QDX-CRESSDF-2021-AGENTE-FISCAL-400-039"), ["edas-dir-1"]],
  [id("PROVA-QDX-CRESSDF-2021-AGENTE-FISCAL-400-040"), ["geral-df-maria-penha", "edas-dir-2"]],
  [id("PROVA-QDX-CRESSDF-2021-AGENTE-FISCAL-400-041"), ["edas-dir-1"]],
  [id("PROVA-QDX-CRESSDF-2021-AGENTE-FISCAL-400-042"), ["edas-dir-1"]],
  [id("PROVA-QDX-CRESSDF-2021-AGENTE-FISCAL-400-046"), ["edas-suas-1"]]
]);

const editalQuestionFormats = {...(editalMap.question_formats || {})};
for (const questionId of edasIds) editalQuestionFormats[questionId] = "A–E";
for (const questionId of targetedIds) editalQuestionFormats[questionId] = "Certo/Errado";
for (const questionId of cressIds) editalQuestionFormats[questionId] = "A–E";
for (const [questionId, itemIds] of explicitAssignments) {
  if (!questionIndex[questionId]) throw new Error(`Mapeamento editorial referencia questão inexistente: ${questionId}.`);
  const format = editalQuestionFormats[questionId] || (formats[questionId] === "true-false" ? "Certo/Errado" : formats[questionId] === "multiple-choice" ? "A–E" : "Outro");
  for (const itemId of itemIds) {
    const item = editalItems.get(itemId);
    if (!item) throw new Error(`Item do edital inexistente: ${itemId}.`);
    item.question_ids = unique([...(item.question_ids || []), questionId]);
    if (format === "A–E") item.ae_question_ids = unique([...(item.ae_question_ids || []), questionId]);
    if (format === "Certo/Errado") item.ce_question_ids = unique([...(item.ce_question_ids || []), questionId]);
    if (format === "A–E" || format === "Certo/Errado") item.exam_question_ids = unique([...(item.exam_question_ids || []), questionId]);
  }
}
for (const item of editalItems.values()) {
  item.question_ids = unique(item.question_ids || []); item.ae_question_ids = unique(item.ae_question_ids || []); item.ce_question_ids = unique(item.ce_question_ids || []); item.exam_question_ids = unique(item.exam_question_ids || []);
  item.question_count = item.question_ids.length; item.ae_question_count = item.ae_question_ids.length; item.ce_question_count = item.ce_question_ids.length; item.exam_question_count = item.exam_question_ids.length;
}
const unionForItems = (itemIds, field) => unique((itemIds || []).flatMap(itemId => editalItems.get(itemId)?.[field] || []));
for (const target of Object.values(editalMap.targets || {})) {
  target.general_question_ids = unionForItems(target.general_item_ids, "question_ids"); target.general_ae_question_ids = unionForItems(target.general_item_ids, "ae_question_ids"); target.general_ce_question_ids = unionForItems(target.general_item_ids, "ce_question_ids"); target.general_exam_question_ids = unionForItems(target.general_item_ids, "exam_question_ids");
  target.specific_question_ids = unionForItems(target.specific_item_ids, "question_ids"); target.specific_ae_question_ids = unionForItems(target.specific_item_ids, "ae_question_ids"); target.specific_ce_question_ids = unionForItems(target.specific_item_ids, "ce_question_ids"); target.specific_exam_question_ids = unionForItems(target.specific_item_ids, "exam_question_ids");
  const maria = unique(editalItems.get("geral-df-maria-penha")?.exam_question_ids || []); target.maria_da_penha_exam_question_ids = maria;
  const blueprint = editalMap.objective_blueprint || {};
  const deficits = {general: Math.max(0, Number(blueprint.general_questions || 20) - target.general_exam_question_ids.length), specific: Math.max(0, Number(blueprint.specific_questions || 40) - target.specific_exam_question_ids.length), maria_da_penha: Math.max(0, Number(blueprint.maria_da_penha_minimum_questions || 3) - maria.length)};
  target.readiness = {ready: deficits.general === 0 && deficits.specific === 0 && deficits.maria_da_penha === 0, deficits, general_exam: target.general_exam_question_ids.length, general_ae: target.general_ae_question_ids.length, general_ce: target.general_ce_question_ids.length, specific_exam: target.specific_exam_question_ids.length, specific_ae: target.specific_ae_question_ids.length, specific_ce: target.specific_ce_question_ids.length, maria_da_penha_exam: maria.length};
}
const mappedIds = new Set([...editalItems.values()].flatMap(item => item.question_ids || []));
editalMap.generated_at = cressManifest.captured_at;
editalMap.question_formats = editalQuestionFormats;
const editalAe = Object.values(editalQuestionFormats).filter(format => format === "A–E").length;
const editalCe = Object.values(editalQuestionFormats).filter(format => format === "Certo/Errado").length;
editalMap.summary = {...(editalMap.summary || {}), catalog_questions: expectedQuestions, catalog_multiple_choice_ae: editalAe, catalog_true_false: editalCe, catalog_exam_eligible: editalAe + editalCe, mapped_questions: mappedIds.size, unmapped_questions: expectedQuestions - mappedIds.size, official_items: editalItems.size};
if (Object.keys(editalQuestionFormats).length !== expectedQuestions) throw new Error(`Formatos do mapa não fecham: ${Object.keys(editalQuestionFormats).length}/${expectedQuestions}.`);
for (const code of ["202", "400"]) {
  const target = editalMap.targets?.[code]; const generalSections = new Set(editalMap.general_section_ids || []); const specificItems = new Set(target?.specific_item_ids || []);
  const topics = (editalMap.sections || []).filter(section => generalSections.has(section.id) || (section.items || []).some(item => specificItems.has(item.id))).flatMap(section => (section.items || []).filter(item => generalSections.has(section.id) || specificItems.has(item.id)));
  const empty = topics.filter(item => Number(item.question_count || 0) < 1).map(item => item.id);
  if (empty.length) throw new Error(`Cargo ${code} possui tópicos vazios após os overlays finais: ${empty.join(", ")}.`);
}
fs.writeFileSync(editalMapPath, `${JSON.stringify(editalMap, null, 2)}\n`);
console.log(`✓ Derivação final CRESS MG/DF: ${expectedQuestions} questões; ${formatSummary["true-false"]} C/E + ${formatSummary["multiple-choice"]} múltipla escolha; overlays preservados; cargos 202/400 sem tópicos vazios.`);
