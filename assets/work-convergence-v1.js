import {
  ACTIVE_PROFILE_KEY,
  PROFILES_KEY,
  currentRoute,
  observeApp,
  profileKey,
  profileName,
  readJSON,
  saveJSON,
  toast,
} from "./shared-v2-13.js?v=1";

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
const THEME_KEY = "sedes.questoes.theme";
const ACCOUNT_BINDING_PREFIX = "sedes.questoes.accountProfile.v1:";
const ACCOUNT_RELOAD_KEY = "sedes.questoes.accountBindingReload.v1";
const MATERIAL_KEY = "sedes.questoes.activeMaterialForExport.v1";
const CATALOG_URL = "./data/release/catalogo.json";
const PREFS_KEY = () => profileKey("preferences.v1");
const REPORTS_KEY = () => profileKey("questionReports.v1");
const DEFAULT_PREFS = Object.freeze({count: "20", mode: "treino", scope: "all", theme: "dark", lastCriteria: {}});

let firebasePromise = null;
let catalogPromise = null;
let accountState = {signedIn: false, email: null, uid: null, boundProfile: null, resolving: false};
let syncDebounce = null;

const clean = value => String(value ?? "").trim();
const esc = value => clean(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const activeProfileId = () => localStorage.getItem(ACTIVE_PROFILE_KEY) || "rodrigo";
const knownProfiles = () => readJSON(PROFILES_KEY, []).filter(item => item?.id);
const validProfileId = value => knownProfiles().some(item => item.id === value);
const readPreferences = () => {
  const saved = readJSON(PREFS_KEY(), {});
  return {
    ...DEFAULT_PREFS,
    ...saved,
    lastCriteria: {...DEFAULT_PREFS.lastCriteria, ...(saved.lastCriteria || {})},
  };
};

function queueCloudSync() {
  clearTimeout(syncDebounce);
  syncDebounce = setTimeout(() => window.SEDES_CLOUD_PROGRESS?.sync?.(), 500);
}

function savePreferences(patch = {}) {
  const current = readPreferences();
  const next = {
    ...current,
    ...patch,
    lastCriteria: patch.lastCriteria ? {...current.lastCriteria, ...patch.lastCriteria} : current.lastCriteria,
    updatedAt: new Date().toISOString(),
  };
  saveJSON(PREFS_KEY(), next);
  queueCloudSync();
  window.dispatchEvent(new CustomEvent("sedes:preferences-changed", {detail: next}));
  return next;
}

function applyThemePreference() {
  const theme = readPreferences().theme;
  if (!theme || !["dark", "light"].includes(theme)) return;
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.dataset.theme = theme;
  document.querySelector("#theme-toggle")?.setAttribute("aria-pressed", String(theme === "dark"));
}

function setSelect(root, selector, value) {
  const select = root.querySelector(selector);
  if (!select || value == null || value === "") return;
  if ([...select.options].some(option => option.value === String(value))) select.value = String(value);
}

function studyCriteria(root) {
  return {
    type: root.querySelector("[data-ux-filter-type]")?.value || "",
    discipline: root.querySelector("[data-ux-filter-discipline]")?.value || "",
    cargo: root.querySelector("[data-ux-filter-cargo]")?.value || "",
    year: root.querySelector("[data-ux-filter-year]")?.value || "",
    source: root.querySelector("[data-ux-filter-source]")?.value || "",
    scope: root.querySelector("[data-ux-filter-scope]")?.value || "all",
    count: root.querySelector("[data-ux-filter-count]")?.value || "20",
    mode: root.querySelector("[data-ux-filter-mode]")?.value || "treino",
  };
}

function enhanceStudyPreferences() {
  if (currentRoute() !== "estudar") return;
  const root = document.querySelector("[data-ux-study-launcher]");
  if (!root || root.dataset.workPreferencesBound === "1") return;
  root.dataset.workPreferencesBound = "1";
  const prefs = readPreferences();
  const criteria = {...prefs.lastCriteria, count: prefs.count, mode: prefs.mode, scope: prefs.scope};
  setSelect(root, "[data-ux-filter-type]", criteria.type);
  setSelect(root, "[data-ux-filter-discipline]", criteria.discipline);
  setSelect(root, "[data-ux-filter-cargo]", criteria.cargo);
  setSelect(root, "[data-ux-filter-year]", criteria.year);
  setSelect(root, "[data-ux-filter-source]", criteria.source);
  setSelect(root, "[data-ux-filter-scope]", criteria.scope);
  setSelect(root, "[data-ux-filter-count]", criteria.count);
  setSelect(root, "[data-ux-filter-mode]", criteria.mode);

  root.addEventListener("change", event => {
    if (!event.target.closest("[data-ux-filter-type],[data-ux-filter-discipline],[data-ux-filter-cargo],[data-ux-filter-year],[data-ux-filter-source],[data-ux-filter-scope],[data-ux-filter-count],[data-ux-filter-mode]")) return;
    const next = studyCriteria(root);
    savePreferences({count: next.count, mode: next.mode, scope: next.scope, lastCriteria: next});
  });
}

async function firebaseModules() {
  if (firebasePromise) return firebasePromise;
  firebasePromise = Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
  ]).then(([app, auth, firestore]) => {
    const firebaseApp = app.getApps().find(item => item.name === FIREBASE_APP_NAME) || app.initializeApp(FIREBASE_CONFIG, FIREBASE_APP_NAME);
    return {app, auth, firestore, firebaseApp, authInstance: auth.getAuth(firebaseApp), db: firestore.getFirestore(firebaseApp)};
  });
  return firebasePromise;
}

