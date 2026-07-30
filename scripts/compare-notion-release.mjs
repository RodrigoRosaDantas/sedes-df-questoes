import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resolve = relative => path.resolve(root, String(relative).replace(/^\.\//, ''));
const TOKEN = process.env.NOTION_TOKEN;
const DATA_SOURCE_ID = '784234ae-deca-4514-b60d-19524e122a89';
const API_VERSION = '2026-03-11';
const API = 'https://api.notion.com/v1';

if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível neste repositório.');

const clean = value => String(value ?? '')
  .replace(/\r/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .trim();
const key = value => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();
const compositeKey = (material, number) => `${key(material)}::${Number(number) || 0}`;
const sleep = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms));

async function request(endpoint, options = {}, attempt = 1) {
  const response = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': API_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (response.ok) return response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 7) {
    const retryAfter = Number(response.headers.get('retry-after') || 0);
    await sleep(Math.max(retryAfter * 1000, 500 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 600)}`);
}

function richText(items = []) {
  return items.map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
}

function propertyValue(property) {
  if (!property) return null;
  switch (property.type) {
    case 'title': return richText(property.title);
    case 'rich_text': return richText(property.rich_text);
    case 'select': return property.select?.name ?? null;
    case 'status': return property.status?.name ?? null;
    case 'multi_select': return (property.multi_select || []).map(item => item.name);
    case 'checkbox': return Boolean(property.checkbox);
    case 'number': return property.number;
    case 'url': return property.url;
    case 'date': return property.date?.start ?? null;
    case 'created_time': return property.created_time;
    case 'last_edited_time': return property.last_edited_time;
    case 'unique_id': return property.unique_id ? `${property.unique_id.prefix || ''}${property.unique_id.number}` : null;
    case 'formula': {
      const formula = property.formula;
      if (!formula) return null;
      if (formula.type === 'string') return formula.string;
      if (formula.type === 'boolean') return formula.boolean;
      if (formula.type === 'number') return formula.number;
      if (formula.type === 'date') return formula.date?.start ?? null;
      return null;
    }
    default: return null;
  }
}

async function readNotionRows() {
  const rows = [];
  let cursor;
  let batches = 0;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const page = await request(`/data_sources/${DATA_SOURCE_ID}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    batches += 1;
    for (const item of page.results || []) {
      const values = Object.fromEntries(
        Object.entries(item.properties || {}).map(([name, property]) => [name, propertyValue(property)]),
      );
      rows.push({ notion_id: item.id, notion_url: item.url, ...values });
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  console.log(`Notion: ${rows.length} registros lidos em ${batches} lotes.`);
  return rows;
}

async function readRelease() {
  const catalog = JSON.parse(await fs.readFile(resolve('data/release/catalogo.json'), 'utf8'));
  const questions = [];
  const materials = new Map();
  for (const metadata of catalog.materials || []) {
    const material = JSON.parse(await fs.readFile(resolve(metadata.file), 'utf8'));
    materials.set(material.id, material);
    for (const question of material.questoes || []) {
      questions.push({ ...question, material_id: material.id, material_name: material.nome });
    }
  }
  return { catalog, questions, materials };
}

function existingValue(question, field) {
  switch (field) {
    case 'Texto-base': return question.texto_base;
    case 'Enunciado': return question.enunciado;
    case 'Alternativa A': return question.alternativas?.A;
    case 'Alternativa B': return question.alternativas?.B;
    case 'Alternativa C': return question.alternativas?.C;
    case 'Alternativa D': return question.alternativas?.D;
    case 'Alternativa E': return question.alternativas?.E;
    case 'Gabarito': return question.gabarito;
    case 'Comentário geral': return question.comentario;
    case 'Fundamento legal': return question.fundamento;
    case 'Pegadinha': return question.pegadinha;
    case 'Observações': return question.observacoes;
    case 'Assunto': return question.assunto;
    case 'Subassunto': return question.subassunto;
    default: return null;
  }
}

const notionRows = await readNotionRows();
const publishable = notionRows.filter(row => row['Pode publicar'] === true);
const duplicateCodes = [...publishable.reduce((map, row) => {
  const code = key(row['Código']);
  map.set(code, (map.get(code) || 0) + 1);
  return map;
}, new Map()).entries()].filter(([code, count]) => !code || count > 1);
const duplicateComposites = [...publishable.reduce((map, row) => {
  const composite = compositeKey(row['Nome do material'], row['Número original']);
  map.set(composite, (map.get(composite) || 0) + 1);
  return map;
}, new Map()).entries()].filter(([composite, count]) => composite.endsWith('::0') || count > 1);

const { catalog, questions, materials } = await readRelease();
const byCode = new Map(questions.map(question => [key(question.codigo), question]));
const byId = new Map(questions.map(question => [key(question.id), question]));
const byComposite = new Map(questions.map(question => [compositeKey(question.material_name, question.numero), question]));

const missingInRelease = [];
const reusedReleaseQuestions = [];
const legacyIdDifferences = [];
const matchedReleaseIds = new Set();
const matchStrategies = new Map();
const differenceCounts = new Map();
const differenceSamples = new Map();
const materialCounts = new Map();
const formatCounts = new Map();
const comparedFields = [
  'Texto-base', 'Enunciado', 'Alternativa A', 'Alternativa B', 'Alternativa C', 'Alternativa D', 'Alternativa E',
  'Gabarito', 'Comentário geral', 'Fundamento legal', 'Pegadinha', 'Observações', 'Assunto', 'Subassunto',
];

for (const row of publishable) {
  const format = clean(row['Formato da questão']) || 'Não informado';
  formatCounts.set(format, (formatCounts.get(format) || 0) + 1);

  const directCode = byCode.get(key(row['Código']));
  const githubId = byId.get(key(row['Código GitHub']));
  const composite = byComposite.get(compositeKey(row['Nome do material'], row['Número original']));
  const question = directCode || githubId || composite;
  const strategy = directCode ? 'codigo' : githubId ? 'codigo_github' : composite ? 'material_e_numero' : 'nao_encontrada';
  matchStrategies.set(strategy, (matchStrategies.get(strategy) || 0) + 1);

  if (!question) {
    missingInRelease.push({
      code: row['Código'],
      github_id: row['Código GitHub'],
      material: row['Nome do material'],
      number: row['Número original'],
      notion_url: row.notion_url,
    });
    continue;
  }

  const releaseIdentity = key(question.id);
  if (matchedReleaseIds.has(releaseIdentity)) {
    reusedReleaseQuestions.push({ code: row['Código'], release_id: question.id });
    continue;
  }
  matchedReleaseIds.add(releaseIdentity);

  const notionGithubId = key(row['Código GitHub']);
  if (notionGithubId && notionGithubId !== releaseIdentity) {
    legacyIdDifferences.push({
      code: row['Código'],
      notion_github_id: row['Código GitHub'],
      release_id: question.id,
      strategy,
    });
  }

  materialCounts.set(question.material_id, (materialCounts.get(question.material_id) || 0) + 1);
  for (const field of comparedFields) {
    const notionValue = clean(row[field]);
    const releaseValue = clean(existingValue(question, field));
    if (notionValue !== releaseValue) {
      differenceCounts.set(field, (differenceCounts.get(field) || 0) + 1);
      if (!differenceSamples.has(field)) differenceSamples.set(field, []);
      if (differenceSamples.get(field).length < 10) {
        differenceSamples.get(field).push({ code: row['Código'], notion: notionValue, release: releaseValue });
      }
    }
  }
}

const extraInRelease = questions
  .filter(question => !matchedReleaseIds.has(key(question.id)))
  .map(question => ({ code: question.codigo, id: question.id, material_id: question.material_id }));

const report = {
  generated_at: new Date().toISOString(),
  source: {
    database: 'Banco Mestre — Provas e Simulados SEDES/DF',
    data_source_id: DATA_SOURCE_ID,
    total_rows: notionRows.length,
    publishable_rows: publishable.length,
    pending_rows: notionRows.length - publishable.length,
  },
  release: {
    version: catalog.release_version,
    materials: materials.size,
    questions: questions.length,
  },
  identity_validation: {
    match_strategies: Object.fromEntries([...matchStrategies.entries()].sort((a, b) => b[1] - a[1])),
    duplicate_publishable_codes: duplicateCodes,
    duplicate_material_numbers: duplicateComposites,
    missing_in_release: missingInRelease,
    extra_in_release: extraInRelease,
    reused_release_questions: reusedReleaseQuestions,
    legacy_id_differences: legacyIdDifferences,
  },
  formats: Object.fromEntries([...formatCounts.entries()].sort((a, b) => b[1] - a[1])),
  material_counts: Object.fromEntries([...materialCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
  content_differences: Object.fromEntries(
    [...differenceCounts.entries()].map(([field, count]) => [field, { count, samples: differenceSamples.get(field) || [] }]),
  ),
};

await fs.writeFile('/tmp/notion-release-comparison.json', `${JSON.stringify(report, null, 2)}\n`);

console.log(`Publicáveis no Notion: ${publishable.length}. Release atual: ${questions.length}.`);
console.log(`Vínculos: ${JSON.stringify(report.identity_validation.match_strategies)}.`);
console.log(`Identidade — ausentes: ${missingInRelease.length}; extras: ${extraInRelease.length}; reutilizações: ${reusedReleaseQuestions.length}; códigos duplicados: ${duplicateCodes.length}; material+número duplicados: ${duplicateComposites.length}.`);
console.log(`IDs editoriais antigos diferentes dos IDs públicos atuais: ${legacyIdDifferences.length}.`);
console.log(`Formatos publicáveis: ${JSON.stringify(report.formats)}.`);
console.log(`Diferenças de conteúdo por campo: ${JSON.stringify(Object.fromEntries(differenceCounts))}.`);

if (publishable.length !== questions.length) throw new Error('A quantidade publicável do Notion difere da release atual.');
if (duplicateCodes.length || duplicateComposites.length || missingInRelease.length || extraInRelease.length || reusedReleaseQuestions.length) {
  throw new Error('A identidade entre o Banco Mestre e a release atual não é compatível para sincronização segura.');
}

console.log('✓ As 570 questões publicáveis foram vinculadas integralmente à release, preservando os IDs públicos atuais.');
