import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  AUDIT_PARENT, EXPECTED, RESTORE_CONFIRMATION, SOURCE, TRASH_CONFIRMATION,
  clean, paths, readActiveRows, readPublicCatalog, readSnapshot, request, sha256,
  sleep, writeJson,
} from './notion-trash-common.mjs';
import {buildProtectionPlan} from './notion-trash-plan.mjs';

const currentFile = fileURLToPath(import.meta.url);

function targetRecord(row) {
  return {
    notion_id: row.notion_id,
    notion_url: row.notion_url,
    code: clean(row['Código']),
    github_id: clean(row['Código GitHub']),
    title: clean(row['Questão']),
    material_type: clean(row['Tipo de material']),
    material_name: clean(row['Nome do material']),
    original_number: Number(row['Número original']) || null,
    annulled: row['Anulada'] === true,
    duplicated: row['Duplicada'] === true,
    publication_date: row['Data da publicação'] || null,
  };
}

async function currentPlan() {
  const [{raw: snapshotRaw, snapshot, records, ids}, {raw: catalogRaw, questions}, activeRows] = await Promise.all([
    readSnapshot(), readPublicCatalog(), readActiveRows(),
  ]);
  const plan = buildProtectionPlan(activeRows, questions, records, ids);
  return {snapshotRaw, snapshot, catalogRaw, activeRows, plan};
}

async function prepare() {
  const state = await currentPlan();
  if (state.activeRows.length !== EXPECTED.all) {
    throw new Error(`Banco ativo possui ${state.activeRows.length}; esperado ${EXPECTED.all}. Nenhuma página foi movida.`);
  }
  const manifest = {
    schema_version: '2.0',
    operation: 'trash_unpublished_notion_pages',
    status: 'prepared',
    prepared_at: new Date().toISOString(),
    data_source_id: SOURCE,
    criteria: 'Proteger uma página do Notion para cada uma das 2.536 questões do catálogo público e mover à lixeira todos os demais registros ativos.',
    expected: EXPECTED,
    counts: state.plan.counts,
    snapshot_generated_at: state.snapshot.generated_at || null,
    snapshot_sha256: sha256(state.snapshotRaw),
    catalog_sha256: sha256(state.catalogRaw),
    protected_ids_sha256: sha256([...state.plan.protectedIds].sort().join('\n')),
    target_ids_sha256: sha256(state.plan.targets.map(row => row.notion_id).sort().join('\n')),
    targets: state.plan.targets.map(targetRecord),
  };
  await writeJson(paths.manifest, manifest);
  console.log(`✓ Plano preparado: ${manifest.counts.snapshot} do snapshot + ${manifest.counts.legacy} legadas protegidas; ${manifest.counts.targets} para a lixeira.`);
  return manifest;
}

async function readManifest() {
  const manifest = JSON.parse(await fs.readFile(paths.manifest, 'utf8'));
  if (manifest.operation !== 'trash_unpublished_notion_pages') throw new Error('Manifesto inválido.');
  if (manifest.counts?.published !== EXPECTED.published || manifest.counts?.targets !== EXPECTED.target) {
    throw new Error('Manifesto não corresponde às contagens autorizadas.');
  }
  const ids = (manifest.targets || []).map(item => clean(item.notion_id));
  if (ids.some(id => !id) || new Set(ids).size !== EXPECTED.target) throw new Error('Manifesto contém IDs ausentes ou duplicados.');
  if (sha256([...ids].sort().join('\n')) !== manifest.target_ids_sha256) throw new Error('Hash do manifesto não confere.');
  return manifest;
}

const text = content => [{type: 'text', text: {content}}];
function chunks(lines, maximum = 1900) {
  const output = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maximum && current) {
      output.push(current);
      current = line;
    } else current = next;
  }
  if (current) output.push(current);
  return output;
}

async function createAuditPage(manifest) {
  const idChunks = chunks(manifest.targets.map(item => item.notion_id));
  if (idChunks.length > 90) throw new Error(`Backup excedeu o limite seguro: ${idChunks.length} blocos.`);
  const summary = [
    'Backup da operação autorizada de limpeza do Banco Mestre.',
    `Registros antes da operação: ${EXPECTED.all}.`,
    `Questões publicadas protegidas: ${EXPECTED.published}.`,
    `Protegidas pelo snapshot: ${EXPECTED.snapshot}.`,
    `Protegidas por correspondência com o catálogo legado: ${EXPECTED.published - EXPECTED.snapshot}.`,
    `Registros destinados à lixeira: ${EXPECTED.target}.`,
    `Hash dos alvos: ${manifest.target_ids_sha256}.`,
    `Hash do catálogo: ${manifest.catalog_sha256}.`,
    `Hash do snapshot: ${manifest.snapshot_sha256}.`,
    'Os IDs abaixo permitem restauração pela API ou pela lixeira do Notion.',
  ].join('\n');
  const page = await request('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: {type: 'page_id', page_id: AUDIT_PARENT},
      properties: {title: {type: 'title', title: text(`BACKUP — lixeira dos 2.458 registros fora do site — ${manifest.prepared_at}`)}},
      children: [
        {object: 'block', type: 'paragraph', paragraph: {rich_text: text(summary)}},
        ...idChunks.map(content => ({object: 'block', type: 'code', code: {rich_text: text(content), language: 'plain text'}})),
      ],
    }),
  });
  return {id: page.id, url: page.url};
}

async function appendStatus(pageId, message) {
  await request(`/blocks/${pageId}/children`, {
    method: 'PATCH',
    body: JSON.stringify({children: [{object: 'block', type: 'paragraph', paragraph: {rich_text: text(message)}}]}),
  });
}

