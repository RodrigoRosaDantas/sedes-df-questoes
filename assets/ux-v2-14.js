import {
  DAY,
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
  questionIndexEntries,
  readJSON,
  saveJSON,
  state,
  toast,
} from "./shared-v2-13.js?v=1";

const SEARCH_INDEX_URL = "./data/release/question-search-index.json";
const GOAL_KEY = () => profileKey("dailyGoal.v1");
const ERROR_REASONS_KEY = () => profileKey("errorReasons.v1");
const SAVED_FILTERS_KEY = () => profileKey("savedFilters.v1");
const ADAPTIVE_KEY = () => profileKey("adaptiveReview.v1");
const ERRORS_KEY = () => profileKey("errors.v3");
const MARKED_KEY = () => profileKey("marked.v3");
const QUESTION_SCALE_KEY = () => profileKey("questionScale.v1");
const PLAN_SIZE = 25;
let searchIndexPromise = null;
let lastRoute = null;

const answeredIdsForAttempt = attempt => {
  if (Array.isArray(attempt?.answeredQuestionIds)) return attempt.answeredQuestionIds;
  if (attempt?.answers && typeof attempt.answers === "object") return Object.entries(attempt.answers).filter(([, answer]) => Boolean(answer)).map(([id]) => id);
  return Array.isArray(attempt?.questionIds) ? attempt.questionIds : [];
};
const dateKey = value => new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo"}).format(new Date(value));
const todayKey = () => dateKey(Date.now());
const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const stableScore = (id, salt = todayKey()) => {
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
const errors = () => Object.values(readJSON(ERRORS_KEY(), {})).filter(item => item?.open);
const marked = () => readJSON(MARKED_KEY(), {});
const adaptive = () => Object.values(readJSON(ADAPTIVE_KEY(), {}));
const activeAnswered = () => new Set(activeHistory().flatMap(answeredIdsForAttempt));
const attemptsSince = milliseconds => activeHistory().filter(item => Date.now() - new Date(item.finishedAt || 0).getTime() <= milliseconds);
const answerStats = attempts => {
  const results = attempts.flatMap(item => item.questionResults || []).filter(item => item.answer);
  const correct = results.filter(item => item.correct).length;
  return {answered: results.length, correct, accuracy: results.length ? Math.round(correct / results.length * 1000) / 10 : 0};
};

function dailyStats() {
  const today = todayKey();
  const todayAttempts = activeHistory().filter(item => dateKey(item.finishedAt || 0) === today);
  const recent = answerStats(attemptsSince(7 * DAY));
  const todayResult = answerStats(todayAttempts);
  const activeDates = new Set(activeHistory().map(item => dateKey(item.finishedAt || 0)));
  let cursor = new Date();
  let streak = 0;
  if (!activeDates.has(dateKey(cursor))) cursor = new Date(Date.now() - DAY);
  while (activeDates.has(dateKey(cursor))) { streak += 1; cursor = new Date(cursor.getTime() - DAY); }
  return {today: todayResult, recent, streak};
}

function disciplineStats() {
  const map = new Map();
  for (const attempt of activeHistory()) {
    for (const result of attempt.questionResults || []) {
      if (!result.answer) continue;
      const name = result.discipline || "Sem classificação";
      const item = map.get(name) || {name, total: 0, correct: 0, ids: new Set()};
      item.total += 1;
      item.correct += result.correct ? 1 : 0;
      if (result.id) item.ids.add(result.id);
      map.set(name, item);
    }
  }
  const totals = new Map((state.studyIndex?.disciplines || []).map(item => [item.name, Number(item.question_count || 0)]));
  return [...map.values()].map(item => {
    const accuracy = item.total ? Math.round(item.correct / item.total * 1000) / 10 : 0;
    const available = totals.get(item.name) || item.ids.size;
    const coverage = available ? Math.min(100, Math.round(item.ids.size / available * 1000) / 10) : 0;
    const mastery = Math.round((accuracy * .72 + coverage * .28) * 10) / 10;
    return {...item, accuracy, coverage, mastery, available};
  }).sort((a, b) => a.mastery - b.mastery || b.total - a.total);
}

function weakDiscipline() {
  return disciplineStats().filter(item => item.total >= 5)[0] || null;
}

function buildDailyPlan() {
  const now = Date.now();
  const answered = activeAnswered();
  const due = adaptive().filter(item => Number(item.dueAt || 0) <= now || Number(item.mastery || 0) < 45)
    .sort((a, b) => Number(b.lapses || 0) - Number(a.lapses || 0) || Number(a.mastery || 0) - Number(b.mastery || 0));
  const recurring = errors().sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
  const weak = weakDiscipline();
  const weakIds = weak ? (state.studyIndex?.disciplines || []).find(item => item.name === weak.name)?.question_ids || [] : [];
  const fresh = allQuestionIds().filter(id => !answered.has(id));
  const ids = [];
  const categories = {due: 0, recurring: 0, weak: 0, new: 0};
  const addCategory = (values, wanted, key, salt) => {
    const before = ids.length;
    uniquePush(ids, stableTake(values, wanted, salt), PLAN_SIZE);
    categories[key] += ids.length - before;
  };
  addCategory(due.map(item => item.id), 8, "due", "due");
  addCategory(recurring.filter(item => Number(item.count || 0) > 1).map(item => item.id), 6, "recurring", "recurring");
  addCategory(weakIds.filter(id => !answered.has(id)), 5, "weak", `weak:${weak?.name || "none"}`);
  addCategory(fresh, PLAN_SIZE, "new", "fresh");
  if (ids.length < PLAN_SIZE) addCategory(allQuestionIds(), PLAN_SIZE, "new", "fallback");
  return {ids: ids.slice(0, PLAN_SIZE), categories, weak};
}

function startIds(ids, {id, name, discipline = "Múltiplas matérias", source = "Plataforma SEDES/DF", mode = "treino"}) {
  const clean = [...new Set(ids)].filter(Boolean);
  if (!clean.length) return toast("Não há questões disponíveis para esta seleção.", "info");
  createCompatibleSession({id, name, questionIds: clean, mode, minutes: clean.length * 2, discipline, source});
}

function startDailyPlan() {
  const plan = buildDailyPlan();
  startIds(plan.ids, {id: `estudo-do-dia-${todayKey()}`, name: "Estudo de hoje", discipline: "Plano adaptativo", source: "Histórico, revisão e Banco Mestre"});
}

function startQuick(count = 10) {
  const unanswered = allQuestionIds().filter(id => !activeAnswered().has(id));
  const ids = stableTake(unanswered.length ? unanswered : allQuestionIds(), count, `quick:${count}`);
  startIds(ids, {id: `treino-rapido-${count}`, name: `Treino rápido — ${count} questões`, discipline: "Múltiplas matérias", source: "Banco Mestre"});
}

function setDailyGoal() {
  const current = Number(localStorage.getItem(GOAL_KEY()) || 40);
  const value = Number(prompt("Meta diária de questões", String(current)));
  if (!Number.isInteger(value) || value < 5 || value > 300) return value ? toast("Use uma meta entre 5 e 300 questões.", "error") : null;
  localStorage.setItem(GOAL_KEY(), String(value));
  enhanceHome(true);
}

function technicalStatusDialog() {
  document.querySelector(".ux-tech-dialog")?.remove();
  const release = state.release || {};
  const backdrop = document.createElement("div");
  backdrop.className = "platform-dialog-backdrop ux-tech-dialog";
  backdrop.innerHTML = `<section class="platform-dialog card" role="dialog" aria-modal="true" aria-labelledby="ux-tech-title"><div><p class="eyebrow">Status técnico</p><h2 id="ux-tech-title">Publicação da plataforma</h2></div><div class="ux-tech-grid"><span><small>Versão</small><strong>${esc(release.app_version || "—")}</strong></span><span><small>Questões</small><strong>${Number(release.questions || 0).toLocaleString("pt-BR")}</strong></span><span><small>Materiais</small><strong>${Number(release.materials || 0)}</strong></span><span><small>Commit</small><strong>${esc(String(release.source_sha || "—").slice(0, 7))}</strong></span></div><button class="btn primary" data-close-tech>Fechar</button></section>`;
  document.body.append(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector("[data-close-tech]")?.addEventListener("click", close);
  backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });
}

