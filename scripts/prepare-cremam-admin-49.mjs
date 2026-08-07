import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resolve = relative => path.resolve(root, String(relative).replace(/^\.\//, ''));
const TOKEN = process.env.NOTION_TOKEN;
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const DATABASE_URL = 'https://app.notion.com/p/a1d5fc8f8e434105861faba90dc156d9?v=85b47b4a2e17461e9d3482724b13fab8';
const MATERIAL = 'Administrador — CREMAM — Quadrix 2025';
const PREFIX = 'PROVA-QDX-CREMAM-2025-ADMINISTRADOR-400-';
const LOT = 'CREMAM-2025-ADMINISTRADOR-400-49-20260807';
const SNAPSHOT_PATH = 'data/notion/published.json';
const IMMUTABLE_SNAPSHOT_PATH = 'data/notion/publication-additions/cremam-administrador-49.json';
const CATALOG_PATH = 'data/release/catalogo.json';
const DISPLAY_ONLY = 2;

if (!TOKEN) throw new Error('NOTION_TOKEN ausente.');

const EXPORT_PROPERTIES = [
  'Alternativa A','Alternativa B','Alternativa C','Alternativa D','Alternativa E','Ano','Anulada','Assunto',
  'Auditoria de conteúdo','Bloco','Bloqueio manual de publicação','Cargo','Comentário A','Comentário B','Comentário C',
  'Comentário D','Comentário E','Comentário geral','Código','Código GitHub','Código do cargo','Descrição da imagem','Dificuldade',
  'Disciplina','Duplicada','Enunciado','Fonte / Banca','Formato da questão','Fundamento legal','Gabarito',
  'Gabarito conferido — registro manual anterior','Liberada para exportação','Lote de publicação','Nome do material','Número original',
  'Observações','Órgão','Página do PDF','Pegadinha','Pode publicar','Possui imagem','Questão','Subassunto','Texto-base',
  'Tipo de material','Transcrição conferida','URL da fonte'
];
const params = new URLSearchParams();
for (const property of EXPORT_PROPERTIES) params.append('filter_properties[]', property);
const QUERY_ENDPOINT = `/data_sources/${SOURCE}/query?${params.toString()}`;

const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const key = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fingerprint = (prompt, alternatives, answer) => key([prompt, ...Object.values(alternatives || {}), answer].join('\u241f'));
const sleep = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms));

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
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 400 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 800)}`);
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
  do {
    const body = {page_size: 100, result_type: 'page'};
    if (cursor) body.start_cursor = cursor;
    const page = await request(QUERY_ENDPOINT, {method: 'POST', body: JSON.stringify(body)});
    for (const item of page.results || []) {
      rows.push({
        notion_id: item.id,
        notion_url: item.url,
        notion_last_edited_time: item.last_edited_time || null,
        ...Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)])),
      });
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

function validateCore(row) {
  const code = clean(row['Código']);
  if (!code.startsWith(PREFIX)) throw new Error(`${code}: prefixo fora do escopo.`);
  if (clean(row['Nome do material']) !== MATERIAL) throw new Error(`${code}: material divergente.`);
  if (!['Aprovada','Ajustada'].includes(clean(row['Auditoria de conteúdo']))) throw new Error(`${code}: auditoria não concluída.`);
  if (row['Transcrição conferida'] !== true) throw new Error(`${code}: transcrição não conferida.`);
  if (row['Gabarito conferido — registro manual anterior'] !== true) throw new Error(`${code}: gabarito não conferido.`);
  if (row['Duplicada'] === true || row['Anulada'] === true || row['Possui imagem'] === true || row['Bloqueio manual de publicação'] === true) {
    throw new Error(`${code}: bloqueio editorial/técnico presente.`);
  }
  if (clean(row['Código GitHub'])) throw new Error(`${code}: já possui Código GitHub.`);
  if (clean(row['Formato da questão']) !== 'Múltipla escolha A–E') throw new Error(`${code}: formato divergente.`);
  for (const field of ['Enunciado','Comentário geral','Fundamento legal','Disciplina','Assunto','Subassunto','URL da fonte','Gabarito']) {
    if (!clean(row[field])) throw new Error(`${code}: ${field} vazio.`);
  }
  for (const letter of ['A','B','C','D','E']) {
    if (!clean(row[`Alternativa ${letter}`])) throw new Error(`${code}: alternativa ${letter} vazia.`);
    if (!clean(row[`Comentário ${letter}`])) throw new Error(`${code}: comentário ${letter} vazio.`);
  }
  if (!['A','B','C','D','E'].includes(clean(row['Gabarito']))) throw new Error(`${code}: gabarito inválido.`);
}

function toRecord(row) {
  return {
    notion_id: row.notion_id,
    notion_url: row.notion_url,
    notion_last_edited_time: row.notion_last_edited_time,
    code: clean(row['Código']),
    github_id: clean(row['Código GitHub']),
    title: clean(row['Questão']) || clean(row['Código']),
    material_name: MATERIAL,
    material_type: clean(row['Tipo de material']) || 'Prova',
    year: Number(row['Ano']) || 2025,
    organization: clean(row['Órgão']),
    cargo: clean(row['Cargo']),
    cargo_code: clean(row['Código do cargo']),
    discipline: clean(row['Disciplina']),
    subject: clean(row['Assunto']),
    subsubject: clean(row['Subassunto']),
    block: clean(row['Bloco']),
    source_board: clean(row['Fonte / Banca']),
    source_url: clean(row['URL da fonte']),
    format: 'Múltipla escolha A–E',
    format_inference: 'formato_declarado',
    original_number: Number(row['Número original']),
    text_base: clean(row['Texto-base']),
    prompt: clean(row['Enunciado']),
    alternatives: Object.fromEntries(['A','B','C','D','E'].map(letter => [letter, clean(row[`Alternativa ${letter}`])])),
    answer: clean(row['Gabarito']),
    comment: clean(row['Comentário geral']),
    alternative_comments: Object.fromEntries(['A','B','C','D','E'].map(letter => [letter, clean(row[`Comentário ${letter}`])])),
    foundation: clean(row['Fundamento legal']),
    trap: clean(row['Pegadinha']),
    observations: clean(row['Observações']),
    annulled: false,
    has_image: false,
    image_description: clean(row['Descrição da imagem']),
    difficulty: clean(row['Dificuldade']),
    pdf_page: clean(row['Página do PDF']),
    publication_lot: LOT,
    released_for_export: true,
  };
}

const allBefore = await readAll();
const selectedBefore = allBefore.filter(row => clean(row['Nome do material']) === MATERIAL).sort((a,b) => Number(a['Número original']) - Number(b['Número original']));
if (allBefore.length !== 3212) throw new Error(`Banco Mestre com ${allBefore.length}; esperado 3212.`);
if (selectedBefore.length !== 49) throw new Error(`CREMAM Administrador com ${selectedBefore.length}; esperado 49.`);
const expectedNumbers = Array.from({length: 50}, (_, index) => index + 1).filter(number => number !== 3);
const beforeNumbers = selectedBefore.map(row => Number(row['Número original']));
if (JSON.stringify(beforeNumbers) !== JSON.stringify(expectedNumbers)) throw new Error(`Sequência CREMAM divergente: ${beforeNumbers.join(',')}.`);
for (const row of selectedBefore) validateCore(row);

const q11 = selectedBefore.find(row => Number(row['Número original']) === 11);
if (!q11 || !clean(q11['Enunciado']).includes('PREÇO (EM REAIS) | FREQUÊNCIA (%)') || !clean(q11['Enunciado']).includes('R$ 5,00 | 24%')) {
  throw new Error('Questão 11 não preserva a tabela em formato legível.');
}
const q47 = selectedBefore.find(row => Number(row['Número original']) === 47);
if (!q47 || clean(q47['Gabarito']) !== 'C' || !clean(q47['Fundamento legal']).includes('Lei nº 14.133/2021')) {
  throw new Error('Questão 47 sem fundamentação/gabarito esperados.');
}

const catalog = JSON.parse(await fs.readFile(resolve(CATALOG_PATH), 'utf8'));
if (Number(catalog.summary?.questoes) !== 3161 || Number(catalog.summary?.materiais) !== 72 || Number(catalog.summary?.banco_mestre) !== 3212 || Number(catalog.summary?.aguardando_auditoria) !== 49 || Number(catalog.summary?.discursivas_consulta) !== 2) {
  throw new Error(`Baseline pública divergente: ${JSON.stringify(catalog.summary)}`);
}
const existingCodes = new Set();
const existingFingerprints = new Set();
for (const metadata of catalog.materials || []) {
  const material = JSON.parse(await fs.readFile(resolve(metadata.file), 'utf8'));
  for (const question of material.questoes || []) {
    if (question.codigo) existingCodes.add(key(question.codigo));
    if (question.codigo_fonte) existingCodes.add(key(question.codigo_fonte));
    existingFingerprints.add(fingerprint(question.enunciado, question.alternativas, question.gabarito));
  }
}
for (const row of selectedBefore) {
  const record = toRecord({...row, 'Lote de publicação': LOT, 'Liberada para exportação': true});
  if (existingCodes.has(key(record.code))) throw new Error(`${record.code}: código já público.`);
  if (existingFingerprints.has(fingerprint(record.prompt, record.alternatives, record.answer))) throw new Error(`${record.code}: conteúdo idêntico já público.`);
}

for (let index = 0; index < selectedBefore.length; index += 1) {
  const row = selectedBefore[index];
  await request(`/pages/${row.notion_id}`, {
    method: 'PATCH',
    body: JSON.stringify({properties: {
      'Liberada para exportação': {checkbox: true},
      'Lote de publicação': {rich_text: [{type: 'text', text: {content: LOT}}]},
    }}),
  });
  if ((index + 1) % 10 === 0) console.log(`${index + 1}/49 registros liberados e loteados.`);
}

const allAfter = await readAll();
const selectedAfter = allAfter.filter(row => clean(row['Nome do material']) === MATERIAL).sort((a,b) => Number(a['Número original']) - Number(b['Número original']));
if (selectedAfter.length !== 49) throw new Error('Quantidade mudou após a liberação.');
for (const row of selectedAfter) {
  validateCore(row);
  if (row['Liberada para exportação'] !== true || clean(row['Lote de publicação']) !== LOT) throw new Error(`${row['Código']}: lote/liberação não persistiu.`);
  if (row['Pode publicar'] !== true) throw new Error(`${row['Código']}: gate Pode publicar não ficou verdadeiro na preparação.`);
}

const records = selectedAfter.map(toRecord);
const sortedCodes = records.map(record => record.code).sort((a,b) => a.localeCompare(b, 'pt-BR'));
const payload = {
  schema_version: '1.3',
  scope_mode: 'additions',
  source: {
    name: 'Banco Mestre — Provas e Simulados SEDES/DF',
    database_url: DATABASE_URL,
    data_source_id: SOURCE,
    publication_rule: 'Adição imutável restrita às 49 questões válidas de Administrador — CREMAM — Quadrix 2025; questão 3 anulada permanece excluída.',
  },
  publication_scope: {
    operation: LOT,
    codes: sortedCodes,
    lots: [LOT],
    excluded_original_numbers: [3],
  },
  totals: {
    all: 3212,
    existing_public: 3161,
    publicable_rows_before_deduplication: 49,
    duplicate_publicable_rows_ignored: 0,
    published: 49,
    display_only: DISPLAY_ONLY,
    pending: 0,
    materials: 1,
  },
  records,
  generated_at: new Date().toISOString(),
};
const serialized = `${JSON.stringify(payload, null, 2)}\n`;
await fs.mkdir(resolve('data/notion/publication-additions'), {recursive: true});
await fs.writeFile(resolve(SNAPSHOT_PATH), serialized);
await fs.writeFile(resolve(IMMUTABLE_SNAPSHOT_PATH), serialized);
const receipt = {
  schema_version: '1.0', operation_id: LOT, status: 'prepared', prepared_at: new Date().toISOString(),
  records: 49, excluded_original_numbers: [3], baseline_questions: 3161, target_questions: 3210,
  snapshot_sha256: sha256(Buffer.from(serialized)), codes_sha256: sha256(Buffer.from(`${sortedCodes.join('\n')}\n`)),
  deduplication: {code_collisions: 0, exact_content_collisions: 0},
};
await fs.mkdir(resolve('data/operations'), {recursive: true});
await fs.writeFile(resolve('data/operations/cremam-administrador-49-preparation-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`✓ CREMAM preparado: 3161 + 49 = 3210 questões; 73 materiais; 0 pendências após publicação.`);
