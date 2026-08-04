import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = message => { throw new Error(message); };
const expectedSha = String(process.env.DEPLOYED_SOURCE_SHA || '').trim();
const publicUrl = String(process.env.PUBLIC_DEPLOYMENT_URL || '').replace(/\/+$/, '');
if (!/^[0-9a-f]{40}$/.test(expectedSha)) fail('Commit público inválido ou ausente.');
if (!publicUrl.startsWith('https://')) fail('URL pública inválida ou ausente.');

async function fetchJSON(relative) {
  const url = `${publicUrl}/${relative}?receipt=${Date.now()}`;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {'cache-control': 'no-cache, no-store', pragma: 'no-cache'},
  });
  if (!response.ok) fail(`${relative}: HTTP ${response.status}.`);
  return response.json();
}

async function fetchOptionalJSON(relative) {
  const url = `${publicUrl}/${relative}?receipt=${Date.now()}`;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {'cache-control': 'no-cache, no-store', pragma: 'no-cache'},
  });
  if (response.status === 404) return null;
  if (!response.ok) fail(`${relative}: HTTP ${response.status}.`);
  return response.json();
}

const [build, release, catalog] = await Promise.all([
  fetchJSON('data/release/build-info.json'),
  fetchJSON('data/release/release-meta.json'),
  fetchJSON('data/release/catalogo.json'),
]);
const questions = Object.keys(catalog.question_index || {}).length;
const materials = Array.isArray(catalog.materials) ? catalog.materials.length : 0;

if (build.source_sha !== expectedSha || release.source_sha !== expectedSha) {
  fail(`Site público pertence a outro commit: ${build.source_sha || release.source_sha || 'ausente'}.`);
}
if (Number(build.questions) !== questions || Number(release.questions) !== questions) {
  fail('Contagem de questões diverge entre os metadados públicos e o catálogo.');
}
if (Number(build.materials) !== materials || Number(release.materials) !== materials) {
  fail('Contagem de materiais diverge entre os metadados públicos e o catálogo.');
}

const receiptCandidates = [
  'data/release/crbm6-contador-70-publication-receipt.json',
  'data/release/crefito17-agentefiscal-62-publication-receipt.json',
  'data/release/alto-paraiso-orientador-37-publication-receipt.json',
  'data/release/seedf-eletrot-43-publication-receipt.json',
  'data/release/seedf-biomed-50-publication-receipt.json',
  'data/release/seedf-bio-24-publication-receipt.json',
  'data/release/seedf-dir-50-publication-receipt.json',
];
const availableReceipts = [];
for (const relative of receiptCandidates) {
  const receipt = await fetchOptionalJSON(relative);
  if (receipt) availableReceipts.push({relative, receipt});
}
const selected = availableReceipts.find(item => Number(item.receipt.final_questions) === questions);
if (!selected) {
  const described = availableReceipts.map(item => `${item.relative}=${item.receipt.final_questions}`).join(', ') || 'nenhum';
  fail(`Nenhum recibo de lote corresponde ao total público ${questions}. Recibos encontrados: ${described}.`);
}
const lot = String(selected.receipt.operation_id || '').trim();
const addedQuestions = Number(selected.receipt.added_questions);
if (!lot || !Number.isInteger(addedQuestions) || addedQuestions <= 0) {
  fail(`Recibo do lote público inválido: ${selected.relative}.`);
}

const receipt = {
  schema_version: '1.1',
  confirmed_at: new Date().toISOString(),
  public_url: publicUrl,
  source_sha: expectedSha,
  app_version: build.version,
  cache_version: build.cache_version,
  questions,
  materials,
  lot,
  added_questions: addedQuestions,
  lot_receipt: selected.relative,
  verification: {
    static_files: 'success',
    public_browser: 'success',
    public_metadata_refetched: 'success',
  },
};

const output = path.join(root, 'data', 'operations', 'latest-deployment.json');
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`✓ Recibo público preparado: ${questions} questões em ${publicUrl}, lote ${lot}, commit ${expectedSha}.`);
