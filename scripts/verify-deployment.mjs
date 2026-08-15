import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageData = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const artifactReleaseMetaPath = path.join(root, "dist", "data", "release", "release-meta.json");
if (!fs.existsSync(artifactReleaseMetaPath)) {
  throw new Error("Metadado do artefato aprovado ausente em dist/data/release/release-meta.json.");
}
const artifactReleaseMeta = JSON.parse(fs.readFileSync(artifactReleaseMetaPath, "utf8"));
const base = String(process.argv[2] || "").replace(/\/+$/, "");
const expectedSha = String(process.argv[3] || process.env.GITHUB_SHA || "").trim();
const expectedVersion = String(artifactReleaseMeta.app_version || packageData.version || "").trim();
const versionToken = expectedVersion.replace(/\./g, "-");
const expectedCacheVersion = String(artifactReleaseMeta.cache_version || "").trim();
const expectedBuilder = String(artifactReleaseMeta.builder || "").trim();
const artifactSha = String(artifactReleaseMeta.source_sha || "").trim();
const expectedQuestions = Number(artifactReleaseMeta.questions);
const expectedMaterials = Number(artifactReleaseMeta.materials);
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

if (!base.startsWith("http")) throw new Error("URL pública do GitHub Pages não informada.");
if (!/^\d+-\d+-\d+$/.test(versionToken)) throw new Error(`Versão do artefato inválida: ${expectedVersion || "ausente"}.`);
if (!expectedCacheVersion.startsWith(`sedes-questoes-v${versionToken}`)) throw new Error(`Cache do artefato incompatível com a versão ${expectedVersion}: ${expectedCacheVersion || "ausente"}.`);
if (!expectedBuilder) throw new Error("Builder do artefato aprovado ausente.");
if (expectedSha && artifactSha !== expectedSha) throw new Error(`Artefato aprovado pertence ao commit ${artifactSha || "ausente"}, não ao SHA autorizado ${expectedSha}.`);
if (!Number.isInteger(expectedQuestions) || expectedQuestions < 1) throw new Error("Total de questões do artefato aprovado é inválido.");
if (!Number.isInteger(expectedMaterials) || expectedMaterials < 1) throw new Error("Total de materiais do artefato aprovado é inválido.");

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

const canonicalHashKeys = [
  "index_html",
  "app_js",
  "service_worker_js",
  "pwa_js",
  "platform_shared_js",
  "platform_release_js",
  "platform_vault_js",
  "platform_report_js",
  "platform_official_exam_js",
  "platform_adaptive_review_js",
  "platform_navigation_js",
  "platform_css",
];

