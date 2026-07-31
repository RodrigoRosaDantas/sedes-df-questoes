import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(root, 'data', 'notion', 'published.json');
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

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
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

const publicCodes = new Set();
for (const metadata of catalog.materials || []) {
  const materialPath = path.resolve(root, String(metadata.file).replace(/^\.\//, ''));
  const material = JSON.parse(fs.readFileSync(materialPath, 'utf8'));
  for (const question of material.questoes || []) {
    publicCodes.add(clean(question.codigo));
    if (question.codigo_fonte) publicCodes.add(clean(question.codigo_fonte));
  }
}

const selected = (snapshot.records || []).filter(record => !clean(record.github_id));
if (!selected.length) {
  console.log('✓ Todos os registros do snapshot já possuem rastreabilidade no Notion.');
  process.exit(0);
}

for (const record of selected) {
  if (!publicCodes.has(clean(record.code))) {
    throw new Error(`${record.code}: registro do snapshot não foi encontrado no catálogo público nem como codigo_fonte.`);
  }
}

const groups = new Map();
for (const record of selected.filter(item => clean(item.publication_lot))) {
  if (!groups.has(record.publication_lot)) groups.set(record.publication_lot, []);
  groups.get(record.publication_lot).push(record);
}
for (const [lot, records] of groups) {
  const numbers = records.map(record => Number(record.original_number)).filter(Number.isInteger).sort((left, right) => left - right);
  const consecutive = numbers.length === records.length
    && new Set(numbers).size === numbers.length
    && numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1);
  console.log(`${consecutive ? 'Lote consecutivo' : 'Lote parcial registrado sem bloquear os demais'}: ${lot} — ${records.length} registro(s).`);
}

let updated = 0;
let alreadyPublished = 0;
let skippedChangedGate = 0;
for (const record of selected) {
  const current = await request(`/pages/${record.notion_id}`);
  const properties = current.properties || {};
  const currentGithub = plain(properties['Código GitHub']);
  if (currentGithub) {
    alreadyPublished += 1;
    continue;
  }
  if (!booleanValue(properties['Pode publicar'])) {
    skippedChangedGate += 1;
    console.log(`Gate alterado após o snapshot; registro não marcado: ${record.code}.`);
    continue;
  }
  await request(`/pages/${record.notion_id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        'Código GitHub': rich(releaseCode),
        'Data da publicação': {date: {start: publicationDate}},
        'Status editorial - registro manual anterior': {select: {name: 'Publicada'}},
      },
    }),
  });
  updated += 1;
  if (updated % 25 === 0) console.log(`${updated}/${selected.length} registros fechados no Notion.`);
}

console.log(`✓ Rastreabilidade fechada: ${updated} atualizados, ${alreadyPublished} já publicados e ${skippedChangedGate} preservados por alteração posterior do gate; release ${releaseCode}.`);
