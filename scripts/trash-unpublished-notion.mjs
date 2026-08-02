import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(root, 'data', 'notion', 'published.json');
const manifestPath = path.join(root, 'data', 'notion', 'trash-unpublished-manifest.json');
const reportPath = path.join(root, 'data', 'notion', 'trash-unpublished-report.json');

const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const EXPECTED = Object.freeze({all: 4994, protected: 2536, target: 2458});
const TRASH_CONFIRMATION = 'TRASH-2458-OUTSIDE-SITE';
const RESTORE_CONFIRMATION = 'RESTORE-2458-OUTSIDE-SITE';
const mode = process.argv[2] || 'prepare';

if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível.');
if (!['prepare', 'execute', 'restore'].includes(mode)) {
  throw new Error(`Modo inválido: ${mode}. Use prepare, execute ou restore.`);
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

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
  if ((response.status === 429 || response.status >= 500) && attempt < 8) {
    const retryAfter = Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 500 * 2 ** (attempt - 1));
    await sleep(retryAfter);
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 800)}`);
}

const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
function propertyValue(property) {
  if (!property) return null;
  if (property.type === 'title') return rich(property.title);
  if (property.type === 'rich_text') return rich(property.rich_text);
  if (property.type === 'select') return property.select?.name ?? null;
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  if (property.type === 'date') return property.date?.start ?? null;
  return null;
}

async function readAllActivePages() {
  const selectedProperties = [
    'Questão', 'Código', 'Código GitHub', 'Tipo de material',
    'Nome do material', 'Anulada', 'Duplicada', 'Data da publicação',
  ];
  const parameters = new URLSearchParams();
  for (const property of selectedProperties) parameters.append('filter_properties[]', property);
  const endpoint = `/data_sources/${SOURCE}/query?${parameters.toString()}`;
  const rows = [];
  let cursor;
  do {
    const body = {page_size: 100, result_type: 'page'};
    if (cursor) body.start_cursor = cursor;
    const page = await request(endpoint, {method: 'POST', body: JSON.stringify(body)});
    for (const item of page.results || []) {
      const properties = Object.fromEntries(
        Object.entries(item.properties || {}).map(([name, property]) => [name, propertyValue(property)]),
      );
      rows.push({
        notion_id: item.id,
        notion_url: item.url,
        ...properties,
      });
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

async function readSnapshot() {
  const raw = await fs.readFile(snapshotPath, 'utf8');
  const snapshot = JSON.parse(raw);
  const protectedRows = (snapshot.records || []).map(record => ({
    notion_id: clean(record.notion_id),
    code: clean(record.code),
    title: clean(record.title),
    material_name: clean(record.material_name),
  }));
  const ids = protectedRows.map(record => record.notion_id);
  if (protectedRows.length !== EXPECTED.protected) {
    throw new Error(`Snapshot possui ${protectedRows.length} registros protegidos; esperado: ${EXPECTED.protected}.`);
  }
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) {
    throw new Error('Snapshot contém notion_id ausente ou duplicado entre os registros protegidos.');
  }
  return {raw, snapshot, protectedRows};
}

function targetRecord(row) {
  return {
    notion_id: row.notion_id,
    notion_url: row.notion_url,
    code: clean(row['Código']),
    github_id: clean(row['Código GitHub']),
    title: clean(row['Questão']),
    material_type: clean(row['Tipo de material']),
    material_name: clean(row['Nome do material']),
    annulled: row['Anulada'] === true,
    duplicated: row['Duplicada'] === true,
    publication_date: row['Data da publicação'] || null,
  };
}

async function prepare() {
  const {raw, snapshot, protectedRows} = await readSnapshot();
  const activeRows = await readAllActivePages();
  const protectedIds = new Set(protectedRows.map(record => record.notion_id));
  const activeIds = new Set(activeRows.map(record => record.notion_id));
  const missingProtected = protectedRows.filter(record => !activeIds.has(record.notion_id));
  const targets = activeRows.filter(record => !protectedIds.has(record.notion_id)).map(targetRecord);

  if (activeRows.length !== EXPECTED.all) {
    throw new Error(`Banco ativo possui ${activeRows.length} registros; esperado: ${EXPECTED.all}. Nenhuma página foi movida.`);
  }
  if (missingProtected.length) {
    throw new Error(`${missingProtected.length} registros publicados não estão ativos no Banco Mestre. Nenhuma página foi movida.`);
  }
  if (targets.length !== EXPECTED.target) {
    throw new Error(`Foram identificados ${targets.length} alvos; esperado: ${EXPECTED.target}. Nenhuma página foi movida.`);
  }

  const manifest = {
    schema_version: '1.0',
    operation: 'trash_unpublished_notion_pages',
    status: 'prepared',
    prepared_at: new Date().toISOString(),
    notion_version: VERSION,
    data_source_id: SOURCE,
    snapshot_generated_at: snapshot.generated_at || null,
    snapshot_sha256: sha256(raw),
    criteria: 'Preservar exatamente os notion_id dos 2.536 registros canônicos de data/notion/published.json e mover para a lixeira todos os demais registros ativos do Banco Mestre.',
    expected: EXPECTED,
    protected_count: protectedRows.length,
    target_count: targets.length,
    protected_ids_sha256: sha256([...protectedIds].sort().join('\n')),
    target_ids_sha256: sha256(targets.map(record => record.notion_id).sort().join('\n')),
    targets,
  };
  await fs.mkdir(path.dirname(manifestPath), {recursive: true});
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`✓ Plano preparado: ${manifest.protected_count} registros protegidos e ${manifest.target_count} destinados à lixeira.`);
}

async function readManifest() {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  if (manifest.operation !== 'trash_unpublished_notion_pages') throw new Error('Manifesto de exclusão inválido.');
  if (manifest.target_count !== EXPECTED.target || manifest.protected_count !== EXPECTED.protected) {
    throw new Error('Manifesto não corresponde às contagens autorizadas.');
  }
  const targetIds = (manifest.targets || []).map(record => clean(record.notion_id));
  if (targetIds.some(id => !id) || new Set(targetIds).size !== EXPECTED.target) {
    throw new Error('Manifesto contém notion_id ausente ou duplicado.');
  }
  if (sha256([...targetIds].sort().join('\n')) !== manifest.target_ids_sha256) {
    throw new Error('Hash dos alvos do manifesto não confere.');
  }
  return manifest;
}

async function writeProgress(manifest, fields) {
  const report = {
    schema_version: '1.0',
    operation: manifest.operation,
    data_source_id: SOURCE,
    expected: EXPECTED,
    manifest_target_ids_sha256: manifest.target_ids_sha256,
    ...fields,
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

async function setTrashState(pageId, inTrash) {
  await request(`/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({in_trash: inTrash}),
  });
}