let lastError;
for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    const [buildInfo, releaseMeta, catalog, index, app, worker, pwa, reports, shared, release, vault, report, official, adaptive, navigation, platformCss] = await Promise.all([
      fetchJSON("data/release/build-info.json"),
      fetchJSON("data/release/release-meta.json"),
      fetchJSON("data/release/catalogo.json"),
      fetchText("index.html"),
      fetchText("assets/app-v4.js"),
      fetchText("service-worker.js"),
      fetchText("assets/pwa-v2-9.js"),
      fetchText("assets/reports-v2-10.js"),
      fetchText("assets/shared-v2-13.js"),
      fetchText("assets/release-v2-13.js"),
      fetchText("assets/vault-v2-13.js"),
      fetchText("assets/report-v2-13.js"),
      fetchText("assets/official-exam-v2-13.js"),
      fetchText("assets/adaptive-review-v2-13.js"),
      fetchText("assets/navigation-v2-15.js"),
      fetchText("assets/platform-v2-13.css"),
    ]);
    const questions = Object.keys(catalog.question_index || {}).length;
    const materials = Array.isArray(catalog.materials) ? catalog.materials.length : 0;

    if (buildInfo.version !== expectedVersion || releaseMeta.app_version !== expectedVersion) throw new Error(`Versão pública divergente; esperada ${expectedVersion}.`);
    if (expectedSha && (buildInfo.source_sha !== expectedSha || releaseMeta.source_sha !== expectedSha)) throw new Error(`Commit público divergente; esperado ${expectedSha}.`);
    if (buildInfo.builder !== expectedBuilder || releaseMeta.builder !== expectedBuilder) throw new Error(`Builder público divergente; esperado ${expectedBuilder}.`);
    if (buildInfo.cache_version !== expectedCacheVersion || releaseMeta.cache_version !== expectedCacheVersion) throw new Error(`Cache público divergente; esperado ${expectedCacheVersion}.`);

    const publicCanonicalContents = {
      index_html: index,
      app_js: app,
      service_worker_js: worker,
      pwa_js: pwa,
      platform_shared_js: shared,
      platform_release_js: release,
      platform_vault_js: vault,
      platform_report_js: report,
      platform_official_exam_js: official,
      platform_adaptive_review_js: adaptive,
      platform_navigation_js: navigation,
      platform_css: platformCss,
    };
    for (const hash of canonicalHashKeys) {
      const artifactHash = artifactReleaseMeta.source_files_sha256?.[hash];
      if (!/^[0-9a-f]{64}$/.test(String(artifactHash || ""))) throw new Error(`Artefato aprovado sem hash canônico válido: ${hash}.`);
      if (buildInfo.source_files_sha256?.[hash] !== artifactHash || releaseMeta.source_files_sha256?.[hash] !== artifactHash) {
        throw new Error(`Hash publicado nos metadados diverge do artefato aprovado: ${hash}.`);
      }
      const publicHash = sha256(publicCanonicalContents[hash]);
      if (publicHash !== artifactHash) throw new Error(`Arquivo público diverge byte a byte do artefato aprovado: ${hash}.`);
    }

    if (questions !== expectedQuestions || materials !== expectedMaterials) throw new Error("Catálogo público diverge dos totais do artefato aprovado.");
    if (buildInfo.questions !== expectedQuestions || releaseMeta.questions !== expectedQuestions || buildInfo.materials !== expectedMaterials || releaseMeta.materials !== expectedMaterials) {
      throw new Error("Metadados públicos divergem dos totais do artefato aprovado.");
    }
    if (questions !== Number(catalog.summary?.questoes) || materials !== Number(catalog.summary?.materiais)) throw new Error("Resumo público diverge dos dados reais.");

    for (const marker of ["Catálogo inconsistente.", 'data-study-view="provas"', "function renderDisciplineTopics()"] ) {
      if (!app.includes(marker)) throw new Error(`Aplicação pública sem ${marker}.`);
    }
    for (const marker of ['updateViaCache: "none"', "controllerchange", "registration.update()"] ) {
      if (!pwa.includes(marker)) throw new Error(`Registro PWA público sem ${marker}.`);
    }
    if (!reports.includes("restoreBackupTransaction")) throw new Error("Relatórios e backup legado não foram publicados.");

    const moduleChecks = [
      [shared, ["release-meta.json", "createCompatibleSession"]],
      [release, ["enhanceReleaseMetadata", "data-release-footer"]],
      [vault, ["sedes-protected-backup", "PBKDF2"]],
      [report, ["Reportar problema nesta questão"]],
      [official, ["Prova Real SEDES/DF 2026", "240"]],
      [adaptive, ["Revisão adaptativa", "mastery"]],
      [navigation, ["Dados do projeto", "Aguardando auditoria", "America/Sao_Paulo"]],
    ];
    for (const [content, markers] of moduleChecks) {
      for (const marker of markers) if (!content.includes(marker)) throw new Error(`Módulo 2.13 público sem ${marker}.`);
    }
    if (releaseMeta.official_exam?.objective_questions !== 60 || releaseMeta.official_exam?.joint_duration_minutes !== 240) throw new Error("Plano oficial público divergente.");

    console.log(`✓ Deploy estático confirmado em ${base}: arquivos públicos idênticos ao artefato aprovado por SHA-256, versão ${expectedVersion}, commit ${buildInfo.source_sha}, cache ${expectedCacheVersion}, ${questions} questões e ${materials} materiais.`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.log(`Tentativa ${attempt}/30: publicação ainda não confirmada — ${error.message}`);
    if (attempt < 30) await sleep(5000);
  }
}

throw lastError || new Error("Não foi possível confirmar a publicação.");