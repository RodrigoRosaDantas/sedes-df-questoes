import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(root, "dist");
const releaseDirectory = path.join(distRoot, "data", "release");
const catalogPath = path.join(releaseDirectory, "catalogo.json");
const manifestPath = path.join(releaseDirectory, "manifest.json");
const releaseMetaPath = path.join(releaseDirectory, "release-meta.json");
const buildInfoPath = path.join(releaseDirectory, "build-info.json");

for (const required of [catalogPath, manifestPath, releaseMetaPath, buildInfoPath]) {
  if (!fs.existsSync(required)) throw new Error(`Metadado público obrigatório ausente: ${path.relative(root, required)}`);
}

const criticalSourceFiles = {
  home_study_edital_js: "assets/home-study-edital-v2-18.js",
  home_study_today_js: "assets/home-study-today-v2-16.js",
  home_study_today_css: "assets/home-study-today-v2-16.css",
  home_study_subjects_js: "assets/home-study-subjects-v2-17-stable.js",
  home_study_subjects_css: "assets/home-study-subjects-v2-17.css",
  resolver_context_js: "assets/resolver-context-v2-19.js",
  resolver_context_css: "assets/resolver-context-v2-19.css",
};
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const criticalHashes = {};
for (const [key, relative] of Object.entries(criticalSourceFiles)) {
  const sourcePath = path.join(root, relative);
  const publicPath = path.join(distRoot, relative);
  if (!fs.existsSync(sourcePath) || !fs.existsSync(publicPath)) throw new Error(`Fonte crítica ausente da proveniência: ${relative}`);
  const source = fs.readFileSync(sourcePath, "utf8");
  const published = fs.readFileSync(publicPath, "utf8");
  if (source !== published) throw new Error(`Fonte crítica diverge do pacote público: ${relative}`);
  criticalHashes[key] = sha256(source);
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const releaseMeta = JSON.parse(fs.readFileSync(releaseMetaPath, "utf8"));
const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, "utf8"));

releaseMeta.provenance_contract_version = "2.22";
releaseMeta.source_files_sha256 = {...(releaseMeta.source_files_sha256 || {}), ...criticalHashes};
buildInfo.provenance_contract_version = "2.22";
buildInfo.source_files_sha256 = {...(buildInfo.source_files_sha256 || {}), ...criticalHashes};
fs.writeFileSync(releaseMetaPath, `${JSON.stringify(releaseMeta, null, 2)}\n`);
fs.writeFileSync(buildInfoPath, `${JSON.stringify(buildInfo, null, 2)}\n`);

const reconciledSummary = {
  ...(catalog.summary || {}),
  banco_mestre: Number(releaseMeta.banco_mestre),
  materiais: Number(releaseMeta.materials),
  questoes: Number(releaseMeta.questions),
  discursivas_consulta: Number(releaseMeta.discursive_display_items || 0),
  aguardando_auditoria: Number(releaseMeta.awaiting_audit),
  provas: Number(releaseMeta.proofs),
  simulados: Number(releaseMeta.simulations),
};

for (const [key, value] of Object.entries(reconciledSummary)) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`Resumo reconciliado inválido em ${key}: ${value}`);
}
if (
  reconciledSummary.banco_mestre
  - reconciledSummary.questoes
  - reconciledSummary.discursivas_consulta
  !== reconciledSummary.aguardando_auditoria
) {
  throw new Error("A decomposição Banco Mestre = questões + discursivas de consulta + auditoria não fecha.");
}

catalog.summary = reconciledSummary;
const catalogText = `${JSON.stringify(catalog, null, 2)}\n`;
fs.writeFileSync(catalogPath, catalogText);

manifest.summary = {...(manifest.summary || {}), ...reconciledSummary};
manifest.catalog_sha256 = sha256(catalogText);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `✓ Metadados públicos reconciliados: banco ${reconciledSummary.banco_mestre}; `
  + `${reconciledSummary.questoes} questões; ${reconciledSummary.discursivas_consulta} discursivas de consulta; `
  + `${reconciledSummary.aguardando_auditoria} em auditoria; ${reconciledSummary.materiais} materiais; `
  + `${Object.keys(criticalHashes).length} fontes UX críticas protegidas por SHA-256.`,
);
