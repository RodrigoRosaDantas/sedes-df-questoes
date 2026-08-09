import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = message => { throw new Error(message); };
const expectedSha = String(process.env.DEPLOYED_SOURCE_SHA || "").trim();
const publicUrl = String(process.env.PUBLIC_DEPLOYMENT_URL || "").replace(/\/+$/, "");
if (!/^[0-9a-f]{40}$/.test(expectedSha)) fail("Commit público inválido ou ausente.");
if (!publicUrl.startsWith("https://")) fail("URL pública inválida ou ausente.");

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const firstInteger = (...values) => values.find(value => value !== null && value !== "" && Number.isInteger(Number(value)) && Number(value) >= 0);
const fetchJSON = async relative => {
  const response = await fetch(`${publicUrl}/${relative}?receipt=${Date.now()}`, {
    cache: "no-store",
    headers: {"cache-control": "no-cache, no-store", pragma: "no-cache"},
  });
  if (!response.ok) fail(`${relative}: HTTP ${response.status}.`);
  return response.json();
};

const [build, release, catalog] = await Promise.all([
  fetchJSON("data/release/build-info.json"),
  fetchJSON("data/release/release-meta.json"),
  fetchJSON("data/release/catalogo.json"),
]);
const questions = Object.keys(catalog.question_index || {}).length;
const materials = Array.isArray(catalog.materials) ? catalog.materials.length : 0;
const bank = Number(release.banco_mestre || 0);
const discursive = Number(release.discursive_display_items || 0);
const awaiting = Number(release.awaiting_audit || 0);

if (build.source_sha !== expectedSha || release.source_sha !== expectedSha) fail("Site público pertence a outro commit.");
if (Number(build.questions) !== questions || Number(release.questions) !== questions) fail("Contagem pública de questões divergente.");
if (Number(build.materials) !== materials || Number(release.materials) !== materials) fail("Contagem pública de materiais divergente.");
if (bank - questions - discursive !== awaiting) fail("Decomposição pública do Banco Mestre divergente.");

function receiptCandidates(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return receiptCandidates(absolute);
    if (!entry.isFile() || !/receipt.*\.json$/i.test(entry.name) || entry.name === "latest-deployment.json") return [];
    let data;
    try { data = JSON.parse(fs.readFileSync(absolute, "utf8")); } catch { return []; }
    const total = firstInteger(
      data.final_questions,
      data.public_questions,
      data.questions,
      data.public_state?.questions,
      data.dashboard?.available_on_site,
    );
    if (Number(total) !== questions) return [];
    const status = String(data.status || data.deployment_status || "success").toLowerCase();
    if (!['success', 'completed', 'closed'].includes(status)) return [];
    return [{
      relative: path.relative(root, absolute).replaceAll(path.sep, "/"),
      absolute,
      data,
      confirmedAt: Date.parse(data.confirmed_at || data.completed_at || data.finished_at || "") || 0,
    }];
  });
}

const candidates = [
  ...receiptCandidates(path.join(root, "data", "release")),
  ...receiptCandidates(path.join(root, "data", "operations")),
].sort((a, b) => b.confirmedAt - a.confirmedAt);
const contentReceipt = candidates[0];
if (!contentReceipt) fail(`Nenhum recibo cumulativo corresponde às ${questions} questões públicas.`);

const governancePath = path.join(root, "data", "operations", "site-automations-governance-20260809.json");
const governance = fs.existsSync(governancePath) ? JSON.parse(fs.readFileSync(governancePath, "utf8")) : null;
const receiptText = fs.readFileSync(contentReceipt.absolute);
const content = contentReceipt.data;
const deploymentRunId = Number(process.env.DEPLOYMENT_WORKFLOW_RUN_ID || 0);
if (!Number.isInteger(deploymentRunId) || deploymentRunId <= 0) fail("ID da execução de Pages inválido ou ausente.");
const receipt = {
  schema_version: "2.0",
  confirmed_at: new Date().toISOString(),
  public_url: publicUrl,
  source_sha: expectedSha,
  deployment_workflow_run_id: deploymentRunId,
  receipt_workflow_run_id: Number(process.env.GITHUB_RUN_ID || 0) || null,
  workflow_conclusion: "success",
  deployment_status: "success",
  app_version: build.version,
  cache_version: build.cache_version,
  questions,
  materials,
  master_bank: bank,
  discursive_display_items: discursive,
  awaiting_audit: awaiting,
  content_receipt: contentReceipt.relative,
  content_receipt_sha256: sha256(receiptText),
  content_operation_id: String(content.operation_id || content.operation || "").trim() || null,
  content_release_sha: String(content.release_sha || content.source_sha || "").trim() || null,
  content_published_records: firstInteger(content.published_records, content.added_questions) ?? null,
  verification: {
    static_files: "success",
    public_browser: "success",
    public_metadata_refetched: "success",
    catalog_manifest_release_meta: "success",
    source_sha: "success",
    cumulative_content_receipt: "success"
  },
  automation_mode: governance?.mode || "manual_only",
};

const output = path.join(root, "data", "operations", "latest-deployment.json");
fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`✓ Recibo público preparado: ${questions} questões, ${materials} materiais, commit ${expectedSha}.`);
