import {activeSession, currentRoute, observeApp} from "./shared-v2-13.js?v=1";

const CLOUD_RECOVERY_KEY = "sedes.questoes.cloudRecovery.v1";
let lastCloudKind = document.querySelector("[data-cloud-progress]")?.dataset.cloudState || null;
let lastCloudSyncAt = window.SEDES_CLOUD_PROGRESS?.getState?.()?.lastSyncAt || null;
const startedOffline = !navigator.onLine || lastCloudKind === "offline";

function routeTo(route) {
  location.hash = `#/${route}`;
}
function scrollToErrors() {
  routeTo("revisar");
  window.setTimeout(() => {
    const target = [...document.querySelectorAll("section,article,div")].find(node => /caderno de erros/i.test(node.querySelector?.("h1,h2,h3")?.textContent || ""));
    target?.scrollIntoView({behavior: "smooth", block: "start"});
  }, 350);
}
function focusQuestionSearch() {
  routeTo("estudar");
  window.setTimeout(() => document.querySelector("[data-ux-question-search], input[type=search]")?.focus(), 320);
}
function startNow() {
  if (activeSession()) return routeTo("resolver");
  const target = document.querySelector("[data-ux-today], [data-ux15-start], [data-ux-start-today]");
  if (target) target.scrollIntoView({behavior: "smooth", block: "center"});
  document.querySelector("[data-ux15-start], [data-ux-start-today]")?.focus();
}

function progressSyncAge(value) {
  const time = Number(value || 0);
  if (!Number.isFinite(time) || time <= 0) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days === 1 ? "" : "s"}`;
}

function cloudStateText() {
  const cloud = window.SEDES_CLOUD_PROGRESS?.getState?.();
  const syncedAt = lastCloudSyncAt || cloud?.lastSyncAt || null;
  const age = progressSyncAge(syncedAt);
  if (lastCloudKind === "saved") return `progresso salvo na conta${age ? ` · ${age}` : ""}`;
  if (lastCloudKind === "saving") return "sincronizando seu progresso";
  if (lastCloudKind === "error") return "progresso local; falha ao sincronizar";
  if (lastCloudKind === "offline") return "offline; progresso salvo localmente";
  if (lastCloudKind === "signed-out") return "progresso local; entre para sincronizar";
  if (!cloud?.signedIn) return "progresso local; entre para sincronizar";
  if (cloud.syncing) return "sincronizando seu progresso";
  return syncedAt ? `progresso salvo na conta${age ? ` · ${age}` : ""}` : "conta conectada";
}
function updateCloudCopy() {
  const value = cloudStateText();
  document.querySelectorAll("[data-work-cloud-state]").forEach(node => {
    if (node.textContent !== value) node.textContent = value;
  });
}
function handleCloudStatus(event) {
  lastCloudKind = event.detail?.kind || document.querySelector("[data-cloud-progress]")?.dataset.cloudState || lastCloudKind;
  lastCloudSyncAt = event.detail?.lastSyncAt || window.SEDES_CLOUD_PROGRESS?.getState?.()?.lastSyncAt || lastCloudSyncAt;
  updateCloudCopy();
}
function recoverCloudAfterOfflineStart() {
  if (!startedOffline) return;
  try {
    if (sessionStorage.getItem(CLOUD_RECOVERY_KEY) === "1") return;
    sessionStorage.setItem(CLOUD_RECOVERY_KEY, "1");
  } catch {}
  location.reload();
}

function injectCommandCenter() {
  if (currentRoute() !== "inicio") return;
  const home = document.querySelector("[data-ux15-home]") || document.querySelector(".ux15-home");
  if (!home || home.querySelector("[data-work-command-center]")) return;
  const head = home.querySelector(".ux15-home-head") || home.firstElementChild;
  if (!head) return;
  const section = document.createElement("section");
  section.className = "work-command-center";
  section.dataset.workCommandCenter = "";
  section.innerHTML = `<div class="work-command-head"><div><p class="eyebrow">Central de comando</p><h2>Chegue ao que precisa com um toque.</h2></div><p>O catálogo é oficial; seu histórico é pessoal.</p></div>
    <div class="work-command-grid">
      <button class="work-command-action" type="button" data-work-now><b>⌂ Faça agora</b><small>${activeSession() ? "Continuar tentativa" : "Plano do dia"}</small></button>
      <button class="work-command-action" type="button" data-work-bank><b>▶ Banco de questões</b><small>Filtros e recortes</small></button>
      <button class="work-command-action" type="button" data-work-review><b>↻ Revisões</b><small>D0/D7/D20 + adaptativa</small></button>
      <button class="work-command-action" type="button" data-work-errors><b>! Caderno de erros</b><small>Reincidências e correção</small></button>
      <button class="work-command-action" type="button" data-work-performance><b>◔ Desempenho</b><small>Histórico e evolução</small></button>
      <button class="work-command-action" type="button" data-work-search><b>⌕ Buscar questões</b><small>Matéria, assunto ou texto</small></button>
    </div>
    <div class="work-data-separation" aria-label="Origem dos dados">
      <span><small>Dados oficiais</small><strong>Catálogo publicado e versionado</strong></span>
      <span><small>Seu progresso</small><strong data-work-cloud-state>${cloudStateText()}</strong></span>
    </div>`;
  head.insertAdjacentElement("afterend", section);
  section.querySelector("[data-work-now]").addEventListener("click", startNow);
  section.querySelector("[data-work-bank]").addEventListener("click", () => routeTo("estudar"));
  section.querySelector("[data-work-review]").addEventListener("click", () => routeTo("revisar"));
  section.querySelector("[data-work-errors]").addEventListener("click", scrollToErrors);
  section.querySelector("[data-work-performance]").addEventListener("click", () => routeTo("desempenho"));
  section.querySelector("[data-work-search]").addEventListener("click", focusQuestionSearch);
}

if (navigator.onLine) {
  try { sessionStorage.removeItem(CLOUD_RECOVERY_KEY); } catch {}
}
window.addEventListener("sedes:cloud-status", handleCloudStatus);
window.addEventListener("online", recoverCloudAfterOfflineStart);
observeApp(() => {
  injectCommandCenter();
  updateCloudCopy();
});