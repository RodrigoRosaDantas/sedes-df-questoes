import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.resolve(root, process.env.NOTION_SNAPSHOT_PATH || 'data/notion/publication-additions/cremam-administrador-49.json');
const planPath = path.resolve(root, process.env.PUBLICATION_PLAN_PATH || 'data/notion/publication-additions/cremam-administrador-49-plan.json');
const TOKEN = process.env.NOTION_TOKEN;
const RELEASE_SHA = process.env.RELEASE_COMMIT || '';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const LOT = 'CREMAM-2025-ADMINISTRADOR-400-49-20260807';
const EXPECTED_PREFIX = 'PROVA-QDX-CREMAM-2025-ADMINISTRADOR-400-';

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

if (snapshot.schema_version !== '1.3' || snapshot.scope_mode !== 'additions' || snapshot.records?.length !== 49) throw new Error('Snapshot CREMAM inválido.');
if (plan.total_records !== 49 || !Array.isArray(plan.lots) || plan.lots.length !== 1 || plan.lots[0].lot !== LOT) throw new Error('Plano CREMAM inválido.');
const planCodes = new Set(plan.lots[0].codes || []);
if (planCodes.size !== 49) throw new Error('Plano CREMAM não contém 49 códigos únicos.');

let updated = 0;
let alreadyClosed = 0;
for (const record of snapshot.records) {
  if (!planCodes.has(record.code) || !clean(record.code).startsWith(EXPECTED_PREFIX)) throw new Error(`${record.code}: fora do plano.`);
  const current = await request(`/pages/${record.notion_id}`);
  const properties = current.properties || {};
  const currentCode = clean(plain(properties['Código']));
  const currentLot = clean(plain(properties['Lote de publicação']));
  const currentGithub = clean(plain(properties['Código GitHub']));
  const currentDate = properties['Data da publicação']?.date?.start || '';
  const released = properties['Liberada para exportação']?.checkbox === true;
  if (currentCode !== record.code) throw new Error(`${record.code}: identidade divergente no Notion.`);
  if (currentLot !== LOT || !released) throw new Error(`${record.code}: lote/liberação divergente após o snapshot.`);
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
  if ((updated + alreadyClosed) % 10 === 0) console.log(`${updated + alreadyClosed}/49 registros reconciliados.`);
}

for (const record of snapshot.records) {
  const current = await request(`/pages/${record.notion_id}`);
  const properties = current.properties || {};
  const github = clean(plain(properties['Código GitHub']));
  const date = properties['Data da publicação']?.date?.start || '';
  if (github !== releaseCode || date !== publicationDate) throw new Error(`${record.code}: fechamento não persistiu.`);
}
console.log(`✓ CREMAM fechado 49/49 no Notion: ${releaseCode}, data ${publicationDate}; fórmula viva Pode publicar não foi reavaliada.`);
