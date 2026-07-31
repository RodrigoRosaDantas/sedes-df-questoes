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
  if ((response.status === 429 || response.status >= 500) && attempt < 8) {
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

const publicCodes = new Set();
for (const metadata of catalog.materials || []) {
  const materialPath = path.resolve(root, String(metadata.file).replace(/^\.\//, ''));
  const material = JSON.parse(fs.readFileSync(materialPath, 'utf8'));
  for (const question of material.questoes || []) publicCodes.add(clean(question.codigo));
}

const selected = (snapshot.records || []).filter(record =>
  record.released_for_export
  && clean(record.publication_lot)
  && !clean(record.github_id)
);
if (!selected.length) {
  console.log('✓ Nenhum registro novo precisa ser marcado como publicado no Notion.');
  process.exit(0);
}

const groups = new Map();
for (const record of selected) {
  if (!publicCodes.has(clean(record.code))) throw new Error(`${record.code}: registro novo não foi encontrado no catálogo público.`);
  if (!groups.has(record.publication_lot)) groups.set(record.publication_lot, []);
  groups.get(record.publication_lot).push(record);
}
for (const [lot, records] of groups) {
  const numbers = records.map(record => Number(record.original_number)).sort((left, right) => left - right);
  const unique = new Set(numbers);
  if (unique.size !== numbers.length || numbers.some(number => !Number.isInteger(number) || number <= 0)) {
    throw new Error(`${lot}: numeração inválida ou duplicada.`);
  }
  for (let index = 1; index < numbers.length; index += 1) {
    if (numbers[index] !== numbers[index - 1] + 1) throw new Error(`${lot}: sequência incompleta entre ${numbers[index - 1]} e ${numbers[index]}.`);
  }
  console.log(`Lote pronto para fechamento: ${lot} — ${records.length} registros (${numbers[0]}–${numbers.at(-1)}).`);
}

let updated = 0;
let alreadyPublished = 0;
for (const record of selected) {
  const current = await request(`/pages/${record.notion_id}`);
  const properties = current.properties || {};
  const currentGithub = plain(properties['Código GitHub']);
  if (currentGithub) {
    alreadyPublished += 1;
    continue;
  }
  const currentLot = plain(properties['Lote de publicação']);
  const released = properties['Liberada para exportação']?.checkbox === true;
  if (currentLot !== record.publication_lot || !released) {
    throw new Error(`${record.code}: o gate editorial mudou antes do fechamento; atualização interrompida.`);
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
  if (updated % 20 === 0) console.log(`${updated}/${selected.length} registros fechados no Notion.`);
}
console.log(`✓ Rastreabilidade fechada: ${updated} registros atualizados, ${alreadyPublished} já estavam publicados; release ${releaseCode}.`);
