import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.NOTION_TOKEN;
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const MATERIAL = 'Auxiliar Administrativo — CRBM-6 — Quadrix 2026';
const PREFIX = 'PROVA-QDX-CRBM6-2026-AUXILIAR-ADMINISTRATIVO-200-';
const REVIEW_DATE = '2026-07-31';
const REPORT_PATH = path.join(root, 'artifacts/reconciliacao-orfaos-auxiliar-crbm6-20260801.json');

if (!TOKEN) throw new Error('NOTION_TOKEN não disponível.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[\t\u00a0 ]+/g, ' ').replace(/ *\n */g, '\n').trim();
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

async function readPrefixRows() {
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
    gabarito: clean(row['Gabarito']),
    gabarito_conferido: Boolean(row['Gabarito conferido — registro manual anterior']),
    observacoes: clean(row['Observações']),
    created_time: row.created_time,
    last_edited_time: row.last_edited_time,
  };
}

const richProperty = text => ({ rich_text: [{ type: 'text', text: { content: clean(text).slice(0, 2000) } }] });
const expectedCode = number => `${PREFIX}${String(number).padStart(3, '0')}`;

function chooseCanonical(group) {
  const candidates = group.filter(row =>
    row.material === MATERIAL &&
    !row.duplicada &&
    !row.bloqueio &&
    row.status_manual === 'Revisada' &&
    ['Ajustada', 'Aprovada'].includes(row.auditoria)
  );
  if (candidates.length !== 1) {
    throw new Error(`Código ${group[0]?.codigo}: esperado 1 canônico saneado; encontrados ${candidates.length}.`);
  }
  return candidates[0];
}

const initial = (await readPrefixRows()).map(compact);
const groups = new Map();
for (const row of initial) {
  if (!groups.has(row.codigo)) groups.set(row.codigo, []);
  groups.get(row.codigo).push(row);
}

const preflightErrors = [];
const canonicals = [];
const duplicates = [];
for (let number = 1; number <= 120; number += 1) {
  const code = expectedCode(number);
  const group = groups.get(code) || [];
  if (!group.length) {
    preflightErrors.push(`item ${number}: nenhum registro global`);
    continue;
  }
  try {
    const canonical = chooseCanonical(group);
    canonicals.push(canonical);
    duplicates.push(...group.filter(row => row.notion_id !== canonical.notion_id).map(row => ({ ...row, canonical })));
  } catch (error) {
    preflightErrors.push(error.message);
  }
}
const unexpectedCodes = [...groups.keys()].filter(code => !/^PROVA-QDX-CRBM6-2026-AUXILIAR-ADMINISTRATIVO-200-\d{3}$/.test(code));
if (unexpectedCodes.length) preflightErrors.push(`códigos inesperados: ${unexpectedCodes.join(', ')}`);
if (canonicals.length !== 120) preflightErrors.push(`canônicos: ${canonicals.length}/120`);
if (initial.length < 160) preflightErrors.push(`registros globais insuficientes: ${initial.length}`);
if (preflightErrors.length) throw new Error(`Preflight recusou a reconciliação:\n${preflightErrors.join('\n')}`);

