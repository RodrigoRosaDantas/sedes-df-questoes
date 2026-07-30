import fs from 'node:fs/promises';

const TOKEN = process.env.NOTION_TOKEN;
const DATA_SOURCE_ID = '784234ae-deca-4514-b60d-19524e122a89';
const API_VERSION = '2026-03-11';
const API = 'https://api.notion.com/v1';

if (!TOKEN) throw new Error('NOTION_TOKEN não configurado neste repositório.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function notion(path, options = {}, attempt = 1) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': API_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if ((response.status === 429 || response.status >= 500) && attempt < 7) {
    const retryAfter = Number(response.headers.get('retry-after') || 0);
    await sleep(Math.max(retryAfter * 1000, 500 * 2 ** (attempt - 1)));
    return notion(path, options, attempt + 1);
  }

  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`Notion ${response.status}: ${body.message || text || 'falha sem detalhe'}`);
  return body;
}

function plainRichText(items = []) {
  return items.map(item => item?.plain_text || item?.text?.content || '').join('').trim();
}

function propertyValue(property) {
  if (!property || typeof property !== 'object') return null;
  switch (property.type) {
    case 'title': return plainRichText(property.title);
    case 'rich_text': return plainRichText(property.rich_text);
    case 'number': return property.number;
    case 'checkbox': return Boolean(property.checkbox);
    case 'select': return property.select?.name || '';
    case 'status': return property.status?.name || '';
    case 'multi_select': return (property.multi_select || []).map(item => item.name);
    case 'date': return property.date?.start || '';
    case 'url': return property.url || '';
    case 'formula': {
      const value = property.formula || {};
      if (value.type === 'boolean') return Boolean(value.boolean);
      if (value.type === 'string') return value.string || '';
      if (value.type === 'number') return value.number;
      if (value.type === 'date') return value.date?.start || '';
      return null;
    }
    case 'unique_id': return property.unique_id ? `${property.unique_id.prefix || ''}${property.unique_id.number ?? ''}` : '';
    default: return null;
  }
}

function countBy(rows, property) {
  const result = {};
  for (const row of rows) {
    const value = row[property];
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      const key = item === true ? 'true' : item === false ? 'false' : String(item || 'Não informado');
      result[key] = (result[key] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(result).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

const schema = await notion(`/data_sources/${DATA_SOURCE_ID}`);
const pages = [];
let cursor;
let requests = 0;

do {
  const response = await notion(`/data_sources/${DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
  });
  requests++;
  pages.push(...response.results.filter(item => item.object === 'page'));
  cursor = response.has_more ? response.next_cursor : null;
} while (cursor);

const rows = pages.map(page => Object.fromEntries(
  Object.entries(page.properties || {}).map(([name, value]) => [name, propertyValue(value)]),
));

const watched = [
  'Pode publicar',
  'Integridade essencial',
  'Gabarito conferido',
  'Auditoria efetiva',
  'Status editorial',
  'Auditoria de conteúdo',
  'Duplicada',
  'Anulada',
  'Formato da questão',
  'Fonte / Banca',
];

const distributions = Object.fromEntries(
  watched.filter(name => schema.properties?.[name]).map(name => [name, countBy(rows, name)]),
);

const booleanPublishable = rows.filter(row => row['Pode publicar'] === true).length;
const textPublishable = rows.filter(row => /^(sim|aprovad[ao]|publicar|publicável|liberad[ao]|ok)$/i.test(String(row['Pode publicar'] || '').trim())).length;
const candidates = Math.max(booleanPublishable, textPublishable);
const codes = rows.map(row => String(row['Código'] || '').trim()).filter(Boolean);
const uniqueCodes = new Set(codes);
const duplicateCodes = codes.length - uniqueCodes.size;

const report = {
  generated_at: new Date().toISOString(),
  source: {
    name: schema.title?.map?.(item => item.plain_text).join('') || 'Banco Mestre — Provas e Simulados SEDES/DF',
    data_source_id: DATA_SOURCE_ID,
    notion_api_version: API_VERSION,
  },
  totals: {
    pages: pages.length,
    requests,
    properties: Object.keys(schema.properties || {}).length,
    publishable_by_formula: candidates,
    codes_filled: codes.length,
    unique_codes: uniqueCodes.size,
    duplicate_codes: duplicateCodes,
  },
  distributions,
  validation: {
    urls_unique: new Set(pages.map(page => page.url)).size === pages.length,
    page_ids_unique: new Set(pages.map(page => page.id)).size === pages.length,
    total_processed_matches_total_read: rows.length === pages.length,
  },
};

await fs.mkdir('data/audit', { recursive: true });
await fs.writeFile('data/audit/notion-source-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (!report.validation.urls_unique || !report.validation.page_ids_unique || !report.validation.total_processed_matches_total_read) {
  throw new Error('A auditoria encontrou ausências ou duplicidades técnicas na leitura do Notion.');
}
