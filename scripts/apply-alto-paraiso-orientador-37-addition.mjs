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

const snapshotPath = 'data/notion/publication-additions/alto-paraiso-orientador-37.json';
const planPath = 'data/notion/publication-additions/alto-paraiso-orientador-37-plan.json';
const catalogPath = 'data/release/catalogo.json';
const manifestPath = 'data/release/manifest.json';
const receiptPath = 'data/release/alto-paraiso-orientador-37-publication-receipt.json';
const operationId = 'QDX-ALTOPARAISO-GO-2023-ORIENTADOR-SOCIAL-202-001-040-20260803';
const prefix = 'PROVA-QDX-ALTOPARAISO-GO-2023-ORIENTADOR-SOCIAL-202-';
const excludedNumbers = new Set([9, 12, 19]);
const imageNumbers = new Set([6, 7, 8, 17, 18, 20, 25]);
const expectedCodes = Array.from({length: 40}, (_, index) => index + 1)
  .filter(number => !excludedNumbers.has(number))
  .map(number => `${prefix}${String(number).padStart(3, '0')}`);
const expectedSet = new Set(expectedCodes);
const imagePaths = new Map([
  [6, './assets/question-images/alto-paraiso-go-2023-orientador-social/q006-q008-tirinha.png'],
  [7, './assets/question-images/alto-paraiso-go-2023-orientador-social/q006-q008-tirinha.png'],
  [8, './assets/question-images/alto-paraiso-go-2023-orientador-social/q006-q008-tirinha.png'],
  [17, './assets/question-images/alto-paraiso-go-2023-orientador-social/q017-conversao-placas.png'],
  [18, './assets/question-images/alto-paraiso-go-2023-orientador-social/q018-mapa-escala.png'],
  [20, './assets/question-images/alto-paraiso-go-2023-orientador-social/q020-piscina.png'],
  [25, './assets/question-images/alto-paraiso-go-2023-orientador-social/q025-mapa-capitanias.png'],
]);

for (const required of [snapshotPath, planPath, catalogPath, manifestPath]) {
  if (!fs.existsSync(resolve(required))) fail(`Arquivo obrigatório ausente: ${required}.`);
}
for (const image of new Set(imagePaths.values())) {
  if (!fs.existsSync(resolve(image)) || fs.statSync(resolve(image)).size === 0) fail(`Imagem obrigatória ausente: ${image}.`);
}

const snapshot = readJSON(snapshotPath);
const plan = readJSON(planPath);
const catalog = readJSON(catalogPath);
const manifest = readJSON(manifestPath);

if (plan.total_records !== 37 || !Array.isArray(plan.lots) || plan.lots.length !== 1) {
  fail('Plano de Orientador Social deve conter exatamente 37 registros em um lote.');
}
const [lot] = plan.lots;
if (lot.lot !== operationId || lot.expected_count !== 37 || JSON.stringify(lot.codes) !== JSON.stringify(expectedCodes)) {
  fail('Plano de Orientador Social divergente.');
}
if (sha256(fs.readFileSync(resolve(snapshotPath))) !== plan.snapshot_sha256) {
  fail('Hash do snapshot divergente do plano.');
}
if (sha256(expectedCodes.join('\n')) !== lot.codes_sha256) {
  fail('Hash dos códigos divergente do plano.');
}

const byCode = new Map((snapshot.records || []).map(record => [clean(record.code), record]));
const additions = expectedCodes.map(code => byCode.get(code));
if (additions.some(record => !record)) fail('Snapshot de Orientador Social incompleto.');
if ((snapshot.records || []).length !== 37) fail('Snapshot contém registros fora do lote restrito.');

