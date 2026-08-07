import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'source';
const expectedSourceSha = process.argv[3] || process.env.RELEASE_SHA || '';
const operation = JSON.parse(fs.readFileSync(path.join(root, 'data/operations/publish-crfa1-analista-115.json'), 'utf8'));
const prepareReceipt = JSON.parse(fs.readFileSync(path.join(root, 'data/operations/crfa1-analista-115-prepare-receipt.json'), 'utf8'));
const snapshotPath = path.join(root, 'data/notion/publication-additions/crfa1-analista-115.json');
const planPath = path.join(root, 'data/notion/publication-additions/crfa1-analista-115-plan.json');
const snapshotBuffer = fs.readFileSync(snapshotPath);
const planBuffer = fs.readFileSync(planPath);
const snapshot = JSON.parse(snapshotBuffer.toString('utf8'));
const plan = JSON.parse(planBuffer.toString('utf8'));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const clean = value => String(value ?? '').trim();
const fail = message => { throw new Error(message); };
const blocked = [5, 48, 54, 102, 104];
const expectedNumbers = Array.from({length: 120}, (_, index) => index + 1).filter(number => !blocked.includes(number));
const prefix = 'PROVA-QDX-CRFA1-2026-ANALISTA-ADMINISTRATIVO-400-';
const expectedCodes = expectedNumbers.map(number => `${prefix}${String(number).padStart(3, '0')}`);

if (operation.authorized !== true || operation.operation_id !== 'CRFA1-2026-ANALISTA-400-115-20260807') fail('Operação de publicação CRFa-1 não autorizada ou divergente.');
if (operation.prepare_commit !== '87204420e1cff32a8fa45926cf342e0161067795') fail('Commit de preparação divergente.');
if (sha256(snapshotBuffer) !== operation.snapshot_sha256 || sha256(snapshotBuffer) !== prepareReceipt.snapshot_sha256) fail('Hash do snapshot CRFa-1 divergente.');
if (sha256(planBuffer) !== operation.plan_sha256 || sha256(planBuffer) !== prepareReceipt.plan_sha256) fail('Hash do plano CRFa-1 divergente.');
if (plan.total_records !== 115 || snapshot.records?.length !== 115) fail('Pacote preparado não contém exatamente 115 registros.');
if (clean(plan.scope?.operation) !== operation.operation_id || plan.scope?.expected_count !== 115) fail('Escopo do plano preparado divergente.');
const preparedCodes = snapshot.records.map(record => clean(record.code));
if (JSON.stringify(preparedCodes) !== JSON.stringify(expectedCodes)) fail('Snapshot preparado não corresponde ao conjunto canônico 115.');
for (const record of snapshot.records) {
  if (clean(record.github_id)) fail(`${record.code}: Código GitHub deveria estar vazio no pacote preparado.`);
  if (!record.released_for_export || clean(record.publication_lot) !== operation.operation_id) fail(`${record.code}: lote/liberação divergente.`);
  if (record.annulled || record.has_image) fail(`${record.code}: item bloqueável entrou no pacote.`);
}

if (mode === 'source') {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/release/catalogo.json'), 'utf8'));
  if (Number(catalog.summary?.questoes) !== 3046) fail(`Baseline pública divergente: ${catalog.summary?.questoes}.`);
  if (Number(catalog.summary?.materiais) !== 71) fail(`Baseline de materiais divergente: ${catalog.summary?.materiais}.`);
  const alreadyPublic = (catalog.materials || []).find(item => clean(item.nome) === 'Analista Administrativo — CRFa-1 — Quadrix 2026');
  if (alreadyPublic) fail('CRFa-1 já aparece na baseline pública antes do deploy.');
  console.log(`✓ Gate fonte CRFa-1: pacote 115 íntegro, baseline 3046/71 e hashes ${operation.snapshot_sha256.slice(0, 16)}… / ${operation.plan_sha256.slice(0, 16)}….`);
  process.exit(0);
}

if (mode !== 'dist') fail(`Modo desconhecido: ${mode}.`);
const distRelease = path.join(root, 'dist/data/release');
const catalog = JSON.parse(fs.readFileSync(path.join(distRelease, 'catalogo.json'), 'utf8'));
const releaseMeta = JSON.parse(fs.readFileSync(path.join(distRelease, 'release-meta.json'), 'utf8'));
const buildInfo = JSON.parse(fs.readFileSync(path.join(distRelease, 'build-info.json'), 'utf8'));
if (Number(catalog.summary?.questoes) !== operation.expected_public_total_after) fail(`Dist deveria ter 3161 questões; tem ${catalog.summary?.questoes}.`);
if (Number(catalog.summary?.materiais) !== operation.expected_materials_after) fail(`Dist deveria ter 72 materiais; tem ${catalog.summary?.materiais}.`);
if (Number(releaseMeta.questions) !== 3161 || Number(releaseMeta.materials) !== 72) fail('release-meta não fecha em 3161/72.');
if (Number(releaseMeta.banco_mestre) !== 3212 || Number(releaseMeta.awaiting_audit) !== 49) fail(`release-meta do Banco Mestre deveria fechar em 3212/49; recebeu ${releaseMeta.banco_mestre}/${releaseMeta.awaiting_audit}.`);
if (Number(buildInfo.questions) !== 3161 || Number(buildInfo.materials) !== 72) fail('build-info não fecha em 3161/72.');
if (expectedSourceSha && clean(buildInfo.source_sha) !== clean(expectedSourceSha)) fail(`build-info aponta ${buildInfo.source_sha}, esperado ${expectedSourceSha}.`);

const metadata = (catalog.materials || []).find(item => clean(item.nome) === 'Analista Administrativo — CRFa-1 — Quadrix 2026');
if (!metadata) fail('Material CRFa-1 ausente do catálogo gerado.');
if (Number(metadata.quantidade_questoes) !== 115) fail(`Material CRFa-1 deveria conter 115 questões; contém ${metadata.quantidade_questoes}.`);
const materialPath = path.resolve(path.join(root, 'dist'), String(metadata.file).replace(/^\.\//, ''));
const material = JSON.parse(fs.readFileSync(materialPath, 'utf8'));
const questions = material.questoes || [];
if (questions.length !== 115) fail('Arquivo do material CRFa-1 não contém 115 questões.');
const numbers = questions.map(item => Number(item.numero_original ?? item.numero));
if (JSON.stringify(numbers) !== JSON.stringify(expectedNumbers)) fail(`Sequência pública CRFa-1 divergente: ${numbers.join(',')}.`);
const codes = questions.map(item => clean(item.codigo));
if (JSON.stringify(codes) !== JSON.stringify(expectedCodes)) fail('Códigos públicos CRFa-1 divergentes do pacote imutável.');
for (const number of blocked) {
  const code = `${prefix}${String(number).padStart(3, '0')}`;
  if (codes.includes(code)) fail(`Questão bloqueada ${number} apareceu no dist.`);
}
const answers = new Map(questions.map(item => [Number(item.numero_original ?? item.numero), clean(item.gabarito)]));
for (const [number, answer] of [[47, 'Certo'], [52, 'Errado'], [57, 'Errado'], [107, 'Errado'], [108, 'Errado']]) {
  if (answers.get(number) !== answer) fail(`Gabarito definitivo da questão ${number} divergiu: ${answers.get(number)}.`);
}
console.log(`✓ Gate dist CRFa-1: 3161 questões, 72 materiais, Banco Mestre 3212, 49 pendentes, material 115 íntegro e SHA ${clean(buildInfo.source_sha).slice(0, 16)}….`);
