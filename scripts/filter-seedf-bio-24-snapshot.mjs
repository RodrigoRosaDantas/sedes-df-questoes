import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'data', 'notion', 'published.json');
const operationId = 'SEEDF-2025-BIO-A-097-120-20260802';
const prefix = 'PROVA-QDX-SEEDF-2025-BIO-A-';
const expectedCodes = Array.from({length: 24}, (_, index) => `${prefix}${String(index + 97).padStart(3, '0')}`);
const expectedSet = new Set(expectedCodes);
const clean = value => String(value ?? '').trim();
const materialKey = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const fail = message => { throw new Error(message); };

const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Array.isArray(snapshot.records)) fail('Snapshot exportado sem registros.');

const liveByCode = new Map(snapshot.records.map(record => [clean(record.code), record]));
const missing = expectedCodes.filter(code => !liveByCode.has(code));
if (missing.length) fail(`O lote de Biologia está incompleto no snapshot vivo: ${missing.join(', ')}.`);

for (const code of expectedCodes) {
  const record = liveByCode.get(code);
  if (clean(record.github_id)) fail(`${code}: já possui Código GitHub e não pode ser republicada como nova.`);
  if (record.released_for_export !== true) fail(`${code}: deixou de estar liberada para exportação.`);
  if (record.publication_lot !== operationId) fail(`${code}: lote de publicação divergente.`);
}

const unrelatedUnpublished = snapshot.records.filter(record => !clean(record.github_id) && !expectedSet.has(clean(record.code)));
const records = snapshot.records.filter(record => clean(record.github_id) || expectedSet.has(clean(record.code)));
const all = Number(snapshot.totals?.all);
if (!Number.isInteger(all) || all < records.length) fail('Total global inválido no snapshot vivo.');

snapshot.records = records;
snapshot.totals = {
  ...snapshot.totals,
  publicable_rows_before_deduplication: records.length,
  duplicate_publicable_rows_ignored: 0,
  published: records.length,
  pending: all - records.length,
  materials: new Set(records.map(record => materialKey(record.material_name))).size,
};
snapshot.source = {
  ...snapshot.source,
  publication_rule: `${clean(snapshot.source?.publication_rule)}; operação restrita ao lote ${operationId}`,
};
snapshot.generated_at = new Date().toISOString();

fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`✓ Snapshot restrito: ${records.length} registros preservados, 24 novas questões de Biologia e ${unrelatedUnpublished.length} registro(s) de outros lotes excluído(s) apenas deste pacote técnico.`);
