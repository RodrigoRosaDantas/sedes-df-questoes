import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const operationPath = path.resolve(root, process.env.EDITORIAL_OPERATION_PATH || 'data/editorial/editorial-completion-assembled.json');
const receiptPath = path.resolve(root, process.env.EDITORIAL_RECEIPT_PATH || 'data/operations/editorial-completion-receipt.json');
const TOKEN = process.env.NOTION_TOKEN;
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const clean = value => String(value ?? '').trim();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível.');
const raw = fs.readFileSync(operationPath);
const operation = JSON.parse(raw.toString('utf8'));
const operationHash = crypto.createHash('sha256').update(raw).digest('hex');
const records = operation.records || [];
const startedAt = new Date().toISOString();
const updatedCodes = [];
const alreadyAppliedCodes = [];

const richFields = new Set(['Comentário geral', 'Fundamento legal', 'Subassunto', 'Pegadinha', 'Observações']);
const urlFields = new Set(['URL da fonte']);
const selectFields = new Set(['Auditoria de conteúdo']);
const dateFields = new Set(['Data da revisão']);

function textArray(value) {
  const text = clean(value);
  const chunks = [];
  for (let offset = 0; offset < text.length; offset += 1900) chunks.push({type: 'text', text: {content: text.slice(offset, offset + 1900)}});
  return chunks;
}
const rich = value => ({rich_text: textArray(value)});
function plain(property) {
  if (!property) return '';
  if (property.type === 'title') return (property.title || []).map(item => item.plain_text || '').join('');
  if (property.type === 'rich_text') return (property.rich_text || []).map(item => item.plain_text || '').join('');
  return '';
}
const selectValue = property => property?.type === 'select' ? clean(property.select?.name) : '';
const dateValue = property => property?.type === 'date' ? clean(property.date?.start) : '';
const urlValue = property => property?.type === 'url' ? clean(property.url) : '';
const checkboxValue = property => property?.type === 'checkbox' && property.checkbox === true;

async function request(endpoint, options = {}, attempt = 1) {
  const response = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: {Authorization: `Bearer ${TOKEN}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json', ...(options.headers || {})},
  });
  if (response.ok) return response.status === 204 ? {} : response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 9) {
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 500 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 800)}`);
}

function assertOperation() {
  const expected = Number(operation.expected_records || 0);
  if (!['1.1', '1.2'].includes(operation.schema_version)) throw new Error('Versão da operação editorial incompatível.');
  if (!Number.isInteger(expected) || records.length !== expected) throw new Error(`A operação deve conter ${expected} registros; recebeu ${records.length}.`);
  if (!clean(operation.expected_github_code)) throw new Error('Código GitHub esperado ausente.');
  const codes = new Set();
  const ids = new Set();
  for (const record of records) {
    if (!clean(record.code) || !clean(record.notion_id) || !Number(record.number)) throw new Error('Registro sem identificação suficiente.');
    if (!record.patch || !Object.keys(record.patch).length) throw new Error(`${record.code}: patch vazio.`);
    if (codes.has(record.code) || ids.has(record.notion_id)) throw new Error(`${record.code}: registro duplicado.`);
    codes.add(record.code);
    ids.add(record.notion_id);
    for (const [field, value] of Object.entries(record.patch)) {
      if (!clean(value)) throw new Error(`${record.code}: valor vazio em ${field}.`);
      if (![...richFields, ...urlFields, ...selectFields, ...dateFields].includes(field)) throw new Error(`${record.code}: campo não autorizado (${field}).`);
    }
  }
}

