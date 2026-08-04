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

const snapshotPath = 'data/notion/publication-additions/crbm6-contador-70.json';
const planPath = 'data/notion/publication-additions/crbm6-contador-70-plan.json';
const catalogPath = 'data/release/catalogo.json';
const manifestPath = 'data/release/manifest.json';
const receiptPath = 'data/release/crbm6-contador-70-publication-receipt.json';
const operationId = 'CRBM6-2026-CONTADOR-402-001-070-20260803';
const prefix = 'PROVA-QDX-CRBM6-2026-CONTADOR-402-';
const authorizedCodes = Array.from({length: 70}, (_, index) => `${prefix}${String(index + 1).padStart(3, '0')}`);
const historicalCodes = Array.from({length: 50}, (_, index) => `${prefix}${String(index + 71).padStart(3, '0')}`);
const fullExamCodes = [...authorizedCodes, ...historicalCodes];
const fullExamSet = new Set(fullExamCodes);

for (const required of [snapshotPath, planPath, catalogPath, manifestPath]) {
  if (!fs.existsSync(resolve(required))) fail(`Arquivo obrigatório ausente: ${required}.`);
}

const snapshotBytes = fs.readFileSync(resolve(snapshotPath));
const snapshot = JSON.parse(snapshotBytes);
const plan = readJSON(planPath);
const catalog = readJSON(catalogPath);
const manifest = readJSON(manifestPath);

if (plan.total_records !== 70 || !Array.isArray(plan.lots) || plan.lots.length !== 1) {
  fail('Plano de Contador deve conter exatamente 70 registros em um lote.');
}
const [lot] = plan.lots;
if (lot.lot !== operationId || lot.expected_count !== 70 || JSON.stringify(lot.codes) !== JSON.stringify(authorizedCodes)) {
  fail('Plano de Contador diverge do lote autorizado ou da sequência 001–070.');
}
if (sha256(snapshotBytes) !== plan.snapshot_sha256) fail('Hash do snapshot de Contador diverge do plano.');
if (sha256(authorizedCodes.join('\n')) !== lot.codes_sha256) fail('Hash dos códigos de Contador diverge do plano.');

const byCode = new Map((snapshot.records || []).map(record => [clean(record.code), record]));
const additions = authorizedCodes.map(code => byCode.get(code));
if (additions.some(record => !record)) fail('Snapshot de Contador está incompleto.');

for (const record of additions) {
  if (clean(record.github_id) || record.released_for_export !== true || clean(record.publication_lot) !== operationId) {
    fail(`${record.code}: rastreabilidade, liberação ou lote inválido.`);
  }
  if (record.material_type !== 'Prova' || record.annulled === true || record.has_image === true) {
    fail(`${record.code}: impedimento técnico.`);
  }
  if (!clean(record.prompt) || !clean(record.answer) || !clean(record.comment) || !clean(record.foundation) || !clean(record.pdf_page)) {
    fail(`${record.code}: conteúdo essencial ou página do PDF incompleta.`);
  }
  if (!clean(record.discipline) || !clean(record.subject) || !clean(record.source_url) || !clean(record.organization) || !clean(record.cargo)) {
    fail(`${record.code}: metadados essenciais incompletos.`);
  }
  if (record.format !== 'Certo / Errado' || !['Certo', 'Errado'].includes(record.answer)) {
    fail(`${record.code}: formato ou gabarito inválido.`);
  }
  const originalNumber = Number(record.original_number);
  if (originalNumber < 1 || originalNumber > 70) fail(`${record.code}: número original fora do intervalo 1–70.`);
}

const baseline = Number(catalog.summary?.questoes);
if (baseline !== 2801) fail(`Base pública antes de Contador: ${baseline}; esperado 2801.`);
const existingIds = new Set(Object.keys(catalog.question_index || {}).map(key));
const existingCodes = new Set();
const existingContadorCodes = new Set();
const materialByName = new Map();
for (const metadata of catalog.materials || []) {
  const material = readJSON(metadata.file);
  materialByName.set(key(material.nome), {metadata, material});
  for (const question of material.questoes || []) {
    for (const code of [question.codigo, question.codigo_fonte]) {
      if (!code) continue;
      existingCodes.add(key(code));
      const normalized = clean(code);
      if (normalized.startsWith(prefix)) existingContadorCodes.add(normalized);
    }
  }
}

const sortedExisting = [...existingContadorCodes].sort((left, right) => left.localeCompare(right, 'pt-BR'));
if (JSON.stringify(sortedExisting) !== JSON.stringify(historicalCodes)) {
  const unexpected = sortedExisting.filter(code => !fullExamSet.has(code));
  const missing = historicalCodes.filter(code => !existingContadorCodes.has(code));
  fail(`Histórico público de Contador divergente: ${sortedExisting.length} encontrado(s), ${missing.length} ausente(s) e ${unexpected.length} fora da prova.`);
}
for (const code of authorizedCodes) {
  if (existingCodes.has(key(code))) fail(`${code}: código autorizado já existe no catálogo.`);
}

