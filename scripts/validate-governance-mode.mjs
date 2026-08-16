import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const fail = message => { throw new Error(message); };
const requireMarkers = (content, markers, context) => markers.forEach(marker => {
  if (!content.includes(marker)) fail(`${context}: marcador ausente: ${marker}`);
});
const forbidMarkers = (content, markers, context) => markers.forEach(marker => {
  if (content.includes(marker)) fail(`${context}: marcador proibido: ${marker}`);
});
const triggerBlock = content => content.match(/^on:\s*\n((?:^[ \t].*(?:\n|$)|^\s*$)*)/m)?.[1] || "";

const baseReceipt = JSON.parse(read("data/operations/site-automations-governance-20260809.json"));
if (baseReceipt.status !== "active_limited" || baseReceipt.mode !== "manual_deploy_read_only_ci") {
  fail("Recibo-base de governança limitada ausente ou inválido.");
}

const controlledReceipt = JSON.parse(read("data/operations/site-automations-governance-20260816.json"));
if (
  controlledReceipt.status !== "active_limited"
  || controlledReceipt.mode !== "owner_authorized_issue_deploy_read_only_ci"
  || controlledReceipt.authorized_by !== "user"
) {
  fail("Recibo de autorização controlada pelo proprietário ausente ou inválido.");
}

const pages = read(".github/workflows/pages.yml");
const pagesTriggers = triggerBlock(pages);
requireMarkers(pagesTriggers, ["workflow_dispatch:", "issues:"], "Gatilhos de Pages");
forbidMarkers(pagesTriggers, ["push:", "pull_request:", "schedule:"], "Gatilhos de Pages");
requireMarkers(pages, [
  "AUTHORIZED_SOURCE_SHA: ${{ github.sha }}",
  "AUTHORIZED_REF: ${{ github.ref_name }}",
  'test "${AUTHORIZED_REF}" = "main"',
  "github.event.issue.title == '[deploy-pages]'",
  "github.actor == github.repository_owner",
  "ISSUE_BODY_SHA=",
  'test "${ISSUE_BODY_SHA}" = "${AUTHORIZED_SOURCE_SHA}"',
  'ref: ${{ env.AUTHORIZED_SOURCE_SHA }}',
  "contents: read",
  "pages: write",
  "id-token: write",
  "actions/checkout@v6",
  "actions/setup-node@v6",
  "RELEASE_SOURCE_SHA",
  "run: npm run check",
  "playwright.public.config.js",
  "--retries=0",
  "actions/configure-pages@v6",
  "actions/upload-pages-artifact@v5",
  "actions/deploy-pages@v5",
  "verify-deployment.mjs",
], "Publicação controlada");
forbidMarkers(pages, [
  "inputs:",
  "source_sha:",
  "confirmation:",
  "NAO_PUBLICAR",
  "contents: write",
  "secrets.NOTION_TOKEN",
  "export-notion-snapshot.mjs",
  "mark-notion-published.mjs",
  "rollback-deployment.mjs",
  "git push",
], "Publicação controlada");

const validationFile = ".github/workflows/validate-public-release.yml";
const validation = read(validationFile);
const validationTriggers = triggerBlock(validation);
requireMarkers(validationTriggers, ["pull_request:", "workflow_dispatch:"], "Gatilhos da validação");
forbidMarkers(validationTriggers, ["push:", "schedule:"], "Gatilhos da validação");
requireMarkers(validation, ["contents: read", "npm run check", "RELEASE_SOURCE_SHA", "actions/checkout@v6", "actions/setup-node@v6"], "Validação somente leitura");
forbidMarkers(validation, ["contents: write", "pages: write", "id-token: write", "secrets.", "deploy-pages", "git push"], "Validação somente leitura");

const workflowDirectory = path.join(root, ".github", "workflows");
const workflows = fs.readdirSync(workflowDirectory).filter(file => /\.ya?ml$/i.test(file)).sort();
for (const file of workflows) {
  if (["pages.yml", "validate-public-release.yml"].includes(file)) continue;
  const content = read(path.join(".github", "workflows", file));
  const triggers = triggerBlock(content);
  if (!triggers.includes("workflow_dispatch:")) fail(`${file}: rotina operacional sem acionamento manual.`);
  if (/^  (push|pull_request|schedule):/m.test(triggers)) fail(`${file}: rotina operacional ainda possui gatilho automático.`);
}

if (fs.existsSync(path.join(root, ".github", "deploy-trigger"))) {
  fail("Arquivo-sentinela de deploy automático obsoleto ainda presente.");
}

console.log(
  `✓ Governança limitada validada em ${workflows.length} workflows: PR somente leitura, `
  + "Pages por workflow_dispatch ou autorização controlada do proprietário com SHA exato, sem push/schedule e sem escrita no Notion.",
);
