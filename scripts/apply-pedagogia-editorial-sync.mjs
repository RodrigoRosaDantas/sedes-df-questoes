import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resolve = relative => path.resolve(root, String(relative).replace(/^\.\//, ''));
const correctionsPath = resolve('data/editorial-runtime/pedagogia-sync-2026-08-02.json');
const catalogPath = resolve('data/release/catalogo.json');
const manifestPath = resolve('data/release/manifest.json');
const receiptPath = resolve('data/release/pedagogia-editorial-sync-receipt.json');
const operationId = 'PLATFORM-EDITORIAL-SYNC-PEDAGOGIA-2026-08-02';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const clean = value => String(value ?? '').trim();

if (!fs.existsSync(correctionsPath)) throw new Error('Arquivo temporário do saneamento de Pedagogia não foi gerado.');
const registry = JSON.parse(fs.readFileSync(correctionsPath, 'utf8'));
const corrections = Array.isArray(registry.corrections) ? registry.corrections : [];
if (registry.operation_id !== operationId) throw new Error(`Operação inesperada: ${registry.operation_id || 'ausente'}.`);
if (corrections.length !== 72) throw new Error(`Correções de Pedagogia: ${corrections.length}; esperado 72.`);

const byCode = new Map();
for (const correction of corrections) {
  const code = clean(correction.code);
  if (!code || byCode.has(code)) throw new Error(`Código ausente ou duplicado: ${code || 'vazio'}.`);
  for (const [property, label] of [
    ['comment', 'comentário'], ['foundation', 'fundamento'], ['subsubject', 'subassunto'],
    ['trap', 'pegadinha'], ['source_url', 'fonte'], ['audit', 'auditoria'], ['reviewed_at', 'data'],
  ]) {
    if (!clean(correction[property])) throw new Error(`${code}: ${label} vazio.`);
  }
  if (correction.audit !== 'Ajustada' || correction.reviewed_at !== '2026-08-02') {
    throw new Error(`${code}: rastreabilidade editorial divergente.`);
  }
  byCode.set(code, {...correction, code, matches: 0});
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (Number(catalog.summary?.questoes) !== 2536) {
  throw new Error(`Acervo inicial divergente: ${catalog.summary?.questoes}; esperado 2536.`);
}

let changedMaterials = 0;
let updatedRecords = 0;
for (const metadata of catalog.materials || []) {
  const materialPath = resolve(metadata.file);
  const material = JSON.parse(fs.readFileSync(materialPath, 'utf8'));
  let changed = false;

  for (const question of material.questoes || []) {
    const correction = byCode.get(question.codigo) || byCode.get(question.codigo_fonte);
    if (!correction) continue;
    correction.matches += 1;
    question.comentario = correction.comment;
    question.fundamento = correction.foundation;
    question.subassunto = correction.subsubject;
    question.pegadinha = correction.trap;
    question.fonte_oficial = correction.source_url;
    question.fonte_consolidada = correction.source_url;
    question.auditoria = `Banco Mestre — Ajustada; saneamento editorial aplicado em 02/08/2026`;
    updatedRecords += 1;
    changed = true;
  }

  if (!changed) continue;
  const content = `${JSON.stringify(material)}\n`;
  fs.writeFileSync(materialPath, content);
  const manifestEntry = (manifest.materials || []).find(item => item.id === metadata.id);
  if (!manifestEntry) throw new Error(`Material ${metadata.id} ausente do manifesto.`);
  manifestEntry.bytes = Buffer.byteLength(content);
  manifestEntry.sha256 = sha256(content);
  changedMaterials += 1;
}

for (const correction of byCode.values()) {
  if (correction.matches !== 1) throw new Error(`${correction.code}: correção aplicada ${correction.matches} vez(es); esperado uma.`);
}
if (updatedRecords !== 72) throw new Error(`Aplicação editorial atualizou ${updatedRecords}; esperado 72.`);
if (Number(catalog.summary?.questoes) !== 2536) throw new Error('A sincronização alterou a quantidade de questões.');

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const receipt = {
  schema_version: '1.0',
  operation_id: operationId,
  applied_at: new Date().toISOString(),
  total_questions_preserved: 2536,
  updated_records: 72,
  full_editorial: 72,
  changed_materials: changedMaterials,
  source: 'Banco Mestre do Notion',
  material: registry.source?.material || '',
  site_scope: 'Atualização corretiva de 72 questões já publicadas; nenhum código foi adicionado ou removido.',
};
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`✓ Pedagogia sincronizada no build: 72 registros em ${changedMaterials} material(is); 2.536 questões preservadas.`);