const before = initial;
let updated = 0;
const orphanDuplicates = [];
for (const duplicate of duplicates) {
  const wasOrphan = duplicate.material !== MATERIAL;
  if (wasOrphan) orphanDuplicates.push({
    numero: duplicate.numero,
    codigo: duplicate.codigo,
    notion_id: duplicate.notion_id,
    material_anterior: duplicate.material,
  });

  const note = wasOrphan
    ? `DUPLICATA HISTÓRICA ÓRFÃ RECONCILIADA — ${REVIEW_DATE}: esta linha já existia com o código do item ${duplicate.numero}, mas sem identificação correta do material. A linha canônica do mesmo código foi reconstruída e validada pelo caderno oficial e pelo gabarito definitivo. Registro preservado apenas como histórico; não exportar nem publicar.`
    : `DUPLICATA HISTÓRICA PRESERVADA — ${REVIEW_DATE}: esta linha contém registro anterior do item ${duplicate.numero}. A linha canônica do mesmo código está restaurada e validada. Registro preservado apenas como histórico; não exportar nem publicar.`;

  const properties = {
    'Nome do material': richProperty(MATERIAL),
    'Duplicada': { checkbox: true },
    'Bloqueio manual de publicação': { checkbox: true },
    'Auditoria de conteúdo': { select: { name: 'Ajustada' } },
    'Status editorial — registro manual anterior': { select: { name: 'Bloqueada' } },
    'Pode publicar — registro manual anterior': { checkbox: false },
    'Liberada para exportação': { checkbox: false },
    'Lote de publicação': richProperty(''),
    'Código GitHub': richProperty(''),
    'Data da publicação': { date: null },
    'Data da revisão': { date: { start: REVIEW_DATE } },
    'Observações': richProperty(note),
    'Gabarito conferido — registro manual anterior': { checkbox: duplicate.gabarito === duplicate.canonical.gabarito },
  };

  await request(`/pages/${duplicate.notion_id}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties }),
  });
  updated += 1;
  if (updated % 20 === 0) console.log(`${updated}/${duplicates.length} duplicatas globais reconciliadas.`);
}

await sleep(8000);
const finalRows = (await readPrefixRows()).map(compact);
const finalGroups = new Map();
for (const row of finalRows) {
  if (!finalGroups.has(row.codigo)) finalGroups.set(row.codigo, []);
  finalGroups.get(row.codigo).push(row);
}

const postErrors = [];
let finalCanonicalCount = 0;
let finalDuplicateCount = 0;
for (let number = 1; number <= 120; number += 1) {
  const code = expectedCode(number);
  const group = finalGroups.get(code) || [];
  const active = group.filter(row => !row.duplicada && !row.bloqueio && row.material === MATERIAL);
  const historical = group.filter(row => row.duplicada && row.bloqueio && row.material === MATERIAL);
  if (active.length !== 1) postErrors.push(`item ${number}: ${active.length} canônicos ativos`);
  finalCanonicalCount += active.length;
  finalDuplicateCount += historical.length;
  for (const row of group) {
    if (row.liberada || row.lote || row.codigo_github || row.data_publicacao) {
      postErrors.push(`item ${number}: rastro de publicação remanescente em ${row.notion_id}`);
    }
  }
  for (const row of historical) {
    if (row.status_manual !== 'Bloqueada') postErrors.push(`item ${number}: duplicata sem status Bloqueada`);
  }
}
if (finalRows.length !== initial.length) postErrors.push(`contagem global alterada: ${initial.length} -> ${finalRows.length}`);
if (finalCanonicalCount !== 120) postErrors.push(`canônicos finais: ${finalCanonicalCount}/120`);
if (finalDuplicateCount !== finalRows.length - 120) postErrors.push(`duplicatas finais: ${finalDuplicateCount}/${finalRows.length - 120}`);
if (finalRows.some(row => row.material !== MATERIAL)) postErrors.push('há linha do prefixo ainda fora do material correto');
if (postErrors.length) throw new Error(`Pós-gate recusou o fechamento:\n${postErrors.slice(0, 100).join('\n')}`);

const report = {
  generated_at: new Date().toISOString(),
  material: MATERIAL,
  result: {
    global_rows_before: initial.length,
    global_rows_after: finalRows.length,
    canonical_items: finalCanonicalCount,
    historical_duplicates: finalDuplicateCount,
    orphan_rows_reconciled: orphanDuplicates.length,
    duplicate_rows_updated: updated,
    missing_items: 0,
    active_duplicate_codes: 0,
    publication_traces: 0,
    releases: 0,
    new_lots: 0,
    main_changes: 0,
    site_changes: 0,
  },
  orphan_duplicates: orphanDuplicates,
  before,
  after: finalRows,
};
await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(`RECONCILIACAO_RESULT=${JSON.stringify(report.result)}`);
console.log(`RECONCILIACAO_REPORT=${path.relative(root, REPORT_PATH)}`);
