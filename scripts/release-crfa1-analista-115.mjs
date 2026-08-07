import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const operation = JSON.parse(fs.readFileSync(path.join(root, 'data', 'operations', 'prepare-crfa1-analista-115.json'), 'utf8'));
const TOKEN = process.env.NOTION_TOKEN;
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const LOT = operation.operation_id;
const PREFIX = operation.code_prefix;
const BLOCKED = new Set(operation.blocked_original_numbers.map(Number));
const EXPECTED_NUMBERS = Array.from({length: 120}, (_, index) => index + 1).filter(number => !BLOCKED.has(number));
const EXPECTED_CODES = EXPECTED_NUMBERS.map(number => `${PREFIX}${String(number).padStart(3, '0')}`);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const clean = value => String(value ?? '').trim();

if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível para liberar o lote CRFa-1.');
if (operation.authorized !== true) throw new Error('Operação CRFa-1 não está explicitamente autorizada.');
if (operation.expected_additions !== EXPECTED_NUMBERS.length) throw new Error('Contagem autorizada diverge do escopo 115.');

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

const richText = property => {
  if (!property) return '';
  if (property.type === 'title') return (property.title || []).map(item => item.plain_text || '').join('').trim();
  if (property.type === 'rich_text') return (property.rich_text || []).map(item => item.plain_text || '').join('').trim();
  return '';
};
const selectName = property => property?.type === 'select' ? clean(property.select?.name) : '';
const numberValue = property => property?.type === 'number' ? Number(property.number) : NaN;
const checkbox = property => property?.type === 'checkbox' && property.checkbox === true;
const formulaTrue = property => {
  if (property?.type !== 'formula') return false;
  if (property.formula?.type === 'boolean') return property.formula.boolean === true;
  if (property.formula?.type === 'string') return clean(property.formula.string).toLowerCase() === 'true';
  return false;
};

async function readScope() {
  const rows = [];
  let cursor;
  do {
    const body = {
      page_size: 100,
      result_type: 'page',
      filter: {property: 'Código', rich_text: {starts_with: PREFIX}},
    };
    if (cursor) body.start_cursor = cursor;
    const page = await request(`/data_sources/${SOURCE}/query`, {method: 'POST', body: JSON.stringify(body)});
    for (const item of page.results || []) rows.push(item);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

function validateRows(rows, requireReleased) {
  if (rows.length !== EXPECTED_NUMBERS.length) {
    throw new Error(`Escopo CRFa-1 deveria conter 115 registros canônicos; encontrado ${rows.length}.`);
  }
  const seen = new Set();
  for (const item of rows) {
    const p = item.properties || {};
    const code = richText(p['Código']);
    const number = numberValue(p['Número original']);
    if (!EXPECTED_CODES.includes(code)) throw new Error(`${code || item.id}: código fora do escopo autorizado.`);
    if (!EXPECTED_NUMBERS.includes(number)) throw new Error(`${code}: número ${number} bloqueado ou inesperado.`);
    if (seen.has(code)) throw new Error(`${code}: código canônico repetido no Banco Mestre.`);
    seen.add(code);
    if (richText(p['Nome do material']) !== operation.material) throw new Error(`${code}: material divergente.`);
    if (!formulaTrue(p['Pode publicar'])) throw new Error(`${code}: gate Pode publicar não está verdadeiro.`);
    if (!['Aprovada', 'Ajustada'].includes(selectName(p['Auditoria de conteúdo']))) throw new Error(`${code}: auditoria editorial não aprovada.`);
    if (!checkbox(p['Transcrição conferida'])) throw new Error(`${code}: transcrição não conferida.`);
    if (checkbox(p['Duplicada'])) throw new Error(`${code}: registro marcado como duplicado.`);
    if (checkbox(p['Anulada'])) throw new Error(`${code}: registro anulado não pode entrar no lote.`);
    if (checkbox(p['Possui imagem'])) throw new Error(`${code}: item com imagem não está autorizado neste lote.`);
    if (checkbox(p['Bloqueio manual de publicação'])) throw new Error(`${code}: bloqueio manual ativo.`);
    if (richText(p['Código GitHub'])) throw new Error(`${code}: já possui Código GitHub; operação não é inédita.`);
    if (!richText(p['Enunciado'])) throw new Error(`${code}: enunciado vazio.`);
    if (!richText(p['Comentário geral'])) throw new Error(`${code}: comentário geral vazio.`);
    if (!['Certo', 'Errado'].includes(selectName(p['Gabarito']))) throw new Error(`${code}: gabarito incompatível com o lote C/E.`);
    const lot = richText(p['Lote de publicação']);
    if (lot && lot !== LOT) throw new Error(`${code}: já pertence a outro lote (${lot}).`);
    if (requireReleased) {
      if (!checkbox(p['Liberada para exportação'])) throw new Error(`${code}: liberação não persistiu.`);
      if (lot !== LOT) throw new Error(`${code}: lote não persistiu.`);
    }
  }
  const ordered = [...seen].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (JSON.stringify(ordered) !== JSON.stringify(EXPECTED_CODES)) throw new Error('Conjunto canônico CRFa-1 divergente do manifesto 115.');
}

let rows = await readScope();
validateRows(rows, false);

let updated = 0;
let alreadyPrepared = 0;
for (const item of rows) {
  const p = item.properties || {};
  const released = checkbox(p['Liberada para exportação']);
  const lot = richText(p['Lote de publicação']);
  if (released && lot === LOT) {
    alreadyPrepared += 1;
    continue;
  }
  await request(`/pages/${item.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        'Liberada para exportação': {checkbox: true},
        'Lote de publicação': {rich_text: [{type: 'text', text: {content: LOT}}]},
      },
    }),
  });
  updated += 1;
  if (updated % 20 === 0) console.log(`${updated}/115 registros CRFa-1 liberados.`);
}

rows = await readScope();
validateRows(rows, true);
console.log(`✓ Lote ${LOT}: ${updated} registro(s) atualizados, ${alreadyPrepared} já preparados e 115/115 confirmados; Código GitHub permanece vazio.`);
