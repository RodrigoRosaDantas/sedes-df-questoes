import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const run = (file, args = [], env = {}) => execFileSync(node, [file, ...args], {cwd: root, env: {...process.env, ...env}, stdio: "inherit"});
const git = args => execFileSync("git", args, {cwd: root, encoding: "utf8"}).trim();
const readJSON = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));

const checkoutSha = git(["rev-parse", "HEAD"]);
const requestedSha = String(process.env.RELEASE_SOURCE_SHA || checkoutSha).trim();
if (!/^[0-9a-f]{40}$/.test(requestedSha)) throw new Error(`SHA da release inválido: ${requestedSha || "ausente"}.`);
if (requestedSha !== checkoutSha) throw new Error(`Checkout ${checkoutSha} não corresponde ao SHA autorizado ${requestedSha}.`);

function trackedReleaseDigest() {
  const files = git(["ls-files", "data/release"]).split("\n").filter(Boolean).sort();
  const hash = crypto.createHash("sha256");
  for (const relative of files) {
    hash.update(relative); hash.update("\0"); hash.update(fs.readFileSync(path.join(root, relative))); hash.update("\0");
  }
  return {files: files.length, sha256: hash.digest("hex")};
}

const frozenRelease = trackedReleaseDigest();
const syntaxFiles = git(["ls-files"]).split("\n")
  .filter(file => /(?:^|\/)(?:[^/]+\.(?:js|mjs))$/.test(file))
  .filter(file => !file.startsWith("data/"));
for (const file of syntaxFiles) run("--check", [file]);

run("scripts/build-question-search-index.mjs", [], {GITHUB_SHA: requestedSha});
run("scripts/build-public.mjs", [], {GITHUB_SHA: requestedSha});
run("scripts/apply-edas-coverage-400.mjs", [], {GITHUB_SHA: requestedSha, RELEASE_DIR: "dist/data/release"});
run("scripts/apply-quadrix-targeted-20260816.mjs", [], {GITHUB_SHA: requestedSha, RELEASE_DIR: "dist/data/release"});
run("scripts/apply-cress-mg-df-20260816.mjs", [], {GITHUB_SHA: requestedSha, RELEASE_DIR: "dist/data/release"});
run("scripts/build-edital-map-v1.mjs", [], {GITHUB_SHA: requestedSha});
run("scripts/derive-cress-mg-df-20260816.mjs", [], {GITHUB_SHA: requestedSha});
run("scripts/apply-quadrix-gaps-20260816.mjs", [], {GITHUB_SHA: requestedSha, RELEASE_DIR: "dist/data/release"});
run("scripts/derive-quadrix-gaps-20260816.mjs", [], {GITHUB_SHA: requestedSha});
run("scripts/apply-quadrix-sparse-gaps-20260816.mjs", [], {GITHUB_SHA: requestedSha, RELEASE_DIR: "dist/data/release"});
run("scripts/derive-quadrix-sparse-gaps-20260816.mjs", [], {GITHUB_SHA: requestedSha});
run("scripts/derive-quadrix-density-mapping-20260816.mjs", [], {GITHUB_SHA: requestedSha});
run("scripts/derive-quadrix-residual-density-20260816.mjs", [], {GITHUB_SHA: requestedSha});
run("scripts/apply-quadrix-residual-gaps-b-20260816.mjs", [], {GITHUB_SHA: requestedSha, RELEASE_DIR: "dist/data/release"});
run("scripts/derive-quadrix-residual-gaps-b-20260816.mjs", [], {GITHUB_SHA: requestedSha});
run("scripts/apply-quadrix-residual-gaps-c-20260816.mjs", [], {GITHUB_SHA: requestedSha, RELEASE_DIR: "dist/data/release"});
run("scripts/derive-quadrix-residual-gaps-c-20260816.mjs", [], {GITHUB_SHA: requestedSha});
run("scripts/apply-quadrix-residual-gaps-d-20260816.mjs", [], {GITHUB_SHA: requestedSha, RELEASE_DIR: "dist/data/release"});
run("scripts/derive-quadrix-residual-gaps-d-20260816.mjs", [], {GITHUB_SHA: requestedSha});
for (const script of [
  "scripts/build-content-model-v1.mjs",
  "scripts/reconcile-discursive-release-meta.mjs",
  "scripts/reconcile-public-metadata.mjs",
  "scripts/reconcile-cloud-provenance-v1.mjs",
  "scripts/reconcile-audit-hardening-v1.mjs",
]) run(script, [], {GITHUB_SHA: requestedSha});

