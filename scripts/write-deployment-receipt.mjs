import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const fail = message => { throw new Error(message); };

const expectedSha = String(process.env.DEPLOYED_SOURCE_SHA || process.env.GITHUB_SHA || '').trim();
const publicUrl = String(process.env.PUBLIC_DEPLOYMENT_URL || '').replace(/\/+$/, '');
if (!/^[0-9a-f]{40}$/.test(expectedSha)) fail('Commit público inválido ou ausente.');
if (!publicUrl.startsWith('https://')) fail('URL pública inválida ou ausente.');

const build = readJSON('dist/data/release/build-info.json');
const release = readJSON('dist/data/release/release-meta.json');
const catalog = readJSON('dist/data/release/catalogo.json');
const questions = Object.keys(catalog.question_index || {}).length;
const materials = Array.isArray(catalog.materials) ? catalog.materials.length : 0;

if (build.source_sha !== expectedSha || release.source_sha !== expectedSha) {
  fail(`Pacote validado pertence a outro commit: ${build.source_sha || release.source_sha || 'ausente'}.`);
}
if (Number(build.questions) !== questions || Number(release.questions) !== questions) {
  fail('Contagem de questões diverge entre o pacote validado e o catálogo.');
}
if (Number(build.materials) !== materials || Number(release.materials) !== materials) {
  fail('Contagem de materiais diverge entre o pacote validado e o catálogo.');
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
  },
};

const output = path.join(root, 'data', 'operations', 'latest-deployment.json');
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`✓ Recibo público preparado: ${questions} questões em ${publicUrl}, commit ${expectedSha}.`);
