import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'data', 'notion', 'published.json');
const operation = JSON.parse(fs.readFileSync(path.join(root, 'data', 'operations', 'prepare-crfa1-analista-115.json'), 'utf8'));
const operationId = operation.operation_id;
const prefix = operation.code_prefix;
const blocked = new Set(operation.blocked_original_numbers.map(Number));
const clean = value => String(value ?? '').trim();
const fail = message => { throw new Error(message); };

const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Array.isArray(snapshot.records)) fail('Snapshot exportado sem registros.');

const expectedNumbers = Array.from({length: 120}, (_, index) => index + 1).filter(number => !blocked.has(number));
const expectedCodes = expectedNumbers.map(number => `${prefix}${String(number).padStart(3, '0')}`);
const scoped = snapshot.records.filter(record => clean(record.code).startsWith(prefix));
const forbidden = scoped.filter(record => blocked.has(Number(record.original_number)));
if (forbidden.length) fail(`Itens bloqueados apareceram no snapshot publicável: ${forbidden.map(item => item.code).join(', ')}.`);
const historical = scoped.filter(record => clean(record.github_id));
if (historical.length) fail(`A prova CRFa-1 deveria ser inédita; encontrados ${historical.length} registros históricos.`);

const candidates = scoped.filter(record => !clean(record.github_id)
  && record.released_for_export === true
  && clean(record.publication_lot) === operationId);
if (candidates.length !== operation.expected_additions) {
  fail(`Esperadas ${operation.expected_additions} questões liberadas do CRFa-1; encontradas ${candidates.length}.`);
}

const numbers = candidates.map(record => Number(record.original_number)).sort((a, b) => a - b);
if (JSON.stringify(numbers) !== JSON.stringify(expectedNumbers)) {
  fail(`Sequência divergente no lote CRFa-1: ${numbers.join(',')}.`);
}
const codes = candidates.map(record => clean(record.code)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
if (JSON.stringify(codes) !== JSON.stringify(expectedCodes)) fail('Códigos do lote CRFa-1 estão incompletos, fora de ordem ou duplicados.');

for (const record of candidates) {
  if (record.annulled) fail(`${record.code}: item anulado entrou no escopo.`);
  if (record.has_image) fail(`${record.code}: item com imagem entrou no escopo.`);
  if (!clean(record.prompt)) fail(`${record.code}: enunciado ausente.`);
  if (!clean(record.comment)) fail(`${record.code}: comentário geral ausente.`);
  if (!['Certo', 'Errado'].includes(clean(record.answer))) fail(`${record.code}: gabarito inválido.`);
}

const all = Number(snapshot.totals?.all);
if (!Number.isInteger(all) || all < candidates.length) fail('Total global do Banco Mestre inválido.');
snapshot.records = candidates.sort((a, b) => Number(a.original_number) - Number(b.original_number));
snapshot.publication_scope = {operation: operationId, codes: expectedCodes};
snapshot.totals = {
  ...snapshot.totals,
  publicable_rows_before_deduplication: candidates.length,
  duplicate_publicable_rows_ignored: 0,
  published: candidates.length,
  pending: all - candidates.length,
  materials: 1,
};
snapshot.source = {
  ...snapshot.source,
  publication_rule: `${clean(snapshot.source?.publication_rule)}; operação aditiva restrita ao lote ${operationId}; nenhum conteúdo público anterior é reexportado por este pacote`,
};
snapshot.generated_at = new Date().toISOString();
fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`✓ Snapshot restrito ao CRFa-1: 115 questões canônicas; bloqueios 5, 48, 54, 102 e 104 excluídos.`);