for (const script of [
  "scripts/validate-session-transition-v2-22.mjs", "scripts/validate-edital-relevance-v2-22.mjs", "scripts/validate-audit-fixes-v2-22.mjs", "scripts/validate-resolver-context-v2-19.mjs",
  "scripts/validate-home-question-format-v2-20.mjs", "scripts/validate-home-question-format-v2-20-gate.mjs", "scripts/validate-home-study-v2-16.mjs", "scripts/validate-runtime-catalog.mjs",
  "scripts/validate-study-navigation-v2-6.mjs", "scripts/validate-material-downloads.mjs", "scripts/validate-platform-v2-13.mjs", "scripts/validate-ux-v2-14.mjs", "scripts/validate-navigation-v2-15.mjs",
  "scripts/validate-cloud-progress-v1.mjs", "scripts/validate-work-convergence-v1.mjs", "scripts/validate-audit-hardening-v1.mjs", "scripts/validate-discursive-display.mjs", "scripts/validate-dist-v2-10.mjs",
  "scripts/validate-governance-mode.mjs", "scripts/validate-public-metadata-consistency.mjs", "scripts/validate-study-by-role-v1.mjs",
]) run(script);

const catalog = readJSON("dist/data/release/catalogo.json");
const build = readJSON("dist/data/release/build-info.json");
const release = readJSON("dist/data/release/release-meta.json");
const format = readJSON("dist/data/release/question-format-index.json");
const contentModel = readJSON("dist/data/release/content-model-v1.json");
const targetedReceipt = readJSON("dist/data/release/quadrix-targeted-20260816-receipt.json");
const cressReceipt = readJSON("dist/data/release/cress-mg-df-20260816-receipt.json");
const gapsReceipt = readJSON("dist/data/release/quadrix-gaps-20260816-receipt.json");
const sparseReceipt = readJSON("dist/data/release/quadrix-sparse-gaps-20260816-receipt.json");
const residualBReceipt = readJSON("dist/data/release/quadrix-residual-gaps-b-20260816-receipt.json");
const residualBMapReceipt = readJSON("dist/data/release/quadrix-residual-gaps-b-20260816-map-receipt.json");
const residualCReceipt = readJSON("dist/data/release/quadrix-residual-gaps-c-20260816-receipt.json");
const residualCMapReceipt = readJSON("dist/data/release/quadrix-residual-gaps-c-20260816-map-receipt.json");
const residualDReceipt = readJSON("dist/data/release/quadrix-residual-gaps-d-20260816-receipt.json");
const residualDMapReceipt = readJSON("dist/data/release/quadrix-residual-gaps-d-20260816-map-receipt.json");

const questions = Object.keys(catalog.question_index || {}).length;
const materials = Array.isArray(catalog.materials) ? catalog.materials.length : 0;
const discursive = Number(release.discursive_display_items || 0);
const awaiting = Number(release.awaiting_audit || 0);
const bank = Number(release.banco_mestre || 0);
const formatTotal = Object.values(format.summary || {}).reduce((sum, value) => sum + Number(value || 0), 0);
const cloudHashKeys = ["platform_cloud_progress_js", "platform_cloud_progress_css", "platform_work_command_center_js", "platform_work_convergence_js", "platform_work_convergence_css", "platform_question_report_js"];
const hardeningHashKeys = ["platform_report_queue_js", "platform_pdf_fidelity_js", "platform_question_visuals_js", "platform_cloud_progress_js_v2audit"];

if (build.source_sha !== requestedSha || release.source_sha !== requestedSha) throw new Error("Recibos do dist não pertencem ao checkout validado.");
if (Number(build.questions) !== questions || Number(release.questions) !== questions) throw new Error("Totais de questões divergentes no dist.");
if (Number(build.materials) !== materials || Number(release.materials) !== materials) throw new Error("Totais de materiais divergentes no dist.");
if (bank - questions - discursive !== awaiting) throw new Error("Banco Mestre não fecha em objetivas + discursivas + auditoria.");
if (Number(format.question_count) !== questions || formatTotal !== questions) throw new Error("Índice de formatos não fecha com o catálogo.");
if (Number(contentModel.schema) !== 1 || Number(contentModel.question_count) !== questions || Number(contentModel.material_count) !== materials) throw new Error("Modelo normalizado não fecha com o catálogo público.");
if (!Array.isArray(contentModel.questions) || contentModel.questions.length !== questions || !Array.isArray(contentModel.materials) || contentModel.materials.length !== materials) throw new Error("Coleções normalizadas incompletas.");

if (questions !== 3511 || materials !== 94 || bank !== 3513 || Number(release.proofs) !== 55 || Number(release.simulations) !== 39 || discursive !== 2 || awaiting !== 0)
  throw new Error(`Totais finais inesperados: banco ${bank}, questões ${questions}, materiais ${materials}, provas ${release.proofs}, simulados ${release.simulations}, discursivas ${discursive}, auditoria ${awaiting}.`);
