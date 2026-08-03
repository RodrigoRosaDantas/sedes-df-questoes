import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marker = JSON.parse(fs.readFileSync(path.join(root, 'data/operations/publish-seedf-dir-50.json'), 'utf8'));
const before = JSON.parse(fs.readFileSync(process.env.SNAPSHOT_BEFORE || '/tmp/published-before.json', 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'data/notion/published.json'), 'utf8'));
const plan = JSON.parse(fs.readFileSync(path.join(root, 'data/notion/publication-plan.json'), 'utf8'));

const fail = message => { throw new Error(message); };
const clean = value => String(value ?? '').trim();
const operationId = 'SEEDF-2025-DIR-A-071-120-20260802';
const prefix = 'PROVA-QDX-SEEDF-2025-DIR-A-';
const expectedCodes = Array.from({length: 50}, (_, index) => `${prefix}${String(index + 71).padStart(3, '0')}`);
const expectedSet = new Set(expectedCodes);

if (marker.operation_id !== operationId || marker.authorized !== true) {
  fail('Marcador da operação ausente, divergente ou sem autorização explícita.');
}
if (marker.scope?.expected_count !== 50
  || marker.scope?.first_original_number !== 71
  || marker.scope?.last_original_number !== 120
  || marker.scope?.code_prefix !== prefix) {
  fail('Escopo registrado não corresponde às questões 71 a 120 de Direito.');
}

const candidates = (snapshot.records || []).filter(record => !clean(record.github_id));
if (candidates.length !== 50) {
  fail(`A operação exige exatamente 50 registros sem Código GitHub; encontrados ${candidates.length}.`);
}

const actualCodes = candidates.map(record => clean(record.code)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
if (JSON.stringify(actualCodes) !== JSON.stringify(expectedCodes)) {
  const unexpected = actualCodes.filter(code => !expectedSet.has(code));
  const missing = expectedCodes.filter(code => !actualCodes.includes(code));
  fail(`Códigos divergentes. Inesperados: ${unexpected.join(', ') || 'nenhum'}; ausentes: ${missing.join(', ') || 'nenhum'}.`);
}

for (const record of candidates) {
  if (record.publication_lot !== operationId) fail(`${record.code}: lote divergente.`);
  if (record.released_for_export !== true) fail(`${record.code}: não está explicitamente liberada.`);
  if (record.material_type !== 'Prova') fail(`${record.code}: tipo de material diferente de Prova.`);
  if (record.annulled === true) fail(`${record.code}: questão anulada não pode entrar no lote.`);
  if (record.has_image === true) fail(`${record.code}: questão com imagem não pode entrar nesta operação.`);
  if (Number(record.original_number) < 71 || Number(record.original_number) > 120) {
    fail(`${record.code}: número original fora do intervalo autorizado.`);
  }
  if (!clean(record.prompt) || !clean(record.answer) || !clean(record.comment)) {
    fail(`${record.code}: conteúdo essencial incompleto.`);
  }
  if (record.format !== 'Certo / Errado') fail(`${record.code}: formato inesperado (${record.format}).`);
  if (!['Certo', 'Errado'].includes(record.answer)) fail(`${record.code}: gabarito inválido (${record.answer}).`);
}

if (plan.total_records !== 50 || !Array.isArray(plan.lots) || plan.lots.length !== 1) {
  fail('Plano de publicação deve conter exatamente um lote e 50 registros.');
}
const [lot] = plan.lots;
if (lot.lot !== operationId || lot.expected_count !== 50 || JSON.stringify(lot.codes) !== JSON.stringify(expectedCodes)) {
  fail('Plano de publicação não corresponde exatamente ao lote autorizado.');
}

const ignoredKeys = new Set(['notion_last_edited_time']);
const stable = record => Object.fromEntries(Object.entries(record || {}).filter(([key]) => !ignoredKeys.has(key)));
const currentByCode = new Map((snapshot.records || []).map(record => [clean(record.code), record]));
for (const previous of before.records || []) {
  if (!clean(previous.github_id)) continue;
  const current = currentByCode.get(clean(previous.code));
  if (!current) fail(`${previous.code}: questão já publicada desapareceu do snapshot.`);
  if (JSON.stringify(stable(current)) !== JSON.stringify(stable(previous))) {
    fail(`${previous.code}: conteúdo já publicado mudou fora do escopo desta operação.`);
  }
}

console.log('✓ Operação restrita validada: 50 questões de Direito (71–120), um único lote e acervo anterior preservado.');
