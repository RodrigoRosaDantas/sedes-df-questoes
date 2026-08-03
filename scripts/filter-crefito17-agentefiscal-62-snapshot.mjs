import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'data', 'notion', 'published.json');
const operationId = 'CREFITO17-2026-AGENTE-FISCAL-APTOS-62-20260803';
const prefix = 'PROVA-QDX-CREFITO17-2026-AGENTE-FISCAL-401-';
const historicalReceipt = 'release-2.13.0:8a528d925807db558967a3ff0a956006e87356a5';
const blockedCode = `${prefix}046`;
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

if (historical.length !== 57) fail(`Esperados 57 itens históricos; encontrados ${historical.length}.`);
if (candidates.length !== 62) fail(`Esperados 62 itens inéditos; encontrados ${candidates.length}.`);
for (const record of historical) {
  if (clean(record.github_id) !== historicalReceipt) fail(`${record.code}: recibo histórico divergente.`);
}
if (scoped.some(record => clean(record.code) === blockedCode)) {
  const blocked = scoped.find(record => clean(record.code) === blockedCode);
  if (clean(blocked.github_id) || blocked.released_for_export === true || clean(blocked.publication_lot)) {
    fail(`${blockedCode}: item bloqueado entrou indevidamente no estado publicável.`);
  }
}

const historicalNumbers = new Set(historical.map(record => Number(record.original_number)));
const expectedNumbers = Array.from({length: 120}, (_, index) => index + 1)
  .filter(number => number !== 46 && !historicalNumbers.has(number));
const candidateNumbers = candidates.map(record => Number(record.original_number)).sort((a, b) => a - b);
if (JSON.stringify(candidateNumbers) !== JSON.stringify(expectedNumbers)) {
  fail(`Conjunto inédito divergente. Esperado ${expectedNumbers.join(',')}; recebido ${candidateNumbers.join(',')}.`);
}
const candidateCodes = new Set(candidates.map(record => clean(record.code)));
if (candidateCodes.size !== 62 || candidateCodes.has(blockedCode)) fail('Códigos candidatos inválidos ou duplicados.');

const unrelated = snapshot.records.filter(record => !clean(record.github_id) && !candidateCodes.has(clean(record.code)));
const records = snapshot.records.filter(record => clean(record.github_id) || candidateCodes.has(clean(record.code)));
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
console.log(`✓ Snapshot restrito: 62 questões inéditas de Agente Fiscal; ${unrelated.length} registro(s) de outros lotes excluído(s) somente deste pacote.`);
