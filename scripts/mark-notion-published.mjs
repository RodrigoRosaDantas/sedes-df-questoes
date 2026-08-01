import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPublicationPlan, validatePublicationPlan} from './publication-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.resolve(root, process.env.NOTION_SNAPSHOT_PATH || 'data/notion/published.json');
const planPath = path.resolve(root, process.env.PUBLICATION_PLAN_PATH || 'data/notion/publication-plan.json');
const catalogPath = path.join(root, 'data', 'release', 'catalogo.json');
const TOKEN = process.env.NOTION_TOKEN;
const RELEASE_SHA = process.env.RELEASE_COMMIT || process.env.GITHUB_SHA || '';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';

if (!fs.existsSync(snapshotPath) || !fs.readFileSync(snapshotPath, 'utf8').trim()) {
  console.log('✓ Nenhum snapshot do Notion disponível para fechamento.');
  process.exit(0);
}
if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível para fechar a rastreabilidade.');
if (!RELEASE_SHA) throw new Error('Commit da release não informado.');

const snapshotContent = fs.readFileSync(snapshotPath);
const snapshot = JSON.parse(snapshotContent.toString('utf8'));
const exceptionalRecords = (snapshot.records || []).filter(record => record.publication_exception);
const exceptionalCodes = new Set(exceptionalRecords.map(record => String(record.code ?? '').trim()));
const expectedPlan = buildPublicationPlan(snapshotContent);
let plan = {schema_version: '1.0', total_records: 0, lots: []};

if (fs.existsSync(planPath)) {
  plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  validatePublicationPlan(plan, snapshotContent);
} else if (expectedPlan.total_records) {
  throw new Error(
    `Há ${expectedPlan.total_records} registro(s) sem rastreabilidade, mas nenhum plano explícito foi autorizado.`,
  );
}

if (!plan.total_records && !exceptionalRecords.length) {
  console.log('✓ Nenhum lote autorizado aguarda fechamento no Notion.');
  process.exit(0);
}
if (exceptionalRecords.length) {
  console.log(
    `Exceção operacional ativa: ${exceptionalRecords.length} registro(s) serão fechados no Notion sem gates editoriais.`,
  );
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const clean = value => String(value ?? '').trim();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const rich = text => ({rich_text: [{type: 'text', text: {content: text}}]});
const publicationDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const releaseCode = `release-${JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version}:${RELEASE_SHA}`;

async function request(endpoint, options = {}, attempt = 1) {
  const response = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (response.ok) return response.status === 204 ? {} : response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 9) {
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 400 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 600)}`);
}

function plain(property) {
  if (!property) return '';
  if (property.type === 'title') return (property.title || []).map(item => item.plain_text || '').join('');
  if (property.type === 'rich_text') return (property.rich_text || []).map(item => item.plain_text || '').join('');
  return '';
}

function booleanValue(property) {
  if (!property) return false;
  if (property.type === 'checkbox') return property.checkbox === true;
  if (property.type === 'formula' && property.formula?.type === 'boolean') return property.formula.boolean === true;
  return false;
}

function publicationProperties(properties, recordCode) {
  const githubProperty = properties['Código GitHub'];
  const publicationDateProperty = properties['Data da publicação'];
  const manualStatusProperty = properties['Status editorial — registro manual anterior'];

  if (githubProperty?.type !== 'rich_text') {
    throw new Error(`${recordCode}: propriedade Código GitHub ausente ou incompatível.`);
  }
  if (publicationDateProperty?.type !== 'date') {
    throw new Error(`${recordCode}: propriedade Data da publicação ausente ou incompatível.`);
  }

  const patch = {
    'Código GitHub': rich(releaseCode),
    'Data da publicação': {date: {start: publicationDate}},
  };

  if (manualStatusProperty?.type === 'select') {
    patch['Status editorial — registro manual anterior'] = {select: {name: 'Publicada'}};
  }

  return patch;
}

const plannedCodes = new Set(plan.lots.flatMap(item => item.codes));
const selected = (snapshot.records || []).filter(record => (
  plannedCodes.has(clean(record.code)) || exceptionalCodes.has(clean(record.code))
));
const expectedSelected = new Set([...plannedCodes, ...exceptionalCodes]);
if (selected.length !== expectedSelected.size) {
  throw new Error(
    `Escopo autorizou ${expectedSelected.size} registro(s), mas o snapshot resolveu ${selected.length}.`,
  );
}

const publicCodes = new Set();
for (const metadata of catalog.materials || []) {
  const materialPath = path.resolve(root, String(metadata.file).replace(/^\.\//, ''));
  const material = JSON.parse(fs.readFileSync(materialPath, 'utf8'));
  for (const question of material.questoes || []) {
    publicCodes.add(clean(question.codigo));
    if (question.codigo_fonte) publicCodes.add(clean(question.codigo_fonte));
  }
}
for (const record of selected) {
  if (!publicCodes.has(clean(record.code))) {
    throw new Error(`${record.code}: registro autorizado não foi encontrado no catálogo público.`);
  }
}

for (const item of plan.lots) {
  console.log(`Lote autorizado: ${item.lot} — ${item.expected_count} registro(s), códigos verificados por SHA-256.`);
}

const pendingUpdates = [];
let alreadyPublished = 0;
for (const record of selected) {
  const current = await request(`/pages/${record.notion_id}`);
  const properties = current.properties || {};
  const currentCode = clean(plain(properties['Código']));
  const currentLot = clean(plain(properties['Lote de publicação']));
  const currentGithub = clean(plain(properties['Código GitHub']));

  if (currentCode !== clean(record.code)) {
    throw new Error(`${record.code}: código atual no Notion divergiu após o snapshot: ${currentCode || 'vazio'}.`);
  }
  if (currentGithub) {
    alreadyPublished += 1;
    continue;
  }

  if (!record.publication_exception) {
    if (currentLot !== clean(record.publication_lot)) {
      throw new Error(`${record.code}: lote atual no Notion divergiu após o snapshot: ${currentLot || 'vazio'}.`);
    }
    if (!booleanValue(properties['Pode publicar'])) {
      throw new Error(`${record.code}: gate Pode publicar foi retirado após o snapshot.`);
    }
    if (!booleanValue(properties['Liberada para exportação'])) {
      throw new Error(`${record.code}: liberação para exportação foi retirada após o snapshot.`);
    }
  }

  pendingUpdates.push({record, properties});
}

let updated = 0;
for (const {record, properties} of pendingUpdates) {
  await request(`/pages/${record.notion_id}`, {
    method: 'PATCH',
    body: JSON.stringify({properties: publicationProperties(properties, record.code)}),
  });
  updated += 1;
  if (updated % 25 === 0) console.log(`${updated}/${pendingUpdates.length} registros autorizados fechados no Notion.`);
}

if (updated + alreadyPublished !== selected.length) {
  throw new Error('Fechamento da rastreabilidade terminou com contagem divergente do escopo autorizado.');
}
console.log(
  `✓ Rastreabilidade limitada ao plano e à exceção operacional: ${updated} atualizados e ${alreadyPublished} já publicados; `
  + `${selected.length} registro(s) autorizados; release ${releaseCode}.`,
);
