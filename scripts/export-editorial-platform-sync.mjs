import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'data', 'editorial-runtime', 'platform-sync-2026-08-01.json');
const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const OPERATION_ID = 'PLATFORM-EDITORIAL-SYNC-2026-08-01';
const CREFITO_PREFIX = 'PROVA-QDX-CREFITO17-2026-AUXILIAR-ADMINISTRATIVO-200-';
const CRFDF_PREFIX = 'PROVA-QDX-CRFDF-2026-ASSISTENTE-I-200-';
const CRFDF_NUMBERS = new Set([
  ...Array.from({length: 16}, (_, index) => 74 + index),
  ...Array.from({length: 29}, (_, index) => 92 + index),
]);
const PROPERTIES = [
  'Anulada', 'Auditoria de conteúdo', 'Código', 'Código GitHub', 'Comentário geral',
  'Data da revisão', 'Duplicada', 'Fundamento legal', 'Nome do material', 'Número original',
  'Pegadinha', 'Subassunto', 'URL da fonte',
];

if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível para exportar o saneamento editorial.');

const clean = value => String(value ?? '')
  .replace(/\r/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .trim();
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
  if ((response.status === 429 || response.status >= 500) && attempt < 7) {
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 500 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 600)}`);
}

const queryParameters = new URLSearchParams();
for (const property of PROPERTIES) queryParameters.append('filter_properties[]', property);
const endpoint = `/data_sources/${SOURCE}/query?${queryParameters.toString()}`;
const rows = [];
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
    if (!code.startsWith(CREFITO_PREFIX) && !code.startsWith(CRFDF_PREFIX)) continue;
    rows.push({notion_url: item.url, ...properties});
  }
  cursor = page.has_more ? page.next_cursor : null;
} while (cursor);

const candidates = rows.filter(row => row['Duplicada'] !== true
  && row['Anulada'] !== true
  && clean(row['Código GitHub']));
const byCode = new Map();
for (const row of candidates) {
  const code = clean(row['Código']);
  if (byCode.has(code)) throw new Error(`${code}: mais de um registro publicado e não duplicado no Banco Mestre.`);
  byCode.set(code, row);
}

const corrections = [];
for (let number = 1; number <= 120; number += 1) {
  const code = `${CREFITO_PREFIX}${String(number).padStart(3, '0')}`;
  const row = byCode.get(code);
  if (!row) throw new Error(`${code}: registro saneado não localizado como publicado no Banco Mestre.`);
  const comment = clean(row['Comentário geral']);
  const foundation = clean(row['Fundamento legal']);
  const subsubject = clean(row['Subassunto']);
  const trap = clean(row['Pegadinha']);
  const sourceUrl = clean(row['URL da fonte']);
  const audit = clean(row['Auditoria de conteúdo']);
  const reviewedAt = clean(row['Data da revisão']);
  if (!comment || /comentário não disponível/i.test(comment)) throw new Error(`${code}: comentário editorial efetivo ausente.`);
  if (!foundation || !subsubject || !trap || !sourceUrl) throw new Error(`${code}: saneamento editorial incompleto no Banco Mestre.`);
  if (!['Aprovada', 'Ajustada'].includes(audit)) throw new Error(`${code}: auditoria editorial inválida: ${audit || 'vazia'}.`);
  if (reviewedAt !== '2026-08-01') throw new Error(`${code}: data de revisão divergente: ${reviewedAt || 'vazia'}.`);
  corrections.push({
    code,
    scope: 'full_editorial',
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

for (const number of [...CRFDF_NUMBERS].sort((left, right) => left - right)) {
  const code = `${CRFDF_PREFIX}${String(number).padStart(3, '0')}`;
  const row = byCode.get(code);
  if (!row) throw new Error(`${code}: registro saneado não localizado como publicado no Banco Mestre.`);
  const foundation = clean(row['Fundamento legal']);
  if (!foundation.startsWith('Fundamento teórico — elaboração editorial')) {
    throw new Error(`${code}: fundamento não corresponde ao saneamento editorial autorizado.`);
  }
  corrections.push({
    code,
    scope: 'foundation_only',
    foundation,
    reviewed_at: '2026-08-01',
    notion_url: row.notion_url,
  });
}

const codes = new Set(corrections.map(item => item.code));
if (corrections.length !== 165 || codes.size !== 165) {
  throw new Error(`Saneamento exportado com ${corrections.length} registros e ${codes.size} códigos; esperado 165/165.`);
}

const payload = {
  schema_version: '1.0',
  operation_id: OPERATION_ID,
  generated_at: new Date().toISOString(),
  source: {
    data_source_id: SOURCE,
    rule: 'Somente os 120 itens do Auxiliar Administrativo CREFITO-17 e os 45 fundamentos CRF-DF efetivamente saneados em 01/08/2026.',
  },
  summary: {
    expected: 165,
    full_editorial: 120,
    foundation_only: 45,
  },
  corrections,
};
await fs.mkdir(path.dirname(output), {recursive: true});
await fs.writeFile(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`✓ Saneamento editorial exportado: ${corrections.length} registros (120 completos e 45 fundamentos).`);
