import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageData = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const base = String(process.argv[2] || "").replace(/\/+$/, "");
const expectedSha = String(process.argv[3] || process.env.GITHUB_SHA || "").trim();
const [major, minor] = String(packageData.version || "").split(".");
const expectedCacheVersion = major && minor ? `sedes-questoes-v${major}-${minor}` : "";

if (!base.startsWith("http")) throw new Error("URL pública do GitHub Pages não informada.");
if (!expectedCacheVersion) throw new Error(`Versão da aplicação inválida: ${packageData.version || "ausente"}.`);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fetchJSON = async relative => {
  const response = await fetch(`${base}/${relative}?verify=${Date.now()}`, {cache: "no-store"});
  if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`);
  return response.json();
};
const fetchText = async relative => {
  const response = await fetch(`${base}/${relative}?verify=${Date.now()}`, {cache: "no-store"});
  if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`);
  return response.text();
};

let lastError;
for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    const [buildInfo, catalog, index, app, worker, reports] = await Promise.all([
      fetchJSON("data/release/build-info.json"),
      fetchJSON("data/release/catalogo.json"),
      fetchText("index.html"),
      fetchText("assets/app-v4.js"),
      fetchText("service-worker.js"),
      fetchText("assets/reports-v2-10.js"),
    ]);

    const questions = Object.keys(catalog.question_index || {}).length;
    const materials = Array.isArray(catalog.materials) ? catalog.materials.length : 0;
    const appReference = index.match(/assets\/app-v4\.js\?v=\d+/)?.[0] || "";

    if (buildInfo.version !== packageData.version) throw new Error(`Versão pública ${buildInfo.version}; esperada ${packageData.version}.`);
    if (expectedSha && buildInfo.source_sha !== expectedSha) throw new Error(`Commit público ${buildInfo.source_sha}; esperado ${expectedSha}.`);
    if (buildInfo.builder !== "copy-public-v2-11-1") throw new Error("Pacote público não foi copiado das fontes canônicas.");
    if (!buildInfo.source_files_sha256?.index_html || !buildInfo.source_files_sha256?.app_js) throw new Error("Hashes das fontes canônicas ausentes.");
    if (buildInfo.questions !== questions || buildInfo.materials !== materials) throw new Error("Totais públicos divergem do catálogo entregue.");
    if (questions !== Number(catalog.summary?.questoes) || materials !== Number(catalog.summary?.materiais)) throw new Error("Resumo público diverge dos dados reais.");
    if (!appReference) throw new Error("HTML público sem referência versionada ao aplicativo.");
    for (const marker of ["reports-v2-10.js?v=2", "manifest.webmanifest", appReference]) {
      if (!index.includes(marker)) throw new Error(`HTML público sem ${marker}.`);
    }
    for (const marker of ["Catálogo inconsistente.", 'data-study-view="provas"', "function renderDisciplineTopics()"] ) {
      if (!app.includes(marker)) throw new Error(`Aplicação pública sem ${marker}.`);
    }
    if (!worker.includes(expectedCacheVersion) || !worker.includes(appReference)) {
      throw new Error(`Service worker público desatualizado: esperados ${expectedCacheVersion} e ${appReference}.`);
    }
    if (!reports.includes("restoreBackupTransaction")) throw new Error("Relatórios e backup não foram publicados.");

    console.log(`✓ Deploy estático confirmado em ${base}: versão ${buildInfo.version}, commit ${buildInfo.source_sha}, cache ${expectedCacheVersion}, ${questions} questões e ${materials} materiais.`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.log(`Tentativa ${attempt}/30: publicação ainda não confirmada — ${error.message}`);
    if (attempt < 30) await sleep(5000);
  }
}

throw lastError || new Error("Não foi possível confirmar a publicação.");
