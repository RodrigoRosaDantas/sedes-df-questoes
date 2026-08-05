import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_VERSION = '2.9.1';
const CACHE_VERSION = 'sedes-questoes-v2-13-0-r4';
const RELEASE_KEY = '3048-3046-71-r4';
const APP_ASSET_VERSION = '12';
const REVIEW_DATE = '2026-08-05';
const HOTFIX_MARKER = 'Hotfix editorial concluído em 05/08/2026: texto-base restaurado, comentário normalizado, observações reconciliadas e dificuldade revisada.';
const OLD_OBSERVATION = 'Sem lote, sem liberação para exportação e sem Código GitHub.';
const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2026-03-11';

const MATERIALS = [
  {
    key: 'contabilidade',
    file: 'data/release/materials/notion-professor-de-educacao-basica-contabilidade-seedf-df-quadrix-2025-tipo-a.json',
    prefix: 'PROVA-QDX-SEEDF-2025-CONT-A-',
    start: 71,
    end: 120,
    difficult: new Set([76, 81, 82, 84, 86, 87, 106, 107, 117]),
    medium: new Set([71, 72, 73, 83, 85, 94, 95, 97, 98, 100, 101, 102, 103, 104, 105, 109, 110]),
  },
  {
    key: 'eletronica',
    file: 'data/release/materials/notion-professor-de-educacao-basica-eletronica-seedf-df-quadrix-2025-tipo-a.json',
    prefix: 'PROVA-QDX-SEEDF-2025-ELETR-A-',
    start: 71,
    end: 95,
    difficult: new Set([73, 78, 94]),
    medium: new Set([86, 89, 90, 93, 95]),
  },
];

const CONT_BASES = [
  [71, 74, 'Acerca das legislações e das normas contábeis vigentes, considerando‑se também as respectivas análises e as interpretações técnicas, julgue os itens a seguir.'],
  [75, 80, 'A respeito da elaboração e da apresentação das demonstrações contábeis, da obrigatoriedade e conteúdo das notas explicativas, bem como dos princípios e definições previstos na estrutura conceitual da contabilidade (CPC 00), considerando as normas brasileiras convergentes às normas internacionais (IFRS), julgue os itens a seguir.'],
  [81, 88, 'A respeito dos pronunciamentos técnicos do Comitê de Pronunciamentos Contábeis (CPC), julgue os itens a seguir.'],
  [89, 93, 'Acerca da mensuração, do reconhecimento e da apresentação do custo das mercadorias vendidas (CMV), do custo dos produtos vendidos (CPV) e do custo dos serviços prestados (CSP), conforme a legislação societária, pronunciamentos contábeis vigentes e métodos gerenciais, julgue os itens a seguir.'],
  [94, 99, 'Acerca dos conceitos, dos procedimentos e das normas da contabilidade aplicada ao setor público, bem como das regras previstas no manual de contabilidade aplicada ao setor público (MCASP) e da estrutura do plano de contas aplicado ao setor público (PCASP), julgue os itens a seguir, considerando as disposições legais e normativas vigentes.'],
  [100, 102, 'Com relação ao Sistema Integrado de Administração Financeira do Governo Federal (SIAFI) e à Conta Única do Tesouro Nacional, julgue os itens seguintes.'],
  [103, 107, 'Acerca da contabilidade fiscal e da legislação tributária aplicada às contratações públicas, julgue os itens a seguir.'],
  [108, 110, 'Acerca das noções básicas de declarações tributárias acessórias, julgue os itens seguintes.'],
  [111, 114, 'A respeito das metodologias de ensino e questões relacionadas ao processo de ensino e aprendizagem de contabilidade, julgue os itens a seguir.'],
  [115, 118, 'A Resolução do Conselho Nacional de Educação/Conselho Pleno (CNE/CP) nº 01/2021 define as Diretrizes Curriculares Nacionais Gerais para Educação Profissional e Tecnológica. Acerca dessa Resolução, julgue os itens seguintes.'],
  [119, 120, 'Acerca do currículo em movimento da educação básica – educação profissional e a distância –, julgue os itens a seguir.'],
];

