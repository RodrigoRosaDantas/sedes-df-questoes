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
const SYNC_INTERVAL = 15000;
const EXCLUDED_SUFFIXES = ["vault.v1"];

let modulesPromise = null;
let currentUser = null;
let syncing = false;
let lastSyncAt = null;
let syncTimer = null;
let observedProfile = null;
let authUnsubscribe = null;

const fnv1a = input => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};
const safeJSON = (value, fallback = null) => {
  try { return value == null ? fallback : JSON.parse(value); }
  catch { return fallback; }
};
const stableSerialize = value => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
const activeProfileId = () => localStorage.getItem(ACTIVE_PROFILE_KEY) || "rodrigo";
const profilePrefix = profileId => `sedes.questoes.${profileId}.`;
const historyKey = profileId => `${profilePrefix(profileId)}history.v3`;
const stateDocId = key => encodeURIComponent(key);
const canonicalAttemptPayload = attempt => stableSerialize(Object.fromEntries(Object.entries(attempt || {}).filter(([key]) => key !== "id")));
const stableAttemptId = attempt => String(attempt?.id || `legacy-v2-${attempt?.finishedAt || attempt?.savedAt || attempt?.startedAt || "attempt"}-${fnv1a(canonicalAttemptPayload(attempt))}`);
const normalizeAttempt = attempt => {
  if (!attempt || typeof attempt !== "object") return attempt;
  return attempt.id ? attempt : {...attempt, id: stableAttemptId(attempt)};
};
const attemptDocId = attempt => encodeURIComponent(stableAttemptId(attempt));
const timestampOf = value => {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const attemptTimestamp = attempt => Math.max(timestampOf(attempt?.finishedAt), timestampOf(attempt?.savedAt), timestampOf(attempt?.startedAt));

function readMeta() {
  return safeJSON(localStorage.getItem(META_KEY), {schema: 1, accounts: {}}) || {schema: 1, accounts: {}};
}
function writeMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); }
  catch (error) { console.warn("Não foi possível salvar metadados de sincronização.", error); }
}
function metaFor(uid, profileId) {
  const meta = readMeta();
  const key = `${uid}:${profileId}`;
  const entry = meta.accounts?.[key] || {hashes: {}, lastSyncAt: null};
  return {meta, key, entry};
}
function saveMeta(uid, profileId, entry) {
  const {meta, key} = metaFor(uid, profileId);
  meta.accounts = {...(meta.accounts || {}), [key]: entry};
  writeMeta(meta);
}

function collectState(profileId) {
  const prefix = profilePrefix(profileId);
  const history = historyKey(profileId);
  const state = new Map();
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix) || key === history || EXCLUDED_SUFFIXES.some(suffix => key.endsWith(suffix))) continue;
    const value = localStorage.getItem(key);
    if (value != null) state.set(key, value);
  }
  return state;
}
function collectAttempts(profileId) {
  const parsed = safeJSON(localStorage.getItem(historyKey(profileId)), []);
  return Array.isArray(parsed) ? parsed : [];
}

async function firebaseModules() {
  if (modulesPromise) return modulesPromise;
  modulesPromise = Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
  ]).then(([app, auth, firestore]) => {
    const firebaseApp = app.getApps().find(item => item.name === FIREBASE_APP_NAME) || app.initializeApp(FIREBASE_CONFIG, FIREBASE_APP_NAME);
    const authInstance = auth.getAuth(firebaseApp);
    const db = firestore.getFirestore(firebaseApp);
    const emulatorMode = typeof location !== "undefined"
      && ["127.0.0.1", "localhost"].includes(location.hostname)
      && new URLSearchParams(location.search).get("firebaseEmulator") === "1";
    if (emulatorMode) {
      auth.connectAuthEmulator(authInstance, "http://127.0.0.1:9099", {disableWarnings: true});
      firestore.connectFirestoreEmulator(db, "127.0.0.1", 8080);
    }
    return {app, auth, firestore, firebaseApp, authInstance, db};
  });
  return modulesPromise;
}

