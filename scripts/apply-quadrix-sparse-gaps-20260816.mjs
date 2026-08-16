import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotDir = path.join(root, "data", "notion", "quadrix-sparse-gaps-20260816");
const expectedReleaseDir = path.join(root, "dist", "data", "release");
const releaseDir = path.resolve(root, String(process.env.RELEASE_DIR || ""));
if (releaseDir !== expectedReleaseDir) throw new Error("O lote sparse gaps só pode ser materializado no dist; data/release permanece imutável.");

const readJSON = file => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const clean = value => String(value ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
const key = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const slug = value => key(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
const operation = "SEDES-QDX-SPARSE-GAPS-20260816";

const snapshotManifest = readJSON(path.join(snapshotDir, "manifest.json"));
if (snapshotManifest.schema_version !== "1.0" || snapshotManifest.operation_id !== operation) throw new Error("Manifesto sparse gaps ausente ou incompatível.");
if (Number(snapshotManifest.expected_count) !== 2 || Number(snapshotManifest.expected_materials_added) !== 2 || !Array.isArray(snapshotManifest.files) || snapshotManifest.files.length !== 2) throw new Error("Manifesto sparse gaps com escopo inesperado.");
const records = snapshotManifest.files.flatMap(file => {
  const payload = readJSON(path.join(snapshotDir, file));
  if (payload.schema_version !== "1.0" || payload.operation_id !== operation || !Array.isArray(payload.records)) throw new Error(`${file}: snapshot inválido.`);
  return payload.records;
});
const expectedCodes = new Set(snapshotManifest.expected_codes || []);
if (records.length !== 2 || expectedCodes.size !== 2) throw new Error(`Snapshot sparse gaps incompleto: ${records.length}/2.`);
const seenCodes = new Set(), materialNames = new Set();
for (const record of records) {
  if (!expectedCodes.has(record.code) || seenCodes.has(record.code)) throw new Error(`Código inesperado ou duplicado: ${record.code}.`);
  seenCodes.add(record.code); materialNames.add(record.material_name);
  if (record.publication_lot !== operation || record.released_for_export !== true || record.annulled === true || record.has_image === true) throw new Error(`${record.code}: registro fora do escopo liberado.`);
  if (record.material_type !== "Prova" || record.format !== "Múltipla escolha A–E" || !/^[A-E]$/.test(String(record.answer || ""))) throw new Error(`${record.code}: tipo, formato ou gabarito inválido.`);
  for (const letter of ["A", "B", "C", "D", "E"]) if (!clean(record.alternatives?.[letter])) throw new Error(`${record.code}: alternativa ${letter} ausente.`);
  for (const required of ["material_name", "prompt", "comment", "notion_url", "source_url", "cargo_code", "discipline", "subject"]) if (!clean(record[required])) throw new Error(`${record.code}: campo obrigatório ausente (${required}).`);
}
if (materialNames.size !== 2) throw new Error(`O lote deve conter exatamente 2 materiais; encontrados ${materialNames.size}.`);

const catalogPath = path.join(releaseDir, "catalogo.json");
const manifestPath = path.join(releaseDir, "manifest.json");
const releaseMetaPath = path.join(releaseDir, "release-meta.json");
const buildInfoPath = path.join(releaseDir, "build-info.json");
const materialsDir = path.join(releaseDir, "materials");
for (const file of [catalogPath, manifestPath, releaseMetaPath, buildInfoPath]) if (!fs.existsSync(file)) throw new Error(`Artefato-base ausente: ${path.relative(root, file)}.`);

const catalog = readJSON(catalogPath), manifest = readJSON(manifestPath), releaseMeta = readJSON(releaseMetaPath), buildInfo = readJSON(buildInfoPath);
const source = snapshotManifest.source || {};
const baselineQuestions = Number(source.previous_public_questions), expectedQuestions = Number(source.expected_public_questions);
const expectedMaterials = Number(source.expected_materials), expectedProofs = Number(source.expected_proofs), masterTotal = Number(source.master_total);
const discursive = Number(source.discursive_display_items || 0), expectedAwaiting = Number(source.expected_awaiting_audit || 0);
const materials = new Map(), materialIdByName = new Map(), questionByCode = new Map(), questionById = new Map();
for (const meta of catalog.materials || []) {
  const file = path.join(materialsDir, path.basename(String(meta.file || "")));
  if (!fs.existsSync(file)) throw new Error(`Material-base ausente no dist: ${meta.file || meta.id}.`);
  const material = readJSON(file); materials.set(material.id, material); materialIdByName.set(key(material.nome), material.id);
  for (const q of material.questoes || []) { if (q.id) questionById.set(key(q.id), q); if (q.codigo) questionByCode.set(key(q.codigo), q); }
}
const startingQuestions = questionById.size, startingMaterials = materials.size;
if (![baselineQuestions, expectedQuestions].includes(startingQuestions)) throw new Error(`Base pública inesperada: ${startingQuestions}; esperado ${baselineQuestions} ou ${expectedQuestions}.`);

function baseMaterial(record) {
  return {id:`notion-${slug(record.material_name)}`,tipo_material:"prova",fonte:record.source_board || "Instituto Quadrix",nome:record.material_name,ano:Number(record.year),orgao:record.organization,cargo:record.cargo,codigo_cargo:String(record.cargo_code),disciplina:record.discipline,bloco:record.block,status:"publicado",source_url:record.source_url,formato_questao:"Múltipla escolha A–E",lote_publicacao:operation,comentarios_status:"concluido",quantidade_questoes:0,tempo_sugerido_minutos:0,questoes:[]};
}
function publicQuestion(record) {
  return {id:slug(record.code),codigo:record.code,numero:Number(record.original_number),numero_original:Number(record.original_number),bloco:clean(record.block),disciplina:clean(record.discipline),assunto:clean(record.subject),subassunto:clean(record.subsubject),texto_base:clean(record.text_base),enunciado:clean(record.prompt),alternativas:Object.fromEntries(["A","B","C","D","E"].map(letter=>[letter,clean(record.alternatives[letter])])),gabarito:record.answer,comentario:clean(record.comment),comentarios_alternativas:record.alternative_comments||{},fundamento:clean(record.foundation),pegadinha:clean(record.trap),observacoes:clean(record.observations),formato_questao:"Múltipla escolha A–E",pagina_pdf:clean(record.pdf_page),fonte_oficial:record.source_url,fonte_consolidada:record.source_url,auditoria:`Banco Mestre — ${operation} — transcrição, gabarito e conteúdo auditados`,notion_url:record.notion_url,codigo_fonte:record.code,anulada:false,possui_imagem:false,descricao_imagem:"",imagem:""};
}

let added = 0;
for (const record of records) {
  const existing = questionByCode.get(key(record.code));
  if (existing) {
    if (clean(existing.enunciado) !== clean(record.prompt) || clean(existing.gabarito) !== clean(record.answer)) throw new Error(`${record.code}: publicação existente diverge do snapshot.`);
    continue;
  }
  let materialId = materialIdByName.get(key(record.material_name));
  if (!materialId) {
    const material = baseMaterial(record); materialId = material.id;
    if (materials.has(materialId)) throw new Error(`Colisão de material: ${materialId}.`);
    materials.set(materialId, material); materialIdByName.set(key(record.material_name), materialId);
  }
  const q = publicQuestion(record);
  if (questionById.has(key(q.id))) throw new Error(`${record.code}: ID público já utilizado.`);
  materials.get(materialId).questoes.push(q); questionById.set(key(q.id), q); questionByCode.set(key(q.codigo), q); added += 1;
}
if (questionById.size !== expectedQuestions) throw new Error(`Lote sparse gaps não fecha o catálogo: ${questionById.size}/${expectedQuestions}.`);
if (startingQuestions === baselineQuestions && added !== 2) throw new Error(`Adição parcial sparse gaps: ${added}/2.`);
if (startingQuestions === baselineQuestions && materials.size !== startingMaterials + 2) throw new Error(`Materiais adicionados: ${materials.size - startingMaterials}/2.`);
if (materials.size !== expectedMaterials) throw new Error(`Total de materiais divergente: ${materials.size}/${expectedMaterials}.`);

fs.mkdirSync(materialsDir, {recursive:true});
const catalogMaterials = [], questionIndex = {};
for (const material of [...materials.values()].sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"))) {
  material.questoes.sort((a,b)=>Number(a.numero)-Number(b.numero)||String(a.codigo).localeCompare(String(b.codigo)));
  material.quantidade_questoes=material.questoes.length; material.tempo_sugerido_minutos=Math.max(Number(material.tempo_sugerido_minutos||0),material.questoes.length*2);
  const disciplines=new Set(material.questoes.map(q=>clean(q.disciplina)).filter(Boolean)), blocks=new Set(material.questoes.map(q=>clean(q.bloco)).filter(Boolean));
  if(disciplines.size>1) material.disciplina="Múltiplas matérias"; if(blocks.size>1) material.bloco="Múltiplos blocos";
  const file=path.join(materialsDir,`${material.id}.json`); fs.writeFileSync(file,`${JSON.stringify(material)}\n`);
  for(const q of material.questoes){if(questionIndex[q.id]) throw new Error(`ID duplicado: ${q.id}.`); questionIndex[q.id]=material.id;}
  const {questoes,...meta}=material; catalogMaterials.push({...meta,file:`./data/release/materials/${material.id}.json`});
}
const proofs=catalogMaterials.filter(item=>key(item.tipo_material)==="prova").length, simulations=catalogMaterials.filter(item=>key(item.tipo_material)==="simulado").length;
if(proofs!==expectedProofs) throw new Error(`Total de provas divergente: ${proofs}/${expectedProofs}.`);
if(simulations!==Number(source.simulations)) throw new Error(`Total de simulados divergente: ${simulations}/${source.simulations}.`);
catalog.exported_at=snapshotManifest.captured_at;
catalog.source={...(catalog.source||{}),name:source.name||catalog.source?.name,notion_url:source.database_url||catalog.source?.notion_url,criteria:`${clean(catalog.source?.criteria)} + ${records.length} questões A–E reais Quadrix auditadas do lote ${operation}.`};
catalog.summary={...(catalog.summary||{}),banco_mestre:masterTotal,materiais:catalogMaterials.length,questoes:questionById.size,aguardando_auditoria:expectedAwaiting,provas:proofs,simulados:simulations,discursivas_consulta:discursive};
catalog.materials=catalogMaterials; catalog.question_index=questionIndex;
if(catalog.summary.banco_mestre-catalog.summary.questoes-catalog.summary.discursivas_consulta!==catalog.summary.aguardando_auditoria) throw new Error("Banco Mestre não fecha após sparse gaps.");
const catalogText=`${JSON.stringify(catalog,null,2)}\n`; fs.writeFileSync(catalogPath,catalogText);
const priorManifestById=new Map((manifest.materials||[]).map(item=>[item.id,item]));
manifest.generated_at=snapshotManifest.captured_at; manifest.summary={...(manifest.summary||{}),...catalog.summary}; manifest.catalog_sha256=sha256(catalogText);
manifest.materials=catalogMaterials.map(meta=>{const file=path.join(materialsDir,`${meta.id}.json`),content=fs.readFileSync(file); return {...(priorManifestById.get(meta.id)||{}),id:meta.id,file:meta.file,questions:meta.quantidade_questoes,bytes:content.length,sha256:sha256(content),display_items:Number(priorManifestById.get(meta.id)?.display_items||0)};});
fs.writeFileSync(manifestPath,`${JSON.stringify(manifest,null,2)}\n`);
Object.assign(releaseMeta,{exported_at:snapshotManifest.captured_at,questions:questionById.size,materials:catalogMaterials.length,proofs,simulations,banco_mestre:masterTotal,awaiting_audit:expectedAwaiting,discursive_display_items:discursive}); fs.writeFileSync(releaseMetaPath,`${JSON.stringify(releaseMeta,null,2)}\n`);
Object.assign(buildInfo,{questions:questionById.size,materials:catalogMaterials.length,material_files:catalogMaterials.length}); fs.writeFileSync(buildInfoPath,`${JSON.stringify(buildInfo,null,2)}\n`);
for(const code of expectedCodes) if(!questionByCode.has(key(code))) throw new Error(`${code}: ausente do catálogo final.`);
const receipt={schema_version:"1.0",operation_id:operation,source_snapshot:"data/notion/quadrix-sparse-gaps-20260816/manifest.json",status:"success",added_questions:added,total_questions:questionById.size,total_materials:catalogMaterials.length,total_proofs:proofs,banco_mestre:masterTotal,discursivas_consulta:discursive,aguardando_auditoria:expectedAwaiting,codes:[...expectedCodes]};
fs.writeFileSync(path.join(releaseDir,"quadrix-sparse-gaps-20260816-receipt.json"),`${JSON.stringify(receipt,null,2)}\n`);
console.log(`✓ Sparse gaps materializado: +${added} A–E; ${questionById.size} questões, ${catalogMaterials.length} materiais, ${proofs} provas; Banco Mestre ${masterTotal}.`);
