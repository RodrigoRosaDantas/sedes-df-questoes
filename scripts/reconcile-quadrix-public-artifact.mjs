import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'dist', 'data', 'release');
const catalogPath = path.join(releaseDir, 'catalogo.json');
const manifestPath = path.join(releaseDir, 'manifest.json');
const releaseMetaPath = path.join(releaseDir, 'release-meta.json');
const buildInfoPath = path.join(releaseDir, 'build-info.json');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

for (const file of [catalogPath, manifestPath, releaseMetaPath, buildInfoPath]) {
  if (!fs.existsSync(file)) throw new Error(`Artefato público obrigatório ausente: ${path.relative(root, file)}.`);
}

const catalog = read(catalogPath);
const manifest = read(manifestPath);
const releaseMeta = read(releaseMetaPath);
const buildInfo = read(buildInfoPath);
const questions = Object.keys(catalog.question_index || {}).length;
const materials = (catalog.materials || []).length;
const displayItems = Number(catalog.summary?.discursivas_consulta || 0);
const proofs = (catalog.materials || []).filter(item => item.tipo_material === 'prova').length;
const simulations = (catalog.materials || []).filter(item => item.tipo_material === 'simulado').length;
const master = 3048;
const awaiting = master - questions - displayItems;

if (questions !== 2971 || materials !== 69 || displayItems !== 2 || proofs !== 34 || simulations !== 35 || awaiting !== 75) {
  throw new Error(`Contrato Quadrix divergente: banco=${master}, questões=${questions}, discursivas=${displayItems}, auditoria=${awaiting}, materiais=${materials}, provas=${proofs}, simulados=${simulations}.`);
}

const summary = {
  ...(catalog.summary || {}),
  banco_mestre: master,
  materiais: materials,
  questoes: questions,
  discursivas_consulta: displayItems,
  aguardando_auditoria: awaiting,
  provas: proofs,
  simulados: simulations,
};
catalog.summary = summary;
catalog.exported_at = new Date().toISOString();
const catalogText = `${JSON.stringify(catalog, null, 2)}\n`;
fs.writeFileSync(catalogPath, catalogText);

manifest.summary = {...(manifest.summary || {}), ...summary};
manifest.catalog_sha256 = sha256(catalogText);
manifest.generated_at = new Date().toISOString();
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const sourceSha = process.env.RELEASE_COMMIT || process.env.GITHUB_SHA || releaseMeta.source_sha;
const assetMap = {
  index_html: path.join(root, 'dist', 'index.html'),
  service_worker_js: path.join(root, 'dist', 'service-worker.js'),
  discursive_display_js: path.join(root, 'dist', 'assets', 'discursive-display-v2-13.js'),
  discursive_display_css: path.join(root, 'dist', 'assets', 'discursive-display-v2-13.css'),
};
const hashes = {...(releaseMeta.source_files_sha256 || {})};
for (const [name, file] of Object.entries(assetMap)) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo público ausente para hash: ${path.relative(root, file)}.`);
  hashes[name] = sha256(fs.readFileSync(file));
}

Object.assign(releaseMeta, {
  source_sha: sourceSha,
  questions,
  materials,
  proofs,
  simulations,
  banco_mestre: master,
  awaiting_audit: awaiting,
  discursive_display_items: displayItems,
  exported_at: new Date().toISOString(),
  source_files_sha256: hashes,
});
fs.writeFileSync(releaseMetaPath, `${JSON.stringify(releaseMeta, null, 2)}\n`);

Object.assign(buildInfo, {
  source_sha: sourceSha,
  questions,
  materials,
  material_files: materials,
  source_files_sha256: {...(buildInfo.source_files_sha256 || {}), ...hashes},
});
fs.writeFileSync(buildInfoPath, `${JSON.stringify(buildInfo, null, 2)}\n`);

console.log(`✓ Artefato público reconciliado: ${questions} questões, ${displayItems} discursivas, ${materials} materiais e ${awaiting} em auditoria.`);
