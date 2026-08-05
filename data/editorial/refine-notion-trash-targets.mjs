import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const prefix = path.join(root, 'data', 'editorial', 'notion-trash-classified-20260804');
const targetsPath = `${prefix}-targets.json`;
const receiptPath = `${prefix}-dry-run-receipt.json`;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

const [targets, receipt] = await Promise.all([
  fs.readFile(targetsPath, 'utf8').then(JSON.parse),
  fs.readFile(receiptPath, 'utf8').then(JSON.parse),
]);
const ids = (targets.targets || []).map(target => String(target.notion_id || '').trim()).filter(Boolean).sort();
const calculatedHash = hash(ids.join('\n'));
const counts = receipt.classification_counts || {};
const valid = receipt.operation_id === 'NOTION-TRASH-CLASSIFIED-20260804'
  && receipt.mode === 'dry-run'
  && receipt.status === 'approved'
  && receipt.safety?.approved_for_execution === true
  && targets.operation_id === receipt.operation_id
  && targets.targets_sha256 === calculatedHash
  && receipt.targets_sha256 === calculatedHash
  && ids.length === 2088
  && counts.pending_blockers === 1627
  && counts.traceability_incomplete === 415
  && counts.excess_historical === 46
  && counts.union_targets === 2088
  && counts.public_catalog === 2871
  && counts.complete_public_records === 2871
  && counts.editorial_candidates === 75
  && counts.target_complete_public_overlap === 0
  && counts.target_candidate_overlap === 0;

console.log(JSON.stringify({valid, counts, target_count: ids.length, targets_sha256: calculatedHash}, null, 2));
if (!valid) throw new Error('O conjunto imutável de alvos não passou na validação final.');
