import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPublicationPlan, validatePublicationPlan} from './publication-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.resolve(root, process.env.NOTION_SNAPSHOT_PATH || 'data/notion/published.json');
const planPath = path.resolve(root, process.env.PUBLICATION_PLAN_PATH || 'data/notion/publication-plan.json');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const expectFailure = (operation, message) => {
  let failed = false;
  try {
    operation();
  } catch {
    failed = true;
  }
  assert(failed, message);
};

const fixtureSnapshot = Buffer.from(`${JSON.stringify({
  generated_at: '2026-07-31T00:00:00.000Z',
  records: [
    {code: 'Q-002', github_id: '', publication_lot: 'LOTE-TESTE', released_for_export: true},
    {code: 'Q-001', github_id: '', publication_lot: 'LOTE-TESTE', released_for_export: true},
    {code: 'Q-003', github_id: 'id-publico-existente', publication_lot: 'LOTE-ANTIGO', released_for_export: true},
  ],
}, null, 2)}\n`);
const fixturePlan = buildPublicationPlan(fixtureSnapshot);
assert(fixturePlan.total_records === 2, 'O plano sintético não isolou os dois registros sem rastreabilidade.');
assert(fixturePlan.lots.length === 1, 'O plano sintético incluiu lote já publicado.');
assert(fixturePlan.lots[0].lot === 'LOTE-TESTE', 'O lote sintético autorizado está incorreto.');
assert(fixturePlan.lots[0].expected_count === 2, 'A contagem sintética do lote está incorreta.');
assert(JSON.stringify(fixturePlan.lots[0].codes) === JSON.stringify(['Q-001', 'Q-002']), 'Os códigos do plano não foram ordenados e fixados.');
validatePublicationPlan(fixturePlan, fixtureSnapshot);

const scopedSnapshot = Buffer.from(`${JSON.stringify({
  generated_at: '2026-08-05T00:00:00.000Z',
  publication_scope: {operation: 'TESTE-ESCOPO', codes: ['Q-NOVA-002', 'Q-NOVA-001']},
  records: [
    {code: 'Q-HERDADA', github_id: '', publication_lot: '', released_for_export: false},
    {code: 'Q-NOVA-002', github_id: '', publication_lot: 'LOTE-NOVO', released_for_export: true},
    {code: 'Q-NOVA-001', github_id: '', publication_lot: 'LOTE-NOVO', released_for_export: true},
  ],
}, null, 2)}\n`);
const scopedPlan = buildPublicationPlan(scopedSnapshot);
assert(scopedPlan.total_records === 2, 'O escopo explícito não isolou somente os novos registros.');
assert(scopedPlan.scope?.operation === 'TESTE-ESCOPO', 'A operação do escopo não foi preservada.');
assert(scopedPlan.lots[0].expected_count === 2, 'A contagem do escopo explícito está incorreta.');
assert(!scopedPlan.lots[0].codes.includes('Q-HERDADA'), 'Registro herdado sem lote entrou indevidamente no plano explícito.');
validatePublicationPlan(scopedPlan, scopedSnapshot);

const missingScopeRecord = Buffer.from(JSON.stringify({
  publication_scope: {codes: ['Q-AUSENTE']},
  records: [{code: 'Q-HERDADA', github_id: '', publication_lot: '', released_for_export: false}],
}));
expectFailure(
  () => buildPublicationPlan(missingScopeRecord),
  'Escopo explícito incompleto não foi rejeitado.',
);

const tamperedPlan = structuredClone(fixturePlan);
tamperedPlan.lots[0].expected_count = 3;
expectFailure(
  () => validatePublicationPlan(tamperedPlan, fixtureSnapshot),
  'Plano com contagem adulterada não foi rejeitado.',
);
const missingLotSnapshot = Buffer.from(JSON.stringify({
  records: [{code: 'Q-004', github_id: '', publication_lot: '', released_for_export: true}],
}));
expectFailure(
  () => buildPublicationPlan(missingLotSnapshot),
  'Registro sem lote explícito não foi rejeitado.',
);
const unreleasedSnapshot = Buffer.from(JSON.stringify({
  records: [{code: 'Q-005', github_id: '', publication_lot: 'LOTE-TESTE', released_for_export: false}],
}));
expectFailure(
  () => buildPublicationPlan(unreleasedSnapshot),
  'Registro não liberado para exportação não foi rejeitado.',
);

if (!fs.existsSync(snapshotPath)) throw new Error('Snapshot do Notion não encontrado para validar o plano.');
const snapshotContent = fs.readFileSync(snapshotPath);
const expected = buildPublicationPlan(snapshotContent);

if (!fs.existsSync(planPath)) {
  if (expected.total_records) {
    throw new Error(`Há ${expected.total_records} registro(s) no escopo sem rastreabilidade, mas nenhum plano explícito foi criado.`);
  }
  console.log('✓ Nenhum registro real aguarda rastreabilidade; testes sintéticos do plano foram aprovados.');
} else {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  validatePublicationPlan(plan, snapshotContent);
  console.log(`✓ Plano real validado: ${plan.total_records} registro(s) em ${plan.lots.length} lote(s), com códigos e contagens exatos.`);
}
