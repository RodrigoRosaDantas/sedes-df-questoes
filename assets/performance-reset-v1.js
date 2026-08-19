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
const META_KEY = "sedes.questoes.cloudSync.v1";

const activeProfileId = () => localStorage.getItem(ACTIVE_PROFILE_KEY) || "rodrigo";
const profileKey = (profileId, suffix) => `sedes.questoes.${profileId}.${suffix}`;
const performanceResetKey = profileId => profileKey(profileId, "performanceReset.v1");
const performanceState = (profileId, resetAt) => new Map([
  [profileKey(profileId, "errors.v3"), {}],
  [profileKey(profileId, "errorReasons.v1"), {}],
  [profileKey(profileId, "reviewSchedule.v1"), {}],
  [profileKey(profileId, "reviewProcessedAttempts.v1"), []],
  [profileKey(profileId, "adaptiveReview.v1"), {}],
  [profileKey(profileId, "adaptiveProcessed.v1"), []],
  [performanceResetKey(profileId), {at: resetAt, updatedAt: resetAt, schema: 1}],
]);
const historyKey = profileId => profileKey(profileId, "history.v3");

const fnv1a = input => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};
const stateDocId = key => encodeURIComponent(key);
const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms));

async function waitForCloudIdle() {
  const cloud = window.SEDES_CLOUD_PROGRESS;
  if (!cloud?.getState) return;
  for (let attempt = 0; attempt < 150 && cloud.getState().syncing; attempt += 1) await sleep(100);
  if (cloud.getState().syncing) throw new Error("A sincronização ainda está em andamento. Aguarde alguns segundos e tente novamente.");
}

async function firebaseModules() {
  const [app, auth, firestore] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
  ]);
  const firebaseApp = app.getApps().find(item => item.name === FIREBASE_APP_NAME)
    || app.initializeApp(FIREBASE_CONFIG, FIREBASE_APP_NAME);
  return {auth, firestore, authInstance: auth.getAuth(firebaseApp), db: firestore.getFirestore(firebaseApp)};
}

function clearSyncMeta(uid, profileId) {
  try {
    const meta = JSON.parse(localStorage.getItem(META_KEY) || '{"schema":1,"accounts":{}}');
    if (meta?.accounts) delete meta.accounts[`${uid}:${profileId}`];
    localStorage.setItem(META_KEY, JSON.stringify(meta || {schema: 1, accounts: {}}));
  } catch {
    localStorage.removeItem(META_KEY);
  }
}

function resetLocalPerformance(profileId, resetAt) {
  localStorage.setItem(historyKey(profileId), "[]");
  for (const [key, value] of performanceState(profileId, resetAt)) localStorage.setItem(key, JSON.stringify(value));
  if (profileId === "rodrigo") {
    localStorage.setItem("sedes.questoes.history.v2", "[]");
    localStorage.setItem("sedes.questoes.errorbook.v2", "{}");
  }
}

async function deleteAttempts(refs, firestore, db) {
  const snapshot = await firestore.getDocs(refs.attempts);
  let batch = firestore.writeBatch(db);
  let writes = 0;
  const flush = async () => {
    if (!writes) return;
    await batch.commit();
    batch = firestore.writeBatch(db);
    writes = 0;
  };
  for (const item of snapshot.docs) {
    batch.delete(item.ref);
    writes += 1;
    if (writes >= 400) await flush();
  }
  await flush();
  return snapshot.size;
}

async function resetRemotePerformance(uid, profileId, resetAt, firestore, db) {
  const appRef = firestore.doc(db, "users", String(uid), "apps", PLATFORM_ID);
  const profileRef = firestore.doc(appRef, "profiles", String(profileId));
  const refs = {profileRef, state: firestore.collection(profileRef, "state"), attempts: firestore.collection(profileRef, "attempts")};
  const deletedAttempts = await deleteAttempts(refs, firestore, db);

  let batch = firestore.writeBatch(db);
  let writes = 0;
  for (const [key, value] of performanceState(profileId, resetAt)) {
    const serialized = JSON.stringify(value);
    batch.set(firestore.doc(refs.state, stateDocId(key)), {
      key,
      value: serialized,
      deleted: false,
      hash: fnv1a(serialized),
      updatedAt: resetAt,
      serverUpdatedAt: firestore.serverTimestamp(),
    }, {merge: true});
    writes += 1;
  }
  batch.set(profileRef, {
    lastPerformanceResetAt: resetAt,
    serverLastPerformanceResetAt: firestore.serverTimestamp(),
  }, {merge: true});
  writes += 1;
  if (writes) await batch.commit();
  return deletedAttempts;
}

