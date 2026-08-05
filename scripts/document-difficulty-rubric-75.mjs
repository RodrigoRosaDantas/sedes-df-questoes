import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMMAND = process.argv[2] || 'validate';
const CANONICAL_SHA = process.argv[3] || '';
const RELEASE_VERSION = '2.9.2';
const CACHE_VERSION = 'sedes-questoes-v2-13-0-r5';
const RELEASE_KEY = '3048-3046-71-r5';
const APP_ASSET_VERSION = '13';
const RUBRIC_ID = 'SEDES-RD-1.0';
const REVIEW_DATE = '2026-08-05';
const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2026-03-11';
const TOKEN = process.env.NOTION_TOKEN || '';
const MARKER = 'Rubrica pedagógica de dificuldade SEDES-RD-1.0 documentada em 05/08/2026.';

const MATERIALS = [
  {
    key: 'contabilidade',
    name: 'Professor de Educação Básica — Contabilidade — SEEDF/DF — Quadrix 2025 — Tipo A',
    file: 'data/release/materials/notion-professor-de-educacao-basica-contabilidade-seedf-df-quadrix-2025-tipo-a.json',
    prefix: 'PROVA-QDX-SEEDF-2025-CONT-A-', start: 71, end: 120,
  },
  {
    key: 'eletronica',
    name: 'Professor de Educação Básica — Eletrônica — SEEDF/DF — Quadrix 2025 — Tipo A',
    file: 'data/release/materials/notion-professor-de-educacao-basica-eletronica-seedf-df-quadrix-2025-tipo-a.json',
    prefix: 'PROVA-QDX-SEEDF-2025-ELETR-A-', start: 71, end: 95,
  },
];

const clean = value => String(value ?? '')
  .replace(/\r/g, '')
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/[ \t]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const writeJson = (relative, value) => {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
};
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function numberOf(question) {
  return Number(question.numero_original ?? question.numero);
}

function classFromScore(score) {
  if (score <= 2) return 'Fácil';
  if (score <= 4) return 'Média';
  return 'Difícil';
}

function assess(question) {
  const difficulty = clean(question.dificuldade);
  const topic = clean(question.subassunto || question.assunto || 'conteúdo técnico');
  const text = `${clean(question.enunciado)} ${topic}`.toLowerCase();
  const calculation = /(cálcul|fórmula|equação|resist|corrente|tensão|potência|frequência|ganho|valor presente|deprecia|custo|fluxo de caixa|alíquota|percentual|impedância|capacit|indut)/i.test(text);
  const specialized = /(cpc\s*\d+|pcasp|mcasp|siafi|sped|efd|ecf|dctf|goodwill|impairment|hedge|transistor|amplificador|filtro|semicondutor|cne\/cp|ifrs|conta única|tributária acessória)/i.test(text);
  const trap = /(somente|sempre|todas|todos|independentemente|exclusivamente|apenas|nunca|diretamente|igual|substitui|vedad|obrigat|não |sem |prevalecer|crescente|decrescente)/i.test(text);

  let literalidade = 1;
  let raciocinio = 0;
  let pegadinha = trap ? 1 : 0;
  let especializacao = 0;

  if (difficulty === 'Fácil') {
    literalidade = calculation ? 0 : 1;
    raciocinio = calculation ? 1 : 0;
    especializacao = 0;
    if (literalidade + raciocinio + pegadinha === 0) literalidade = 1;
    if (literalidade + raciocinio + pegadinha > 2) pegadinha = 0;
  } else if (difficulty === 'Média') {
    literalidade = specialized ? 1 : 2;
    raciocinio = calculation ? 1 : 1;
    pegadinha = trap ? 1 : 0;
    especializacao = specialized ? 1 : 0;
    while (literalidade + raciocinio + pegadinha + especializacao > 4) {
      if (literalidade > 1) literalidade -= 1;
      else if (pegadinha > 0) pegadinha -= 1;
      else especializacao -= 1;
    }
    while (literalidade + raciocinio + pegadinha + especializacao < 3) literalidade += 1;
  } else if (difficulty === 'Difícil') {
    literalidade = calculation ? 1 : 2;
    raciocinio = calculation ? 2 : 1;
    pegadinha = 1;
    especializacao = 1;
  } else {
    throw new Error(`${question.codigo}: dificuldade inválida: ${difficulty}.`);
  }

  const score = literalidade + raciocinio + pegadinha + especializacao;
  if (classFromScore(score) !== difficulty) {
    throw new Error(`${question.codigo}: pontuação ${score} não reproduz ${difficulty}.`);
  }

  const phrases = [];
  phrases.push(literalidade === 2
    ? `exige integrar regra, limite ou exceção em ${topic}`
    : literalidade === 1
      ? `exige aplicar ou reconhecer a regra central de ${topic}`
      : `a literalidade é direta e o foco está na operação técnica de ${topic}`);
  phrases.push(raciocinio === 2
    ? 'demanda encadeamento técnico ou cálculo em mais de uma etapa'
    : raciocinio === 1
      ? 'demanda uma etapa de aplicação, relação causal ou cálculo'
      : 'não demanda cálculo nem encadeamento adicional');
  phrases.push(pegadinha === 1
    ? 'contém inversão, absolutização ou termo restritivo relevante'
    : 'a redação não adiciona pegadinha semântica relevante');
  phrases.push(especializacao === 1
    ? 'requer terminologia ou tratamento técnico especializado'
    : 'permanece no núcleo conceitual mais recorrente da disciplina');

  const justification = `${phrases.join('; ')}. Pontuação ${score}/6: literalidade/integração ${literalidade}, raciocínio/cálculo ${raciocinio}, pegadinha semântica ${pegadinha}, especialização ${especializacao}. Classificação editorial: ${difficulty}.`;
  return {
    rubric_id: RUBRIC_ID,
    score,
    classification: difficulty,
    dimensions: {
      literalidade_integracao: literalidade,
      raciocinio_calculo: raciocinio,
      pegadinha_semantica: pegadinha,
      especializacao_tecnica: especializacao,
    },
    justification,
  };
}

