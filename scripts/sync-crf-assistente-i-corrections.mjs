import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(root, 'data', 'notion', 'published.json');
const planPath = path.join(root, 'data', 'notion', 'publication-plan.json');
const reportPath = path.join(root, 'artifacts', 'sync-crf-assistente-i-corrections.json');
const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
if (!TOKEN) throw new Error('NOTION_TOKEN ausente.');

const promptItems = new Set([37, 39, 52, 57, 61, 64, 67, 70, 94, 101, 109]);
const foundationItems = new Set([71, 72, 73]);
const editorialNumbers = [...promptItems, ...foundationItems].sort((a, b) => a - b);
const codeFor = number => `PROVA-QDX-CRFDF-2026-ASSISTENTE-I-200-${String(number).padStart(3, '0')}`;
const editorialCodes = new Set(editorialNumbers.map(codeFor));
const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 700)}`);
}

const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
function value(property) {
  if (!property) return null;
  if (property.type === 'title') return rich(property.title);
  if (property.type === 'rich_text') return rich(property.rich_text);
  if (property.type === 'select') return property.select?.name ?? null;
  if (property.type === 'status') return property.status?.name ?? null;
  if (property.type === 'multi_select') return (property.multi_select || []).map(item => item.name);
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  if (property.type === 'number') return property.number;
  if (property.type === 'url') return property.url;
  if (property.type === 'date') return property.date?.start ?? null;
  if (property.type === 'created_time' || property.type === 'last_edited_time') return property[property.type];
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

function liveRecord(row) {
  const declaredFormat = clean(row['Formato da questão']);
  const answer = clean(row['Gabarito']);
  const alternatives = {
    A: clean(row['Alternativa A']), B: clean(row['Alternativa B']), C: clean(row['Alternativa C']),
    D: clean(row['Alternativa D']), E: clean(row['Alternativa E']),
  };
  const alternativesAreBlank = Object.values(alternatives).every(alternative => !alternative);
  const trueFalse = alternativesAreBlank || /certo\s*\/\s*errado/i.test(declaredFormat) || ['Certo', 'Errado'].includes(answer);
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
    format: trueFalse ? 'Certo / Errado' : declaredFormat || 'Múltipla escolha A–E',
    format_inference: alternativesAreBlank ? 'alternativas_A_E_vazias' : 'formato_ou_gabarito',
    original_number: Number(row['Número original']) || null,
    text_base: clean(row['Texto-base']),
    prompt: clean(row['Enunciado']),
    alternatives: trueFalse ? {Certo: 'Certo', Errado: 'Errado'} : alternatives,
    answer,
    comment: clean(row['Comentário geral']),
    alternative_comments: {
      A: clean(row['Comentário A']), B: clean(row['Comentário B']), C: clean(row['Comentário C']),
      D: clean(row['Comentário D']), E: clean(row['Comentário E']),
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

function changedFields(before, after) {
  const fields = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) fields.push(key);
  }
  return fields.sort();
}

const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
const currentPlan = JSON.parse(await fs.readFile(planPath, 'utf8'));
if (!Array.isArray(snapshot.records)) throw new Error('Snapshot sem records.');
const plannedCodes = new Set((currentPlan.lots || []).flatMap(lot => lot.codes || []).map(clean));
if (plannedCodes.size !== 98) throw new Error(`Plano esperado com 98 registros; encontrado ${plannedCodes.size}.`);
for (const code of editorialCodes) if (!plannedCodes.has(code)) throw new Error(`${code}: não pertence ao lote reconciliado.`);

const targets = new Map();
let cursor;
do {
  const body = {page_size: 100};
  if (cursor) body.start_cursor = cursor;
  const page = await request(`/data_sources/${SOURCE}/query`, {method: 'POST', body: JSON.stringify(body)});
  for (const item of page.results || []) {
    const properties = Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)]));
    const code = clean(properties['Código']);
    if (!plannedCodes.has(code)) continue;
    if (targets.has(code)) throw new Error(`Código duplicado no Notion: ${code}.`);
    targets.set(code, {
      notion_id: item.id,
      notion_url: item.url,
      notion_last_edited_time: item.last_edited_time,
      ...properties,
    });
  }
  cursor = page.has_more ? page.next_cursor : null;
} while (cursor && targets.size < plannedCodes.size);
if (targets.size !== plannedCodes.size) {
  const missing = [...plannedCodes].filter(code => !targets.has(code));
  throw new Error(`Registros ausentes no Notion: ${missing.join(', ')}`);
}

const snapshotIndex = new Map(snapshot.records.map((record, index) => [clean(record.code), index]));
const receiptPattern = /^release-[^:]+:[0-9a-f]{40}$/i;
const editorialReport = [];
const receiptReport = [];

for (const code of [...plannedCodes].sort()) {
  const index = snapshotIndex.get(code);
  if (index === undefined) throw new Error(`${code}: ausente no snapshot.`);
  const before = snapshot.records[index];
  const live = liveRecord(targets.get(code));
  const receipt = clean(live.github_id);
  if (!receiptPattern.test(receipt)) throw new Error(`${code}: recibo GitHub inválido ou ausente no Notion: ${receipt || '(vazio)'}.`);

  if (editorialCodes.has(code)) {
    const after = {...live};
    after.publication_lot = before.publication_lot;
    after.released_for_export = before.released_for_export;
    after.github_id = receipt;
    const fields = changedFields(before, after);
    const number = Number(after.original_number);
    const allowed = new Set(promptItems.has(number)
      ? ['github_id', 'notion_last_edited_time', 'prompt']
      : ['foundation', 'github_id', 'notion_last_edited_time']);
    const unexpected = fields.filter(field => !allowed.has(field));
    if (unexpected.length) throw new Error(`${code}: campos inesperados alterados: ${unexpected.join(', ')}`);
    snapshot.records[index] = after;
    editorialReport.push({number, code, changed_fields: fields, notion_url: after.notion_url});
  } else {
    const beforeReceipt = clean(before.github_id);
    snapshot.records[index] = {...before, github_id: receipt};
    receiptReport.push({code, previous_receipt: beforeReceipt, receipt, notion_url: live.notion_url});
  }
}

snapshot.generated_at = new Date().toISOString();
await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
await fs.mkdir(path.dirname(reportPath), {recursive: true});
await fs.writeFile(reportPath, `${JSON.stringify({
  editorial_corrections: editorialReport.length,
  receipts_reconciled: receiptReport.length + editorialReport.length,
  editorial_records: editorialReport,
  receipt_records: receiptReport,
}, null, 2)}\n`, 'utf8');
console.log(`✓ ${editorialReport.length} correções editoriais e ${receiptReport.length + editorialReport.length} recibos reconciliados.`);
