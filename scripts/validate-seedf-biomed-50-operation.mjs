import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const snapshot = read('data/notion/published.json');
const plan = read('data/notion/publication-plan.json');
const marker = read('data/operations/prepare-seedf-biomed-50.json');
const clean = value => String(value ?? '').trim();
const fail = message => { throw new Error(message); };
const operationId = 'SEEDF-2025-BIOMED-A-071-120-20260802';
const prefix = 'PROVA-QDX-SEEDF-2025-BIOMED-A-';
const expectedCodes = Array.from({length: 50}, (_, index) => `${prefix}${String(index + 71).padStart(3, '0')}`);

if (marker.operation_id !== operationId || marker.authorized !== true || marker.scope?.expected_count !== 50) fail('Marcador da operação inválido.');
const candidates = (snapshot.records || []).filter(record => !clean(record.github_id));
if (candidates.length !== 50) fail(`Esperados 50 registros novos; encontrados ${candidates.length}.`);
const codes = candidates.map(record => clean(record.code)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
if (JSON.stringify(codes) !== JSON.stringify(expectedCodes)) fail('Sequência de códigos de Biomedicina divergente.');
for (const record of candidates) {
  if (record.publication_lot !== operationId || record.released_for_export !== true) fail(`${record.code}: lote ou liberação divergente.`);
  if (record.material_type !== 'Prova' || record.annulled === true || record.has_image === true) fail(`${record.code}: impedimento técnico.`);
  if (!clean(record.prompt) || !clean(record.answer) || !clean(record.comment)) fail(`${record.code}: conteúdo essencial incompleto.`);
  if (record.format !== 'Certo / Errado' || !['Certo', 'Errado'].includes(record.answer)) fail(`${record.code}: formato ou gabarito inválido.`);
  const number = Number(record.original_number);
  if (number < 71 || number > 120) fail(`${record.code}: número original fora do escopo.`);
}
if (plan.total_records !== 50 || !Array.isArray(plan.lots) || plan.lots.length !== 1) fail('Plano deve conter um lote e 50 registros.');
const [lot] = plan.lots;
if (lot.lot !== operationId || lot.expected_count !== 50 || JSON.stringify(lot.codes) !== JSON.stringify(expectedCodes)) fail('Plano divergente do lote autorizado.');
console.log('✓ Operação restrita validada: 50 questões de Biomedicina (71–120), um único lote.');