for (const record of additions) {
  const number = Number(record.original_number);
  if (clean(record.github_id) || record.released_for_export !== true || record.publication_lot !== operationId) {
    fail(`${record.code}: rastreabilidade, liberação ou lote inválido.`);
  }
  if (record.material_type !== 'Prova' || record.annulled === true) fail(`${record.code}: impedimento técnico.`);
  if (!clean(record.prompt) || !clean(record.answer) || !clean(record.comment) || !clean(record.foundation) || !clean(record.pdf_page)) {
    fail(`${record.code}: conteúdo essencial ou página do PDF incompleta.`);
  }
  if (record.format !== 'Múltipla escolha A–E' || !['A', 'B', 'C', 'D', 'E'].includes(record.answer)) {
    fail(`${record.code}: formato ou gabarito inválido.`);
  }
  for (const letter of ['A', 'B', 'C', 'D', 'E']) {
    if (!clean(record.alternatives?.[letter])) fail(`${record.code}: alternativa ${letter} ausente.`);
  }
  const shouldHaveImage = imageNumbers.has(number);
  if (Boolean(record.has_image) !== shouldHaveImage) fail(`${record.code}: marcação de imagem divergente.`);
  if (shouldHaveImage && (!clean(record.image_description) || !imagePaths.get(number))) {
    fail(`${record.code}: imagem ou descrição visual ausente.`);
  }
}
for (const number of excludedNumbers) {
  const code = `${prefix}${String(number).padStart(3, '0')}`;
  if (byCode.has(code)) fail(`${code}: questão anulada entrou indevidamente no snapshot.`);
}

const baseline = Number(catalog.summary?.questoes);
if (baseline !== 2702) fail(`Base pública antes de Orientador Social: ${baseline}; esperado 2702.`);
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
for (const code of expectedCodes) if (existingCodes.has(key(code))) fail(`${code}: já existe no catálogo.`);

