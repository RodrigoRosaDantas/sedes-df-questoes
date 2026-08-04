import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const OPERATION_ID = 'NOTION-TRASH-CLASSIFIED-20260804';
const TRIGGER_PATH = path.join(root, 'data', 'editorial', 'notion-trash-classified-20260804-trigger.json');
const TARGETS_PATH = path.join(root, 'data', 'editorial', 'notion-trash-classified-20260804-targets.json');
const DRY_RUN_RECEIPT_PATH = path.join(root, 'data', 'editorial', 'notion-trash-classified-20260804-dry-run-receipt.json');
const EXECUTION_RECEIPT_PATH = path.join(root, 'data', 'editorial', 'notion-trash-classified-20260804-execution-receipt.json');
const PUBLIC_SNAPSHOT_PATH = path.join(root, 'data', 'notion', 'published.json');

const QUERY_PROPERTIES = [
  'Questão', 'Código', 'Código GitHub', 'Data da publicação',
  'Transcrição conferida', 'Gabarito conferido — registro manual anterior',
  'Auditoria de conteúdo', 'Comentário geral', 'Nome do material', 'Fonte / Banca',
  'Ano', 'Órgão', 'Cargo', 'Número original', 'Bloco', 'Disciplina', 'Assunto',
  'Formato da questão', 'Tipo de material', 'Gabarito', 'Duplicada', 'Anulada',
  'Possui imagem', 'Bloqueio manual de publicação', 'Liberada para exportação',
  'Lote de publicação', 'Observações', 'Status editorial — registro manual anterior',
  'Pode publicar',
];