async function resolveAccountBinding(user) {
  if (!user || accountState.resolving) return;
  accountState = {...accountState, resolving: true, signedIn: true, email: user.email || null, uid: user.uid};
  try {
    const {firestore, db} = await firebaseModules();
    const appRef = firestore.doc(db, "users", String(user.uid), "apps", PLATFORM_ID);
    const snapshot = await firestore.getDoc(appRef);
    const remoteRaw = clean(snapshot.data()?.primaryProfileId);
    const local = activeProfileId();
    const remote = validProfileId(remoteRaw) ? remoteRaw : "";
    const resolved = remote || local;
    if (!remote || remoteRaw !== resolved) {
      await firestore.setDoc(appRef, {
        platform: PLATFORM_ID,
        primaryProfileId: resolved,
        accountSchema: 1,
        updatedAt: Date.now(),
        serverUpdatedAt: firestore.serverTimestamp(),
      }, {merge: true});
    }
    localStorage.setItem(`${ACCOUNT_BINDING_PREFIX}${user.uid}`, resolved);
    accountState = {signedIn: true, email: user.email || null, uid: user.uid, boundProfile: resolved, resolving: false};
    window.dispatchEvent(new CustomEvent("sedes:account-binding", {detail: {...accountState}}));
    if (resolved !== local) {
      localStorage.setItem(ACTIVE_PROFILE_KEY, resolved);
      if (sessionStorage.getItem(ACCOUNT_RELOAD_KEY) !== resolved) {
        sessionStorage.setItem(ACCOUNT_RELOAD_KEY, resolved);
        location.reload();
        return;
      }
    } else {
      sessionStorage.removeItem(ACCOUNT_RELOAD_KEY);
    }
    applyThemePreference();
    queueCloudSync();
  } catch (error) {
    console.warn("Não foi possível resolver o perfil principal da conta.", error);
    accountState = {...accountState, resolving: false, boundProfile: activeProfileId()};
    window.dispatchEvent(new CustomEvent("sedes:account-binding", {detail: {...accountState, error: true}}));
  }
}