const first = additions[0];
const target = materialByName.get(key(first.material_name));
if (!target) fail(`Material existente não encontrado: ${first.material_name}.`);
if (target.material.questoes.length !== 50) {
  fail(`Material de Contador deveria ter 50 questões históricas; contém ${target.material.questoes.length}.`);
}

for (const record of additions) {
  const id = slug(record.code);
  if (!id || existingIds.has(key(id))) fail(`${record.code}: ID público duplicado.`);
  target.material.questoes.push({
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
    auditoria: 'Banco Mestre — lote formalmente liberado e validado em 03/08/2026; 50 itens históricos preservados sem alteração',
    notion_url: record.notion_url,
    codigo_fonte: record.code,
    anulada: false,
    possui_imagem: false,
    descricao_imagem: clean(record.image_description),
    imagem: '',
  });
  catalog.question_index[id] = target.material.id;
  existingIds.add(key(id));
  existingCodes.add(key(record.code));
}

target.material.questoes.sort((left, right) => Number(left.numero) - Number(right.numero));
target.material.quantidade_questoes = target.material.questoes.length;
target.material.tempo_sugerido_minutos ||= target.material.questoes.length;
target.material.lote_publicacao = operationId;
target.metadata.quantidade_questoes = target.material.quantidade_questoes;
target.metadata.lote_publicacao = operationId;
if (target.material.quantidade_questoes !== 120) {
  fail(`Material de Contador deveria terminar com 120 questões; contém ${target.material.quantidade_questoes}.`);
}
fs.writeFileSync(resolve(target.metadata.file), `${JSON.stringify(target.material)}\n`);

catalog.materials.sort((left, right) => String(left.nome).localeCompare(String(right.nome), 'pt-BR'));
catalog.summary.materiais = catalog.materials.length;
catalog.summary.questoes = Object.keys(catalog.question_index || {}).length;
catalog.summary.provas = catalog.materials.filter(item => key(item.tipo_material) === 'prova').length;
catalog.summary.simulados = catalog.materials.filter(item => key(item.tipo_material) === 'simulado').length;
catalog.summary.aguardando_auditoria = Math.max(0, Number(catalog.summary.banco_mestre || 0) - catalog.summary.questoes);
if (catalog.summary.questoes !== 2871) fail(`Acervo após Contador: ${catalog.summary.questoes}; esperado 2871.`);
catalog.source.criteria = `${catalog.summary.questoes} questões públicas após inclusão restrita do lote ${operationId}; 50 itens históricos 071–120 preservados e 70 itens 001–070 acrescentados.`;

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

const receipt = {
  schema_version: '1.1',
  operation_id: operationId,
  applied_at: new Date().toISOString(),
  baseline_questions: baseline,
  authorized_codes: authorizedCodes.length,
  historical_public_questions: historicalCodes.length,
  already_public_authorized_questions: 0,
  added_questions: additions.length,
  final_questions: catalog.summary.questoes,
  material_id: target.material.id,
  material_questions: target.material.quantidade_questoes,
  codes: authorizedCodes,
  already_public_authorized_codes: [],
  added_codes: authorizedCodes,
  historical_codes: historicalCodes,
  codes_sha256: sha256(`${authorizedCodes.join('\n')}\n`),
  preserved_existing_catalog: true,
  source_snapshot: snapshotPath,
  source_plan: planPath,
};
fs.writeFileSync(resolve(receiptPath), `${JSON.stringify(receipt, null, 2)}\n`);

execFileSync(process.execPath, ['--import=./scripts/fixed-build-time.mjs', 'scripts/build-study-index.mjs'], {cwd: root, stdio: 'inherit'});
execFileSync(process.execPath, ['scripts/build-public.mjs'], {cwd: root, stdio: 'inherit'});
const distCatalog = readJSON('dist/data/release/catalogo.json');
if (Number(distCatalog.summary?.questoes) !== 2871) fail('Pacote público não contém 2871 questões.');

const occurrences = new Map(fullExamCodes.map(code => [code, 0]));
let publishedMaterial = null;
for (const metadata of distCatalog.materials || []) {
  const material = readJSON(`dist/${String(metadata.file).replace(/^\.\//, '')}`);
  for (const question of material.questoes || []) {
    if (occurrences.has(question.codigo)) {
      occurrences.set(question.codigo, occurrences.get(question.codigo) + 1);
      publishedMaterial = material;
    }
  }
}
for (const [code, count] of occurrences) {
  if (count !== 1) fail(`${code}: ocorrência pública ${count}.`);
}
if (!publishedMaterial || publishedMaterial.quantidade_questoes !== 120) {
  fail('Material público de Contador não contém exatamente 120 questões.');
}
console.log(`✓ Lote ${operationId} aplicado: 70 novas questões, 50 históricas preservadas, 120 no material e 2871 no pacote público.`);
