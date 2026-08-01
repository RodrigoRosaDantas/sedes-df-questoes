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

function legalReference(number) {
  if (number >= 41 && number <= 45) return 'CF/1988, art. 37, caput; Decreto nº 1.171/1994.';
  if (number >= 46 && number <= 50) return number === 47 ? 'CF/1988, art. 37, caput e § 1º.' : 'CF/1988, art. 37, caput.';
  if (number >= 51 && number <= 55) return 'Lei nº 8.429/1992, especialmente arts. 1º, 2º, 3º, 9º, 11 e 12, com as alterações da Lei nº 14.230/2021.';
  if (number >= 56 && number <= 60) return 'Lei nº 9.784/1999, especialmente arts. 2º, 3º, 50 e 54.';
  if (number >= 61 && number <= 65) return 'Lei nº 12.527/2011, especialmente arts. 3º, 7º, 21 e 23 a 31.';
  if (number >= 66 && number <= 70) return 'Lei nº 13.709/2018, especialmente arts. 1º, 4º a 7º e 23 a 30; CF/1988, art. 5º, LXXIX.';
  if (number === 73) return 'CF/1988, arts. 165 a 167; Lei nº 4.320/1964, arts. 40 a 46.';
  if (number === 74) return 'CF/1988, art. 167, VI.';
  if (number === 79) return 'Lei nº 14.133/2021, especialmente arts. 5º, 11 e 12.';
  if (number === 97 || number === 98) return 'Manual de Redação da Presidência da República, capítulo relativo às comunicações oficiais.';
  if (number === 99) return 'Lei nº 8.159/1991; princípios de protocolo e gestão documental.';
  if (number === 100) return 'Lei nº 8.159/1991; instrumentos de classificação e gestão de documentos.';
  if (number >= 117 && number <= 120) return 'Lei nº 8.159/1991; princípios arquivísticos e diretrizes do CONARQ/e-ARQ Brasil.';
  return '';
}

function rationale(comment) {
  return clean(comment).replace(/^O item está (?:certo|errado)\.\s*/u, '');
}

function normalizedRecord(record) {
  const isCorrect = /^O item está certo\./u.test(clean(record.comment));
  const base = rationale(record.comment);
  const legal = legalReference(Number(record.number));
  return {
    ...record,
    patch: {
      'Comentário geral': clean(record.comment),
      'Fundamento legal': legal ? `${legal} Aplicação ao item: ${base}` : `Fundamento teórico: ${base}`,
      'Subassunto': clean(record.subtopic),
      'Pegadinha': isCorrect
        ? `Atenção ao alcance de ${clean(record.subtopic).toLowerCase()}: o item reproduz corretamente a regra, sem ampliar seus efeitos.`
        : `Não confunda conceitos próximos em ${clean(record.subtopic).toLowerCase()}: a assertiva contém classificação, equivalência ou generalização incorreta.`,
      'URL da fonte': clean(operation.official_source_url),
      'Auditoria de conteúdo': 'Ajustada',
      'Data da revisão': clean(operation.review_date),
    },
  };
}

const records = (operation.records || []).map(normalizedRecord);

function assertOperation() {
  if (operation.schema_version !== '1.0') throw new Error('Versão da operação editorial incompatível.');
  if (!Array.isArray(records) || records.length !== 120) throw new Error(`A operação deve conter 120 registros; recebeu ${records.length}.`);
  if (!clean(operation.expected_github_code) || !clean(operation.official_source_url) || !clean(operation.review_date)) {
    throw new Error('Metadados operacionais obrigatórios ausentes.');
  }
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

const isFullyApplied = (properties, patch) =>
  Object.entries(patch).every(([field, value]) => currentValue(properties, field) === clean(value));

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
  if (actualCode !== clean(record.code)) throw new Error(`${record.code}: Código atual diverge (${actualCode || 'vazio'}).`);
  if (actualGithub !== clean(operation.expected_github_code)) throw new Error(`${record.code}: Código GitHub diverge (${actualGithub || 'vazio'}).`);
  if (actualPublishedStatus !== 'Publicada') throw new Error(`${record.code}: status publicado diverge (${actualPublishedStatus || 'vazio'}).`);
  if (checkboxValue(properties.Anulada)) throw new Error(`${record.code}: questão está anulada.`);
  if (checkboxValue(properties.Duplicada)) throw new Error(`${record.code}: questão está marcada como duplicada.`);
  if (!dateValue(properties['Data da publicação'])) throw new Error(`${record.code}: Data da publicação está vazia.`);
}

async function writeReceipt(status, error = null) {
  const receipt = {
    schema_version: '1.0',
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
    if (isFullyApplied(properties, record.patch)) {
      alreadyAppliedCodes.push(record.code);
    } else {
      if (clean(plain(properties['Comentário geral']))) {
        throw new Error(`${record.code}: comentário foi alterado após a preparação; nada será sobrescrito.`);
      }
      pending.push(record);
    }
    if ((index + 1) % 25 === 0) console.log(`Preflight: ${index + 1}/${records.length}.`);
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

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const page = await request(`/pages/${record.notion_id}`);
    const properties = page.properties || {};
    verifyIdentity(record, properties);
    if (!isFullyApplied(properties, record.patch)) throw new Error(`${record.code}: verificação final encontrou patch incompleto.`);
    if ((index + 1) % 25 === 0) console.log(`Verificação: ${index + 1}/${records.length}.`);
    await sleep(250);
  }

  await writeReceipt('success');
  console.log(`✓ Saneamento editorial concluído: ${records.length} registros verificados.`);
}

main().catch(async error => {
  console.error(error);
  await writeReceipt('failure', error);
  process.exitCode = 1;
});
