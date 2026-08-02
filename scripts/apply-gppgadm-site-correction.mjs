import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resolve = relative => path.resolve(root, String(relative).replace(/^\.\//, ''));
const readJSON = relative => JSON.parse(fs.readFileSync(resolve(relative), 'utf8'));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };

const operation = readJSON('data/operations/gppgadm-site-correction-2026-08-02.json');
const catalogPath = resolve('data/release/catalogo.json');
const manifestPath = resolve('data/release/manifest.json');
const receiptPath = resolve('data/release/gppgadm-site-correction-receipt.json');
const catalog = readJSON('data/release/catalogo.json');
const manifest = readJSON('data/release/manifest.json');
const canonical = readJSON(operation.canonical_source);

if (operation.operation_id !== 'GPPGADM-SITE-CORRECTION-2026-08-02') {
  fail(`Operação corretiva inesperada: ${operation.operation_id || 'ausente'}.`);
}
if (Number(catalog.summary?.questoes) !== operation.expected_questions_before) {
  fail(`Acervo anterior divergente: ${catalog.summary?.questoes}; esperado ${operation.expected_questions_before}.`);
}

const canonicalByCode = new Map((canonical.questoes || []).map(question => [question.codigo, question]));
const annulledCode = operation.remove_codes?.[0];
const correctedCode = operation.replace_codes?.[0];
const annulled = canonicalByCode.get(annulledCode);
const corrected = canonicalByCode.get(correctedCode);
if (!annulled || annulled.gabarito !== 'Anulada' || annulled.anulada !== true) {
  fail(`${annulledCode}: a fonte canônica não registra a anulação.`);
}
if (!corrected || corrected.gabarito !== 'Certo' || corrected.anulada !== false) {
  fail(`${correctedCode}: a fonte canônica não registra o gabarito definitivo Certo.`);
}

const metadata = (catalog.materials || []).find(item => item.id === operation.material_id);
if (!metadata) fail(`Material não localizado: ${operation.material_id}.`);
const materialPath = resolve(metadata.file);
const material = JSON.parse(fs.readFileSync(materialPath, 'utf8'));
const before = material.questoes.length;
const publicAnnulled = material.questoes.filter(question => question.codigo === annulledCode);
const publicCorrected = material.questoes.filter(question => question.codigo === correctedCode);
if (publicAnnulled.length !== 1) fail(`${annulledCode}: ocorrência pública ${publicAnnulled.length}; esperada uma.`);
if (publicCorrected.length !== 1) fail(`${correctedCode}: ocorrência pública ${publicCorrected.length}; esperada uma.`);

const existing = publicCorrected[0];
const preserved = {
  id: existing.id,
  codigo: existing.codigo,
  codigo_fonte: existing.codigo_fonte,
  fonte_consolidada: existing.fonte_consolidada,
  auditoria: existing.auditoria,
};
Object.assign(existing, corrected, Object.fromEntries(Object.entries(preserved).filter(([, value]) => value !== undefined)));
existing.auditoria = 'Banco Mestre — Ajustada; gabarito oficial sincronizado em 02/08/2026';
existing.fonte_consolidada = operation.source_review_url;

material.questoes = material.questoes.filter(question => question.codigo !== annulledCode);
material.quantidade_questoes = material.questoes.length;
metadata.quantidade_questoes = material.quantidade_questoes;
if (before - material.questoes.length !== 1) fail('A correção não retirou exatamente uma questão anulada.');
if (material.quantidade_questoes !== operation.expected_material_questions_after) {
  fail(`Material final com ${material.quantidade_questoes} questões; esperado ${operation.expected_material_questions_after}.`);
}

delete catalog.question_index[publicAnnulled[0].id];
catalog.summary.questoes = Object.keys(catalog.question_index || {}).length;
catalog.summary.aguardando_auditoria = Math.max(0, Number(catalog.summary.banco_mestre) - catalog.summary.questoes);
if (catalog.summary.questoes !== operation.expected_questions_after) {
  fail(`Acervo final com ${catalog.summary.questoes} questões; esperado ${operation.expected_questions_after}.`);
}

const materialContent = `${JSON.stringify(material)}\n`;
fs.writeFileSync(materialPath, materialContent);
const catalogContent = `${JSON.stringify(catalog, null, 2)}\n`;
fs.writeFileSync(catalogPath, catalogContent);
manifest.summary = catalog.summary;
manifest.catalog_sha256 = sha256(catalogContent);
const manifestEntry = (manifest.materials || []).find(item => item.id === operation.material_id);
if (!manifestEntry) fail(`Material ausente do manifesto: ${operation.material_id}.`);
manifestEntry.questions = material.quantidade_questoes;
manifestEntry.bytes = Buffer.byteLength(materialContent);
manifestEntry.sha256 = sha256(materialContent);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const receipt = {
  schema_version: '1.0',
  operation_id: operation.operation_id,
  applied_at: new Date().toISOString(),
  source_of_truth: operation.source_of_truth,
  material_id: operation.material_id,
  removed_codes: operation.remove_codes,
  replaced_codes: operation.replace_codes,
  questions_before: operation.expected_questions_before,
  questions_after: catalog.summary.questoes,
  material_questions_after: material.quantidade_questoes,
  preserved_public_id: existing.id,
  scope: operation.scope,
};
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log('✓ Correção GPPGADM aplicada: item 31 retirado, item 113 restaurado para Certo e IDs restantes preservados.');
