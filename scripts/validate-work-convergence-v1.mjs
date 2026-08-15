import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const requireMarkers = (content, markers, label) => markers.forEach(marker => {
  if (!content.includes(marker)) throw new Error(`${label}: marcador ausente: ${marker}`);
});

const index = read("index.html");
const worker = read("service-worker.js");
const convergence = read("assets/work-convergence-v1.js");
const report = read("assets/report-v2-13.js");
const css = read("assets/work-convergence-v1.css");
const builder = read("scripts/build-content-model-v1.mjs");
const verifier = read("scripts/verify-public-release.mjs");
const publicConfig = read("playwright.public.config.js");

requireMarkers(index, ["work-convergence-v1.css?v=1", "work-convergence-v1.js?v=1", "report-v2-13.js?v=2"], "Shell Work");
requireMarkers(worker, ["work-convergence-v1.css?v=1", "work-convergence-v1.js?v=1", "report-v2-13.js?v=2", "content-model-v1.json"], "PWA Work");
requireMarkers(convergence, [
  "primaryProfileId",
  'profileKey("preferences.v1")',
  'profileKey("questionReports.v1")',
  '"users", String(user.uid), "apps", PLATFORM_ID',
  "data-work-direct-pdf",
  "application/pdf",
  "window.SEDES_WORK_CONVERGENCE",
], "Convergência Work");
requireMarkers(css, ["work-convergence-settings", "work-direct-pdf-actions", "work-account-dialog"], "CSS Work");
requireMarkers(report, ["questionReports.v1", "Enviar relato para revisão", "SEDES_CLOUD_PROGRESS", 'status: "novo"'], "Relato interno");
if (report.includes("issues/new") || report.includes("Abrir relato no GitHub")) throw new Error("Relato voltou a depender de GitHub Issue.");
requireMarkers(builder, ["content-model-v1.json", "material_question", "question_count", "material_count"], "Modelo normalizado");
requireMarkers(verifier, ["build-content-model-v1.mjs", "validate-work-convergence-v1.mjs", "content-model-v1.json"], "Auditoria Work");
requireMarkers(publicConfig, ["work-convergence-v1.spec.js"], "Playwright Work");

console.log("✓ Convergência Work validada: conta-perfil, preferências sincronizáveis, relatos internos, PDF direto e modelo normalizado.");
