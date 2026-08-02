import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'data', 'editorial-runtime', 'pedagogia-sync-2026-08-02.json');
const token = process.env.NOTION_TOKEN;
const source = '784234ae-deca-4514-b60d-19524e122a89';
const api = 'https://api.notion.com/v1';
const notionVersion = '2026-03-11';
const operationId = 'PLATFORM-EDITORIAL-SYNC-PEDAGOGIA-2026-08-02';
const prefix = 'PROVA-QDX-SEEDF-2025-PED-A-';
const expectedGithubCode = 'release-2.13.0:8a528d925807db558967a3ff0a956006e87356a5';
const expectedNumbers = [
  ...Array.from({length: 60}, (_, index) => 47 + index),
  ...Array.from({length: 12}, (_, index) => 109 + index),
];
const propertiesToRead = [
  'Anulada', 'Auditoria de conteúdo', 'Código', 'Código GitHub', 'Comentário geral',
  'Data da revisão', 'Duplicada', 'Fundamento legal', 'Nome do material', 'Número original',
  'Pegadinha', 'Status editorial — registro manual anterior', 'Subassunto', 'URL da fonte',
];

if (!token) throw new Error('NOTION_TOKEN não está disponível para exportar o saneamento de Pedagogia.');
const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();

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
  return null;
}

async function request(endpoint, options = {}, attempt = 1) {
  const response = await fetch(`${api}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': notionVersion,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (response.ok) return response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 8) {
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 500 * (2 ** (attempt - 1))));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 700)}`);
}

const query = new URLSearchParams();
for (const property of propertiesToRead) query.append('filter_properties[]', property);
const endpoint = `/data_sources/${source}/query?${query.toString()}`;
const byCode = new Map();
let cursor;
do {
  const body = {page_size: 100, result_type: 'page'};
  if (cursor) body.start_cursor = cursor;
  const page = await request(endpoint, {method: 'POST', body: JSON.stringify(body)});
  for (const item of page.results || []) {
    const properties = Object.fromEntries(
      Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)]),
    );
    const code = clean(properties['Código']);
    if (!code.startsWith(prefix)) continue;
    if (properties.Duplicada === true || properties.Anulada === true) continue;
    if (byCode.has(code)) throw new Error(`${code}: mais de um registro canônico localizado.`);
    byCode.set(code, {notion_url: item.url, ...properties});
  }
  cursor = page.has_more ? page.next_cursor : null;
} while (cursor);

const corrections = [];
for (const number of expectedNumbers) {
  const code = `${prefix}${String(number).padStart(3, '0')}`;
  const row = byCode.get(code);
  if (!row) throw new Error(`${code}: registro saneado não localizado no Banco Mestre.`);
  if (clean(row['Código GitHub']) !== expectedGithubCode) throw new Error(`${code}: Código GitHub divergente.`);
  if (clean(row['Status editorial — registro manual anterior']) !== 'Publicada') throw new Error(`${code}: estado publicado não confirmado.`);
  if (Number(row['Número original']) !== number) throw new Error(`${code}: número original divergente.`);
  const comment = clean(row['Comentário geral']);
  const foundation = clean(row['Fundamento legal']);
  const subsubject = clean(row.Subassunto);
  const trap = clean(row.Pegadinha);
  const sourceUrl = clean(row['URL da fonte']);
  const audit = clean(row['Auditoria de conteúdo']);
  const reviewedAt = clean(row['Data da revisão']);
  if (!comment || /comentário não disponível/i.test(comment)) throw new Error(`${code}: comentário editorial efetivo ausente.`);
  if (!foundation || !subsubject || !trap || !sourceUrl) throw new Error(`${code}: saneamento editorial incompleto.`);
  if (audit !== 'Ajustada') throw new Error(`${code}: auditoria deve estar Ajustada; recebeu ${audit || 'vazia'}.`);
  if (reviewedAt !== '2026-08-02') throw new Error(`${code}: data de revisão divergente: ${reviewedAt || 'vazia'}.`);
  corrections.push({
    code,
    number,
    comment,
    foundation,
    subsubject,
    trap,
    source_url: sourceUrl,
    audit,
    reviewed_at: reviewedAt,
    notion_url: row.notion_url,
  });
}

const uniqueCodes = new Set(corrections.map(item => item.code));
if (corrections.length !== 72 || uniqueCodes.size !== 72) {
  throw new Error(`Exportação contém ${corrections.length} registros e ${uniqueCodes.size} códigos; esperado 72/72.`);
}

const payload = {
  schema_version: '1.0',
  operation_id: operationId,
  generated_at: new Date().toISOString(),
  source: {
    data_source_id: source,
    material: 'Professor de Educação Básica — Pedagogia — SEEDF/DF — Quadrix 2025 — Tipo A',
    rule: 'Somente os 72 códigos publicados e efetivamente saneados em 02/08/2026.',
  },
  summary: {expected: 72, full_editorial: 72},
  corrections,
};
await fs.mkdir(path.dirname(output), {recursive: true});
await fs.writeFile(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`✓ Saneamento de Pedagogia exportado: ${corrections.length} registros completos.`);
