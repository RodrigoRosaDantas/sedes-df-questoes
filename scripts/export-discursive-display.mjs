import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'data', 'notion', 'discursive-display.json');
const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const DATABASE_URL = 'https://app.notion.com/p/a1d5fc8f8e434105861faba90dc156d9?v=85b47b4a2e17461e9d3482724b13fab8';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const PREFIXES = (process.env.DISCURSIVE_PREFIXES || [
  'PROVA-QDX-CRASP-2025-ANACOB-400-DISC-',
  'PROVA-QDX-CREMAM-2025-ASSADM-200-DISC-',
].join(','))
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

const EXPORT_PROPERTIES = [
  'Ano', 'Assunto', 'Auditoria de conteúdo', 'Bloco', 'Bloqueio manual de publicação',
  'Cargo', 'Código', 'Código do cargo', 'Dificuldade', 'Disciplina', 'Duplicada',
  'Enunciado', 'Fonte / Banca', 'Formato da questão', 'Fundamento legal',
  'Nome do material', 'Número original', 'Observações', 'Órgão', 'Página do PDF',
  'Pegadinha', 'Questão', 'Subassunto', 'Texto-base', 'Tipo de material',
  'Transcrição conferida', 'URL da fonte',
];
const queryParameters = new URLSearchParams();
for (const property of EXPORT_PROPERTIES) queryParameters.append('filter_properties[]', property);
const QUERY_ENDPOINT = `/data_sources/${SOURCE}/query?${queryParameters.toString()}`;

if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível neste repositório.');

const clean = value => String(value ?? '')
  .replace(/\r/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .trim();
const key = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

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
  return null;
}

async function readAllDiscursiveRows() {
  const rows = [];
  let cursor;
  do {
    const body = {
      page_size: 100,
      result_type: 'page',
      filter: {
        property: 'Formato da questão',
        select: {equals: 'Discursiva'},
      },
    };
    if (cursor) body.start_cursor = cursor;
    const page = await request(QUERY_ENDPOINT, {method: 'POST', body: JSON.stringify(body)});
    for (const item of page.results || []) {
      const properties = Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)]));
      rows.push({notion_id: item.id, notion_url: item.url, ...properties});
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

function eligible(row) {
  const code = clean(row['Código']);
  return PREFIXES.some(prefix => code.startsWith(prefix))
    && key(row['Formato da questão']) === key('Discursiva')
    && ['aprovada', 'ajustada'].includes(key(row['Auditoria de conteúdo']))
    && row['Transcrição conferida'] === true
    && row['Duplicada'] !== true
    && row['Bloqueio manual de publicação'] !== true
    && Boolean(clean(row['Enunciado']))
    && Boolean(clean(row['Comentário geral']));
}

function record(row) {
  return {
    notion_id: row.notion_id,
    notion_url: row.notion_url,
    code: clean(row['Código']),
    title: clean(row['Questão']),
    material_name: clean(row['Nome do material']),
    material_type: clean(row['Tipo de material']),
    year: Number(row['Ano']) || null,
    organization: clean(row['Órgão']),
    cargo: clean(row['Cargo']),
    cargo_code: clean(row['Código do cargo']),
    discipline: clean(row['Disciplina']),
    subject: clean(row['Assunto']),
    subsubject: clean(row['Subassunto']),
    block: clean(row['Bloco']),
    source_board: clean(row['Fonte / Banca']),
    source_url: clean(row['URL da fonte']),
    format: 'Discursiva',
    original_number: Number(row['Número original']) || null,
    text_base: clean(row['Texto-base']),
    prompt: clean(row['Enunciado']),
    guidance: clean(row['Comentário geral']),
    foundation: clean(row['Fundamento legal']),
    trap: clean(row['Pegadinha']),
    observations: clean(row['Observações']),
    difficulty: clean(row['Dificuldade']),
    pdf_page: clean(row['Página do PDF']),
    display_only: true,
  };
}

const rows = await readAllDiscursiveRows();
const records = rows
  .filter(eligible)
  .map(record)
  .sort((left, right) => left.material_name.localeCompare(right.material_name, 'pt-BR')
    || Number(left.original_number) - Number(right.original_number)
    || left.code.localeCompare(right.code));

if (records.length !== 2) {
  throw new Error(`Esperadas exatamente 2 discursivas revisadas para visualização; encontradas ${records.length}.`);
}
for (const item of records) {
  if (!item.code || !item.material_name || !item.prompt || !item.guidance) {
    throw new Error(`Discursiva incompleta para visualização: ${item.code || item.notion_url}.`);
  }
}

const payload = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  source: {
    name: 'Banco Mestre — Provas e Simulados SEDES/DF',
    database_url: DATABASE_URL,
    data_source_id: SOURCE,
    mode: 'display_only',
    prefixes: PREFIXES,
  },
  total: records.length,
  records,
};

await fs.mkdir(path.dirname(output), {recursive: true});
await fs.writeFile(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`✓ Discursivas para visualização exportadas: ${records.length}.`);
