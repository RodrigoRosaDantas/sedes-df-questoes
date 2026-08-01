import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageData = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const base = String(process.argv[2] || "").replace(/\/+$/, "");
const expectedSha = String(process.argv[3] || process.env.GITHUB_SHA || "").trim();
const versionToken = String(packageData.version || "").replace(/\./g, "-");
const expectedCacheVersion = `sedes-questoes-v${versionToken}`;
const expectedBuilder = `copy-public-v${versionToken}`;
if (!base.startsWith("http")) throw new Error("URL pública do GitHub Pages não informada.");
if (!/^\d+-\d+-\d+$/.test(versionToken)) throw new Error(`Versão da aplicação inválida: ${packageData.version || "ausente"}.`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fetchJSON = async relative => { const response = await fetch(`${base}/${relative}?verify=${Date.now()}`, {cache: "no-store"}); if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`); return response.json(); };
const fetchText = async relative => { const response = await fetch(`${base}/${relative}?verify=${Date.now()}`, {cache: "no-store"}); if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`); return response.text(); };
let lastError;
for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    const [buildInfo, releaseMeta, catalog, index, app, worker, pwa, reports, shared, release, vault, report, official, adaptive] = await Promise.all([
      fetchJSON("data/release/build-info.json"), fetchJSON("data/release/release-meta.json"), fetchJSON("data/release/catalogo.json"), fetchText("index.html"), fetchText("assets/app-v4.js"), fetchText("service-worker.js"), fetchText("assets/pwa-v2-9.js"), fetchText("assets/reports-v2-10.js"), fetchText("assets/shared-v2-13.js"), fetchText("assets/release-v2-13.js"), fetchText("assets/vault-v2-13.js"), fetchText("assets/report-v2-13.js"), fetchText("assets/official-exam-v2-13.js"), fetchText("assets/adaptive-review-v2-13.js")
    ]);
    const questions = Object.keys(catalog.question_index || {}).length, materials = Array.isArray(catalog.materials) ? catalog.materials.length : 0;
    const appReference = index.match(/assets\/app-v4\.js\?v=\d+/)?.[0] || "", pwaReference = index.match(/assets\/pwa-v2-9\.js\?v=\d+/)?.[0] || "";
    if (buildInfo.version !== packageData.version || releaseMeta.app_version !== packageData.version) throw new Error(`Versão pública divergente; esperada ${packageData.version}.`);
    if (expectedSha && (buildInfo.source_sha !== expectedSha || releaseMeta.source_sha !== expectedSha)) throw new Error(`Commit público divergente; esperado ${expectedSha}.`);
    if (buildInfo.builder !== expectedBuilder || releaseMeta.builder !== expectedBuilder) throw new Error(`Builder público divergente; esperado ${expectedBuilder}.`);
    if (buildInfo.cache_version !== expectedCacheVersion || releaseMeta.cache_version !== expectedCacheVersion) throw new Error(`Cache público divergente; esperado ${expectedCacheVersion}.`);
    for (const hash of ["index_html", "app_js", "service_worker_js", "platform_shared_js", "platform_release_js", "platform_vault_js", "platform_report_js", "platform_official_exam_js", "platform_adaptive_review_js", "platform_css"]) if (!buildInfo.source_files_sha256?.[hash] || !releaseMeta.source_files_sha256?.[hash]) throw new Error(`Hash público ausente: ${hash}.`);
    if (buildInfo.questions !== questions || buildInfo.materials !== materials || releaseMeta.questions !== questions || releaseMeta.materials !== materials) throw new Error("Totais públicos divergem do catálogo entregue.");
    if (questions !== Number(catalog.summary?.questoes) || materials !== Number(catalog.summary?.materiais)) throw new Error("Resumo público diverge dos dados reais.");
    if (!appReference || !pwaReference) throw new Error("HTML público sem referências versionadas ao aplicativo e ao PWA.");
    for (const marker of [appReference, pwaReference, "reports-v2-10.js?v=2", "release-v2-13.js?v=1", "vault-v2-13.js?v=1", "report-v2-13.js?v=1", "official-exam-v2-13.js?v=1", "adaptive-review-v2-13.js?v=1", "platform-v2-13.css?v=1", "manifest.webmanifest"]) if (!index.includes(marker)) throw new Error(`HTML público sem ${marker}.`);
    for (const marker of ["Catálogo inconsistente.", 'data-study-view="provas"', "function renderDisciplineTopics()"] ) if (!app.includes(marker)) throw new Error(`Aplicação pública sem ${marker}.`);
    for (const marker of [expectedCacheVersion, appReference, pwaReference, "shared-v2-13.js?v=1", "release-v2-13.js?v=1", "vault-v2-13.js?v=1", "report-v2-13.js?v=1", "official-exam-v2-13.js?v=1", "adaptive-review-v2-13.js?v=1", "release-meta", 'event.request.mode === "navigate"', 'cache: "no-store"', 'type === "SKIP_WAITING"']) if (!worker.includes(marker)) throw new Error(`Service worker público sem ${marker}.`);
    for (const marker of ['updateViaCache: "none"', "controllerchange", "registration.update()"] ) if (!pwa.includes(marker)) throw new Error(`Registro PWA público sem ${marker}.`);
    if (!reports.includes("restoreBackupTransaction")) throw new Error("Relatórios e backup legado não foram publicados.");
    const moduleChecks = [[shared, ["release-meta.json", "createCompatibleSession"]], [release, ["Integridade da publicação"]], [vault, ["sedes-protected-backup", "PBKDF2"]], [report, ["Reportar problema nesta questão"]], [official, ["Prova Real SEDES/DF 2026", "240"]], [adaptive, ["Revisão adaptativa", "mastery"]]];
    for (const [content, markers] of moduleChecks) for (const marker of markers) if (!content.includes(marker)) throw new Error(`Módulo 2.13 público sem ${marker}.`);
    if (releaseMeta.official_exam?.objective_questions !== 60 || releaseMeta.official_exam?.joint_duration_minutes !== 240) throw new Error("Plano oficial público divergente.");
    console.log(`✓ Deploy estático confirmado em ${base}: versão ${buildInfo.version}, commit ${buildInfo.source_sha}, cache ${expectedCacheVersion}, ${questions} questões e ${materials} materiais.`);
    process.exit(0);
  } catch (error) { lastError = error; console.log(`Tentativa ${attempt}/30: publicação ainda não confirmada — ${error.message}`); if (attempt < 30) await sleep(5000); }
}
throw lastError || new Error("Não foi possível confirmar a publicação.");
