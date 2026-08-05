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
const PREFIX = path.join(root, 'data', 'editorial', 'notion-trash-classified-20260804');
const TRIGGER_PATH = `${PREFIX}-trigger.json`;
const PUBLIC_CODES_PATH = `${PREFIX}-public-codes.json`;
const TARGETS_PATH = `${PREFIX}-targets.json`;
const DRY_RUN_RECEIPT_PATH = `${PREFIX}-dry-run-receipt.json`;
const EXECUTION_RECEIPT_PATH = `${PREFIX}-execution-receipt.json`;

const QUERY_PROPERTIES = [
  'Questão', 'Código', 'Código GitHub', 'Data da publicação',
  'Transcrição conferida', 'Gabarito conferido — registro manual anterior',
  'Auditoria de conteúdo', 'Comentário geral', 'Nome do material', 'Fonte / Banca',
  'Ano', 'Órgão', 'Cargo', 'Número original', 'Bloco', 'Disciplina', 'Assunto',
  'Formato da questão', 'Tipo de material', 'Gabarito', 'Duplicada', 'Anulada',
  'Possui imagem', 'Bloqueio manual de publicação', 'Liberada para exportação',
  'Lote de publicação', 'Observações', 'Status editorial — registro manual anterior',
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
    ...properties,
  };
}