if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível.');

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
const blank = value => clean(value) === '';
const normalizeName = value => clean(value).replace(/[–—]/g, '-').replace(/\s+/g, ' ').toLowerCase();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

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
  const text = await response.text();
  if (response.ok) return text ? JSON.parse(text) : {};
  if ((response.status === 429 || response.status >= 500) && attempt < 8) {
    const retryAfter = Number(response.headers.get('retry-after') || 0) * 1000;
    await sleep(Math.max(retryAfter, 500 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${text.slice(0, 900)}`);
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

function rowProperty(row, requestedName) {
  const target = normalizeName(requestedName);
  for (const [name, propertyValue] of Object.entries(row.properties || {})) {
    if (normalizeName(name) === target) return propertyValue;
  }
  return null;
}

function mappedRow(item) {
  const properties = {};
  for (const requestedName of QUERY_PROPERTIES) {
    properties[requestedName] = value(rowProperty(item, requestedName));
  }
  return {
    notion_id: item.id,
    notion_url: item.url,
    created_time: item.created_time || null,
    last_edited_time: item.last_edited_time || null,
    in_trash: Boolean(item.in_trash),
    ...properties,
  };
}

async function readAllActive() {
  const queryParameters = new URLSearchParams();
  for (const property of QUERY_PROPERTIES) queryParameters.append('filter_properties[]', property);
  const endpoint = `/data_sources/${SOURCE}/query?${queryParameters.toString()}`;
  const rows = [];
  let cursor;
  let batches = 0;
  do {
    const body = {page_size: 100, result_type: 'page'};
    if (cursor) body.start_cursor = cursor;
    const page = await request(endpoint, {method: 'POST', body: JSON.stringify(body)});
    rows.push(...(page.results || []).filter(item => item.object === 'page').map(mappedRow));
    cursor = page.has_more ? page.next_cursor : null;
    batches += 1;
  } while (cursor);
  console.log(`Banco Mestre: ${rows.length} registros ativos lidos em ${batches} lotes.`);
  return rows;
}

function blockerReasons(row) {
  if (!blank(row['Código GitHub'])) return [];
  const reasons = [];
  if (row['Transcrição conferida'] !== true) reasons.push('transcricao_nao_conferida');
  if (row['Gabarito conferido — registro manual anterior'] !== true) reasons.push('gabarito_nao_conferido');
  if (['Pendente', 'Não aprovada'].includes(clean(row['Auditoria de conteúdo']))) reasons.push(`auditoria_${normalizeName(row['Auditoria de conteúdo']).replace(/[^a-z0-9]+/g, '_')}`);
  if (blank(row['Comentário geral'])) reasons.push('comentario_geral_ausente');

  const required = [
    ['Nome do material', 'material_ausente'],
    ['Fonte / Banca', 'fonte_banca_ausente'],
    ['Ano', 'ano_ausente'],
    ['Órgão', 'orgao_ausente'],
    ['Cargo', 'cargo_ausente'],
    ['Número original', 'numero_original_ausente'],
    ['Bloco', 'bloco_ausente'],
    ['Disciplina', 'disciplina_ausente'],
    ['Assunto', 'assunto_ausente'],
    ['Formato da questão', 'formato_ausente'],
    ['Tipo de material', 'tipo_material_ausente'],
  ];
  for (const [property, reason] of required) {
    if (row[property] === null || row[property] === undefined || blank(row[property])) reasons.push(reason);
  }
  if (clean(row['Gabarito']) === 'Sem gabarito') reasons.push('sem_gabarito');
  if (row['Duplicada'] === true) reasons.push('duplicada');
  if (row['Anulada'] === true) reasons.push('anulada');
  if (row['Possui imagem'] === true) reasons.push('imagem_pendente');
  if (row['Bloqueio manual de publicação'] === true) reasons.push('bloqueio_manual');
  return [...new Set(reasons)];
}

function isEditorialCandidate(row) {
  if (!blank(row['Código GitHub'])) return false;
  if (row['Transcrição conferida'] !== true) return false;
  if (row['Gabarito conferido — registro manual anterior'] !== true) return false;
  if (!['Aprovada', 'Ajustada'].includes(clean(row['Auditoria de conteúdo']))) return false;
  if (row['Duplicada'] === true || row['Anulada'] === true || row['Possui imagem'] === true || row['Bloqueio manual de publicação'] === true) return false;
  if (clean(row['Gabarito']) === 'Sem gabarito' || blank(row['Comentário geral'])) return false;
  for (const property of ['Nome do material', 'Fonte / Banca', 'Cargo', 'Disciplina', 'Ano']) {
    if (row[property] === null || row[property] === undefined || blank(row[property])) return false;
  }
  return row['Liberada para exportação'] !== true;
}

function traceabilityReasons(row) {
  const hasGithub = !blank(row['Código GitHub']);
  const hasDate = !blank(row['Data da publicação']);
  if (hasGithub && !hasDate) return ['codigo_github_sem_data_publicacao'];
  if (!hasGithub && hasDate) return ['data_publicacao_sem_codigo_github'];
  return [];
}

function compactTarget(row, reasons, publicSnapshotIds) {
  return {
    notion_id: row.notion_id,
    notion_url: row.notion_url,
    question: clean(row['Questão']),
    code: clean(row['Código']),
    github_code: clean(row['Código GitHub']),
    publication_date: clean(row['Data da publicação']),
    material: clean(row['Nome do material']),
    original_number: row['Número original'] ?? null,
    audit: clean(row['Auditoria de conteúdo']),
    status_editorial: clean(row['Status editorial — registro manual anterior']),
    released_for_export: row['Liberada para exportação'] === true,
    publication_lot: clean(row['Lote de publicação']),
    public_snapshot_member: publicSnapshotIds.has(row.notion_id),
    reasons: [...new Set(reasons)].sort(),
  };
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function expected(trigger, field, fallback) {
  const raw = trigger.expected_counts?.[field];
  return Number.isFinite(Number(raw)) ? Number(raw) : fallback;
}

function evaluateExpected(actual, trigger) {
  const expectedCounts = {
    pending_blockers: expected(trigger, 'pending_blockers', 1627),
    traceability_incomplete: expected(trigger, 'traceability_incomplete', 415),
    excess_historical: expected(trigger, 'excess_historical', 46),
    union_targets: expected(trigger, 'union_targets', 2088),
    public_snapshot: expected(trigger, 'public_snapshot', 2871),
    editorial_candidates: expected(trigger, 'editorial_candidates', 75),
  };
  const matches = Object.fromEntries(Object.entries(expectedCounts).map(([key, expectedValue]) => [key, actual[key] === expectedValue]));
  return {expected: expectedCounts, matches, all_match: Object.values(matches).every(Boolean)};
}

async function dryRun(trigger) {
  const [rows, publicSnapshot] = await Promise.all([
    readAllActive(),
    fs.readFile(PUBLIC_SNAPSHOT_PATH, 'utf8').then(JSON.parse),
  ]);
  const publicSnapshotIds = new Set((publicSnapshot.records || []).map(item => clean(item.notion_id)).filter(Boolean));
  const pending = [];
  const traceability = [];
  const excess = [];
  const candidates = [];
  const targetMap = new Map();

  for (const row of rows) {
    const blockers = blockerReasons(row);
    if (blockers.length) {
      pending.push(row);
      targetMap.set(row.notion_id, {row, reasons: blockers});
    }
    const traceReasons = traceabilityReasons(row);
    if (traceReasons.length) {
      traceability.push(row);
      const existing = targetMap.get(row.notion_id) || {row, reasons: []};
      existing.reasons.push(...traceReasons);
      targetMap.set(row.notion_id, existing);
    }
    const hasGithub = !blank(row['Código GitHub']);
    const hasDate = !blank(row['Data da publicação']);
    if (hasGithub && hasDate && !publicSnapshotIds.has(row.notion_id)) {
      excess.push(row);
      const existing = targetMap.get(row.notion_id) || {row, reasons: []};
      existing.reasons.push('rastreabilidade_excedente_ao_snapshot_publico');
      targetMap.set(row.notion_id, existing);
    }
    if (isEditorialCandidate(row)) candidates.push(row);
  }

  const targets = [...targetMap.values()]
    .map(({row, reasons}) => compactTarget(row, reasons, publicSnapshotIds))
    .sort((a, b) => a.material.localeCompare(b.material, 'pt-BR') || Number(a.original_number || 0) - Number(b.original_number || 0) || a.code.localeCompare(b.code));
  const targetIds = targets.map(item => item.notion_id).sort();
  const publicOverlap = targets.filter(item => item.public_snapshot_member);
  const candidateIds = new Set(candidates.map(row => row.notion_id));
  const candidateOverlap = targets.filter(item => candidateIds.has(item.notion_id));
  const actual = {
    all_active: rows.length,
    pending_blockers: pending.length,
    traceability_incomplete: traceability.length,
    excess_historical: excess.length,
    union_targets: targets.length,
    public_snapshot: publicSnapshotIds.size,
    editorial_candidates: candidates.length,
    target_public_overlap: publicOverlap.length,
    target_candidate_overlap: candidateOverlap.length,
  };
  const expectation = evaluateExpected(actual, trigger);
  const targetsHash = hash(targetIds.join('\n'));
  const createdAt = new Date().toISOString();
  const targetFile = {
    schema_version: '1.0',
    operation_id: OPERATION_ID,
    created_at: createdAt,
    source_data_source_id: SOURCE,
    public_snapshot_generated_at: publicSnapshot.generated_at || null,
    public_snapshot_records: publicSnapshotIds.size,
    classification_counts: actual,
    expected_counts: expectation.expected,
    expected_matches: expectation.matches,
    targets_sha256: targetsHash,
    targets,
  };
  const safety = {
    expected_counts_match: expectation.all_match,
    zero_public_snapshot_overlap: publicOverlap.length === 0,
    zero_editorial_candidate_overlap: candidateOverlap.length === 0,
    approved_for_execution: expectation.all_match && publicOverlap.length === 0 && candidateOverlap.length === 0,
  };
  const receipt = {
    schema_version: '1.0',
    operation_id: OPERATION_ID,
    mode: 'dry-run',
    status: safety.approved_for_execution ? 'approved' : 'blocked',
    created_at: createdAt,
    source_sha: process.env.GITHUB_SHA || null,
    classification_counts: actual,
    expected: expectation,
    safety,
    overlaps: {
      public_snapshot: publicOverlap.slice(0, 100),
      editorial_candidates: candidateOverlap.slice(0, 100),
    },
    targets_path: path.relative(root, TARGETS_PATH),
    targets_sha256: targetsHash,
  };
  await writeJson(TARGETS_PATH, targetFile);
  await writeJson(DRY_RUN_RECEIPT_PATH, receipt);
  console.log(JSON.stringify({status: receipt.status, counts: actual, safety}, null, 2));
}

async function execute(trigger) {
  const targetFile = JSON.parse(await fs.readFile(TARGETS_PATH, 'utf8'));
  if (targetFile.operation_id !== OPERATION_ID) throw new Error('Arquivo de alvos pertence a outra operação.');
  const targets = targetFile.targets || [];
  const targetIds = targets.map(item => clean(item.notion_id)).filter(Boolean).sort();
  const calculatedHash = hash(targetIds.join('\n'));
  if (calculatedHash !== targetFile.targets_sha256) throw new Error('Hash dos alvos não confere.');

  const dryRunReceipt = JSON.parse(await fs.readFile(DRY_RUN_RECEIPT_PATH, 'utf8'));
  if (dryRunReceipt.status !== 'approved' || dryRunReceipt.safety?.approved_for_execution !== true) {
    throw new Error('O dry-run não aprovou a execução.');
  }
  const approvedExpected = evaluateExpected(targetFile.classification_counts || {}, trigger);
  if (!approvedExpected.all_match) throw new Error(`As contagens aprovadas divergiram do gatilho: ${JSON.stringify(approvedExpected)}`);
  if (targetFile.classification_counts?.target_public_overlap !== 0) throw new Error('Há alvos pertencentes ao snapshot público.');
  if (targetFile.classification_counts?.target_candidate_overlap !== 0) throw new Error('Há alvos pertencentes às candidatas editoriais.');

  const startedAt = new Date().toISOString();
  const results = [];
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    try {
      const updated = await request(`/pages/${target.notion_id}`, {
        method: 'PATCH',
        body: JSON.stringify({in_trash: true}),
      });
      if (updated.in_trash !== true) throw new Error('A resposta não confirmou in_trash=true.');
      results.push({notion_id: target.notion_id, code: target.code, status: 'trashed'});
    } catch (error) {
      results.push({notion_id: target.notion_id, code: target.code, status: 'failed', error: String(error?.message || error)});
    }
    if ((index + 1) % 50 === 0 || index + 1 === targets.length) {
      const failed = results.filter(item => item.status === 'failed').length;
      console.log(`Lixeira: ${index + 1}/${targets.length}; falhas acumuladas: ${failed}.`);
    }
    await sleep(350);
  }

  const activeAfter = await readAllActive();
  const activeIds = new Set(activeAfter.map(row => row.notion_id));
  const remainingActive = targets.filter(target => activeIds.has(target.notion_id));
  const failures = results.filter(item => item.status === 'failed');
  const finishedAt = new Date().toISOString();
  const status = failures.length === 0 && remainingActive.length === 0 ? 'success' : 'partial';
  const receipt = {
    schema_version: '1.0',
    operation_id: OPERATION_ID,
    mode: 'execute',
    status,
    started_at: startedAt,
    finished_at: finishedAt,
    source_sha: process.env.GITHUB_SHA || null,
    target_count: targets.length,
    trashed_confirmed_by_response: results.filter(item => item.status === 'trashed').length,
    failures,
    remaining_active_count: remainingActive.length,
    remaining_active: remainingActive.slice(0, 200),
    targets_path: path.relative(root, TARGETS_PATH),
    targets_sha256: targetFile.targets_sha256,
    public_site_changed: false,
    publication_workflow_dispatched: false,
  };
  await writeJson(EXECUTION_RECEIPT_PATH, receipt);
  console.log(JSON.stringify({status, target_count: targets.length, failures: failures.length, remaining_active: remainingActive.length}, null, 2));
  if (status !== 'success') throw new Error(`Operação parcial: ${failures.length} falha(s), ${remainingActive.length} alvo(s) ainda ativos.`);
}

const trigger = JSON.parse(await fs.readFile(TRIGGER_PATH, 'utf8'));
if (trigger.operation_id !== OPERATION_ID) throw new Error('Gatilho inválido.');
if (trigger.mode === 'dry-run') await dryRun(trigger);
else if (trigger.mode === 'execute') await execute(trigger);
else throw new Error(`Modo não suportado: ${trigger.mode}`);