async function report(manifest, fields) {
  await writeJson(paths.report, {
    schema_version: '2.0', operation: manifest.operation, data_source_id: SOURCE,
    expected: EXPECTED, target_ids_sha256: manifest.target_ids_sha256,
    audit_page_id: manifest.audit_page_id || null, audit_page_url: manifest.audit_page_url || null,
    ...fields,
  });
}

async function setTrash(pageId, inTrash) {
  await request(`/pages/${pageId}`, {method: 'PATCH', body: JSON.stringify({in_trash: inTrash})});
}

async function execute() {
  if (process.env.TRASH_UNPUBLISHED_CONFIRM !== TRASH_CONFIRMATION) throw new Error('Confirmação de exclusão inválida.');
  const manifest = await readManifest();
  const activeRows = await readActiveRows();
  const activeIds = new Set(activeRows.map(row => row.notion_id));
  const targetIds = new Set(manifest.targets.map(item => item.notion_id));
  const remaining = manifest.targets.filter(item => activeIds.has(item.notion_id));
  const protectedActive = activeRows.filter(row => !targetIds.has(row.notion_id));
  if (protectedActive.length !== EXPECTED.published) {
    throw new Error(`Antes da exclusão há ${protectedActive.length} registros protegidos ativos; esperado ${EXPECTED.published}.`);
  }

  const alreadyTrashed = EXPECTED.target - remaining.length;
  await report(manifest, {status: 'running', started_at: new Date().toISOString(), already_trashed: alreadyTrashed, remaining: remaining.length});
  let completed = 0;
  for (const item of remaining) {
    await setTrash(item.notion_id, true);
    completed += 1;
    if (completed % 25 === 0 || completed === remaining.length) {
      console.log(`Lixeira: ${alreadyTrashed + completed}/${EXPECTED.target}.`);
      await report(manifest, {status: 'running', updated_at: new Date().toISOString(), trashed_this_run: completed, total_trashed: alreadyTrashed + completed});
    }
    await sleep(380);
  }

  const state = await currentPlan();
  if (state.activeRows.length !== EXPECTED.published || state.plan.targets.length !== 0) {
    throw new Error(`Verificação final falhou: ativos=${state.activeRows.length}, alvos ativos=${state.plan.targets.length}.`);
  }
  manifest.status = 'completed';
  manifest.completed_at = new Date().toISOString();
  manifest.trashed_count = EXPECTED.target;
  manifest.remaining_active_count = EXPECTED.published;
  await writeJson(paths.manifest, manifest);
  await report(manifest, {status: 'completed', completed_at: manifest.completed_at, trashed_count: EXPECTED.target, remaining_active_count: EXPECTED.published});
  console.log(`✓ Concluído: ${EXPECTED.target} registros na lixeira; ${EXPECTED.published} publicados preservados.`);
  return manifest;
}

async function restore() {
  if (process.env.RESTORE_TRASHED_CONFIRM !== RESTORE_CONFIRMATION) throw new Error('Confirmação de restauração inválida.');
  const manifest = await readManifest();
  let restored = 0;
  for (const item of manifest.targets) {
    await setTrash(item.notion_id, false);
    restored += 1;
    if (restored % 25 === 0 || restored === EXPECTED.target) console.log(`Restauração: ${restored}/${EXPECTED.target}.`);
    await sleep(380);
  }
  const active = await readActiveRows();
  if (active.length !== EXPECTED.all) throw new Error(`Restauração incompleta: ${active.length}/${EXPECTED.all}.`);
  await report(manifest, {status: 'restored', restored_at: new Date().toISOString(), restored_count: restored, active_count: active.length});
}

function validateRequest(payload) {
  if (payload.operation !== 'trash_unpublished_notion_pages' || payload.authorized !== true || payload.confirmation !== TRASH_CONFIRMATION) {
    throw new Error('Solicitação de lixeira inválida ou não autorizada.');
  }
  if (payload.expected?.all !== EXPECTED.all || payload.expected?.protected !== EXPECTED.published || payload.expected?.target !== EXPECTED.target) {
    throw new Error('Contagens da solicitação divergem da operação autorizada.');
  }
}

export async function executeAuthorizedTrashRequest() {
  let payload;
  try {
    payload = JSON.parse(await fs.readFile(paths.request, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  validateRequest(payload);
  const state = await currentPlan();
  if (state.activeRows.length === EXPECTED.published && state.plan.targets.length === 0) {
    console.log('✓ Limpeza já concluída; 2.536 registros publicados permanecem ativos.');
    return;
  }
  if (state.activeRows.length !== EXPECTED.all || state.plan.targets.length !== EXPECTED.target) {
    throw new Error(`Estado não autorizado: ativos=${state.activeRows.length}, alvos=${state.plan.targets.length}.`);
  }

  const manifest = await prepare();
  const audit = await createAuditPage(manifest);
  manifest.audit_page_id = audit.id;
  manifest.audit_page_url = audit.url;
  await writeJson(paths.manifest, manifest);
  await appendStatus(audit.id, `Manifesto criado. Início em ${new Date().toISOString()}.`);
  process.env.TRASH_UNPUBLISHED_CONFIRM = TRASH_CONFIRMATION;
  try {
    const completed = await execute();
    await appendStatus(audit.id, `CONCLUÍDO em ${completed.completed_at}: 2.458 registros na lixeira e 2.536 publicados preservados.`);
  } catch (error) {
    await appendStatus(audit.id, `FALHA em ${new Date().toISOString()}: ${clean(error?.message || error)}`).catch(() => {});
    throw error;
  }
}

const direct = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === currentFile;
if (direct) {
  const mode = process.argv[2] || 'prepare';
  if (mode === 'prepare') await prepare();
  else if (mode === 'execute') await execute();
  else if (mode === 'restore') await restore();
  else throw new Error(`Modo inválido: ${mode}.`);
}