async function execute() {
  if (process.env.TRASH_UNPUBLISHED_CONFIRM !== TRASH_CONFIRMATION) {
    throw new Error('Confirmação de exclusão ausente ou inválida.');
  }
  const manifest = await readManifest();
  const {protectedRows} = await readSnapshot();
  const protectedIds = new Set(protectedRows.map(record => record.notion_id));
  const targetIds = new Set(manifest.targets.map(record => record.notion_id));
  const activeRows = await readAllActivePages();
  const activeIds = new Set(activeRows.map(record => record.notion_id));
  const unexpected = activeRows.filter(record => !protectedIds.has(record.notion_id) && !targetIds.has(record.notion_id));
  const missingProtected = protectedRows.filter(record => !activeIds.has(record.notion_id));
  if (unexpected.length) throw new Error(`${unexpected.length} registros ativos não pertencem ao snapshot nem ao manifesto.`);
  if (missingProtected.length) throw new Error(`${missingProtected.length} registros publicados estão ausentes. Operação interrompida.`);

  const remaining = manifest.targets.filter(record => activeIds.has(record.notion_id));
  const alreadyTrashed = EXPECTED.target - remaining.length;
  await writeProgress(manifest, {
    status: 'running',
    started_at: new Date().toISOString(),
    already_trashed_before_run: alreadyTrashed,
    remaining_before_run: remaining.length,
    trashed_this_run: 0,
  });

  let completed = 0;
  for (const record of remaining) {
    await setTrashState(record.notion_id, true);
    completed += 1;
    if (completed % 25 === 0 || completed === remaining.length) {
      await writeProgress(manifest, {
        status: 'running',
        updated_at: new Date().toISOString(),
        already_trashed_before_run: alreadyTrashed,
        remaining_before_run: remaining.length,
        trashed_this_run: completed,
        total_trashed: alreadyTrashed + completed,
      });
      console.log(`Lixeira: ${alreadyTrashed + completed}/${EXPECTED.target}.`);
    }
    await sleep(380);
  }

  const finalActive = await readAllActivePages();
  const finalIds = new Set(finalActive.map(record => record.notion_id));
  const finalUnexpected = finalActive.filter(record => !protectedIds.has(record.notion_id));
  const finalMissingProtected = protectedRows.filter(record => !finalIds.has(record.notion_id));
  if (finalActive.length !== EXPECTED.protected || finalUnexpected.length || finalMissingProtected.length) {
    throw new Error(
      `Verificação final falhou: ativos=${finalActive.length}, inesperados=${finalUnexpected.length}, publicados ausentes=${finalMissingProtected.length}.`,
    );
  }

  manifest.status = 'completed';
  manifest.completed_at = new Date().toISOString();
  manifest.trashed_count = EXPECTED.target;
  manifest.remaining_active_count = finalActive.length;
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeProgress(manifest, {
    status: 'completed',
    completed_at: manifest.completed_at,
    trashed_count: EXPECTED.target,
    remaining_active_count: finalActive.length,
    protected_count_verified: EXPECTED.protected,
  });
  console.log(`✓ Concluído: ${EXPECTED.target} registros na lixeira; ${EXPECTED.protected} registros publicados preservados.`);
}

async function restore() {
  if (process.env.RESTORE_TRASHED_CONFIRM !== RESTORE_CONFIRMATION) {
    throw new Error('Confirmação de restauração ausente ou inválida.');
  }
  const manifest = await readManifest();
  let restored = 0;
  for (const record of manifest.targets) {
    await setTrashState(record.notion_id, false);
    restored += 1;
    if (restored % 25 === 0 || restored === manifest.targets.length) {
      console.log(`Restauração: ${restored}/${manifest.targets.length}.`);
    }
    await sleep(380);
  }
  const activeRows = await readAllActivePages();
  if (activeRows.length !== EXPECTED.all) {
    throw new Error(`Restauração incompleta: ${activeRows.length} registros ativos; esperado: ${EXPECTED.all}.`);
  }
  await writeProgress(manifest, {
    status: 'restored',
    restored_at: new Date().toISOString(),
    restored_count: restored,
    active_count: activeRows.length,
  });
  console.log(`✓ Restaurados ${restored} registros; Banco Mestre voltou a ${activeRows.length} registros ativos.`);
}

if (mode === 'prepare') await prepare();
if (mode === 'execute') await execute();
if (mode === 'restore') await restore();