if (Number(format.summary?.["true-false"]) !== 2574 || Number(format.summary?.["multiple-choice"]) !== 937)
  throw new Error("Distribuição final de formatos divergente do lote aprovado.");

if (targetedReceipt.operation_id !== "SEDES-QDX-TARGETED-IMPORT-20260816" || targetedReceipt.status !== "success" || Number(targetedReceipt.total_questions) !== 3480 || Number(targetedReceipt.total_materials) !== 83 || !Array.isArray(targetedReceipt.codes) || targetedReceipt.codes.length !== 22)
  throw new Error("Recibo histórico do lote Quadrix direcionado inválido ou incompleto.");
if (cressReceipt.operation_id !== "SEDES-QDX-CRESS-MG-DF-20260816" || cressReceipt.status !== "success" || Number(cressReceipt.total_questions) !== 3492 || Number(cressReceipt.total_materials) !== 85 || Number(cressReceipt.total_proofs) !== 46 || !Array.isArray(cressReceipt.codes) || cressReceipt.codes.length !== 12)
  throw new Error("Recibo histórico do lote CRESS MG/DF inválido ou incompleto.");
if (gapsReceipt.operation_id !== "SEDES-QDX-GAPS-20260816" || gapsReceipt.status !== "success" || Number(gapsReceipt.total_questions) !== 3504 || Number(gapsReceipt.total_materials) !== 89 || Number(gapsReceipt.total_proofs) !== 50 || !Array.isArray(gapsReceipt.codes) || gapsReceipt.codes.length !== 12)
  throw new Error("Recibo histórico do lote Quadrix de lacunas inválido ou incompleto.");
if (sparseReceipt.operation_id !== "SEDES-QDX-SPARSE-GAPS-20260816" || sparseReceipt.status !== "success" || Number(sparseReceipt.total_questions) !== 3506 || Number(sparseReceipt.total_materials) !== 91 || Number(sparseReceipt.total_proofs) !== 52 || !Array.isArray(sparseReceipt.codes) || sparseReceipt.codes.length !== 2)
  throw new Error("Recibo histórico do lote sparse gaps inválido ou incompleto.");
if (residualBReceipt.operation_id !== "SEDES-QDX-RESIDUAL-GAPS-20260816-B" || residualBReceipt.status !== "success" || Number(residualBReceipt.total_questions) !== 3508 || Number(residualBReceipt.total_materials) !== 93 || Number(residualBReceipt.total_proofs) !== 54 || !Array.isArray(residualBReceipt.codes) || residualBReceipt.codes.length !== 2)
  throw new Error("Recibo histórico do lote residual B inválido ou incompleto.");
if (residualBMapReceipt.operation_id !== "SEDES-QDX-RESIDUAL-GAPS-20260816-B" || residualBMapReceipt.status !== "success" || Number(residualBMapReceipt.mapped_questions) !== 1309 || Number(residualBMapReceipt.unmapped_questions) !== 2199 || !Array.isArray(residualBMapReceipt.codes) || residualBMapReceipt.codes.length !== 2)
  throw new Error("Recibo histórico do mapa residual B inválido ou incompleto.");
if (residualCReceipt.operation_id !== "SEDES-QDX-RESIDUAL-GAPS-20260816-C" || residualCReceipt.status !== "success" || Number(residualCReceipt.added_questions) !== 1 || Number(residualCReceipt.total_questions) !== 3509 || Number(residualCReceipt.total_materials) !== 94 || Number(residualCReceipt.total_proofs) !== 55 || !Array.isArray(residualCReceipt.codes) || residualCReceipt.codes.length !== 1)
  throw new Error("Recibo histórico do lote residual C inválido ou incompleto.");
if (residualCMapReceipt.operation_id !== "SEDES-QDX-RESIDUAL-GAPS-20260816-C" || residualCMapReceipt.status !== "success" || Number(residualCMapReceipt.catalog_additions) !== 1 || Number(residualCMapReceipt.mapping_pairs) !== 5 || Number(residualCMapReceipt.distinct_questions) !== 5 || Number(residualCMapReceipt.newly_mapped_distinct_questions) !== 5 || Number(residualCMapReceipt.mapped_questions) !== 1314 || Number(residualCMapReceipt.unmapped_questions) !== 2195)
  throw new Error("Recibo histórico do mapa residual C inválido ou incompleto.");