function enhanceFooter() {
  const footer = document.querySelector(".footer");
  if (!footer || footer.querySelector("[data-ux-tech-status]")) return;
  const button = document.createElement("button");
  button.className = "ux-footer-link";
  button.dataset.uxTechStatus = "";
  button.textContent = "Status técnico";
  button.addEventListener("click", technicalStatusDialog);
  footer.append(button);
}

function enhanceHome(force = false) {
  if (currentRoute() !== "inicio") return;
  if (force) document.querySelector("[data-ux-today]")?.remove();
  if (document.querySelector("[data-ux-today]")) return;
  const anchor = document.querySelector(".dashboard-countdown") || document.querySelector(".home-hero");
  if (!anchor) return;
  const stats = dailyStats();
  const plan = buildDailyPlan();
  const goal = Number(localStorage.getItem(GOAL_KEY()) || 40);
  const progress = Math.min(100, Math.round(stats.today.answered / goal * 100));
  const section = document.createElement("section");
  section.className = "ux-today card";
  section.dataset.uxToday = "";
  section.innerHTML = `<div class="ux-today-copy"><p class="eyebrow">O que fazer agora</p><h2>Estudo de hoje</h2><p>${plan.ids.length} questões combinando conteúdo novo, revisão e pontos fracos.</p><div class="ux-plan-chips"><span><b>${plan.categories.new}</b> novas</span><span><b>${plan.categories.due}</b> vencidas</span><span><b>${plan.categories.recurring}</b> reincidentes</span><span><b>${plan.categories.weak}</b> ponto fraco</span></div>${plan.weak ? `<small>Prioridade atual: <strong>${esc(plan.weak.name)}</strong> · ${plan.weak.accuracy}% de precisão.</small>` : ""}</div><div class="ux-goal"><div class="ux-goal-head"><span>Meta de hoje</span><strong>${stats.today.answered}/${goal}</strong></div><div class="ux-goal-track" aria-label="${progress}% da meta"><span style="width:${progress}%"></span></div><div class="ux-goal-meta"><span>${stats.recent.accuracy}% nos últimos 7 dias</span><span>🔥 ${stats.streak} dia(s)</span></div><button class="ux-link" data-ux-goal>Ajustar meta</button></div><div class="ux-today-actions"><button class="btn primary" data-ux-start-today>Começar estudo de hoje</button><button class="btn" data-ux-quick>10 questões rápidas</button></div>`;
  anchor.insertAdjacentElement("afterend", section);
  section.querySelector("[data-ux-start-today]")?.addEventListener("click", startDailyPlan);
  section.querySelector("[data-ux-quick]")?.addEventListener("click", () => startQuick(10));
  section.querySelector("[data-ux-goal]")?.addEventListener("click", setDailyGoal);
  document.documentElement.classList.add("ux-student-home");
}

