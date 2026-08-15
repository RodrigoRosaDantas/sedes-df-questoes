import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const requireMarkers = (content, markers, label) => markers.forEach(marker => {
  if (!content.includes(marker)) throw new Error(`${label}: marcador ausente: ${marker}`);
});
const forbidMarkers = (content, markers, label) => markers.forEach(marker => {
  if (content.includes(marker)) throw new Error(`${label}: marcador proibido: ${marker}`);
});

const index = read("index.html");
const worker = read("service-worker.js");
const cloud = read("assets/cloud-progress-v1.js");
const queue = read("assets/question-report-queue-v2.js");
const pdf = read("assets/pdf-fidelity-v2.js");
const rules = read("firebase/firestore.rules");
const firebaseConfig = read("firebase.json");
const workflow = read(".github/workflows/validate-public-release.yml");
const publicConfig = read("playwright.public.config.js");

requireMarkers(index, ["question-report-queue-v2.js?v=1", "pdf-fidelity-v2.js?v=1"], "Shell endurecido");
requireMarkers(worker, ["question-report-queue-v2.js?v=1", "pdf-fidelity-v2.js?v=1"], "PWA endurecido");

requireMarkers(cloud, [
  "stableAttemptId",
  "normalizeAttempt",
  "canonicalAttemptPayload",
  "legacy-v2-",
  "batch.delete",
  "connectAuthEmulator",
  "connectFirestoreEmulator",
  "firebaseEmulator",
], "Sincronização de tentativas");
forbidMarkers(cloud, ["-${index}-"], "ID legado de tentativa");

requireMarkers(queue, [
  '"reportQueue", String(reportId)',
  'status: "novo"',
  'queueState: "queued"',
  "refreshRemoteStatuses",
  "SEDES_REPORT_QUEUE",
  "serverQueuedAt",
], "Fila real de relatos");

requireMarkers(pdf, [
  "canvas.toBlob",
  "measureText",
  "drawImage",
  "/DCTDecode",
  "image/jpeg",
  "PDF fiel baixado com Unicode e imagens",
], "PDF fiel");
forbidMarkers(pdf, ["WinAnsiEncoding", "replace(/[^\\x"], "PDF fiel");

requireMarkers(rules, [
  "rules_version = '2'",
  "request.auth.uid == userId",
  "request.auth.token.sedesAdmin == true",
  "allow read, write: if isOwner(userId) || isSedesAdmin()",
  "allow read, write: if false",
], "Regras Firestore");
forbidMarkers(rules, ["allow read, write: if true", "allow read: if true", "allow write: if true"], "Regras Firestore");
requireMarkers(firebaseConfig, ["firebase/firestore.rules", '"auth"', '"firestore"', "9099", "8080"], "Firebase Emulator");

requireMarkers(workflow, [
  "firebase-tools",
  "firebase emulators:exec",
  "firebase-two-device-v1.spec.js",
  "firestore-rules-v1.mjs",
  "--only auth,firestore",
], "CI Firebase");
requireMarkers(publicConfig, ["audit-hardening-v1.spec.js"], "Playwright público");

console.log("✓ Achados da auditoria fechados estruturalmente: fila persistente, IDs estáveis, regras auditáveis, PDF fiel e teste autenticado entre aparelhos.");
