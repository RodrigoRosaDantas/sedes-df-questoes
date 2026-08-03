import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const snapshot = read('data/notion/published.json');
const plan = read('data/notion/publication-plan.json');
const marker = read('data/operations/prepare-crefito17-agentefiscal-62.json');
const clean = value => String(value ?? '').trim();
const fail = message => { throw new Error(message); };
const operationId = 'CREFITO17-2026-AGENTE-FISCAL-APTOS-62-20260803';
const prefix = 'PROVA-QDX-CREFITO17-2026-AGENTE-FISCAL-401-';
const historicalReceipt = 'release-2.13.0:8a528d925807db558967a3ff0a956006e87356a5';

if (marker.operation_id !== operationId || marker.authorized !== true) fail('Marcador da operação inválido.');
if (marker.scope?.expected_new_count !== 62 || marker.scope?.historical_public_count !== 57) fail('Contagens do marcador divergentes.');

const historical = (snapshot.records || []).filter(record => clean(record.code).startsWith(prefix) && clean(record.github_id));
const candidates = (snapshot.records || []).filter(record => clean(record.code).startsWith(prefix) && !clean(record.github_id));
if (historical.length !== 57) fail(`Esperados 57 registros históricos; encontrados ${historical.length}.`);
if (candidates.length !== 62) fail(`Esperados 62 registros novos; encontrados ${candidates.length}.`);
for (const record of historical) {
  if (clean(record.github_id) !== historicalReceipt) fail(`${record.code}: recibo histórico divergente.`);
}

const historicalNumbers = new Set(historical.map(record => Number(record.original_number)));
const expectedNumbers = Array.from({length: 120}, (_, index) => index + 1)
  .filter(number => number !== 46 && !historicalNumbers.has(number));
const expectedCodes = expectedNumbers.map(number => `${prefix}${String(number).padStart(3, '0')}`);
const codes = candidates.map(record => clean(record.code)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
if (JSON.stringify(codes) !== JSON.stringify(expectedCodes)) fail('Conjunto de códigos inéditos divergente.');

for (const record of candidates) {
  if (record.publication_lot !== operationId || record.released_for_export !== true) fail(`${record.code}: lote ou liberação divergente.`);
  if (record.material_type !== 'Prova' || record.annulled === true || record.has_image === true) fail(`${record.code}: impedimento técnico.`);
  if (!clean(record.prompt) || !clean(record.answer) || !clean(record.comment) || !clean(record.foundation)) fail(`${record.code}: conteúdo essencial incompleto.`);
  if (!clean(record.discipline) || !clean(record.subject) || !clean(record.source_url)) fail(`${record.code}: metadados essenciais incompletos.`);
  if (record.format !== 'Certo / Errado' || !['Certo', 'Errado'].includes(record.answer)) fail(`${record.code}: formato ou gabarito inválido.`);
  const number = Number(record.original_number);
  if (!expectedNumbers.includes(number) || number === 46) fail(`${record.code}: número original fora do escopo apto.`);
}

if (plan.total_records !== 62 || !Array.isArray(plan.lots) || plan.lots.length !== 1) fail('Plano deve conter um lote e 62 registros.');
const [lot] = plan.lots;
if (lot.lot !== operationId || lot.expected_count !== 62 || JSON.stringify(lot.codes) !== JSON.stringify(expectedCodes)) {
  fail('Plano divergente do lote autorizado.');
}
console.log('✓ Operação restrita validada: 62 questões inéditas de Agente Fiscal; item 46 e 57 históricos preservados.');
