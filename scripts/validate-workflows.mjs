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

const pages = read(".github/workflows/pages.yml");
requireMarkers(pages, [
  "push:",
  "pull_request:",
  "workflow_dispatch:",
  "contents: read",
  "pages: write",
  "id-token: write",
  "actions: write",
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
], "Workflow de Pages");

const notion = read(".github/workflows/notion-sync.yml");
requireMarkers(notion, [
  "workflow_dispatch:",
  "schedule:",
  "contents: write",
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

console.log(`✓ Workflows auditados: versão ${packageData.version}, cache ${expectedCacheVersion}, deploy único e sincronização sem recursão.`);
