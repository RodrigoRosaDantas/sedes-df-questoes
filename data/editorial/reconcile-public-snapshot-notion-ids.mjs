import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const snapshotPath = path.join(root, 'data', 'notion', 'published.json');
const reconciliationPath = path.join(root, 'data', 'editorial', 'notion-trash-classified-20260804-public-reconciliation.json');
const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível.');

const clean = value => String(value ?? '').trim();
const key = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function request(endpoint, options = {}, attempt = 1) {
  const response = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
  });
  const text = await response.text();
  if (response.ok) return text ? JSON.parse(text) : {};
  if ((response.status === 429 || response.status >= 500) && attempt < 8) {
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 500 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${text.slice(0, 800)}`);
}

const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
const value = property => {
  if (!property) return null;
  if (property.type === 'title') return rich(property.title);
  if (property.type === 'rich_text') return rich(property.rich_text);
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  if (property.type === 'date') return property.date?.start ?? null;
  return null;
};

async function readActiveIdentities() {
  const parameters = new URLSearchParams();
  for (const property of ['Código', 'Código GitHub', 'Data da publicação', 'Duplicada']) {
    parameters.append('filter_properties[]', property);
  }
  const endpoint = `/data_sources/${SOURCE}/query?${parameters.toString()}`;
  const rows = [];
  let cursor;
  do {
    const body = {page_size: 100, result_type: 'page'};
    if (cursor) body.start_cursor = cursor;
    const page = await request(endpoint, {method: 'POST', body: JSON.stringify(body)});
    for (const item of page.results || []) {
      rows.push({
        notion_id: item.id,
        code: value(item.properties?.['Código']),
        github_id: value(item.properties?.['Código GitHub']),
        publication_date: value(item.properties?.['Data da publicação']),
        duplicated: value(item.properties?.Duplicada) === true,
        last_edited_time: item.last_edited_time || '',
      });
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

const [snapshot, rows] = await Promise.all([
  fs.readFile(snapshotPath, 'utf8').then(JSON.parse),
  readActiveIdentities(),
]);
const notionIdsBefore = new Set((snapshot.records || []).map(record => clean(record.notion_id)).filter(Boolean)).size;
const byId = new Map(rows.map(row => [row.notion_id, row]));
const byCode = new Map();
for (const row of rows) {
  const codeKey = key(row.code);
  if (!byCode.has(codeKey)) byCode.set(codeKey, []);
  byCode.get(codeKey).push(row);
}

const selected = new Set();
const methods = {notion_id: 0, github_id: 0, canonical_code: 0};
const unmatched = [];
for (const record of snapshot.records || []) {
  let row = null;
  let method = null;
  if (record.notion_id && byId.has(clean(record.notion_id)) && !selected.has(clean(record.notion_id))) {
    row = byId.get(clean(record.notion_id));
    method = 'notion_id';
  } else {
    const available = (byCode.get(key(record.code)) || []).filter(candidate => !selected.has(candidate.notion_id));
    row = available.find(candidate => clean(candidate.github_id) && clean(candidate.github_id) === clean(record.github_id)) || null;
    if (row) method = 'github_id';
    if (!row) {
      row = [...available].sort((left, right) => {
        const score = candidate => (candidate.duplicated ? 0 : 100)
          + (clean(candidate.github_id) ? 20 : 0)
          + (clean(candidate.publication_date) ? 20 : 0);
        return score(right) - score(left)
          || Date.parse(right.last_edited_time || 0) - Date.parse(left.last_edited_time || 0)
          || right.notion_id.localeCompare(left.notion_id);
      })[0] || null;
      if (row) method = 'canonical_code';
    }
  }
  if (!row) {
    unmatched.push({code: clean(record.code), notion_id: clean(record.notion_id), github_id: clean(record.github_id)});
    continue;
  }
  selected.add(row.notion_id);
  methods[method] += 1;
  record.notion_id = row.notion_id;
}

const afterIds = new Set((snapshot.records || []).map(record => clean(record.notion_id)).filter(Boolean));
const reconciliation = {
  schema_version: '1.0',
  operation_id: 'NOTION-TRASH-CLASSIFIED-20260804',
  created_at: new Date().toISOString(),
  public_records: (snapshot.records || []).length,
  notion_ids_before: notionIdsBefore,
  notion_ids_after: afterIds.size,
  selected_ids: selected.size,
  methods,
  unmatched_count: unmatched.length,
  unmatched: unmatched.slice(0, 200),
  canonical_notion_ids: [...selected].sort(),
};
await fs.writeFile(reconciliationPath, `${JSON.stringify(reconciliation, null, 2)}\n`);
if (unmatched.length || selected.size !== (snapshot.records || []).length || afterIds.size !== (snapshot.records || []).length) {
  throw new Error(`Reconciliação pública incompleta: selecionados ${selected.size}, IDs finais ${afterIds.size}/${(snapshot.records || []).length}; ausentes: ${JSON.stringify(unmatched.slice(0, 20))}`);
}
await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`✓ Identidades públicas reconciliadas no workspace: ${selected.size} registros (${JSON.stringify(methods)}).`);
