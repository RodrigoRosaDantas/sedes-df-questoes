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

const snapshotPath = 'data/notion/publication-additions/crefito17-agentefiscal-62.json';
const planPath = 'data/notion/publication-additions/crefito17-agentefiscal-62-plan.json';
const catalogPath = 'data/release/catalogo.json';
const manifestPath = 'data/release/manifest.json';
const receiptPath = 'data/release/crefito17-agentefiscal-62-publication-receipt.json';
const operationId = 'CREFITO17-2026-AGENTE-FISCAL-APTOS-62-20260803';
const prefix = 'PROVA-QDX-CREFITO17-2026-AGENTE-FISCAL-401-';
const blockedCode = `${prefix}046`;

for (const required of [snapshotPath, planPath, catalogPath, manifestPath]) {
  if (!fs.existsSync(resolve(required))) fail(`Arquivo obrigatório ausente: ${required}.`);
}

const snapshotBytes = fs.readFileSync(resolve(snapshotPath));
const snapshot = JSON.parse(snapshotBytes);
const plan = readJSON(planPath);
const catalog = readJSON(catalogPath);
const manifest = readJSON(manifestPath);

if (plan.total_records !== 62 || !Array.isArray(plan.lots) || plan.lots.length !== 1) {
  fail('Plano do Agente Fiscal deve conter exatamente 62 registros em um lote.');
}
const [lot] = plan.lots;
if (lot.lot !== operationId || lot.expected_count !== 62 || !Array.isArray(lot.codes) || lot.codes.length !== 62) {
  fail('Plano do Agente Fiscal divergente.');
}
const expectedCodes = [...lot.codes];
const expectedSet = new Set(expectedCodes);
if (expectedSet.size !== 62 || expectedSet.has(blockedCode)) fail('Plano contém código duplicado ou o item 46 bloqueado.');
if (expectedCodes.some(code => !code.startsWith(prefix))) fail('Plano contém código fora do prefixo autorizado.');
if (sha256(snapshotBytes) !== plan.snapshot_sha256) fail('Hash do snapshot divergente do plano.');
if (sha256(expectedCodes.join('\n')) !== lot.codes_sha256) fail('Hash dos códigos divergente do plano.');

const byCode = new Map((snapshot.records || []).map(record => [clean(record.code), record]));
const additions = expectedCodes.map(code => byCode.get(code));
if (additions.some(record => !record)) fail('Snapshot do Agente Fiscal está incompleto.');
if (additions.length !== 62) fail('Quantidade de adições divergente.');

for (const record of additions) {
  if (clean(record.github_id) || record.released_for_export !== true || record.publication_lot !== operationId) {
    fail(`${record.code}: rastreabilidade, liberação ou lote inválido.`);
  }
  if (record.material_type !== 'Prova' || record.annulled === true || record.has_image === true) {
    fail(`${record.code}: impedimento técnico.`);
  }
  if (!clean(record.prompt) || !clean(record.answer) || !clean(record.comment) || !clean(record.foundation) || !clean(record.pdf_page)) {
    fail(`${record.code}: conteúdo essencial ou página do PDF incompleta.`);
  }
  if (!clean(record.discipline) || !clean(record.subject) || !clean(record.source_url)) {
    fail(`${record.code}: metadados essenciais incompletos.`);
  }
  if (record.format !== 'Certo / Errado' || !['Certo', 'Errado'].includes(record.answer)) {
    fail(`${record.code}: formato ou gabarito inválido.`);
  }
  if (Number(record.original_number) === 46) fail(`${record.code}: item 46 entrou indevidamente no lote.`);
}

const baseline = Number(catalog.summary?.questoes);
if (baseline !== 2739) fail(`Base pública antes do Agente Fiscal: ${baseline}; esperado 2739.`);
const existingIds = new Set(Object.keys(catalog.question_index || {}).map(key));
const existingCodes = new Set();
const existingCrefitoCodes = new Set();
const materialByName = new Map();
for (const metadata of catalog.materials || []) {
  const material = readJSON(metadata.file);
  materialByName.set(key(material.nome), {metadata, material});
  for (const question of material.questoes || []) {
    for (const code of [question.codigo, question.codigo_fonte]) {
      if (!code) continue;
      existingCodes.add(key(code));
      if (clean(code).startsWith(prefix)) existingCrefitoCodes.add(clean(code));
    }
  }
}
if (existingCrefitoCodes.size !== 57) {
  fail(`Catálogo deveria conter 57 itens históricos do Agente Fiscal; contém ${existingCrefitoCodes.size}.`);
}
if (existingCrefitoCodes.has(blockedCode)) fail(`${blockedCode}: item bloqueado já consta no catálogo.`);
for (const code of expectedCodes) if (existingCodes.has(key(code))) fail(`${code}: já existe no catálogo.`);

