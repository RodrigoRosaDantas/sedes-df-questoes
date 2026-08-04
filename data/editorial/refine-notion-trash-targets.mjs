import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const prefix = path.join(root, 'data', 'editorial', 'notion-trash-classified-20260804');
const targetsPath = `${prefix}-targets.json`;
const receiptPath = `${prefix}-dry-run-receipt.json`;
const publicCodesPath = `${prefix}-public-codes.json`;
const expected = {
  pending_blockers: 1627,
  traceability_incomplete: 415,
  excess_historical: 46,
  union_targets: 2088,
  public_snapshot: 2871,
  editorial_candidates: 75,
};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clean = value => String(value ?? '').trim();

const [targetFile, oldReceipt, publicCatalog] = await Promise.all([
  fs.readFile(targetsPath, 'utf8').then(JSON.parse),
  fs.readFile(receiptPath, 'utf8').then(JSON.parse),
  fs.readFile(publicCodesPath, 'utf8').then(JSON.parse),
]);
if (publicCatalog.questions !== expected.public_snapshot
  || publicCatalog.unique_codes !== expected.public_snapshot
  || publicCatalog.codes?.length !== expected.public_snapshot) {
  throw new Error(`Catálogo público inválido: ${JSON.stringify(publicCatalog)}`);
}
const publicCodes = new Set(publicCatalog.codes.map(clean));
const excessReasons = new Set([
  'rastreabilidade_excedente_ao_snapshot_publico',
  'rastreabilidade_excedente_ao_catalogo_publico',
]);
const targets = (targetFile.targets || []).filter(target => {
  const reasons = target.reasons || [];
  const hasNonExcessReason = reasons.some(reason => !excessReasons.has(reason));
  return hasNonExcessReason || !publicCodes.has(clean(target.code));
}).map(target => ({
  ...target,
  public_snapshot_member: publicCodes.has(clean(target.code)),
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
const publicOverlap = targets.filter(target => publicCodes.has(clean(target.code)));
const counts = {
  all_active: oldReceipt.classification_counts?.all_active ?? null,
  pending_blockers: pending.length,
  traceability_incomplete: traceability.length,
  excess_historical: excess.length,
  union_targets: targets.length,
  public_snapshot: publicCatalog.unique_codes,
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
  schema_version: '1.2',
  created_at: createdAt,
  classification_counts: counts,
  expected_counts: expected,
  expected_matches: matches,
  public_reconciliation: {
    source: publicCatalog.source,
    public_codes: publicCatalog.unique_codes,
  },
  targets_sha256: targetsSha256,
  targets,
};
const receipt = {
  schema_version: '1.2',
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
    public_catalog_reconstructed: publicCatalog.unique_codes === 2871,
    zero_public_catalog_overlap: publicOverlap.length === 0,
    zero_editorial_candidate_overlap: counts.target_candidate_overlap === 0,
    approved_for_execution: approved,
  },
  overlaps: {public_catalog: publicOverlap.slice(0, 100), editorial_candidates: []},
  targets_path: path.relative(root, targetsPath),
  targets_sha256: targetsSha256,
};
await fs.writeFile(targetsPath, `${JSON.stringify(refinedTargetFile, null, 2)}\n`);
await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({status: receipt.status, counts, safety: receipt.safety}, null, 2));
if (!approved) throw new Error('O refinamento dos alvos não foi aprovado.');
