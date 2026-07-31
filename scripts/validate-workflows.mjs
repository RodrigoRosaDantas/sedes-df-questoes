import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const fail = message => { throw new Error(message); };
const requireMarkers = (content, markers, context) => {
  for (const marker of markers) if (!content.includes(marker)) fail(`${context}: marcador obrigatório ausente: ${marker}`);
};
const forbidMarkers = (content, markers, context) => {
  for (const marker of markers) if (content.includes(marker)) fail(`${context}: marcador proibido encontrado: ${marker}`);
};

const packageData = JSON.parse(read("package.json"));
const versionToken = String(packageData.version || "").replace(/\./g, "-");
if (!/^\d+-\d+-\d+$/.test(versionToken)) fail(`Versão inválida: ${packageData.version || "ausente"}.`);
const expectedCacheVersion = `sedes-questoes-v${versionToken}`;
const expectedBuilder = `copy-public-v${versionToken}`;

const workflowDirectory = path.join(root, ".github", "workflows");
const workflowFiles = fs.readdirSync(workflowDirectory)
  .filter(file => /\.ya?ml$/i.test(file))
  .sort();
const deprecatedWorkflowMarkers = [
  "actions/checkout@v4",
  "actions/setup-node@v4",
  "actions/configure-pages@v5",
  "actions/upload-pages-artifact@v3",
  "actions/deploy-pages@v4",
  "@playwright/test@1.55.0",
  "ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION",
];
for (const file of workflowFiles) {
  forbidMarkers(read(path.join(".github", "workflows", file)), deprecatedWorkflowMarkers, `Workflow ${file}`);
}

const pages = read(".github/workflows/pages.yml");
requireMarkers(pages, [
  "push:",
  "pull_request:",
  "workflow_dispatch:",
  "contents: read",
  "pages: write",
  "id-token: write",
  "actions: write",
  "PLAYWRIGHT_VERSION: 1.61.1",
  "actions/checkout@v6",
  "actions/setup-node@v6",
  "package-manager-cache: false",
  "actions/configure-pages@v6",
  "actions/upload-pages-artifact@v5",
  "actions/deploy-pages@v5",
  "npm audit --audit-level=high",
  "verify-deployment.mjs",
  "playwright.public.config.js",
  "mark-notion-published.mjs",
  "rollback-deployment.mjs",
], "Workflow de Pages");
forbidMarkers(pages, [
  "contents: write",
  "deployment-receipt.json",
  "Registrar recibo do deploy aprovado",
  "git push origin HEAD:main",
  "api.github.com/repos/${GITHUB_REPOSITORY}/pages",
  "-X PUT",
  "build_type",
], "Workflow de Pages");

const notion = read(".github/workflows/notion-sync.yml");
requireMarkers(notion, [
  "workflow_dispatch:",
  "schedule:",
  "contents: write",
  "actions/checkout@v6",
  "actions/setup-node@v6",
  "package-manager-cache: false",
  "ref: main",
  "export-notion-snapshot.mjs",
  "npm run check",
  "git push origin HEAD:main",
], "Workflow do Notion");
if (/^  push:/m.test(notion)) fail("Workflow do Notion não pode reagir ao próprio push no branch main.");
forbidMarkers(notion, [
  "actions: write",
  "gh workflow run pages.yml",
  "Preparar branch isolada",
  "notion-sync/run-",
  "refs/heads/",
], "Workflow do Notion");

const notionTraceability = read("scripts/mark-notion-published.mjs");
requireMarkers(notionTraceability, [
  "Código GitHub",
  "Data da publicação",
  "Status editorial — registro manual anterior",
  "publicationProperties",
], "Fechamento da rastreabilidade no Notion");
forbidMarkers(notionTraceability, [
  "Status editorial - registro manual anterior",
], "Fechamento da rastreabilidade no Notion");

const worker = read("service-worker.js");
requireMarkers(worker, [
  expectedCacheVersion,
  'event.request.mode === "navigate"',
  'cache: "no-store"',
  'type === "SKIP_WAITING"',
  "isVersionedApplicationAsset",
], "Service worker");

const pwa = read("assets/pwa-v2-9.js");
requireMarkers(pwa, [
  'updateViaCache: "none"',
  "updatefound",
  "controllerchange",
  "registration.update()",
], "Registro PWA");

const builder = read("scripts/build-public.mjs");
requireMarkers(builder, ["expectedBuilder", "expectedCacheVersion", "cache_version", "service_worker_js", "pwa_js"], "Build público");
const verifier = read("scripts/verify-deployment.mjs");
requireMarkers(verifier, ["expectedBuilder", "expectedCacheVersion", "buildInfo.cache_version", "controllerchange"], "Verificador público");
if (!builder.includes("replace(/\\./g, \"-\")") || !verifier.includes("replace(/\\./g, \"-\")")) {
  fail("Build e verificador devem derivar a versão completa do package.json.");
}
if (!builder.includes("builder: expectedBuilder") || !verifier.includes("buildInfo.builder !== expectedBuilder")) {
  fail(`Builder dinâmico ${expectedBuilder} não está protegido de ponta a ponta.`);
}

console.log(`✓ ${workflowFiles.length} workflows auditados: Actions em Node 24, Playwright 1.61.1, auditoria npm de severidade alta, deploy Pages sem mutação administrativa, rastreabilidade Notion compatível e sincronização sem recursão.`);
// Este teste existe para impedir que commits automáticos voltem a criar loops de Actions ou dependências obsoletas no CI.
