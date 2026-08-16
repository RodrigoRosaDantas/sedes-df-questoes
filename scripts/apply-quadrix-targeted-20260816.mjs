import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotDir = path.join(root, "data", "notion", "quadrix-targeted-20260816");
const expectedReleaseDir = path.join(root, "dist", "data", "release");
const releaseDir = path.resolve(root, String(process.env.RELEASE_DIR || ""));
if (releaseDir !== expectedReleaseDir) throw new Error("O lote Quadrix direcionado só pode ser materializado no dist; a release canônica versionada permanece imutável.");

const readJSON = file => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const clean = value => String(value ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
const key = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const slug = value => key(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
const operation = "SEDES-QDX-TARGETED-IMPORT-20260816";

const snapshotManifest = readJSON(path.join(snapshotDir, "manifest.json"));
if (snapshotManifest.schema_version !== "1.0" || snapshotManifest.operation_id !== operation) throw new Error("Manifesto imutável Quadrix direcionado ausente ou incompatível.");
if (Number(snapshotManifest.expected_count) !== 22 || Number(snapshotManifest.expected_materials_added) !== 4 || !Array.isArray(snapshotManifest.files) || snapshotManifest.files.length !== 4) {
  throw new Error("Manifesto Quadrix direcionado com escopo inesperado.");
}

const records = snapshotManifest.files.flatMap(file => {
  const payload = readJSON(path.join(snapshotDir, file));
  if (payload.schema_version !== "1.0" || payload.operation_id !== operation || !Array.isArray(payload.records)) throw new Error(`${file}: snapshot inválido.`);
  return payload.records;
});
const expectedCodes = new Set(snapshotManifest.expected_codes || []);
if (records.length !== 22 || expectedCodes.size !== 22) throw new Error(`Snapshot Quadrix incompleto: ${records.length}/22.`);
const seenCodes = new Set();
const materialNames = new Set();
for (const record of records) {
  if (!expectedCodes.has(record.code) || seenCodes.has(record.code)) throw new Error(`Código inesperado ou duplicado: ${record.code}.`);
  seenCodes.add(record.code);
  materialNames.add(record.material_name);
  if (record.publication_lot !== operation || record.released_for_export !== true || record.annulled === true || record.has_image === true) throw new Error(`${record.code}: registro fora do escopo liberado.`);
  if (record.material_type !== "Prova" || record.format !== "Certo / Errado" || !["Certo", "Errado"].includes(record.answer)) throw new Error(`${record.code}: tipo, formato ou gabarito inválido.`);
  for (const required of ["material_name", "prompt", "comment", "notion_url", "source_url", "cargo_code", "discipline", "subject"]) {
    if (!clean(record[required])) throw new Error(`${record.code}: campo obrigatório ausente (${required}).`);
  }
}
if (materialNames.size !== 4) throw new Error(`O lote deve conter exatamente 4 materiais; encontrados ${materialNames.size}.`);

const catalogPath = path.join(releaseDir, "catalogo.json");
const manifestPath = path.join(releaseDir, "manifest.json");
const releaseMetaPath = path.join(releaseDir, "release-meta.json");
const buildInfoPath = path.join(releaseDir, "build-info.json");
const materialsDir = path.join(releaseDir, "materials");
for (const file of [catalogPath, manifestPath, releaseMetaPath, buildInfoPath]) if (!fs.existsSync(file)) throw new Error(`Artefato-base ausente: ${path.relative(root, file)}.`);

const catalog = readJSON(catalogPath);
const manifest = readJSON(manifestPath);
const releaseMeta = readJSON(releaseMetaPath);
const buildInfo = readJSON(buildInfoPath);
const source = snapshotManifest.source || {};
const baselineQuestions = Number(source.previous_public_questions);
const expectedQuestions = Number(source.expected_public_questions);
const masterTotal = Number(source.master_total);
const discursive = Number(source.discursive_display_items || 0);
const expectedAwaiting = Number(source.expected_awaiting_audit || 0);

const materials = new Map();
const materialIdByName = new Map();
const questionByCode = new Map();
const questionById = new Map();
for (const meta of catalog.materials || []) {
  const file = path.join(materialsDir, path.basename(String(meta.file || "")));
  if (!fs.existsSync(file)) throw new Error(`Material-base ausente no dist: ${meta.file || meta.id}.`);
  const material = readJSON(file);
  materials.set(material.id, material);
  materialIdByName.set(key(material.nome), material.id);
  for (const question of material.questoes || []) {
    if (question.id) questionById.set(key(question.id), question);
    if (question.codigo) questionByCode.set(key(question.codigo), question);
  }
}
const startingQuestions = questionById.size;
if (![baselineQuestions, expectedQuestions].includes(startingQuestions)) throw new Error(`Base pública inesperada para o lote Quadrix: ${startingQuestions}; esperado ${baselineQuestions} ou ${expectedQuestions}.`);
const startingMaterials = materials.size;

function baseMaterial(record) {
  const id = `notion-${slug(record.material_name)}`;
  return {
    id,
    tipo_material: "prova",
    fonte: record.source_board || "Instituto Quadrix",
    nome: record.material_name,
    ano: Number(record.year),
    orgao: record.organization,
    cargo: record.cargo,
    codigo_cargo: String(record.cargo_code),
    disciplina: record.discipline,
    bloco: record.block,
    status: "publicado",
    source_url: record.source_url,
    formato_questao: "Certo / Errado",
    lote_publicacao: operation,
    comentarios_status: "concluido",
    quantidade_questoes: 0,
    tempo_sugerido_minutos: 0,
    questoes: [],
  };
}
function publicQuestion(record) {
  const id = slug(record.code);
  return {
    id,
    codigo: record.code,
    numero: Number(record.original_number),
    numero_original: Number(record.original_number),
    bloco: clean(record.block),
    disciplina: clean(record.discipline),
    assunto: clean(record.subject),
    subassunto: clean(record.subsubject),
    texto_base: clean(record.text_base),
    enunciado: clean(record.prompt),
    alternativas: {Certo: "Certo", Errado: "Errado"},
    gabarito: record.answer,
    comentario: clean(record.comment),
    comentarios_alternativas: record.alternative_comments || {},
    fundamento: clean(record.foundation),
    pegadinha: clean(record.trap),
    observacoes: clean(record.observations),
    formato_questao: "Certo / Errado",
    pagina_pdf: clean(record.pdf_page),
    fonte_oficial: record.source_url,
    fonte_consolidada: record.source_url,
    auditoria: `Banco Mestre — ${operation} — transcrição, gabarito e conteúdo auditados`,
    notion_url: record.notion_url,
    codigo_fonte: record.code,
    anulada: false,
    possui_imagem: false,
    descricao_imagem: "",
    imagem: "",
  };
}

let added = 0;
for (const record of records) {
  const existing = questionByCode.get(key(record.code));
  if (existing) {
    if (clean(existing.enunciado) !== clean(record.prompt) || clean(existing.gabarito) !== clean(record.answer)) throw new Error(`${record.code}: registro já publicado diverge do snapshot.`);
    continue;
  }
  let materialId = materialIdByName.get(key(record.material_name));
  if (!materialId) {
    const material = baseMaterial(record);
    materialId = material.id;
    if (materials.has(materialId)) throw new Error(`Colisão de ID de material: ${materialId}.`);
    materials.set(materialId, material);
    materialIdByName.set(key(record.material_name), materialId);
  }
  const question = publicQuestion(record);
  if (questionById.has(key(question.id))) throw new Error(`${record.code}: ID público já utilizado (${question.id}).`);
  materials.get(materialId).questoes.push(question);
  questionById.set(key(question.id), question);
  questionByCode.set(key(question.codigo), question);
  added += 1;
}
if (questionById.size !== expectedQuestions) throw new Error(`Lote Quadrix não fecha o catálogo: ${questionById.size}/${expectedQuestions}.`);
if (startingQuestions === baselineQuestions && added !== 22) throw new Error(`Adição parcial do lote Quadrix: ${added}/22.`);
if (startingQuestions === baselineQuestions && materials.size !== startingMaterials + 4) throw new Error(`Materiais adicionados: ${materials.size - startingMaterials}/4.`);

fs.mkdirSync(materialsDir, {recursive: true});
const catalogMaterials = [];
const questionIndex = {};
for (const material of [...materials.values()].sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"))) {
  material.questoes.sort((a, b) => Number(a.numero) - Number(b.numero) || String(a.codigo).localeCompare(String(b.codigo)));
  material.quantidade_questoes = material.questoes.length;
  material.tempo_sugerido_minutos = Math.max(Number(material.tempo_sugerido_minutos || 0), material.questoes.length * 2);
  const disciplines = new Set(material.questoes.map(question => clean(question.disciplina)).filter(Boolean));
  const blocks = new Set(material.questoes.map(question => clean(question.bloco)).filter(Boolean));
  if (disciplines.size > 1) material.disciplina = "Múltiplas matérias";
  if (blocks.size > 1) material.bloco = "Múltiplos blocos";
  const file = path.join(materialsDir, `${material.id}.json`);
  fs.writeFileSync(file, `${JSON.stringify(material)}\n`);
  for (const question of material.questoes) {
    if (questionIndex[question.id]) throw new Error(`ID duplicado ao reconstruir catálogo: ${question.id}.`);
    questionIndex[question.id] = material.id;
  }
  const {questoes, ...meta} = material;
  catalogMaterials.push({...meta, file: `./data/release/materials/${material.id}.json`});
}

const proofs = catalogMaterials.filter(item => key(item.tipo_material) === "prova").length;
const simulations = catalogMaterials.filter(item => key(item.tipo_material) === "simulado").length;
catalog.exported_at = snapshotManifest.captured_at;
catalog.source = {...(catalog.source || {}), name: source.name || catalog.source?.name, notion_url: source.database_url || catalog.source?.notion_url, criteria: `${clean(catalog.source?.criteria)} + ${records.length} questões reais Quadrix auditadas do lote ${operation}.`};
catalog.summary = {...(catalog.summary || {}), banco_mestre: masterTotal, materiais: catalogMaterials.length, questoes: questionById.size, aguardando_auditoria: expectedAwaiting, provas: proofs, simulados: simulations, discursivas_consulta: discursive};
catalog.materials = catalogMaterials;
catalog.question_index = questionIndex;
if (catalog.summary.banco_mestre - catalog.summary.questoes - catalog.summary.discursivas_consulta !== catalog.summary.aguardando_auditoria) throw new Error("Banco Mestre não fecha após o lote Quadrix.");
const catalogText = `${JSON.stringify(catalog, null, 2)}\n`;
fs.writeFileSync(catalogPath, catalogText);

const priorManifestById = new Map((manifest.materials || []).map(item => [item.id, item]));
manifest.generated_at = snapshotManifest.captured_at;
manifest.summary = {...(manifest.summary || {}), ...catalog.summary};
manifest.catalog_sha256 = sha256(catalogText);
manifest.materials = catalogMaterials.map(meta => {
  const file = path.join(materialsDir, `${meta.id}.json`);
  const content = fs.readFileSync(file);
  return {...(priorManifestById.get(meta.id) || {}), id: meta.id, file: meta.file, questions: meta.quantidade_questoes, bytes: content.length, sha256: sha256(content), display_items: Number(priorManifestById.get(meta.id)?.display_items || 0)};
});
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
releaseMeta.exported_at = snapshotManifest.captured_at;
releaseMeta.questions = questionById.size;
releaseMeta.materials = catalogMaterials.length;
releaseMeta.proofs = proofs;
releaseMeta.simulations = simulations;
releaseMeta.banco_mestre = masterTotal;
releaseMeta.awaiting_audit = expectedAwaiting;
releaseMeta.discursive_display_items = discursive;
fs.writeFileSync(releaseMetaPath, `${JSON.stringify(releaseMeta, null, 2)}\n`);
buildInfo.questions = questionById.size;
buildInfo.materials = catalogMaterials.length;
buildInfo.material_files = catalogMaterials.length;
fs.writeFileSync(buildInfoPath, `${JSON.stringify(buildInfo, null, 2)}\n`);

for (const code of expectedCodes) if (!questionByCode.has(key(code))) throw new Error(`${code}: ausente do catálogo final.`);
const receipt = {schema_version: "1.0", operation_id: operation, source_snapshot: "data/notion/quadrix-targeted-20260816/manifest.json", status: "success", added_questions: added, total_questions: questionById.size, total_materials: catalogMaterials.length, banco_mestre: masterTotal, discursivas_consulta: discursive, aguardando_auditoria: expectedAwaiting, codes: [...expectedCodes]};
fs.writeFileSync(path.join(releaseDir, "quadrix-targeted-20260816-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`✓ Lote Quadrix direcionado materializado no dist: +${added} questões; ${questionById.size} questões, ${catalogMaterials.length} materiais; Banco Mestre ${masterTotal}.`);