function formatClock(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false}).format(new Date(value));
}
function statusCopy(kind) {
  if (kind === "saving") return "Salvando…";
  if (kind === "saved") return `Salvo · ${formatClock(lastSyncAt)}`;
  if (kind === "error") return "Falha ao sincronizar";
  if (kind === "offline") return "Offline · salvo local";
  if (kind === "signed-out") return "Salvo neste aparelho";
  return "Preparando sync";
}
function setStatus(kind, detail = "") {
  const button = ensureCloudButton();
  button.dataset.cloudState = kind;
  button.querySelector("[data-cloud-label]").textContent = statusCopy(kind);
  button.title = detail || statusCopy(kind);
  window.dispatchEvent(new CustomEvent("sedes:cloud-status", {detail: {kind, text: statusCopy(kind), detail, lastSyncAt, user: currentUser?.email || null}}));
}
function ensureCloudButton() {
  let button = document.querySelector("[data-cloud-progress]");
  if (button) return button;
  button = document.createElement("button");
  button.type = "button";
  button.className = "cloud-progress-pill";
  button.dataset.cloudProgress = "";
  button.innerHTML = `<span class="cloud-progress-dot" aria-hidden="true"></span><span data-cloud-label>Preparando sync</span>`;
  button.setAttribute("aria-label", "Sincronização do progresso");
  button.addEventListener("click", openCloudDialog);
  const actions = document.querySelector(".top-actions");
  if (actions) actions.insertBefore(button, document.querySelector("#profile-button") || actions.firstChild);
  else document.body.append(button);
  return button;
}

function profileRefs(db, firestore, uid, profileId) {
  const appRef = firestore.doc(db, "users", String(uid), "apps", PLATFORM_ID);
  const profileRef = firestore.doc(appRef, "profiles", String(profileId));
  return {
    appRef,
    profileRef,
    state: firestore.collection(profileRef, "state"),
    attempts: firestore.collection(profileRef, "attempts"),
  };
}

function mergeObjectEntry(remote, local) {
  if (local == null) return remote;
  if (remote == null) return local;
  if (typeof local !== "object" || typeof remote !== "object" || Array.isArray(local) || Array.isArray(remote)) return local;
  const localTime = Math.max(timestampOf(local.updatedAt), timestampOf(local.lastResultAt), timestampOf(local.savedAt), timestampOf(local.finishedAt));
  const remoteTime = Math.max(timestampOf(remote.updatedAt), timestampOf(remote.lastResultAt), timestampOf(remote.savedAt), timestampOf(remote.finishedAt));
  if (localTime || remoteTime) return localTime >= remoteTime ? local : remote;
  return {...remote, ...local};
}
function mergeSerialized(key, localValue, remoteValue) {
  if (localValue == null) return remoteValue;
  if (remoteValue == null) return localValue;
  const local = safeJSON(localValue, undefined);
  const remote = safeJSON(remoteValue, undefined);
  if (local === undefined || remote === undefined) return localValue;
  if (/session\.v3$/.test(key)) {
    return JSON.stringify(timestampOf(local?.savedAt) >= timestampOf(remote?.savedAt) ? local : remote);
  }
  if (Array.isArray(local) && Array.isArray(remote)) {
    const merged = [...remote];
    const seen = new Set(merged.map(item => typeof item === "object" && item ? String(item.id || JSON.stringify(item)) : JSON.stringify(item)));
    for (const item of local) {
      const id = typeof item === "object" && item ? String(item.id || JSON.stringify(item)) : JSON.stringify(item);
      if (!seen.has(id)) { seen.add(id); merged.push(item); }
    }
    return JSON.stringify(merged);
  }
  if (local && remote && typeof local === "object" && typeof remote === "object") {
    const merged = {...remote};
    for (const keyName of new Set([...Object.keys(remote), ...Object.keys(local)])) merged[keyName] = mergeObjectEntry(remote[keyName], local[keyName]);
    return JSON.stringify(merged);
  }
  return localValue;
}

async function readRemoteState(refs, firestore) {
  const snapshot = await firestore.getDocs(refs.state);
  const map = new Map();
  snapshot.forEach(item => {
    const data = item.data() || {};
    if (data.key) map.set(data.key, data);
  });
  return map;
}
async function readRemoteAttempts(refs, firestore) {
  const snapshot = await firestore.getDocs(refs.attempts);
  const map = new Map();
  snapshot.forEach(item => {
    const data = item.data() || {};
    const attempt = safeJSON(data.payload, null);
    if (attempt) map.set(item.id, {attempt, hash: data.hash || fnv1a(data.payload || ""), data});
  });
  return map;
}

