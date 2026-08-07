import {
  createCompatibleSession,
  currentRoute,
  ensureData,
  esc,
  materialIdFromIndex,
  observeApp,
  profileRoles,
  shuffle,
  state,
} from "./shared-v2-13.js?v=1";

const BRASILIA = "America/Sao_Paulo";
let focusToken = 0;

function primeRouteClass() {
  document.documentElement.classList.toggle("ux15-clean-home", currentRoute() === "inicio");
}

primeRouteClass();
window.addEventListener("hashchange", primeRouteClass);

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

function pruneLegacyHome() {
  if (currentRoute() !== "inicio") return;
  const app = document.querySelector("#app");
  const home = app?.querySelector(":scope > [data-ux15-home]");
  if (!app || !home) return;
  for (const child of [...app.children]) if (child !== home) child.remove();
}

function availableIdsForRole(role) {
  const materialIds = new Set((state.catalog?.materials || [])
    .filter(item => String(item.codigo_cargo) === String(role) || String(item.codigo_cargo) === "multicargo")
    .map(item => item.id));
  return Object.entries(state.catalog?.question_index || {})
    .filter(([, raw]) => materialIds.has(materialIdFromIndex(raw)))
    .map(([id]) => id);
}

function balancedRoleSample(role, count = 30) {
  const available = new Set(availableIdsForRole(role));
  const groups = (state.studyIndex?.disciplines || [])
    .map(item => ({name: item.name, ids: shuffle((item.question_ids || []).filter(id => available.has(id))) }))
    .filter(item => item.ids.length);
  const selected = [];
  const used = new Set();
  while (selected.length < count && groups.some(group => group.ids.length)) {
    for (const group of groups) {
      let id = group.ids.shift();
      while (id && used.has(id)) id = group.ids.shift();
      if (id) { selected.push(id); used.add(id); }
      if (selected.length >= count) break;
    }
  }
  return selected;
}

function injectRoleTemplatesInStudy() {
  if (currentRoute() !== "estudar" || document.querySelector("[data-role-templates]")) return;
  const target = document.querySelector("[data-ux-study-launcher]");
  if (!target) return;
  const roles = profileRoles();
  if (!roles.length) return;
  const section = document.createElement("section");
  section.className = "role-templates section";
  section.dataset.roleTemplates = "";
  section.innerHTML = `<div class="section-head"><div><p class="eyebrow">Simulado por cargo</p><h2>Treino equilibrado por perfil</h2><p>Organiza 30 questões entre as matérias disponíveis do cargo. Não substitui a distribuição oficial do edital.</p></div></div><div class="role-template-grid">${roles.map(role => {
    const total = availableIdsForRole(role).length;
    return `<article class="card role-template"><span class="type-badge">Cargo ${esc(role)}</span><h3>${esc(role)}</h3><p>${total.toLocaleString("pt-BR")} questões correlatas disponíveis.</p><button class="btn primary full" data-ux15-role-sim="${esc(role)}" ${total ? "" : "disabled"}>Iniciar 30 questões</button></article>`;
  }).join("")}</div>`;
  target.insertAdjacentElement("afterend", section);
  section.querySelectorAll("[data-ux15-role-sim]").forEach(button => button.addEventListener("click", () => {
    const role = button.dataset.ux15RoleSim;
    const ids = balancedRoleSample(role, 30);
    if (!ids.length) return;
    createCompatibleSession({
      id: `cargo-${role}`,
      name: `Simulado por cargo ${role}`,
      questionIds: ids,
      mode: "prova",
      minutes: 60,
      discipline: "Múltiplas matérias",
      source: "Simulado por cargo",
      cargo: role,
    });
  }));
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

function bindNavigationShortcuts() {
  document.addEventListener("click", event => {
    if (event.target.closest("[data-ux15-settings], [data-ux-tech-status]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      location.hash = "#/perfil/configuracoes";
      return;
    }
    if (event.target.closest("[data-ux15-search]")) focusSearchWhenReady();
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
  primeRouteClass();
  enhanceSyncStatus();
  enhanceBreadcrumb();
  injectRoleTemplatesInStudy();
  pruneLegacyHome();
}

bindNavigationShortcuts();
ensureData().then(() => observeApp(enhance)).catch(error => console.error("Falha ao iniciar polimento de navegação v2.15:", error));
