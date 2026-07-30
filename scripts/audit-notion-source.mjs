import fs from 'node:fs/promises';

const TOKEN = process.env.NOTION_TOKEN;
const DATA_SOURCE_ID = '784234ae-deca-4514-b60d-19524e122a89';
const API_VERSION = '2026-03-11';
const API = 'https://api.notion.com/v1';

if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível neste repositório.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(path, options = {}, attempt = 1) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': API_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (response.ok) return response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 6) {
    const retryAfter = Number(response.headers.get('retry-after') || 0);
    await sleep(Math.max(retryAfter * 1000, 500 * 2 ** (attempt - 1)));
    return request(path, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 500)}`);
}

function plain(rich = []) {
  return rich.map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
}

function value(property) {
  if (!property) return null;
  switch (property.type) {
    case 'title': return plain(property.title);
    case 'rich_text': return plain(property.rich_text);
    case 'select': return property.select?.name ?? null;
    case 'status': return property.status?.name ?? null;
    case 'multi_select': return (property.multi_select || []).map(item => item.name);
    case 'checkbox': return Boolean(property.checkbox);
    case 'number': return property.number;
    case 'url': return property.url;
    case 'email': return property.email;
    case 'phone_number': return property.phone_number;
    case 'date': return property.date?.start ?? null;
    case 'created_time': return property.created_time;
    case 'last_edited_time': return property.last_edited_time;
    case 'unique_id': return property.unique_id ? `${property.unique_id.prefix || ''}${property.unique_id.number}` : null;
    case 'formula': {
      const formula = property.formula;
      if (!formula) return null;
      if (formula.type === 'string') return formula.string;
      if (formula.type === 'boolean') return formula.boolean;
      if (formula.type === 'number') return formula.number;
      if (formula.type === 'date') return formula.date?.start ?? null;
      return null;
    }
    default: return null;
  }
}

function countValues(rows, name) {
  const counts = new Map();
  for (const row of rows) {
    const raw = row[name];
    const key = Array.isArray(raw) ? raw.join(' | ') : String(raw ?? '(vazio)');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

const schema = await request(`/data_sources/${DATA_SOURCE_ID}`);
const rows = [];
let cursor;
let pageNumber = 0;

do {
  const body = { page_size: 100 };
  if (cursor) body.start_cursor = cursor;
  const page = await request(`/data_sources/${DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  pageNumber += 1;
  for (const item of page.results || []) {
    const normalized = Object.fromEntries(
      Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)]),
    );
    rows.push({
      id: item.id,
      url: item.url,
      archived: Boolean(item.archived || item.in_trash),
      ...normalized,
    });
  }
  console.log(`Lote ${pageNumber}: ${page.results?.length || 0} registros; acumulado ${rows.length}.`);
  cursor = page.has_more ? page.next_cursor : null;
} while (cursor);

const keys = ['Código', 'Questão', 'Pode publicar', 'Status editorial', 'Auditoria efetiva', 'Auditoria de conteúdo', 'Gabarito conferido', 'Integridade essencial', 'Validação formal do gabarito', 'Duplicada', 'Anulada', 'Formato da questão', 'Tipo de material'];
const distributions = Object.fromEntries(keys.map(name => [name, countValues(rows, name)]));
const duplicateCodes = [...rows.reduce((map, row) => {
  const code = String(row['Código'] || '').trim();
  if (code) map.set(code, (map.get(code) || 0) + 1);
  return map;
}, new Map()).entries()].filter(([, count]) => count > 1);
const missing = {
  codigo: rows.filter(row => !String(row['Código'] || '').trim()).length,
  questao: rows.filter(row => !String(row['Questão'] || '').trim()).length,
  enunciado: rows.filter(row => !String(row['Enunciado'] || '').trim()).length,
  gabarito: rows.filter(row => !String(row['Gabarito'] || '').trim()).length,
  comentario: rows.filter(row => !String(row['Comentário geral'] || '').trim()).length,
};

const report = {
  generated_at: new Date().toISOString(),
  api_version: API_VERSION,
  data_source_id: DATA_SOURCE_ID,
  data_source_name: schema.title?.map?.(item => item.plain_text).join('') || 'Banco Mestre — Provas e Simulados SEDES/DF',
  total: rows.length,
  schema_properties: Object.keys(schema.properties || {}).sort(),
  missing,
  duplicate_codes: duplicateCodes,
  distributions,
};

await fs.writeFile('/tmp/notion-audit.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`Banco Mestre lido integralmente: ${rows.length} registros.`);
console.log(`Campos vazios: ${JSON.stringify(missing)}.`);
console.log(`Códigos duplicados: ${duplicateCodes.length}.`);
for (const name of keys) console.log(`${name}: ${JSON.stringify(distributions[name])}`);
