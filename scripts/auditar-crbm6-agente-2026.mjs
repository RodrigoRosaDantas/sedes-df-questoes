import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const MATERIAL = 'Agente Administrativo — CRBM-6 — Quadrix 2026';
const PREFIX = 'PROVA-QDX-CRBM6-2026-AGENTE-ADMINISTRATIVO-401-';
const OFFICIAL_SOURCE = 'https://quadrix.org.br/informacoes/3042/';
const OUT = path.join(root, 'artifacts/auditoria-crbm6-agente-2026');

if (!TOKEN) throw new Error('NOTION_TOKEN não disponível.');

const official = [
  'Certo','Errado','Errado','Certo','Certo','Errado','Errado','Certo','Certo','Certo',
  'Errado','Certo','Errado','Certo','Certo','Errado','Certo','Errado','Errado','Errado',
  'Certo','Errado','Errado','Certo','Errado','Certo','Errado','Certo','Errado','Certo',
  'Certo','Errado','Errado','Certo','Errado','Errado','Certo','Errado','Errado','Certo',
  'Errado','Errado','Certo','Errado','Certo','Certo','Certo','Errado','Errado','Errado',
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[\t\u00a0 ]+/g, ' ').replace(/ *\n */g, '\n').trim();

function value(property) {
  if (!property) return null;
  if (property.type === 'title') return rich(property.title);
  if (property.type === 'rich_text') return rich(property.rich_text);
  if (property.type === 'select') return property.select?.name ?? null;
  if (property.type === 'status') return property.status?.name ?? null;
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  if (property.type === 'number') return property.number;
  if (property.type === 'url') return property.url;
  if (property.type === 'date') return property.date?.start ?? null;
  if (property.type === 'formula') {
    const formula = property.formula;
    return formula ? formula[formula.type] ?? null : null;
  }
  return null;
}

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
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 500 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 800)}`);
}

async function readRows() {
  const rows = [];
  let cursor;
  do {
    const body = {
      page_size: 100,
      filter: {property: 'Nome do material', rich_text: {equals: MATERIAL}},
    };
    if (cursor) body.start_cursor = cursor;
    const page = await request(`/data_sources/${SOURCE}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    for (const item of page.results || []) {
      rows.push({
        notion_id: item.id,
        notion_url: item.url,
        created_time: item.created_time,
        last_edited_time: item.last_edited_time,
        ...Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)])),
      });
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows.sort((a, b) => Number(a['Número original']) - Number(b['Número original']));
}

const rows = await readRows();
const errors = [];
const gabaritoDivergences = [];
const missing = {
  url_fonte: [], assunto: [], subassunto: [], comentario: [], fundamento: [], pegadinha: [], observacoes: [],
};
const auditCounts = {};
const statusCounts = {};

if (rows.length !== 50) errors.push(`quantidade ${rows.length}/50`);
for (let index = 0; index < rows.length; index += 1) {
  const number = 71 + index;
  const row = rows[index];
  const code = `${PREFIX}${String(number).padStart(3, '0')}`;
  if (Number(row['Número original']) !== number) errors.push(`posição ${index + 1}: número ${row['Número original']}`);
  if (clean(row['Código']) !== code) errors.push(`item ${number}: código ${row['Código']}`);
  if (!clean(row['Enunciado'])) errors.push(`item ${number}: enunciado vazio`);
  if (row['Transcrição conferida'] !== true) errors.push(`item ${number}: transcrição não conferida`);
  if (row['Gabarito conferido — registro manual anterior'] !== true) errors.push(`item ${number}: gabarito manual não conferido`);
  if (clean(row['Gabarito']) !== official[index]) {
    gabaritoDivergences.push({number, banco: clean(row['Gabarito']), oficial: official[index]});
  }
  for (const [field, target] of [
    ['URL da fonte', 'url_fonte'], ['Assunto', 'assunto'], ['Subassunto', 'subassunto'],
    ['Comentário geral', 'comentario'], ['Fundamento legal', 'fundamento'], ['Pegadinha', 'pegadinha'], ['Observações', 'observacoes'],
  ]) {
    if (!clean(row[field])) missing[target].push(number);
  }
  const audit = clean(row['Auditoria de conteúdo']) || '(vazia)';
  auditCounts[audit] = (auditCounts[audit] || 0) + 1;
  const status = clean(row['Status editorial — registro manual anterior']) || '(vazio)';
  statusCounts[status] = (statusCounts[status] || 0) + 1;
}

const report = {
  generated_at: new Date().toISOString(),
  mode: 'read_only',
  material: MATERIAL,
  official_source: OFFICIAL_SOURCE,
  expected_scope: {from: 71, to: 120, count: 50, block: 'Conhecimentos Específicos'},
  counts: {
    rows: rows.length,
    gabarito_divergences: gabaritoDivergences.length,
    blocked: rows.filter(row => row['Bloqueio manual de publicação'] === true).length,
    released: rows.filter(row => row['Liberada para exportação'] === true).length,
    duplicated: rows.filter(row => row['Duplicada'] === true).length,
    annulled: rows.filter(row => row['Anulada'] === true || clean(row['Gabarito']) === 'Anulada').length,
    image_rows: rows.filter(row => row['Possui imagem'] === true).length,
  },
  audit_counts: auditCounts,
  status_counts: statusCounts,
  missing_fields: Object.fromEntries(Object.entries(missing).map(([key, numbers]) => [key, {count: numbers.length, numbers}])),
  gabarito_divergences: gabaritoDivergences,
  structural_errors: errors,
  rows,
};

await fs.mkdir(OUT, {recursive: true});
await fs.writeFile(path.join(OUT, 'notion-rows.json'), `${JSON.stringify(rows, null, 2)}\n`);
await fs.writeFile(path.join(OUT, 'auditoria.json'), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(OUT, 'resumo.json'), `${JSON.stringify({
  material: report.material,
  expected_scope: report.expected_scope,
  counts: report.counts,
  audit_counts: report.audit_counts,
  status_counts: report.status_counts,
  missing_counts: Object.fromEntries(Object.entries(report.missing_fields).map(([key, value]) => [key, value.count])),
  gabarito_divergences: report.gabarito_divergences,
  structural_errors: report.structural_errors,
}, null, 2)}\n`);

console.log(`AUDIT_RESULT=${JSON.stringify({
  rows: rows.length,
  structural_errors: errors.length,
  gabarito_divergences: gabaritoDivergences,
  audit_counts: auditCounts,
  missing_counts: Object.fromEntries(Object.entries(missing).map(([key, numbers]) => [key, numbers.length])),
})}`);
console.log(`AUDIT_ARTIFACT=${path.relative(root, OUT)}`);
if (errors.length) process.exitCode = 2;