async function syncAttempts(profileId, refs, firestore) {
  const localRaw = collectAttempts(profileId);
  const local = localRaw.map(normalizeAttempt).filter(Boolean);
  const remote = await readRemoteAttempts(refs, firestore);
  const remoteCanonical = new Map();

  for (const [remoteDocId, item] of remote) {
    const attempt = normalizeAttempt(item.attempt);
    const canonicalId = attemptDocId(attempt);
    const existing = remoteCanonical.get(canonicalId);
    const aliases = [...(existing?.aliases || []), remoteDocId];
    const winner = !existing || attemptTimestamp(attempt) >= attemptTimestamp(existing.attempt)
      ? {...item, attempt, aliases}
      : {...existing, aliases};
    remoteCanonical.set(canonicalId, winner);
  }

  const byId = new Map();
  for (const attempt of local) byId.set(attemptDocId(attempt), attempt);
  for (const [canonicalId, item] of remoteCanonical) if (!byId.has(canonicalId)) byId.set(canonicalId, item.attempt);

  const merged = [...byId.values()]
    .sort((a, b) => attemptTimestamp(b) - attemptTimestamp(a))
    .slice(0, 250);
  const localSerialized = JSON.stringify(localRaw);
  const mergedSerialized = JSON.stringify(merged);
  if (localSerialized !== mergedSerialized) localStorage.setItem(historyKey(profileId), mergedSerialized);

  const db = refs.profileRef.firestore || (await firebaseModules()).db;
  let batch = firestore.writeBatch(db);
  let writes = 0;
  const flush = async () => {
    if (!writes) return;
    await batch.commit();
    batch = firestore.writeBatch(db);
    writes = 0;
  };

  for (const attempt of merged) {
    const id = attemptDocId(attempt);
    const payload = JSON.stringify(attempt);
    const hash = fnv1a(payload);
    const canonicalRemote = remote.get(id);
    if (canonicalRemote?.hash !== hash) {
      batch.set(firestore.doc(refs.attempts, id), {
        payload,
        hash,
        stableIdSchema: 2,
        updatedAt: Date.now(),
        serverUpdatedAt: firestore.serverTimestamp(),
      }, {merge: true});
      writes += 1;
    }

    const aliases = remoteCanonical.get(id)?.aliases || [];
    for (const alias of aliases) {
      if (alias === id) continue;
      batch.delete(firestore.doc(refs.attempts, alias));
      writes += 1;
      if (writes >= 380) await flush();
    }
    if (writes >= 380) await flush();
  }
  await flush();
}

async function syncState(profileId, refs, firestore, db, uid) {
  const local = collectState(profileId);
  const remote = await readRemoteState(refs, firestore);
  const {entry} = metaFor(uid, profileId);
  const previous = entry.hashes || {};
  const nextHashes = {...previous};
  const allKeys = new Set([...local.keys(), ...remote.keys(), ...Object.keys(previous)]);
  const pushes = [];

  for (const key of allKeys) {
    const localValue = local.has(key) ? local.get(key) : null;
    const remoteRecord = remote.get(key) || null;
    const remoteValue = remoteRecord?.deleted ? null : (remoteRecord?.value ?? null);
    const localHash = localValue == null ? null : fnv1a(localValue);
    const remoteHash = remoteRecord ? (remoteRecord.deleted ? null : (remoteRecord.hash || fnv1a(remoteValue || ""))) : null;
    const previousKnown = Object.prototype.hasOwnProperty.call(previous, key);
    const previousHash = previousKnown ? previous[key] : undefined;

    let resolved = localValue;
    let push = false;
    if (!previousKnown) {
      if (localValue == null && remoteRecord) resolved = remoteValue;
      else if (!remoteRecord && localValue != null) push = true;
      else if (remoteRecord && localHash !== remoteHash) { resolved = mergeSerialized(key, localValue, remoteValue); push = true; }
    } else {
      const localChanged = localHash !== previousHash;
      const remoteChanged = remoteHash !== previousHash;
      if (!localChanged && remoteChanged) resolved = remoteValue;
      else if (localChanged && !remoteChanged) push = true;
      else if (localChanged && remoteChanged) { resolved = localValue == null ? null : mergeSerialized(key, localValue, remoteValue); push = true; }
    }

    const resolvedHash = resolved == null ? null : fnv1a(resolved);
    if (resolved == null) {
      if (localStorage.getItem(key) != null) localStorage.removeItem(key);
    } else if (localStorage.getItem(key) !== resolved) localStorage.setItem(key, resolved);
    if (push || (remoteRecord && resolvedHash !== remoteHash)) pushes.push({key, value: resolved, hash: resolvedHash});
    nextHashes[key] = resolvedHash;
  }

  if (pushes.length) {
    let batch = firestore.writeBatch(db);
    let writes = 0;
    for (const item of pushes) {
      const ref = firestore.doc(refs.state, stateDocId(item.key));
      batch.set(ref, item.value == null
        ? {key: item.key, deleted: true, hash: null, updatedAt: Date.now(), serverUpdatedAt: firestore.serverTimestamp()}
        : {key: item.key, value: item.value, deleted: false, hash: item.hash, updatedAt: Date.now(), serverUpdatedAt: firestore.serverTimestamp()},
      {merge: true});
      writes += 1;
      if (writes === 400) { await batch.commit(); batch = firestore.writeBatch(db); writes = 0; }
    }
    if (writes) await batch.commit();
  }

  saveMeta(uid, profileId, {hashes: nextHashes, lastSyncAt: new Date().toISOString()});
}

