import fs from 'node:fs';

const TOKEN = process.env.NOTION_TOKEN;
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const PREFIX = 'PROVA-QDX-CREFITO17-2026-AGENTE-FISCAL-401-';
const HISTORICAL_RECEIPT = 'release-2.13.0:8a528d925807db558967a3ff0a956006e87356a5';
const HISTORICAL_LOT = 'REL-2026-07-QDX-2026-CREFITO17-AGENTE-FISCAL';
const NEW_LOT = 'CREFITO17-2026-AGENTE-FISCAL-PENDENTES-63-20260803';
const PUBLICATION_DATE = '2026-08-01';

if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível.');

const snapshot = JSON.parse(fs.readFileSync('data/notion/published.json', 'utf8'));
const clean = value => String(value ?? '').trim();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const rich = text => ({rich_text: text ? [{type: 'text', text: {content: text}}] : []});
const fail = message => { throw new Error(message); };

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
  fail(`Notion API ${response.status}: ${body.slice(0, 700)}`);
}

function plain(property) {
  if (!property) return '';
  if (property.type === 'title') return (property.title || []).map(item => item.plain_text || '').join('').trim();
  if (property.type === 'rich_text') return (property.rich_text || []).map(item => item.plain_text || '').join('').trim();
  if (property.type === 'select') return property.select?.name || '';
  if (property.type === 'status') return property.status?.name || '';
  if (property.type === 'url') return property.url || '';
  return '';
}

function checked(property) {
  if (!property) return false;
  if (property.type === 'checkbox') return property.checkbox === true;
  if (property.type === 'formula' && property.formula?.type === 'boolean') return property.formula.boolean === true;
  return false;
}

function numeric(property) {
  return property?.type === 'number' ? Number(property.number) : NaN;
}

