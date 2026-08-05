import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'data', 'notion', 'published.json');
const catalogPath = path.join(root, 'data', 'release', 'catalogo.json');
const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const DATABASE_URL = 'https://app.notion.com/p/a1d5fc8f8e434105861faba90dc156d9?v=85b47b4a2e17461e9d3482724b13fab8';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const DISPLAY_ONLY_COUNT = 2;
const TARGETS = [
  {
    prefix: 'PROVA-QDX-CRASP-2025-ANACOB-400-',
    material: 'Analista I — Atendimento e Cobrança — CRA-SP — Quadrix 2025',
    lot: 'QDX-2025-CRASP-ANACOB-001-050-20260805',
  },
  {
    prefix: 'PROVA-QDX-CREMAM-2025-ASSADM-200-',
    material: 'Assistente Administrativo — CREMAM — Quadrix 2025',
    lot: 'QDX-2025-CREMAM-ASSADM-001-050-20260805',
  },
];

const EXPORT_PROPERTIES = [
  'Alternativa A', 'Alternativa B', 'Alternativa C', 'Alternativa D', 'Alternativa E',
  'Ano', 'Anulada', 'Assunto', 'Auditoria de conteúdo', 'Bloco', 'Bloqueio manual de publicação', 'Cargo',
  'Comentário A', 'Comentário B', 'Comentário C', 'Comentário D', 'Comentário E',
  'Comentário geral', 'Código', 'Código GitHub', 'Código do cargo', 'Descrição da imagem',
  'Disciplina', 'Duplicada', 'Enunciado', 'Fonte / Banca', 'Formato da questão',
  'Fundamento legal', 'Gabarito', 'Gabarito conferido — registro manual anterior',
  'Liberada para exportação', 'Lote de publicação', 'Nome do material', 'Número original',
  'Observações', 'Órgão', 'Página do PDF', 'Pegadinha', 'Pode publicar', 'Possui imagem',
  'Questão', 'Status editorial — registro manual anterior', 'Subassunto', 'Texto-base',
  'Tipo de material', 'Transcrição conferida', 'URL da fonte',
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
  if (property.type === 'date') return property.date?.start ?? null;
  if (property.type === 'formula') {
    const formula = property.formula;
    if (!formula) return null;
    if (formula.type === 'string') return formula.string;
    if (formula.type === 'boolean') return formula.boolean;
    if (formula.type === 'number') return formula.number;
    if (formula.type === 'date') return formula.date?.start ?? null;
  }
  return null;
}

async function readAll() {
  const rows = [];
  let cursor;
  let batches = 0;
  do {
    const body = {page_size: 100, result_type: 'page'};
    if (cursor) body.start_cursor = cursor;
    const page = await request(QUERY_ENDPOINT, {method: 'POST', body: JSON.stringify(body)});
    for (const item of page.results || []) {
      const properties = Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)]));
      rows.push({
        notion_id: item.id,
        notion_url: item.url,
        notion_created_time: item.created_time || null,
        notion_last_edited_time: item.last_edited_time || null,
        ...properties,
      });
    }
    batches += 1;
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  console.log(`Banco Mestre: ${rows.length} registros lidos em ${batches} lotes; somente os dois lotes Quadrix serão exportados.`);
  return rows;
}

function record(row) {
  const declaredFormat = clean(row['Formato da questão']);
  const answer = clean(row['Gabarito']);
  const alternatives = {
    A: clean(row['Alternativa A']),
    B: clean(row['Alternativa B']),
    C: clean(row['Alternativa C']),
    D: clean(row['Alternativa D']),
    E: clean(row['Alternativa E']),
  };
  return {
    notion_id: row.notion_id,
    notion_url: row.notion_url,
    notion_last_edited_time: row.notion_last_edited_time,
    code: clean(row['Código']),
    github_id: clean(row['Código GitHub']),
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
    format: declaredFormat || 'Múltipla escolha A–E',
    format_inference: 'formato_declarado',
    original_number: Number(row['Número original']) || null,
    text_base: clean(row['Texto-base']),
    prompt: clean(row['Enunciado']),
    alternatives,
    answer,
    comment: clean(row['Comentário geral']),
    alternative_comments: {
      A: clean(row['Comentário A']),
      B: clean(row['Comentário B']),
      C: clean(row['Comentário C']),
      D: clean(row['Comentário D']),
      E: clean(row['Comentário E']),
    },
    foundation: clean(row['Fundamento legal']),
    trap: clean(row['Pegadinha']),
    observations: clean(row['Observações']),
    annulled: Boolean(row['Anulada']),
    has_image: Boolean(row['Possui imagem']),
    image_description: clean(row['Descrição da imagem']),
    pdf_page: clean(row['Página do PDF']),
    publication_lot: clean(row['Lote de publicação']),
    released_for_export: Boolean(row['Liberada para exportação']),
  };
}

function targetFor(row) {
  const code = clean(row['Código']);
  if (code.includes('-DISC-')) return null;
  return TARGETS.find(target => code.startsWith(target.prefix)) || null;
}

function validateAnnulledException(row, code) {
  if (row['Anulada'] !== true || clean(row['Gabarito']) !== 'Anulada') {
    throw new Error(`${code}: exceção de anulação sem marcação e gabarito compatíveis.`);
  }
  if (!['Aprovada', 'Ajustada'].includes(clean(row['Auditoria de conteúdo']))) {
    throw new Error(`${code}: questão anulada sem auditoria editorial concluída.`);
  }
  if (row['Gabarito conferido — registro manual anterior'] !== true) {
    throw new Error(`${code}: questão anulada sem conferência manual do gabarito definitivo.`);
  }
  if (!['Pronta para publicar', 'Revisada'].includes(clean(row['Status editorial — registro manual anterior']))) {
    throw new Error(`${code}: questão anulada sem status editorial compatível com publicação.`);
  }
}

