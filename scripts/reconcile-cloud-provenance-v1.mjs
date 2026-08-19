import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const targets = {
  platform_cloud_progress_js: "assets/cloud-progress-v1.js",
  platform_cloud_progress_css: "assets/cloud-progress-v1.css",
  platform_performance_reset_js: "assets/performance-reset-v1.js",
  platform_work_command_center_js: "assets/work-command-center-v1.js",
  platform_work_convergence_js: "assets/work-convergence-v1.js",
  platform_work_convergence_css: "assets/work-convergence-v1.css",
  platform_question_report_js: "assets/report-v2-13.js",
};
const sha256 = content => crypto.createHash("sha256").update(content).digest("hex");
const hashes = {};

for (const [key, relative] of Object.entries(targets)) {
  const sourcePath = path.join(root, relative);
  const distPath = path.join(dist, relative);
  if (!fs.existsSync(sourcePath) || !fs.existsSync(distPath)) throw new Error(`Arquivo de proveniência ausente: ${relative}`);
  const source = fs.readFileSync(sourcePath);
  const published = fs.readFileSync(distPath);
  if (!source.equals(published)) throw new Error(`Artefato público diverge da fonte da camada Firebase/Work: ${relative}`);
  hashes[key] = sha256(source);
}

for (const relative of ["data/release/build-info.json", "data/release/release-meta.json"]) {
  const file = path.join(dist, relative);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  data.source_files_sha256 = {...(data.source_files_sha256 || {}), ...hashes};
  data.cloud_progress_provenance = {schema: 1, files: Object.keys(targets).length};
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

console.log(`✓ Proveniência Firebase/Work reconciliada em ${Object.keys(targets).length} arquivos SHA-256.`);
