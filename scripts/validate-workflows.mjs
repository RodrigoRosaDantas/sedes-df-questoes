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
  "actions/upload-artifact@v4",
  "@playwright/test@1.55.0",
  "ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION",
];
const workflowViolations = [];
for (const file of workflowFiles) {
  const content = read(path.join(".github", "workflows", file));
  for (const marker of deprecatedWorkflowMarkers) {
    if (content.includes(marker)) workflowViolations.push(`${file}: ${marker}`);
  }
}
if (workflowViolations.length) {
  fail(`Workflows com dependências obsoletas:\n- ${workflowViolations.join("\n- ")}`);
}

const pages = read(".github/workflows/pages.yml");
requireMarkers(pages, [
  "push:",
  "pull_request:",
  "workflow_dispatch:",
  "source_sha:",
  "close_notion:",
  "default: false",
  "contents: read",
  "pages: write",
  "id-token: write",
  "actions: write",
  "PLAYWRIGHT_VERSION: 1.61.1",
  "PUBLICATION_PLAN_PATH",
  "actions/checkout@v6",
  "actions/setup-node@v6",
  "package-manager-cache: false",
  "Build vinculado ao commit",
  "actions/configure-pages@v6",
  "actions/upload-pages-artifact@v5",
  "actions/deploy-pages@v5",
  "AUDIT_DIR=$(mktemp -d)",
  "--package-lock-only",
  "npm audit --prefix \"$AUDIT_DIR\" --audit-level=high",
  "verify-deployment.mjs",
  "playwright.public.config.js",
  "id: traceability",
  "inputs.close_notion == true",
  "mark-notion-published.mjs",
  "steps.traceability.outcome == 'failure'",
  "rollback-deployment.mjs",
], "Workflow de Pages");
forbidMarkers(pages, [
  "contents: write",
  "export-notion-snapshot.mjs",
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
  "actions: write",
  "actions/checkout@v6",
  "actions/setup-node@v6",
  "package-manager-cache: false",
  "ref: main",
  "export-notion-snapshot.mjs",
  "create-publication-plan.mjs",
  "data/notion/publication-plan.json",
  "npm run check",
  "git reset --hard HEAD",
  "git clean -fd",
  "git status --porcelain",
  "git fetch origin main",
  "git merge-base --is-ancestor origin/main HEAD",
  "git rebase origin/main",
  "git push origin HEAD:main",
  "PUBLIC_BASE_URL",
  "build-info.json",
  "gh workflow run pages.yml",
  "source_sha=",
  "-f close_notion=true",
  "gh run watch",
  "--exit-status",
], "Workflow do Notion");
if (/^  push:/m.test(notion)) fail("Workflow do Notion não pode reagir ao próprio push no branch main.");
forbidMarkers(notion, [
  "git pull --rebase origin main",
  "Preparar branch isolada",
  "notion-sync/run-",
  "refs/heads/",
], "Workflow do Notion");
const commitIndex = notion.indexOf("git commit -m 'Sincronizar questões publicáveis do Banco Mestre'");
const resetIndex = notion.indexOf("git reset --hard HEAD");
const fetchIndex = notion.indexOf("git fetch origin main");
const rebaseIndex = notion.indexOf("git rebase origin/main");
const pushIndex = notion.indexOf("git push origin HEAD:main");
if (!(commitIndex >= 0 && commitIndex < resetIndex && resetIndex < fetchIndex && fetchIndex < rebaseIndex && rebaseIndex < pushIndex)) {
  fail("Workflow do Notion deve preservar o commit semântico, limpar artefatos e somente depois rebasear e enviar.");
}

const planLibrary = read("scripts/publication-plan.mjs");
requireMarkers(planLibrary, [
  "buildPublicationPlan",
  "validatePublicationPlan",
  "snapshot_sha256",
  "expected_count",
  "codes_sha256",
  "released_for_export !== true",
], "Plano explícito de publicação");

const planCreator = read("scripts/create-publication-plan.mjs");
requireMarkers(planCreator, [
  "PUBLICATION_PLAN_PATH",
  "buildPublicationPlan",
  "data/notion/publication-plan.json",
], "Gerador do plano de publicação");

const planValidator = read("scripts/validate-publication-plan.mjs");
requireMarkers(planValidator, [
  "validatePublicationPlan",
  "nenhum plano explícito foi criado",
], "Validador do plano de publicação");

const notionTraceability = read("scripts/mark-notion-published.mjs");
requireMarkers(notionTraceability, [
  "Código GitHub",
  "Data da publicação",
  "Status editorial — registro manual anterior",
  "PUBLICATION_PLAN_PATH",
  "validatePublicationPlan",
  "plannedCodes",
  "publicationProperties",
], "Fechamento da rastreabilidade no Notion");
forbidMarkers(notionTraceability, [
  "const selected = (snapshot.records || []).filter(record => !clean(record.github_id))",
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

console.log(
  `✓ ${workflowFiles.length} workflows auditados: snapshot versionado, plano explícito, deploy sem escrita editorial, `
  + 'fechamento do Notion somente pela sincronização autorizada, Actions em Node 24 e auditoria npm de severidade alta.',
);
