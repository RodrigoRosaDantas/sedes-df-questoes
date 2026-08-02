import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const paths = {
  snapshot: path.join(root, 'data', 'notion', 'published.json'),
  catalog: path.join(root, 'data', 'release', 'catalogo.json'),
  request: path.join(root, 'data', 'notion', 'trash-unpublished-request.json'),
  manifest: path.join(root, 'data', 'notion', 'trash-unpublished-manifest.json'),
  report: path.join(root, 'data', 'notion', 'trash-unpublished-report.json'),
};
export const EXPECTED = Object.freeze({all: 4994, published: 2536, target: 2458, snapshot: 1846});
export const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
export const AUDIT_PARENT = '3accf5a2-6731-81fa-a215-e4a9187ff960';
export const TRASH_CONFIRMATION = 'TRASH-2458-OUTSIDE-SITE';
export const RESTORE_CONFIRMATION = 'RESTORE-2458-OUTSIDE-SITE';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const TOKEN = process.env.NOTION_TOKEN;
const receipt = /^release-\d+\.\d+\.\d+:[0-9a-f]{7,64}$/i;

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
export const key = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const composite = (material, number) => `${key(material)}::${Number(number) || 0}`;
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
export const legacyPublicId = value => {
  const candidate = clean(value);
  return candidate && !receipt.test(candidate) ? candidate : '';
};
export const fingerprint = (prompt, alternatives, answer) => key([
  prompt,
  ...['A', 'B', 'C', 'D', 'E', 'Certo', 'Errado'].map(letter => alternatives?.[letter] || ''),
  answer,
].join('\u241f'));

export async function request(endpoint, options = {}, attempt = 1) {
  if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível.');
  const response = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (response.ok) return response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 8) {
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 500 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 800)}`);
}

const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
function value(property) {
  if (!property) return null;
  if (property.type === 'title') return rich(property.title);
  if (property.type === 'rich_text') return rich(property.rich_text);
  if (property.type === 'select') return property.select?.name ?? null;
  if (property.type === 'status') return property.status?.name ?? null;
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  if (property.type === 'number') return property.number;
  if (property.type === 'date') return property.date?.start ?? null;
  if (property.type === 'formula') return property.formula?.[property.formula.type] ?? null;
  return null;
}

export function alternativesOf(row) {
  const alternatives = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map(letter => [letter, clean(row[`Alternativa ${letter}`])]));
  return Object.values(alternatives).every(item => !item) ? {Certo: 'Certo', Errado: 'Errado'} : alternatives;
}

export async function readActiveRows() {
  const properties = [
    'Questão', 'Código', 'Código GitHub', 'Tipo de material', 'Nome do material',
    'Número original', 'Enunciado', 'Alternativa A', 'Alternativa B', 'Alternativa C',
    'Alternativa D', 'Alternativa E', 'Gabarito', 'Anulada', 'Duplicada', 'Data da publicação',
  ];
  const query = new URLSearchParams();
  properties.forEach(property => query.append('filter_properties[]', property));
  const endpoint = `/data_sources/${SOURCE}/query?${query}`;
  const rows = [];
  let cursor;
  do {
    const body = {page_size: 100, result_type: 'page', ...(cursor ? {start_cursor: cursor} : {})};
    const page = await request(endpoint, {method: 'POST', body: JSON.stringify(body)});
    for (const item of page.results || []) {
      rows.push({
        notion_id: item.id,
        notion_url: item.url,
        notion_created_time: item.created_time || null,
        notion_last_edited_time: item.last_edited_time || null,
        ...Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)])),
      });
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

export async function readSnapshot() {
  const raw = await fs.readFile(paths.snapshot, 'utf8');
  const snapshot = JSON.parse(raw);
  const records = snapshot.records || [];
  const ids = records.map(record => clean(record.notion_id));
  if (records.length !== EXPECTED.snapshot) throw new Error(`Snapshot possui ${records.length}; esperado ${EXPECTED.snapshot}.`);
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('Snapshot contém notion_id ausente ou duplicado.');
  return {raw, snapshot, records, ids: new Set(ids)};
}

export async function readPublicCatalog() {
  const raw = await fs.readFile(paths.catalog, 'utf8');
  const catalog = JSON.parse(raw);
  const questions = [];
  for (const metadata of catalog.materials || []) {
    const material = JSON.parse(await fs.readFile(path.resolve(root, String(metadata.file).replace(/^\.\//, '')), 'utf8'));
    for (const question of material.questoes || []) {
      questions.push({
        public_id: clean(question.id),
        code: clean(question.codigo),
        source_code: clean(question.codigo_fonte),
        material_name: clean(material.nome),
        original_number: Number(question.numero_original || question.numero) || 0,
        prompt: clean(question.enunciado),
        alternatives: question.alternativas || {},
        answer: clean(question.gabarito),
        notion_url: clean(question.notion_url),
      });
    }
  }
  if (questions.length !== EXPECTED.published) throw new Error(`Catálogo possui ${questions.length}; esperado ${EXPECTED.published}.`);
  const ids = questions.map(item => key(item.public_id));
  const codes = questions.map(item => key(item.code));
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('Catálogo contém ID ausente ou duplicado.');
  if (codes.some(code => !code) || new Set(codes).size !== codes.length) throw new Error('Catálogo contém código ausente ou duplicado.');
  return {raw, catalog, questions};
}

export async function writeJson(file, payload) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`);
}