function filterOptions() {
  const materials = state.catalog?.materials || [];
  const disciplines = [...new Set((state.studyIndex?.disciplines || []).map(item => item.name))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const cargos = [...new Set(materials.map(item => String(item.codigo_cargo || "")).filter(Boolean))].sort();
  const years = [...new Set(materials.map(item => String(item.ano || "")).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const sources = [...new Set(materials.map(item => item.fonte).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return {disciplines, cargos, years, sources};
}

function selectOptions(values, label) {
  return `<option value="">${esc(label)}</option>${values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join("")}`;
}

function filterQuestionIds(criteria) {
  const materials = state.catalog?.materials || [];
  const matching = materials.filter(item => {
    const type = normalize(item.tipo_material);
    return (!criteria.type || type === criteria.type)
      && (!criteria.cargo || String(item.codigo_cargo) === criteria.cargo)
      && (!criteria.year || String(item.ano) === criteria.year)
      && (!criteria.source || item.fonte === criteria.source)
      && (!criteria.discipline || item.disciplina === criteria.discipline);
  });
  const materialIds = new Set(matching.map(item => item.id));
  let ids = questionIndexEntries().filter(item => materialIds.has(item.materialId) && (!criteria.discipline || item.discipline === criteria.discipline || !item.discipline)).map(item => item.id);
  if (criteria.discipline) {
    const discipline = (state.studyIndex?.disciplines || []).find(item => item.name === criteria.discipline);
    if (discipline) {
      const allowed = new Set(discipline.question_ids || []);
      ids = ids.filter(id => allowed.has(id));
    }
  }
  const answered = activeAnswered();
  const errorIds = new Set(errors().map(item => item.id));
  const markedIds = new Set(Object.keys(marked()));
  if (criteria.scope === "unanswered") ids = ids.filter(id => !answered.has(id));
  if (criteria.scope === "errors") ids = ids.filter(id => errorIds.has(id));
  if (criteria.scope === "marked") ids = ids.filter(id => markedIds.has(id));
  return stableTake(ids, criteria.count === "all" ? ids.length : Number(criteria.count || 20), `filter:${JSON.stringify(criteria)}`);
}

function readFilterForm(root) {
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

function applyFilterToForm(root, criteria) {
  for (const [key, value] of Object.entries(criteria || {})) {
    const control = root.querySelector(`[data-ux-filter-${key}]`);
    if (control) control.value = value;
  }
}

function saveCurrentFilter(root) {
  const criteria = readFilterForm(root);
  const name = prompt("Nome para este filtro salvo", criteria.discipline || "Meu filtro");
  if (!name?.trim()) return;
  const saved = readJSON(SAVED_FILTERS_KEY(), []);
  const next = [{id: crypto.randomUUID?.() || String(Date.now()), name: name.trim(), criteria}, ...saved].slice(0, 12);
  saveJSON(SAVED_FILTERS_KEY(), next);
  toast("Filtro salvo.", "success");
  enhanceStudy(true);
}

async function loadSearchIndex() {
  if (!searchIndexPromise) searchIndexPromise = fetch(SEARCH_INDEX_URL, {cache: "force-cache"}).then(response => {
    if (!response.ok) throw new Error(`Busca: HTTP ${response.status}`);
    return response.json();
  });
  return searchIndexPromise;
}

async function runQuestionSearch(root) {
  const input = root.querySelector("[data-ux-question-search]");
  const resultsRoot = root.querySelector("[data-ux-search-results]");
  const query = normalize(input?.value).trim();
  if (query.length < 3) return toast("Digite pelo menos 3 caracteres para buscar nas questões.", "info");
  if (resultsRoot) resultsRoot.innerHTML = `<div class="ux-search-loading">Buscando no banco…</div>`;
  try {
    const payload = await loadSearchIndex();
    const tokens = query.split(/\s+/).filter(Boolean);
    const matches = (payload.items || []).map(item => {
      const text = item.search || "";
      if (!tokens.every(token => text.includes(token))) return null;
      let score = text.includes(query) ? 20 : 0;
      score += tokens.reduce((sum, token) => sum + (text.split(token).length - 1), 0);
      return {...item, score};
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 50);
    if (!resultsRoot) return;
    resultsRoot.dataset.uxResultIds = JSON.stringify(matches.map(item => item.id));
    resultsRoot.innerHTML = matches.length ? `<div class="ux-search-head"><strong>${matches.length} resultado(s) exibido(s)</strong><button class="btn primary compact" data-ux-train-search>Treinar até 20</button></div><div class="ux-search-list">${matches.slice(0, 20).map(item => `<article><div><span>${esc(item.discipline || "Questão")}${item.subject ? ` · ${esc(item.subject)}` : ""}</span><strong>${esc(item.snippet || item.id)}</strong><small>${esc(item.source || "Banco Mestre")}${item.year ? ` · ${esc(item.year)}` : ""}</small></div></article>`).join("")}</div>` : `<div class="ux-search-empty">Nenhuma questão encontrada. Tente menos termos.</div>`;
    resultsRoot.querySelector("[data-ux-train-search]")?.addEventListener("click", () => startIds(matches.slice(0, 20).map(item => item.id), {id: "busca-inteligente", name: `Busca — ${input.value.trim()}`, discipline: "Resultados da busca", source: "Índice textual do Banco Mestre"}));
  } catch (error) {
    console.error(error);
    if (resultsRoot) resultsRoot.innerHTML = `<div class="ux-search-empty">A busca textual está temporariamente indisponível.</div>`;
  }
}

function enhanceStudy(force = false) {
  if (currentRoute() !== "estudar" || document.querySelector(".topic-builder")) return;
  if (force) document.querySelector("[data-ux-study-launcher]")?.remove();
  if (document.querySelector("[data-ux-study-launcher]")) return;
  const heading = document.querySelector(".page-heading");
  if (!heading) return;
  const {disciplines, cargos, years, sources} = filterOptions();
  const saved = readJSON(SAVED_FILTERS_KEY(), []);
  const section = document.createElement("section");
  section.className = "ux-study-launcher";
  section.dataset.uxStudyLauncher = "";
  section.innerHTML = `<div class="ux-start-grid"><button class="ux-start-card card" data-ux-start-today><span>⚡</span><div><strong>Estudo de hoje</strong><small>Plano adaptativo de ${PLAN_SIZE} questões</small></div></button><button class="ux-start-card card" data-ux-quick><span>▶</span><div><strong>Estudo rápido</strong><small>10 questões inéditas</small></div></button><button class="ux-start-card card" data-ux-critical><span>↻</span><div><strong>Revisão crítica</strong><small>Erros reincidentes e vencidos</small></div></button><button class="ux-start-card card" data-ux-toggle-advanced><span>⚙</span><div><strong>Estudo personalizado</strong><small>Filtros avançados e salvos</small></div></button></div><section class="ux-advanced card" hidden data-ux-advanced><div class="ux-advanced-head"><div><p class="eyebrow">Treino personalizado</p><h2>Monte o recorte que você quer estudar</h2></div>${saved.length ? `<label><span>Filtro salvo</span><select data-ux-saved-filter><option value="">Escolher…</option>${saved.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("")}</select></label>` : ""}</div><div class="ux-filter-grid"><label><span>Tipo</span><select data-ux-filter-type><option value="">Todos</option><option value="simulado">Simulados</option><option value="prova">Provas</option></select></label><label><span>Disciplina</span><select data-ux-filter-discipline>${selectOptions(disciplines, "Todas")}</select></label><label><span>Cargo</span><select data-ux-filter-cargo>${selectOptions(cargos, "Todos")}</select></label><label><span>Ano</span><select data-ux-filter-year>${selectOptions(years, "Todos")}</select></label><label><span>Fonte / banca</span><select data-ux-filter-source>${selectOptions(sources, "Todas")}</select></label><label><span>Situação</span><select data-ux-filter-scope><option value="all">Todas</option><option value="unanswered">Nunca respondidas</option><option value="errors">Erradas</option><option value="marked">Marcadas</option></select></label><label><span>Quantidade</span><select data-ux-filter-count><option>10</option><option selected>20</option><option>30</option><option>50</option><option value="all">Todas disponíveis</option></select></label><label><span>Modo</span><select data-ux-filter-mode><option value="treino">Treino com correção</option><option value="prova">Simulação de prova</option></select></label></div><div class="ux-advanced-actions"><button class="btn primary" data-ux-run-filter>Iniciar treino</button><button class="btn" data-ux-save-filter>Salvar filtro</button></div></section><section class="ux-question-search card"><div><p class="eyebrow">Busca inteligente</p><h2>Procure dentro das questões</h2><p>Busca por termos do enunciado, alternativas, comentários e fundamentos.</p></div><div class="ux-search-box"><input data-ux-question-search placeholder="Ex.: autotutela anular revogar"><button class="btn primary" data-ux-run-search>Buscar</button></div><div data-ux-search-results></div></section>`;
  heading.insertAdjacentElement("afterend", section);
  section.querySelector("[data-ux-start-today]")?.addEventListener("click", startDailyPlan);
  section.querySelector("[data-ux-quick]")?.addEventListener("click", () => startQuick(10));
  section.querySelector("[data-ux-critical]")?.addEventListener("click", () => {
    const due = adaptive().filter(item => Number(item.dueAt || 0) <= Date.now() || Number(item.mastery || 0) < 45).map(item => item.id);
    const critical = errors().filter(item => Number(item.count || 0) > 1).map(item => item.id);
    const ids = []; uniquePush(ids, critical, 20); uniquePush(ids, due, 20);
    startIds(ids, {id: "revisao-critica", name: "Revisão crítica", discipline: "Prioridades", source: "Caderno de erros + revisão adaptativa"});
  });
  const advanced = section.querySelector("[data-ux-advanced]");
  section.querySelector("[data-ux-toggle-advanced]")?.addEventListener("click", () => { advanced.hidden = !advanced.hidden; if (!advanced.hidden) advanced.scrollIntoView({behavior: "smooth", block: "nearest"}); });
  section.querySelector("[data-ux-run-filter]")?.addEventListener("click", () => {
    const criteria = readFilterForm(section);
    const ids = filterQuestionIds(criteria);
    startIds(ids, {id: "treino-personalizado-v2", name: "Treino personalizado", discipline: criteria.discipline || "Múltiplas matérias", source: "Filtros avançados", mode: criteria.mode});
  });
  section.querySelector("[data-ux-save-filter]")?.addEventListener("click", () => saveCurrentFilter(section));
  section.querySelector("[data-ux-saved-filter]")?.addEventListener("change", event => {
    const item = saved.find(savedItem => savedItem.id === event.target.value);
    if (item) { applyFilterToForm(section, item.criteria); advanced.hidden = false; }
  });
  section.querySelector("[data-ux-run-search]")?.addEventListener("click", () => runQuestionSearch(section));
  section.querySelector("[data-ux-question-search]")?.addEventListener("keydown", event => { if (event.key === "Enter") runQuestionSearch(section); });
}

function currentQuestionId() {
  const session = activeSession();
  return session?.questionIds?.[Number(session.current || 0)] || session?.questions?.[Number(session.current || 0)]?.id || null;
}

function setQuestionScale(value) {
  const scale = Math.max(.9, Math.min(1.3, Number(value) || 1));
  localStorage.setItem(QUESTION_SCALE_KEY(), String(scale));
  document.documentElement.style.setProperty("--ux-question-scale", scale);
  document.querySelectorAll("[data-ux-scale]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.uxScale) === scale)));
}

function saveErrorReason(reason) {
  const id = currentQuestionId();
  if (!id) return;
  const data = readJSON(ERROR_REASONS_KEY(), {});
  data[id] = {reason, updatedAt: new Date().toISOString()};
  saveJSON(ERROR_REASONS_KEY(), data);
  document.querySelectorAll("[data-ux-error-reason]").forEach(button => button.classList.toggle("active", button.dataset.uxErrorReason === reason));
  toast("Motivo do erro registrado.", "success");
}

function enhanceResolver() {
  const isResolver = currentRoute() === "resolver" && document.querySelector(".exam-layout");
  document.documentElement.classList.toggle("ux-focus-mode", Boolean(isResolver));
  if (!isResolver) return;
  setQuestionScale(localStorage.getItem(QUESTION_SCALE_KEY()) || 1);
  const header = document.querySelector(".exam-header");
  if (header && !header.querySelector("[data-ux-reading-tools]")) {
    const tools = document.createElement("div");
    tools.className = "ux-reading-tools";
    tools.dataset.uxReadingTools = "";
    tools.innerHTML = `<button class="ux-mini-btn" data-ux-scale="0.9" aria-label="Diminuir texto">A−</button><button class="ux-mini-btn" data-ux-scale="1" aria-label="Texto normal">A</button><button class="ux-mini-btn" data-ux-scale="1.15" aria-label="Aumentar texto">A+</button><button class="ux-mini-btn ux-map-toggle" data-ux-map-toggle>Mapa</button>`;
    header.append(tools);
    tools.querySelectorAll("[data-ux-scale]").forEach(button => button.addEventListener("click", () => setQuestionScale(button.dataset.uxScale)));
    tools.querySelector("[data-ux-map-toggle]")?.addEventListener("click", () => document.documentElement.classList.toggle("ux-map-open"));
  }
  const feedback = document.querySelector(".feedback.bad");
  if (feedback && !feedback.querySelector("[data-ux-error-reasons]")) {
    const id = currentQuestionId();
    const selected = readJSON(ERROR_REASONS_KEY(), {})[id]?.reason || "";
    const block = document.createElement("div");
    block.className = "ux-error-reasons";
    block.dataset.uxErrorReasons = "";
    block.innerHTML = `<strong>Por que você errou?</strong><div>${[["nao-sabia","📚 Não sabia"],["desatencao","👀 Desatenção"],["confundi","🧠 Confundi conceitos"],["interpretacao","📖 Interpretação"],["chute","🎲 Chute"],["tempo","⏱ Falta de tempo"]].map(([value, label]) => `<button class="${selected === value ? "active" : ""}" data-ux-error-reason="${value}">${label}</button>`).join("")}</div>`;
    feedback.append(block);
    block.querySelectorAll("[data-ux-error-reason]").forEach(button => button.addEventListener("click", () => saveErrorReason(button.dataset.uxErrorReason)));
  }
}

function errorReasonBreakdown() {
  const labels = {"nao-sabia":"Não sabia",desatencao:"Desatenção",confundi:"Confusão de conceitos",interpretacao:"Interpretação",chute:"Chute",tempo:"Falta de tempo"};
  const values = Object.values(readJSON(ERROR_REASONS_KEY(), {}));
  const counts = new Map();
  values.forEach(item => counts.set(item.reason, (counts.get(item.reason) || 0) + 1));
  const total = values.length || 1;
  return [...counts.entries()].map(([reason, count]) => ({reason, label: labels[reason] || reason, count, percent: Math.round(count / total * 100)})).sort((a, b) => b.count - a.count);
}

function closeMasteredErrors() {
  const model = readJSON(ADAPTIVE_KEY(), {});
  const book = readJSON(ERRORS_KEY(), {});
  let closed = 0;
  for (const [id, item] of Object.entries(book)) {
    const mastery = model[id];
    if (item?.open && Number(mastery?.mastery || 0) >= 80 && Number(mastery?.streak || 0) >= 3) { item.open = false; item.masteredAt = new Date().toISOString(); closed += 1; }
  }
  if (!closed) return toast("Nenhum erro atingiu 3 acertos seguidos e domínio ≥ 80%.", "info");
  saveJSON(ERRORS_KEY(), book);
  toast(`${closed} erro(s) dominado(s) encerrado(s).`, "success");
  location.reload();
}

function enhanceReview() {
  if (currentRoute() !== "revisar" || document.querySelector("[data-ux-review-insights]")) return;
  const heading = document.querySelector(".page-heading");
  if (!heading) return;
  const due = adaptive().filter(item => Number(item.dueAt || 0) <= Date.now() || Number(item.mastery || 0) < 45);
  const recurrent = errors().filter(item => Number(item.count || 0) > 1);
  const slow = due.filter(item => Number(item.averageSeconds || 0) > 120);
  const reasons = errorReasonBreakdown();
  const card = document.createElement("section");
  card.className = "ux-review-insights card";
  card.dataset.uxReviewInsights = "";
  card.innerHTML = `<div><p class="eyebrow">Diagnóstico da revisão</p><h2>Priorize o que ainda está cobrando juros</h2><p>Reincidência, vencimento e lentidão entram antes da revisão aleatória.</p></div><div class="ux-review-facts"><button data-ux-review-recurrent><strong>${recurrent.length}</strong><small>reincidentes</small></button><button data-ux-review-due><strong>${due.length}</strong><small>vencidas / frágeis</small></button><button data-ux-review-slow><strong>${slow.length}</strong><small>lentas</small></button></div><div class="ux-review-actions"><button class="btn" data-ux-close-mastered>Encerrar dominadas</button></div>${reasons.length ? `<div class="ux-reason-bars"><strong>Motivos registrados</strong>${reasons.map(item => `<div><span>${esc(item.label)}</span><i><b style="width:${item.percent}%"></b></i><small>${item.percent}%</small></div>`).join("")}</div>` : ""}`;
  heading.insertAdjacentElement("afterend", card);
  card.querySelector("[data-ux-review-recurrent]")?.addEventListener("click", () => startIds(recurrent.map(item => item.id), {id:"revisao-reincidentes",name:"Erros reincidentes",discipline:"Caderno de erros",source:"Reincidência"}));
  card.querySelector("[data-ux-review-due]")?.addEventListener("click", () => startIds(due.slice(0, 20).map(item => item.id), {id:"revisao-vencida",name:"Revisão vencida",discipline:"Prioridades adaptativas",source:"Revisão adaptativa"}));
  card.querySelector("[data-ux-review-slow]")?.addEventListener("click", () => startIds(slow.slice(0, 20).map(item => item.id), {id:"revisao-lentas",name:"Questões lentas",discipline:"Tempo de resposta",source:"Histórico de resolução"}));
  card.querySelector("[data-ux-close-mastered]")?.addEventListener("click", closeMasteredErrors);
}

function trainDiscipline(name, count = 15) {
  const discipline = (state.studyIndex?.disciplines || []).find(item => item.name === name);
  const answered = activeAnswered();
  const fresh = (discipline?.question_ids || []).filter(id => !answered.has(id));
  const ids = stableTake(fresh.length ? fresh : discipline?.question_ids || [], count, `discipline:${name}`);
  startIds(ids, {id:`diagnostico-${normalize(name).replace(/[^a-z0-9]+/g,"-")}`,name:`Treino direcionado — ${name}`,discipline:name,source:"Diagnóstico de desempenho"});
}

function enhancePerformance() {
  if (currentRoute() !== "desempenho" || document.querySelector("[data-ux-performance]")) return;
  const metrics = document.querySelector(".dashboard-metrics");
  if (!metrics) return;
  const disciplines = disciplineStats();
  const recent = answerStats(attemptsSince(7 * DAY));
  const previous = answerStats(activeHistory().filter(item => {
    const age = Date.now() - new Date(item.finishedAt || 0).getTime();
    return age > 7 * DAY && age <= 14 * DAY;
  }));
  const trend = Math.round((recent.accuracy - previous.accuracy) * 10) / 10;
  const reasons = errorReasonBreakdown();
  const section = document.createElement("section");
  section.className = "ux-performance section";
  section.dataset.uxPerformance = "";
  section.innerHTML = `<div class="section-head"><div><p class="eyebrow">Inteligência de estudo</p><h2>Mapa de domínio por matéria</h2><p>Índice estimado = 72% precisão + 28% cobertura das questões disponíveis na matéria.</p></div><span class="ux-trend ${trend >= 0 ? "up" : "down"}">${trend >= 0 ? "↑" : "↓"} ${Math.abs(trend)} p.p. vs. 7 dias anteriores</span></div>${disciplines.length ? `<div class="ux-mastery-grid">${disciplines.slice(0, 12).map(item => `<article class="card ux-mastery-card"><div><strong>${esc(item.name)}</strong><span>${item.mastery}% domínio estimado</span></div><div class="ux-mastery-track"><span style="width:${item.mastery}%"></span></div><small>Precisão ${item.accuracy}% · cobertura ${item.coverage}% · ${item.total} respostas</small><button class="btn compact" data-ux-train-discipline="${esc(item.name)}">Treinar 15</button></article>`).join("")}</div>` : `<div class="card ux-empty">Resolva mais questões para gerar o mapa de domínio.</div>`}${reasons.length ? `<section class="card ux-error-diagnosis"><div><p class="eyebrow">Padrão dos erros</p><h3>O problema é conteúdo ou execução?</h3></div><div>${reasons.map(item => `<span><strong>${item.percent}%</strong><small>${esc(item.label)}</small></span>`).join("")}</div></section>` : ""}`;
  metrics.insertAdjacentElement("afterend", section);
  section.querySelectorAll("[data-ux-train-discipline]").forEach(button => button.addEventListener("click", () => trainDiscipline(button.dataset.uxTrainDiscipline, 15)));
}

function enhanceShell() {
  enhanceFooter();
  const route = currentRoute();
  if (lastRoute !== route) {
    document.documentElement.classList.toggle("ux-focus-mode", route === "resolver");
    if (route !== "resolver") document.documentElement.classList.remove("ux-map-open");
    lastRoute = route;
  }
}

async function enhanceAll() {
  await ensureData();
  enhanceShell();
  enhanceHome();
  enhanceStudy();
  enhanceResolver();
  enhanceReview();
  enhancePerformance();
}

ensureData().then(() => observeApp(enhanceAll)).catch(error => console.error("Falha ao iniciar UX v2.14:", error));
