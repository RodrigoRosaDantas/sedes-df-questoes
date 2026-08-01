import fs from 'node:fs';

const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const MATERIAL = 'Administrador — CRF-DF — Quadrix 2026';
const PREFIX = 'PROVA-QDX-CRFDF-2026-ADMINISTRADOR-400-';
const REVIEW_DATE = '2026-07-31';
const PUBLIC_BASE = 'https://rodrigorosadantas.github.io/sedes-df-questoes/';
const REPORT_PATH = 'artifacts/saneamento-administrador-crfdf-20260731.json';
const MATRIX_SOURCE = 'scripts/corrigir-faixa-83-120-crfdf.mjs';

if (!TOKEN) throw new Error('NOTION_TOKEN não disponível.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = value => String(value ?? '').trim();
const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
const codeFor = number => `${PREFIX}${String(number).padStart(3, '0')}`;
const expectedLetters = [
  'C','E','C','E','C','C','C','E','C','C','C','E','E','E','C','E','E','C','E','C',
  'E','E','C','C','C','C','E','C','E','E','E','C','E','C','C','E','E','C','E','C',
  'C','C','E','E','C','C','E','E','C','E','C','C','E','E','C','C','E','C','E','C',
  'C','C','E','E','C','E','C','C','E','E','C','E','E','E','E','C','C','C','E','E',
  'E','C','E','C','E','E','C','C','C','C','E','E','E','E','C','C','C','C','E','E',
  'E','C','E','C','E','E','C','C','C','E','E','C','E','C','C','E','E','E','C','C',
];
const expectedAnswers = expectedLetters.map(letter => letter === 'C' ? 'Certo' : 'Errado');

function loadOfficialMatrix() {
  const source = fs.readFileSync(MATRIX_SOURCE, 'utf8');
  const start = source.indexOf('const groups = {');
  const end = source.indexOf('if (official.size');
  if (start < 0 || end <= start) throw new Error('Não foi possível extrair a matriz oficial auditada.');
  const block = source.slice(start, end);
  const result = new Function(`${block}\nreturn {groups, official};`)();
  if (!(result.official instanceof Map) || result.official.size !== 38) throw new Error('Matriz oficial inválida.');
  return result.official;
}
const official = loadOfficialMatrix();

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
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 700)}`);
}

function value(property) {
  if (!property) return null;
  if (property.type === 'title') return rich(property.title);
  if (property.type === 'rich_text') return rich(property.rich_text);
  if (property.type === 'select') return property.select?.name ?? null;
  if (property.type === 'status') return property.status?.name ?? null;
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  if (property.type === 'number') return property.number;
  if (property.type === 'date') return property.date?.start ?? null;
  if (property.type === 'url') return property.url ?? null;
  if (property.type === 'formula') {
    if (property.formula?.type === 'boolean') return property.formula.boolean;
    if (property.formula?.type === 'string') return property.formula.string;
    if (property.formula?.type === 'number') return property.formula.number;
  }
  return null;
}

async function readAll() {
  const rows = [];
  let cursor;
  do {
    const body = {page_size: 100};
    if (cursor) body.start_cursor = cursor;
    const page = await request(`/data_sources/${SOURCE}/query`, {method: 'POST', body: JSON.stringify(body)});
    for (const item of page.results || []) {
      rows.push({
        notion_id: item.id,
        notion_url: item.url,
        ...Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)])),
      });
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

function chunks(text, max = 1900) {
  const source = clean(text);
  if (!source) return [];
  const output = [];
  for (let index = 0; index < source.length; index += max) output.push(source.slice(index, index + max));
  return output;
}
const richProperty = text => ({rich_text: chunks(text).map(content => ({type: 'text', text: {content}}))});

function stripStaleTrace(text) {
  const source = clean(text);
  const marker = source.search(/\s*RASTREABILIDADE PENDENTE:/i);
  return marker >= 0 ? source.slice(0, marker).trim() : source;
}

function appendAuditNote(text, note) {
  const source = stripStaleTrace(text);
  if (source.includes(note)) return source;
  return [source, note].filter(Boolean).join('\n\n');
}

async function inspectPublicCatalog() {
  const response = await fetch(new URL('data/release/catalogo.json', PUBLIC_BASE), {headers: {'cache-control': 'no-cache'}});
  if (!response.ok) throw new Error(`Catálogo público indisponível: HTTP ${response.status}.`);
  const catalog = await response.json();
  const exactCodes = new Set();
  const relatedMaterials = [];
  for (const metadata of catalog.materials || []) {
    const materialResponse = await fetch(new URL(String(metadata.file || '').replace(/^\.\//, ''), PUBLIC_BASE), {headers: {'cache-control': 'no-cache'}});
    if (!materialResponse.ok) throw new Error(`${metadata.id}: material público indisponível, HTTP ${materialResponse.status}.`);
    const material = await materialResponse.json();
    const related = /CRF.?DF|Administrador/i.test(JSON.stringify({metadata, id: material.id, nome: material.nome, cargo: material.cargo, orgao: material.orgao}));
    for (const question of material.questoes || []) {
      for (const candidate of [question.codigo, question.codigo_fonte, question.id, question.code]) {
        const code = clean(candidate);
        if (code.startsWith(PREFIX)) exactCodes.add(code);
      }
    }
    if (related) relatedMaterials.push({id: material.id ?? metadata.id, nome: material.nome ?? metadata.nome, cargo: material.cargo ?? metadata.cargo, questoes: (material.questoes || []).length});
  }
  return {catalog, exactCodes, relatedMaterials};
}

function failList(label, values) {
  if (values.length) throw new Error(`${label}: ${values.join(', ')}`);
}

function snapshotRow(row) {
  return {
    numero: Number(row['Número original']), codigo: row['Código'], notion_id: row.notion_id, notion_url: row.notion_url,
    texto_base: row['Texto-base'], enunciado: row['Enunciado'], gabarito: row['Gabarito'], comentario: row['Comentário geral'],
    fundamento: row['Fundamento legal'], pegadinha: row['Pegadinha'], observacoes: row['Observações'], assunto: row['Assunto'],
    subassunto: row['Subassunto'], auditoria: row['Auditoria de conteúdo'], status_manual: row['Status editorial — registro manual anterior'],
    bloqueio: row['Bloqueio manual de publicação'], liberada: row['Liberada para exportação'], lote: row['Lote de publicação'],
    codigo_github: row['Código GitHub'], data_publicacao: row['Data da publicação'], data_revisao: row['Data da revisão'],
  };
}

const rows = (await readAll())
  .filter(row => clean(row['Nome do material']) === MATERIAL && row['Duplicada'] !== true)
  .sort((a, b) => Number(a['Número original']) - Number(b['Número original']));

if (rows.length !== 120) throw new Error(`Material incompleto: ${rows.length}/120 registros canônicos.`);
for (let index = 0; index < rows.length; index += 1) {
  const number = index + 1;
  if (Number(rows[index]['Número original']) !== number) throw new Error(`Numeração divergente na posição ${number}.`);
  if (clean(rows[index]['Código']) !== codeFor(number)) throw new Error(`Código divergente no item ${number}.`);
}

failList('Transcrição não conferida', rows.filter(row => row['Transcrição conferida'] !== true).map(row => row['Código']));
failList('Gabarito não marcado como conferido', rows.filter(row => row['Gabarito conferido — registro manual anterior'] !== true).map(row => row['Código']));
failList('Duplicidade indevida', rows.filter(row => row['Duplicada'] === true).map(row => row['Código']));
failList('Anulação inesperada', rows.filter(row => row['Anulada'] === true).map(row => row['Código']));
failList('Imagem inesperada', rows.filter(row => row['Possui imagem'] === true).map(row => row['Código']));
failList('Gabarito divergente nos itens 1–82', rows.slice(0, 82).filter((row, index) => clean(row['Gabarito']) !== expectedAnswers[index]).map(row => `${row['Número original']}=${row['Gabarito']}`));

const blockedEarly = rows.slice(0, 8).filter(row => row['Bloqueio manual de publicação'] === true).map(row => Number(row['Número original']));
if (JSON.stringify(blockedEarly) !== JSON.stringify([4, 8])) throw new Error(`Bloqueios 1–8 divergentes: ${blockedEarly.join(', ') || 'nenhum'}.`);
failList('Itens 1–8 com publicação indevida', rows.slice(0, 8).filter(row => clean(row['Código GitHub']) || clean(row['Data da publicação']) || row['Liberada para exportação'] === true || clean(row['Lote de publicação'])).map(row => row['Código']));

const falseReceiptRows = rows.slice(8);
failList('Código GitHub inesperado', falseReceiptRows.filter(row => clean(row['Código GitHub']) && clean(row['Código GitHub']) !== clean(row['Código'])).map(row => row['Código']));
failList('Registros 9–120 liberados ou loteados', falseReceiptRows.filter(row => row['Liberada para exportação'] === true || clean(row['Lote de publicação'])).map(row => row['Código']));

const publicAudit = await inspectPublicCatalog();
if (publicAudit.exactCodes.size !== 0) throw new Error(`O catálogo público contém ${publicAudit.exactCodes.size} código(s) do Administrador; operação exige zero.`);

const before = rows.map(snapshotRow);
const reconciliationNote = 'SANEAMENTO DE RASTREABILIDADE — 31/07/2026: auditoria da branch main e do catálogo público confirmou que este material não está publicado. O valor anterior de Código GitHub não correspondia a conteúdo existente no site e foi removido. Registro preservado como revisado, sem lote e sem liberação para exportação.';
let validRowsReconciled = 0;
let correctedRows = 0;
let falseReceiptsRemoved = 0;

for (const row of rows.slice(8, 82)) {
  const patch = {
    'Código GitHub': {rich_text: []},
    'Data da publicação': {date: null},
    'Status editorial — registro manual anterior': {select: {name: 'Revisada'}},
    'Liberada para exportação': {checkbox: false},
    'Lote de publicação': {rich_text: []},
    'Observações': richProperty(appendAuditNote(row['Observações'], reconciliationNote)),
  };
  await request(`/pages/${row.notion_id}`, {method: 'PATCH', body: JSON.stringify({properties: patch})});
  if (clean(row['Código GitHub'])) falseReceiptsRemoved += 1;
  validRowsReconciled += 1;
  if (validRowsReconciled % 20 === 0) console.log(`${validRowsReconciled}/74 registros válidos reconciliados como não publicados.`);
}

for (let number = 83; number <= 120; number += 1) {
  const row = rows[number - 1];
  const item = official.get(number);
  const page = number <= 96 ? '6' : number <= 114 ? '7' : '8';
  const note = `SANEAMENTO EDITORIAL — 31/07/2026: o conteúdo anterior não correspondia ao item ${number} da prova aplicada para Administrador (código 400). Enunciado, comando, gabarito definitivo, classificação, comentário e fundamento foram reconciliados com a prova oficial e o gabarito definitivo. O Código GitHub anterior foi removido após a auditoria comprovar que o material não existe no catálogo público. Registro bloqueado até eventual liberação e publicação futura do material completo.`;
  const patch = {
    'Texto-base': richProperty(item.textBase),
    'Enunciado': richProperty(item.prompt),
    'Gabarito': {select: {name: expectedAnswers[number - 1]}},
    'Comentário geral': richProperty(item.comment),
    'Fundamento legal': richProperty(item.foundation),
    'Pegadinha': richProperty(item.trap),
    'Assunto': richProperty(item.assunto),
    'Subassunto': richProperty(item.subassunto),
    'Página do PDF': richProperty(page),
    'Bloco': {select: {name: 'Conhecimentos Específicos'}},
    'Disciplina': richProperty('Administração'),
    'Auditoria de conteúdo': {select: {name: 'Ajustada'}},
    'Bloqueio manual de publicação': {checkbox: true},
    'Status editorial — registro manual anterior': {select: {name: 'Bloqueada'}},
    'Liberada para exportação': {checkbox: false},
    'Lote de publicação': {rich_text: []},
    'Código GitHub': {rich_text: []},
    'Data da publicação': {date: null},
    'Transcrição conferida': {checkbox: true},
    'Gabarito conferido — registro manual anterior': {checkbox: true},
    'Data da revisão': {date: {start: REVIEW_DATE}},
    'Observações': richProperty(note),
  };
  await request(`/pages/${row.notion_id}`, {method: 'PATCH', body: JSON.stringify({properties: patch})});
  if (clean(row['Código GitHub'])) falseReceiptsRemoved += 1;
  correctedRows += 1;
  if (correctedRows % 10 === 0) console.log(`${correctedRows}/38 registros corrigidos e bloqueados.`);
}

await sleep(6000);
const verified = (await readAll())
  .filter(row => clean(row['Nome do material']) === MATERIAL && row['Duplicada'] !== true)
  .sort((a, b) => Number(a['Número original']) - Number(b['Número original']));
if (verified.length !== 120) throw new Error(`Pós-validação: ${verified.length}/120 registros.`);

failList('Itens 1–8 alterados indevidamente', verified.slice(0, 8).filter(row => clean(row['Código GitHub']) || clean(row['Data da publicação']) || row['Liberada para exportação'] === true || clean(row['Lote de publicação'])).map(row => row['Código']));
failList('Gabarito definitivo ainda divergente', verified.filter((row, index) => clean(row['Gabarito']) !== expectedAnswers[index]).map(row => `${row['Número original']}=${row['Gabarito']}`));
failList('Itens 9–82 ainda com recibo ou estado incorreto', verified.slice(8, 82).filter(row => clean(row['Código GitHub']) || clean(row['Data da publicação']) || clean(row['Status editorial — registro manual anterior']) !== 'Revisada' || row['Liberada para exportação'] === true || clean(row['Lote de publicação'])).map(row => row['Código']));

const corrected = verified.slice(82);
failList('Enunciado oficial ainda divergente', corrected.filter(row => clean(row['Enunciado']) !== official.get(Number(row['Número original'])).prompt).map(row => row['Código']));
failList('Texto-base oficial ainda divergente', corrected.filter(row => clean(row['Texto-base']) !== official.get(Number(row['Número original'])).textBase).map(row => row['Código']));
failList('Itens 83–120 sem bloqueio', corrected.filter(row => row['Bloqueio manual de publicação'] !== true).map(row => row['Código']));
failList('Itens 83–120 com auditoria/status divergente', corrected.filter(row => clean(row['Auditoria de conteúdo']) !== 'Ajustada' || clean(row['Status editorial — registro manual anterior']) !== 'Bloqueada').map(row => row['Código']));
failList('Itens 83–120 ainda com recibo, data, liberação ou lote', corrected.filter(row => clean(row['Código GitHub']) || clean(row['Data da publicação']) || row['Liberada para exportação'] === true || clean(row['Lote de publicação'])).map(row => row['Código']));
failList('Itens 83–120 sem nota de saneamento', corrected.filter(row => !/SANEAMENTO EDITORIAL — 31\/07\/2026/.test(clean(row['Observações']))).map(row => row['Código']));

const after = verified.map(snapshotRow);
const report = {
  generated_at: new Date().toISOString(),
  material: MATERIAL,
  sources: {
    prova: '400_Administrador_QUADRIX_concurso_2025_CRF-DF.pdf',
    gabarito: 'CRF-DF_concurso_publico_2025_gabarito_definitivo_prova_objetiva.pdf',
    aplicada_em: '2026-03-15', gabarito_definitivo_publicado_em: '2026-04-06',
  },
  public_audit: {
    catalog_release_version: publicAudit.catalog.release_version ?? null,
    catalog_summary: publicAudit.catalog.summary ?? null,
    exact_administrator_codes: publicAudit.exactCodes.size,
    related_materials: publicAudit.relatedMaterials,
  },
  operation: {
    total_material: 120,
    untouched_items: [1,2,3,4,5,6,7,8],
    original_blocks_preserved: [4,8],
    valid_rows_reconciled_as_unpublished: validRowsReconciled,
    corrected_and_blocked: correctedRows,
    false_github_receipts_removed: falseReceiptsRemoved,
    corrected_range: '83–120',
    new_releases: 0, new_lots: 0, main_changes: 0, site_changes: 0,
  },
  before,
  after,
};
fs.mkdirSync('artifacts', {recursive: true});
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
console.log('SANEAMENTO_RESULT=' + JSON.stringify(report.operation));
console.log(`SANEAMENTO_REPORT=${REPORT_PATH}`);
