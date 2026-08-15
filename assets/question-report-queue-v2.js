import {profileKey, readJSON, saveJSON, toast} from "./shared-v2-13.js?v=1";

const FIREBASE_VERSION = "12.16.0";
const FIREBASE_CONFIG = Object.freeze({
  apiKey: "AIzaSyC1_x7yhWfSwS7plrE1lv4tt8rzOcll8vU",
  authDomain: "tdas-68014.firebaseapp.com",
  projectId: "tdas-68014",
  storageBucket: "tdas-68014.firebasestorage.app",
  messagingSenderId: "878689644837",
  appId: "1:878689644837:web:6369542fcf969aca50eacc",
});
const FIREBASE_APP_NAME = "sedes-df-questoes-progress";
const PLATFORM_ID = "sedes-df-questoes";
const ACTIVE_PROFILE_KEY = "sedes.questoes.activeProfile.v3";
const REPORTS_KEY = () => profileKey("questionReports.v1");

let modulesPromise = null;
let currentUser = null;
let flushing = false;

const activeProfileId = () => localStorage.getItem(ACTIVE_PROFILE_KEY) || "rodrigo";
const reports = () => {
  const value = readJSON(REPORTS_KEY(), []);
  return Array.isArray(value) ? value : [];
};

function saveReports(items) {
  saveJSON(REPORTS_KEY(), items);
  window.dispatchEvent(new CustomEvent("sedes:question-report-queue-updated", {detail: {reports: items}}));
}

function patchLocalReport(reportId, patch) {
  const current = reports();
  let changed = false;
  const next = current.map(item => {
    if (item?.id !== reportId) return item;
    changed = true;
    return {...item, ...patch};
  });
  if (changed) saveReports(next);
}

async function firebaseModules() {
  if (modulesPromise) return modulesPromise;
  modulesPromise = Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
  ]).then(([app, auth, firestore]) => {
    const firebaseApp = app.getApps().find(item => item.name === FIREBASE_APP_NAME) || app.initializeApp(FIREBASE_CONFIG, FIREBASE_APP_NAME);
    return {auth, firestore, authInstance: auth.getAuth(firebaseApp), db: firestore.getFirestore(firebaseApp)};
  });
  return modulesPromise;
}

function queueRef(firestore, db, uid, reportId) {
  return firestore.doc(
    db,
    "users", String(uid),
    "apps", PLATFORM_ID,
    "reportQueue", String(reportId),
  );
}

function cloudPayload(report, user) {
  return {
    schema: 2,
    platform: PLATFORM_ID,
    ownerUid: String(user.uid),
    ownerEmail: user.email || null,
    profileId: activeProfileId(),
    reportId: report.id,
    questionId: report.questionId || null,
    material: report.material || null,
    category: report.category || "Outro",
    details: report.details || "",
    route: report.route || null,
    release: report.release || null,
    sourceSha: report.sourceSha || null,
    userAgent: report.userAgent || navigator.userAgent,
    createdAt: report.createdAt || new Date().toISOString(),
  };
}

async function sendReport(report, {silent = false} = {}) {
  if (!report?.id) return false;
  if (!navigator.onLine || !currentUser) {
    patchLocalReport(report.id, {queueState: "pending"});
    if (!silent) toast("Relato salvo localmente; ele será enviado à fila de revisão quando sua conta estiver online.", "info");
    return false;
  }
  try {
    const {firestore, db} = await firebaseModules();
    const ref = queueRef(firestore, db, currentUser.uid, report.id);
    const snapshot = await firestore.getDoc(ref);
    if (!snapshot.exists()) {
      await firestore.setDoc(ref, {
        ...cloudPayload(report, currentUser),
        status: "novo",
        queueState: "queued",
        queuedAt: Date.now(),
        serverQueuedAt: firestore.serverTimestamp(),
      });
      patchLocalReport(report.id, {queueState: "queued", status: "novo", queuedAt: new Date().toISOString()});
      if (!silent) toast("Relato enviado para a fila de revisão.", "success");
      return true;
    }
    const remote = snapshot.data() || {};
    patchLocalReport(report.id, {
      queueState: "queued",
      status: remote.status || report.status || "novo",
      queuedAt: report.queuedAt || new Date(Number(remote.queuedAt || Date.now())).toISOString(),
      reviewedAt: remote.reviewedAt || report.reviewedAt || null,
      resolution: remote.resolution || report.resolution || null,
    });
    return true;
  } catch (error) {
    console.warn("Não foi possível enviar o relato à fila de revisão.", error);
    patchLocalReport(report.id, {queueState: "pending", queueErrorAt: new Date().toISOString()});
    if (!silent) toast("O relato continua salvo neste aparelho e será reenviado automaticamente.", "info");
    return false;
  }
}

async function refreshRemoteStatuses() {
  if (!currentUser || !navigator.onLine) return;
  const current = reports();
  if (!current.length) return;
  const {firestore, db} = await firebaseModules();
  let changed = false;
  const next = [];
  for (const report of current) {
    if (!report?.id || report.queueState !== "queued") {
      next.push(report);
      continue;
    }
    try {
      const snapshot = await firestore.getDoc(queueRef(firestore, db, currentUser.uid, report.id));
      if (!snapshot.exists()) {
        next.push({...report, queueState: "pending"});
        changed = true;
        continue;
      }
      const remote = snapshot.data() || {};
      const merged = {
        ...report,
        queueState: "queued",
        status: remote.status || report.status || "novo",
        reviewedAt: remote.reviewedAt || report.reviewedAt || null,
        resolution: remote.resolution || report.resolution || null,
      };
      changed ||= JSON.stringify(merged) !== JSON.stringify(report);
      next.push(merged);
    } catch {
      next.push(report);
    }
  }
  if (changed) saveReports(next);
}

async function flushQueue() {
  if (flushing || !currentUser || !navigator.onLine) return false;
  flushing = true;
  try {
    for (const report of reports()) {
      if (report?.queueState !== "queued") await sendReport(report, {silent: true});
    }
    await refreshRemoteStatuses();
    return true;
  } finally {
    flushing = false;
  }
}

async function initialize() {
  try {
    const {auth, authInstance} = await firebaseModules();
    auth.onAuthStateChanged(authInstance, user => {
      currentUser = user || null;
      if (currentUser && navigator.onLine) flushQueue().catch(console.warn);
    });
  } catch (error) {
    console.warn("Fila de relatos operando somente no modo local.", error);
  }
}

window.addEventListener("sedes:question-report-saved", event => {
  const report = event.detail;
  patchLocalReport(report?.id, {queueState: currentUser && navigator.onLine ? "sending" : "pending"});
  sendReport(report).catch(console.warn);
});
window.addEventListener("sedes:cloud-status", event => {
  if (event.detail?.kind === "saved") flushQueue().catch(console.warn);
});
window.addEventListener("online", () => flushQueue().catch(console.warn));
window.addEventListener("sedes:question-report-queue-updated", () => {
  window.SEDES_CLOUD_PROGRESS?.sync?.();
});

window.SEDES_REPORT_QUEUE = Object.freeze({
  flush: flushQueue,
  refresh: refreshRemoteStatuses,
  getState: () => ({signedIn: Boolean(currentUser), pending: reports().filter(item => item?.queueState !== "queued").length}),
});

initialize();
