import {
  ACTIVE_PROFILE_KEY,
  DAY,
  PROFILES_KEY,
  activeHistory,
  activeSession,
  allQuestionIds,
  createCompatibleSession,
  currentRoute,
  ensureData,
  esc,
  observeApp,
  profileKey,
  profileName,
  readJSON,
  state,
  toast,
} from "./shared-v2-13.js?v=1";

const GOAL_KEY = () => profileKey("dailyGoal.v1");
const ADAPTIVE_KEY = () => profileKey("adaptiveReview.v1");
const ERRORS_KEY = () => profileKey("errors.v3");
const QUESTION_SCALE_KEY = () => profileKey("questionScale.v1");
const THEME_KEY = "sedes.questoes.theme";
const BRASILIA = "America/Sao_Paulo";
const PLAN_SIZE = 25;
let clockTimer = null;

const answeredIdsForAttempt = attempt => {
  if (Array.isArray(attempt?.answeredQuestionIds)) return attempt.answeredQuestionIds;
  if (attempt?.answers && typeof attempt.answers === "object") return Object.entries(attempt.answers).filter(([, answer]) => Boolean(answer)).map(([id]) => id);
  return Array.isArray(attempt?.questionIds) ? attempt.questionIds : [];
};
const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const dateKey = value => new Intl.DateTimeFormat("en-CA", {timeZone: BRASILIA}).format(new Date(value));
const stableScore = (id, salt = dateKey(Date.now())) => {
  let hash = 2166136261;
  for (const char of `${salt}:${id}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
};
const stableTake = (ids, count, salt) => [...ids].sort((a, b) => stableScore(a, salt) - stableScore(b, salt)).slice(0, count);
const uniquePush = (target, values, limit = Infinity) => {
  const seen = new Set(target);
  for (const value of values) {
    if (target.length >= limit) break;
    if (value && !seen.has(value)) { target.push(value); seen.add(value); }
  }
};
const activeAnswered = () => new Set(activeHistory().flatMap(answeredIdsForAttempt));
const openErrors = () => Object.values(readJSON(ERRORS_KEY(), {})).filter(item => item?.open);
const adaptiveItems = () => Object.values(readJSON(ADAPTIVE_KEY(), {}));

function brasiliaNowParts(value = Date.now()) {
  const date = new Date(value);
  const dateText = new Intl.DateTimeFormat("pt-BR", {timeZone: BRASILIA, weekday: "long", day: "2-digit", month: "long", year: "numeric"}).format(date);
  const timeText = new Intl.DateTimeFormat("pt-BR", {timeZone: BRASILIA, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false}).format(date);
  return {dateText: dateText.charAt(0).toUpperCase() + dateText.slice(1), timeText};
}

function formatBrasiliaTimestamp(value, withSeconds = true) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "Não disponível";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRASILIA,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", ...(withSeconds ? {second: "2-digit"} : {}), hour12: false,
  }).format(new Date(value));
}

function syncTimestamp() {
  return state.release?.exported_at || state.catalog?.exported_at || null;
}

function dailyStats() {
  const today = dateKey(Date.now());
  const attempts = activeHistory();
  const todayAttempts = attempts.filter(item => dateKey(item.finishedAt || 0) === today);
  const results = todayAttempts.flatMap(item => item.questionResults || []).filter(item => item.answer);
  const answered = results.length;
  const correct = results.filter(item => item.correct).length;
  const accuracy = answered ? Math.round(correct / answered * 1000) / 10 : 0;
  return {answered, correct, accuracy};
}

function disciplineStats() {
  const map = new Map();
  for (const attempt of activeHistory()) {
    for (const result of attempt.questionResults || []) {
      if (!result.answer) continue;
      const name = result.discipline || "Sem classificação";
      const item = map.get(name) || {name, total: 0, correct: 0};
      item.total += 1;
      item.correct += result.correct ? 1 : 0;
      map.set(name, item);
    }
  }
  return [...map.values()].map(item => ({...item, accuracy: item.total ? Math.round(item.correct / item.total * 1000) / 10 : 0}))
    .filter(item => item.total >= 5)
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);
}

function buildDailyPlan() {
  const now = Date.now();
  const answered = activeAnswered();
  const due = adaptiveItems().filter(item => Number(item.dueAt || 0) <= now || Number(item.mastery || 0) < 45)
    .sort((a, b) => Number(b.lapses || 0) - Number(a.lapses || 0) || Number(a.mastery || 0) - Number(b.mastery || 0));
  const recurring = openErrors().filter(item => Number(item.count || 0) > 1).sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
  const weak = disciplineStats()[0] || null;
  const weakIds = weak ? (state.studyIndex?.disciplines || []).find(item => item.name === weak.name)?.question_ids || [] : [];
  const fresh = allQuestionIds().filter(id => !answered.has(id));
  const ids = [];
  const categories = {due: 0, recurring: 0, weak: 0, fresh: 0};
  const add = (values, wanted, key, salt) => {
    const before = ids.length;
    uniquePush(ids, stableTake(values, wanted, salt), PLAN_SIZE);
    categories[key] += ids.length - before;
  };
  add(due.map(item => item.id), 8, "due", "home-due");
  add(recurring.map(item => item.id), 5, "recurring", "home-recurring");
  add(weakIds.filter(id => !answered.has(id)), 5, "weak", `home-weak:${weak?.name || "none"}`);
  add(fresh, PLAN_SIZE, "fresh", "home-fresh");
  if (ids.length < PLAN_SIZE) add(allQuestionIds(), PLAN_SIZE, "fresh", "home-fallback");
  return {ids: ids.slice(0, PLAN_SIZE), categories, weak, due: due.length, recurring: recurring.length};
}

function startDailyPlan() {
  const plan = buildDailyPlan();
  if (!plan.ids.length) return toast("Ainda não há questões disponíveis para o estudo de hoje.", "info");
  createCompatibleSession({
    id: `estudo-do-dia-${dateKey(Date.now())}`,
    name: "Estudo de hoje",
    questionIds: plan.ids,
    mode: "treino",
    minutes: plan.ids.length * 2,
    discipline: "Plano adaptativo",
    source: "Histórico, revisão e Banco Mestre",
  });
}

function startReview() {
  const now = Date.now();
  const ids = [];
  uniquePush(ids, openErrors().filter(item => Number(item.count || 0) > 1).map(item => item.id), 20);
  uniquePush(ids, adaptiveItems().filter(item => Number(item.dueAt || 0) <= now || Number(item.mastery || 0) < 45).map(item => item.id), 20);
  if (!ids.length) return toast("Não há revisões prioritárias agora.", "info");
  createCompatibleSession({id: "revisao-prioritaria-home", name: "Revisão prioritária", questionIds: ids, mode: "treino", minutes: ids.length * 2, discipline: "Revisão", source: "Caderno de erros + revisão adaptativa"});
}

function setNodeText(node, value) {
  if (!node || node.textContent === value) return;
  if (node.childNodes.length === 1 && node.firstChild?.nodeType === Node.TEXT_NODE) node.firstChild.nodeValue = value;
  else node.textContent = value;
}

function updateClockNodes() {
  const {dateText, timeText} = brasiliaNowParts();
  document.querySelectorAll("[data-ux15-current-date]").forEach(node => setNodeText(node, dateText));
  document.querySelectorAll("[data-ux15-current-time]").forEach(node => setNodeText(node, timeText));
  const sync = formatBrasiliaTimestamp(syncTimestamp());
  document.querySelectorAll("[data-ux15-sync-time]").forEach(node => setNodeText(node, sync));
  const shell = document.querySelector("#sync-label");
  if (shell) {
    setNodeText(shell, `${timeText.slice(0, 5)} · Brasília`);
    shell.title = `Última sincronização do catálogo: ${sync}`;
  }
}

function ensureClock() {
  updateClockNodes();
  if (clockTimer) return;
  clockTimer = window.setInterval(updateClockNodes, 1000);
}

function ensureShellActions() {
  const actions = document.querySelector(".top-actions");
  if (!actions) return;
  if (!actions.querySelector("[data-ux15-search]")) {
    const search = document.createElement("button");
    search.type = "button";
    search.className = "icon-btn ux15-shell-btn";
    search.dataset.ux15Search = "";
    search.setAttribute("aria-label", "Buscar questões");
    search.textContent = "⌕";
    search.addEventListener("click", () => {
      location.hash = "#/estudar";
      window.setTimeout(() => document.querySelector("[data-ux-question-search]")?.focus(), 250);
    });
    actions.insertBefore(search, document.querySelector("#profile-button"));
  }
  if (!actions.querySelector("[data-ux15-settings]")) {
    const settings = document.createElement("button");
    settings.type = "button";
    settings.className = "icon-btn ux15-shell-btn";
    settings.dataset.ux15Settings = "";
    settings.setAttribute("aria-label", "Configurações");
    settings.textContent = "⚙";
    settings.addEventListener("click", () => { location.hash = "#/perfil/configuracoes"; });
    actions.insertBefore(settings, document.querySelector("#theme-toggle"));
  }
  const footerTech = document.querySelector("[data-ux-tech-status]");
  if (footerTech) {
    footerTech.textContent = "Configurações";
    footerTech.onclick = event => { event.preventDefault(); event.stopImmediatePropagation(); location.hash = "#/perfil/configuracoes"; };
  }
}

function renderCleanHome() {
  if (currentRoute() !== "inicio") {
    document.querySelector("#app")?.classList.remove("ux15-home-active");
    document.documentElement.classList.remove("ux15-clean-home");
    return;
  }
  const app = document.querySelector("#app");
  if (!app) return;
  document.documentElement.classList.add("ux15-clean-home");
  app.classList.add("ux15-home-active");
  let home = app.querySelector("[data-ux15-home]");
  if (!home) {
    const stats = dailyStats();
    const goal = Number(localStorage.getItem(GOAL_KEY()) || 40);
    const progress = Math.min(100, Math.round(stats.answered / goal * 100));
    const plan = buildDailyPlan();
    const session = activeSession();
    const sync = formatBrasiliaTimestamp(syncTimestamp());
    home = document.createElement("section");
    home.className = "ux15-home";
    home.dataset.ux15Home = "";
    home.innerHTML = `<header class="ux15-home-head"><div><p class="eyebrow">${esc(profileName())}</p><h1>${session ? "Continue de onde parou." : "Seu estudo, sem ruído."}</h1><div class="ux15-datetime"><strong data-ux15-current-date></strong><span><b data-ux15-current-time></b> · horário de Brasília</span><small>Última sincronização do catálogo: <b data-ux15-sync-time>${esc(sync)}</b></small></div></div>${session ? `<button class="btn primary ux15-main-action" data-ux15-resume>Continuar tentativa</button>` : `<button class="btn primary ux15-main-action" data-ux-start-today data-ux15-start>Começar estudo de hoje</button>`}</header>
      <div class="ux15-home-grid">
        <article class="card ux15-primary-card" data-ux-today><div><p class="eyebrow">Estudo de hoje</p><h2>${plan.ids.length} questões · cerca de ${plan.ids.length * 2} min</h2><p>Um único plano combinando conteúdo novo, revisão e seus pontos de atenção.</p></div><div class="ux15-plan"><span><b>${plan.categories.fresh}</b> novas</span>${plan.categories.due ? `<span><b>${plan.categories.due}</b> vencidas</span>` : ""}${plan.categories.recurring ? `<span><b>${plan.categories.recurring}</b> reincidentes</span>` : ""}${plan.categories.weak ? `<span><b>${plan.categories.weak}</b> ponto fraco</span>` : ""}</div>${session ? `<button class="btn" data-ux15-resume>Retomar antes do novo estudo</button>` : `<button class="btn primary" data-ux-start-today data-ux15-start>Começar</button>`}</article>
        <article class="card ux15-small-card"><div class="ux15-card-title"><span>Hoje</span><strong>${stats.answered}/${goal}</strong></div><div class="ux15-progress"><span style="width:${progress}%"></span></div><div class="ux15-kpis"><span><b>${stats.accuracy}%</b><small>acerto</small></span><span><b>${Math.max(0, goal - stats.answered)}</b><small>faltam</small></span></div><button class="ux-link" data-ux15-goal>Ajustar meta</button></article>
        ${plan.weak ? `<article class="card ux15-small-card"><p class="eyebrow">Prioridade</p><h3>${esc(plan.weak.name)}</h3><strong class="ux15-big-number">${plan.weak.accuracy}%</strong><small>precisão acumulada em ${plan.weak.total} respostas</small><button class="btn" data-ux15-weak="${esc(plan.weak.name)}">Treinar matéria</button></article>` : ""}
        ${(plan.due || plan.recurring) ? `<article class="card ux15-small-card"><p class="eyebrow">Revisão</p><h3>${plan.due + plan.recurring} prioridades</h3><div class="ux15-review-lines">${plan.due ? `<span><b>${plan.due}</b> vencidas ou frágeis</span>` : ""}${plan.recurring ? `<span><b>${plan.recurring}</b> reincidentes</span>` : ""}</div><button class="btn" data-ux15-review>Revisar agora</button></article>` : ""}
      </div>`;
    app.prepend(home);
    home.querySelectorAll("[data-ux15-start]").forEach(button => button.addEventListener("click", startDailyPlan));
    home.querySelectorAll("[data-ux15-resume]").forEach(button => button.addEventListener("click", () => { location.hash = "#/resolver"; }));
    home.querySelector("[data-ux15-review]")?.addEventListener("click", startReview);
    home.querySelector("[data-ux15-goal]")?.addEventListener("click", () => {
      const current = Number(localStorage.getItem(GOAL_KEY()) || 40);
      const value = Number(prompt("Meta diária de questões", String(current)));
      if (!Number.isInteger(value) || value < 5 || value > 300) return value ? toast("Use uma meta entre 5 e 300 questões.", "error") : null;
      localStorage.setItem(GOAL_KEY(), String(value));
      home.remove();
      renderCleanHome();
    });
    home.querySelector("[data-ux15-weak]")?.addEventListener("click", event => {
      const name = event.currentTarget.dataset.ux15Weak;
      const discipline = (state.studyIndex?.disciplines || []).find(item => item.name === name);
      const ids = stableTake(discipline?.question_ids || [], 15, `ux15-weak:${name}`);
      if (!ids.length) return toast("Não há questões disponíveis para esta matéria.", "info");
      createCompatibleSession({id: `prioridade-${normalize(name).replace(/[^a-z0-9]+/g, "-")}`, name: `Prioridade — ${name}`, questionIds: ids, mode: "treino", minutes: ids.length * 2, discipline: name, source: "Prioridade da Home"});
    });
  }
  updateClockNodes();
}

function platformFacts() {
  const release = state.release || {};
  const catalog = state.catalog || {};
  return {
    appVersion: release.app_version || "—",
    dataVersion: release.data_release_version || catalog.release_version || "—",
    cache: release.cache_version || "—",
    commit: String(release.source_sha || "—"),
    questions: Number(release.questions ?? catalog.summary?.questoes ?? 0),
    materials: Number(release.materials ?? catalog.summary?.materiais ?? 0),
    proofs: Number(release.proofs ?? catalog.summary?.provas ?? 0),
    simulations: Number(release.simulations ?? catalog.summary?.simulados ?? 0),
    master: Number(release.banco_mestre ?? catalog.summary?.banco_mestre ?? 0),
    pending: Number(release.awaiting_audit ?? catalog.summary?.aguardando_auditoria ?? 0),
  };
}

function settingsTabContent(tab) {
  const facts = platformFacts();
  if (tab === "plataforma") return `<section class="ux15-settings-panel"><div class="ux15-settings-intro"><p class="eyebrow">Plataforma</p><h2>Dados do projeto</h2><p>Informações técnicas ficam aqui, fora da Home.</p></div><div class="ux15-sync-card card"><div><span>Agora em Brasília</span><strong data-ux15-current-date></strong><b data-ux15-current-time></b></div><div><span>Última sincronização do catálogo</span><strong data-ux15-sync-time>${esc(formatBrasiliaTimestamp(syncTimestamp()))}</strong><small>Fonte: timestamp <code>exported_at</code> da release publicada.</small></div></div><div class="ux15-facts-grid"><span><small>Questões publicadas</small><strong>${facts.questions.toLocaleString("pt-BR")}</strong></span><span><small>Materiais</small><strong>${facts.materials}</strong></span><span><small>Provas</small><strong>${facts.proofs}</strong></span><span><small>Simulados</small><strong>${facts.simulations}</strong></span><span><small>Banco Mestre</small><strong>${facts.master.toLocaleString("pt-BR")}</strong></span><span><small>Aguardando auditoria</small><strong>${facts.pending}</strong></span><span><small>Versão da aplicação</small><strong>${esc(facts.appVersion)}</strong></span><span><small>Versão dos dados</small><strong>${esc(facts.dataVersion)}</strong></span></div><details class="card ux15-technical-details"><summary>Detalhes técnicos</summary><div><span><small>Commit</small><strong>${esc(facts.commit)}</strong></span><span><small>Cache</small><strong>${esc(facts.cache)}</strong></span><span><small>Timezone</small><strong>America/Sao_Paulo</strong></span></div></details></section>`;
  if (tab === "estudo") {
    const goal = Number(localStorage.getItem(GOAL_KEY()) || 40);
    const scale = Number(localStorage.getItem(QUESTION_SCALE_KEY()) || 1);
    return `<section class="ux15-settings-panel"><div class="ux15-settings-intro"><p class="eyebrow">Estudo</p><h2>Preferências</h2><p>Ajustes pessoais que mudam como você usa a plataforma.</p></div><div class="ux15-setting-list"><article class="card"><div><strong>Meta diária</strong><small>Quantidade de questões que você pretende resolver por dia.</small></div><label><input type="number" min="5" max="300" value="${goal}" data-ux15-goal-input><span>questões</span></label></article><article class="card"><div><strong>Tamanho do texto das questões</strong><small>Aplicado à tela de resolução.</small></div><select data-ux15-scale><option value="0.9" ${scale === .9 ? "selected" : ""}>Compacto</option><option value="1" ${scale === 1 ? "selected" : ""}>Normal</option><option value="1.15" ${scale === 1.15 ? "selected" : ""}>Grande</option><option value="1.3" ${scale === 1.3 ? "selected" : ""}>Muito grande</option></select></article></div><button class="btn primary" data-ux15-save-study>Salvar preferências</button></section>`;
  }
  if (tab === "dados") return `<section class="ux15-settings-panel"><div class="ux15-settings-intro"><p class="eyebrow">Dados</p><h2>Progresso e segurança</h2><p>Histórico, erros, marcadas e sessões permanecem armazenados localmente neste navegador.</p></div><div class="ux15-data-actions"><article class="card"><strong>Backup do progresso</strong><p>Use a área de Desempenho para exportar ou restaurar seu backup protegido.</p><button class="btn" data-ux15-performance>Ir para Desempenho</button></article><article class="card"><strong>Armazenamento local</strong><p>${activeHistory().length} tentativa(s) concluída(s) neste perfil · ${openErrors().length} erro(s) atualmente pendente(s).</p></article></div></section>`;
  const profiles = readJSON(PROFILES_KEY, []);
  const activeId = localStorage.getItem(ACTIVE_PROFILE_KEY) || profiles[0]?.id || "rodrigo";
  const theme = localStorage.getItem(THEME_KEY) || "dark";
  return `<section class="ux15-settings-panel"><div class="ux15-settings-intro"><p class="eyebrow">Geral</p><h2>Perfil e aparência</h2><p>Configurações do usuário ficam separadas dos dados técnicos da plataforma.</p></div><div class="ux15-profile-grid">${profiles.map(profile => `<button class="card ux15-profile-option ${profile.id === activeId ? "active" : ""}" data-ux15-profile="${esc(profile.id)}"><span>${esc(profile.name.slice(0, 1).toUpperCase())}</span><div><strong>${esc(profile.name)}</strong><small>${(profile.roles || []).map(role => `Cargo ${esc(role)}`).join(" · ")}</small></div>${profile.id === activeId ? "<b>Em uso</b>" : ""}</button>`).join("")}</div><div class="ux15-theme card"><div><strong>Aparência</strong><small>Escolha o tema da interface.</small></div><div><button class="btn ${theme === "dark" ? "primary" : ""}" data-ux15-theme="dark">Escuro</button><button class="btn ${theme === "light" ? "primary" : ""}" data-ux15-theme="light">Claro</button></div></div></section>`;
}

function renderSettings(tab = "geral") {
  if (currentRoute() !== "perfil") return;
  const app = document.querySelector("#app");
  if (!app || app.querySelector("[data-ux15-settings-page]")?.dataset.ux15Tab === tab) return;
  app.classList.remove("ux15-home-active");
  document.documentElement.classList.remove("ux15-clean-home");
  app.innerHTML = `<section class="ux15-settings-page" data-ux15-settings-page data-ux15-tab="${esc(tab)}"><header class="ux15-settings-head"><div><p class="eyebrow">Configurações</p><h1>Organize a plataforma sem poluir seu estudo.</h1><p>Preferências pessoais, segurança e dados técnicos têm seu próprio lugar.</p></div><button class="btn" data-ux15-back-home>← Início</button></header><nav class="ux15-settings-tabs" aria-label="Seções das configurações">${[["geral","Geral"],["estudo","Estudo"],["plataforma","Plataforma"],["dados","Dados"]].map(([value,label]) => `<button class="${tab === value ? "active" : ""}" data-ux15-settings-tab="${value}">${label}</button>`).join("")}</nav>${settingsTabContent(tab)}</section>`;
  app.querySelector("[data-ux15-back-home]")?.addEventListener("click", () => { location.hash = "#/inicio"; });
  app.querySelectorAll("[data-ux15-settings-tab]").forEach(button => button.addEventListener("click", () => renderSettings(button.dataset.ux15SettingsTab)));
  app.querySelectorAll("[data-ux15-profile]").forEach(button => button.addEventListener("click", () => {
    localStorage.setItem(ACTIVE_PROFILE_KEY, button.dataset.ux15Profile);
    location.reload();
  }));
  app.querySelectorAll("[data-ux15-theme]").forEach(button => button.addEventListener("click", () => {
    const theme = button.dataset.ux15Theme;
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
    renderSettings("geral");
  }));
  app.querySelector("[data-ux15-save-study]")?.addEventListener("click", () => {
    const goal = Number(app.querySelector("[data-ux15-goal-input]")?.value || 40);
    const scale = Number(app.querySelector("[data-ux15-scale]")?.value || 1);
    if (!Number.isInteger(goal) || goal < 5 || goal > 300) return toast("Use uma meta entre 5 e 300 questões.", "error");
    localStorage.setItem(GOAL_KEY(), String(goal));
    localStorage.setItem(QUESTION_SCALE_KEY(), String(scale));
    toast("Preferências salvas.", "success");
  });
  app.querySelector("[data-ux15-performance]")?.addEventListener("click", () => { location.hash = "#/desempenho"; });
  updateClockNodes();
}

function enhance() {
  ensureClock();
  ensureShellActions();
  const route = currentRoute();
  if (route === "inicio") renderCleanHome();
  else if (route === "perfil") renderSettings(document.querySelector("[data-ux15-settings-page]")?.dataset.ux15Tab || "geral");
  else {
    document.querySelector("#app")?.classList.remove("ux15-home-active");
    document.documentElement.classList.remove("ux15-clean-home");
  }
}

ensureData().then(() => observeApp(enhance)).catch(error => console.error("Falha ao iniciar navegação v2.15:", error));