async function bindProfileToAccount(profileId) {
  if (!validProfileId(profileId)) throw new Error("Perfil local inválido.");
  const {authInstance, firestore, db} = await firebaseModules();
  const user = authInstance.currentUser;
  if (!user) throw new Error("Entre na conta para vincular um perfil.");
  const appRef = firestore.doc(db, "users", String(user.uid), "apps", PLATFORM_ID);
  await firestore.setDoc(appRef, {
    platform: PLATFORM_ID,
    primaryProfileId: profileId,
    accountSchema: 1,
    updatedAt: Date.now(),
    serverUpdatedAt: firestore.serverTimestamp(),
  }, {merge: true});
  localStorage.setItem(`${ACCOUNT_BINDING_PREFIX}${user.uid}`, profileId);
  localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
  accountState = {signedIn: true, email: user.email || null, uid: user.uid, boundProfile: profileId, resolving: false};
  sessionStorage.setItem(ACCOUNT_RELOAD_KEY, profileId);
  location.reload();
}

function openAccountProfileDialog() {
  document.querySelector("[data-work-account-profile-dialog]")?.remove();
  const profiles = knownProfiles();
  const current = accountState.boundProfile || activeProfileId();
  const backdrop = document.createElement("div");
  backdrop.className = "platform-dialog-backdrop work-account-dialog";
  backdrop.dataset.workAccountProfileDialog = "";
  backdrop.innerHTML = `<section class="platform-dialog card" role="dialog" aria-modal="true" aria-labelledby="work-account-title">
    <p class="eyebrow">Conta e perfil</p><h2 id="work-account-title">Perfil principal desta conta</h2>
    <p>${accountState.email ? `<strong>${esc(accountState.email)}</strong><br>` : ""}O progresso desta conta fica ligado a um perfil principal para evitar misturar históricos entre pessoas.</p>
    <label>Perfil<select data-work-account-profile>${profiles.map(item => `<option value="${esc(item.id)}" ${item.id === current ? "selected" : ""}>${esc(item.name || item.id)}</option>`).join("")}</select></label>
    <div class="dialog-actions"><button class="btn primary" type="button" data-work-account-save>Usar este perfil na conta</button><button class="btn" type="button" data-work-account-cancel>Cancelar</button></div>
  </section>`;
  document.body.append(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector("[data-work-account-cancel]")?.addEventListener("click", close);
  backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });
  backdrop.querySelector("[data-work-account-save]")?.addEventListener("click", async () => {
    const button = backdrop.querySelector("[data-work-account-save]");
    const profileId = backdrop.querySelector("[data-work-account-profile]")?.value;
    button.disabled = true;
    button.textContent = "Vinculando…";
    try { await bindProfileToAccount(profileId); }
    catch (error) { button.disabled = false; button.textContent = "Usar este perfil na conta"; toast(error.message || "Não foi possível vincular o perfil.", "error"); }
  });
}

function installAccountProfileGuard() {
  const button = document.querySelector("#profile-button");
  if (!button || button.dataset.workAccountGuard === "1") return;
  button.dataset.workAccountGuard = "1";
  button.addEventListener("click", event => {
    if (!accountState.signedIn) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openAccountProfileDialog();
  }, true);
}

function reportSummary() {
  const reports = readJSON(REPORTS_KEY(), []);
  const open = reports.filter(item => item?.status !== "resolvido").length;
  return {total: reports.length, open};
}

