import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const requireMarkers = (content, markers, context) => markers.forEach(marker => {
  if (!content.includes(marker)) throw new Error(`${context}: marcador ausente: ${marker}`);
});

const index = read("index.html");
const worker = read("service-worker.js");
const cloud = read("assets/cloud-progress-v1.js");
const reset = read("assets/performance-reset-v1.js");
const integrity = read("assets/product-integrity-v1.js");
const shared = read("assets/shared-v2-13.js");
const command = read("assets/work-command-center-v1.js");
const css = read("assets/cloud-progress-v1.css");
const builder = read("scripts/build-public.mjs");
const provenance = read("scripts/reconcile-cloud-provenance-v1.mjs");
const verifier = read("scripts/verify-public-release.mjs");
const publicConfig = read("playwright.public.config.js");
const firebaseTest = read("tests-integration/firebase-two-device-v1.spec.js");
const readme = read("README.md");

requireMarkers(index, [
  "cloud-progress-v1.css?v=1",
  "cloud-progress-v1.js?v=1",
  "performance-reset-v1.js?v=1",
  "work-command-center-v1.js?v=1",
  "product-integrity-v1.js?v=1",
], "Shell");
requireMarkers(worker, [
  "cloud-progress-v1.css?v=1",
  "cloud-progress-v1.js?v=1",
  "performance-reset-v1.js?v=1",
  "work-command-center-v1.js?v=1",
  "product-integrity-v1.js?v=1",
], "PWA");
requireMarkers(builder, ["copy(\"assets\")"], "Build público");

requireMarkers(cloud, [
  'const PLATFORM_ID = "sedes-df-questoes"',
  'const FIREBASE_APP_NAME = "sedes-df-questoes-progress"',
  '"users", String(uid), "apps", PLATFORM_ID',
  '"profiles", String(profileId)',
  'firestore.collection(profileRef, "state")',
  'firestore.collection(profileRef, "attempts")',
  "browserLocalPersistence",
  "signInWithEmailAndPassword",
  "createUserWithEmailAndPassword",
  "writeBatch",
  "serverTimestamp",
  "Salvando…",
  "Salvo neste aparelho",
  "Offline · salvo local",
  "Falha ao sincronizar",
  "sedes:cloud-status",
  "window.SEDES_CLOUD_PROGRESS",
  "performanceResetKey",
  "performanceResetAt",
  "syncPerformanceResetMarker",
  "staleRemoteIds",
  "sanitizePerformanceSerialized",
  "await syncPerformanceResetMarker(profileId, refs, firestore, db);",
  "await syncAttempts(profileId, refs, firestore);",
  "await syncState(profileId, refs, firestore, db, currentUser.uid);",
], "Firebase progress");

for (const forbidden of ["BEGIN PRIVATE KEY", '"private_key"', "serviceAccount", "client_email"]) {
  if (cloud.includes(forbidden) || reset.includes(forbidden) || integrity.includes(forbidden)) throw new Error(`Camada Firebase contém material de credencial proibido: ${forbidden}`);
}
if (!cloud.includes('EXCLUDED_SUFFIXES = ["vault.v1"]')) throw new Error("O cofre criptografado local não foi excluído da sincronização em nuvem.");
if (!cloud.includes("collectAttempts") || !cloud.includes("historyKey")) throw new Error("Histórico não possui caminho dedicado de sincronização.");

requireMarkers(reset, [
  "performanceResetKey",
  "performanceReset.v1",
  "errorReasons.v1",
  "resetAt = Date.now()",
  "resetRemotePerformance(user.uid, profileId, resetAt",
  "resetLocalPerformance(profileId, resetAt)",
  "A sincronização ainda está em andamento",
  "questões marcadas, anotações, preferências, perfis, banco de questões e tentativa em andamento",
], "Reset seguro do aproveitamento");

requireMarkers(integrity, [
  "accountIsSignedIn",
  "Local-first + nuvem",
  "data-clear-profile",
  "data.integrityManageData",
  "data.integrityImportProfile",
  "Importar e mesclar backup",
  "reconciliado com a nuvem",
  "SEDES_WORK_CONVERGENCE?.savePreferences?.({theme})",
  "routeSignedInProfileChoice",
  "data-work-account-profile",
  "#theme-toggle",
  "installSkipLinkGuard",
  "acompanha sua conta entre dispositivos",
], "Integridade de produto");

requireMarkers(shared, [
  "bootstrapStandaloneRoleSync",
  "data-estudo-por-cargo-page",
  'await import("./cloud-progress-v1.js?v=1")',
  'await import("./work-convergence-v1.js?v=1")',
  "roleDirectSyncReload.v1",
], "Sincronização direta Estudo por Cargo");
requireMarkers(firebaseTest, [
  "reset em um aparelho não pode ser desfeito",
  "troca de perfil nas Configurações respeita",
  "Estudo por Cargo aberto diretamente restaura o progresso da conta",
], "Firebase Emulator");

requireMarkers(command, [
  "Central de comando",
  "Faça agora",
  "Banco de questões",
  "Revisões",
  "Caderno de erros",
  "Desempenho",
  "Buscar questões",
  "Dados oficiais",
  "Seu progresso",
  "SEDES_CLOUD_PROGRESS",
  "lastCloudKind",
  'lastCloudKind === "saved"',
  'lastCloudKind === "saving"',
  'const startedOffline = !navigator.onLine || lastCloudKind === "offline"',
  'window.addEventListener("online", recoverCloudAfterOfflineStart)',
  "location.reload()",
  "if (node.textContent !== value) node.textContent = value",
], "Central de comando");
if (/forEach\(node => \{\s*node\.textContent = cloudStateText\(\)/s.test(command)) {
  throw new Error("Central de comando voltou a mutar o DOM em todo ciclo do observer.");
}
requireMarkers(css, ["cloud-progress-pill", "cloud-dialog-backdrop", "work-command-center", "work-command-grid"], "CSS cloud/work");

requireMarkers(provenance, [
  'platform_cloud_progress_js: "assets/cloud-progress-v1.js"',
  'platform_cloud_progress_css: "assets/cloud-progress-v1.css"',
  'platform_work_command_center_js: "assets/work-command-center-v1.js"',
  "source_files_sha256",
  "cloud_progress_provenance",
], "Proveniência Firebase");
requireMarkers(verifier, [
  '"scripts/reconcile-cloud-provenance-v1.mjs"',
  '"scripts/validate-cloud-progress-v1.mjs"',
  '"platform_cloud_progress_js"',
  '"platform_cloud_progress_css"',
  '"platform_work_command_center_js"',
], "Auditoria reproduzível");
requireMarkers(publicConfig, ["cloud-progress-v1.spec.js", "preexam-stability-v1.spec.js", "full-site-integrity-v1.spec.js"], "Playwright público");

for (const obsolete of [
  "A sincronização automática entre aparelhos não é ativada",
  "sem envio automático a servidor",
  "abre uma issue pré-preenchida no repositório",
]) {
  if (readme.includes(obsolete)) throw new Error(`README preservou contrato obsoleto: ${obsolete}`);
}
requireMarkers(readme, ["Firebase Authentication", "Firestore", "local-first", "reporte interno", "Configurações → Dados", "PBKDF2", "AES-GCM"], "README atual");

console.log("✓ Firebase e integridade de produto validados: conta/perfil, temas, reset, importação por mescla, Por Cargo direto, offline, copy atual e regressões protegidas.");