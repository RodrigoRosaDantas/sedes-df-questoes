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
const configPath = 'data/operations/publication-additions.json';
const catalogPath = 'data/release/catalogo.json';
const manifestPath = 'data/release/manifest.json';
const receiptPath = 'data/release/publication-additions-receipt.json';

for (const required of [configPath, catalogPath, manifestPath]) {
  if (!fs.existsSync(resolve(required))) fail(`Arquivo obrigatório ausente: ${required}.`);
}

const config = readJSON(configPath);
const lots = Array.isArray(config.lots) ? config.lots : [];
if (!lots.length) fail('Nenhum lote adicional foi configurado.');
if (new Set(lots.map(lot => clean(lot.id))).size !== lots.length) fail('Há identificadores de lote repetidos.');
const configuredAdded = lots.reduce((sum, lot) => sum + Number(lot.expected_count || 0), 0);
if (configuredAdded !== Number(config.expected_added_questions)) fail('A soma dos lotes diverge do total adicional configurado.');
if (Number(config.baseline_questions) + configuredAdded !== Number(config.expected_final_questions)) {
  fail('O total final configurado não fecha com a base e os lotes adicionais.');
}

const catalog = readJSON(catalogPath);
const manifest = readJSON(manifestPath);
const baselineCount = Number(catalog.summary?.questoes);
if (baselineCount !== Number(config.baseline_questions)) {
  fail(`Base pública divergente: ${baselineCount}; esperado ${config.baseline_questions}.`);
}

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

const appliedLots = [];
const allExpectedCodes = [];
for (const lotConfig of lots) {
  const operationId = clean(lotConfig.id);
  const expectedCount = Number(lotConfig.expected_count);
  const firstNumber = Number(lotConfig.first_number);
  const lastNumber = Number(lotConfig.last_number);
  const codePrefix = clean(lotConfig.code_prefix);
  if (!operationId || !codePrefix || !Number.isInteger(expectedCount) || expectedCount <= 0) {
    fail('Configuração de lote incompleta ou inválida.');
  }
  if (lastNumber - firstNumber + 1 !== expectedCount) fail(`${operationId}: intervalo não fecha com a contagem.`);
  const expectedCodes = Array.from(
    {length: expectedCount},
    (_, index) => `${codePrefix}${String(firstNumber + index).padStart(3, '0')}`,
  );
  const expectedSet = new Set(expectedCodes);
  allExpectedCodes.push(...expectedCodes);

  for (const required of [lotConfig.snapshot, lotConfig.plan]) {
    if (!fs.existsSync(resolve(required))) fail(`${operationId}: arquivo ausente: ${required}.`);
  }
  const snapshot = readJSON(lotConfig.snapshot);
  const plan = readJSON(lotConfig.plan);
  if (plan.total_records !== expectedCount || !Array.isArray(plan.lots) || plan.lots.length !== 1) {
    fail(`${operationId}: plano deve conter exatamente ${expectedCount} registros em um único lote.`);
  }
  const [plannedLot] = plan.lots;
  if (plannedLot.lot !== operationId || plannedLot.expected_count !== expectedCount
    || JSON.stringify(plannedLot.codes) !== JSON.stringify(expectedCodes)) {
    fail(`${operationId}: plano não corresponde ao escopo autorizado.`);
  }

  const recordsByCode = new Map((snapshot.records || []).map(record => [clean(record.code), record]));
  const additions = expectedCodes.map(code => recordsByCode.get(code));
  const missing = expectedCodes.filter((code, index) => !additions[index]);
  const unexpected = [...recordsByCode.keys()].filter(code => !expectedSet.has(code));
  if (missing.length || unexpected.length || recordsByCode.size !== expectedCount) {
    fail(`${operationId}: snapshot divergente; ausentes: ${missing.join(', ') || 'nenhum'}; inesperados: ${unexpected.join(', ') || 'nenhum'}.`);
  }

  for (const record of additions) {
    if (clean(record.github_id)) fail(`${record.code}: já possui Código GitHub.`);
    if (record.released_for_export !== true) fail(`${record.code}: não está liberada para exportação.`);
    if (record.publication_lot !== operationId) fail(`${record.code}: lote divergente.`);
    if (record.material_type !== 'Prova') fail(`${record.code}: tipo de material diferente de Prova.`);
    if (record.annulled === true) fail(`${record.code}: questão anulada não pode ser publicada.`);
    if (record.duplicated === true) fail(`${record.code}: questão duplicada não pode ser publicada.`);
    if (record.manual_block === true) fail(`${record.code}: bloqueio manual ativo.`);
    if (record.has_image === true) fail(`${record.code}: questão com imagem pendente não pertence à operação.`);
    for (const [value, label] of [
      [record.code, 'código'], [record.title, 'título'], [record.material_name, 'material'],
      [record.prompt, 'enunciado'], [record.answer, 'gabarito'], [record.comment, 'comentário'],
      [record.foundation, 'fundamento'], [record.subject, 'assunto'], [record.source_url, 'fonte'],
    ]) if (!clean(value)) fail(`${record.code}: ${label} ausente.`);
    if (record.format !== 'Certo / Errado' || !['Certo', 'Errado'].includes(record.answer)) {
      fail(`${record.code}: formato ou gabarito inválido.`);
    }
    if (existingCodes.has(key(record.code))) fail(`${record.code}: já existe no catálogo público.`);
  }

  const first = additions[0];
  if (additions.some(record => key(record.material_name) !== key(first.material_name))) {
    fail(`${operationId}: registros pertencem a materiais diferentes.`);
  }
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
      cargo: first.cargo,
      codigo_cargo: first.cargo_code,
      disciplina: first.discipline,
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
    materialByName.set(materialKey, target);
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
  appliedLots.push({
    operation_id: operationId,
    label: clean(lotConfig.label),
    added_questions: expectedCount,
    material_id: target.material.id,
    material_questions: target.material.quantidade_questoes,
    codes: expectedCodes,
    codes_sha256: sha256(`${expectedCodes.join('\n')}\n`),
    source_snapshot: lotConfig.snapshot,
    source_plan: lotConfig.plan,
  });
}