async function syncProfile(profileId = activeProfileId()) {
  if (!currentUser || syncing) return false;
  if (!navigator.onLine) { setStatus("offline"); return false; }
  syncing = true;
  setStatus("saving", `Sincronizando o perfil ${profileId}.`);
  try {
    const {firestore, db} = await firebaseModules();
    const refs = profileRefs(db, firestore, currentUser.uid, profileId);
    await firestore.setDoc(refs.appRef, {platform: PLATFORM_ID, updatedAt: Date.now(), serverUpdatedAt: firestore.serverTimestamp()}, {merge: true});
    await firestore.setDoc(refs.profileRef, {profileId, updatedAt: Date.now(), serverUpdatedAt: firestore.serverTimestamp()}, {merge: true});
    await syncAttempts(profileId, refs, firestore);
    await syncState(profileId, refs, firestore, db, currentUser.uid);
    lastSyncAt = Date.now();
    observedProfile = profileId;
    setStatus("saved", `Progresso do perfil ${profileId} sincronizado na nuvem.`);
    return true;
  } catch (error) {
    console.error("Falha na sincronização do progresso:", error);
    setStatus("error", "O progresso continua salvo neste aparelho. Abra a sincronização para tentar novamente.");
    return false;
  } finally {
    syncing = false;
    renderCloudDialog();
  }
}

async function signIn(email, password) {
  const {auth, authInstance} = await firebaseModules();
  await auth.setPersistence(authInstance, auth.browserLocalPersistence).catch(() => {});
  return auth.signInWithEmailAndPassword(authInstance, String(email || "").trim(), String(password || ""));
}
async function signUp(email, password) {
  const {auth, authInstance} = await firebaseModules();
  await auth.setPersistence(authInstance, auth.browserLocalPersistence).catch(() => {});
  return auth.createUserWithEmailAndPassword(authInstance, String(email || "").trim(), String(password || ""));
}
async function signOutCloud() {
  const {auth, authInstance} = await firebaseModules();
  await auth.signOut(authInstance);
}

