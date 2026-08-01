import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.NOTION_TOKEN;
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const MATERIAL = 'Auxiliar Administrativo — CRBM-6 — Quadrix 2026';
const PREFIX = 'PROVA-QDX-CRBM6-2026-AUXILIAR-ADMINISTRATIVO-200-';
const MAIN_CATALOG = path.join(root, 'data/release/catalogo.json');
const PUBLIC_CATALOG = 'https://rodrigorosadantas.github.io/sedes-df-questoes/data/release/catalogo.json';
const OUT_DIR = path.join(root, 'artifacts/auditoria-auxiliar-crbm6-2026');

if (!TOKEN) throw new Error('NOTION_TOKEN não disponível.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[\t\u00a0 ]+/g, ' ').replace(/ *\n */g, '\n').trim();
const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

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
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 1000)}`);
}

async function readRows() {
  const rows = [];
  let cursor;
  do {
    const body = {
      page_size: 100,
      filter: { property: 'Nome do material', rich_text: { equals: MATERIAL } },
      sorts: [{ property: 'Número original', direction: 'ascending' }],
    };
    if (cursor) body.start_cursor = cursor;
    const page = await request(`/data_sources/${SOURCE}/query`, { method: 'POST', body: JSON.stringify(body) });
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
  return rows;
}

function compact(row) {
  return {
    notion_id: row.notion_id,
    notion_url: row.notion_url,
    numero: Number(row['Número original']),
    codigo: clean(row['Código']),
    titulo: clean(row['Questão']),
    duplicada: Boolean(row['Duplicada']),
    bloqueio: Boolean(row['Bloqueio manual de publicação']),
    auditoria: clean(row['Auditoria de conteúdo']),
    status_manual: clean(row['Status editorial — registro manual anterior']),
    liberada: Boolean(row['Liberada para exportação']),
    lote: clean(row['Lote de publicação']),
    codigo_github: clean(row['Código GitHub']),
    data_publicacao: clean(row['Data da publicação']),
    data_revisao: clean(row['Data da revisão']),
    transcricao: Boolean(row['Transcrição conferida']),
    gabarito_conferido: Boolean(row['Gabarito conferido — registro manual anterior']),
    gabarito: clean(row['Gabarito']),
    url_fonte: clean(row['URL da fonte']),
    comentario: clean(row['Comentário geral']),
    fundamento: clean(row['Fundamento legal']),
    pegadinha: clean(row['Pegadinha']),
    assunto: clean(row['Assunto']),
    subassunto: clean(row['Subassunto']),
    disciplina: clean(row['Disciplina']),
    enunciado: clean(row['Enunciado']),
    texto_base: clean(row['Texto-base']),
    observacoes: clean(row['Observações']),
    created_time: row.created_time,
    last_edited_time: row.last_edited_time,
  };
}

function chooseCanonical(group) {
  const score = row => [
    row.duplicada ? 0 : 1000,
    row.bloqueio ? 0 : 500,
    row.codigo_github ? 200 : 0,
    row.data_publicacao ? 100 : 0,
    ['Publicada', 'Revisada'].includes(row.status_manual) ? 50 : 0,
    ['Aprovada', 'Ajustada'].includes(row.auditoria) ? 30 : 0,
    row.comentario ? 10 : 0,
    row.url_fonte ? 5 : 0,
    Date.parse(row.created_time || 0) * -1,
  ].reduce((a, b) => a + b, 0);
  return [...group].sort((a, b) => score(b) - score(a))[0];
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 auditoria-sedes-df' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  return response.text();
}

const rawRows = await readRows();
const rows = rawRows.map(compact);
const groups = new Map();
for (const row of rows) {
  const key = row.codigo || `SEM-CODIGO:${row.notion_id}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

const duplicateGroups = [];
const canonicals = [];
const duplicateRows = [];
for (const [codigo, group] of groups) {
  const canonical = chooseCanonical(group);
  canonicals.push(canonical);
  if (group.length > 1) {
    const duplicates = group.filter(row => row.notion_id !== canonical.notion_id);
    duplicateRows.push(...duplicates);
    duplicateGroups.push({ codigo, numero: canonical.numero, canonical, duplicates });
  }
}
canonicals.sort((a, b) => a.numero - b.numero);
duplicateRows.sort((a, b) => a.numero - b.numero);

const expectedNumbers = Array.from({ length: 120 }, (_, i) => i + 1);
const canonicalNumbers = canonicals.map(row => row.numero).filter(Number.isFinite);
const missingNumbers = expectedNumbers.filter(number => !canonicalNumbers.includes(number));
const outsideNumbers = canonicalNumbers.filter(number => number < 1 || number > 120);
const malformedCodes = canonicals.filter(row => row.codigo !== `${PREFIX}${String(row.numero).padStart(3, '0')}`);