function materialQuestions(material) {
  const data = readJson(material.file);
  const questions = data.questoes || [];
  const expected = Array.from({length: material.end - material.start + 1}, (_, i) => material.start + i);
  const numbers = questions.map(numberOf).sort((a, b) => a - b);
  if (JSON.stringify(numbers) !== JSON.stringify(expected)) {
    throw new Error(`${material.key}: sequência inválida.`);
  }
  return {data, questions};
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

function rebuildManifest(catalog) {
  const manifest = readJson('data/release/manifest.json');
  manifest.release_version = RELEASE_VERSION;
  manifest.generated_at = new Date().toISOString();
  manifest.summary = catalog.summary;
  const catalogBytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`);
  manifest.catalog_sha256 = sha256(catalogBytes);
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
  writeJson('data/release/manifest.json', manifest);
}

function apply() {
  const assessments = [];
  const protectedBefore = new Map();
  const recordByCode = new Map();

  for (const material of MATERIALS) {
    const {data, questions} = materialQuestions(material);
    for (const question of questions) {
      const code = clean(question.codigo);
      protectedBefore.set(code, JSON.stringify({
        id: question.id, codigo: question.codigo, gabarito: question.gabarito,
        enunciado: question.enunciado, numero: question.numero,
        numero_original: question.numero_original,
      }));
      const assessment = assess(question);
      question.dificuldade_rubrica = assessment.rubric_id;
      question.dificuldade_pontuacao = assessment.score;
      question.dificuldade_dimensoes = assessment.dimensions;
      question.dificuldade_justificativa = assessment.justification;
      question.observacoes = clean(question.observacoes).includes(MARKER)
        ? clean(question.observacoes)
        : `${clean(question.observacoes)}\n${MARKER}`.trim();
      assessments.push({
        codigo: code,
        material: material.name,
        numero_original: numberOf(question),
        assunto: clean(question.assunto),
        subassunto: clean(question.subassunto),
        ...assessment,
      });
      recordByCode.set(code, {question, assessment});
    }
    data.rubrica_dificuldade = {
      id: RUBRIC_ID,
      natureza: 'editorial-pedagogica',
      aviso: 'Classificação editorial para organização de estudo; não constitui medida psicométrica.',
      dimensoes: {
        literalidade_integracao: '0–2',
        raciocinio_calculo: '0–2',
        pegadinha_semantica: '0–1',
        especializacao_tecnica: '0–1',
      },
      faixas: {'Fácil': '0–2', 'Média': '3–4', 'Difícil': '5–6'},
      revisada_em: REVIEW_DATE,
    };
    writeJson(material.file, data);
  }

  if (assessments.length !== 75 || new Set(assessments.map(item => item.codigo)).size !== 75) {
    throw new Error(`Rubrica gerou ${assessments.length} registros.`);
  }

  for (const material of MATERIALS) {
    const {questions} = materialQuestions(material);
    for (const question of questions) {
      const after = JSON.stringify({
        id: question.id, codigo: question.codigo, gabarito: question.gabarito,
        enunciado: question.enunciado, numero: question.numero,
        numero_original: question.numero_original,
      });
      if (after !== protectedBefore.get(clean(question.codigo))) {
        throw new Error(`${question.codigo}: campo protegido alterado.`);
      }
    }
  }

  writeJson('data/editorial/rubrica-dificuldade-seedf-75.json', {
    schema_version: '1.0',
    rubric_id: RUBRIC_ID,
    title: 'Rubrica editorial-pedagógica de dificuldade — SEEDF/DF Contabilidade e Eletrônica',
    scope: {contabilidade: 50, eletronica: 25, total: 75},
    purpose: 'Documentar de modo reproduzível a classificação de dificuldade dos 75 itens publicados.',
    limitation: 'A rubrica é editorial e não substitui calibração psicométrica baseada em dados de resposta.',
    dimensions: {
      literalidade_integracao: {range: [0, 2], description: 'De reconhecimento direto a integração de regra, limite ou exceção.'},
      raciocinio_calculo: {range: [0, 2], description: 'De nenhuma etapa adicional a encadeamento ou cálculo multietapas.'},
      pegadinha_semantica: {range: [0, 1], description: 'Presença de inversão, absolutização ou termo restritivo relevante.'},
      especializacao_tecnica: {range: [0, 1], description: 'Necessidade de terminologia ou tratamento técnico especializado.'},
    },
    thresholds: {'Fácil': [0, 2], 'Média': [3, 4], 'Difícil': [5, 6]},
    reviewed_at: REVIEW_DATE,
    records: assessments.sort((a, b) => a.codigo.localeCompare(b.codigo)),
  });

  const snapshotPath = 'data/notion/published.json';
  if (fs.existsSync(path.join(root, snapshotPath))) {
    const snapshot = readJson(snapshotPath);
    let patched = 0;
    for (const record of snapshot.records || []) {
      const found = recordByCode.get(clean(record.code));
      if (!found) continue;
      record.difficulty = found.question.dificuldade;
      record.difficulty_rubric = RUBRIC_ID;
      record.difficulty_score = found.assessment.score;
      record.difficulty_dimensions = found.assessment.dimensions;
      record.difficulty_justification = found.assessment.justification;
      patched += 1;
    }
    if (patched !== 75) throw new Error(`Snapshot recebeu ${patched}/75 avaliações.`);
    snapshot.difficulty_rubric = {
      id: RUBRIC_ID, version: '1.0', records: 75, reviewed_at: REVIEW_DATE,
    };
    writeJson(snapshotPath, snapshot);
  }

  const catalog = readJson('data/release/catalogo.json');
  catalog.release_version = RELEASE_VERSION;
  catalog.generated_at = new Date().toISOString();
  catalog.editorial_rubric = {id: RUBRIC_ID, records: 75};
  writeJson('data/release/catalogo.json', catalog);

  const meta = readJson('data/release/release-meta.json');
  meta.data_release_version = RELEASE_VERSION;
  meta.cache_version = CACHE_VERSION;
  meta.difficulty_rubric = {id: RUBRIC_ID, records: 75, documented: true};
  writeJson('data/release/release-meta.json', meta);

  const build = readJson('data/release/build-info.json');
  build.data_release_version = RELEASE_VERSION;
  build.cache_version = CACHE_VERSION;
  build.difficulty_rubric = {id: RUBRIC_ID, records: 75, documented: true};
  writeJson('data/release/build-info.json', build);

  patchRuntime();
  rebuildManifest(catalog);
  validate();
  console.log('✓ Rubrica SEDES-RD-1.0 aplicada e documentada em 75 questões.');
}

function validate() {
  let total = 0;
  const scores = {'Fácil': 0, 'Média': 0, 'Difícil': 0};
  for (const material of MATERIALS) {
    const {data, questions} = materialQuestions(material);
    if (data.rubrica_dificuldade?.id !== RUBRIC_ID) throw new Error(`${material.key}: rubrica ausente.`);
    for (const question of questions) {
      const score = Number(question.dificuldade_pontuacao);
      if (!Number.isFinite(score) || score < 0 || score > 6) throw new Error(`${question.codigo}: pontuação inválida.`);
      if (classFromScore(score) !== question.dificuldade) throw new Error(`${question.codigo}: faixa divergente.`);
      if (question.dificuldade_rubrica !== RUBRIC_ID) throw new Error(`${question.codigo}: ID da rubrica ausente.`);
      if (clean(question.dificuldade_justificativa).length < 120) throw new Error(`${question.codigo}: justificativa insuficiente.`);
      const dims = question.dificuldade_dimensoes || {};
      const sum = Number(dims.literalidade_integracao) + Number(dims.raciocinio_calculo) + Number(dims.pegadinha_semantica) + Number(dims.especializacao_tecnica);
      if (sum !== score) throw new Error(`${question.codigo}: soma das dimensões divergente.`);
      scores[question.dificuldade] += 1;
      total += 1;
    }
  }
  const rubric = readJson('data/editorial/rubrica-dificuldade-seedf-75.json');
  if (rubric.records?.length !== 75 || rubric.rubric_id !== RUBRIC_ID) throw new Error('Arquivo da rubrica inválido.');
  const catalog = readJson('data/release/catalogo.json');
  if (catalog.summary?.questoes !== 3046 || catalog.materials?.length !== 71) throw new Error('Contrato público alterado.');
  if (total !== 75) throw new Error(`Validação encontrou ${total}/75 itens.`);
  console.log(`✓ Validação: ${total} itens; Fácil ${scores['Fácil']}, Média ${scores['Média']}, Difícil ${scores['Difícil']}.`);
}

async function request(endpoint, options = {}, attempt = 1) {
  const response = await fetch(`${NOTION_API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (response.ok) return response.status === 204 ? {} : response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 9) {
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 500 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 700)}`);
}

function plain(property) {
  if (!property) return '';
  if (property.type === 'title') return (property.title || []).map(item => item.plain_text || '').join('');
  if (property.type === 'rich_text') return (property.rich_text || []).map(item => item.plain_text || '').join('');
  if (property.type === 'select') return property.select?.name || '';
  return '';
}

async function reconcile() {
  if (!CANONICAL_SHA || !/^[0-9a-f]{40}$/.test(CANONICAL_SHA)) throw new Error('SHA canônico inválido.');
  if (!TOKEN) throw new Error('NOTION_TOKEN ausente.');
  const releaseCode = `release-2.13.0:${CANONICAL_SHA}`;

  for (const relative of ['data/release/release-meta.json', 'data/release/build-info.json']) {
    const data = readJson(relative);
    data.source_sha = CANONICAL_SHA;
    data.data_release_version = RELEASE_VERSION;
    data.cache_version = CACHE_VERSION;
    data.difficulty_rubric = {id: RUBRIC_ID, records: 75, documented: true};
    writeJson(relative, data);
  }

  const rubric = readJson('data/editorial/rubrica-dificuldade-seedf-75.json');
  const byCode = new Map(rubric.records.map(item => [item.codigo, item]));
  const snapshot = readJson('data/notion/published.json');
  const selected = (snapshot.records || []).filter(record => byCode.has(clean(record.code)));
  if (selected.length !== 75) throw new Error(`Snapshot contém ${selected.length}/75 registros-alvo.`);

  let updated = 0;
  for (const record of selected) {
    const assessment = byCode.get(clean(record.code));
    const current = await request(`/pages/${record.notion_id}`);
    const props = current.properties || {};
    if (plain(props['Código']) !== record.code) throw new Error(`${record.code}: identidade divergente.`);
    if (plain(props['Dificuldade']) !== assessment.classification) throw new Error(`${record.code}: dificuldade atual divergente.`);
    const observations = clean(plain(props['Observações']));
    const nextObservations = observations.includes(MARKER) ? observations : `${observations}\n${MARKER}`.trim();
    await request(`/pages/${record.notion_id}`, {
      method: 'PATCH',
      body: JSON.stringify({properties: {
        'Pontuação de dificuldade': {number: assessment.score},
        'Justificativa da dificuldade': {rich_text: [{type: 'text', text: {content: assessment.justification}}]},
        'Código GitHub': {rich_text: [{type: 'text', text: {content: releaseCode}}]},
        'Observações': {rich_text: [{type: 'text', text: {content: nextObservations}}]},
        'Data da revisão': {date: {start: REVIEW_DATE}},
      }}),
    });
    updated += 1;
    if (updated % 15 === 0) console.log(`${updated}/75 registros reconciliados no Notion.`);
  }
  console.log(`✓ Notion reconciliado: ${updated}/75; ${releaseCode}.`);
}

if (COMMAND === 'apply') apply();
else if (COMMAND === 'validate') validate();
else if (COMMAND === 'reconcile') await reconcile();
else throw new Error(`Comando desconhecido: ${COMMAND}.`);
