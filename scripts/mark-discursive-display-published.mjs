import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.resolve(root, process.env.DISCURSIVE_DISPLAY_PATH || 'data/notion/discursive-display.json');
const catalogPath = path.join(root, 'data', 'release', 'catalogo.json');
const TOKEN = process.env.NOTION_TOKEN;
const RELEASE_SHA = process.env.RELEASE_COMMIT || process.env.GITHUB_SHA || '';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';

if (!fs.existsSync(sourcePath) || !fs.readFileSync(sourcePath, 'utf8').trim()) {
  console.log('✓ Nenhuma discursiva de consulta aguarda fechamento.');
  process.exit(0);
}
if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível para fechar as discursivas.');
if (!RELEASE_SHA) throw new Error('Commit da release não informado.');

const payload = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const records = payload.records || [];
if (records.length !== 2 || records.some(record => record.display_only !== true)) {
  throw new Error(`Escopo inválido de discursivas para fechamento: ${records.length}.`);
}

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
  if (property.type === 'select') return property.select?.name || '';
  return '';
}

function checked(property) {
  return property?.type === 'checkbox' && property.checkbox === true;
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const publicCodes = new Set();
const objectiveCodes = new Set();
for (const metadata of catalog.materials || []) {
  const material = JSON.parse(fs.readFileSync(path.resolve(root, String(metadata.file).replace(/^\.\//, '')), 'utf8'));
  for (const question of material.questoes || []) objectiveCodes.add(clean(question.codigo));
  for (const item of material.discursivas || []) publicCodes.add(clean(item.codigo));
}
for (const record of records) {
  if (!publicCodes.has(clean(record.code))) throw new Error(`${record.code}: não encontrada no pacote público de consulta.`);
  if (objectiveCodes.has(clean(record.code))) throw new Error(`${record.code}: inserida indevidamente no motor objetivo.`);
}

let updated = 0;
let alreadyPublished = 0;
for (const record of records) {
  const current = await request(`/pages/${record.notion_id}`);
  const properties = current.properties || {};
  const currentCode = clean(plain(properties['Código']));
  const currentFormat = clean(plain(properties['Formato da questão']));
  const currentGithub = clean(plain(properties['Código GitHub']));
  const audit = clean(plain(properties['Auditoria de conteúdo']));

  if (currentCode !== clean(record.code)) throw new Error(`${record.code}: código atual divergiu: ${currentCode || 'vazio'}.`);
  if (currentFormat !== 'Discursiva') throw new Error(`${record.code}: formato atual divergiu: ${currentFormat || 'vazio'}.`);
  if (!['Aprovada', 'Ajustada'].includes(audit)) throw new Error(`${record.code}: auditoria atual não está aprovada.`);
  if (!checked(properties['Transcrição conferida'])) throw new Error(`${record.code}: transcrição deixou de estar conferida.`);
  if (checked(properties['Duplicada']) || checked(properties['Bloqueio manual de publicação'])) {
    throw new Error(`${record.code}: bloqueio editorial surgiu após o snapshot.`);
  }
  if (currentGithub) {
    if (currentGithub !== releaseCode) throw new Error(`${record.code}: recibo conflitante já existe: ${currentGithub}.`);
    alreadyPublished += 1;
    continue;
  }

  const previousObservation = clean(plain(properties['Observações']));
  const closureNote = `PUBLICAÇÃO PARA CONSULTA — ${publicationDate}: exibida no site somente para visualização, sem gabarito automático, pontuação, cronômetro ou impacto nas estatísticas. Release ${releaseCode}.`;
  const patch = {
    'Código GitHub': rich(releaseCode),
    'Data da publicação': {date: {start: publicationDate}},
    'Observações': rich([previousObservation, closureNote].filter(Boolean).join(' ')),
  };
  if (properties['Status editorial - registro manual anterior']?.type === 'select') {
    patch['Status editorial - registro manual anterior'] = {select: {name: 'Publicada'}};
  }

  await request(`/pages/${record.notion_id}`, {
    method: 'PATCH',
    body: JSON.stringify({properties: patch}),
  });
  updated += 1;
}

if (updated + alreadyPublished !== records.length) throw new Error('Fechamento das discursivas terminou com contagem divergente.');
console.log(`✓ Discursivas de consulta fechadas no Notion: ${updated} atualizadas, ${alreadyPublished} já publicadas; release ${releaseCode}.`);
