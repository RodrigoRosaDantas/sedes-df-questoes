import {currentRoute, ensureData, observeApp, state} from "./shared-v2-13.js?v=1";

const BRASILIA = "America/Sao_Paulo";
let focusToken = 0;

function syncTimestamp() {
  return state.release?.exported_at || state.catalog?.exported_at || null;
}

function relativeSync(value) {
  const time = new Date(value || 0).getTime();
  if (!Number.isFinite(time) || time <= 0) return {label: "sincronização indisponível", state: "stale"};
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return {label: "sincronizado agora", state: "fresh"};
  if (minutes < 60) return {label: `sincronizado há ${minutes} min`, state: "fresh"};
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return {label: `sincronizado há ${hours}h${rest ? ` ${rest}min` : ""}`, state: "fresh"};
  const days = Math.floor(hours / 24);
  return {label: `sincronizado há ${days} dia${days === 1 ? "" : "s"}`, state: days <= 3 ? "attention" : "stale"};
}

function absoluteSync(value) {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return "Não disponível";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRASILIA,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(date);
}

function enhanceSyncStatus() {
  const timestamp = syncTimestamp();
  const relative = relativeSync(timestamp);
  document.querySelectorAll("[data-ux15-sync-time]").forEach(node => {
    const parent = node.parentElement;
    if (!parent || parent.querySelector("[data-ux15-sync-age]")) return;
    const badge = document.createElement("em");
    badge.dataset.ux15SyncAge = "";
    badge.className = `ux15-sync-age ${relative.state}`;
    badge.textContent = relative.label;
    parent.append(" ", badge);
  });
  document.querySelectorAll("[data-ux15-sync-age]").forEach(node => {
    node.className = `ux15-sync-age ${relative.state}`;
    node.textContent = relative.label;
    node.title = `Última sincronização do catálogo: ${absoluteSync(timestamp)} · horário de Brasília`;
  });
  const shell = document.querySelector("#sync-label");
  if (shell) shell.title = `${relative.label}. Última sincronização: ${absoluteSync(timestamp)} · horário de Brasília`;
}

const ROUTES = {
  estudar: "Estudar",
  revisar: "Revisar",
  desempenho: "Desempenho",
};

function enhanceBreadcrumb() {
  const route = currentRoute();
  document.querySelectorAll("[data-ux15-breadcrumb]").forEach(node => {
    if (!ROUTES[route] || node.dataset.ux15Breadcrumb !== route) node.remove();
  });
  if (!ROUTES[route] || document.querySelector(`[data-ux15-breadcrumb="${route}"]`)) return;
  const heading = document.querySelector("#app .page-heading");
  if (!heading) return;
  const nav = document.createElement("nav");
  nav.className = "ux15-breadcrumb";
  nav.dataset.ux15Breadcrumb = route;
  nav.setAttribute("aria-label", "Caminho da página");
  nav.innerHTML = `<a href="#/inicio">Início</a><span aria-hidden="true">›</span><strong>${ROUTES[route]}</strong>`;
  heading.insertAdjacentElement("beforebegin", nav);
}

function focusSearchWhenReady() {
  const token = ++focusToken;
  const started = performance.now();
  const attempt = () => {
    if (token !== focusToken) return;
    const input = document.querySelector("[data-ux-question-search]");
    if (input) {
      input.focus({preventScroll: true});
      input.closest(".ux-question-search")?.scrollIntoView({behavior: "smooth", block: "center"});
      return;
    }
    if (performance.now() - started < 3500) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}

function bindSearchNavigation() {
  document.addEventListener("click", event => {
    if (!event.target.closest("[data-ux15-search]")) return;
    focusSearchWhenReady();
  }, true);
  document.addEventListener("keydown", event => {
    const target = event.target;
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
    if (event.key === "/" && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      location.hash = "#/estudar";
      focusSearchWhenReady();
    }
    if (event.key === "Escape" && document.activeElement?.matches?.("[data-ux-question-search]")) document.activeElement.blur();
  });
}

function enhance() {
  enhanceSyncStatus();
  enhanceBreadcrumb();
}

bindSearchNavigation();
ensureData().then(() => observeApp(enhance)).catch(error => console.error("Falha ao iniciar polimento de navegação v2.15:", error));
