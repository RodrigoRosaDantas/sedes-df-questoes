import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validatePublicationPlan} from './publication-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(root, 'data', 'notion', 'published.json');
const planPath = path.join(root, 'data', 'notion', 'publication-plan.json');
const catalogPath = path.join(root, 'data', 'release', 'catalogo.json');
const TOKEN = process.env.NOTION_TOKEN;
const RELEASE_SHA = process.env.RELEASE_COMMIT || process.env.GITHUB_SHA || '';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';

if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível para fechar as 75 questões.');
if (!RELEASE_SHA) throw new Error('Commit da release não informado.');

const snapshotContent = fs.readFileSync(snapshotPath);
const snapshot = JSON.parse(snapshotContent.toString('utf8'));
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
validatePublicationPlan(plan, snapshotContent);
if (snapshot.schema_version !== '1.3' || snapshot.scope_mode !== 'additions') throw new Error('Snapshot final inválido.');
if (plan.total_records !== 75 || plan.lots.length !== 2) throw new Error(`Plano final divergente: ${plan.total_records} registros em ${plan.lots.length} lotes.`);

const clean = value => String(value ?? '').trim();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const rich = text => ({rich_text: [{type: 'text', text: {content: text}}]});
const publicationDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
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
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 700)}`);
}

function plain(property) {
  if (!property) return '';
  if (property.type === 'title') return (property.title || []).map(item => item.plain_text || '').join('');
  if (property.type === 'rich_text') return (property.rich_text || []).map(item => item.plain_text || '').join('');
  return '';
}

const plannedCodes = new Set(plan.lots.flatMap(item => item.codes));
const selected = (snapshot.records || []).filter(record => plannedCodes.has(clean(record.code)));
if (selected.length !== 75 || selected.some(record => clean(record.github_id))) throw new Error('Escopo final do snapshot não contém exatamente 75 registros novos.');

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const publicCodes = new Set();
for (const metadata of catalog.materials || []) {
  const material = JSON.parse(fs.readFileSync(path.resolve(root, String(metadata.file).replace(/^\.\//, '')), 'utf8'));
  for (const question of material.questoes || []) {
    publicCodes.add(clean(question.codigo));
    if (question.codigo_fonte) publicCodes.add(clean(question.codigo_fonte));
  }
}
for (const record of selected) if (!publicCodes.has(clean(record.code))) throw new Error(`${record.code}: ausente do catálogo público validado.`);

let updated = 0;
let alreadyPublished = 0;
for (const record of selected) {
  const current = await request(`/pages/${record.notion_id}`);
  const properties = current.properties || {};
  const currentCode = clean(plain(properties['Código']));
  const currentLot = clean(plain(properties['Lote de publicação']));
  const currentGithub = clean(plain(properties['Código GitHub']));
  if (currentCode !== clean(record.code)) throw new Error(`${record.code}: identidade atual divergente: ${currentCode || 'vazio'}.`);
  if (currentLot !== clean(record.publication_lot)) throw new Error(`${record.code}: lote atual divergente: ${currentLot || 'vazio'}.`);
  if (currentGithub) {
    if (currentGithub !== releaseCode) throw new Error(`${record.code}: recibo conflitante: ${currentGithub}.`);
    alreadyPublished += 1;
    continue;
  }
  await request(`/pages/${record.notion_id}`, {
    method: 'PATCH',
    body: JSON.stringify({properties: {
      'Código GitHub': rich(releaseCode),
      'Data da publicação': {date: {start: publicationDate}},
      'Status editorial — registro manual anterior': {select: {name: 'Publicada'}},
    }}),
  });
  updated += 1;
  if (updated % 15 === 0) console.log(`${updated}/75 questões fechadas no Notion.`);
}

if (updated + alreadyPublished !== 75) throw new Error('Fechamento final terminou com contagem divergente.');
console.log(`✓ Fechamento concluído: ${updated} atualizadas, ${alreadyPublished} já publicadas; release ${releaseCode}.`);