const first = additions[0];
let target = materialByName.get(key(first.material_name));
if (!target) {
  const id = `notion-${slug(first.material_name || operationId)}`;
  const material = {
    id,
    tipo_material: 'prova',
    fonte: first.source_board || 'Instituto Quadrix',
    nome: first.material_name,
    ano: first.year || 2023,
    orgao: first.organization || 'Prefeitura Municipal de Alto Paraíso de Goiás/GO',
    cargo: first.cargo || 'Orientador Social',
    codigo_cargo: first.cargo_code || '202',
    disciplina: 'Múltiplas matérias',
    bloco: 'Prova completa',
    status: 'publicado',
    source_url: first.source_url || first.notion_url,
    formato_questao: 'Múltipla escolha A–E',
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
  const number = Number(record.original_number);
  const id = slug(record.code);
  if (!id || existingIds.has(key(id))) fail(`${record.code}: ID público duplicado.`);
  const image = imagePaths.get(number) || '';
  target.material.questoes.push({
    id,
    codigo: record.code,
    numero: number,
    numero_original: number,
    bloco: clean(record.block),
    disciplina: clean(record.discipline),
    assunto: clean(record.subject),
    subassunto: clean(record.subsubject),
    texto_base: clean(record.text_base),
    enunciado: clean(record.prompt),
    alternativas: record.alternatives,
    gabarito: record.answer,
    comentario: clean(record.comment),
    comentarios_alternativas: record.alternative_comments || {},
    fundamento: clean(record.foundation),
    pegadinha: clean(record.trap),
    observacoes: clean(record.observations),
    formato_questao: 'Múltipla escolha A–E',
    pagina_pdf: clean(record.pdf_page),
    fonte_oficial: record.source_url || record.notion_url,
    fonte_consolidada: record.source_url || record.notion_url,
    auditoria: 'Banco Mestre — lote formalmente liberado, com anexos e imagens validados em 03/08/2026',
    notion_url: record.notion_url,
    codigo_fonte: record.code,
    anulada: false,
    possui_imagem: Boolean(image),
    descricao_imagem: clean(record.image_description),
    imagem: image,
  });
  catalog.question_index[id] = target.material.id;
  existingIds.add(key(id));
}

target.material.questoes.sort((a, b) => Number(a.numero) - Number(b.numero));
target.material.quantidade_questoes = target.material.questoes.length;
target.material.tempo_sugerido_minutos ||= target.material.questoes.length * 2;
target.metadata.quantidade_questoes = target.material.quantidade_questoes;
target.metadata.lote_publicacao = operationId;
target.metadata.disciplina = 'Múltiplas matérias';
target.metadata.bloco = 'Prova completa';
fs.writeFileSync(resolve(target.metadata.file), `${JSON.stringify(target.material)}\n`);

catalog.materials.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
catalog.summary.materiais = catalog.materials.length;
catalog.summary.questoes = Object.keys(catalog.question_index || {}).length;
catalog.summary.provas = catalog.materials.filter(item => key(item.tipo_material) === 'prova').length;
catalog.summary.simulados = catalog.materials.filter(item => key(item.tipo_material) === 'simulado').length;
catalog.summary.aguardando_auditoria = Math.max(0, Number(catalog.summary.banco_mestre || 0) - catalog.summary.questoes);
if (catalog.summary.questoes !== 2739) fail(`Acervo após Orientador Social: ${catalog.summary.questoes}; esperado 2739.`);
catalog.source.criteria = `${catalog.summary.questoes} questões públicas após inclusão restrita do lote ${operationId}; acervo anterior preservado.`;

const catalogContent = `${JSON.stringify(catalog, null, 2)}\n`;
fs.writeFileSync(resolve(catalogPath), catalogContent);
manifest.summary = catalog.summary;
manifest.catalog_sha256 = sha256(catalogContent);
manifest.materials = catalog.materials.map(metadata => {
  const content = fs.readFileSync(resolve(metadata.file));
  return {id: metadata.id, file: metadata.file, questions: Number(metadata.quantidade_questoes), bytes: content.length, sha256: sha256(content)};
});
fs.writeFileSync(resolve(manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);

const receipt = {
  schema_version: '1.0',
  operation_id: operationId,
  applied_at: new Date().toISOString(),
  baseline_questions: baseline,
  added_questions: 37,
  final_questions: catalog.summary.questoes,
  material_id: target.material.id,
  material_questions: target.material.quantidade_questoes,
  codes: expectedCodes,
  excluded_original_numbers: [...excludedNumbers],
  image_original_numbers: [...imageNumbers],
  codes_sha256: sha256(`${expectedCodes.join('\n')}\n`),
  preserved_existing_catalog: true,
  source_snapshot: snapshotPath,
  source_plan: planPath,
};
fs.writeFileSync(resolve(receiptPath), `${JSON.stringify(receipt, null, 2)}\n`);

execFileSync(process.execPath, ['--import=./scripts/fixed-build-time.mjs', 'scripts/build-study-index.mjs'], {cwd: root, stdio: 'inherit'});
execFileSync(process.execPath, ['scripts/build-public.mjs'], {cwd: root, stdio: 'inherit'});
const distCatalog = readJSON('dist/data/release/catalogo.json');
if (Number(distCatalog.summary?.questoes) !== 2739) fail('Pacote público não contém 2739 questões.');

const occurrences = new Map(expectedCodes.map(code => [code, 0]));
let publishedMaterial = null;
for (const metadata of distCatalog.materials || []) {
  const material = readJSON(`dist/${String(metadata.file).replace(/^\.\//, '')}`);
  for (const question of material.questoes || []) {
    if (expectedSet.has(question.codigo)) {
      occurrences.set(question.codigo, occurrences.get(question.codigo) + 1);
      publishedMaterial = material;
      if (imageNumbers.has(Number(question.numero))) {
        if (!question.imagem || !fs.existsSync(resolve(`dist/${question.imagem.replace(/^\.\//, '')}`))) {
          fail(`${question.codigo}: imagem não foi copiada para o pacote público.`);
        }
      }
    }
  }
}
for (const code of expectedCodes) if (occurrences.get(code) !== 1) fail(`${code}: ocorrência pública ${occurrences.get(code)}.`);
for (const number of excludedNumbers) {
  const code = `${prefix}${String(number).padStart(3, '0')}`;
  if (existingCodes.has(key(code))) fail(`${code}: questão anulada já estava no catálogo anterior.`);
}
if (!publishedMaterial || publishedMaterial.quantidade_questoes !== 37) fail('Material público não contém exatamente 37 questões.');
console.log(`✓ Lote ${operationId} aplicado: 37 novas questões, sete recursos visuais e 2739 no pacote público.`);
