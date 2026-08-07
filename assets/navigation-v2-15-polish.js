import {
  createCompatibleSession,
  currentRoute,
  ensureData,
  esc,
  materialIdFromIndex,
  observeApp,
  profileKey,
  profileRoles,
  readJSON,
  shuffle,
  state,
} from "./shared-v2-13.js?v=1";

const BRASILIA = "America/Sao_Paulo";
let focusToken = 0;
let pendingSettingsTabFocus = null;
let settingsHeadingFocusKey = null;

function primeRouteClass() {
  const route = currentRoute();
  if (route === "perfil" && /^#\/?perfil\/?$/i.test(location.hash)) history.replaceState(null, "", "#/perfil/configuracoes");
  document.documentElement.classList.toggle("ux15-clean-home", route === "inicio");
  document.documentElement.classList.toggle("ux15-settings-route", route === "perfil");
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
    const className = `ux15-sync-age ${relative.state}`;
    if (node.className !== className) node.className = className;
    if (node.textContent !== relative.label) node.textContent = relative.label;
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

function reconcileHomeReviewTotal() {
  if (currentRoute() !== "inicio") return;
  const card = document.querySelector("[data-ux15-review]")?.closest("article");
  if (!card) return;
  const now = Date.now();
  const recurrent = Object.values(readJSON(profileKey("errors.v3"), {}))
    .filter(item => item?.open && Number(item.count || 0) > 1)
    .map(item => item.id);
  const due = Object.values(readJSON(profileKey("adaptiveReview.v1"), {}))
    .filter(item => Number(item.dueAt || 0) <= now || Number(item.mastery || 0) < 45)
    .map(item => item.id);
  const total = new Set([...recurrent, ...due].filter(Boolean)).size;
  const heading = card.querySelector("h3");
  const label = `${total} prioridade${total === 1 ? "" : "s"}`;
  if (heading && heading.textContent !== label) heading.textContent = label;
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
  const details = document.createElement("details");
  details.className = "role-templates section card ux15-role-templates";
  details.dataset.roleTemplates = "";
  details.innerHTML = `<summary><span><small>Simulados por cargo</small><strong>Treino equilibrado por perfil</strong></span><b>${roles.length} cargo${roles.length === 1 ? "" : "s"}</b></summary><div class="ux15-role-content"><p>Organiza 30 questões entre as matérias disponíveis do cargo. Não substitui a distribuição oficial do edital.</p><div class="role-template-grid">${roles.map(role => {
    const total = availableIdsForRole(role).length;
    const count = Math.min(30, total);
    return `<article class="card role-template"><span class="type-badge">Cargo ${esc(role)}</span><h3>${esc(role)}</h3><p>${total.toLocaleString("pt-BR")} questões correlatas disponíveis.</p><button class="btn primary full" data-ux15-role-sim="${esc(role)}" data-ux15-role-count="${count}" ${total ? "" : "disabled"}>Iniciar ${count} questões</button></article>`;
  }).join("")}</div></div>`;
  target.insertAdjacentElement("afterend", details);
  details.querySelectorAll("[data-ux15-role-sim]").forEach(button => button.addEventListener("click", () => {
    const role = button.dataset.ux15RoleSim;
    const count = Math.max(1, Number(button.dataset.ux15RoleCount || 30));
    const ids = balancedRoleSample(role, count);
    if (!ids.length) return;
    createCompatibleSession({
      id: `cargo-${role}`,
      name: `Simulado por cargo ${role}`,
      questionIds: ids,
      mode: "prova",
      minutes: ids.length * 2,
      discipline: "Múltiplas matérias",
      source: "Simulado por cargo",
      cargo: role,
    });
  }));
}

function enhanceSettingsAccessibility() {
  const page = document.querySelector("[data-ux15-settings-page]");
  if (!page) {
    settingsHeadingFocusKey = null;
    return;
  }
  const tabs = page.querySelector(".ux15-settings-tabs");
  if (tabs) tabs.setAttribute("role", "tablist");
  page.querySelectorAll("[data-ux15-settings-tab]").forEach(button => {
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(button.classList.contains("active")));
  });
  document.querySelector("#theme-toggle")?.setAttribute("aria-pressed", String(document.documentElement.dataset.theme === "dark"));
  if (pendingSettingsTabFocus) {
    const wanted = pendingSettingsTabFocus;
    pendingSettingsTabFocus = null;
    requestAnimationFrame(() => page.querySelector(`[data-ux15-settings-tab="${CSS.escape(wanted)}"]`)?.focus({preventScroll: true}));
    return;
  }
  const focusKey = location.hash || "#/perfil/configuracoes";
  if (settingsHeadingFocusKey === focusKey) return;
  const heading = page.querySelector("h1");
  if (!heading) return;
  settingsHeadingFocusKey = focusKey;
  heading.tabIndex = -1;
  requestAnimationFrame(() => heading.focus({preventScroll: true}));
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
    const settingsTab = event.target.closest("[data-ux15-settings-tab]");
    if (settingsTab) pendingSettingsTabFocus = settingsTab.dataset.ux15SettingsTab;
    if (event.target.closest("[data-ux15-settings], [data-ux-tech-status], #profile-button")) {
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
  enhanceSettingsAccessibility();
  reconcileHomeReviewTotal();
  pruneLegacyHome();
}

bindNavigationShortcuts();
ensureData().then(() => observeApp(enhance)).catch(error => console.error("Falha ao iniciar polimento de navegação v2.15:", error));