function dialogMarkup() {
  const profile = activeProfileId();
  if (!currentUser) return `<section class="cloud-dialog-card card" role="dialog" aria-modal="true" aria-labelledby="cloud-dialog-title">
    <button class="cloud-dialog-close" type="button" data-cloud-close aria-label="Fechar">×</button>
    <p class="eyebrow">Progresso entre aparelhos</p><h2 id="cloud-dialog-title">Entrar para sincronizar</h2>
    <p>Seu progresso continua funcionando localmente. Ao entrar, histórico, sessão, erros, marcadas e revisões passam a acompanhar sua conta.</p>
    <label>E-mail<input type="email" autocomplete="username" data-cloud-email></label>
    <label>Senha<input type="password" autocomplete="current-password" minlength="6" data-cloud-password></label>
    <p class="cloud-dialog-message" data-cloud-message aria-live="polite"></p>
    <div class="cloud-dialog-actions"><button class="btn primary" type="button" data-cloud-signin>Entrar</button><button class="btn" type="button" data-cloud-signup>Criar conta</button></div>
    <small>Perfil local ativo: <strong>${profile}</strong>. O armazenamento local permanece como camada offline.</small>
  </section>`;
  return `<section class="cloud-dialog-card card" role="dialog" aria-modal="true" aria-labelledby="cloud-dialog-title">
    <button class="cloud-dialog-close" type="button" data-cloud-close aria-label="Fechar">×</button>
    <p class="eyebrow">Progresso entre aparelhos</p><h2 id="cloud-dialog-title">Sincronização ativa</h2>
    <p><strong>${currentUser.email || "Conta autenticada"}</strong></p>
    <div class="cloud-dialog-facts"><span><small>Perfil</small><strong>${profile}</strong></span><span><small>Último sync</small><strong>${lastSyncAt ? formatClock(lastSyncAt) : "ainda não"}</strong></span><span><small>Estado</small><strong>${navigator.onLine ? "online" : "offline"}</strong></span></div>
    <p class="cloud-dialog-message" data-cloud-message aria-live="polite">${syncing ? "Sincronizando…" : "O progresso local é preservado mesmo se a nuvem ficar indisponível."}</p>
    <div class="cloud-dialog-actions"><button class="btn primary" type="button" data-cloud-sync ${syncing ? "disabled" : ""}>Sincronizar agora</button><button class="btn" type="button" data-cloud-signout>Sair da conta</button></div>
  </section>`;
}
function renderCloudDialog() {
  const backdrop = document.querySelector(".cloud-dialog-backdrop");
  if (!backdrop) return;
  backdrop.innerHTML = dialogMarkup();
  bindDialog(backdrop);
}
function bindDialog(backdrop) {
  const close = () => backdrop.remove();
  backdrop.querySelector("[data-cloud-close]")?.addEventListener("click", close);
  backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });
  backdrop.querySelector("[data-cloud-sync]")?.addEventListener("click", () => syncProfile());
  backdrop.querySelector("[data-cloud-signout]")?.addEventListener("click", async () => {
    try { await signOutCloud(); close(); }
    catch (error) { backdrop.querySelector("[data-cloud-message]").textContent = "Não foi possível sair agora."; }
  });
  const submit = async mode => {
    const email = backdrop.querySelector("[data-cloud-email]")?.value || "";
    const password = backdrop.querySelector("[data-cloud-password]")?.value || "";
    const message = backdrop.querySelector("[data-cloud-message]");
    if (!email || password.length < 6) { message.textContent = "Informe um e-mail válido e uma senha com pelo menos 6 caracteres."; return; }
    message.textContent = mode === "signup" ? "Criando conta…" : "Entrando…";
    try {
      if (mode === "signup") await signUp(email, password); else await signIn(email, password);
      message.textContent = "Conta conectada. Sincronizando progresso…";
    } catch (error) {
      console.error(error);
      message.textContent = "Não foi possível autenticar. Confira e-mail/senha ou tente novamente.";
    }
  };
  backdrop.querySelector("[data-cloud-signin]")?.addEventListener("click", () => submit("signin"));
  backdrop.querySelector("[data-cloud-signup]")?.addEventListener("click", () => submit("signup"));
}
function openCloudDialog() {
  document.querySelector(".cloud-dialog-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "cloud-dialog-backdrop";
  backdrop.innerHTML = dialogMarkup();
  document.body.append(backdrop);
  bindDialog(backdrop);
  backdrop.querySelector("input,button")?.focus();
}

async function initializeCloudProgress() {
  ensureCloudButton();
  if (!navigator.onLine) { setStatus("offline"); return; }
  try {
    const {auth, authInstance} = await firebaseModules();
    await auth.setPersistence(authInstance, auth.browserLocalPersistence).catch(() => {});
    if (authUnsubscribe) authUnsubscribe();
    authUnsubscribe = auth.onAuthStateChanged(authInstance, async user => {
      currentUser = user || null;
      if (!currentUser) { setStatus("signed-out", "Entre para sincronizar o progresso entre aparelhos."); renderCloudDialog(); return; }
      await syncProfile();
      renderCloudDialog();
    });
  } catch (error) {
    console.warn("Firebase indisponível; mantendo progresso local.", error);
    setStatus("offline", "A nuvem não pôde ser carregada. O progresso local continua ativo.");
  }
}

window.addEventListener("online", () => currentUser ? syncProfile() : setStatus("signed-out"));
window.addEventListener("offline", () => setStatus("offline"));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && currentUser) syncProfile(); });
window.addEventListener("pagehide", () => { if (currentUser && navigator.onLine) syncProfile(); });

syncTimer = window.setInterval(() => {
  const profile = activeProfileId();
  if (profile !== observedProfile && currentUser) syncProfile(profile);
  else if (currentUser) syncProfile(profile);
}, SYNC_INTERVAL);

window.SEDES_CLOUD_PROGRESS = Object.freeze({
  sync: () => syncProfile(),
  open: openCloudDialog,
  getState: () => ({signedIn: Boolean(currentUser), email: currentUser?.email || null, profile: activeProfileId(), lastSyncAt, syncing}),
});

initializeCloudProgress();
