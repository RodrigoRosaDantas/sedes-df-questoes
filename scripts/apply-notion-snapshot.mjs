import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resolve = relative => path.resolve(root, String(relative).replace(/^\.\//, ''));
const snapshotPath = resolve('data/notion/published.json');

if (!fs.existsSync(snapshotPath) || !fs.readFileSync(snapshotPath, 'utf8').trim()) {
  console.log('✓ Snapshot do Notion ainda não instalado; release estática preservada.');
  process.exit(0);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const catalogPath = resolve('data/release/catalogo.json');
const manifestPath = resolve('data/release/manifest.json');
const materialsDir = resolve('data/release/materials');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const clean = value => String(value ?? '')
  .replace(/\r/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .trim();
const key = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slug = value => key(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
const composite = (material, number) => `${key(material)}::${Number(number) || 0}`;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const editorialCode = record => clean(record.code);
const fingerprint = (prompt, alternatives, answer) => key([prompt, ...Object.values(alternatives || {}), answer].join('\u241f'));
const releaseReceiptPattern = /^release-\d+\.\d+\.\d+:[0-9a-f]{7,64}$/i;
const legacyPublicId = value => {
  const candidate = clean(value);
  return candidate && !releaseReceiptPattern.test(candidate) ? candidate : '';
};

const currentMaterials = new Map();
const currentQuestions = [];
for (const metadata of catalog.materials || []) {
  const material = JSON.parse(fs.readFileSync(resolve(metadata.file), 'utf8'));
  currentMaterials.set(material.id, material);
  for (const question of material.questoes || []) {
    currentQuestions.push({...question, material_id: material.id, material_name: material.nome});
  }
}

const byCode = new Map(currentQuestions.map(question => [key(question.codigo), question]));
const byId = new Map(currentQuestions.map(question => [key(question.id), question]));
const byComposite = new Map(currentQuestions.map(question => [composite(question.material_name, question.numero), question]));
const byFingerprint = new Map();
const materialByName = new Map();
for (const question of currentQuestions) {
  const itemFingerprint = fingerprint(question.enunciado, question.alternativas, question.gabarito);
  if (!byFingerprint.has(itemFingerprint)) byFingerprint.set(itemFingerprint, []);
  byFingerprint.get(itemFingerprint).push(question);
}
for (const material of currentMaterials.values()) materialByName.set(key(material.nome), material.id);

function matchRecord(record) {
  const direct = byCode.get(key(editorialCode(record)));
  if (direct) return direct;
  // Na publicação excepcional, o snapshot é a fonte canônica. IDs históricos
  // ainda podem ser reutilizados por updatedQuestion, mas não podem fazer o
  // registro do Notion desaparecer da release.
  if (record.publication_exception) return null;
  const previousPublicId = legacyPublicId(record.github_id);
  const legacy = previousPublicId ? byId.get(key(previousPublicId)) : null;
  if (legacy) return legacy;
  const exact = byFingerprint.get(fingerprint(record.prompt, record.alternatives, record.answer)) || [];
  if (exact.length === 1) return exact[0];
  return byComposite.get(composite(record.material_name, record.original_number)) || null;
}

const assignedMaterialIds = new Map();
function materialIdFor(record, matched) {
  const materialKey = key(record.material_name);
  if (assignedMaterialIds.has(materialKey)) return assignedMaterialIds.get(materialKey);
  const selected = materialByName.get(materialKey) || matched?.material_id || `notion-${slug(record.material_name || record.code)}`;
  assignedMaterialIds.set(materialKey, selected);
  return selected;
}

function updatedQuestion(record, current) {
  const use = (source, fallback) => clean(source) || clean(fallback);
  return {
    ...(current || {}),
    id: current?.id || legacyPublicId(record.github_id) || slug(record.code),
    codigo: current?.codigo || record.code,
    numero: current?.numero || Number(record.original_number) || 0,
    numero_original: Number(record.original_number) || current?.numero_original || current?.numero || 0,
    bloco: use(record.block, current?.bloco),
    disciplina: use(record.discipline, current?.disciplina),
    assunto: use(record.subject, current?.assunto),
    subassunto: use(record.subsubject, current?.subassunto),
    texto_base: use(record.text_base, current?.texto_base),
    enunciado: record.prompt,
    alternativas: record.format === 'Certo / Errado' ? {Certo: 'Certo', Errado: 'Errado'} : record.alternatives,
    gabarito: record.annulled ? 'Anulada' : record.answer,
    comentario: record.comment,
    comentarios_alternativas: record.alternative_comments,
    fundamento: use(record.foundation, current?.fundamento),
    pegadinha: use(record.trap, current?.pegadinha),
    observacoes: use(record.observations, current?.observacoes),
    formato_questao: record.format,
    pagina_pdf: use(record.pdf_page, current?.pagina_pdf),
    fonte_oficial: record.source_url || record.notion_url,
    fonte_consolidada: record.source_url || record.notion_url,
    auditoria: record.publication_exception
      ? 'Publicação excepcional autorizada em 01/08/2026'
      : 'Banco Mestre — Pode publicar = true',
    notion_url: record.notion_url,
    codigo_fonte: record.code,
    anulada: Boolean(record.annulled),
    possui_imagem: Boolean(record.has_image) || Boolean(current?.imagem),
    descricao_imagem: use(record.image_description, current?.descricao_imagem),
    imagem: current?.imagem || '',
  };
}

function baseMaterial(id, record, current) {
  if (record.publication_exception && current) {
    const {questoes, ...metadata} = current;
    return {...metadata, questoes: []};
  }
  const type = key(record.material_type).includes('prova') ? 'prova' : 'simulado';
  return {
    ...(current ? Object.fromEntries(Object.entries(current).filter(([property]) => property !== 'questoes')) : {}),
    id,
    tipo_material: type,
    fonte: record.source_board || current?.fonte || 'Banco Mestre do Notion',
    nome: record.material_name || current?.nome || id,
    ano: record.year || current?.ano || null,
    orgao: record.organization || current?.orgao || 'SEDES/DF',
    cargo: record.cargo || current?.cargo || '',
    codigo_cargo: record.cargo_code || current?.codigo_cargo || '',
    disciplina: record.discipline || current?.disciplina || '',
    bloco: record.block || current?.bloco || '',
    status: 'publicado',
    source_url: record.source_url || record.notion_url || current?.source_url || snapshot.source.database_url,
    formato_questao: record.format,
    lote_publicacao: record.publication_lot || current?.lote_publicacao || '',
    comentarios_status: 'concluido',
    questoes: [],
  };
}

const finalMaterials = new Map();
const usedIds = new Set();
const usedCodes = new Set();
for (const record of snapshot.records || []) {
  const current = matchRecord(record);
  const materialId = materialIdFor(record, current);
  if (!finalMaterials.has(materialId)) {
    finalMaterials.set(materialId, baseMaterial(materialId, record, currentMaterials.get(materialId)));
  }
  const question = updatedQuestion(record, current);
  if (!question.id || !question.codigo || !question.enunciado || !question.comentario) {
    throw new Error(`${record.code}: questão incompleta após aplicação do snapshot.`);
  }
  if (releaseReceiptPattern.test(clean(question.id))) {
    throw new Error(`${record.code}: recibo de publicação não pode ser usado como ID público: ${question.id}`);
  }
  if (usedIds.has(key(question.id))) throw new Error(`ID duplicado após sincronização: ${question.id}`);
  if (usedCodes.has(key(question.codigo))) throw new Error(`Código duplicado após sincronização: ${question.codigo}`);
  usedIds.add(key(question.id));
  usedCodes.add(key(question.codigo));
  finalMaterials.get(materialId).questoes.push(question);
}

// Preservar questões atuais ausentes do snapshot: o Notion acrescenta e atualiza,
// mas não remove automaticamente conteúdo já publicado.
for (const currentMaterial of currentMaterials.values()) {
  if (!finalMaterials.has(currentMaterial.id)) {
    const {questoes, ...metadata} = currentMaterial;
    finalMaterials.set(currentMaterial.id, {...metadata, questoes: []});
  }
  const target = finalMaterials.get(currentMaterial.id);
  for (const currentQuestion of currentMaterial.questoes || []) {
    if (usedIds.has(key(currentQuestion.id)) || usedCodes.has(key(currentQuestion.codigo))) continue;
    if (releaseReceiptPattern.test(clean(currentQuestion.id))) {
      throw new Error(`${currentQuestion.codigo || currentQuestion.id}: release existente contém recibo de publicação como ID público.`);
    }
    target.questoes.push(currentQuestion);
    usedIds.add(key(currentQuestion.id));
    usedCodes.add(key(currentQuestion.codigo));
  }
}

for (const material of finalMaterials.values()) {
  material.questoes.sort((left, right) => Number(left.numero) - Number(right.numero) || left.codigo.localeCompare(right.codigo));
  material.quantidade_questoes = material.questoes.length;
  material.tempo_sugerido_minutos ||= material.questoes.length * (material.formato_questao === 'Certo / Errado' ? 1 : 2);
  const formats = new Set(material.questoes.map(question => question.formato_questao));
  const disciplines = new Set(material.questoes.map(question => clean(question.disciplina)).filter(Boolean));
  const blocks = new Set(material.questoes.map(question => clean(question.bloco)).filter(Boolean));
  if (formats.size > 1) material.formato_questao = 'Híbrido';
  if (disciplines.size > 1) material.disciplina = 'Múltiplas matérias';
  if (blocks.size > 1 && material.tipo_material === 'prova') material.bloco = 'Prova completa';
}

fs.rmSync(materialsDir, {recursive: true, force: true});
fs.mkdirSync(materialsDir, {recursive: true});
const catalogMaterials = [];
const questionIndex = {};
for (const material of [...finalMaterials.values()].sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR'))) {
  const file = `./data/release/materials/${material.id}.json`;
  const content = `${JSON.stringify(material)}\n`;
  fs.writeFileSync(resolve(file), content);
  for (const question of material.questoes) questionIndex[question.id] = material.id;
  const {questoes, ...metadata} = material;
  catalogMaterials.push({...metadata, file});
}

catalog.exported_at = new Date().toISOString();
catalog.source = {
  name: snapshot.source.name,
  notion_url: snapshot.source.database_url,
  criteria: `${snapshot.totals.published} registros atualmente liberados pelo Notion foram mesclados à release existente; alternativas A–E vazias são tratadas como Certo/Errado.`,
};
catalog.summary = {
  banco_mestre: snapshot.totals.all,
  materiais: catalogMaterials.length,
  questoes: [...finalMaterials.values()].reduce((sum, material) => sum + material.questoes.length, 0),
  aguardando_auditoria: Math.max(0, snapshot.totals.all - [...finalMaterials.values()].reduce((sum, material) => sum + material.questoes.length, 0)),
  provas: catalogMaterials.filter(material => material.tipo_material === 'prova').length,
  simulados: catalogMaterials.filter(material => material.tipo_material === 'simulado').length,
};
catalog.materials = catalogMaterials;
catalog.question_index = questionIndex;
const catalogContent = `${JSON.stringify(catalog, null, 2)}\n`;
fs.writeFileSync(catalogPath, catalogContent);

const manifest = {
  schema_version: '3.1',
  release_version: catalog.release_version,
  generated_at: new Date().toISOString(),
  summary: catalog.summary,
  catalog_sha256: sha256(catalogContent),
  materials: catalogMaterials.map(metadata => {
    const content = fs.readFileSync(resolve(metadata.file));
    return {
      id: metadata.id,
      file: metadata.file,
      questions: metadata.quantidade_questoes,
      bytes: content.length,
      sha256: sha256(content),
    };
  }),
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`✓ Snapshot do Notion aplicado: ${catalog.summary.questoes} questões em ${catalog.summary.materiais} materiais; IDs públicos preservados quando já existentes e recibos de release mantidos apenas como rastreabilidade.`);
