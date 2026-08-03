import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const snapshot = read('data/notion/published.json');
const plan = read('data/notion/publication-plan.json');
const marker = read('data/operations/prepare-seedf-eletrot-43.json');
const clean = value => String(value ?? '').trim();
const fail = message => { throw new Error(message); };
const operationId = 'SEEDF-2025-ELETROT-A-071-120-20260803';
const prefix = 'PROVA-QDX-SEEDF-2025-ELETROT-A-';
const excludedNumbers = new Set([76, 77, 78, 79, 80, 94, 102]);
const expectedCodes = Array.from({length: 50}, (_, index) => index + 71)
  .filter(number => !excludedNumbers.has(number))
  .map(number => `${prefix}${String(number).padStart(3, '0')}`);

if (marker.operation_id !== operationId || marker.authorized !== true || marker.scope?.expected_count !== 43) fail('Marcador da operação inválido.');
const candidates = (snapshot.records || []).filter(record => !clean(record.github_id));
if (candidates.length !== 43) fail(`Esperados 43 registros novos; encontrados ${candidates.length}.`);
const codes = candidates.map(record => clean(record.code)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
if (JSON.stringify(codes) !== JSON.stringify(expectedCodes)) fail('Conjunto de códigos de Eletrotécnica divergente.');
for (const record of candidates) {
  if (record.publication_lot !== operationId || record.released_for_export !== true) fail(`${record.code}: lote ou liberação divergente.`);
  if (record.material_type !== 'Prova' || record.annulled === true || record.has_image === true) fail(`${record.code}: impedimento técnico.`);
  if (!clean(record.prompt) || !clean(record.answer) || !clean(record.comment) || !clean(record.foundation)) fail(`${record.code}: conteúdo essencial incompleto.`);
  if (record.format !== 'Certo / Errado' || !['Certo', 'Errado'].includes(record.answer)) fail(`${record.code}: formato ou gabarito inválido.`);
  const number = Number(record.original_number);
  if (number < 71 || number > 120 || excludedNumbers.has(number)) fail(`${record.code}: número original fora do escopo apto.`);
}
if (plan.total_records !== 43 || !Array.isArray(plan.lots) || plan.lots.length !== 1) fail('Plano deve conter um lote e 43 registros.');
const [lot] = plan.lots;
if (lot.lot !== operationId || lot.expected_count !== 43 || JSON.stringify(lot.codes) !== JSON.stringify(expectedCodes)) fail('Plano divergente do lote autorizado.');
console.log('✓ Operação restrita validada: 43 questões aptas de Eletrotécnica, com sete exclusões documentadas.');
