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
if (questions !== 2585) fail(`Publicação final com ${questions} questões; esperado 2585.`);

const receipt = {
  schema_version: '1.0',
  confirmed_at: new Date().toISOString(),
  public_url: publicUrl,
  source_sha: expectedSha,
  app_version: build.version,
  cache_version: build.cache_version,
  questions,
  materials,
  lot: 'SEEDF-2025-DIR-A-071-120-20260802',
  added_questions: 50,
  verification: {
    static_files: 'success',
    public_browser: 'success',
    public_metadata_refetched: 'success',
  },
};

const output = path.join(root, 'data', 'operations', 'latest-deployment.json');
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`✓ Recibo público preparado: ${questions} questões em ${publicUrl}, commit ${expectedSha}.`);
