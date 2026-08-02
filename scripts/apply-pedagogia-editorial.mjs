import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const operationPath = path.resolve(root, process.env.EDITORIAL_OPERATION_PATH || 'data/editorial/pedagogia-seedf-2025.json');
const receiptPath = path.resolve(root, process.env.EDITORIAL_RECEIPT_PATH || 'data/operations/pedagogia-seedf-2025-receipt.json');
const token = process.env.NOTION_TOKEN;
const api = 'https://api.notion.com/v1';
const notionVersion = '2026-03-11';
const clean = value => String(value ?? '').trim();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

if (!token) throw new Error('NOTION_TOKEN não está disponível.');
const raw = fs.readFileSync(operationPath);
const operation = JSON.parse(raw.toString('utf8'));
const records = Array.isArray(operation.records) ? operation.records : [];
const operationHash = crypto.createHash('sha256').update(raw).digest('hex');
const updatedCodes = [];
const alreadyAppliedCodes = [];
const startedAt = new Date().toISOString();

const richFields = new Set(['Comentário geral', 'Fundamento legal', 'Subassunto', 'Pegadinha', 'Observações']);
const urlFields = new Set(['URL da fonte']);
const selectFields = new Set(['Auditoria de conteúdo']);
const dateFields = new Set(['Data da revisão']);
const allowedFields = new Set([...richFields, ...urlFields, ...selectFields, ...dateFields]);

function textArray(value) {
  const text = clean(value);
  const chunks = [];
  for (let offset = 0; offset < text.length; offset += 1900) {
    chunks.push({type: 'text', text: {content: text.slice(offset, offset + 1900)}});
  }
  return chunks;
}

function plain(property) {
  if (!property) return '';
  if (property.type === 'title') return (property.title || []).map(item => item.plain_text || '').join('').trim();
  if (property.type === 'rich_text') return (property.rich_text || []).map(item => item.plain_text || '').join('').trim();
  return '';
}

function currentValue(properties, field) {
  const property = properties[field];
  if (richFields.has(field)) return plain(property);
  if (urlFields.has(field)) return property?.type === 'url' ? clean(property.url) : '';
  if (selectFields.has(field)) return property?.type === 'select' ? clean(property.select?.name) : '';
  if (dateFields.has(field)) return property?.type === 'date' ? clean(property.date?.start) : '';
  throw new Error(`Campo não autorizado: ${field}.`);
}

function encode(field, value) {
  if (richFields.has(field)) return {rich_text: textArray(value)};
  if (urlFields.has(field)) return {url: value};
  if (selectFields.has(field)) return {select: {name: value}};
  if (dateFields.has(field)) return {date: {start: value}};
  throw new Error(`Campo não autorizado: ${field}.`);
}

async function request(endpoint, options = {}, attempt = 1) {
  const response = await fetch(`${api}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': notionVersion,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (response.ok) return response.status === 204 ? {} : response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 9) {
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 500 * (2 ** (attempt - 1))));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 800)}`);
}

function checkbox(properties, name) {
  const property = properties[name];
  return property?.type === 'checkbox' && property.checkbox === true;
}

function verifyIdentity(record, properties) {
  const code = plain(properties.Código);
  const githubCode = plain(properties['Código GitHub']);
  const status = properties['Status editorial — registro manual anterior']?.select?.name || '';
  const publicationDate = properties['Data da publicação']?.date?.start || '';
  if (code !== record.code) throw new Error(`${record.code}: Código atual diverge.`);
  if (githubCode !== operation.expected_github_code) throw new Error(`${record.code}: Código GitHub diverge.`);
  if (status !== 'Publicada') throw new Error(`${record.code}: status não é Publicada.`);
  if (!publicationDate) throw new Error(`${record.code}: Data da publicação vazia.`);
  if (checkbox(properties, 'Anulada') || checkbox(properties, 'Duplicada')) {
    throw new Error(`${record.code}: registro anulado ou duplicado.`);
  }
}

function buildPatch(record, properties) {
  const patch = {};
  for (const [field, expectedRaw] of Object.entries(record.patch || {})) {
    if (!allowedFields.has(field)) throw new Error(`${record.code}: campo não autorizado (${field}).`);
    const expected = clean(expectedRaw);
    if (!expected) throw new Error(`${record.code}: valor vazio em ${field}.`);
    const current = currentValue(properties, field);
    if (field === 'Auditoria de conteúdo') {
      if (expected !== 'Ajustada') throw new Error(`${record.code}: auditoria esperada deve ser Ajustada.`);
      if (current === expected) continue;
      if (current === '' || current === 'Pendente') {
        patch[field] = encode(field, expected);
        continue;
      }
      throw new Error(`${record.code}: Auditoria de conteúdo possui transição não autorizada (${current} → ${expected}).`);
    }
    if (!current) patch[field] = encode(field, expected);
    else if (current !== expected) throw new Error(`${record.code}: ${field} já contém valor divergente; nada será sobrescrito.`);
  }
  return patch;
}

function verifyApplied(record, properties) {
  for (const [field, expectedRaw] of Object.entries(record.patch || {})) {
    const expected = clean(expectedRaw);
    const current = currentValue(properties, field);
    if (current !== expected) throw new Error(`${record.code}: ${field} diverge após a atualização.`);
  }
}

function validateOperation() {
  if (operation.operation_id !== 'EDT-2026-08-02-SEEDF-PEDAGOGIA-72') throw new Error('Operação editorial inesperada.');
  if (operationHash !== 'e8c64cec30c5b2d14562746acf52854b553895676c7c294c4c145e73a90a98b8') throw new Error('Hash da operação editorial divergente.');
  if (Number(operation.expected_records) !== 72 || records.length !== 72) throw new Error(`Quantidade divergente: ${records.length}; esperado 72.`);
  if (!clean(operation.expected_github_code)) throw new Error('Código GitHub esperado ausente.');
  const codes = new Set();
  const ids = new Set();
  for (const record of records) {
    if (!clean(record.code) || !clean(record.notion_id) || !Number(record.number)) throw new Error('Registro sem identificação suficiente.');
    if (codes.has(record.code) || ids.has(record.notion_id)) throw new Error(`${record.code}: registro duplicado na operação.`);
    codes.add(record.code);
    ids.add(record.notion_id);
  }
}

function writeReceipt(status, error = null) {
  const receipt = {
    schema_version: '1.3',
    operation_id: operation.operation_id,
    material: operation.material,
    operation_sha256: operationHash,
    source_release_sha: operation.source_release_sha,
    status,
    expected_records: 72,
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
  validateOperation();
  const pending = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const page = await request(`/pages/${record.notion_id}`);
    const properties = page.properties || {};
    verifyIdentity(record, properties);
    const patch = buildPatch(record, properties);
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

  writeReceipt('success');
  console.log(`✓ Saneamento editorial concluído: ${records.length} registros verificados.`);
}

main().catch(error => {
  console.error(error);
  writeReceipt('failure', error);
  process.exitCode = 1;
});
