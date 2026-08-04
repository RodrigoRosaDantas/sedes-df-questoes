import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const prefix = path.join(root, 'data', 'editorial', 'notion-trash-classified-20260804');
const targetsPath = `${prefix}-targets.json`;
const receiptPath = `${prefix}-dry-run-receipt.json`;
const reconciliationPath = `${prefix}-public-reconciliation.json`;
const expected = {
  pending_blockers: 1627,
  traceability_incomplete: 415,
  excess_historical: 46,
  union_targets: 2088,
  public_snapshot: 2871,
  editorial_candidates: 75,
};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

const [targetFile, oldReceipt, reconciliation] = await Promise.all([
  fs.readFile(targetsPath, 'utf8').then(JSON.parse),
  fs.readFile(receiptPath, 'utf8').then(JSON.parse),
  fs.readFile(reconciliationPath, 'utf8').then(JSON.parse),
]);
if (reconciliation.public_records !== expected.public_snapshot
  || reconciliation.selected_ids !== expected.public_snapshot
  || reconciliation.unmatched_count !== 0
  || reconciliation.canonical_notion_ids?.length !== expected.public_snapshot) {
  throw new Error(`Reconciliação pública inválida: ${JSON.stringify(reconciliation)}`);
}
const canonicalIds = new Set(reconciliation.canonical_notion_ids);
const excessReasons = new Set([
  'rastreabilidade_excedente_ao_snapshot_publico',
  'rastreabilidade_excedente_ao_catalogo_publico',
]);
const targets = (targetFile.targets || []).filter(target => {
  const reasons = target.reasons || [];
  const hasNonExcessReason = reasons.some(reason => !excessReasons.has(reason));
  return hasNonExcessReason || !canonicalIds.has(target.notion_id);
}).map(target => ({
  ...target,
  public_snapshot_member: canonicalIds.has(target.notion_id),
  reasons: [...new Set((target.reasons || []).map(reason => excessReasons.has(reason)
    ? 'rastreabilidade_excedente_ao_catalogo_publico'
    : reason))].sort(),
}));
const pending = targets.filter(target => target.reasons.some(reason => ![
  'codigo_github_sem_data_publicacao',
  'data_publicacao_sem_codigo_github',
  'rastreabilidade_excedente_ao_catalogo_publico',
].includes(reason)));
const traceability = targets.filter(target => target.reasons.some(reason => [
  'codigo_github_sem_data_publicacao',
  'data_publicacao_sem_codigo_github',
].includes(reason)));
const excess = targets.filter(target => target.reasons.includes('rastreabilidade_excedente_ao_catalogo_publico'));
const publicOverlap = targets.filter(target => canonicalIds.has(target.notion_id));
const counts = {
  all_active: oldReceipt.classification_counts?.all_active ?? null,
  pending_blockers: pending.length,
  traceability_incomplete: traceability.length,
  excess_historical: excess.length,
  union_targets: targets.length,
  public_snapshot: reconciliation.public_records,
  editorial_candidates: oldReceipt.classification_counts?.editorial_candidates ?? null,
  target_public_overlap: publicOverlap.length,
  target_candidate_overlap: oldReceipt.classification_counts?.target_candidate_overlap ?? null,
};
const matches = Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, counts[key] === value]));
const approved = Object.values(matches).every(Boolean)
  && counts.target_public_overlap === 0
  && counts.target_candidate_overlap === 0;
const targetIds = targets.map(target => target.notion_id).sort();
const targetsSha256 = hash(targetIds.join('\n'));
const createdAt = new Date().toISOString();
const refinedTargetFile = {
  ...targetFile,
  schema_version: '1.1',
  created_at: createdAt,
  classification_counts: counts,
  expected_counts: expected,
  expected_matches: matches,
  public_reconciliation: {
    public_records: reconciliation.public_records,
    selected_ids: reconciliation.selected_ids,
    methods: reconciliation.methods,
    unmatched_count: reconciliation.unmatched_count,
  },
  targets_sha256: targetsSha256,
  targets,
};
const receipt = {
  schema_version: '1.1',
  operation_id: targetFile.operation_id,
  mode: 'dry-run',
  status: approved ? 'approved' : 'blocked',
  created_at: createdAt,
  source_sha: process.env.GITHUB_SHA || oldReceipt.source_sha || null,
  classification_counts: counts,
  expected: {expected, matches, all_match: Object.values(matches).every(Boolean)},
  public_reconciliation: refinedTargetFile.public_reconciliation,
  safety: {
    expected_counts_match: Object.values(matches).every(Boolean),
    all_public_records_matched: reconciliation.unmatched_count === 0 && reconciliation.selected_ids === reconciliation.public_records,
    zero_public_snapshot_overlap: publicOverlap.length === 0,
    zero_editorial_candidate_overlap: counts.target_candidate_overlap === 0,
    approved_for_execution: approved,
  },
  overlaps: {public_snapshot: publicOverlap.slice(0, 100), editorial_candidates: []},
  targets_path: path.relative(root, targetsPath),
  targets_sha256: targetsSha256,
};
await fs.writeFile(targetsPath, `${JSON.stringify(refinedTargetFile, null, 2)}\n`);
await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({status: receipt.status, counts, safety: receipt.safety}, null, 2));
if (!approved) throw new Error('O refinamento dos alvos não foi aprovado.');
