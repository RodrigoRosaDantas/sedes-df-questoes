import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const operationPath = path.join(root, 'data', 'operations', 'prepare-crfa1-analista-115.json');
const snapshotPath = path.join(root, 'data', 'notion', 'published.json');
const planPath = path.join(root, 'data', 'notion', 'publication-plan.json');
const operation = JSON.parse(fs.readFileSync(operationPath, 'utf8'));
const snapshotContent = fs.readFileSync(snapshotPath);
const snapshot = JSON.parse(snapshotContent.toString('utf8'));
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const clean = value => String(value ?? '').trim();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };

if (operation.operation_id !== 'CRFA1-2026-ANALISTA-400-115-20260807') fail('ID da operação CRFa-1 inesperado.');
if (operation.authorized !== true) fail('Operação CRFa-1 não autorizada.');
if (operation.expected_additions !== 115) fail('Operação deveria autorizar exatamente 115 adições.');
if (operation.expected_public_total_before !== 3046 || operation.expected_public_total_after !== 3161) {
  fail('Baseline ou total público esperado diverge do gate 3046 → 3161.');
}
const blocked = [...operation.blocked_original_numbers].map(Number).sort((a, b) => a - b);
if (JSON.stringify(blocked) !== JSON.stringify([5, 48, 54, 102, 104])) fail('Lista de bloqueios CRFa-1 divergente.');

const expectedNumbers = Array.from({length: 120}, (_, index) => index + 1).filter(number => !blocked.includes(number));
const expectedCodes = expectedNumbers.map(number => `${operation.code_prefix}${String(number).padStart(3, '0')}`);
if (!Array.isArray(snapshot.records) || snapshot.records.length !== 115) fail('Snapshot CRFa-1 deve conter exatamente 115 registros.');
const records = [...snapshot.records].sort((a, b) => Number(a.original_number) - Number(b.original_number));
const numbers = records.map(record => Number(record.original_number));
const codes = records.map(record => clean(record.code));
if (JSON.stringify(numbers) !== JSON.stringify(expectedNumbers)) fail('Sequência do snapshot CRFa-1 divergente.');
if (JSON.stringify(codes) !== JSON.stringify(expectedCodes)) fail('Códigos do snapshot CRFa-1 divergentes.');

for (const record of records) {
  if (clean(record.github_id)) fail(`${record.code}: Código GitHub deve permanecer vazio na preparação.`);
  if (clean(record.publication_lot) !== operation.operation_id) fail(`${record.code}: lote divergente.`);
  if (record.released_for_export !== true) fail(`${record.code}: não liberado para exportação.`);
  if (record.annulled) fail(`${record.code}: item anulado.`);
  if (record.has_image) fail(`${record.code}: item com imagem.`);
  if (!clean(record.prompt) || !clean(record.comment)) fail(`${record.code}: conteúdo essencial incompleto.`);
  if (!['Certo', 'Errado'].includes(clean(record.answer))) fail(`${record.code}: gabarito inválido.`);
}

const scope = snapshot.publication_scope;
if (clean(scope?.operation) !== operation.operation_id) fail('Escopo explícito do snapshot não aponta para a operação CRFa-1.');
if (JSON.stringify(scope?.codes) !== JSON.stringify(expectedCodes)) fail('Escopo explícito não contém os 115 códigos canônicos esperados.');
if (plan.total_records !== 115) fail(`Plano deveria conter 115 registros; contém ${plan.total_records}.`);
if (plan.snapshot_sha256 !== sha256(snapshotContent)) fail('Hash do snapshot no plano diverge do arquivo versionado.');
if (clean(plan.scope?.operation) !== operation.operation_id || plan.scope?.expected_count !== 115) fail('Escopo do plano CRFa-1 divergente.');
if (!Array.isArray(plan.lots) || plan.lots.length !== 1) fail('Plano CRFa-1 deve conter um único lote.');
const lot = plan.lots[0];
if (lot.lot !== operation.operation_id || lot.expected_count !== 115) fail('Lote do plano não corresponde à operação CRFa-1.');
if (JSON.stringify(lot.codes) !== JSON.stringify(expectedCodes)) fail('Lista de códigos do lote diverge do manifesto 115.');

console.log(`✓ Operação ${operation.operation_id} validada: 115 questões, 5 bloqueios excluídos, snapshot ${sha256(snapshotContent).slice(0, 16)}… e total público alvo 3161.`);
