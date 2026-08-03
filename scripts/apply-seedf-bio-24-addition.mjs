import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resolve = relative => path.resolve(root, String(relative).replace(/^\.\//, ''));
const readJSON = relative => JSON.parse(fs.readFileSync(resolve(relative), 'utf8'));
const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const key = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slug = value => key(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };

const snapshotPath = 'data/notion/publication-additions/seedf-bio-24.json';
const planPath = 'data/notion/publication-additions/seedf-bio-24-plan.json';
const catalogPath = 'data/release/catalogo.json';
const manifestPath = 'data/release/manifest.json';
const receiptPath = 'data/release/seedf-bio-24-publication-receipt.json';
const operationId = 'SEEDF-2025-BIO-A-097-120-20260802';
const expectedPrefix = 'PROVA-QDX-SEEDF-2025-BIO-A-';
const expectedCodes = Array.from({length: 24}, (_, index) => `${expectedPrefix}${String(index + 97).padStart(3, '0')}`);
const expectedSet = new Set(expectedCodes);

for (const required of [snapshotPath, planPath, catalogPath, manifestPath]) {
  if (!fs.existsSync(resolve(required))) fail(`Arquivo obrigatório ausente: ${required}.`);
}

const snapshot = readJSON(snapshotPath);
const plan = readJSON(planPath);
const catalog = readJSON(catalogPath);
const manifest = readJSON(manifestPath);

if (plan.total_records !== 24 || !Array.isArray(plan.lots) || plan.lots.length !== 1) {
  fail('O plano adicional de Biologia deve conter exatamente 24 registros em um único lote.');
}
const [lot] = plan.lots;
if (lot.lot !== operationId || lot.expected_count !== 24 || JSON.stringify(lot.codes) !== JSON.stringify(expectedCodes)) {
  fail('O plano adicional não corresponde exatamente às questões 97 a 120 de Biologia.');
}

const recordsByCode = new Map((snapshot.records || []).map(record => [clean(record.code), record]));
const additions = expectedCodes.map(code => recordsByCode.get(code));
const missing = expectedCodes.filter((code, index) => !additions[index]);
if (missing.length) fail(`O snapshot adicional de Biologia está incompleto: ${missing.join(', ')}.`);

for (const record of additions) {
  if (clean(record.github_id)) fail(`${record.code}: já possui Código GitHub.`);
  if (record.released_for_export !== true) fail(`${record.code}: não está liberada para exportação.`);
  if (record.publication_lot !== operationId) fail(`${record.code}: lote divergente.`);
  if (record.material_type !== 'Prova') fail(`${record.code}: tipo de material diferente de Prova.`);
  if (record.annulled === true) fail(`${record.code}: questão anulada não pode ser publicada.`);
  if (record.has_image === true) fail(`${record.code}: questão com imagem não pertence a esta operação.`);
  if (!clean(record.prompt) || !clean(record.answer) || !clean(record.comment)) fail(`${record.code}: conteúdo essencial incompleto.`);
  if (record.format !== 'Certo / Errado' || !['Certo', 'Errado'].includes(record.answer)) {
    fail(`${record.code}: formato ou gabarito inválido.`);
  }
}

const baselineCount = Number(catalog.summary?.questoes);
if (baselineCount !== 2585) fail(`Base pública divergente antes de Biologia: ${baselineCount}; esperado 2585.`);

const existingIds = new Set(Object.keys(catalog.question_index || {}).map(key));
const existingCodes = new Set();
const materialByName = new Map();
for (const metadata of catalog.materials || []) {
  const material = readJSON(metadata.file);
  materialByName.set(key(material.nome), {metadata, material});
  for (const question of material.questoes || []) {
    existingCodes.add(key(question.codigo));
    if (question.codigo_fonte) existingCodes.add(key(question.codigo_fonte));
  }
}
for (const code of expectedCodes) if (existingCodes.has(key(code))) fail(`${code}: já existe no catálogo público.`);

const first = additions[0];
const materialKey = key(first.material_name);
let target = materialByName.get(materialKey);
if (!target) {
  const id = `notion-${slug(first.material_name || operationId)}`;
  if ((catalog.materials || []).some(item => item.id === id)) fail(`ID de material já utilizado: ${id}.`);
  const material = {
    id,
    tipo_material: 'prova',
    fonte: first.source_board || 'Instituto Quadrix',
    nome: first.material_name,
    ano: first.year || 2025,
    orgao: first.organization || 'Secretaria de Estado de Educação do Distrito Federal — SEEDF/DF',
    cargo: first.cargo || 'Professor de Educação Básica — Área de Formação: Biologia',
    codigo_cargo: first.cargo_code || '103',
    disciplina: first.discipline || 'Biologia',
    bloco: first.block || 'Conhecimentos Específicos',
    status: 'publicado',
    source_url: first.source_url || first.notion_url,
    formato_questao: 'Certo / Errado',
    lote_publicacao: operationId,
    comentarios_status: 'concluido',
    questoes: [],
  };
  const metadata = {...material, quantidade_questoes: 0, file: `./data/release/materials/${id}.json`};
  delete metadata.questoes;
  catalog.materials.push(metadata);
  target = {metadata, material};
}

for (const record of additions) {
  const id = slug(record.code);
  if (!id || existingIds.has(key(id))) fail(`${record.code}: ID público ausente ou duplicado (${id}).`);
  const question = {
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
    alternativas: {Certo: 'Certo', Errado: 'Errado'},
    gabarito: record.answer,
    comentario: clean(record.comment),
    comentarios_alternativas: record.alternative_comments || {},
    fundamento: clean(record.foundation),
    pegadinha: clean(record.trap),
    observacoes: clean(record.observations),
    formato_questao: 'Certo / Errado',
    pagina_pdf: clean(record.pdf_page),
    fonte_oficial: record.source_url || record.notion_url,
    fonte_consolidada: record.source_url || record.notion_url,
    auditoria: 'Banco Mestre — lote formalmente liberado e validado em 02/08/2026',
    notion_url: record.notion_url,
    codigo_fonte: record.code,
    anulada: false,
    possui_imagem: false,
    descricao_imagem: clean(record.image_description),
    imagem: '',
  };
  target.material.questoes.push(question);
  catalog.question_index[id] = target.material.id;
  existingIds.add(key(id));
  existingCodes.add(key(record.code));
}

target.material.questoes.sort((left, right) => Number(left.numero) - Number(right.numero) || left.codigo.localeCompare(right.codigo));
target.material.quantidade_questoes = target.material.questoes.length;
target.material.tempo_sugerido_minutos ||= target.material.questoes.length;
target.metadata.quantidade_questoes = target.material.quantidade_questoes;
target.metadata.lote_publicacao = operationId;
fs.writeFileSync(resolve(target.metadata.file), `${JSON.stringify(target.material)}\n`);

catalog.materials.sort((left, right) => String(left.nome).localeCompare(String(right.nome), 'pt-BR'));
catalog.summary.materiais = catalog.materials.length;
catalog.summary.questoes = Object.keys(catalog.question_index || {}).length;
catalog.summary.provas = catalog.materials.filter(item => key(item.tipo_material) === 'prova').length;
catalog.summary.simulados = catalog.materials.filter(item => key(item.tipo_material) === 'simulado').length;
catalog.summary.aguardando_auditoria = Math.max(0, Number(catalog.summary.banco_mestre || 0) - catalog.summary.questoes);
if (catalog.summary.questoes !== 2609) fail(`Acervo após Biologia: ${catalog.summary.questoes}; esperado 2609.`);
catalog.source.criteria = `${catalog.summary.questoes} questões públicas após inclusão restrita do lote ${operationId}; acervo anterior integralmente preservado.`;

const catalogContent = `${JSON.stringify(catalog, null, 2)}\n`;
fs.writeFileSync(resolve(catalogPath), catalogContent);
manifest.summary = catalog.summary;
manifest.catalog_sha256 = sha256(catalogContent);
manifest.materials = catalog.materials.map(metadata => {
  const content = fs.readFileSync(resolve(metadata.file));
  return {
    id: metadata.id,
    file: metadata.file,
    questions: Number(metadata.quantidade_questoes),
    bytes: content.length,
    sha256: sha256(content),
  };
});
fs.writeFileSync(resolve(manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);

const actualNewCodes = new Set();
for (const metadata of catalog.materials) {
  const material = readJSON(metadata.file);
  for (const question of material.questoes || []) if (expectedSet.has(question.codigo)) actualNewCodes.add(question.codigo);
}
if (actualNewCodes.size !== 24 || expectedCodes.some(code => !actualNewCodes.has(code))) {
  fail('O catálogo final não contém exatamente os 24 códigos autorizados de Biologia.');
}

const receipt = {
  schema_version: '1.0',
  operation_id: operationId,
  applied_at: new Date().toISOString(),
  baseline_questions: baselineCount,
  added_questions: 24,
  final_questions: catalog.summary.questoes,
  material_id: target.material.id,
  material_questions: target.material.quantidade_questoes,
  codes: expectedCodes,
  codes_sha256: sha256(`${expectedCodes.join('\n')}\n`),
  preserved_existing_catalog: true,
  source_snapshot: snapshotPath,
  source_plan: planPath,
};
fs.writeFileSync(resolve(receiptPath), `${JSON.stringify(receipt, null, 2)}\n`);

execFileSync(process.execPath, ['--import=./scripts/fixed-build-time.mjs', 'scripts/build-study-index.mjs'], {cwd: root, stdio: 'inherit'});
execFileSync(process.execPath, ['scripts/build-public.mjs'], {cwd: root, stdio: 'inherit'});

const distCatalog = readJSON('dist/data/release/catalogo.json');
if (Number(distCatalog.summary?.questoes) !== 2609) fail('O pacote público não contém 2609 questões após Biologia.');
for (const code of expectedCodes) {
  let matches = 0;
  for (const metadata of distCatalog.materials || []) {
    const material = readJSON(`dist/${String(metadata.file).replace(/^\.\//, '')}`);
    matches += (material.questoes || []).filter(question => question.codigo === code).length;
  }
  if (matches !== 1) fail(`${code}: ocorrência pública ${matches}; esperado exatamente uma.`);
}

console.log(`✓ Lote ${operationId} aplicado: 24 novas questões, 2609 no pacote público e nenhum código anterior removido.`);