if (new Set(allExpectedCodes).size !== allExpectedCodes.length) fail('Há códigos repetidos entre os lotes adicionais.');
catalog.materials.sort((left, right) => String(left.nome).localeCompare(String(right.nome), 'pt-BR'));
catalog.summary.materiais = catalog.materials.length;
catalog.summary.questoes = Object.keys(catalog.question_index || {}).length;
catalog.summary.provas = catalog.materials.filter(item => key(item.tipo_material) === 'prova').length;
catalog.summary.simulados = catalog.materials.filter(item => key(item.tipo_material) === 'simulado').length;
catalog.summary.aguardando_auditoria = Math.max(0, Number(catalog.summary.banco_mestre || 0) - catalog.summary.questoes);
if (catalog.summary.questoes !== Number(config.expected_final_questions)) {
  fail(`Acervo após adições: ${catalog.summary.questoes}; esperado ${config.expected_final_questions}.`);
}
catalog.source.criteria = `${catalog.summary.questoes} questões públicas após inclusão restrita de ${configuredAdded} registro(s) em ${lots.length} lote(s); acervo anterior integralmente preservado.`;

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
  applied_at: new Date().toISOString(),
  baseline_questions: baselineCount,
  added_questions: configuredAdded,
  final_questions: catalog.summary.questoes,
  final_materials: catalog.summary.materiais,
  preserved_existing_catalog: true,
  lots: appliedLots,
};
fs.writeFileSync(resolve(receiptPath), `${JSON.stringify(receipt, null, 2)}\n`);

execFileSync(process.execPath, ['--import=./scripts/fixed-build-time.mjs', 'scripts/build-study-index.mjs'], {cwd: root, stdio: 'inherit'});
execFileSync(process.execPath, ['scripts/build-public.mjs'], {cwd: root, stdio: 'inherit'});

const distCatalog = readJSON('dist/data/release/catalogo.json');
if (Number(distCatalog.summary?.questoes) !== Number(config.expected_final_questions)) {
  fail(`Pacote público com ${distCatalog.summary?.questoes}; esperado ${config.expected_final_questions}.`);
}
for (const code of allExpectedCodes) {
  let matches = 0;
  for (const metadata of distCatalog.materials || []) {
    const material = readJSON(`dist/${String(metadata.file).replace(/^\.\//, '')}`);
    matches += (material.questoes || []).filter(question => question.codigo === code).length;
  }
  if (matches !== 1) fail(`${code}: ocorrência pública ${matches}; esperado exatamente uma.`);
}

console.log(`✓ ${lots.length} lote(s) adicionais aplicados: ${configuredAdded} novas questões, ${catalog.summary.questoes} no pacote público e nenhum código anterior removido.`);
