import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const run = (file, args = [], env = {}) => execFileSync(node, [file, ...args], {
  cwd: root,
  env: {...process.env, ...env},
  stdio: "inherit",
});
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
    hash.update(relative);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(root, relative)));
    hash.update("\0");
  }
  return {files: files.length, sha256: hash.digest("hex")};
}

const frozenRelease = trackedReleaseDigest();
const syntaxFiles = git(["ls-files"])
  .split("\n")
  .filter(file => /(?:^|\/)(?:[^/]+\.(?:js|mjs))$/.test(file))
  .filter(file => !file.startsWith("data/"));
for (const file of syntaxFiles) run("--check", [file]);

for (const script of [
  "scripts/build-question-search-index.mjs",
  "scripts/build-public.mjs",
  "scripts/reconcile-discursive-release-meta.mjs",
  "scripts/reconcile-public-metadata.mjs",
  "scripts/reconcile-cloud-provenance-v1.mjs",
]) run(script, [], {GITHUB_SHA: requestedSha});

for (const script of [
  "scripts/validate-session-transition-v2-22.mjs",
  "scripts/validate-edital-relevance-v2-22.mjs",
  "scripts/validate-audit-fixes-v2-22.mjs",
  "scripts/validate-resolver-context-v2-19.mjs",
  "scripts/validate-home-question-format-v2-20.mjs",
  "scripts/validate-home-question-format-v2-20-gate.mjs",
  "scripts/validate-home-study-v2-16.mjs",
  "scripts/validate-runtime-catalog.mjs",
  "scripts/validate-study-navigation-v2-6.mjs",
  "scripts/validate-material-downloads.mjs",
  "scripts/validate-platform-v2-13.mjs",
  "scripts/validate-ux-v2-14.mjs",
  "scripts/validate-navigation-v2-15.mjs",
  "scripts/validate-cloud-progress-v1.mjs",
  "scripts/validate-discursive-display.mjs",
  "scripts/validate-dist-v2-10.mjs",
  "scripts/validate-governance-mode.mjs",
  "scripts/validate-public-metadata-consistency.mjs",
]) run(script);

const catalog = readJSON("dist/data/release/catalogo.json");
const build = readJSON("dist/data/release/build-info.json");
const release = readJSON("dist/data/release/release-meta.json");
const format = readJSON("dist/data/release/question-format-index.json");
const questions = Object.keys(catalog.question_index || {}).length;
const materials = Array.isArray(catalog.materials) ? catalog.materials.length : 0;
const discursive = Number(release.discursive_display_items || 0);
const awaiting = Number(release.awaiting_audit || 0);
const bank = Number(release.banco_mestre || 0);
const formatTotal = Object.values(format.summary || {}).reduce((sum, value) => sum + Number(value || 0), 0);
const cloudHashKeys = ["platform_cloud_progress_js", "platform_cloud_progress_css", "platform_work_command_center_js"];

if (build.source_sha !== requestedSha || release.source_sha !== requestedSha) throw new Error("Recibos do dist não pertencem ao checkout validado.");
if (Number(build.questions) !== questions || Number(release.questions) !== questions) throw new Error("Totais de questões divergentes no dist.");
if (Number(build.materials) !== materials || Number(release.materials) !== materials) throw new Error("Totais de materiais divergentes no dist.");
if (bank - questions - discursive !== awaiting) throw new Error("Banco Mestre não fecha em objetivas + discursivas + auditoria.");
if (Number(format.question_count) !== questions || formatTotal !== questions) throw new Error("Índice de formatos não fecha com o catálogo.");
for (const key of cloudHashKeys) {
  if (!/^[0-9a-f]{64}$/.test(String(build.source_files_sha256?.[key] || ""))) throw new Error(`Build sem hash Firebase/Central de comando: ${key}.`);
  if (build.source_files_sha256[key] !== release.source_files_sha256?.[key]) throw new Error(`Hash de proveniência divergente entre build e release: ${key}.`);
}
if (Number(build.cloud_progress_provenance?.files) !== cloudHashKeys.length || Number(release.cloud_progress_provenance?.files) !== cloudHashKeys.length) {
  throw new Error("Recibo de proveniência da camada Firebase incompleto.");
}

const currentRelease = trackedReleaseDigest();
if (currentRelease.sha256 !== frozenRelease.sha256 || currentRelease.files !== frozenRelease.files) {
  throw new Error("A validação alterou a release canônica versionada.");
}

console.log(
  `✓ Auditoria reproduzível concluída no commit ${requestedSha.slice(0, 8)}: `
  + `${bank} no Banco Mestre = ${questions} objetivas + ${discursive} discursivas + ${awaiting} em auditoria; `
  + `${materials} materiais; Firebase/Central de comando protegidos por SHA-256; fontes canônicas preservadas em ${frozenRelease.files} arquivos.`,
);
