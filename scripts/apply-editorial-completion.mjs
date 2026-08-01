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
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const clean = value => String(value ?? '').trim();

if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível.');
if (!fs.existsSync(operationPath)) throw new Error(`Operação editorial não encontrada: ${operationPath}`);

const raw = fs.readFileSync(operationPath);
const operation = JSON.parse(raw.toString('utf8'));
const operationHash = crypto.createHash('sha256').update(raw).digest('hex');
const startedAt = new Date().toISOString();
const updatedCodes = [];
const alreadyAppliedCodes = [];

function textArray(value) {
  const text = clean(value);
  if (!text) return [];
  const chunks = [];
  for (let offset = 0; offset < text.length; offset += 1900) {
    chunks.push({type: 'text', text: {content: text.slice(offset, offset + 1900)}});
  }
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
    const retryAfter = Number(response.headers.get('retry-after') || 0) * 1000;
    await sleep(Math.max(retryAfter, 500 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 800)}`);
}

function normalizeRecord(record) {
  return {
    ...record,
    patch: {
      'Comentário geral': clean(record.comment),
      'Fundamento legal': clean(record.foundation),
      'Subassunto': clean(record.subtopic),
      'Pegadinha': clean(record.trap),
      'URL da fonte': clean(operation.official_source_url),
      'Auditoria de conteúdo': 'Ajustada',
      'Data da revisão': clean(operation.review_date),
    },
  };
}
const records = (operation.records || []).map(normalizeRecord);

function assertOperation() {
  const expected = Number(operation.expected_records || 0);
  if (!['1.0', '1.1'].includes(operation.schema_version)) throw new Error('Versão da operação editorial incompatível.');
  if (!Number.isInteger(expected) || records.length !== expected) throw new Error(`A operação deve conter ${expected} registros; recebeu ${records.length}.`);
  if (!clean(operation.expected_github_code) || !clean(operation.official_source_url) || !clean(operation.review_date)) throw new Error('Metadados operacionais obrigatórios ausentes.');
  const codes = new Set();
  const ids = new Set();
  for (const record of records) {
    if (!clean(record.code) || !clean(record.notion_id) || !Number(record.number)) throw new Error('Registro sem identificação suficiente.');
    if (codes.has(record.code)) throw new Error(`Código duplicado na operação: ${record.code}`);
    if (ids.has(record.notion_id)) throw new Error(`Página duplicada na operação: ${record.notion_id}`);
    codes.add(record.code);
    ids.add(record.notion_id);
    for (const [field, value] of Object.entries(record.patch)) {
      if (!clean(value)) throw new Error(`${record.code}: patch sem ${field}.`);
    }
  }
}

function currentValue(properties, field) {
  if (['Comentário geral', 'Fundamento legal', 'Subassunto', 'Pegadinha'].includes(field)) return clean(plain(properties[field]));
  if (field === 'URL da fonte') return urlValue(properties[field]);
  if (field === 'Auditoria de conteúdo') return selectValue(properties[field]);
  if (field === 'Data da revisão') return dateValue(properties[field]);
  throw new Error(`Campo não reconhecido: ${field}`);
}

function desiredPatch(record, properties) {
  const patch = {};
  for (const [field, expected] of Object.entries(record.patch)) {
    const current = currentValue(properties, field);
    if (field === 'Auditoria de conteúdo') {
      if (current === 'Ajustada' || current === 'Aprovada') continue;
      if (!current || current === 'Pendente') patch[field] = {select: {name: expected}};
      else throw new Error(`${record.code}: auditoria atual divergente (${current}).`);
      continue;
    }
    if (!current) {
      if (field === 'URL da fonte') patch[field] = {url: expected};
      else if (field === 'Data da revisão') patch[field] = {date: {start: expected}};
      else patch[field] = rich(expected);
    } else if (current !== expected) {
      throw new Error(`${record.code}: ${field} já contém valor editorial divergente; nada será sobrescrito.`);
    }
  }
  return patch;
}

function verifyIdentity(record, properties) {
  const actualCode = clean(plain(properties.Código));
  const actualGithub = clean(plain(properties['Código GitHub']));
  const actualStatus = selectValue(properties['Status editorial — registro manual anterior']);
  if (actualCode !== clean(record.code)) throw new Error(`${record.code}: Código atual diverge (${actualCode || 'vazio'}).`);
  if (actualGithub !== clean(operation.expected_github_code)) throw new Error(`${record.code}: Código GitHub diverge (${actualGithub || 'vazio'}).`);
  if (actualStatus !== 'Publicada') throw new Error(`${record.code}: status publicado diverge (${actualStatus || 'vazio'}).`);
  if (checkboxValue(properties.Anulada)) throw new Error(`${record.code}: questão está anulada.`);
  if (checkboxValue(properties.Duplicada)) throw new Error(`${record.code}: questão está marcada como duplicada.`);
  if (!dateValue(properties['Data da publicação'])) throw new Error(`${record.code}: Data da publicação está vazia.`);
}

function verifyApplied(record, properties) {
  for (const [field, expected] of Object.entries(record.patch)) {
    const current = currentValue(properties, field);
    if (field === 'Auditoria de conteúdo') {
      if (!['Ajustada', 'Aprovada'].includes(current)) throw new Error(`${record.code}: auditoria final inválida (${current || 'vazio'}).`);
    } else if (current !== expected) {
      throw new Error(`${record.code}: verificação final encontrou ${field} divergente.`);
    }
  }
}

async function writeReceipt(status, error = null) {
  const receipt = {
    schema_version: '1.1',
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
    if ((index + 1) % 20 === 0) console.log(`Preflight: ${index + 1}/${records.length}.`);
    await sleep(230);
  }
  console.log(`✓ Preflight concluído: ${pending.length} pendentes; ${alreadyAppliedCodes.length} já idempotentes.`);
  for (let index = 0; index < pending.length; index += 1) {
    const {record, patch} = pending[index];
    await request(`/pages/${record.notion_id}`, {
      method: 'PATCH',
      body: JSON.stringify({properties: patch}),
    });
    updatedCodes.push(record.code);
    if ((index + 1) % 20 === 0) console.log(`Atualização: ${index + 1}/${pending.length}.`);
    await sleep(280);
  }
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const page = await request(`/pages/${record.notion_id}`);
    const properties = page.properties || {};
    verifyIdentity(record, properties);
    verifyApplied(record, properties);
    if ((index + 1) % 20 === 0) console.log(`Verificação: ${index + 1}/${records.length}.`);
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