const all = await readAll();
const selectedRows = all.filter(row => targetFor(row));
if (selectedRows.length !== 100) throw new Error(`Esperadas 100 objetivas dos dois lotes; encontradas ${selectedRows.length}.`);

const selectedCodes = new Set();
let annulledExceptions = 0;
for (const target of TARGETS) {
  const rows = selectedRows.filter(row => targetFor(row)?.prefix === target.prefix);
  if (rows.length !== 50) throw new Error(`${target.prefix}: esperadas 50 objetivas; encontradas ${rows.length}.`);
  const numbers = rows.map(row => Number(row['Número original'])).sort((a, b) => a - b);
  if (numbers.some((number, index) => number !== index + 1)) throw new Error(`${target.prefix}: numeração original não fecha em 001–050.`);
  for (const row of rows) {
    const code = clean(row['Código']);
    const annulled = row['Anulada'] === true || clean(row['Gabarito']) === 'Anulada';
    if (selectedCodes.has(key(code))) throw new Error(`Código repetido no escopo: ${code}.`);
    selectedCodes.add(key(code));
    if (clean(row['Nome do material']) !== target.material) throw new Error(`${code}: material divergente.`);
    if (clean(row['Lote de publicação']) !== target.lot) throw new Error(`${code}: lote divergente.`);
    if (annulled) {
      validateAnnulledException(row, code);
      annulledExceptions += 1;
    } else if (row['Pode publicar'] !== true) {
      throw new Error(`${code}: Pode publicar não estava verdadeiro no snapshot.`);
    }
    if (row['Liberada para exportação'] !== true) throw new Error(`${code}: não estava liberada para exportação.`);
    if (row['Duplicada'] === true || row['Bloqueio manual de publicação'] === true) throw new Error(`${code}: bloqueio editorial presente.`);
    if (clean(row['Código GitHub'])) throw new Error(`${code}: já possui recibo GitHub e não pode entrar como adição nova.`);
    if (clean(row['Formato da questão']) !== 'Múltipla escolha A–E') throw new Error(`${code}: formato objetivo divergente.`);
  }
}
if (annulledExceptions !== 2) throw new Error(`Esperadas exatamente 2 exceções anuladas; encontradas ${annulledExceptions}.`);

const records = selectedRows
  .map(record)
  .sort((left, right) => left.material_name.localeCompare(right.material_name, 'pt-BR')
    || Number(left.original_number) - Number(right.original_number)
    || left.code.localeCompare(right.code));

for (const item of records) {
  for (const [valueToCheck, label] of [
    [item.code, 'Código'], [item.title, 'Questão'], [item.material_name, 'Material'],
    [item.prompt, 'Enunciado'], [item.answer, 'Gabarito'], [item.comment, 'Comentário geral'],
  ]) if (!valueToCheck) throw new Error(`${item.code || item.notion_url}: ${label} ausente.`);
  for (const letter of ['A', 'B', 'C', 'D', 'E']) {
    if (!item.alternatives[letter]) throw new Error(`${item.code}: alternativa ${letter} ausente.`);
    if (!item.alternative_comments[letter]) throw new Error(`${item.code}: comentário ${letter} ausente.`);
  }
  if (!['A', 'B', 'C', 'D', 'E', 'Anulada'].includes(item.answer)) throw new Error(`${item.code}: gabarito inválido.`);
}

const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
const existingPublic = Object.keys(catalog.question_index || {}).length;
const pending = all.length - existingPublic - records.length - DISPLAY_ONLY_COUNT;
if (existingPublic <= 0 || pending < 0) throw new Error(`Decomposição incremental inválida: banco=${all.length}, públicos=${existingPublic}, novas=${records.length}, consulta=${DISPLAY_ONLY_COUNT}, pendentes=${pending}.`);

const sortedCodes = records.map(item => item.code).sort((left, right) => left.localeCompare(right, 'pt-BR'));
const payload = {
  schema_version: '1.3',
  scope_mode: 'additions',
  source: {
    name: 'Banco Mestre — Provas e Simulados SEDES/DF',
    database_url: DATABASE_URL,
    data_source_id: SOURCE,
    publication_rule: 'Adição imutável restrita aos dois lotes Quadrix; release pública existente preservada integralmente; duas anuladas exportadas por exceção editorial explícita',
  },
  publication_scope: {
    operation: 'QDX-CRASP-CREMAM-100-20260805',
    codes: sortedCodes,
    lots: TARGETS.map(target => target.lot),
    annulled_exceptions: records.filter(item => item.annulled).map(item => item.code),
  },
  totals: {
    all: all.length,
    existing_public: existingPublic,
    publicable_rows_before_deduplication: records.length,
    duplicate_publicable_rows_ignored: 0,
    published: records.length,
    display_only: DISPLAY_ONLY_COUNT,
    pending,
    materials: new Set(records.map(item => key(item.material_name))).size,
  },
  records,
  generated_at: new Date().toISOString(),
};

await fs.mkdir(path.dirname(output), {recursive: true});
await fs.writeFile(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`✓ Snapshot incremental: ${existingPublic} questões preservadas + ${records.length} novas objetivas (${annulledExceptions} anuladas) + ${DISPLAY_ONLY_COUNT} discursivas de consulta + ${pending} em auditoria = ${all.length}.`);
