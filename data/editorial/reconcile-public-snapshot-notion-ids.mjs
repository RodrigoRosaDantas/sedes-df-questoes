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
const EXPECTED_PUBLIC = 2871;
const EXPECTED_EXCESS = 46;
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
const trustedSnapshotIds = new Set((snapshot.records || []).map(record => clean(record.notion_id)).filter(Boolean));
const traced = rows.filter(row => clean(row.github_id) && clean(row.publication_date));
const withoutCode = traced.filter(row => !clean(row.code));
if (withoutCode.length) throw new Error(`${withoutCode.length} linha(s) rastreadas estão sem Código.`);

const groups = new Map();
for (const row of traced) {
  const codeKey = key(row.code);
  if (!groups.has(codeKey)) groups.set(codeKey, []);
  groups.get(codeKey).push(row);
}
const selected = new Set();
const excess = [];
const methods = {trusted_snapshot_id: 0, canonical_code: 0};
for (const candidates of groups.values()) {
  const trusted = candidates.filter(row => trustedSnapshotIds.has(row.notion_id));
  if (trusted.length > 1) {
    throw new Error(`Mais de uma linha confiável para o código ${candidates[0].code}.`);
  }
  const canonical = trusted[0] || [...candidates].sort((left, right) => {
    const score = candidate => (candidate.duplicated ? 0 : 100)
      + (clean(candidate.github_id) ? 20 : 0)
      + (clean(candidate.publication_date) ? 20 : 0);
    return score(right) - score(left)
      || Date.parse(right.last_edited_time || 0) - Date.parse(left.last_edited_time || 0)
      || right.notion_id.localeCompare(left.notion_id);
  })[0];
  selected.add(canonical.notion_id);
  methods[trusted[0] ? 'trusted_snapshot_id' : 'canonical_code'] += 1;
  excess.push(...candidates.filter(row => row.notion_id !== canonical.notion_id));
}

const reconciliation = {
  schema_version: '1.1',
  operation_id: 'NOTION-TRASH-CLASSIFIED-20260804',
  created_at: new Date().toISOString(),
  active_rows: rows.length,
  traced_rows: traced.length,
  unique_traced_codes: groups.size,
  public_records: groups.size,
  trusted_snapshot_ids: trustedSnapshotIds.size,
  selected_ids: selected.size,
  excess_rows: excess.length,
  methods,
  unmatched_count: 0,
  unmatched: [],
  canonical_notion_ids: [...selected].sort(),
  excess_notion_ids: excess.map(row => row.notion_id).sort(),
};
await fs.writeFile(reconciliationPath, `${JSON.stringify(reconciliation, null, 2)}\n`);
if (traced.length !== EXPECTED_PUBLIC + EXPECTED_EXCESS
  || groups.size !== EXPECTED_PUBLIC
  || selected.size !== EXPECTED_PUBLIC
  || excess.length !== EXPECTED_EXCESS) {
  throw new Error(`Reconciliação divergente: ${JSON.stringify({traced: traced.length, unique_codes: groups.size, selected: selected.size, excess: excess.length})}`);
}
console.log(`✓ Catálogo canônico reconciliado: ${selected.size} linhas públicas e ${excess.length} excedentes históricos.`);
