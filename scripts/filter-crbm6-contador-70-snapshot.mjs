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

const expectedNewNumbers = Array.from({length: 70}, (_, index) => index + 1);
const expectedNewCodes = expectedNewNumbers.map(number => `${prefix}${String(number).padStart(3, '0')}`);
const expectedHistoricalNumbers = Array.from({length: 50}, (_, index) => index + 71);
const expectedHistoricalCodes = expectedHistoricalNumbers.map(number => `${prefix}${String(number).padStart(3, '0')}`);

const historicalCodes = historical.map(record => clean(record.code)).sort((left, right) => left.localeCompare(right, 'pt-BR'));
if (JSON.stringify(historicalCodes) !== JSON.stringify(expectedHistoricalCodes)) {
  fail(`Histórico divergente. Esperados os 50 códigos 071–120; encontrados ${historicalCodes.length}.`);
}
if (historical.some(record => record.released_for_export === true || clean(record.publication_lot))) {
  fail('Os itens históricos 071–120 não podem permanecer liberados ou vinculados ao lote novo.');
}
if (candidates.length !== 70) fail(`Esperadas 70 questões liberadas; encontradas ${candidates.length}.`);

const candidateNumbers = candidates.map(record => Number(record.original_number)).sort((left, right) => left - right);
if (JSON.stringify(candidateNumbers) !== JSON.stringify(expectedNewNumbers)) {
  fail(`Sequência divergente. Esperado 1–70; recebido ${candidateNumbers.join(',')}.`);
}
const candidateCodes = candidates.map(record => clean(record.code)).sort((left, right) => left.localeCompare(right, 'pt-BR'));
if (JSON.stringify(candidateCodes) !== JSON.stringify(expectedNewCodes)) {
  fail('Códigos do lote novo de Contador estão incompletos, fora de ordem ou duplicados.');
}

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
  publication_rule: `${clean(snapshot.source?.publication_rule)}; operação restrita aos 70 itens novos do lote ${operationId}, com preservação dos 50 itens históricos 071–120`,
};
snapshot.generated_at = new Date().toISOString();
fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`✓ Snapshot restrito: 70 questões novas de Contador, 50 históricas preservadas e ${unrelated.length} registro(s) pendente(s) de outros lotes excluído(s) somente deste pacote.`);
