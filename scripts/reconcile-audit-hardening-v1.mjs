import "./build-edital-map-v1.mjs";
import "./derive-edas-coverage-400.mjs";
import "./publish-study-by-role-v1.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const targets = {
  platform_report_queue_js: "assets/question-report-queue-v2.js",
  platform_pdf_fidelity_js: "assets/pdf-fidelity-v2.js",
  platform_question_visuals_js: "assets/question-images-v2-5.js",
  platform_cloud_progress_js_v2audit: "assets/cloud-progress-v1.js",
};
const sha256 = content => crypto.createHash("sha256").update(content).digest("hex");
const hashes = {};

for (const [key, relative] of Object.entries(targets)) {
  const sourcePath = path.join(root, relative);
  const distPath = path.join(dist, relative);
  if (!fs.existsSync(sourcePath) || !fs.existsSync(distPath)) throw new Error(`Arquivo auditado ausente: ${relative}`);
  const source = fs.readFileSync(sourcePath);
  const published = fs.readFileSync(distPath);
  if (!source.equals(published)) throw new Error(`Artefato público diverge da fonte auditada: ${relative}`);
  hashes[key] = sha256(source);
}

for (const relative of ["data/release/build-info.json", "data/release/release-meta.json"]) {
  const file = path.join(dist, relative);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  data.source_files_sha256 = {...(data.source_files_sha256 || {}), ...hashes};
  data.audit_hardening_provenance = {schema: 1, files: Object.keys(targets).length};
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

console.log(`✓ Proveniência dos endurecimentos reconciliada em ${Object.keys(targets).length} arquivos SHA-256.`);
await import("./validate-study-by-role-v1.mjs");