const first = additions[0];
const target = materialByName.get(key(first.material_name));
if (!target) fail(`Material existente não encontrado: ${first.material_name}.`);
if (target.material.questoes.length !== 57) {
  fail(`Material do Agente Fiscal deveria ter 57 questões; contém ${target.material.questoes.length}.`);
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
    auditoria: 'Banco Mestre — lote formalmente liberado e validado em 03/08/2026',
    notion_url: record.notion_url,
    codigo_fonte: record.code,
    anulada: false,
    possui_imagem: false,
    descricao_imagem: clean(record.image_description),
    imagem: '',
  });
  catalog.question_index[id] = target.material.id;
  existingIds.add(key(id));
}

target.material.questoes.sort((a, b) => Number(a.numero) - Number(b.numero));
target.material.quantidade_questoes = target.material.questoes.length;
target.material.tempo_sugerido_minutos ||= target.material.questoes.length;
target.material.lote_publicacao = operationId;
target.metadata.quantidade_questoes = target.material.quantidade_questoes;
target.metadata.lote_publicacao = operationId;
if (target.material.quantidade_questoes !== 119) {
  fail(`Material do Agente Fiscal deveria terminar com 119 questões; contém ${target.material.quantidade_questoes}.`);
}
if (target.material.questoes.some(question => clean(question.codigo) === blockedCode)) {
  fail(`${blockedCode}: item bloqueado entrou no material público.`);
}
fs.writeFileSync(resolve(target.metadata.file), `${JSON.stringify(target.material)}\n`);

catalog.materials.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
catalog.summary.materiais = catalog.materials.length;
catalog.summary.questoes = Object.keys(catalog.question_index || {}).length;
catalog.summary.provas = catalog.materials.filter(item => key(item.tipo_material) === 'prova').length;
catalog.summary.simulados = catalog.materials.filter(item => key(item.tipo_material) === 'simulado').length;
catalog.summary.aguardando_auditoria = Math.max(0, Number(catalog.summary.banco_mestre || 0) - catalog.summary.questoes);
if (catalog.summary.questoes !== 2801) fail(`Acervo após Agente Fiscal: ${catalog.summary.questoes}; esperado 2801.`);
catalog.source.criteria = `${catalog.summary.questoes} questões públicas após inclusão restrita do lote ${operationId}; 57 itens históricos e o item 46 preservados.`;

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
  schema_version: '1.0',
  operation_id: operationId,
  applied_at: new Date().toISOString(),
  baseline_questions: baseline,
  historical_public_questions: 57,
  added_questions: 62,
  final_questions: catalog.summary.questoes,
  material_id: target.material.id,
  material_questions: target.material.quantidade_questoes,
  codes: expectedCodes,
  blocked_original_numbers: [46],
  codes_sha256: sha256(`${expectedCodes.join('\n')}\n`),
  preserved_existing_catalog: true,
  source_snapshot: snapshotPath,
  source_plan: planPath,
};
fs.writeFileSync(resolve(receiptPath), `${JSON.stringify(receipt, null, 2)}\n`);

execFileSync(process.execPath, ['--import=./scripts/fixed-build-time.mjs', 'scripts/build-study-index.mjs'], {cwd: root, stdio: 'inherit'});
execFileSync(process.execPath, ['scripts/build-public.mjs'], {cwd: root, stdio: 'inherit'});
const distCatalog = readJSON('dist/data/release/catalogo.json');
if (Number(distCatalog.summary?.questoes) !== 2801) fail('Pacote público não contém 2801 questões.');

const occurrences = new Map(expectedCodes.map(code => [code, 0]));
let blockedOccurrences = 0;
let publishedMaterial = null;
for (const metadata of distCatalog.materials || []) {
  const material = readJSON(`dist/${String(metadata.file).replace(/^\.\//, '')}`);
  for (const question of material.questoes || []) {
    if (expectedSet.has(question.codigo)) {
      occurrences.set(question.codigo, occurrences.get(question.codigo) + 1);
      publishedMaterial = material;
    }
    if (clean(question.codigo) === blockedCode) blockedOccurrences += 1;
  }
}
for (const code of expectedCodes) {
  if (occurrences.get(code) !== 1) fail(`${code}: ocorrência pública ${occurrences.get(code)}.`);
}
if (blockedOccurrences !== 0) fail(`${blockedCode}: ocorrência pública ${blockedOccurrences}.`);
if (!publishedMaterial || publishedMaterial.quantidade_questoes !== 119) {
  fail('Material público do Agente Fiscal não contém exatamente 119 questões.');
}
console.log(`✓ Lote ${operationId} aplicado: 62 novas questões, 119 no material e 2801 no pacote público.`);
