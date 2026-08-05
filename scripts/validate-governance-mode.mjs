import fs from "node:fs";
import path from "node:path";
import {pathToFileURL, fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDirectory = path.join(root, "scripts");
const suspensionPath = path.join(root, "data", "operations", "site-automations-suspended.json");
const suspension = fs.existsSync(suspensionPath)
  ? JSON.parse(fs.readFileSync(suspensionPath, "utf8"))
  : null;
const manualOnly = suspension?.mode === "manual_only";

async function importFresh(file) {
  await import(`${pathToFileURL(file).href}?validation=${Date.now()}-${Math.random()}`);
}

function replaceRange(source, startMarker, endMarker, replacement, context) {
  const start = source.indexOf(startMarker);
  const endStart = source.indexOf(endMarker, start);
  if (start < 0 || endStart < 0) throw new Error(`Não foi possível adaptar ${context} ao modo suspenso.`);
  const end = endStart + endMarker.length;
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

function suspendedWorkflowValidation() {
  return `
const suspendedWorkflowFiles = fs.readdirSync(path.join(root, ".github", "workflows"))
  .filter(file => /\\.ya?ml$/i.test(file))
  .sort();
for (const file of suspendedWorkflowFiles) {
  const workflowPath = path.join(root, ".github", "workflows", file);
  const workflow = fs.readFileSync(workflowPath, "utf8");
  const match = workflow.match(/^on\\s*:\\s*\\n((?:^[ \\t].*\\n|^\\s*$)*)/m);
  const block = match?.[1] || "";
  if (!block.includes("workflow_dispatch:")) fail(\`Workflow suspenso sem acionamento manual: \${file}\`);
  if (/^  (push|pull_request|schedule):/m.test(block)) fail(\`Workflow suspenso contém gatilho automático: \${file}\`);
}
console.log(\`✓ \${suspendedWorkflowFiles.length} workflows confirmados em modo manual e suspenso.\`);
`;
}

if (!manualOnly) {
  await importFresh(path.join(scriptsDirectory, "validate-intelligence-v2-9.mjs"));
  await importFresh(path.join(scriptsDirectory, "validate-build-v2-11.mjs"));
  await importFresh(path.join(scriptsDirectory, "validate-workflows.mjs"));
} else {
  const temporaryFiles = [];
  try {
    const intelligenceSourcePath = path.join(scriptsDirectory, "validate-intelligence-v2-9.mjs");
    const intelligenceSource = fs.readFileSync(intelligenceSourcePath, "utf8");
    const intelligenceStart = 'const workflow = read(".github/workflows/pages.yml");';
    const intelligenceEnd = 'if (workflow.includes("export-notion-snapshot.mjs")) fail("O workflow de Pages não pode substituir o snapshot versionado por leitura ao vivo do Notion.");';
    const intelligenceReplacement = `const workflow = read(".github/workflows/pages.yml");
if (!workflow.includes("workflow_dispatch:")) fail("Workflow de Pages suspenso sem acionamento manual.");
if (/^  (push|pull_request|schedule):/m.test(workflow)) fail("Workflow de Pages suspenso contém gatilho automático.");`;
    const intelligenceAdapted = replaceRange(
      intelligenceSource,
      intelligenceStart,
      intelligenceEnd,
      intelligenceReplacement,
      "validate-intelligence-v2-9.mjs",
    );
    const intelligenceTemporary = path.join(scriptsDirectory, ".validate-intelligence-v2-9-suspended.tmp.mjs");
    fs.writeFileSync(intelligenceTemporary, intelligenceAdapted);
    temporaryFiles.push(intelligenceTemporary);
    await importFresh(intelligenceTemporary);

    const buildSourcePath = path.join(scriptsDirectory, "validate-build-v2-11.mjs");
    const buildSource = fs.readFileSync(buildSourcePath, "utf8");
    const buildStart = 'const pagesWorkflow = read(".github/workflows/pages.yml");';
    const buildEnd = 'if (dispatchCount !== 1) fail(`Workflow do Notion deve criar uma única publicação explícita; encontrado: ${dispatchCount}.`);';
    const buildAdapted = replaceRange(
      buildSource,
      buildStart,
      buildEnd,
      suspendedWorkflowValidation(),
      "validate-build-v2-11.mjs",
    );
    const buildTemporary = path.join(scriptsDirectory, ".validate-build-v2-11-suspended.tmp.mjs");
    fs.writeFileSync(buildTemporary, buildAdapted);
    temporaryFiles.push(buildTemporary);
    await importFresh(buildTemporary);

    const workflowSourcePath = path.join(scriptsDirectory, "validate-workflows.mjs");
    const workflowSource = fs.readFileSync(workflowSourcePath, "utf8");
    const workflowStart = 'const pages = read(".github/workflows/pages.yml");';
    const workflowEnd = 'const notionExporter = read("scripts/export-notion-snapshot.mjs");';
    const workflowAdapted = replaceRange(
      workflowSource,
      workflowStart,
      workflowEnd,
      `${suspendedWorkflowValidation()}\n${workflowEnd}`,
      "validate-workflows.mjs",
    );
    const workflowTemporary = path.join(scriptsDirectory, ".validate-workflows-suspended.tmp.mjs");
    fs.writeFileSync(workflowTemporary, workflowAdapted);
    temporaryFiles.push(workflowTemporary);
    await importFresh(workflowTemporary);
  } finally {
    for (const file of temporaryFiles) fs.rmSync(file, {force: true});
  }
}
