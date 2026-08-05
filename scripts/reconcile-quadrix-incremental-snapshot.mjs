import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.resolve(root, process.env.NOTION_SNAPSHOT_PATH || 'data/notion/published.json');
const contractPath = path.resolve(root, process.env.PUBLIC_CONTRACT_PATH || 'data/operations/dashboard-contract-reconciliation.json');

if (!fs.existsSync(snapshotPath) || !fs.readFileSync(snapshotPath, 'utf8').trim()) {
  throw new Error('Snapshot incremental Quadrix ausente.');
}
if (!fs.existsSync(contractPath) || !fs.readFileSync(contractPath, 'utf8').trim()) {
  throw new Error('Recibo público reconciliado ausente.');
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
if (snapshot.schema_version !== '1.3' || snapshot.scope_mode !== 'additions') {
  throw new Error('Somente snapshots incrementais 1.3 podem ser reconciliados por esta rotina.');
}
if (contract.status !== 'success' || contract.validation?.full_npm_check !== 'success' || contract.validation?.public_browser_suite !== 'success') {
  throw new Error('O recibo público anterior não comprova um contrato integralmente validado.');
}

const existingPublic = Number(contract.expected?.questions);
const previousBank = Number(contract.expected?.banco_mestre);
const pending = Number(contract.expected?.awaiting_audit);
const previousMaterials = Number(contract.expected?.materials);
const additions = Number(snapshot.records?.length || 0);
const displayOnly = Number(snapshot.totals?.display_only || 0);
const currentBank = Number(snapshot.totals?.all);

if (![existingPublic, previousBank, pending, previousMaterials, additions, displayOnly, currentBank]
  .every(value => Number.isInteger(value) && value >= 0)) {
  throw new Error('Contagens inválidas ao reconciliar o snapshot incremental.');
}
if (additions !== 100 || displayOnly !== 2) {
  throw new Error(`Escopo incremental divergente: ${additions} objetivas e ${displayOnly} discursivas.`);
}
if (currentBank !== previousBank + additions + displayOnly) {
  throw new Error(`Banco Mestre não fecha: anterior ${previousBank} + ${additions} + ${displayOnly} != ${currentBank}.`);
}
if (currentBank !== existingPublic + additions + displayOnly + pending) {
  throw new Error(`Decomposição pública não fecha: ${existingPublic} + ${additions} + ${displayOnly} + ${pending} != ${currentBank}.`);
}

snapshot.totals.existing_public = existingPublic;
snapshot.totals.pending = pending;
snapshot.totals.previous_bank = previousBank;
snapshot.totals.previous_materials = previousMaterials;
snapshot.publication_scope.inherited_public_contract = {
  operation: contract.operation,
  source_sha: contract.source_sha,
  questions: existingPublic,
  materials: previousMaterials,
  awaiting_audit: pending,
};
snapshot.source.publication_rule = 'Adição imutável restrita aos dois lotes Quadrix, reconciliada sobre o contrato público validado de 2.871 questões e 67 materiais; duas anuladas usam exceção editorial explícita.';

fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`✓ Snapshot incremental reconciliado: ${existingPublic} públicas + ${additions} objetivas + ${displayOnly} discursivas + ${pending} em auditoria = ${currentBank}.`);
