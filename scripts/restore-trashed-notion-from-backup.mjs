import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requestPath = path.join(root, 'data', 'notion', 'restore-unpublished-request.json');
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const BACKUP_PAGE_ID = '3b0cf5a2-6731-8199-bc70-e7eec7020747';
const EXPECTED = Object.freeze({before: 2536, restored: 2458, after: 4994});
const EXPECTED_IDS_SHA256 = '2b4ed19bf9a029a31f5b64fb2d1869e81a368decf1425d6c1cd73c5f50deeaf2';
const CONFIRMATION = 'RESTORE-2458-FROM-NOTION-BACKUP';
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const richText = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('');

async function request(endpoint, options = {}, attempt = 1) {
  if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível para restaurar o Banco Mestre.');
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
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 650 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 800)}`);
}

async function countActiveRows() {
  let count = 0;
  let cursor;
  do {
    const body = {page_size: 100, result_type: 'page', ...(cursor ? {start_cursor: cursor} : {})};
    const page = await request(`/data_sources/${SOURCE}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    count += (page.results || []).length;
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return count;
}

async function readBackupIds() {
  const ids = [];
  let cursor;
  do {
    const parameters = new URLSearchParams({page_size: '100'});
    if (cursor) parameters.set('start_cursor', cursor);
    const page = await request(`/blocks/${BACKUP_PAGE_ID}/children?${parameters}`);
    for (const block of page.results || []) {
      if (block.type !== 'code') continue;
      const text = richText(block.code?.rich_text);
      for (const match of text.matchAll(UUID_PATTERN)) ids.push(match[0].toLowerCase());
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);

  const unique = [...new Set(ids)];
  if (ids.length !== EXPECTED.restored || unique.length !== EXPECTED.restored) {
    throw new Error(`Backup contém ${ids.length} IDs e ${unique.length} únicos; esperado ${EXPECTED.restored}/${EXPECTED.restored}.`);
  }
  const hash = sha256([...unique].sort().join('\n'));
  if (hash !== EXPECTED_IDS_SHA256) {
    throw new Error(`Hash dos IDs do backup divergiu: ${hash}; esperado ${EXPECTED_IDS_SHA256}.`);
  }
  return unique;
}

async function appendBackupStatus(message) {
  await request(`/blocks/${BACKUP_PAGE_ID}/children`, {
    method: 'PATCH',
    body: JSON.stringify({
      children: [{
        object: 'block',
        type: 'paragraph',
        paragraph: {rich_text: [{type: 'text', text: {content: message}}]},
      }],
    }),
  });
}

async function restorePage(pageId) {
  await request(`/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({in_trash: false}),
  });
}

function validateAuthorization(payload) {
  if (payload?.operation !== 'restore_trashed_notion_pages'
      || payload?.authorized !== true
      || payload?.confirmation !== CONFIRMATION
      || payload?.backup_page_id !== BACKUP_PAGE_ID) {
    throw new Error('Solicitação de restauração ausente, inválida ou não autorizada.');
  }
  if (payload?.expected?.before !== EXPECTED.before
      || payload?.expected?.restored !== EXPECTED.restored
      || payload?.expected?.after !== EXPECTED.after
      || payload?.target_ids_sha256 !== EXPECTED_IDS_SHA256) {
    throw new Error('Contagens ou hash da solicitação de restauração divergiram do backup original.');
  }
}

export async function executeAuthorizedRestoreFromBackup() {
  let payload;
  try {
    payload = JSON.parse(await fs.readFile(requestPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.log('✓ Nenhuma solicitação de restauração pendente.');
      return;
    }
    throw error;
  }
  validateAuthorization(payload);

  const activeBefore = await countActiveRows();
  if (activeBefore === EXPECTED.after) {
    console.log(`✓ Banco Mestre já restaurado: ${EXPECTED.after} registros ativos.`);
    return;
  }
  if (activeBefore !== EXPECTED.before) {
    throw new Error(`Estado inicial inseguro: ${activeBefore} registros ativos; esperado ${EXPECTED.before}. Nenhuma página foi restaurada.`);
  }

  const ids = await readBackupIds();
  await appendBackupStatus(`RESTAURAÇÃO AUTORIZADA — início em ${new Date().toISOString()}. IDs validados: ${ids.length}; hash: ${EXPECTED_IDS_SHA256}.`);

  let restored = 0;
  try {
    for (const id of ids) {
      await restorePage(id);
      restored += 1;
      if (restored % 25 === 0 || restored === ids.length) {
        console.log(`Restauração: ${restored}/${ids.length}.`);
      }
      await sleep(380);
    }

    const activeAfter = await countActiveRows();
    if (activeAfter !== EXPECTED.after) {
      throw new Error(`Verificação final falhou: ${activeAfter} registros ativos; esperado ${EXPECTED.after}.`);
    }
    const completedAt = new Date().toISOString();
    await appendBackupStatus(`RESTAURAÇÃO CONCLUÍDA em ${completedAt}: ${restored} páginas restauradas e ${activeAfter} registros ativos no Banco Mestre.`);
    console.log(`✓ Restauração concluída: ${restored} páginas; ${activeAfter} registros ativos.`);
  } catch (error) {
    await appendBackupStatus(`RESTAURAÇÃO INTERROMPIDA em ${new Date().toISOString()}: ${restored}/${ids.length} páginas processadas. Motivo: ${String(error?.message || error).slice(0, 1200)}`).catch(() => {});
    throw error;
  }
}
