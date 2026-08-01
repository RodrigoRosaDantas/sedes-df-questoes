import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.NOTION_TOKEN;
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const MATERIAL = 'Agente Fiscal — CREFITO-17 — Quadrix 2026';
const PREFIX = 'PROVA-QDX-CREFITO17-2026-AGENTE-FISCAL-401-';
const MAIN_CATALOG = path.join(root, 'data/release/catalogo.json');
const PUBLIC_CATALOG = 'https://rodrigorosadantas.github.io/sedes-df-questoes/data/release/catalogo.json';
const OUT = path.join(root, 'artifacts/auditoria-agente-fiscal-crefito17-2026');

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
      filter: { property: 'Código', rich_text: { starts_with: PREFIX } },
      sorts: [{ property: 'Número original', direction: 'ascending' }],
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
  return rows;
}

function compact(row) {
  return {
    notion_id: row.notion_id,
    notion_url: row.notion_url,
    numero: Number(row['Número original']),
    codigo: clean(row['Código']),
    titulo: clean(row['Questão']),
    material: clean(row['Nome do material']),
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
    pagina_pdf: clean(row['Página do PDF']),
    anulada: Boolean(row['Anulada']),
    created_time: row.created_time,
    last_edited_time: row.last_edited_time,
  };
}

function score(row) {
  return (row.material === MATERIAL ? 10000 : 0) +
    (!row.duplicada ? 2000 : 0) +
    (!row.bloqueio ? 1000 : 0) +
    (row.codigo_github ? 400 : 0) +
    (row.data_publicacao ? 200 : 0) +
    (['Publicada', 'Revisada'].includes(row.status_manual) ? 100 : 0) +
    (['Aprovada', 'Ajustada'].includes(row.auditoria) ? 50 : 0) +
    (row.comentario ? 20 : 0) +
    (row.url_fonte ? 10 : 0) +
    (row.enunciado ? 5 : 0);
}

function fieldIssues(row) {
  const issues = [];
  if (!row.enunciado) issues.push('enunciado vazio');
  if (!row.transcricao) issues.push('transcrição não conferida');
  if (!row.gabarito_conferido) issues.push('gabarito não conferido');
  if (!['Certo', 'Errado', 'Anulada'].includes(row.gabarito)) issues.push(`gabarito inválido: ${row.gabarito || '(vazio)'}`);
  if (row.gabarito === 'Anulada' && !row.anulada) issues.push('gabarito Anulada com checkbox desmarcado');
  if (row.gabarito !== 'Anulada' && row.anulada) issues.push('checkbox Anulada incompatível com o gabarito');
  if (!row.comentario) issues.push('comentário vazio');
  if (!row.fundamento) issues.push('fundamento vazio');
  if (!row.pegadinha) issues.push('pegadinha vazia');
  if (!row.assunto) issues.push('assunto vazio');
  if (!row.disciplina) issues.push('disciplina vazia');
  if (!row.url_fonte) issues.push('URL da fonte vazia');
  if (!row.pagina_pdf) issues.push('página do PDF vazia');
  if (!['Aprovada', 'Ajustada'].includes(row.auditoria)) issues.push(`auditoria ${row.auditoria || '(vazia)'}`);
  return issues;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 auditoria-sedes-df' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  return response.text();
}