if (residualDReceipt.operation_id !== "SEDES-QDX-RESIDUAL-GAPS-20260816-D" || residualDReceipt.status !== "success" || Number(residualDReceipt.added_questions) !== 2 || Number(residualDReceipt.total_questions) !== 3511 || Number(residualDReceipt.total_materials) !== 94 || Number(residualDReceipt.total_proofs) !== 55 || !Array.isArray(residualDReceipt.codes) || residualDReceipt.codes.length !== 2)
  throw new Error("Recibo do lote residual D inválido ou incompleto.");
if (residualDMapReceipt.operation_id !== "SEDES-QDX-RESIDUAL-GAPS-20260816-D" || residualDMapReceipt.status !== "success" || Number(residualDMapReceipt.catalog_additions) !== 2 || Number(residualDMapReceipt.mapping_pairs) !== 2 || Number(residualDMapReceipt.distinct_questions) !== 2 || Number(residualDMapReceipt.newly_mapped_distinct_questions) !== 2 || Number(residualDMapReceipt.mapped_questions) !== 1316 || Number(residualDMapReceipt.unmapped_questions) !== 2195)
  throw new Error("Recibo do mapa residual D inválido ou incompleto.");

for (const code of [...targetedReceipt.codes, ...cressReceipt.codes, ...gapsReceipt.codes, ...sparseReceipt.codes, ...residualBReceipt.codes, ...residualCReceipt.codes, ...residualDReceipt.codes]) {
  const publicId = String(code).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
  if (!catalog.question_index?.[publicId]) throw new Error(`Questão de recibo ausente do catálogo: ${code}.`);
}

for (const key of cloudHashKeys) {
  if (!/^[0-9a-f]{64}$/.test(String(build.source_files_sha256?.[key] || ""))) throw new Error(`Build sem hash Firebase/Work: ${key}.`);
  if (build.source_files_sha256[key] !== release.source_files_sha256?.[key]) throw new Error(`Hash de proveniência divergente entre build e release: ${key}.`);
}
if (Number(build.cloud_progress_provenance?.files) !== cloudHashKeys.length || Number(release.cloud_progress_provenance?.files) !== cloudHashKeys.length)
  throw new Error("Recibo de proveniência da camada Firebase/Work incompleto.");
for (const key of hardeningHashKeys) {
  if (!/^[0-9a-f]{64}$/.test(String(build.source_files_sha256?.[key] || ""))) throw new Error(`Build sem hash do endurecimento: ${key}.`);
  if (build.source_files_sha256[key] !== release.source_files_sha256?.[key]) throw new Error(`Hash do endurecimento divergente entre build e release: ${key}.`);
}
if (Number(build.audit_hardening_provenance?.files) !== hardeningHashKeys.length || Number(release.audit_hardening_provenance?.files) !== hardeningHashKeys.length)
  throw new Error("Recibo de proveniência dos endurecimentos incompleto.");

const deploymentVerifier = fs.readFileSync(path.join(root, "scripts/verify-deployment.mjs"), "utf8");
for (const marker of [
  'path.join(root, "dist", "data", "release", "release-meta.json")',
  "const artifactReleaseMeta =",
  'const expectedCacheVersion = String(artifactReleaseMeta.cache_version || "").trim()',
  'import crypto from "node:crypto"',
  "const publicCanonicalContents =",
  "const publicHash = sha256(publicCanonicalContents[hash])",
  "Arquivo público diverge byte a byte do artefato aprovado",
]) if (!deploymentVerifier.includes(marker)) throw new Error(`Verificador pós-deploy não está ancorado no artefato aprovado por hash: ${marker}.`);
if (deploymentVerifier.includes('path.join(root, "data/release/release-meta.json")')) throw new Error("Verificador pós-deploy voltou a usar o template versionado da release como referência do artefato.");
if (/report-v2-13\.js\?v=\d+/.test(deploymentVerifier) || /release-v2-13\.js\?v=\d+/.test(deploymentVerifier))
  throw new Error("Verificador pós-deploy voltou a depender de versão textual fixa de asset em vez de hash do artefato.");

const currentRelease = trackedReleaseDigest();
if (currentRelease.sha256 !== frozenRelease.sha256 || currentRelease.files !== frozenRelease.files)
  throw new Error("A validação alterou a release canônica versionada.");

console.log(`✓ Auditoria reproduzível concluída no commit ${requestedSha.slice(0, 8)}: ${bank} no Banco Mestre = ${questions} objetivas + ${discursive} discursivas + ${awaiting} em auditoria; ${materials} materiais; lotes 22/22 + 12/12 + 12/12 + sparse 2/2 + residual B 2/2 + residual C 1/1 + residual D 2/2; ${residualDMapReceipt.mapped_questions} mapeadas; Firebase/Work e endurecimentos protegidos por SHA-256; fontes canônicas preservadas em ${frozenRelease.files} arquivos.`);
