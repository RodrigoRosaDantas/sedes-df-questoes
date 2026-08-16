import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.join(root, "dist", "data", "release");
const snapshotDir = path.join(root, "data", "notion", "quadrix-residual-gaps-b-20260816");
const readJSON = file => JSON.parse(fs.readFileSync(file, "utf8"));
const clean = value => String(value ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
const key = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const unique = values => [...new Set(values)];
const manifest = readJSON(path.join(snapshotDir, "manifest.json"));
if (manifest.schema_version !== "1.0" || manifest.operation_id !== "SEDES-QDX-RESIDUAL-GAPS-20260816-B") throw new Error("Manifesto residual B inválido.");

const expectedQuestions = Number(manifest.source?.expected_public_questions || 0);
const catalog = readJSON(path.join(releaseDir, "catalogo.json"));
const materialsDir = path.join(releaseDir, "materials");
const materials = new Map(), questionById = new Map();
for (const meta of catalog.materials || []) {
  const file = path.join(materialsDir, path.basename(String(meta.file || "")));
  if (!fs.existsSync(file)) throw new Error(`Material público ausente: ${meta.file || meta.id}.`);
  const material = readJSON(file); materials.set(material.id, material);
  for (const q of material.questoes || []) {
    if (!q.id || questionById.has(key(q.id))) throw new Error(`Questão inválida ou duplicada: ${q.id || "sem-id"}.`);
    questionById.set(key(q.id), {q, material});
  }
}
if (questionById.size !== expectedQuestions || Number(catalog.summary?.questoes || 0) !== expectedQuestions) throw new Error(`Catálogo final divergente: ${questionById.size}/${expectedQuestions}.`);

const normalize = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
function classify(q, material) {
  const declared = normalize(q?.formato_questao || material?.formato_questao);
  if (declared.includes("certo") && declared.includes("errado")) return "true-false";
  if (declared.includes("multipla") || declared.includes("escolha") || declared.includes("alternativa")) return "multiple-choice";
  const alternatives = q?.alternativas && typeof q.alternativas === "object" && !Array.isArray(q.alternativas) ? Object.entries(q.alternativas).filter(([a,b]) => clean(a) && clean(b)) : [];
  const tokens = new Set(alternatives.flatMap(([a,b]) => [normalize(a), normalize(b)]));
  if (alternatives.length === 2 && tokens.has("certo") && tokens.has("errado")) return "true-false";
  if (alternatives.length >= 2) return "multiple-choice";
  throw new Error(`Formato não reconhecido: ${q?.id || "sem-id"}.`);
}

const searchItems = [], formats = {}, formatSummary = {"true-false": 0, "multiple-choice": 0}, studyDisciplines = new Map();
for (const material of materials.values()) for (const q of material.questoes || []) {
  const discipline = clean(q.disciplina || material.disciplina || ""), subject = clean(q.assunto || ""), alternativesText = Object.values(q.alternativas || {}).join(" ");
  const format = classify(q, material); formats[q.id] = format; formatSummary[format] += 1;
  searchItems.push({id: q.id, material_id: material.id, discipline, subject, source: material.fonte || "", year: material.ano || "",
    snippet: clean(q.enunciado).slice(0, 280), search: normalize([material.nome, discipline, subject, material.fonte, material.ano, q.texto_base, q.enunciado, alternativesText, q.comentario, q.fundamento, q.pegadinha].filter(Boolean).join(" "))});
  const dn = discipline || "Sem classificação", tn = subject || "Outros tópicos";
  if (!studyDisciplines.has(dn)) studyDisciplines.set(dn, {name: dn, question_ids: [], material_ids: new Set(), topics: new Map()});
  const s = studyDisciplines.get(dn); s.question_ids.push(q.id); s.material_ids.add(material.id);
  if (!s.topics.has(tn)) s.topics.set(tn, []); s.topics.get(tn).push(q.id);
}
if (searchItems.length !== expectedQuestions || Object.keys(formats).length !== expectedQuestions) throw new Error("Índices derivados não fecham com o catálogo final.");
if (formatSummary["true-false"] !== 2572 || formatSummary["multiple-choice"] !== 936) throw new Error(`Formatos finais inesperados: ${formatSummary["true-false"]} C/E + ${formatSummary["multiple-choice"]} A–E.`);
fs.writeFileSync(path.join(releaseDir, "question-search-index.json"), `${JSON.stringify({schema_version: "1.0", release_version: catalog.release_version || null, exported_at: catalog.exported_at || null, questions: searchItems.length, items: searchItems})}\n`);
fs.writeFileSync(path.join(releaseDir, "question-format-index.json"), `${JSON.stringify({schema_version: "1.0", release_version: catalog.release_version || null, exported_at: catalog.exported_at || null, question_count: expectedQuestions, summary: formatSummary, formats})}\n`);
const studyOutput = {schema_version: "1.0", release_version: catalog.release_version, generated_at: manifest.captured_at,
  summary: {disciplines: studyDisciplines.size, topics: [...studyDisciplines.values()].reduce((sum, i) => sum + i.topics.size, 0), questions: expectedQuestions},
  disciplines: [...studyDisciplines.values()].map(d => ({name: d.name, question_count: d.question_ids.length, question_ids: d.question_ids,
    material_count: d.material_ids.size, material_ids: [...d.material_ids], topics: [...d.topics.entries()].map(([name, ids]) => ({name, question_count: ids.length, question_ids: ids}))
      .sort((a,b) => b.question_count - a.question_count || a.name.localeCompare(b.name, "pt-BR"))}))
    .sort((a,b) => b.question_count - a.question_count || a.name.localeCompare(b.name, "pt-BR"))};
fs.writeFileSync(path.join(releaseDir, "study-index.json"), `${JSON.stringify(studyOutput, null, 2)}\n`);

const editalMapPath = path.join(releaseDir, "edital-map-v1.json");
if (!fs.existsSync(editalMapPath)) throw new Error("Mapa do edital anterior ausente.");
const editalMap = readJSON(editalMapPath), editalItems = new Map((editalMap.sections || []).flatMap(s => (s.items || []).map(i => [i.id, i])));
const editalFormats = {...(editalMap.question_formats || {})};
for (const assignment of manifest.assignments || []) {
  const record = questionById.get(key(assignment.question_id));
  if (!record || !catalog.question_index?.[assignment.question_id]) throw new Error(`Questão residual B ausente: ${assignment.question_id}.`);
  if (!String(record.material.fonte || "").toLocaleLowerCase("pt-BR").includes("quadrix")) throw new Error(`${assignment.question_id}: fonte não é Quadrix.`);
  editalFormats[assignment.question_id] = "A–E";
  const item = editalItems.get(assignment.item_id);
  if (!item) throw new Error(`Item do edital inexistente: ${assignment.item_id}.`);
  item.question_ids = unique([...(item.question_ids || []), assignment.question_id]);
  item.ae_question_ids = unique([...(item.ae_question_ids || []), assignment.question_id]);
  item.exam_question_ids = unique([...(item.exam_question_ids || []), assignment.question_id]);
}
for (const item of editalItems.values()) {
  for (const field of ["question_ids", "ae_question_ids", "ce_question_ids", "exam_question_ids"]) item[field] = unique(item[field] || []);
  item.question_count = item.question_ids.length; item.ae_question_count = item.ae_question_ids.length;
  item.ce_question_count = item.ce_question_ids.length; item.exam_question_count = item.exam_question_ids.length;
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
  const deficits = {general: Math.max(0, Number(bp.general_questions || 20) - target.general_exam_question_ids.length),
    specific: Math.max(0, Number(bp.specific_questions || 40) - target.specific_exam_question_ids.length),
    maria_da_penha: Math.max(0, Number(bp.maria_da_penha_minimum_questions || 3) - maria.length)};
  target.readiness = {ready: deficits.general === 0 && deficits.specific === 0 && deficits.maria_da_penha === 0, deficits,
    general_exam: target.general_exam_question_ids.length, general_ae: target.general_ae_question_ids.length, general_ce: target.general_ce_question_ids.length,
    specific_exam: target.specific_exam_question_ids.length, specific_ae: target.specific_ae_question_ids.length, specific_ce: target.specific_ce_question_ids.length,
    maria_da_penha_exam: maria.length};
}
if (Object.keys(editalFormats).length !== expectedQuestions) throw new Error(`Formatos do mapa não fecham: ${Object.keys(editalFormats).length}/${expectedQuestions}.`);
editalMap.question_formats = editalFormats;
for (const code of ["202", "400"]) {
  const target = editalMap.targets?.[code], generalSections = new Set(editalMap.general_section_ids || []), specificItems = new Set(target?.specific_item_ids || []);
  const topics = (editalMap.sections || []).filter(s => generalSections.has(s.id) || (s.items || []).some(i => specificItems.has(i.id)))
    .flatMap(s => (s.items || []).filter(i => generalSections.has(s.id) || specificItems.has(i.id)));
  const empty = topics.filter(i => Number(i.question_count || 0) < 1).map(i => i.id);
  if (empty.length) throw new Error(`Cargo ${code} possui tópicos vazios: ${empty.join(", ")}.`);
}
for (const [itemId, minimum] of Object.entries(manifest.expected_minimums || {})) {
  const count = Number(editalItems.get(itemId)?.question_count || 0);
  if (count < Number(minimum)) throw new Error(`${itemId}: cobertura ${count}, mínimo ${minimum}.`);
}
for (const [itemId, exact] of Object.entries(manifest.protected_singletons || {})) {
  const count = Number(editalItems.get(itemId)?.question_count || 0);
  if (count !== Number(exact)) throw new Error(`${itemId}: singleton protegido mudou de ${exact} para ${count}.`);
}
const mappedIds = new Set([...editalItems.values()].flatMap(i => i.question_ids || []));
if (mappedIds.size !== Number(manifest.expected_mapped_questions) || expectedQuestions - mappedIds.size !== Number(manifest.expected_unmapped_questions))
  throw new Error(`Mapa final inesperado: ${mappedIds.size} mapeadas / ${expectedQuestions - mappedIds.size} não mapeadas.`);
editalMap.generated_at = manifest.captured_at;
editalMap.summary = {...(editalMap.summary || {}), catalog_questions: expectedQuestions, catalog_multiple_choice_ae: 936, catalog_true_false: 2572,
  catalog_exam_eligible: expectedQuestions, mapped_questions: mappedIds.size, unmapped_questions: expectedQuestions - mappedIds.size};
fs.writeFileSync(editalMapPath, `${JSON.stringify(editalMap, null, 2)}\n`);

const receipt = {schema_version: "1.0", operation_id: manifest.operation_id, status: "success", added_questions: 2,
  mapped_questions: mappedIds.size, unmapped_questions: expectedQuestions - mappedIds.size, expected_minimums: manifest.expected_minimums,
  protected_singletons: manifest.protected_singletons, codes: manifest.expected_codes};
fs.writeFileSync(path.join(releaseDir, "quadrix-residual-gaps-b-20260816-map-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`✓ Derivação residual B: ${expectedQuestions} questões; ${mappedIds.size} mapeadas; análise de cargos>=3; população em situação de rua>=3; singletons preservados.`);