async function resetPerformance() {
  const profileId = activeProfileId();
  const cloud = window.SEDES_CLOUD_PROGRESS;
  if (!cloud?.getState?.().signedIn) {
    cloud?.open?.();
    throw new Error("Entre na sincronização antes de zerar o aproveitamento, para evitar que dados antigos retornem da nuvem.");
  }

  await waitForCloudIdle();
  const {authInstance, firestore, db} = await firebaseModules();
  const user = authInstance.currentUser;
  if (!user) throw new Error("A sessão da nuvem ainda não está pronta. Abra a sincronização e tente novamente.");

  const resetAt = Date.now();
  const deletedAttempts = await resetRemotePerformance(user.uid, profileId, resetAt, firestore, db);
  resetLocalPerformance(profileId, resetAt);
  clearSyncMeta(user.uid, profileId);
  await window.SEDES_CLOUD_PROGRESS?.sync?.();
  return {profileId, deletedAttempts, resetAt};
}

function confirmationDialog() {
  document.querySelector("[data-performance-reset-dialog]")?.remove();
  const profileId = activeProfileId();
  const backdrop = document.createElement("div");
  backdrop.className = "platform-dialog-backdrop";
  backdrop.dataset.performanceResetDialog = "";
  backdrop.innerHTML = `<section class="platform-dialog card" role="dialog" aria-modal="true" aria-labelledby="performance-reset-title">
    <div><p class="eyebrow">Ação irreversível</p><h2 id="performance-reset-title">Zerar o aproveitamento de ${profileId}?</h2></div>
    <p>Serão apagados somente tentativas concluídas, acertos/erros, percentuais, cobertura, pontos fracos e modelos de revisão derivados desse histórico.</p>
    <p><strong>Serão preservados:</strong> questões marcadas, anotações, preferências, perfis, banco de questões e tentativa em andamento.</p>
    <div class="dialog-actions"><button class="btn danger" type="button" data-performance-reset-confirm>Zerar aproveitamento</button><button class="btn" type="button" data-performance-reset-cancel>Cancelar</button></div>
    <p data-performance-reset-status aria-live="polite"></p>
  </section>`;
  document.body.append(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector("[data-performance-reset-cancel]")?.addEventListener("click", close);
  backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });
  backdrop.querySelector("[data-performance-reset-confirm]")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    const status = backdrop.querySelector("[data-performance-reset-status]");
    button.disabled = true;
    status.textContent = "Zerando apenas os dados de aproveitamento…";
    try {
      const result = await resetPerformance();
      status.textContent = `Aproveitamento zerado. ${result.deletedAttempts} tentativa(s) removida(s) da nuvem.`;
      window.setTimeout(() => location.reload(), 900);
    } catch (error) {
      console.error("Falha ao zerar aproveitamento:", error);
      status.textContent = error?.message || "Não foi possível zerar o aproveitamento.";
      button.disabled = false;
    }
  });
}

function injectResetAction() {
  const page = document.querySelector('[data-ux15-settings-page][data-ux15-tab="dados"]');
  if (!page) return;
  const intro = page.querySelector(".ux15-settings-intro > p:last-child");
  if (intro && !intro.dataset.cloudCopyUpdated) {
    intro.textContent = "O progresso funciona localmente neste navegador e, quando você entra na sincronização, acompanha sua conta entre aparelhos.";
    intro.dataset.cloudCopyUpdated = "true";
  }
  if (page.querySelector("[data-performance-reset-card]")) return;
  const target = page.querySelector(".ux15-data-actions") || page;
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.performanceResetCard = "";
  card.innerHTML = `<strong>Zerar aproveitamento</strong><p>Recomeça as estatísticas do perfil ativo sem apagar suas marcações, anotações, preferências ou sessão em andamento.</p><button class="btn danger" type="button" data-performance-reset-open>Zerar aproveitamento</button>`;
  target.append(card);
  card.querySelector("[data-performance-reset-open]")?.addEventListener("click", confirmationDialog);
}

const observer = new MutationObserver(injectResetAction);
observer.observe(document.querySelector("#app") || document.body, {childList: true, subtree: true});
window.addEventListener("hashchange", () => window.setTimeout(injectResetAction, 0));
window.SEDES_PERFORMANCE_RESET = Object.freeze({open: confirmationDialog, reset: resetPerformance});
injectResetAction();