const ELETR_BASES = [
  [71, 93, 'A respeito do funcionamento, das propriedades e do comportamento de circuitos e dispositivos elétricos e eletrônicos, julgue os itens a seguir.'],
  [94, 95, 'Acerca do funcionamento, das propriedades e do comportamento dos filtros analógicos e digitais e dos amplificadores, julgue os itens seguintes.'],
];

const clean = value => String(value ?? '')
  .replace(/\r/g, '')
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/[ \t]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const writeJson = (relative, value, pretty = true) => fs.writeFileSync(path.join(root, relative), `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function textBaseFor(materialKey, number) {
  const table = materialKey === 'contabilidade' ? CONT_BASES : ELETR_BASES;
  const row = table.find(([start, end]) => number >= start && number <= end);
  if (!row) throw new Error(`Texto-base não mapeado para ${materialKey} ${number}.`);
  return row[2];
}

function difficultyFor(material, number) {
  if (material.difficult.has(number)) return 'Difícil';
  if (material.medium.has(number)) return 'Média';
  return 'Fácil';
}

function normalizeComment(answer, value) {
  const canonical = answer === 'Certo' ? 'O item está correto.' : 'O item está errado.';
  let rest = clean(value);
  for (let pass = 0; pass < 3; pass += 1) {
    rest = rest
      .replace(/^O item está (?:correto|errado)\.\s*/i, '')
      .replace(/^(?:Certo|Errado)\s*[.:;—-]?\s*/i, '');
  }
  if (!rest) throw new Error('Comentário ficou vazio após normalização.');
  return `${canonical} ${rest}`;
}

function cleanObservation(value) {
  let result = clean(value)
    .replace(new RegExp(OLD_OBSERVATION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!result.includes(HOTFIX_MARKER)) result = `${result}\n${HOTFIX_MARKER}`.trim();
  return result;
}

function questionNumber(question) {
  return Number(question.numero_original ?? question.numero);
}

function validateQuestionScope(material, questions) {
  const numbers = questions.map(questionNumber).sort((a, b) => a - b);
  const expected = Array.from({length: material.end - material.start + 1}, (_, index) => material.start + index);
  if (JSON.stringify(numbers) !== JSON.stringify(expected)) {
    throw new Error(`${material.key}: sequência divergente: ${numbers.join(', ')}.`);
  }
  for (const question of questions) {
    const number = questionNumber(question);
    const expectedCode = `${material.prefix}${String(number).padStart(3, '0')}`;
    if (clean(question.codigo) !== expectedCode) throw new Error(`${material.key} ${number}: código divergente ${question.codigo}.`);
    if (!['Certo', 'Errado'].includes(question.gabarito)) throw new Error(`${expectedCode}: gabarito inválido ${question.gabarito}.`);
  }
}

function patchQuestion(material, question) {
  const number = questionNumber(question);
  const original = {
    id: question.id,
    codigo: question.codigo,
    gabarito: question.gabarito,
    numero: question.numero,
    numero_original: question.numero_original,
  };
  question.texto_base = textBaseFor(material.key, number);
  question.comentario = normalizeComment(question.gabarito, question.comentario);
  question.observacoes = cleanObservation(question.observacoes);
  question.dificuldade = difficultyFor(material, number);
  question.auditoria = 'Hotfix editorial auditado — 05/08/2026';
  for (const [key, value] of Object.entries(original)) {
    if (question[key] !== value) throw new Error(`${question.codigo}: campo protegido alterado: ${key}.`);
  }
}

function patchRuntime() {
  const appPath = path.join(root, 'assets/app-v4.js');
  let app = fs.readFileSync(appPath, 'utf8');
  app = app
    .replace(/catalogo\.json\?release=[^"']+/g, `catalogo.json?release=${RELEASE_KEY}`)
    .replace(/release-meta\.json\?release=[^"']+/g, `release-meta.json?release=${RELEASE_KEY}`)
    .replace(/study-index\.json\?release=[^"']+/g, `study-index.json?release=${RELEASE_KEY}`);
  fs.writeFileSync(appPath, app);

  const indexPath = path.join(root, 'index.html');
  let index = fs.readFileSync(indexPath, 'utf8');
  index = index.replace(/app-v4\.js\?v=\d+/g, `app-v4.js?v=${APP_ASSET_VERSION}`);
  fs.writeFileSync(indexPath, index);

  const workerPath = path.join(root, 'service-worker.js');
  let worker = fs.readFileSync(workerPath, 'utf8');
  worker = worker
    .replace(/const CACHE_VERSION = "[^"]+";/, `const CACHE_VERSION = "${CACHE_VERSION}";`)
    .replace(/app-v4\.js\?v=\d+/g, `app-v4.js?v=${APP_ASSET_VERSION}`)
    .replace(/catalogo\.json\?release=[^"']+/g, `catalogo.json?release=${RELEASE_KEY}`)
    .replace(/study-index\.json\?release=[^"']+/g, `study-index.json?release=${RELEASE_KEY}`)
    .replace(/build-info\.json\?release=[^"']+/g, `build-info.json?release=${RELEASE_KEY}`)
    .replace(/release-meta\.json\?release=[^"']+/g, `release-meta.json?release=${RELEASE_KEY}`);
  fs.writeFileSync(workerPath, worker);
}

function patchSnapshot(recordMap) {
  const relative = 'data/notion/published.json';
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return;
  const snapshot = readJson(relative);
  let patched = 0;
  for (const record of snapshot.records || []) {
    const publicQuestion = recordMap.get(clean(record.code));
    if (!publicQuestion) continue;
    record.text_base = publicQuestion.texto_base;
    record.comment = publicQuestion.comentario;
    record.observations = publicQuestion.observacoes;
    record.difficulty = publicQuestion.dificuldade;
    record.github_id = clean(record.github_id);
    patched += 1;
  }
  if (patched !== 75) throw new Error(`Snapshot: ${patched}/75 registros corrigidos.`);
  snapshot.editorial_hotfix = {
    applied_at: new Date().toISOString(),
    release_version: RELEASE_VERSION,
    restored_text_bases: 75,
    normalized_comments: 75,
    reconciled_observations: 75,
    reviewed_difficulties: 75,
  };
  writeJson(relative, snapshot);
}

function rebuildManifest(catalog) {
  const manifestPath = path.join(root, 'data/release/manifest.json');
  const manifest = readJson('data/release/manifest.json');
  manifest.release_version = RELEASE_VERSION;
  manifest.generated_at = new Date().toISOString();
  manifest.summary = catalog.summary;
  const catalogText = `${JSON.stringify(catalog, null, 2)}\n`;
  manifest.catalog_sha256 = sha256(catalogText);
  manifest.materials = (catalog.materials || []).map(metadata => {
    const relative = clean(metadata.file).replace(/^\.\//, '');
    const bytes = fs.readFileSync(path.join(root, relative));
    return {
      id: metadata.id,
      file: metadata.file,
      questions: metadata.quantidade_questoes,
      bytes: bytes.length,
      sha256: sha256(bytes),
    };
  });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function applyPublic() {
  const protectedState = new Map();
  const recordMap = new Map();
  let total = 0;
  for (const material of MATERIALS) {
    const data = readJson(material.file);
    validateQuestionScope(material, data.questoes || []);
    for (const question of data.questoes) {
      protectedState.set(question.codigo, {
        id: question.id,
        gabarito: question.gabarito,
        numero: question.numero,
        numero_original: question.numero_original,
      });
      patchQuestion(material, question);
      recordMap.set(question.codigo, question);
      total += 1;
    }
    writeJson(material.file, data, false);
  }
  if (total !== 75) throw new Error(`Total corrigido divergente: ${total}.`);

  const catalog = readJson('data/release/catalogo.json');
  if (Object.keys(catalog.question_index || {}).length !== 3046 || (catalog.materials || []).length !== 71) {
    throw new Error('Contrato público anterior divergente antes do hotfix.');
  }
  catalog.release_version = RELEASE_VERSION;
  catalog.exported_at = new Date().toISOString();
  catalog.source = {
    ...(catalog.source || {}),
    criteria: '3.046 questões públicas preservadas; hotfix editorial restaurou textos-base e normalizou metadados das 75 questões de Contabilidade e Eletrônica.',
  };
  writeJson('data/release/catalogo.json', catalog);
  rebuildManifest(catalog);
  patchSnapshot(recordMap);
  patchRuntime();

  const baseline = Object.fromEntries([...protectedState.entries()].sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync('/tmp/remaining-75-protected-state.json', JSON.stringify(baseline));
  console.log('✓ Hotfix editorial aplicado localmente a 75 questões; campos protegidos preservados.');
}

function pageIdFromUrl(url) {
  const match = clean(url).match(/([0-9a-f]{32})(?:\?.*)?$/i);
  if (!match) throw new Error(`ID do Notion não extraído de ${url}.`);
  return match[1];
}

function richText(content) {
  return {rich_text: [{type: 'text', text: {content: clean(content).slice(0, 1950)}}]};
}

async function notionRequest(endpoint, options = {}, attempt = 1) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN ausente.');
  const response = await fetch(`${NOTION_API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (response.ok) return response.status === 204 ? {} : response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 8) {
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 500 * 2 ** (attempt - 1)));
    return notionRequest(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 700)}`);
}

const sourceFiles = {
  index_html: 'index.html',
  app_js: 'assets/app-v4.js',
  service_worker_js: 'service-worker.js',
  pwa_js: 'assets/pwa-v2-9.js',
  material_downloads_js: 'assets/material-downloads-v1.js',
  material_downloads_css: 'assets/material-downloads-v1.css',
  platform_shared_js: 'assets/shared-v2-13.js',
  platform_release_js: 'assets/release-v2-13.js',
  platform_vault_js: 'assets/vault-v2-13.js',
  platform_report_js: 'assets/report-v2-13.js',
  platform_official_exam_js: 'assets/official-exam-v2-13.js',
  platform_adaptive_review_js: 'assets/adaptive-review-v2-13.js',
  platform_css: 'assets/platform-v2-13.css',
};

function sourceHashes() {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relative]) => [key, sha256(fs.readFileSync(path.join(root, relative)))]));
}

async function finalize(canonicalSha) {
  if (!/^[0-9a-f]{40}$/i.test(canonicalSha)) throw new Error(`SHA canônico inválido: ${canonicalSha}.`);
  const receipt = `release-2.13.0:${canonicalSha}`;
  const hashes = sourceHashes();
  const catalog = readJson('data/release/catalogo.json');
  const releaseMeta = readJson('data/release/release-meta.json');
  const buildInfo = readJson('data/release/build-info.json');
  for (const metadata of [releaseMeta, buildInfo]) {
    metadata.data_release_version = RELEASE_VERSION;
    metadata.source_sha = canonicalSha;
    metadata.cache_version = CACHE_VERSION;
    metadata.source_files_sha256 = hashes;
    metadata.questions = 3046;
    metadata.materials = 71;
  }
  releaseMeta.exported_at = catalog.exported_at;
  releaseMeta.banco_mestre = 3048;
  releaseMeta.awaiting_audit = 0;
  releaseMeta.discursive_display_items = 2;
  buildInfo.material_files = 71;
  writeJson('data/release/release-meta.json', releaseMeta);
  writeJson('data/release/build-info.json', buildInfo);

  const records = [];
  for (const material of MATERIALS) {
    const data = readJson(material.file);
    for (const question of data.questoes || []) records.push(question);
  }
  if (records.length !== 75) throw new Error(`Notion: escopo final divergente ${records.length}.`);
  let updated = 0;
  for (const question of records.sort((a, b) => a.codigo.localeCompare(b.codigo))) {
    const pageId = pageIdFromUrl(question.notion_url);
    const properties = {
      'Texto-base': richText(question.texto_base),
      'Comentário geral': richText(question.comentario),
      'Observações': richText(question.observacoes),
      'Dificuldade': {select: {name: question.dificuldade}},
      'Auditoria de conteúdo': {select: {name: 'Ajustada'}},
      'Data da revisão': {date: {start: REVIEW_DATE}},
      'Código GitHub': richText(receipt),
      'Data da publicação': {date: {start: REVIEW_DATE}},
      'Status editorial — registro manual anterior': {select: {name: 'Publicada'}},
    };
    await notionRequest(`/pages/${pageId}`, {method: 'PATCH', body: JSON.stringify({properties})});
    updated += 1;
    if (updated % 15 === 0) console.log(`${updated}/75 registros reconciliados no Notion.`);
  }
  console.log(`✓ Metadados e Notion reconciliados com SHA canônico ${canonicalSha}.`);
}

function validate() {
  const baselinePath = '/tmp/remaining-75-protected-state.json';
  if (!fs.existsSync(baselinePath)) throw new Error('Baseline protegido ausente.');
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const catalog = readJson('data/release/catalogo.json');
  const manifest = readJson('data/release/manifest.json');
  const meta = readJson('data/release/release-meta.json');
  const build = readJson('data/release/build-info.json');
  if (catalog.release_version !== RELEASE_VERSION || manifest.release_version !== RELEASE_VERSION) throw new Error('Versão 2.9.1 não aplicada.');
  if (Object.keys(catalog.question_index || {}).length !== 3046 || (catalog.materials || []).length !== 71) throw new Error('Totais públicos alterados.');
  if (catalog.summary?.aguardando_auditoria !== 0 || catalog.summary?.discursivas_consulta !== 2) throw new Error('Resumo público divergente.');
  let total = 0;
  const levels = new Set();
  for (const material of MATERIALS) {
    const data = readJson(material.file);
    validateQuestionScope(material, data.questoes || []);
    for (const question of data.questoes || []) {
      const before = baseline[question.codigo];
      if (!before) throw new Error(`${question.codigo}: ausente do baseline.`);
      for (const key of ['id', 'gabarito', 'numero', 'numero_original']) if (question[key] !== before[key]) throw new Error(`${question.codigo}: ${key} alterado.`);
      if (!clean(question.texto_base)) throw new Error(`${question.codigo}: texto-base vazio.`);
      if (/^O item está (?:correto|errado)\.\s*(?:Certo|Errado)\b/i.test(question.comentario)) throw new Error(`${question.codigo}: veredito duplicado.`);
      if (question.observacoes.includes(OLD_OBSERVATION) || !question.observacoes.includes(HOTFIX_MARKER)) throw new Error(`${question.codigo}: observações não reconciliadas.`);
      if (!['Fácil', 'Média', 'Difícil'].includes(question.dificuldade)) throw new Error(`${question.codigo}: dificuldade inválida.`);
      levels.add(question.dificuldade);
      total += 1;
    }
  }
  if (total !== 75 || levels.size !== 3) throw new Error(`Validação editorial incompleta: ${total} itens, níveis ${[...levels].join(', ')}.`);
  const catalogText = fs.readFileSync(path.join(root, 'data/release/catalogo.json'));
  if (manifest.catalog_sha256 !== sha256(catalogText)) throw new Error('Hash do catálogo divergente.');
  for (const entry of manifest.materials || []) {
    const bytes = fs.readFileSync(path.join(root, clean(entry.file).replace(/^\.\//, '')));
    if (entry.sha256 !== sha256(bytes) || entry.bytes !== bytes.length) throw new Error(`Manifesto divergente: ${entry.id}.`);
  }
  if (meta.data_release_version !== RELEASE_VERSION || build.data_release_version !== RELEASE_VERSION) throw new Error('Metadados de versão divergentes.');
  if (meta.source_sha !== build.source_sha || meta.cache_version !== CACHE_VERSION || build.cache_version !== CACHE_VERSION) throw new Error('Rastreabilidade ou cache divergente.');
  console.log('✓ Validação completa: 75 correções editoriais, totais e campos protegidos preservados.');
}

const [mode, argument] = process.argv.slice(2);
if (mode === 'apply') applyPublic();
else if (mode === 'finalize') await finalize(argument || process.env.CANONICAL_SHA || '');
else if (mode === 'validate') validate();
else throw new Error(`Modo inválido: ${mode || '(ausente)'}. Use apply, finalize ou validate.`);
