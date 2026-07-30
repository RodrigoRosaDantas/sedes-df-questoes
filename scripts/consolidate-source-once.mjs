import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceApp = path.join(root, "assets", "app-v4.js");
const sourceIndex = path.join(root, "index.html");
const distApp = path.join(root, "dist", "assets", "app-v4.js");
const distIndex = path.join(root, "dist", "index.html");

const app = fs.readFileSync(sourceApp, "utf8");
const index = fs.readFileSync(sourceIndex, "utf8");
const alreadyConsolidated = app.includes('const STUDY_INDEX_URL = "./data/release/study-index.json";')
  && app.includes('data-study-view="provas"')
  && app.includes("Catálogo inconsistente.")
  && index.includes("assets/study-navigation-v2-6.css")
  && index.includes("assets/reports-v2-10.js");

if (alreadyConsolidated) {
  console.log("✓ Fontes canônicas já estão consolidadas; nenhuma alteração necessária.");
  process.exit(0);
}

execFileSync("npm", ["run", "build"], {cwd: root, stdio: "inherit"});
for (const required of [distApp, distIndex]) {
  if (!fs.existsSync(required)) throw new Error(`Artefato de consolidação ausente: ${required}`);
}

fs.copyFileSync(distApp, sourceApp);
fs.copyFileSync(distIndex, sourceIndex);

const consolidatedApp = fs.readFileSync(sourceApp, "utf8");
const consolidatedIndex = fs.readFileSync(sourceIndex, "utf8");
for (const marker of [
  'const STUDY_INDEX_URL = "./data/release/study-index.json";',
  'data-study-view="materias"',
  'data-study-view="provas"',
  "function renderDisciplineTopics()",
  "Catálogo inconsistente.",
]) {
  if (!consolidatedApp.includes(marker)) throw new Error(`Fonte consolidada sem marcador: ${marker}`);
}
for (const marker of ["study-navigation-v2-6.css", "reports-v2-10.js", "manifest.webmanifest"]) {
  if (!consolidatedIndex.includes(marker)) throw new Error(`HTML consolidado sem marcador: ${marker}`);
}

console.log("✓ JavaScript e HTML públicos materializados como fontes canônicas.");