async function readAllActive() {
  const parameters = new URLSearchParams();
  for (const property of QUERY_PROPERTIES) parameters.append('filter_properties[]', property);
  const endpoint = `/data_sources/${SOURCE}/query?${parameters.toString()}`;
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

async function readPublicCodes() {
  const catalog = JSON.parse(await fs.readFile(PUBLIC_CODES_PATH, 'utf8'));
  if (catalog.operation_id !== OPERATION_ID || catalog.questions !== 2871 || catalog.unique_codes !== 2871) {
    throw new Error('O catálogo público reconstruído não contém exatamente 2.871 códigos únicos.');
  }
  const codes = new Set((catalog.codes || []).map(clean).filter(Boolean));
  if (codes.size !== 2871) throw new Error(`Conjunto público contém ${codes.size} códigos; esperado 2871.`);
  return {catalog, codes};
}

function blockerReasons(row) {
  if (!blank(row['Código GitHub'])) return [];
  const reasons = [];
  if (row['Transcrição conferida'] !== true) reasons.push('transcricao_nao_conferida');
  if (row['Gabarito conferido — registro manual anterior'] !== true) reasons.push('gabarito_nao_conferido');
  if (['Pendente', 'Não aprovada'].includes(clean(row['Auditoria de conteúdo']))) {
    reasons.push(clean(row['Auditoria de conteúdo']) === 'Pendente' ? 'auditoria_pendente' : 'auditoria_nao_aprovada');
  }
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
  return [...new Set(reasons)].sort();
}

function traceabilityReasons(row) {
  const hasGithub = !blank(row['Código GitHub']);
  const hasDate = !blank(row['Data da publicação']);
  if (hasGithub && !hasDate) return ['codigo_github_sem_data_publicacao'];
  if (!hasGithub && hasDate) return ['data_publicacao_sem_codigo_github'];
  return [];
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

function classify(rows, publicCodes) {
  const pending = [];
  const traceability = [];
  const excess = [];
  const candidates = [];
  const completePublic = [];
  const targets = new Map();

  const addTarget = (row, category, reasons) => {
    const existing = targets.get(row.notion_id) || {row, categories: [], reasons: []};
    existing.categories.push(category);
    existing.reasons.push(...reasons);
    targets.set(row.notion_id, existing);
  };

  for (const row of rows) {
    const code = clean(row['Código']);
    const hasGithub = !blank(row['Código GitHub']);
    const hasDate = !blank(row['Data da publicação']);
    const blockers = blockerReasons(row);
    const traceReasons = traceabilityReasons(row);

    if (blockers.length) {
      pending.push(row);
      addTarget(row, 'pending_blocker', blockers);
    }
    if (traceReasons.length) {
      traceability.push(row);
      addTarget(row, 'traceability_incomplete', traceReasons);
    }
    if (hasGithub && hasDate && !publicCodes.has(code)) {
      excess.push(row);
      addTarget(row, 'excess_traced_record', ['rastreabilidade_excedente_ao_catalogo_publico']);
    }
    if (hasGithub && hasDate && publicCodes.has(code)) completePublic.push(row);
    if (isEditorialCandidate(row)) candidates.push(row);
  }

  const targetRows = [...targets.values()].map(({row, categories, reasons}) => ({
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
    categories: [...new Set(categories)].sort(),
    reasons: [...new Set(reasons)].sort(),
    source_snapshot: row,
  })).sort((left, right) => left.material.localeCompare(right.material, 'pt-BR')
    || Number(left.original_number || 0) - Number(right.original_number || 0)
    || left.code.localeCompare(right.code, 'pt-BR')
    || left.notion_id.localeCompare(right.notion_id));

  const candidateIds = new Set(candidates.map(row => row.notion_id));
  const completePublicIds = new Set(completePublic.map(row => row.notion_id));
  return {
    pending,
    traceability,
    excess,
    candidates,
    completePublic,
    targets: targetRows,
    targetCandidateOverlap: targetRows.filter(target => candidateIds.has(target.notion_id)),
    targetCompletePublicOverlap: targetRows.filter(target => completePublicIds.has(target.notion_id)),
  };
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function expectedCounts(trigger) {
  return {
    pending_blockers: Number(trigger.expected_counts?.pending_blockers ?? 1627),
    traceability_incomplete: Number(trigger.expected_counts?.traceability_incomplete ?? 415),
    excess_historical: Number(trigger.expected_counts?.excess_historical ?? 46),
    union_targets: Number(trigger.expected_counts?.union_targets ?? 2088),
    public_catalog: Number(trigger.expected_counts?.public_snapshot ?? 2871),
    editorial_candidates: Number(trigger.expected_counts?.editorial_candidates ?? 75),
  };
}

function countsFrom(classification, rows, publicCodes) {
  return {
    all_active: rows.length,
    pending_blockers: classification.pending.length,
    traceability_incomplete: classification.traceability.length,
    excess_historical: classification.excess.length,
    union_targets: classification.targets.length,
    public_catalog: publicCodes.size,
    complete_public_records: classification.completePublic.length,
    editorial_candidates: classification.candidates.length,
    target_complete_public_overlap: classification.targetCompletePublicOverlap.length,
    target_candidate_overlap: classification.targetCandidateOverlap.length,
  };
}

function evaluate(counts, expected) {
  const matches = {
    pending_blockers: counts.pending_blockers === expected.pending_blockers,
    traceability_incomplete: counts.traceability_incomplete === expected.traceability_incomplete,
    excess_historical: counts.excess_historical === expected.excess_historical,
    union_targets: counts.union_targets === expected.union_targets,
    public_catalog: counts.public_catalog === expected.public_catalog,
    complete_public_records: counts.complete_public_records === expected.public_catalog,
    editorial_candidates: counts.editorial_candidates === expected.editorial_candidates,
    zero_complete_public_overlap: counts.target_complete_public_overlap === 0,
    zero_editorial_candidate_overlap: counts.target_candidate_overlap === 0,
  };
  return {matches, all_match: Object.values(matches).every(Boolean)};
}

async function dryRun(trigger) {
  const [{codes: publicCodes, catalog}, rows] = await Promise.all([readPublicCodes(), readAllActive()]);
  const classification = classify(rows, publicCodes);
  const expected = expectedCounts(trigger);
  const counts = countsFrom(classification, rows, publicCodes);
  const evaluation = evaluate(counts, expected);
  const ids = classification.targets.map(target => target.notion_id).sort();
  const targetsSha256 = hash(ids.join('\n'));
  const createdAt = new Date().toISOString();
  const status = evaluation.all_match ? 'approved' : 'blocked';

  await writeJson(TARGETS_PATH, {
    schema_version: '2.0',
    operation_id: OPERATION_ID,
    mode: 'dry-run',
    created_at: createdAt,
    source_sha: process.env.GITHUB_SHA || null,
    source_data_source_id: SOURCE,
    public_catalog: {
      created_at: catalog.created_at || null,
      questions: publicCodes.size,
      source: catalog.source || null,
    },
    classification_counts: counts,
    expected_counts: expected,
    expected_matches: evaluation.matches,
    targets_sha256: targetsSha256,
    targets: classification.targets,
  });

  const receipt = {
    schema_version: '2.0',
    operation_id: OPERATION_ID,
    mode: 'dry-run',
    status,
    created_at: createdAt,
    source_sha: process.env.GITHUB_SHA || null,
    classification_counts: counts,
    expected: {expected, matches: evaluation.matches, all_match: evaluation.all_match},
    safety: {
      public_catalog_reconstructed: publicCodes.size === expected.public_catalog,
      complete_public_records_preserved: counts.complete_public_records === expected.public_catalog,
      zero_complete_public_overlap: counts.target_complete_public_overlap === 0,
      zero_editorial_candidate_overlap: counts.target_candidate_overlap === 0,
      approved_for_execution: evaluation.all_match,
    },
    overlaps: {
      complete_public_records: classification.targetCompletePublicOverlap,
      editorial_candidates: classification.targetCandidateOverlap,
    },
    targets_path: path.relative(root, TARGETS_PATH),
    targets_sha256: targetsSha256,
  };
  await writeJson(DRY_RUN_RECEIPT_PATH, receipt);
  console.log(JSON.stringify({status, counts, safety: receipt.safety}, null, 2));
  if (status !== 'approved') throw new Error('O dry-run não atingiu todas as invariantes autorizadas.');
}

async function execute(trigger) {
  const [targetFile, dryReceipt, publicData, rowsBefore] = await Promise.all([
    fs.readFile(TARGETS_PATH, 'utf8').then(JSON.parse),
    fs.readFile(DRY_RUN_RECEIPT_PATH, 'utf8').then(JSON.parse),
    readPublicCodes(),
    readAllActive(),
  ]);
  if (targetFile.operation_id !== OPERATION_ID || dryReceipt.operation_id !== OPERATION_ID) {
    throw new Error('Os recibos pertencem a outra operação.');
  }
  if (dryReceipt.status !== 'approved' || dryReceipt.safety?.approved_for_execution !== true) {
    throw new Error('A execução real exige um dry-run aprovado.');
  }
  const approvedIds = (targetFile.targets || []).map(target => clean(target.notion_id)).filter(Boolean).sort();
  const approvedHash = hash(approvedIds.join('\n'));
  if (approvedHash !== targetFile.targets_sha256 || approvedHash !== dryReceipt.targets_sha256) {
    throw new Error('O hash do conjunto aprovado diverge dos recibos.');
  }

  const currentClassification = classify(rowsBefore, publicData.codes);
  const currentIds = currentClassification.targets.map(target => target.notion_id).sort();
  const currentHash = hash(currentIds.join('\n'));
  const expected = expectedCounts(trigger);
  const currentCounts = countsFrom(currentClassification, rowsBefore, publicData.codes);
  const currentEvaluation = evaluate(currentCounts, expected);
  if (!currentEvaluation.all_match || currentHash !== approvedHash) {
    throw new Error(`O Banco Mestre mudou após o dry-run: ${JSON.stringify({currentCounts, currentMatches: currentEvaluation.matches, approvedHash, currentHash})}`);
  }

  const startedAt = new Date().toISOString();
  const results = [];
  for (let index = 0; index < targetFile.targets.length; index += 1) {
    const target = targetFile.targets[index];
    try {
      const updated = await request(`/pages/${target.notion_id}`, {
        method: 'PATCH',
        body: JSON.stringify({in_trash: true}),
      });
      if (updated.in_trash !== true) throw new Error('A resposta não confirmou in_trash=true.');
      results.push({notion_id: target.notion_id, code: target.code, status: 'trashed'});
    } catch (error) {
      results.push({
        notion_id: target.notion_id,
        code: target.code,
        status: 'failed',
        error: String(error?.message || error),
      });
    }
    if ((index + 1) % 50 === 0 || index + 1 === targetFile.targets.length) {
      console.log(`Lixeira: ${index + 1}/${targetFile.targets.length}; falhas: ${results.filter(item => item.status === 'failed').length}.`);
    }
    await sleep(360);
  }

  const rowsAfter = await readAllActive();
  const afterClassification = classify(rowsAfter, publicData.codes);
  const activeAfterIds = new Set(rowsAfter.map(row => row.notion_id));
  const remainingTargets = targetFile.targets.filter(target => activeAfterIds.has(target.notion_id));
  const failures = results.filter(item => item.status === 'failed');
  const afterCounts = countsFrom(afterClassification, rowsAfter, publicData.codes);
  const postconditions = {
    zero_remaining_targets: remainingTargets.length === 0,
    zero_api_failures: failures.length === 0,
    active_rows: rowsAfter.length === rowsBefore.length - targetFile.targets.length,
    complete_public_records: afterCounts.complete_public_records === expected.public_catalog,
    editorial_candidates: afterCounts.editorial_candidates === expected.editorial_candidates,
    pending_blockers_removed: afterCounts.pending_blockers === 0,
    traceability_incomplete_removed: afterCounts.traceability_incomplete === 0,
    excess_historical_removed: afterCounts.excess_historical === 0,
  };
  const status = Object.values(postconditions).every(Boolean) ? 'success' : 'partial';
  const receipt = {
    schema_version: '2.0',
    operation_id: OPERATION_ID,
    mode: 'execute',
    status,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    source_sha: process.env.GITHUB_SHA || null,
    targets_sha256: approvedHash,
    target_count: targetFile.targets.length,
    active_before: rowsBefore.length,
    active_after: rowsAfter.length,
    trashed_confirmed_by_response: results.filter(item => item.status === 'trashed').length,
    failures,
    remaining_active_count: remainingTargets.length,
    remaining_active: remainingTargets.slice(0, 200),
    after_counts: afterCounts,
    postconditions,
    public_site_changed: false,
    publication_workflow_dispatched: false,
  };
  await writeJson(EXECUTION_RECEIPT_PATH, receipt);
  console.log(JSON.stringify({status, target_count: receipt.target_count, active_after: receipt.active_after, postconditions}, null, 2));
  if (status !== 'success') throw new Error('A movimentação para a lixeira terminou parcialmente; consulte o recibo.');
}

const trigger = JSON.parse(await fs.readFile(TRIGGER_PATH, 'utf8'));
if (trigger.operation_id !== OPERATION_ID) throw new Error('Gatilho inválido.');
if (trigger.mode === 'dry-run') await dryRun(trigger);
else if (trigger.mode === 'execute') await execute(trigger);
else throw new Error(`Modo não suportado: ${trigger.mode}`);