function settingsMarkup() {
  const prefs = readPreferences();
  const reports = reportSummary();
  const account = accountState.signedIn
    ? `${esc(accountState.email || "Conta conectada")} · perfil ${esc(profileName())}`
    : "Sem conta conectada; o progresso continua local.";
  return `<section class="work-convergence-settings" data-work-convergence-settings>
    <div class="work-convergence-head"><div><p class="eyebrow">Conta e preferências</p><h3>Seu ambiente acompanha você</h3></div><span class="work-account-state">${account}</span></div>
    <div class="work-preference-grid">
      <label><span>Quantidade padrão</span><select data-work-pref-count>${[10,20,30,50].map(value => `<option value="${value}" ${String(value) === String(prefs.count) ? "selected" : ""}>${value} questões</option>`).join("")}</select></label>
      <label><span>Modo padrão</span><select data-work-pref-mode><option value="treino" ${prefs.mode === "treino" ? "selected" : ""}>Treino com correção</option><option value="prova" ${prefs.mode === "prova" ? "selected" : ""}>Simulação de prova</option></select></label>
      <label><span>Situação padrão</span><select data-work-pref-scope><option value="all" ${prefs.scope === "all" ? "selected" : ""}>Todas</option><option value="unanswered" ${prefs.scope === "unanswered" ? "selected" : ""}>Nunca respondidas</option><option value="errors" ${prefs.scope === "errors" ? "selected" : ""}>Erradas</option><option value="marked" ${prefs.scope === "marked" ? "selected" : ""}>Marcadas</option></select></label>
      <label><span>Tema</span><select data-work-pref-theme><option value="dark" ${prefs.theme === "dark" ? "selected" : ""}>Escuro</option><option value="light" ${prefs.theme === "light" ? "selected" : ""}>Claro</option></select></label>
    </div>
    <div class="work-settings-actions"><button class="btn primary compact" type="button" data-work-pref-save>Salvar preferências</button>${accountState.signedIn ? `<button class="btn compact" type="button" data-work-profile-manage>Gerenciar perfil da conta</button>` : `<button class="btn compact" type="button" data-work-cloud-open>Entrar para sincronizar</button>`}</div>
    <div class="work-report-summary"><span><small>Relatos internos</small><strong>${reports.total}</strong></span><span><small>Aguardando revisão</small><strong>${reports.open}</strong></span><p>Relatos ficam no seu progresso e sincronizam com a conta; você não precisa abrir issue no GitHub.</p></div>
  </section>`;
}

function enhanceSettingsDialog() {
  const dialog = document.querySelector(".ux-tech-dialog .platform-dialog");
  if (!dialog || dialog.querySelector("[data-work-convergence-settings]")) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = settingsMarkup();
  const section = wrapper.firstElementChild;
  const closeButton = dialog.querySelector("[data-close-tech]");
  if (closeButton) dialog.insertBefore(section, closeButton); else dialog.append(section);
  section.querySelector("[data-work-pref-save]")?.addEventListener("click", () => {
    const next = savePreferences({
      count: section.querySelector("[data-work-pref-count]")?.value || "20",
      mode: section.querySelector("[data-work-pref-mode]")?.value || "treino",
      scope: section.querySelector("[data-work-pref-scope]")?.value || "all",
      theme: section.querySelector("[data-work-pref-theme]")?.value || "dark",
    });
    localStorage.setItem(THEME_KEY, next.theme);
    document.documentElement.dataset.theme = next.theme;
    document.querySelector("#theme-toggle")?.setAttribute("aria-pressed", String(next.theme === "dark"));
    toast("Preferências salvas e prontas para sincronizar.", "success");
  });
  section.querySelector("[data-work-profile-manage]")?.addEventListener("click", openAccountProfileDialog);
  section.querySelector("[data-work-cloud-open]")?.addEventListener("click", () => window.SEDES_CLOUD_PROGRESS?.open?.());
}