function currentValue(properties, field) {
  if (richFields.has(field)) return clean(plain(properties[field]));
  if (urlFields.has(field)) return urlValue(properties[field]);
  if (selectFields.has(field)) return selectValue(properties[field]);
  if (dateFields.has(field)) return dateValue(properties[field]);
  throw new Error(`Campo não reconhecido: ${field}`);
}
function encodedValue(field, value) {
  if (richFields.has(field)) return rich(value);
  if (urlFields.has(field)) return {url: value};
  if (selectFields.has(field)) return {select: {name: value}};
  if (dateFields.has(field)) return {date: {start: value}};
  throw new Error(`Campo não reconhecido: ${field}`);
}
function desiredPatch(record, properties) {
  const patch = {};
  for (const [field, expectedRaw] of Object.entries(record.patch)) {
    const expected = clean(expectedRaw);
    const current = currentValue(properties, field);
    if (!current) patch[field] = encodedValue(field, expected);
    else if (current !== expected) throw new Error(`${record.code}: ${field} já contém valor divergente; nada será sobrescrito.`);
  }
  return patch;
}
function verifyIdentity(record, properties) {
  const actualCode = clean(plain(properties.Código));
  const actualGithub = clean(plain(properties['Código GitHub']));
  const status = selectValue(properties['Status editorial — registro manual anterior']);
  if (actualCode !== clean(record.code)) throw new Error(`${record.code}: Código atual diverge.`);
  if (actualGithub !== clean(operation.expected_github_code)) throw new Error(`${record.code}: Código GitHub diverge.`);
  if (status !== 'Publicada') throw new Error(`${record.code}: status não é Publicada.`);
  if (checkboxValue(properties.Anulada) || checkboxValue(properties.Duplicada)) throw new Error(`${record.code}: registro anulado ou duplicado.`);
  if (!dateValue(properties['Data da publicação'])) throw new Error(`${record.code}: Data da publicação vazia.`);
}
function verifyApplied(record, properties) {
  for (const [field, expected] of Object.entries(record.patch)) {
    if (currentValue(properties, field) !== clean(expected)) throw new Error(`${record.code}: verificação final encontrou ${field} divergente.`);
  }
}
async function writeReceipt(status, error = null) {
  const receipt = {
    schema_version: '1.2',
    operation_id: operation.operation_id,
    material: operation.material,
    operation_sha256: operationHash,
    source_release_sha: operation.source_release_sha,
    status,
    expected_records: records.length,
    updated_records: updatedCodes.length,
    already_applied_records: alreadyAppliedCodes.length,
    updated_codes: updatedCodes,
    already_applied_codes: alreadyAppliedCodes,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    site_deployed: false,
    publication_queue_reopened: false,
    error: error ? clean(error.stack || error.message || error).slice(0, 4000) : null,
  };
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
}

async function main() {
  assertOperation();
  const pending = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const page = await request(`/pages/${record.notion_id}`);
    const properties = page.properties || {};
    verifyIdentity(record, properties);
    const patch = desiredPatch(record, properties);
    if (Object.keys(patch).length) pending.push({record, patch});
    else alreadyAppliedCodes.push(record.code);
    if ((index + 1) % 18 === 0) console.log(`Preflight: ${index + 1}/${records.length}.`);
    await sleep(230);
  }
  console.log(`✓ Preflight concluído: ${pending.length} pendentes; ${alreadyAppliedCodes.length} já aplicados.`);
  for (let index = 0; index < pending.length; index += 1) {
    const {record, patch} = pending[index];
    await request(`/pages/${record.notion_id}`, {method: 'PATCH', body: JSON.stringify({properties: patch})});
    updatedCodes.push(record.code);
    if ((index + 1) % 18 === 0) console.log(`Atualização: ${index + 1}/${pending.length}.`);
    await sleep(280);
  }
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const page = await request(`/pages/${record.notion_id}`);
    const properties = page.properties || {};
    verifyIdentity(record, properties);
    verifyApplied(record, properties);
    if ((index + 1) % 18 === 0) console.log(`Verificação: ${index + 1}/${records.length}.`);
    await sleep(230);
  }
  await writeReceipt('success');
  console.log(`✓ Saneamento editorial concluído: ${records.length} registros verificados.`);
}

main().catch(async error => {
  console.error(error);
  await writeReceipt('failure', error);
  process.exitCode = 1;
});
