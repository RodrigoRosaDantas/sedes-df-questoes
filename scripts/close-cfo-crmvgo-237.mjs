import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.resolve(root, process.env.NOTION_SNAPSHOT_PATH || 'data/notion/publication-additions/cfo-crmvgo-tecnico-administrativo-237.json');
const planPath = path.resolve(root, process.env.PUBLICATION_PLAN_PATH || 'data/notion/publication-additions/cfo-crmvgo-tecnico-administrativo-237-plan.json');
const TOKEN = process.env.NOTION_TOKEN;
const RELEASE_SHA = process.env.RELEASE_COMMIT || '';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const MATERIALS = [
  {prefix: 'PROVA-QDX-CFO-2025-TECNICO-ADMINISTRATIVO-201-', lot: 'CFO-2025-TECNICO-ADMINISTRATIVO-201-118-20260807', expected: 118},
  {prefix: 'PROVA-QDX-CRMVGO-2025-TECNICO-ADMINISTRATIVO-200-', lot: 'CRMVGO-2025-TECNICO-ADMINISTRATIVO-200-119-20260807', expected: 119},
];

if (!TOKEN) throw new Error('NOTION_TOKEN ausente.');
if (!RELEASE_SHA) throw new Error('RELEASE_COMMIT ausente.');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const clean = value => String(value ?? '').trim();
const releaseCode = `release-${JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version}:${RELEASE_SHA}`;
const publicationDate = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 800)}`);
}

const plain = property => {
  if (!property) return '';
  if (property.type === 'title') return (property.title || []).map(item => item.plain_text || '').join('');
  if (property.type === 'rich_text') return (property.rich_text || []).map(item => item.plain_text || '').join('');
  return '';
};

if (snapshot.schema_version !== '1.3' || snapshot.scope_mode !== 'additions' || snapshot.records?.length !== 237) throw new Error('Snapshot 237 inválido.');
if (plan.total_records !== 237 || !Array.isArray(plan.lots) || plan.lots.length !== 2) throw new Error('Plano 237 inválido.');

const planByLot = new Map(plan.lots.map(item => [clean(item.lot), item]));
for (const config of MATERIALS) {
  const item = planByLot.get(config.lot);
  if (!item || Number(item.expected_count) !== config.expected || !Array.isArray(item.codes) || item.codes.length !== config.expected) {
    throw new Error(`${config.lot}: plano divergente.`);
  }
}
const allPlanCodes = new Set(plan.lots.flatMap(item => item.codes || []));
if (allPlanCodes.size !== 237) throw new Error('Plano não contém 237 códigos únicos.');

function configFor(record) {
  const code = clean(record.code);
  return MATERIALS.find(item => code.startsWith(item.prefix)) || null;
}

let updated = 0;
let alreadyClosed = 0;
for (const record of snapshot.records) {
  const config = configFor(record);
  if (!config || !allPlanCodes.has(record.code) || clean(record.publication_lot) !== config.lot) throw new Error(`${record.code}: fora do plano/lote.`);
  const current = await request(`/pages/${record.notion_id}`);
  const properties = current.properties || {};
  const currentCode = clean(plain(properties['Código']));
  const currentLot = clean(plain(properties['Lote de publicação']));
  const currentGithub = clean(plain(properties['Código GitHub']));
  const currentDate = properties['Data da publicação']?.date?.start || '';
  const released = properties['Liberada para exportação']?.checkbox === true;
  if (currentCode !== record.code) throw new Error(`${record.code}: identidade divergente no Notion.`);
  if (currentLot !== config.lot || !released) throw new Error(`${record.code}: lote/liberação divergente após snapshot.`);
  if (currentGithub && currentGithub !== releaseCode) throw new Error(`${record.code}: recibo conflitante ${currentGithub}.`);
  if (currentDate && currentDate !== publicationDate) throw new Error(`${record.code}: data conflitante ${currentDate}.`);
  if (currentGithub === releaseCode && currentDate === publicationDate) {
    alreadyClosed += 1;
    continue;
  }
  await request(`/pages/${record.notion_id}`, {
    method: 'PATCH',
    body: JSON.stringify({properties: {
      'Código GitHub': {rich_text: [{type: 'text', text: {content: releaseCode}}]},
      'Data da publicação': {date: {start: publicationDate}},
    }}),
  });
  updated += 1;
  if ((updated + alreadyClosed) % 25 === 0) console.log(`${updated + alreadyClosed}/237 registros reconciliados.`);
}

let checked = 0;
for (const record of snapshot.records) {
  const current = await request(`/pages/${record.notion_id}`);
  const properties = current.properties || {};
  const github = clean(plain(properties['Código GitHub']));
  const date = properties['Data da publicação']?.date?.start || '';
  if (github !== releaseCode || date !== publicationDate) throw new Error(`${record.code}: fechamento não persistiu.`);
  checked += 1;
}
console.log(`✓ CFO/CRMV-GO fechado ${checked}/237 no Notion: ${releaseCode}, data ${publicationDate}; fórmula viva não foi reavaliada no fechamento.`);