async function loadMaterial() {
  const id = clean(sessionStorage.getItem(MATERIAL_KEY));
  if (!id) throw new Error("Material não identificado. Volte à lista e abra-o novamente.");
  catalogPromise ||= fetch(CATALOG_URL, {cache: "no-store"}).then(response => {
    if (!response.ok) throw new Error(`Catálogo indisponível: HTTP ${response.status}.`);
    return response.json();
  });
  const catalog = await catalogPromise;
  const meta = (catalog.materials || []).find(item => clean(item.id) === id);
  if (!meta?.file) throw new Error("Material não localizado no catálogo.");
  const response = await fetch(new URL(clean(meta.file).replace(/^\.\//, ""), document.baseURI), {cache: "no-store"});
  if (!response.ok) throw new Error(`Material indisponível: HTTP ${response.status}.`);
  return response.json();
}

const pdfText = value => clean(value)
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/[\u2013\u2014]/g, "-")
  .replace(/\u2026/g, "...")
  .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "?");
const pdfEscape = value => pdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const binaryBytes = value => Uint8Array.from([...value].map(char => char.charCodeAt(0) & 0xff));
const slug = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "material";

function wrapText(value, limit = 92) {
  const paragraphs = pdfText(value).split(/\r?\n/);
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      if (!line) { line = word; continue; }
      if (`${line} ${word}`.length <= limit) line += ` ${word}`;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function materialPdfLines(material, includeAnswers) {
  const questions = Array.isArray(material.questoes) ? material.questoes : [];
  const lines = [];
  const push = (text, size = 10, gap = 14) => lines.push({text, size, gap});
  push(clean(material.nome) || "Material de questões", 16, 24);
  push(includeAnswers ? "Caderno comentado" : "Caderno para responder", 12, 20);
  push(`Disciplina: ${clean(material.disciplina) || "Não informada"}`);
  push(`Fonte: ${clean(material.fonte) || "Banco Mestre"}`);
  push(`Quantidade: ${questions.length} questões`, 10, 22);
  questions.forEach((question, index) => {
    const number = clean(question?.numero) || index + 1;
    push(`Questão ${number}${question?.codigo ? ` - ${clean(question.codigo)}` : ""}`, 12, 18);
    if (question?.texto_base) wrapText(question.texto_base).forEach(line => push(line));
    wrapText(question?.enunciado || "Enunciado não disponível.").forEach(line => push(line));
    const alternatives = Array.isArray(question?.alternativas)
      ? question.alternativas.map((text, idx) => [String.fromCharCode(65 + idx), text])
      : Object.entries(question?.alternativas || {});
    alternatives.forEach(([label, text]) => wrapText(`${label}) ${text}`, 86).forEach(line => push(line)));
    const hasImage = Boolean(question?.imagem || question?.imagem_url || question?.image || (Array.isArray(question?.imagens) && question.imagens.length));
    if (hasImage) push("[Imagem disponível na versão completa da plataforma]", 9, 16);
    if (includeAnswers) {
      push(`Gabarito: ${clean(question?.gabarito) || "-"}`, 10, 16);
      if (question?.comentario) wrapText(`Comentário: ${question.comentario}`, 86).forEach(line => push(line));
      if (question?.fundamento) wrapText(`Fundamento: ${question.fundamento}`, 86).forEach(line => push(line));
      if (question?.pegadinha) wrapText(`Pegadinha: ${question.pegadinha}`, 86).forEach(line => push(line));
    }
    push("", 10, 18);
  });
  return lines;
}

function buildPdfBytes(material, includeAnswers) {
  const lines = materialPdfLines(material, includeAnswers);
  const pages = [[]];
  let y = 790;
  for (const line of lines) {
    if (y < 54) { pages.push([]); y = 790; }
    pages.at(-1).push({...line, y});
    y -= line.gap || 14;
  }
  const pageCount = pages.length;
  const fontId = 3 + pageCount * 2;
  const objects = new Map();
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  objects.set(2, `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
  pages.forEach((page, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    const stream = page.map(line => `BT /F1 ${line.size || 10} Tf 1 0 0 1 48 ${line.y} Tm (${pdfEscape(line.text)}) Tj ET`).join("\n");
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.set(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

  let binary = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  for (let id = 1; id <= fontId; id += 1) {
    offsets[id] = binary.length;
    binary += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xref = binary.length;
  binary += `xref\n0 ${fontId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= fontId; id += 1) binary += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  binary += `trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return binaryBytes(binary);
}

async function downloadDirectPdf(includeAnswers, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Gerando…";
  try {
    const material = await loadMaterial();
    const bytes = buildPdfBytes(material, includeAnswers);
    const blob = new Blob([bytes], {type: "application/pdf"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slug(material.nome)}-${includeAnswers ? "comentado" : "sem-gabarito"}.pdf`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    const hasImages = (material.questoes || []).some(question => question?.imagem || question?.imagem_url || question?.image || (Array.isArray(question?.imagens) && question.imagens.length));
    toast(hasImages ? "PDF baixado. Para preservar imagens, use também a versão completa por impressão." : "PDF baixado diretamente.", "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Não foi possível gerar o PDF.", "error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function enhanceDirectDownloads() {
  const card = document.querySelector("[data-material-download-card]");
  if (!card || card.querySelector("[data-work-direct-pdf]")) return;
  const actions = card.querySelector(".material-download-actions");
  if (!actions) return;
  const direct = document.createElement("div");
  direct.className = "work-direct-pdf-actions";
  direct.dataset.workDirectPdf = "";
  direct.innerHTML = `<button class="btn primary" type="button" data-work-pdf="questions">Baixar PDF direto</button><button class="btn" type="button" data-work-pdf="answers">Baixar PDF comentado</button><small>Download imediato. As opções originais abaixo continuam disponíveis para impressão completa, inclusive com imagens.</small>`;
  actions.before(direct);
  direct.querySelector('[data-work-pdf="questions"]')?.addEventListener("click", event => downloadDirectPdf(false, event.currentTarget));
  direct.querySelector('[data-work-pdf="answers"]')?.addEventListener("click", event => downloadDirectPdf(true, event.currentTarget));
  actions.querySelector('[data-export-material="questions"]')?.replaceChildren(document.createTextNode("Imprimir versão completa"));
  actions.querySelector('[data-export-material="answers"]')?.replaceChildren(document.createTextNode("Imprimir comentado"));
}

function refreshEnhancements() {
  enhanceStudyPreferences();
  enhanceSettingsDialog();
  enhanceDirectDownloads();
  installAccountProfileGuard();
}

async function initializeAccountBinding() {
  if (!navigator.onLine) return;
  try {
    const {auth, authInstance} = await firebaseModules();
    auth.onAuthStateChanged(authInstance, user => {
      if (!user) {
        accountState = {signedIn: false, email: null, uid: null, boundProfile: null, resolving: false};
        window.dispatchEvent(new CustomEvent("sedes:account-binding", {detail: {...accountState}}));
        refreshEnhancements();
        return;
      }
      resolveAccountBinding(user).then(refreshEnhancements).catch(console.error);
    });
  } catch (error) {
    console.warn("Integração de conta indisponível; preferências locais permanecem ativas.", error);
  }
}

applyThemePreference();
document.querySelector("#theme-toggle")?.addEventListener("click", () => {
  setTimeout(() => savePreferences({theme: document.documentElement.dataset.theme === "light" ? "light" : "dark"}), 0);
});
window.addEventListener("sedes:cloud-status", refreshEnhancements);
window.addEventListener("sedes:account-binding", refreshEnhancements);
new MutationObserver(refreshEnhancements).observe(document.body, {childList: true, subtree: true});
observeApp(refreshEnhancements);
initializeAccountBinding();

window.SEDES_WORK_CONVERGENCE = Object.freeze({
  getPreferences: readPreferences,
  savePreferences,
  getAccountState: () => ({...accountState}),
  manageProfile: openAccountProfileDialog,
  downloadMaterialPdf: includeAnswers => loadMaterial().then(material => {
    const blob = new Blob([buildPdfBytes(material, Boolean(includeAnswers))], {type: "application/pdf"});
    return {blob, filename: `${slug(material.nome)}-${includeAnswers ? "comentado" : "sem-gabarito"}.pdf`};
  }),
});
