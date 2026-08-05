import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resolve = relative => path.resolve(root, String(relative).replace(/^\.\//, ''));
const correctionsPath = resolve('data/editorial-runtime/platform-sync-2026-08-01.json');
const catalogPath = resolve('data/release/catalogo.json');
const manifestPath = resolve('data/release/manifest.json');
const receiptPath = resolve('data/release/editorial-sync-receipt.json');
const snapshotPath = resolve('data/notion/published.json');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const clean = value => String(value ?? '').trim();

if (!fs.existsSync(correctionsPath)) {
  throw new Error('Arquivo temporário do saneamento editorial não foi gerado antes do build.');
}

const registry = JSON.parse(fs.readFileSync(correctionsPath, 'utf8'));
const corrections = Array.isArray(registry.corrections) ? registry.corrections : [];
if (registry.operation_id !== 'PLATFORM-EDITORIAL-SYNC-2026-08-01') {
  throw new Error(`Operação editorial inesperada: ${registry.operation_id || 'ausente'}.`);
}
if (corrections.length !== 165) throw new Error(`Correções editoriais: ${corrections.length}; esperado 165.`);

let incremental = false;
let scopedCodes = new Set();
if (fs.existsSync(snapshotPath) && fs.readFileSync(snapshotPath, 'utf8').trim()) {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  incremental = snapshot.schema_version === '1.3' && snapshot.scope_mode === 'additions';
  if (incremental) scopedCodes = new Set((snapshot.publication_scope?.codes || []).map(clean));
}

const byCode = new Map();
for (const correction of corrections) {
  const code = clean(correction.code);
  if (!code || byCode.has(code)) throw new Error(`Código editorial ausente ou duplicado: ${code || 'vazio'}.`);
  if (!['full_editorial', 'foundation_only'].includes(correction.scope)) {
    throw new Error(`${code}: escopo editorial inválido: ${correction.scope}.`);
  }
  if (!clean(correction.foundation)) throw new Error(`${code}: fundamento vazio.`);
  if (correction.scope === 'full_editorial') {
    for (const [property, label] of [
      ['comment', 'comentário'], ['subsubject', 'subassunto'], ['trap', 'pegadinha'], ['source_url', 'fonte'],
    ]) {
      if (!clean(correction[property])) throw new Error(`${code}: ${label} vazio.`);
    }
  }
  byCode.set(code, {...correction, code, matches: 0});
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const initialQuestionCount = Number(catalog.summary?.questoes);
let changedMaterials = 0;
let fullEditorial = 0;
let foundationOnly = 0;

for (const metadata of catalog.materials || []) {
  const materialPath = resolve(metadata.file);
  const material = JSON.parse(fs.readFileSync(materialPath, 'utf8'));
  let changed = false;

  for (const question of material.questoes || []) {
    const correction = byCode.get(question.codigo) || byCode.get(question.codigo_fonte);
    if (!correction) continue;
    correction.matches += 1;
    question.fundamento = correction.foundation;
    if (correction.scope === 'full_editorial') {
      question.comentario = correction.comment;
      question.subassunto = correction.subsubject;
      question.pegadinha = correction.trap;
      question.fonte_oficial = correction.source_url;
      question.fonte_consolidada = correction.source_url;
      question.auditoria = `Banco Mestre — ${correction.audit}; saneamento editorial aplicado em 01/08/2026`;
      fullEditorial += 1;
    } else {
      foundationOnly += 1;
    }
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

const inheritedCorrections = [];
for (const correction of byCode.values()) {
  if (correction.matches > 1) {
    throw new Error(`${correction.code}: correção aplicada ${correction.matches} vezes; esperado no máximo uma.`);
  }
  if (correction.matches === 1) continue;
  if (!incremental || scopedCodes.has(correction.code)) {
    throw new Error(`${correction.code}: correção aplicada 0 vezes; esperado exatamente uma.`);
  }
  inheritedCorrections.push(correction.code);
}

if (!incremental && (fullEditorial !== 120 || foundationOnly !== 45)) {
  throw new Error(`Aplicação editorial divergente: ${fullEditorial} completas e ${foundationOnly} fundamentos; esperado 120/45.`);
}
if (!incremental && initialQuestionCount !== 2536) {
  throw new Error(`Acervo alterado durante a sincronização: ${initialQuestionCount}; esperado 2536 questões.`);
}
if (Number(catalog.summary?.questoes) !== initialQuestionCount) {
  throw new Error(`A sincronização editorial alterou a quantidade de questões: ${initialQuestionCount} -> ${catalog.summary?.questoes}.`);
}

const appliedCorrections = fullEditorial + foundationOnly;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const receipt = {
  schema_version: incremental ? '1.1' : '1.0',
  operation_id: registry.operation_id,
  applied_at: new Date().toISOString(),
  total_questions_preserved: initialQuestionCount,
  requested_records: corrections.length,
  updated_records: appliedCorrections,
  inherited_records: inheritedCorrections.length,
  full_editorial: fullEditorial,
  foundation_only: foundationOnly,
  changed_materials: changedMaterials,
  source: 'Banco Mestre do Notion',
  mode: incremental ? 'incremental_additions' : 'full_catalog',
  site_scope: incremental
    ? 'Correções históricas aplicadas somente quando o material já integra a base desta etapa; alvos herdados ausentes foram preservados para as camadas cumulativas posteriores.'
    : 'Atualização corretiva de questões já publicadas; nenhum código foi adicionado ou removido.',
};
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`✓ Plataforma sincronizada no build: ${appliedCorrections} correções aplicadas, ${inheritedCorrections.length} herdadas e ${initialQuestionCount} questões preservadas.`);
