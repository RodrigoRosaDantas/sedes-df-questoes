import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'data', 'notion', 'published.json');
const operationId = 'CRBM6-2026-CONTADOR-402-001-070-20260803';
const prefix = 'PROVA-QDX-CRBM6-2026-CONTADOR-402-';
const clean = value => String(value ?? '').trim();
const materialKey = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const fail = message => { throw new Error(message); };

const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Array.isArray(snapshot.records)) fail('Snapshot exportado sem registros.');

const scoped = snapshot.records.filter(record => clean(record.code).startsWith(prefix));
const historical = scoped.filter(record => clean(record.github_id));
const candidates = scoped.filter(record => !clean(record.github_id)
  && record.released_for_export === true
  && clean(record.publication_lot) === operationId);

if (historical.length !== 0) fail(`A prova de Contador deveria ser inédita; encontrados ${historical.length} itens históricos.`);
if (candidates.length !== 70) fail(`Esperadas 70 questões liberadas; encontradas ${candidates.length}.`);

const expectedNumbers = Array.from({length: 70}, (_, index) => index + 1);
const candidateNumbers = candidates.map(record => Number(record.original_number)).sort((a, b) => a - b);
if (JSON.stringify(candidateNumbers) !== JSON.stringify(expectedNumbers)) {
  fail(`Sequência divergente. Esperado 1–70; recebido ${candidateNumbers.join(',')}.`);
}
const expectedCodes = expectedNumbers.map(number => `${prefix}${String(number).padStart(3, '0')}`);
const candidateCodes = candidates.map(record => clean(record.code)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
if (JSON.stringify(candidateCodes) !== JSON.stringify(expectedCodes)) fail('Códigos do lote de Contador estão incompletos, fora de ordem ou duplicados.');

const candidateSet = new Set(candidateCodes);
const unrelated = snapshot.records.filter(record => !clean(record.github_id) && !candidateSet.has(clean(record.code)));
const records = snapshot.records.filter(record => clean(record.github_id) || candidateSet.has(clean(record.code)));
const all = Number(snapshot.totals?.all);
if (!Number.isInteger(all) || all < records.length) fail('Total global inválido.');

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
console.log(`✓ Snapshot restrito: 70 questões inéditas de Contador; ${unrelated.length} registro(s) de outros lotes excluído(s) somente deste pacote.`);