const fieldIssues = canonicals.map(row => {
  const issues = [];
  if (!row.enunciado) issues.push('enunciado vazio');
  if (!row.transcricao) issues.push('transcrição não conferida');
  if (!row.gabarito_conferido) issues.push('gabarito não conferido');
  if (!['Certo', 'Errado', 'Anulada'].includes(row.gabarito)) issues.push(`gabarito inválido: ${row.gabarito || '(vazio)'}`);
  if (!row.comentario) issues.push('comentário vazio');
  if (!row.fundamento) issues.push('fundamento vazio');
  if (!row.pegadinha) issues.push('pegadinha vazia');
  if (!row.assunto) issues.push('assunto vazio');
  if (!row.disciplina) issues.push('disciplina vazia');
  if (!row.url_fonte) issues.push('URL da fonte vazia');
  if (!['Aprovada', 'Ajustada'].includes(row.auditoria)) issues.push(`auditoria ${row.auditoria || '(vazia)'}`);
  return { numero: row.numero, codigo: row.codigo, issues };
}).filter(item => item.issues.length);

const duplicateStateIssues = duplicateRows.map(row => {
  const issues = [];
  if (!row.duplicada) issues.push('Duplicada = Não');
  if (!row.bloqueio) issues.push('bloqueio manual ausente');
  if (row.liberada) issues.push('liberada para exportação');
  if (row.lote) issues.push('lote preenchido');
  if (row.codigo_github) issues.push('Código GitHub preenchido');
  if (row.data_publicacao) issues.push('data de publicação preenchida');
  if (row.status_manual !== 'Bloqueada') issues.push(`status manual ${row.status_manual || '(vazio)'}`);
  return { numero: row.numero, codigo: row.codigo, notion_id: row.notion_id, issues };
}).filter(item => item.issues.length);

const mainRaw = await fs.readFile(MAIN_CATALOG, 'utf8');
const mainCatalog = JSON.parse(mainRaw);
let publicRaw = '';
let publicCatalog = null;
let publicError = null;
try {
  publicRaw = await fetchText(PUBLIC_CATALOG);
  publicCatalog = JSON.parse(publicRaw);
} catch (error) {
  publicError = String(error.message || error);
}

const materialNeedles = ['Auxiliar Administrativo', 'CRBM-6', 'AUXILIAR-ADMINISTRATIVO-200'];
const mainContainsMaterial = materialNeedles.every(needle => mainRaw.includes(needle));
const publicContainsMaterial = publicRaw ? materialNeedles.every(needle => publicRaw.includes(needle)) : false;
const receipts = [...new Set(canonicals.map(row => row.codigo_github).filter(Boolean))];
const publicationDates = [...new Set(canonicals.map(row => row.data_publicacao).filter(Boolean))];
const publishedStateRows = canonicals.filter(row => row.codigo_github || row.data_publicacao || row.status_manual === 'Publicada' || row.liberada || row.lote);

const report = {
  generated_at: new Date().toISOString(),
  mode: 'read_only',
  material: MATERIAL,
  counts: {
    raw_rows: rows.length,
    unique_codes: groups.size,
    canonical_rows: canonicals.length,
    duplicate_groups: duplicateGroups.length,
    duplicate_rows: duplicateRows.length,
    field_issue_rows: fieldIssues.length,
    duplicate_state_issue_rows: duplicateStateIssues.length,
    published_state_rows: publishedStateRows.length,
  },
  sequence: { missing_numbers: missingNumbers, outside_numbers: outsideNumbers },
  malformed_codes: malformedCodes,
  receipts,
  publication_dates: publicationDates,
  main: {
    release_version: mainCatalog.release_version,
    summary: mainCatalog.summary,
    contains_material: mainContainsMaterial,
    sha256: sha256(mainRaw.trim()),
  },
  public: {
    available: Boolean(publicCatalog),
    error: publicError,
    release_version: publicCatalog?.release_version ?? null,
    summary: publicCatalog?.summary ?? null,
    contains_material: publicContainsMaterial,
    equal_to_main: publicRaw ? publicRaw.trim() === mainRaw.trim() : false,
    sha256: publicRaw ? sha256(publicRaw.trim()) : null,
  },
  duplicate_groups: duplicateGroups,
  field_issues: fieldIssues,
  duplicate_state_issues: duplicateStateIssues,
  canonicals,
  duplicate_rows: duplicateRows,
};

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUT_DIR, 'auditoria.json'), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(OUT_DIR, 'resumo.json'), `${JSON.stringify({
  material: MATERIAL,
  counts: report.counts,
  sequence: report.sequence,
  receipts,
  publication_dates: publicationDates,
  main: report.main,
  public: report.public,
  duplicate_numbers: duplicateGroups.map(group => group.numero),
  field_issue_numbers: fieldIssues.map(item => item.numero),
  duplicate_state_issue_numbers: duplicateStateIssues.map(item => item.numero),
}, null, 2)}\n`);

console.log(`AUDIT_RESULT=${JSON.stringify({
  ...report.counts,
  missing_numbers: missingNumbers,
  duplicate_numbers: duplicateGroups.map(group => group.numero),
  receipts,
  publication_dates: publicationDates,
  main_release: report.main.release_version,
  main_contains_material: mainContainsMaterial,
  public_release: report.public.release_version,
  public_contains_material: publicContainsMaterial,
  public_equal_to_main: report.public.equal_to_main,
})}`);
console.log(`AUDIT_FIELD_ISSUES=${JSON.stringify(fieldIssues.map(item => item.numero))}`);
console.log(`AUDIT_DUPLICATE_STATE_ISSUES=${JSON.stringify(duplicateStateIssues.map(item => item.numero))}`);
console.log(`AUDIT_ARTIFACT=${path.relative(root, OUT_DIR)}`);