async function readLiveRows() {
  const rows = [];
  let cursor;
  do {
    const body = {
      page_size: 100,
      filter: {property: 'Código', rich_text: {starts_with: PREFIX}},
    };
    if (cursor) body.start_cursor = cursor;
    const page = await request(`/data_sources/${SOURCE}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    rows.push(...(page.results || []));
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

function validateEditorialGates(row) {
  const p = row.properties || {};
  const code = plain(p['Código']);
  const audit = plain(p['Auditoria de conteúdo']);
  const answer = plain(p['Gabarito']);
  const materialType = plain(p['Tipo de material']);
  const requiredText = [
    ['Enunciado', plain(p['Enunciado'])],
    ['Comentário geral', plain(p['Comentário geral'])],
    ['Fundamento legal', plain(p['Fundamento legal'])],
    ['Disciplina', plain(p['Disciplina'])],
    ['Assunto', plain(p['Assunto'])],
    ['URL da fonte', plain(p['URL da fonte'])],
  ];

  if (materialType !== 'Prova') fail(`${code}: Tipo de material divergente (${materialType || 'vazio'}).`);
  if (checked(p['Anulada'])) fail(`${code}: questão anulada.`);
  if (checked(p['Duplicada'])) fail(`${code}: questão duplicada.`);
  if (checked(p['Possui imagem'])) fail(`${code}: questão com imagem não autorizada nesta operação.`);
  if (checked(p['Bloqueio manual de publicação'])) fail(`${code}: bloqueio manual ativo.`);
  if (!checked(p['Transcrição conferida'])) fail(`${code}: transcrição não conferida.`);
  if (!checked(p['Gabarito conferido - registro manual anterior'])) fail(`${code}: gabarito definitivo não confirmado.`);
  if (!['Aprovada', 'Ajustada'].includes(audit)) fail(`${code}: auditoria inválida (${audit || 'vazia'}).`);
  if (!['Certo', 'Errado'].includes(answer)) fail(`${code}: gabarito incompatível (${answer || 'vazio'}).`);
  for (const [name, value] of requiredText) {
    if (!value) fail(`${code}: ${name} ausente.`);
  }
}

const publicRecords = (snapshot.records || []).filter(record => (
  clean(record.code).startsWith(PREFIX) && clean(record.github_id)
));
if (publicRecords.length !== 57) {
  fail(`Catálogo público deveria conter 57 itens do Agente Fiscal; contém ${publicRecords.length}.`);
}
for (const record of publicRecords) {
  if (clean(record.github_id) !== HISTORICAL_RECEIPT) {
    fail(`${record.code}: recibo público divergente (${record.github_id || 'vazio'}).`);
  }
}
const publicCodes = new Set(publicRecords.map(record => clean(record.code)));

let rows = await readLiveRows();
if (rows.length !== 120) fail(`Banco Mestre deveria conter 120 itens; contém ${rows.length}.`);
rows.sort((a, b) => numeric(a.properties?.['Número original']) - numeric(b.properties?.['Número original']));
for (let index = 0; index < 120; index += 1) {
  const expectedNumber = index + 1;
  const number = numeric(rows[index].properties?.['Número original']);
  const expectedCode = `${PREFIX}${String(expectedNumber).padStart(3, '0')}`;
  const code = plain(rows[index].properties?.['Código']);
  if (number !== expectedNumber || code !== expectedCode) {
    fail(`Sequência divergente na posição ${expectedNumber}: número ${number}, código ${code || 'vazio'}.`);
  }
}

const livePublic = rows.filter(row => clean(plain(row.properties?.['Código GitHub'])));
const pending = rows.filter(row => !clean(plain(row.properties?.['Código GitHub'])));
if (livePublic.length !== 57 || pending.length !== 63) {
  fail(`Classificação divergente: ${livePublic.length} publicados e ${pending.length} pendentes.`);
}
const livePublicCodes = new Set(livePublic.map(row => plain(row.properties?.['Código'])));
if (livePublicCodes.size !== publicCodes.size || [...publicCodes].some(code => !livePublicCodes.has(code))) {
  fail('O conjunto publicado no Notion diverge do catálogo público confirmado.');
}

for (const row of livePublic) {
  const p = row.properties || {};
  const code = plain(p['Código']);
  if (plain(p['Código GitHub']) !== HISTORICAL_RECEIPT) fail(`${code}: recibo atual diverge do catálogo.`);
  validateEditorialGates(row);
}
for (const row of pending) {
  const p = row.properties || {};
  const code = plain(p['Código']);
  if (publicCodes.has(code)) fail(`${code}: código público classificado como pendente.`);
  if (plain(p['Lote de publicação'])) fail(`${code}: lote prévio inesperado.`);
  validateEditorialGates(row);
}

let normalized = 0;
for (const row of livePublic) {
  const p = row.properties || {};
  const code = plain(p['Código']);
  const currentLot = plain(p['Lote de publicação']);
  const released = checked(p['Liberada para exportação']);
  const currentDate = p['Data da publicação']?.type === 'date' ? p['Data da publicação'].date?.start || '' : '';
  if (currentLot === HISTORICAL_LOT && released && currentDate === PUBLICATION_DATE) continue;
  await request(`/pages/${row.id}`, {
    method: 'PATCH',
    body: JSON.stringify({properties: {
      'Lote de publicação': rich(HISTORICAL_LOT),
      'Liberada para exportação': {checkbox: true},
      'Data da publicação': {date: {start: PUBLICATION_DATE}},
    }}),
  });
  normalized += 1;
  if (normalized % 20 === 0) console.log(`${normalized}/57 publicados normalizados.`);
}

let released = 0;
for (const row of pending) {
  await request(`/pages/${row.id}`, {
    method: 'PATCH',
    body: JSON.stringify({properties: {
      'Lote de publicação': rich(NEW_LOT),
      'Liberada para exportação': {checkbox: true},
      'Data da publicação': {date: null},
    }}),
  });
  released += 1;
  if (released % 20 === 0) console.log(`${released}/63 inéditos liberados.`);
}

rows = await readLiveRows();
const afterPublic = rows.filter(row => publicCodes.has(plain(row.properties?.['Código'])));
const afterPending = rows.filter(row => !publicCodes.has(plain(row.properties?.['Código'])));
for (const row of afterPublic) {
  const p = row.properties || {};
  if (plain(p['Código GitHub']) !== HISTORICAL_RECEIPT || plain(p['Lote de publicação']) !== HISTORICAL_LOT || !checked(p['Liberada para exportação'])) {
    fail(`${plain(p['Código'])}: reconciliação histórica não persistiu.`);
  }
}
for (const row of afterPending) {
  const p = row.properties || {};
  if (plain(p['Código GitHub']) || plain(p['Lote de publicação']) !== NEW_LOT || !checked(p['Liberada para exportação'])) {
    fail(`${plain(p['Código'])}: liberação do lote novo não persistiu.`);
  }
}

console.log(`✓ CREFITO-17 Agente Fiscal reconciliado: ${normalized} registros públicos normalizados e ${released} itens inéditos liberados.`);
console.log(`✓ Lote novo: ${NEW_LOT}; Código GitHub permanece vazio nos 63 itens até publicação pública confirmada.`);