const rows = (await readRows()).map(compact);
const groups = new Map();
for (const row of rows) {
  const key = row.codigo || `SEM-CODIGO:${row.notion_id}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

const expected = Array.from({ length: 120 }, (_, index) => index + 1);
const missing = [];
const canonicalCandidates = [];
const duplicateGroups = [];
const malformedCodes = [];
for (const number of expected) {
  const code = `${PREFIX}${String(number).padStart(3, '0')}`;
  const group = groups.get(code) || [];
  if (!group.length) {
    missing.push(number);
    continue;
  }
  const sorted = [...group].sort((a, b) => score(b) - score(a));
  canonicalCandidates.push(sorted[0]);
  if (group.length > 1) duplicateGroups.push({ numero: number, codigo: code, rows: sorted });
}
for (const row of rows) {
  if (row.codigo !== `${PREFIX}${String(row.numero).padStart(3, '0')}`) malformedCodes.push(row);
}

const issueRows = canonicalCandidates
  .map(row => ({ numero: row.numero, codigo: row.codigo, notion_id: row.notion_id, issues: fieldIssues(row) }))
  .filter(item => item.issues.length);
const orphanRows = rows.filter(row => row.material !== MATERIAL);
const exactRows = rows.filter(row => row.material === MATERIAL);
const publicationRows = rows.filter(row => row.codigo_github || row.data_publicacao || row.lote || row.liberada || row.status_manual === 'Publicada');
const activeRows = rows.filter(row => !row.duplicada && !row.bloqueio);
const receipts = [...new Set(rows.map(row => row.codigo_github).filter(Boolean))];
const dates = [...new Set(rows.map(row => row.data_publicacao).filter(Boolean))];
const lots = [...new Set(rows.map(row => row.lote).filter(Boolean))];

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
const needles = ['Agente Fiscal', 'CREFITO-17', 'AGENTE-FISCAL-401'];

const report = {
  generated_at: new Date().toISOString(),
  mode: 'read_only',
  material: MATERIAL,
  prefix: PREFIX,
  counts: {
    global_rows: rows.length,
    exact_material_rows: exactRows.length,
    orphan_rows: orphanRows.length,
    unique_codes: groups.size,
    canonical_candidates: canonicalCandidates.length,
    missing_items: missing.length,
    duplicate_groups: duplicateGroups.length,
    duplicate_rows_excess: duplicateGroups.reduce((sum, group) => sum + group.rows.length - 1, 0),
    active_rows: activeRows.length,
    field_issue_rows: issueRows.length,
    publication_trace_rows: publicationRows.length,
  },
  sequence: { missing_items: missing },
  receipts,
  dates,
  lots,
  malformed_codes: malformedCodes,
  main: {
    release_version: mainCatalog.release_version,
    contains_material: needles.every(needle => mainRaw.includes(needle)),
    sha256: sha256(mainRaw.trim()),
  },
  public: {
    available: Boolean(publicCatalog),
    error: publicError,
    release_version: publicCatalog?.release_version ?? null,
    contains_material: publicRaw ? needles.every(needle => publicRaw.includes(needle)) : false,
    equal_to_main: publicRaw ? publicRaw.trim() === mainRaw.trim() : false,
    sha256: publicRaw ? sha256(publicRaw.trim()) : null,
  },
  canonical_candidates: canonicalCandidates,
  duplicate_groups: duplicateGroups,
  orphan_rows: orphanRows,
  field_issues: issueRows,
  publication_rows: publicationRows,
};

await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(path.join(OUT, 'auditoria.json'), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(OUT, 'resumo.json'), `${JSON.stringify({
  material: MATERIAL,
  counts: report.counts,
  sequence: report.sequence,
  receipts,
  dates,
  lots,
  main: report.main,
  public: report.public,
  duplicate_numbers: duplicateGroups.map(group => group.numero),
  orphan_numbers: [...new Set(orphanRows.map(row => row.numero))],
  field_issue_numbers: issueRows.map(item => item.numero),
}, null, 2)}\n`);

console.log(`AUDIT_RESULT=${JSON.stringify({
  ...report.counts,
  missing_items: missing,
  duplicate_numbers: duplicateGroups.map(group => group.numero),
  orphan_numbers: [...new Set(orphanRows.map(row => row.numero))],
  receipts,
  dates,
  lots,
  main_release: report.main.release_version,
  main_contains_material: report.main.contains_material,
  public_release: report.public.release_version,
  public_contains_material: report.public.contains_material,
  public_equal_to_main: report.public.equal_to_main,
})}`);
console.log(`AUDIT_FIELD_ISSUES=${JSON.stringify(issueRows.map(item => item.numero))}`);
console.log(`AUDIT_ARTIFACT=${path.relative(root, OUT)}`);
