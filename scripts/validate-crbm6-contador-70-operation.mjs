import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const snapshot = read('data/notion/published.json');
const plan = read('data/notion/publication-plan.json');
const marker = read('data/operations/prepare-crbm6-contador-70.json');
const clean = value => String(value ?? '').trim();
const fail = message => { throw new Error(message); };
const operationId = 'CRBM6-2026-CONTADOR-402-001-070-20260803';
const prefix = 'PROVA-QDX-CRBM6-2026-CONTADOR-402-';
const expectedNumbers = Array.from({length: 70}, (_, index) => index + 1);
const expectedCodes = expectedNumbers.map(number => `${prefix}${String(number).padStart(3, '0')}`);

if (marker.operation_id !== operationId || marker.authorized !== true) fail('Marcador da operação inválido.');
if (marker.scope?.expected_new_count !== 70 || marker.scope?.first_original_number !== 1 || marker.scope?.last_original_number !== 70) {
  fail('Contagens ou intervalo do marcador divergentes.');
}

const candidates = (snapshot.records || []).filter(record => clean(record.code).startsWith(prefix) && !clean(record.github_id));
const historical = (snapshot.records || []).filter(record => clean(record.code).startsWith(prefix) && clean(record.github_id));
if (historical.length !== 0) fail(`Esperados zero registros históricos; encontrados ${historical.length}.`);
if (candidates.length !== 70) fail(`Esperados 70 registros novos; encontrados ${candidates.length}.`);

const codes = candidates.map(record => clean(record.code)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
if (JSON.stringify(codes) !== JSON.stringify(expectedCodes)) fail('Conjunto de códigos de Contador divergente.');

for (const record of candidates) {
  if (clean(record.publication_lot) !== operationId || record.released_for_export !== true) fail(`${record.code}: lote ou liberação divergente.`);
  if (record.material_type !== 'Prova' || record.annulled === true || record.has_image === true) fail(`${record.code}: impedimento técnico.`);
  if (!clean(record.prompt) || !clean(record.answer) || !clean(record.comment) || !clean(record.foundation) || !clean(record.pdf_page)) {
    fail(`${record.code}: conteúdo essencial ou página do PDF incompleta.`);
  }
  if (!clean(record.discipline) || !clean(record.subject) || !clean(record.source_url) || !clean(record.organization) || !clean(record.position)) {
    fail(`${record.code}: metadados essenciais incompletos.`);
  }
  if (record.format !== 'Certo / Errado' || !['Certo', 'Errado'].includes(record.answer)) fail(`${record.code}: formato ou gabarito inválido.`);
  const number = Number(record.original_number);
  if (!expectedNumbers.includes(number)) fail(`${record.code}: número original fora do intervalo 1–70.`);
}

if (plan.total_records !== 70 || !Array.isArray(plan.lots) || plan.lots.length !== 1) fail('Plano deve conter um lote e 70 registros.');
const [lot] = plan.lots;
if (lot.lot !== operationId || lot.expected_count !== 70 || JSON.stringify(lot.codes) !== JSON.stringify(expectedCodes)) {
  fail('Plano divergente do lote autorizado de Contador.');
}
console.log('✓ Operação restrita validada: 70 questões inéditas de Contador, sequência 1–70 e gates editoriais completos.');
