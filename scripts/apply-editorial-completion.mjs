import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const operationPath = path.resolve(root, process.env.EDITORIAL_OPERATION_PATH || 'data/editorial/editorial-completion-2026-08-01.json');
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

function rich(value) {
  return {rich_text: textArray(value)};
}

function plain(property) {
  if (!property) return '';
  if (property.type === 'title') return (property.title || []).map(item => item.plain_text || '').join('');
  if (property.type === 'rich_text') return (property.rich_text || []).map(item => item.plain_text || '').join('');
  return '';
}

function selectValue(property) {
  return property?.type === 'select' ? clean(property.select?.name) : '';
}

function dateValue(property) {
  return property?.type === 'date' ? clean(property.date?.start) : '';
}

function urlValue(property) {
  return property?.type === 'url' ? clean(property.url) : '';
}

function checkboxValue(property) {
  return property?.type === 'checkbox' && property.checkbox === true;
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
    const retryAfter = Number(response.headers.get('retry-after') || 0) * 1000;
    await sleep(Math.max(retryAfter, 500 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 800)}`);
}

function assertOperation() {
  if (operation.schema_version !== '1.0') throw new Error('Versão da operação editorial incompatível.');
  if (!Array.isArray(operation.records) || operation.records.length !== operation.scope?.records) {
    throw new Error('Contagem declarada da operação diverge dos registros.');
  }
  const codes = new Set();
  const ids = new Set();
  for (const record of operation.records) {
    if (!clean(record.code) || !clean(record.notion_id)) throw new Error('Registro sem código ou notion_id.');
    if (codes.has(record.code)) throw new Error(`Código duplicado na operação: ${record.code}`);
    if (ids.has(record.notion_id)) throw new Error(`Página duplicada na operação: ${record.notion_id}`);
    codes.add(record.code);
    ids.add(record.notion_id);
    for (const field of ['Comentário geral', 'Fundamento legal', 'Subassunto', 'Pegadinha', 'URL da fonte', 'Auditoria de conteúdo', 'Data da revisão']) {
      if (!clean(record.patch?.[field])) throw new Error(`${record.code}: patch sem ${field}.`);
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

function isFullyApplied(properties, patch) {
  return Object.entries(patch).every(([field, value]) => currentValue(properties, field) === clean(value));
}

function buildPatch(record) {
  return {
    'Comentário geral': rich(record.patch['Comentário geral']),
    'Fundamento legal': rich(record.patch['Fundamento legal']),
    'Subassunto': rich(record.patch.Subassunto),
    'Pegadinha': rich(record.patch.Pegadinha),
    'URL da fonte': {url: record.patch['URL da fonte']},
    'Auditoria de conteúdo': {select: {name: record.patch['Auditoria de conteúdo']}},
    'Data da revisão': {date: {start: record.patch['Data da revisão']}},
  };
}

function verifyIdentity(record, properties) {
  const actualCode = clean(plain(properties.Código));
  const actualGithub = clean(plain(properties['Código GitHub']));
  const actualPublishedStatus = selectValue(properties['Status editorial — registro manual anterior']);
  if (actualCode !== clean(record.code)) {
    throw new Error(`${record.code}: Código atual diverge (${actualCode || 'vazio'}).`);
  }
  if (actualGithub !== clean(record.expected.github_code)) {
    throw new Error(`${record.code}: Código GitHub diverge (${actualGithub || 'vazio'}).`);
  }
  if (actualPublishedStatus !== clean(record.expected.published_status)) {
    throw new Error(`${record.code}: status publicado diverge (${actualPublishedStatus || 'vazio'}).`);
  }
  if (checkboxValue(properties.Anulada)) throw new Error(`${record.code}: questão está anulada.`);
  if (checkboxValue(properties.Duplicada)) throw new Error(`${record.code}: questão está marcada como duplicada.`);
  if (!dateValue(properties['Data da publicação'])) throw new Error(`${record.code}: Data da publicação está vazia.`);
}

async function writeReceipt(status, error = null) {
  const receipt = {
    schema_version: '1.0',
    operation_id: operation.operation_id,
    operation_sha256: operationHash,
    source_release_sha: operation.source_release_sha,
    status,
    expected_records: operation.records.length,
    updated_records: updatedCodes.length,
    already_applied_records: alreadyAppliedCodes.length,
    updated_codes: updatedCodes,
    already_applied_codes: alreadyAppliedCodes,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    error: error ? clean(error.stack || error.message || error).slice(0, 4000) : null,
  };
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
}

async function main() {
  assertOperation();
  const pending = [];

  // Preflight completo antes da primeira alteração.
  for (let index = 0; index < operation.records.length; index += 1) {
    const record = operation.records[index];
    const page = await request(`/pages/${record.notion_id}`);
    const properties = page.properties || {};
    verifyIdentity(record, properties);

    if (isFullyApplied(properties, record.patch)) {
      alreadyAppliedCodes.push(record.code);
    } else {
      if (record.expected.comment_must_be_empty && clean(plain(properties['Comentário geral']))) {
        throw new Error(`${record.code}: comentário foi alterado após a preparação; operação interrompida sem sobrescrever.`);
      }
      pending.push(record);
    }

    if ((index + 1) % 25 === 0) console.log(`Preflight: ${index + 1}/${operation.records.length}.`);
    await sleep(250);
  }

  console.log(`✓ Preflight concluído: ${pending.length} pendentes; ${alreadyAppliedCodes.length} já idempotentes.`);

  for (let index = 0; index < pending.length; index += 1) {
    const record = pending[index];
    await request(`/pages/${record.notion_id}`, {
      method: 'PATCH',
      body: JSON.stringify({properties: buildPatch(record)}),
    });
    updatedCodes.push(record.code);
    if ((index + 1) % 20 === 0) console.log(`Atualização: ${index + 1}/${pending.length}.`);
    await sleep(300);
  }

  // Verificação integral do estado final.
  for (let index = 0; index < operation.records.length; index += 1) {
    const record = operation.records[index];
    const page = await request(`/pages/${record.notion_id}`);
    const properties = page.properties || {};
    verifyIdentity(record, properties);
    if (!isFullyApplied(properties, record.patch)) {
      throw new Error(`${record.code}: verificação final encontrou patch incompleto.`);
    }
    if ((index + 1) % 25 === 0) console.log(`Verificação: ${index + 1}/${operation.records.length}.`);
    await sleep(250);
  }

  await writeReceipt('success');
  console.log(`✓ Saneamento editorial concluído: ${operation.records.length} registros verificados.`);
}

main().catch(async error => {
  console.error(error);
  await writeReceipt('failure', error);
  process.exitCode = 1;
});
