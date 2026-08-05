const CATALOG_URL = "./data/release/catalogo.json?release=3048-3046-71-r4";
const RELEASE_META_URL = "./data/release/release-meta.json?release=3048-3046-71-r4";
const EXAM_URL = "./data/concurso.json";
const STUDY_INDEX_URL = "./data/release/study-index.json?release=3048-3046-71-r4";
const THEME_KEY = "sedes.questoes.theme";
const PROFILES_KEY = "sedes.questoes.profiles.v3";
const ACTIVE_PROFILE_KEY = "sedes.questoes.activeProfile.v3";
const MIGRATION_KEY = "sedes.questoes.migrated.v4";
const LEGACY_HISTORY_KEY = "sedes.questoes.history.v2";
const LEGACY_ERROR_KEY = "sedes.questoes.errorbook.v2";
const LEVEL_KEY = "sedes.questoes.studyLevel.v1";
const SESSION_SCHEMA = 4;

const DEFAULT_PROFILES = [
  {id: "rodrigo", name: "Rodrigo", roles: ["202", "400"]},
  {id: "amanda", name: "Amanda", roles: ["202", "403"]},
  {id: "andressa", name: "Andressa", roles: ["200", "405"]},
];

const app = document.querySelector("#app");
const themeToggle = document.querySelector("#theme-toggle");
const syncLabel = document.querySelector("#sync-label");
const profileButton = document.querySelector("#profile-button");
const profileButtonLabel = document.querySelector("#profile-button-label");
const profileButtonAvatar = document.querySelector("#profile-button-avatar");

const state = {
  catalog: null,
  releaseMeta: null,
  exam: null,
  studyIndex: null,
  studyView: "materias",
  selectedDiscipline: null,
  cache: new Map(),
  route: "inicio",
  selectedMeta: null,
  material: null,
  questions: [],
  mode: null,
  current: 0,
  answers: {},
  confirmed: {},
  flagged: {},
  startedAt: null,
  elapsedBase: 0,
  questionStartedAt: null,
  questionTimes: {},
  timerId: null,
  filters: {
    level: localStorage.getItem(LEVEL_KEY) || "all",
    type: "",
    discipline: "",
    cargo: "",
    search: "",
    scope: "all",
    count: 20,
    mode: "treino",
  },
};

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const readJSON = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
};

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("Falha ao salvar dados locais:", error);
    showToast("O navegador não conseguiu salvar o progresso. Libere espaço e tente novamente.", "error");
    return false;
  }
}

function loadProfiles() {
  const saved = readJSON(PROFILES_KEY, []);
  const byId = new Map(saved.map(profile => [profile.id, profile]));
  const profiles = DEFAULT_PROFILES.map(profile => ({
    ...(byId.get(profile.id) || {}),
    ...profile,
    roles: [...profile.roles],
  }));
  writeJSON(PROFILES_KEY, profiles);
  return profiles;
}

function activeProfile() {
  const profiles = loadProfiles();
  const id = localStorage.getItem(ACTIVE_PROFILE_KEY) || profiles[0].id;
  return profiles.find(profile => profile.id === id) || profiles[0];
}

const profileKey = suffix => `sedes.questoes.${activeProfile().id}.${suffix}.v3`;
const loadHistory = () => readJSON(profileKey("history"), []);
const saveHistory = attempt => writeJSON(profileKey("history"), [attempt, ...loadHistory()].slice(0, 250));
const loadErrors = () => readJSON(profileKey("errors"), {});
const saveErrors = errors => writeJSON(profileKey("errors"), errors);
const loadMarked = () => readJSON(profileKey("marked"), {});
const saveMarked = marked => writeJSON(profileKey("marked"), marked);
const loadSession = () => readJSON(profileKey("session"), null);
const clearSession = () => localStorage.removeItem(profileKey("session"));

function setActiveProfile(id) {
  if (!loadProfiles().some(profile => profile.id === id)) return;
  persistActiveSession();
  localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  updateShell();
  go("inicio");
}

function migrateLegacyData() {
  if (localStorage.getItem(MIGRATION_KEY)) return;
  const oldHistory = readJSON(LEGACY_HISTORY_KEY, []);
  const oldErrors = readJSON(LEGACY_ERROR_KEY, {});
  if (oldHistory.length && !localStorage.getItem("sedes.questoes.rodrigo.history.v3")) {
    writeJSON("sedes.questoes.rodrigo.history.v3", oldHistory.map(item => ({...item, migrated: true})));
  }
  if (Object.keys(oldErrors).length && !localStorage.getItem("sedes.questoes.rodrigo.errors.v3")) {
    const migrated = {};
    Object.entries(oldErrors).forEach(([materialId, ids]) => {
      (ids || []).forEach(id => {
        migrated[id] = {id, materialId, count: 1, open: true, updatedAt: new Date().toISOString()};
      });
    });
    writeJSON("sedes.questoes.rodrigo.errors.v3", migrated);
  }
  localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

const normalizeType = value => String(value || "").toLowerCase();
const humanType = value => normalizeType(value) === "prova" ? "Prova anterior" : "Simulado";
const materialById = id => state.catalog.materials.find(item => item.id === id);
const examRole = code => state.exam?.cargos?.find(role => String(role.codigo) === String(code));
const roleName = code => {
  const role = examRole(code);
  return role ? `${role.carreira} ${role.codigo} — ${role.nome}` : code === "multicargo" ? "Todos os cargos" : `Cargo ${code}`;
};
const roleLevel = code => String(examRole(code)?.nivel || "").toLocaleLowerCase("pt-BR").includes("superior") ? "superior" : "medio";

function activeRoleLabel() {
  return activeProfile().roles.map(roleName).join(" · ");
}

function updateShell() {
  const profile = activeProfile();
  if (profileButtonLabel) profileButtonLabel.textContent = profile.name;
  if (profileButtonAvatar) profileButtonAvatar.textContent = profile.name.slice(0, 1).toUpperCase();
  if (profileButton) profileButton.setAttribute("aria-label", `Perfil ativo: ${profile.name}. Trocar perfil`);
  document.querySelectorAll("[data-route]").forEach(link => {
    const active = link.dataset.route === state.route;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  themeToggle?.setAttribute("aria-pressed", String(theme === "dark"));
}

themeToggle?.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
setTheme(localStorage.getItem(THEME_KEY) || "dark");

function routeFromHash() {
  return (location.hash.replace(/^#\/?/, "").split("/")[0] || "inicio").toLowerCase();
}

function go(route) {
  if (location.hash === `#/${route}`) {
    state.route = route;
    renderRoute();
  } else {
    location.hash = `#/${route}`;
  }
}

window.addEventListener("hashchange", () => {
  state.route = routeFromHash();
  renderRoute();
});

document.addEventListener("click", event => {
  const routeLink = event.target.closest("[data-route]");
  if (routeLink) {
    event.preventDefault();
    go(routeLink.dataset.route);
  }
});

function focusMainHeading() {
  requestAnimationFrame(() => {
    const heading = app.querySelector("h1");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({preventScroll: true});
  });
}

function showToast(message, type = "info") {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.role = "status";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function openDecisionDialog({title, message, confirmLabel = "Descartar e continuar"}) {
  return new Promise(resolve => {
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";
    backdrop.innerHTML = `<section class="decision-dialog card" role="dialog" aria-modal="true" aria-labelledby="decision-title">
      <p class="eyebrow">Tentativa em andamento</p>
      <h2 id="decision-title">${esc(title)}</h2>
      <p>${esc(message)}</p>
      <div class="dialog-actions">
        <button class="btn primary" data-dialog-resume>Continuar tentativa salva</button>
        <button class="btn danger" data-dialog-confirm>${esc(confirmLabel)}</button>
        <button class="btn" data-dialog-cancel>Cancelar</button>
      </div>
    </section>`;
    document.body.append(backdrop);
    const finish = choice => { backdrop.remove(); resolve(choice); };
    backdrop.querySelector("[data-dialog-resume]").addEventListener("click", () => finish("resume"));
    backdrop.querySelector("[data-dialog-confirm]").addEventListener("click", () => finish("replace"));
    backdrop.querySelector("[data-dialog-cancel]").addEventListener("click", () => finish("cancel"));
    backdrop.addEventListener("click", event => { if (event.target === backdrop) finish("cancel"); });
    backdrop.querySelector("[data-dialog-resume]").focus();
  });
}

async function ensureCanStartNewAttempt() {
  if (!loadSession()) return true;
  const choice = await openDecisionDialog({
    title: "Você já possui uma tentativa salva.",
    message: "Continuar a sessão anterior preserva suas respostas e o tempo acumulado. Descartá-la é irreversível.",
  });
  if (choice === "resume") {
    await resumeSession();
    return false;
  }
  if (choice === "replace") {
    clearSession();
    return true;
  }
  return false;
}

function getCountdown() {
  const target = new Date(state.exam?.alvo_contagem || 0).getTime();
  const difference = target - Date.now();
  if (difference <= 0) return {finished: true, days: 0, hours: 0, minutes: 0, seconds: 0};
  const totalSeconds = Math.floor(difference / 1000);
  return {
    finished: false,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function formatDate(date) {
  return new Date(`${date}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo",
  });
}

function answeredIdsForAttempt(attempt) {
  if (Array.isArray(attempt.answeredQuestionIds)) return attempt.answeredQuestionIds;
  if (attempt.answers && typeof attempt.answers === "object") {
    return Object.entries(attempt.answers).filter(([, answer]) => Boolean(answer)).map(([id]) => id);
  }
  return Array.isArray(attempt.questionIds) ? attempt.questionIds : [];
}

function presentedIdsForAttempt(attempt) {
  return attempt.presentedQuestionIds || attempt.questionIds || [];
}

function aggregateStats() {
  const history = loadHistory();
  const completed = history.length;
  const answered = history.reduce((sum, item) => sum + answeredIdsForAttempt(item).length, 0);
  const correct = history.reduce((sum, item) => sum + Number(item.correct || 0), 0);
  const accuracy = answered ? Math.round(correct / answered * 1000) / 10 : 0;
  const elapsed = history.reduce((sum, item) => sum + Number(item.elapsed || 0), 0);
  const unique = new Set(history.flatMap(answeredIdsForAttempt));
  const openErrors = Object.values(loadErrors()).filter(item => item.open).length;
  const marked = Object.keys(loadMarked()).length;
  return {completed, answered, correct, accuracy, elapsed, unique: unique.size, openErrors, marked};
}

function answeredIdsForMaterial(materialId) {
  const ids = new Set();
  for (const attempt of loadHistory()) {
    const answered = new Set(answeredIdsForAttempt(attempt));
    for (const result of attempt.questionResults || []) {
      if (result.materialId === materialId && answered.has(result.id)) ids.add(result.id);
    }
    if (attempt.materialId === materialId && !(attempt.questionResults || []).length) {
      answered.forEach(id => ids.add(id));
    }
  }
  return ids;
}

function materialProgress(material) {
  const history = loadHistory().filter(item => item.materialId === material.id || (item.questionResults || []).some(result => result.materialId === material.id));
  const ids = answeredIdsForMaterial(material.id);
  const best = history.length ? Math.max(...history.map(item => Number(item.percent || 0))) : null;
  const progress = material.quantidade_questoes ? Math.min(100, Math.round(ids.size / material.quantidade_questoes * 100)) : 0;
  return {attempts: history.length, answered: ids.size, best, progress};
}

function relevantMaterials() {
  const roles = activeProfile().roles;
  const matching = state.catalog.materials.filter(material => roles.includes(String(material.codigo_cargo)));
  return matching.length ? [...matching, ...state.catalog.materials.filter(material => !matching.includes(material))] : state.catalog.materials;
}

function renderCountdownCard() {
  const countdown = getCountdown();
  return `<article class="dashboard-countdown card">
    <div><p class="eyebrow">Prova SEDES/DF</p><h2>${formatDate(state.exam.data_prova)}</h2><p>${esc(activeRoleLabel())}</p></div>
    <div class="mini-countdown" aria-label="Tempo até a prova">
      <span><b data-live-days>${countdown.days}</b>dias</span>
      <span><b data-live-hours>${String(countdown.hours).padStart(2, "0")}</b>horas</span>
      <span><b data-live-minutes>${String(countdown.minutes).padStart(2, "0")}</b>min</span>
    </div>
    <a class="btn" href="${esc(state.exam.url_oficial)}" target="_blank" rel="noopener noreferrer">Cronograma oficial ↗</a>
  </article>`;
}

function updateLiveCountdown() {
  if (!state.exam) return;
  const countdown = getCountdown();
  document.querySelectorAll("[data-live-days]").forEach(element => element.textContent = countdown.days);
  document.querySelectorAll("[data-live-hours]").forEach(element => element.textContent = String(countdown.hours).padStart(2, "0"));
  document.querySelectorAll("[data-live-minutes]").forEach(element => element.textContent = String(countdown.minutes).padStart(2, "0"));
}

function renderHome() {
  stopTimer();
  const profile = activeProfile();
  const stats = aggregateStats();
  const session = loadSession();
  const history = loadHistory();
  const recentMaterials = relevantMaterials().slice(0, 3);
  const masterTotal = Number(state.releaseMeta?.banco_mestre ?? state.catalog.summary.banco_mestre ?? 0);
  const published = Number(state.releaseMeta?.questions ?? state.catalog.summary.questoes ?? 0);
  const pending = Number(state.releaseMeta?.awaiting_audit ?? state.catalog.summary.aguardando_auditoria ?? 0);
  const greeting = session ? "Sua tentativa está salva." : stats.completed ? "Vamos manter a consistência." : "Vamos começar sua preparação.";

  app.innerHTML = `<section class="home-hero card">
    <div><p class="eyebrow">Perfil ativo · ${esc(profile.name)}</p><h1>${greeting}</h1>
      <p class="lead">${esc(activeRoleLabel())}. Seu histórico, caderno de erros e progresso ficam separados dos demais perfis neste aparelho.</p>
      <div class="hero-actions">${session ? `<button class="btn primary" data-resume>Continuar de onde parou</button>` : `<button class="btn primary" data-quick-training>Começar treino rápido</button>`}<button class="btn" data-route="estudar">Escolher conteúdo</button></div>
    </div>
    <div class="profile-orb"><span>${esc(profile.name.slice(0, 1).toUpperCase())}</span><small>${stats.accuracy}% de precisão</small></div>
  </section>
  ${renderCountdownCard()}
  <section class="bank-status card" aria-label="Situação do banco">
    <div><span>Banco Mestre</span><strong>${masterTotal}</strong><small>registros cadastrados no Notion</small></div>
    <div><span>Disponíveis no site</span><strong>${published}</strong><small>questões consolidadas e publicadas</small></div>
    <div><span>Em auditoria editorial</span><strong>${pending}</strong><small>registros ainda não liberados</small></div>
  </section>
  <section class="metrics dashboard-metrics">
    <article class="metric card"><small>Questões respondidas</small><strong>${stats.answered}</strong><span>${stats.unique} questões únicas efetivamente respondidas</span></article>
    <article class="metric card"><small>Precisão</small><strong>${stats.accuracy}%</strong><span>${stats.correct} acertos entre respostas marcadas</span></article>
    <article class="metric card"><small>Revisão pendente</small><strong>${stats.openErrors}</strong><span>questões erradas no caderno</span></article>
    <article class="metric card"><small>Tempo de estudo</small><strong>${formatTime(stats.elapsed)}</strong><span>${stats.completed} tentativas concluídas</span></article>
  </section>
  <section class="home-actions-grid section">
    <button class="action-card card" data-route="estudar"><span>▣</span><div><strong>Estudar</strong><small>Monte treinos por nível, matéria e situação.</small></div></button>
    <button class="action-card card" data-route="revisar"><span>◎</span><div><strong>Revisar</strong><small>${stats.openErrors} erros e ${stats.marked} questões marcadas.</small></div></button>
    <button class="action-card card" data-route="desempenho"><span>◔</span><div><strong>Desempenho</strong><small>Acompanhe evolução, tempo e pontos fracos.</small></div></button>
  </section>
  <section class="section"><div class="section-head"><div><p class="eyebrow">Acesso rápido</p><h2>Materiais em destaque</h2><p>Todo o acervo é acessível; seus cargos servem apenas como prioridade.</p></div><button class="btn" data-route="estudar">Ver todos</button></div><div class="material-grid compact-grid">${recentMaterials.map(materialCard).join("")}</div></section>
  ${history.length ? `<section class="section"><div class="section-head"><div><p class="eyebrow">Última atividade</p><h2>Tentativas recentes</h2></div><button class="btn" data-route="desempenho">Histórico completo</button></div><div class="history-list">${history.slice(0, 3).map(historyRow).join("")}</div></section>` : ""}`;

  document.querySelector("[data-quick-training]")?.addEventListener("click", () => startCustomTraining({count: 20, mode: "treino", scope: "all"}));
  document.querySelector("[data-resume]")?.addEventListener("click", () => resumeSession());
  bindMaterialButtons();
  updateLiveCountdown();
}

function getFilteredMaterials() {
  const query = state.filters.search.trim().toLocaleLowerCase("pt-BR");
  return state.catalog.materials.filter(material => {
    const levelOk = state.filters.level === "all" || roleLevel(material.codigo_cargo) === state.filters.level;
    const typeOk = !state.filters.type || normalizeType(material.tipo_material) === state.filters.type;
    const disciplineOk = !state.filters.discipline || material.disciplina === state.filters.discipline;
    const cargoOk = !state.filters.cargo || String(material.codigo_cargo) === state.filters.cargo;
    const haystack = `${material.nome} ${material.disciplina} ${material.fonte} ${material.cargo} ${material.codigo_cargo}`.toLocaleLowerCase("pt-BR");
    return levelOk && typeOk && disciplineOk && cargoOk && (!query || haystack.includes(query));
  });
}

function currentStudyView() {
  return ["materias", "simulados", "provas"].includes(state.studyView) ? state.studyView : "materias";
}

function studyViewTabs() {
  const disciplines = state.studyIndex?.summary?.disciplines || 0;
  const simulations = state.catalog.materials.filter(item => normalizeType(item.tipo_material) === "simulado").length;
  const exams = state.catalog.materials.filter(item => normalizeType(item.tipo_material) === "prova").length;
  const view = currentStudyView();
  return `<div class="study-view-tabs card" role="tablist" aria-label="Forma de estudar">
    <button class="study-view-tab ${view === "materias" ? "active" : ""}" role="tab" aria-selected="${view === "materias"}" data-study-view="materias"><span>Matérias</span><b>${disciplines}</b><small>Escolha os tópicos</small></button>
    <button class="study-view-tab ${view === "simulados" ? "active" : ""}" role="tab" aria-selected="${view === "simulados"}" data-study-view="simulados"><span>Simulados</span><b>${simulations}</b><small>Materiais completos</small></button>
    <button class="study-view-tab ${view === "provas" ? "active" : ""}" role="tab" aria-selected="${view === "provas"}" data-study-view="provas"><span>Provas anteriores</span><b>${exams}</b><small>Cadernos oficiais</small></button>
  </div>`;
}

function studySearchToolbar({showLevel = false, placeholder = "Buscar"} = {}) {
  return `<div class="study-toolbar card">
    <label class="search"><span aria-hidden="true">⌕</span><span class="sr-only">${esc(placeholder)}</span><input id="study-search" value="${esc(state.filters.search)}" placeholder="${esc(placeholder)}"></label>
    ${showLevel ? `<label class="study-level"><span>Nível</span><select id="study-level"><option value="all" ${state.filters.level === "all" ? "selected" : ""}>Todos</option><option value="medio" ${state.filters.level === "medio" ? "selected" : ""}>Médio</option><option value="superior" ${state.filters.level === "superior" ? "selected" : ""}>Superior</option></select></label>` : ""}
  </div>`;
}

function filteredDisciplines() {
  const query = state.filters.search.trim().toLocaleLowerCase("pt-BR");
  return (state.studyIndex?.disciplines || []).filter(discipline => {
    const haystack = `${discipline.name} ${discipline.topics.map(topic => topic.name).join(" ")}`.toLocaleLowerCase("pt-BR");
    return !query || haystack.includes(query);
  });
}

function materialsForStudyView(view) {
  const expectedType = view === "provas" ? "prova" : "simulado";
  const query = state.filters.search.trim().toLocaleLowerCase("pt-BR");
  return state.catalog.materials.filter(material => {
    if (normalizeType(material.tipo_material) !== expectedType) return false;
    const levelOk = view === "provas" || state.filters.level === "all" || roleLevel(material.codigo_cargo) === state.filters.level;
    const haystack = `${material.nome} ${material.disciplina} ${material.fonte} ${material.cargo || ""}`.toLocaleLowerCase("pt-BR");
    return levelOk && (!query || haystack.includes(query));
  });
}

function renderStudy() {
  stopTimer();
  if (state.selectedDiscipline && currentStudyView() === "materias") return renderDisciplineTopics();
  const view = currentStudyView();
  let content = "";
  if (view === "materias") {
    const disciplines = filteredDisciplines();
    content = `${studySearchToolbar({placeholder: "Buscar matéria ou tópico"})}
      <section class="section"><div class="section-head"><div><p class="eyebrow">Organização por conteúdo</p><h2>Escolha uma matéria</h2><p>Depois, selecione exatamente os tópicos que deseja responder.</p></div><span class="stamp">${state.studyIndex.summary.questions} questões indexadas</span></div>
      ${disciplines.length ? `<div class="discipline-grid">${disciplines.map(disciplineCard).join("")}</div>` : `<div class="empty-state card"><div class="empty-icon">⌕</div><h3>Nenhuma matéria encontrada.</h3><p>Limpe a busca para visualizar todas as disciplinas.</p></div>`}</section>`;
  } else {
    const materials = materialsForStudyView(view);
    const isExam = view === "provas";
    content = `${studySearchToolbar({showLevel: !isExam, placeholder: isExam ? "Buscar prova anterior" : "Buscar simulado"})}
      ${isExam ? `<div class="study-notice card"><strong>Provas sempre visíveis</strong><p>Esta lista não é ocultada por filtros de nível. Provas correlatas permanecem disponíveis para todos os perfis.</p></div>` : ""}
      <section class="section"><div class="section-head"><div><p class="eyebrow">${isExam ? "Cadernos oficiais" : "Materiais completos"}</p><h2>${isExam ? "Provas anteriores" : "Simulados"}</h2><p>${isExam ? "Abra a prova completa e escolha entre modo treino ou modo prova." : "Cada card representa um material completo do banco."}</p></div><span class="stamp">${materials.reduce((sum, item) => sum + Number(item.quantidade_questoes || 0), 0)} questões</span></div>
      ${materials.length ? `<div class="material-grid">${materials.map(materialCard).join("")}</div>` : `<div class="empty-state card"><div class="empty-icon">⌕</div><h3>Nenhum material encontrado.</h3><p>Limpe a busca ou altere o nível selecionado.</p></div>`}</section>`;
  }

  app.innerHTML = `<section class="page-heading"><div><p class="eyebrow">Estudar</p><h1>Escolha como organizar seu treino.</h1><p>Navegue por matéria e tópico, resolva simulados completos ou abra provas anteriores.</p></div><button class="btn" data-route="inicio">← Início</button></section>${studyViewTabs()}${content}`;
  bindStudyEvents();
  updateShell();
}

function disciplineCard(discipline) {
  const topicPreview = discipline.topics.slice(0, 3).map(topic => topic.name).join(" · ");
  return `<article class="discipline-card card"><div class="discipline-card-head"><span class="discipline-icon" aria-hidden="true">▤</span><div><p class="eyebrow">${discipline.material_count} material(is)</p><h3>${esc(discipline.name)}</h3></div></div><p>${esc(topicPreview || "Tópicos classificados")}${discipline.topics.length > 3 ? "…" : ""}</p><div class="discipline-stats"><span><b>${discipline.question_count}</b> questões</span><span><b>${discipline.topics.length}</b> tópicos</span></div><button class="btn primary full" data-open-discipline="${esc(discipline.name)}">Selecionar tópicos</button></article>`;
}

function materialCard(material) {
  const progress = materialProgress(material);
  const errorCount = Object.values(loadErrors()).filter(item => item.open && item.materialId === material.id).length;
  const status = progress.attempts ? `${progress.progress}% respondido` : "Não iniciado";
  return `<article class="material-card card"><div class="material-top"><span class="type-badge">${humanType(material.tipo_material)}</span><span class="year-badge">${material.ano}</span></div><div><p class="discipline">${esc(material.disciplina)}</p><h3>${esc(material.nome)}</h3><p class="material-source">${esc(material.fonte)} · ${esc(roleName(material.codigo_cargo))}</p></div><div class="material-progress"><div><span>${status}</span><b>${progress.best === null ? "—" : `${progress.best}% melhor nota`}</b></div><div class="progress"><span style="width:${progress.progress}%"></span></div></div><div class="material-stats"><span><b>${material.quantidade_questoes}</b> questões</span><span><b>${material.tempo_sugerido_minutos}</b> min</span>${errorCount ? `<span class="error-count"><b>${errorCount}</b> erros</span>` : ""}</div><div class="material-actions"><button class="btn primary" data-open-material="${esc(material.id)}">${progress.attempts ? "Continuar estudando" : "Abrir material"}</button>${errorCount ? `<button class="btn compact" data-review-material="${esc(material.id)}">Revisar erros</button>` : ""}</div></article>`;
}

function bindStudyEvents() {
  document.querySelectorAll("[data-study-view]").forEach(button => button.addEventListener("click", () => {
    state.studyView = button.dataset.studyView;
    state.selectedDiscipline = null;
    state.filters.search = "";
    state.filters.type = state.studyView === "simulados" ? "simulado" : state.studyView === "provas" ? "prova" : "";
    if (state.studyView === "provas") state.filters.level = "all";
    renderStudy();
  }));
  document.querySelector("#study-search")?.addEventListener("input", event => {
    state.filters.search = event.target.value;
    const cursor = event.target.selectionStart;
    renderStudy();
    const next = document.querySelector("#study-search");
    next?.focus();
    next?.setSelectionRange(cursor, cursor);
  });
  document.querySelector("#study-level")?.addEventListener("change", event => {
    state.filters.level = event.target.value;
    state.filters.level === "all" ? localStorage.removeItem(LEVEL_KEY) : localStorage.setItem(LEVEL_KEY, state.filters.level);
    renderStudy();
  });
  document.querySelectorAll("[data-open-discipline]").forEach(button => button.addEventListener("click", () => {
    state.selectedDiscipline = button.dataset.openDiscipline;
    state.filters.search = "";
    renderDisciplineTopics();
  }));
  bindMaterialButtons();
}

function renderDisciplineTopics() {
  stopTimer();
  const discipline = (state.studyIndex?.disciplines || []).find(item => item.name === state.selectedDiscipline);
  if (!discipline) {
    state.selectedDiscipline = null;
    return renderStudy();
  }
  app.innerHTML = `<section class="page-heading"><div><p class="eyebrow">Treino por matéria</p><h1>${esc(discipline.name)}</h1><p>Selecione um ou mais tópicos. O treino reunirá questões de todos os materiais publicados.</p></div><button class="btn" data-back-disciplines>← Voltar às matérias</button></section>
  <section class="topic-builder card">
    <div class="topic-builder-head"><div><p class="eyebrow">Conteúdo disponível</p><h2>${discipline.question_count} questões em ${discipline.topics.length} tópicos</h2></div><div class="topic-bulk-actions"><button class="btn compact" data-topics-all>Selecionar todos</button><button class="btn compact" data-topics-none>Limpar</button></div></div>
    <div class="topic-list" role="group" aria-label="Tópicos de ${esc(discipline.name)}">${discipline.topics.map(topic => `<label class="topic-option"><input type="checkbox" value="${esc(topic.name)}" data-topic checked><span><strong>${esc(topic.name)}</strong><small>${topic.question_count} questão(ões)</small></span></label>`).join("")}</div>
    <div class="topic-config">
      <label><span>Situação</span><select id="topic-scope"><option value="all">Todas</option><option value="unanswered">Inéditas</option><option value="errors">Erradas</option><option value="marked">Marcadas</option></select></label>
      <label><span>Quantidade</span><select id="topic-count"><option value="10">10 questões</option><option value="20" selected>20 questões</option><option value="30">30 questões</option><option value="50">50 questões</option><option value="all">Todas disponíveis</option></select></label>
      <label><span>Modo</span><select id="topic-mode"><option value="treino">Treino com correção</option><option value="prova">Simulação de prova</option></select></label>
      <button class="btn primary topic-start" data-start-topic-training>Iniciar treino</button>
    </div>
    <p class="topic-selection-summary" data-topic-summary>${discipline.question_count} questões selecionadas.</p>
  </section>`;
  bindDisciplineTopicEvents(discipline);
  updateShell();
}

function bindDisciplineTopicEvents(discipline) {
  const selectedTopics = () => new Set([...document.querySelectorAll("[data-topic]:checked")].map(input => input.value));
  const selectedIds = () => discipline.topics.filter(topic => selectedTopics().has(topic.name)).flatMap(topic => topic.question_ids);
  const updateSummary = () => {
    const ids = selectedIds();
    const summary = document.querySelector("[data-topic-summary]");
    if (summary) summary.textContent = ids.length ? `${ids.length} questões selecionadas.` : "Selecione pelo menos um tópico.";
    const start = document.querySelector("[data-start-topic-training]");
    if (start) start.disabled = !ids.length;
  };
  document.querySelector("[data-back-disciplines]")?.addEventListener("click", () => {
    state.selectedDiscipline = null;
    renderStudy();
  });
  document.querySelector("[data-topics-all]")?.addEventListener("click", () => {
    document.querySelectorAll("[data-topic]").forEach(input => { input.checked = true; });
    updateSummary();
  });
  document.querySelector("[data-topics-none]")?.addEventListener("click", () => {
    document.querySelectorAll("[data-topic]").forEach(input => { input.checked = false; });
    updateSummary();
  });
  document.querySelectorAll("[data-topic]").forEach(input => input.addEventListener("change", updateSummary));
  document.querySelector("[data-start-topic-training]")?.addEventListener("click", async () => {
    const ids = selectedIds();
    if (!ids.length || !await ensureCanStartNewAttempt()) return;
    const scope = document.querySelector("#topic-scope")?.value || "all";
    const mode = document.querySelector("#topic-mode")?.value || "treino";
    const requested = document.querySelector("#topic-count")?.value || "20";
    renderLoading(`Preparando treino de ${discipline.name}…`);
    try {
      let questions = await loadQuestionsByIds(ids);
      const status = questionPoolStatus();
      if (scope === "unanswered") questions = questions.filter(question => !status.answered.has(question.id));
      if (scope === "errors") questions = questions.filter(question => status.errors.has(question.id));
      if (scope === "marked") questions = questions.filter(question => status.marked.has(question.id));
      questions = shuffle(questions);
      if (requested !== "all") questions = questions.slice(0, Math.min(Number(requested), questions.length));
      if (!questions.length) return renderRuntimeError("Não há questões disponíveis para os tópicos e a situação selecionados.", "estudar");
      const material = {id: `materia-${discipline.name.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "-")}`, nome: `Treino por matéria — ${discipline.name}`, disciplina: discipline.name, fonte: "Banco Mestre", tipo_material: "simulado", ano: 2026, codigo_cargo: "multicargo", tempo_sugerido_minutos: questions.length * 2, questoes: questions};
      beginAttempt(mode, questions, material);
    } catch (error) {
      console.error(error);
      renderRuntimeError("Não foi possível montar o treino por tópicos.", "estudar");
    }
  });
  updateSummary();
}

function bindMaterialButtons() {
  document.querySelectorAll("[data-open-material]").forEach(button => button.addEventListener("click", () => openMaterial(button.dataset.openMaterial)));
  document.querySelectorAll("[data-review-material]").forEach(button => button.addEventListener("click", () => startReviewByMaterial(button.dataset.reviewMaterial)));
}

async function fetchMaterial(meta) {
  if (state.cache.has(meta.id)) return state.cache.get(meta.id);
  const response = await fetch(meta.file, {cache: "force-cache"});
  if (!response.ok) throw new Error(`Falha ao carregar ${meta.id}: HTTP ${response.status}`);
  const material = await response.json();
  material.questoes = material.questoes.map(question => ({...question, _materialId: material.id, _materialName: material.nome, _discipline: question.disciplina || material.disciplina, _cargo: String(material.codigo_cargo)}));
  state.cache.set(meta.id, material);
  return material;
}

async function loadQuestionsByIds(ids) {
  const wanted = [...new Set(ids || [])];
  const grouped = new Map();
  const unknown = [];
  for (const id of wanted) {
    const materialId = state.catalog.question_index?.[id];
    if (!materialId) unknown.push(id);
    else {
      if (!grouped.has(materialId)) grouped.set(materialId, []);
      grouped.get(materialId).push(id);
    }
  }
  const map = new Map();
  await Promise.all([...grouped.entries()].map(async ([materialId, questionIds]) => {
    const meta = materialById(materialId);
    if (!meta) return;
    const material = await fetchMaterial(meta);
    const set = new Set(questionIds);
    material.questoes.filter(question => set.has(question.id)).forEach(question => map.set(question.id, question));
  }));
  if (unknown.length) {
    const materials = await Promise.all(state.catalog.materials.map(fetchMaterial));
    const set = new Set(unknown);
    materials.flatMap(material => material.questoes).filter(question => set.has(question.id)).forEach(question => map.set(question.id, question));
  }
  return wanted.map(id => map.get(id)).filter(Boolean);
}

async function openMaterial(id) {
  const meta = materialById(id);
  if (!meta) return;
  renderLoading(`Carregando ${meta.nome}…`);
  try {
    state.selectedMeta = meta;
    state.material = await fetchMaterial(meta);
    state.questions = state.material.questoes;
    state.route = "material";
    history.replaceState(null, "", "#/material");
    renderMaterialDetail();
  } catch (error) {
    console.error(error);
    renderRuntimeError("Não foi possível carregar este material.", "estudar");
  }
}

function renderMaterialDetail() {
  const material = state.material;
  if (!material) return go("estudar");
  const progress = materialProgress(material);
  const errors = Object.values(loadErrors()).filter(item => item.open && item.materialId === material.id).length;
  app.innerHTML = `<section class="detail-hero card"><button class="back-link" data-route="estudar">← Voltar a Estudar</button><div class="detail-grid"><div><div class="pills"><span class="pill">${humanType(material.tipo_material)}</span><span class="pill">${material.ano}</span><span class="pill">${esc(roleName(material.codigo_cargo))}</span></div><p class="eyebrow">${esc(material.disciplina)}</p><h1>${esc(material.nome)}</h1><p class="lead">Fonte: ${esc(material.fonte)}. Escolha como deseja resolver.</p></div><div class="detail-summary"><div><small>Questões</small><strong>${material.questoes.length}</strong></div><div><small>Tempo sugerido</small><strong>${material.tempo_sugerido_minutos} min</strong></div><div><small>Melhor resultado</small><strong>${progress.best === null ? "—" : `${progress.best}%`}</strong></div><div><small>No caderno de erros</small><strong>${errors}</strong></div></div></div></section>
  <section class="mode-grid section"><article class="mode-card card"><span class="mode-icon">✓</span><div><p class="eyebrow">Aprendizado guiado</p><h2>Modo treino</h2><p>Veja o gabarito e o comentário após confirmar cada resposta.</p></div><button class="btn primary" data-start="treino">Iniciar treino</button></article><article class="mode-card card"><span class="mode-icon">◷</span><div><p class="eyebrow">Simulação real</p><h2>Modo prova</h2><p>Resolva sem pistas e confira tudo somente no final.</p></div><button class="btn primary" data-start="prova">Iniciar prova</button></article>${errors ? `<article class="mode-card card accent"><span class="mode-icon">↻</span><div><p class="eyebrow">Revisão direcionada</p><h2>Caderno de erros</h2><p>Refaça as ${errors} questões pendentes deste material.</p></div><button class="btn" data-review-errors>Revisar erros</button></article>` : ""}</section>`;
  document.querySelectorAll("[data-start]").forEach(button => button.addEventListener("click", async () => {
    if (!await ensureCanStartNewAttempt()) return;
    beginAttempt(button.dataset.start, material.questoes, material);
  }));
  document.querySelector("[data-review-errors]")?.addEventListener("click", () => startReviewByMaterial(material.id));
}

function questionPoolStatus() {
  const answered = new Set(loadHistory().flatMap(answeredIdsForAttempt));
  const errors = new Set(Object.values(loadErrors()).filter(item => item.open).map(item => item.id));
  const marked = new Set(Object.keys(loadMarked()));
  return {answered, errors, marked};
}

async function buildQuestionPool() {
  const materials = getFilteredMaterials();
  const loaded = await Promise.all(materials.map(fetchMaterial));
  const all = loaded.flatMap(material => material.questoes);
  const status = questionPoolStatus();
  if (state.filters.scope === "unanswered") return all.filter(question => !status.answered.has(question.id));
  if (state.filters.scope === "errors") return all.filter(question => status.errors.has(question.id));
  if (state.filters.scope === "marked") return all.filter(question => status.marked.has(question.id));
  return all;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const random = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[random]] = [copy[random], copy[index]];
  }
  return copy;
}

async function startCustomTraining(overrides = {}) {
  Object.assign(state.filters, overrides);
  if (!await ensureCanStartNewAttempt()) return;
  renderLoading("Montando seu treino personalizado…");
  try {
    const pool = await buildQuestionPool();
    const selected = shuffle(pool).slice(0, Math.min(Number(state.filters.count || 20), pool.length));
    if (!selected.length) return renderRuntimeError("Não há questões disponíveis para os filtros selecionados.", "estudar");
    const material = {id: "treino-personalizado", nome: "Treino personalizado — Banco SEDES/DF", disciplina: state.filters.discipline || "Múltiplas matérias", fonte: "Banco Mestre", tipo_material: "simulado", ano: 2026, codigo_cargo: state.filters.cargo || "multicargo", tempo_sugerido_minutos: selected.length * 2, questoes: selected};
    beginAttempt(state.filters.mode || "treino", selected, material);
  } catch (error) {
    console.error(error);
    renderRuntimeError("Não foi possível montar o treino personalizado.", "estudar");
  }
}

function totalElapsed() {
  return state.startedAt ? state.elapsedBase + (Date.now() - state.startedAt) / 1000 : state.elapsedBase;
}

function currentQuestionElapsed() {
  const question = state.questions[state.current];
  if (!question) return 0;
  const stored = state.questionTimes[question.id] || 0;
  const active = state.questionStartedAt ? (Date.now() - state.questionStartedAt) / 1000 : 0;
  return stored + active;
}

function stopTimer() {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
}

function startTimer() {
  stopTimer();
  state.timerId = setInterval(() => {
    document.querySelectorAll("[data-total-time]").forEach(element => element.textContent = formatTime(totalElapsed()));
    document.querySelectorAll("[data-question-time]").forEach(element => element.textContent = formatTime(currentQuestionElapsed()));
  }, 500);
}

function trackQuestionTime() {
  if (!state.questionStartedAt) return;
  const question = state.questions[state.current];
  if (question) state.questionTimes[question.id] = (state.questionTimes[question.id] || 0) + (Date.now() - state.questionStartedAt) / 1000;
  state.questionStartedAt = Date.now();
}

function materialSessionSummary(material) {
  if (!material) return null;
  return {
    id: material.id,
    nome: material.nome,
    disciplina: material.disciplina,
    fonte: material.fonte,
    tipo_material: material.tipo_material,
    ano: material.ano,
    codigo_cargo: material.codigo_cargo,
    tempo_sugerido_minutos: material.tempo_sugerido_minutos,
  };
}

function saveSession() {
  if (!state.questions.length || !state.material || !state.mode) return;
  writeJSON(profileKey("session"), {
    version: SESSION_SCHEMA,
    material: materialSessionSummary(state.material),
    questionIds: state.questions.map(question => question.id),
    mode: state.mode,
    current: state.current,
    answers: state.answers,
    confirmed: state.confirmed,
    flagged: state.flagged,
    elapsedBase: totalElapsed(),
    questionTimes: state.questionTimes,
    savedAt: new Date().toISOString(),
  });
}

function persistActiveSession() {
  if (state.route !== "resolver" || !state.questions.length) return;
  trackQuestionTime();
  saveSession();
}

window.addEventListener("pagehide", persistActiveSession);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") persistActiveSession(); });

async function resumeSession() {
  const session = loadSession();
  const ids = session?.questionIds || session?.questions?.map(question => question.id) || [];
  if (!ids.length) return go("estudar");
  renderLoading("Restaurando sua tentativa…");
  try {
    const questions = session.questions?.length ? session.questions : await loadQuestionsByIds(ids);
    if (questions.length !== ids.length) throw new Error("Nem todas as questões da sessão foram localizadas.");
    const material = materialById(session.material?.id);
    state.material = material ? await fetchMaterial(material) : {...session.material, questoes: questions};
    state.questions = questions;
    state.mode = session.mode;
    state.current = Math.min(session.current || 0, questions.length - 1);
    state.answers = session.answers || {};
    state.confirmed = session.confirmed || {};
    state.flagged = session.flagged || {};
    state.elapsedBase = Number(session.elapsedBase || 0);
    state.questionTimes = session.questionTimes || {};
    state.startedAt = Date.now();
    state.questionStartedAt = Date.now();
    state.route = "resolver";
    history.replaceState(null, "", "#/resolver");
    saveSession();
    startTimer();
    renderQuestion();
  } catch (error) {
    console.error(error);
    renderRuntimeError("A tentativa salva não pôde ser restaurada. Ela foi preservada para nova tentativa de recuperação.", "inicio");
  }
}

function beginAttempt(mode, questions, material) {
  if (!questions?.length) return;
  state.material = material;
  state.questions = questions;
  state.mode = mode;
  state.current = 0;
  state.answers = {};
  state.confirmed = {};
  state.flagged = {};
  state.elapsedBase = 0;
  state.questionTimes = {};
  state.startedAt = Date.now();
  state.questionStartedAt = Date.now();
  state.route = "resolver";
  history.replaceState(null, "", "#/resolver");
  saveSession();
  startTimer();
  renderQuestion();
}

function optionClass(question, letter) {
  const selected = state.answers[question.id] === letter;
  const confirmed = state.confirmed[question.id];
  if (state.mode === "treino" && confirmed) {
    if (letter === question.gabarito) return "option correct";
    if (selected && letter !== question.gabarito) return "option incorrect";
  }
  return selected ? "option selected" : "option";
}

function feedback(question) {
  if (state.mode !== "treino" || !state.confirmed[question.id]) return "";
  const answer = state.answers[question.id];
  const correct = answer === question.gabarito;
  return `<section class="feedback ${correct ? "good" : "bad"}" role="status" aria-live="polite" tabindex="-1" data-feedback><h3>${correct ? "✓ Resposta correta" : "✕ Resposta incorreta"}</h3><p>Você marcou <strong>${esc(answer || "em branco")}</strong>. Gabarito: <strong>${esc(question.gabarito)}</strong>.</p><p>${esc(question.comentario || "Comentário não disponível.")}</p>${question.fundamento ? `<p><strong>Fundamento:</strong> ${esc(question.fundamento)}</p>` : ""}${question.pegadinha ? `<p><strong>Pegadinha:</strong> ${esc(question.pegadinha)}</p>` : ""}</section>`;
}

function mapButton(question, index) {
  const current = index === state.current;
  const answered = Boolean(state.answers[question.id]);
  const flagged = Boolean(state.flagged[question.id]);
  let classes = "map-btn";
  if (current) classes += " current";
  if (answered) classes += " answered";
  if (flagged) classes += " flagged";
  if (state.mode === "treino" && state.confirmed[question.id]) classes += state.answers[question.id] === question.gabarito ? " correct" : " incorrect";
  const labels = [`Questão ${index + 1}`, current ? "atual" : "", answered ? "respondida" : "não respondida", flagged ? "marcada para revisão" : ""].filter(Boolean).join(", ");
  return `<button class="${classes}" data-jump="${index}" aria-label="${esc(labels)}" ${current ? 'aria-current="step"' : ""}>${index + 1}</button>`;
}

function renderQuestion() {
  const question = state.questions[state.current];
  if (!question) return finishAttempt();
  const answered = Object.values(state.answers).filter(Boolean).length;
  const confirmed = Object.keys(state.confirmed).length;
  const progress = (state.current + 1) / state.questions.length * 100;
  const isLast = state.current === state.questions.length - 1;
  app.innerHTML = `<section class="exam-layout"><article class="question-card card"><header class="exam-header"><div><p class="eyebrow">${state.mode === "treino" ? "Modo treino" : "Modo prova"} · Questão ${state.current + 1} de ${state.questions.length}</p><small>${esc(question._discipline || question.assunto || state.material.disciplina)}</small></div><div class="timer" aria-label="Tempo total">◷ <span data-total-time>${formatTime(totalElapsed())}</span></div></header><div class="progress" aria-hidden="true"><span style="width:${progress}%"></span></div>${question.texto_base ? `<div class="text-base">${esc(question.texto_base)}</div>` : ""}<h1 class="question-title">${esc(question.enunciado)}</h1><fieldset class="options"><legend class="sr-only">Alternativas da questão</legend>${Object.entries(question.alternativas || {}).map(([letter, text]) => `<label class="${optionClass(question, letter)}"><input type="radio" name="answer" value="${letter}" ${state.answers[question.id] === letter ? "checked" : ""} ${state.confirmed[question.id] ? "disabled" : ""}><span class="letter">${letter}</span>${letter === text && (letter === "Certo" || letter === "Errado") ? "" : `<span>${esc(text)}</span>`}</label>`).join("")}</fieldset>${feedback(question)}<footer class="exam-actions"><div class="actions"><button class="btn" data-prev ${state.current === 0 ? "disabled" : ""}>Anterior</button><button class="btn" data-flag aria-pressed="${Boolean(state.flagged[question.id])}">${state.flagged[question.id] ? "★ Marcada" : "☆ Marcar para revisão"}</button></div><div class="actions">${state.mode === "treino" && !state.confirmed[question.id] ? `<button class="btn primary" data-confirm ${state.answers[question.id] ? "" : "disabled"}>Confirmar resposta</button>` : ""}<button class="btn primary" data-next>${isLast ? "Finalizar" : "Próxima"}</button></div></footer></article><aside class="exam-side card"><div><p class="eyebrow">Navegação</p><h2>Mapa de questões</h2></div><div class="question-map">${state.questions.map(mapButton).join("")}</div><div class="side-stats"><div><span>Respondidas</span><strong>${answered}/${state.questions.length}</strong></div>${state.mode === "treino" ? `<div><span>Confirmadas</span><strong>${confirmed}</strong></div>` : ""}<div><span>Nesta questão</span><strong data-question-time>${formatTime(currentQuestionElapsed())}</strong></div></div><div class="legend"><span><i class="legend-current"></i>Atual</span><span><i class="legend-answered"></i>Respondida</span><span><i class="legend-flagged"></i>Revisar</span></div><button class="btn full" data-save-exit>Salvar e sair</button><button class="btn danger full" data-abandon>Abandonar tentativa</button></aside></section>`;
  bindQuestionEvents(question);
  updateShell();
}

function toggleMarked(question) {
  const marked = loadMarked();
  if (state.flagged[question.id]) {
    marked[question.id] = {id: question.id, materialId: question._materialId || state.material.id, discipline: question._discipline || state.material.disciplina, assunto: question.assunto || "", markedAt: new Date().toISOString()};
  } else delete marked[question.id];
  saveMarked(marked);
}

function bindQuestionEvents(question) {
  document.querySelectorAll('input[name="answer"]').forEach(input => input.addEventListener("change", () => {
    state.answers[question.id] = input.value;
    saveSession();
    renderQuestion();
    requestAnimationFrame(() => document.querySelector(`input[name="answer"][value="${input.value}"]`)?.focus());
  }));
  document.querySelector("[data-confirm]")?.addEventListener("click", () => {
    if (!state.answers[question.id]) return;
    state.confirmed[question.id] = true;
    saveSession();
    renderQuestion();
    requestAnimationFrame(() => document.querySelector("[data-feedback]")?.focus());
  });
  document.querySelector("[data-prev]")?.addEventListener("click", () => navigateQuestion(state.current - 1));
  document.querySelector("[data-next]")?.addEventListener("click", () => {
    if (state.mode === "treino" && state.answers[question.id] && !state.confirmed[question.id]) return;
    if (state.current === state.questions.length - 1) {
      const blanks = state.questions.filter(item => !state.answers[item.id]).length;
      if (blanks && !confirm(`Há ${blanks} questão(ões) em branco. Deseja finalizar mesmo assim?`)) return;
      finishAttempt();
    } else navigateQuestion(state.current + 1);
  });
  document.querySelector("[data-flag]")?.addEventListener("click", () => {
    state.flagged[question.id] = !state.flagged[question.id];
    toggleMarked(question);
    saveSession();
    renderQuestion();
  });
  document.querySelectorAll("[data-jump]").forEach(button => button.addEventListener("click", () => navigateQuestion(Number(button.dataset.jump))));
  document.querySelector("[data-save-exit]")?.addEventListener("click", () => { trackQuestionTime(); saveSession(); stopTimer(); go("inicio"); });
  document.querySelector("[data-abandon]")?.addEventListener("click", () => { if (!confirm("Abandonar esta tentativa e apagar o progresso salvo?")) return; clearSession(); stopTimer(); go("estudar"); });
}

function navigateQuestion(index) {
  if (index < 0 || index >= state.questions.length) return;
  trackQuestionTime();
  state.current = index;
  state.questionStartedAt = Date.now();
  saveSession();
  renderQuestion();
}

function updateErrorBook(results) {
  const errors = loadErrors();
  results.forEach(result => {
    const question = result.question;
    const current = errors[question.id] || {id: question.id, count: 0};
    if (!result.answer) return;
    errors[question.id] = {
      ...current,
      materialId: question._materialId || state.material.id,
      discipline: question._discipline || state.material.disciplina,
      assunto: question.assunto || "",
      count: result.correct ? current.count : current.count + 1,
      open: !result.correct,
      updatedAt: new Date().toISOString(),
    };
  });
  saveErrors(errors);
}

function finishAttempt() {
  trackQuestionTime();
  stopTimer();
  state.elapsedBase = totalElapsed();
  state.startedAt = null;
  state.questionStartedAt = null;
  const results = state.questions.map(question => {
    const answer = state.answers[question.id] || null;
    return {question, answer, correct: Boolean(answer) && answer === question.gabarito};
  });
  const correct = results.filter(item => item.correct).length;
  const blank = results.filter(item => !item.answer).length;
  const wrong = results.length - correct - blank;
  const answered = results.length - blank;
  const percent = Math.round(correct / results.length * 1000) / 10;
  const accuracy = answered ? Math.round(correct / answered * 1000) / 10 : 0;
  updateErrorBook(results);
  const presentedQuestionIds = results.map(item => item.question.id);
  const answeredQuestionIds = results.filter(item => item.answer).map(item => item.question.id);
  const attempt = {
    id: crypto.randomUUID?.() || String(Date.now()),
    profileId: activeProfile().id,
    materialId: state.material.id,
    materialName: state.material.nome,
    mode: state.mode,
    finishedAt: new Date().toISOString(),
    elapsed: Math.round(state.elapsedBase),
    total: results.length,
    answered,
    correct,
    wrong,
    blank,
    percent,
    accuracy,
    presentedQuestionIds,
    answeredQuestionIds,
    questionIds: answeredQuestionIds,
    questionResults: results.map(item => ({id: item.question.id, answer: item.answer, correct: item.correct, materialId: item.question._materialId || state.material.id, discipline: item.question._discipline || state.material.disciplina, assunto: item.question.assunto || ""})),
    answers: state.answers,
    questionTimes: Object.fromEntries(Object.entries(state.questionTimes).map(([id, seconds]) => [id, Math.round(seconds)])),
  };
  saveHistory(attempt);
  clearSession();
  state.route = "resultado";
  history.replaceState(null, "", "#/resultado");
  renderResults(results, attempt);
}

function resultOption(question, answer, letter, text) {
  const classes = ["result-option"];
  if (letter === question.gabarito) classes.push("correct");
  if (letter === answer) classes.push("selected");
  if (letter === answer && letter !== question.gabarito) classes.push("incorrect");
  const label = [letter === answer ? "Sua resposta" : "", letter === question.gabarito ? "Gabarito" : ""].filter(Boolean).join(" · ");
  return `<li class="${classes.join(" ")}" data-answer="${esc(letter)}"><span class="letter">${letter}</span>${letter === text && (letter === "Certo" || letter === "Errado") ? "" : `<span>${esc(text)}</span>`}${label ? `<small>${label}</small>` : ""}</li>`;
}

function resultQuestion(item, index) {
  const {question, answer, correct} = item;
  const marked = Boolean(loadMarked()[question.id]);
  return `<article class="result-question card"><header><div><span class="question-index">${index + 1}</span><strong>${esc(question.assunto || question._discipline || state.material.disciplina)}</strong></div><span class="result-status ${correct ? "good" : "bad"}">${correct ? "Correta" : answer ? "Incorreta" : "Em branco"}</span></header>${question.texto_base ? `<details class="result-text-base"><summary>Exibir texto-base</summary><div class="text-base">${esc(question.texto_base)}</div></details>` : ""}<h3>${esc(question.enunciado)}</h3><ol class="result-options">${Object.entries(question.alternativas || {}).map(([letter, text]) => resultOption(question, answer, letter, text)).join("")}</ol><div class="result-explanation"><p><strong>Comentário:</strong> ${esc(question.comentario || "Comentário não disponível.")}</p>${question.fundamento ? `<p class="foundation"><strong>Fundamento:</strong> ${esc(question.fundamento)}</p>` : ""}${question.pegadinha ? `<p class="trap"><strong>Pegadinha:</strong> ${esc(question.pegadinha)}</p>` : ""}<p><strong>Tempo:</strong> ${formatTime(state.questionTimes[question.id] || 0)}</p></div><button class="btn compact" data-result-mark="${esc(question.id)}" data-material-id="${esc(question._materialId || state.material.id)}">${marked ? "★ Remover das marcadas" : "☆ Marcar para revisar"}</button></article>`;
}

function renderResults(results, attempt) {
  const reviewQuestions = results.filter(item => item.answer && !item.correct).map(item => item.question);
  app.innerHTML = `<section class="result-hero card"><p class="eyebrow">Tentativa concluída · ${esc(activeProfile().name)}</p><div class="result-head"><div><h1>${attempt.percent}% de pontuação</h1><p>${esc(attempt.materialName)} · ${attempt.mode === "treino" ? "Modo treino" : "Modo prova"} · ${attempt.accuracy}% de precisão entre respondidas</p></div><div class="result-grade">${attempt.percent >= 80 ? "Desempenho forte" : attempt.percent >= 60 ? "Em consolidação" : "Revisão necessária"}</div></div><div class="summary-grid"><div><small>Acertos</small><strong>${attempt.correct}</strong></div><div><small>Erros</small><strong>${attempt.wrong}</strong></div><div><small>Em branco</small><strong>${attempt.blank}</strong></div><div><small>Tempo total</small><strong>${formatTime(attempt.elapsed)}</strong></div></div><div class="actions result-actions"><button class="btn primary" data-route="inicio">Ir para o início</button>${reviewQuestions.length ? `<button class="btn" data-retry>Refazer erradas</button>` : ""}<button class="btn" data-route="desempenho">Ver desempenho</button></div></section><section class="section"><div class="section-head"><div><p class="eyebrow">Correção detalhada</p><h2>Alternativas, comentários e fundamentos</h2></div></div><div class="result-list">${results.map(resultQuestion).join("")}</div></section>`;
  document.querySelector("[data-retry]")?.addEventListener("click", async () => {
    if (!await ensureCanStartNewAttempt()) return;
    const material = {id: "revisao-pos-prova", nome: "Revisão das questões erradas", disciplina: "Múltiplas matérias", fonte: "Resultado da tentativa", tipo_material: "simulado", ano: 2026, codigo_cargo: "multicargo", tempo_sugerido_minutos: reviewQuestions.length * 2};
    beginAttempt("treino", reviewQuestions, material);
  });
  document.querySelectorAll("[data-result-mark]").forEach(button => button.addEventListener("click", () => {
    const marked = loadMarked();
    const id = button.dataset.resultMark;
    if (marked[id]) delete marked[id];
    else {
      const question = results.find(item => item.question.id === id)?.question;
      marked[id] = {id, materialId: button.dataset.materialId, discipline: question?._discipline || state.material.disciplina, assunto: question?.assunto || "", markedAt: new Date().toISOString()};
    }
    saveMarked(marked);
    button.textContent = marked[id] ? "★ Remover das marcadas" : "☆ Marcar para revisar";
  }));
  updateShell();
}

function openErrorItems() {
  return Object.values(loadErrors()).filter(item => item.open).sort((a, b) => b.count - a.count || new Date(b.updatedAt) - new Date(a.updatedAt));
}

function renderReview() {
  stopTimer();
  const errors = openErrorItems();
  const marked = Object.values(loadMarked());
  const grouped = new Map();
  errors.forEach(item => {
    const key = item.materialId || "outros";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });
  app.innerHTML = `<section class="page-heading"><div><p class="eyebrow">Revisar</p><h1>Transforme erros em acertos.</h1><p>Questões em branco não entram no caderno de erros; apenas respostas efetivamente erradas.</p></div><button class="btn" data-route="inicio">← Início</button></section><section class="review-summary metrics dashboard-metrics"><article class="metric card"><small>Erros pendentes</small><strong>${errors.length}</strong><span>saem da fila quando você acerta</span></article><article class="metric card"><small>Questões marcadas</small><strong>${marked.length}</strong><span>salvas para revisão manual</span></article><article class="metric card"><small>Erros recorrentes</small><strong>${errors.filter(item => item.count > 1).length}</strong><span>erradas mais de uma vez</span></article><article class="metric card"><small>Matérias afetadas</small><strong>${new Set(errors.map(item => item.discipline).filter(Boolean)).size}</strong><span>áreas com revisão aberta</span></article></section><section class="review-actions section"><article class="card review-priority"><div><p class="eyebrow">Revisão inteligente</p><h2>As 10 mais críticas</h2><p>Ordenadas pela quantidade de erros e pela recência.</p></div><button class="btn primary" data-review-critical ${errors.length ? "" : "disabled"}>Começar revisão</button></article><article class="card review-priority"><div><p class="eyebrow">Marcadas</p><h2>Revisão voluntária</h2><p>Questões que você marcou durante os treinos.</p></div><button class="btn" data-review-marked ${marked.length ? "" : "disabled"}>Revisar marcadas</button></article></section><section class="section"><div class="section-head"><div><p class="eyebrow">Caderno de erros</p><h2>Por material</h2></div></div>${grouped.size ? `<div class="review-list">${[...grouped.entries()].map(([materialId, items]) => reviewGroup(materialId, items)).join("")}</div>` : `<div class="empty-state card"><div class="empty-icon">✓</div><h3>Seu caderno de erros está vazio.</h3><p>Continue resolvendo questões. As respostas erradas aparecerão aqui automaticamente.</p></div>`}</section>`;
  document.querySelector("[data-review-critical]")?.addEventListener("click", () => startReviewByIds(errors.slice(0, 10).map(item => item.id)));
  document.querySelector("[data-review-marked]")?.addEventListener("click", () => startReviewByIds(marked.map(item => item.id)));
  document.querySelectorAll("[data-review-group]").forEach(button => button.addEventListener("click", () => startReviewByMaterial(button.dataset.reviewGroup)));
}

function reviewGroup(materialId, items) {
  const material = materialById(materialId);
  const recurring = items.filter(item => item.count > 1).length;
  return `<article class="review-row card"><div><p class="discipline">${esc(material?.disciplina || items[0]?.discipline || "Revisão")}</p><h3>${esc(material?.nome || "Treino personalizado")}</h3><small>${items.length} pendente(s) · ${recurring} recorrente(s)</small></div><button class="btn" data-review-group="${esc(materialId)}">Revisar</button></article>`;
}

async function startReviewByIds(ids) {
  if (!ids?.length) return;
  if (!await ensureCanStartNewAttempt()) return;
  renderLoading("Preparando sua revisão…");
  try {
    const questions = await loadQuestionsByIds(ids);
    if (!questions.length) return renderRuntimeError("As questões selecionadas ainda não estão disponíveis no pacote publicado.", "revisar");
    const material = {id: "revisao-personalizada", nome: "Revisão personalizada", disciplina: "Múltiplas matérias", fonte: "Caderno de erros", tipo_material: "simulado", ano: 2026, codigo_cargo: "multicargo", tempo_sugerido_minutos: questions.length * 2};
    beginAttempt("treino", questions, material);
  } catch (error) {
    console.error(error);
    renderRuntimeError("Não foi possível preparar a revisão.", "revisar");
  }
}

function startReviewByMaterial(materialId) {
  const ids = openErrorItems().filter(item => item.materialId === materialId).map(item => item.id);
  startReviewByIds(ids);
}

function performanceByDiscipline() {
  const aggregates = new Map();
  loadHistory().forEach(attempt => (attempt.questionResults || []).forEach(result => {
    if (Object.hasOwn(result, "answer") && !result.answer) return;
    const discipline = result.discipline || "Sem classificação";
    const current = aggregates.get(discipline) || {total: 0, correct: 0};
    current.total += 1;
    if (result.correct) current.correct += 1;
    aggregates.set(discipline, current);
  }));
  return [...aggregates.entries()].map(([discipline, values]) => ({discipline, ...values, percent: values.total ? Math.round(values.correct / values.total * 1000) / 10 : 0})).sort((a, b) => b.total - a.total);
}

function performanceBySubject() {
  const aggregates = new Map();
  loadHistory().forEach(attempt => (attempt.questionResults || []).forEach(result => {
    if (Object.hasOwn(result, "answer") && !result.answer) return;
    const subject = result.assunto || result.discipline || "Sem classificação";
    const current = aggregates.get(subject) || {total: 0, correct: 0};
    current.total += 1;
    if (result.correct) current.correct += 1;
    aggregates.set(subject, current);
  }));
  return [...aggregates.entries()].map(([subject, values]) => ({subject, ...values, percent: values.total ? Math.round(values.correct / values.total * 1000) / 10 : 0})).filter(item => item.total >= 2).sort((a, b) => a.percent - b.percent || b.total - a.total).slice(0, 8);
}

function exportProfileData() {
  const profile = activeProfile();
  const payload = {
    schema_version: "1.0",
    exported_at: new Date().toISOString(),
    profile,
    history: loadHistory(),
    errors: loadErrors(),
    marked: loadMarked(),
    session: loadSession(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sedes-questoes-${profile.id}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Backup do perfil gerado.", "success");
}

async function importProfileData(file) {
  try {
    const payload = JSON.parse(await file.text());
    if (payload.schema_version !== "1.0" || !Array.isArray(payload.history) || typeof payload.errors !== "object" || typeof payload.marked !== "object") throw new Error("Formato inválido.");
    if (!confirm(`Importar este backup para o perfil ${activeProfile().name}? Os dados atuais serão substituídos.`)) return;
    writeJSON(profileKey("history"), payload.history);
    writeJSON(profileKey("errors"), payload.errors);
    writeJSON(profileKey("marked"), payload.marked);
    if (payload.session) writeJSON(profileKey("session"), payload.session); else clearSession();
    showToast("Backup importado com sucesso.", "success");
    renderPerformance();
  } catch (error) {
    console.error(error);
    showToast("O arquivo não é um backup válido desta plataforma.", "error");
  }
}

function clearProfileData() {
  if (!confirm(`Apagar histórico, erros, marcadas e tentativa salva de ${activeProfile().name}?`)) return;
  for (const suffix of ["history", "errors", "marked", "session"]) localStorage.removeItem(profileKey(suffix));
  showToast("Dados locais do perfil apagados.", "success");
  renderPerformance();
}

function renderPerformance() {
  stopTimer();
  const stats = aggregateStats();
  const history = loadHistory();
  const disciplines = performanceByDiscipline();
  const weakSubjects = performanceBySubject();
  const coverage = state.catalog.summary.questoes ? Math.min(100, Math.round(stats.unique / state.catalog.summary.questoes * 1000) / 10) : 0;
  app.innerHTML = `<section class="page-heading"><div><p class="eyebrow">Desempenho · ${esc(activeProfile().name)}</p><h1>Seu progresso em números.</h1><p>Cobertura considera apenas questões efetivamente respondidas, não itens deixados em branco.</p></div><button class="btn" data-route="inicio">← Início</button></section><section class="performance-hero card"><div><span>Cobertura do acervo</span><strong>${coverage}%</strong><small>${stats.unique} de ${state.catalog.summary.questoes} questões publicadas efetivamente respondidas</small></div><div class="coverage-ring" style="--coverage:${coverage * 3.6}deg"><span>${coverage}%</span></div></section><section class="metrics dashboard-metrics"><article class="metric card"><small>Precisão</small><strong>${stats.accuracy}%</strong><span>${stats.correct}/${stats.answered || 0} respostas corretas</span></article><article class="metric card"><small>Tentativas</small><strong>${stats.completed}</strong><span>concluídas por ${esc(activeProfile().name)}</span></article><article class="metric card"><small>Tempo acumulado</small><strong>${formatTime(stats.elapsed)}</strong><span>em tentativas finalizadas</span></article><article class="metric card"><small>Pendências</small><strong>${stats.openErrors}</strong><span>questões no caderno de erros</span></article></section><section class="two-col section"><article class="card performance-panel"><p class="eyebrow">Por matéria</p><h2>Precisão acumulada</h2>${disciplines.length ? `<div class="discipline-bars">${disciplines.map(item => `<div class="discipline-bar"><div><strong>${esc(item.discipline)}</strong><span>${item.correct}/${item.total} · ${item.percent}%</span></div><div class="bar-track"><span style="width:${item.percent}%"></span></div></div>`).join("")}</div>` : `<p class="muted">As estatísticas aparecerão após novas tentativas.</p>`}</article><article class="card performance-panel"><p class="eyebrow">Pontos de atenção</p><h2>Assuntos com menor precisão</h2>${weakSubjects.length ? `<div class="weak-list">${weakSubjects.map(item => `<div><strong>${esc(item.subject)}</strong><span>${item.percent}% · ${item.total} respostas</span></div>`).join("")}</div>` : `<p class="muted">Resolva ao menos duas questões de um assunto para gerar este diagnóstico.</p>`}</article></section><section class="two-col section"><article class="card performance-panel"><p class="eyebrow">Histórico</p><h2>Tentativas recentes</h2>${history.length ? `<div class="history-list">${history.slice(0, 10).map(historyRow).join("")}</div>` : `<p class="muted">Nenhuma tentativa concluída neste perfil.</p>`}</article><article class="card performance-panel"><p class="eyebrow">Segurança dos dados</p><h2>Backup local</h2><p class="muted">Exporte o progresso antes de trocar de aparelho ou limpar o navegador.</p><div class="backup-actions"><button class="btn primary" data-export-profile>Exportar progresso</button><label class="btn file-button">Importar backup<input type="file" accept="application/json" data-import-profile></label><button class="btn danger" data-clear-profile>Apagar dados do perfil</button></div></article></section>`;
  document.querySelector("[data-export-profile]")?.addEventListener("click", exportProfileData);
  document.querySelector("[data-import-profile]")?.addEventListener("change", event => event.target.files?.[0] && importProfileData(event.target.files[0]));
  document.querySelector("[data-clear-profile]")?.addEventListener("click", clearProfileData);
}

function historyRow(item) {
  const answered = answeredIdsForAttempt(item).length;
  return `<div class="history-item"><div><strong>${esc(item.materialName)}</strong><small>${new Date(item.finishedAt).toLocaleString("pt-BR")} · ${item.mode === "treino" ? "Treino" : "Prova"}</small></div><div class="history-score"><strong>${Number(item.percent || 0).toLocaleString("pt-BR")}%</strong><small>${item.correct}/${item.total} · ${answered} respondidas · ${formatTime(item.elapsed)}</small></div></div>`;
}

function renderProfiles() {
  stopTimer();
  const profiles = loadProfiles();
  const active = activeProfile();
  app.innerHTML = `<section class="page-heading"><div><p class="eyebrow">Perfis locais</p><h1>Quem está estudando?</h1><p>Cada perfil possui histórico, erros, marcadas e progresso próprios neste aparelho. Os cargos são prioridades, não restrições.</p></div><button class="btn" data-route="inicio">← Início</button></section><section class="profile-grid section">${profiles.map(profile => profileCard(profile, profile.id === active.id)).join("")}</section><section class="privacy-note card"><strong>Privacidade local</strong><p>Não há login ou envio de dados pessoais. Use a opção de backup em Desempenho antes de trocar de navegador ou aparelho.</p></section>`;
  document.querySelectorAll("[data-activate-profile]").forEach(button => button.addEventListener("click", () => setActiveProfile(button.dataset.activateProfile)));
  document.querySelectorAll(".profile-card-selectable").forEach(card => {
    card.addEventListener("click", event => { if (!event.target.closest("button")) setActiveProfile(card.dataset.profileId); });
    card.addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); setActiveProfile(card.dataset.profileId); } });
  });
}

function profileCard(profile, isActive) {
  return `<article class="profile-card card ${isActive ? "active" : "profile-card-selectable"}" data-profile-id="${esc(profile.id)}" ${isActive ? "" : 'tabindex="0" role="button"'}><div class="profile-card-head"><span>${esc(profile.name.slice(0, 1).toUpperCase())}</span><div><p class="eyebrow">${isActive ? "Perfil ativo" : "Perfil local"}</p><h2>${esc(profile.name)}</h2></div></div><div class="profile-role-list"><span class="profile-role-title">Cargos prioritários</span>${profile.roles.map(code => `<div class="profile-role-item"><i aria-hidden="true">✓</i><span><strong>${esc(roleName(code))}</strong><small>Nível ${roleLevel(code) === "superior" ? "superior" : "médio"}</small></span></div>`).join("")}</div><button class="btn ${isActive ? "" : "primary"}" data-activate-profile="${esc(profile.id)}" ${isActive ? "disabled" : ""}>${isActive ? "Perfil em uso" : `Selecionar ${esc(profile.name)}`}</button></article>`;
}

function renderRoute() {
  updateShell();
  switch (state.route) {
    case "inicio": renderHome(); break;
    case "estudar": renderStudy(); break;
    case "revisar": renderReview(); break;
    case "desempenho": renderPerformance(); break;
    case "perfil": renderProfiles(); break;
    case "material": state.material ? renderMaterialDetail() : go("estudar"); break;
    case "resolver": loadSession() ? resumeSession() : go("inicio"); break;
    case "resultado": go("desempenho"); break;
    default: go("inicio");
  }
  window.scrollTo({top: 0, behavior: "auto"});
  focusMainHeading();
}

function renderLoading(message) {
  app.innerHTML = `<section class="card loading"><div class="spinner" aria-hidden="true"></div><h1>${esc(message)}</h1><p>Na primeira abertura, alguns materiais podem levar alguns segundos.</p></section>`;
  focusMainHeading();
}

function renderRuntimeError(message, returnRoute = "inicio") {
  app.innerHTML = `<section class="card error-state"><p class="eyebrow">Não foi possível concluir</p><h1>${esc(message)}</h1><button class="btn primary" data-return>Voltar</button></section>`;
  document.querySelector("[data-return]")?.addEventListener("click", () => go(returnRoute));
  focusMainHeading();
}

async function init() {
  try {
    migrateLegacyData();
    loadProfiles();
    const [catalogResponse, releaseMetaResponse, examResponse, studyIndexResponse] = await Promise.all([
      fetch(CATALOG_URL, {cache: "no-store"}),
      fetch(RELEASE_META_URL, {cache: "no-store"}),
      fetch(EXAM_URL, {cache: "no-store"}),
      fetch(STUDY_INDEX_URL, {cache: "no-store"}),
    ]);
    if (!catalogResponse.ok) throw new Error(`Catálogo: HTTP ${catalogResponse.status}`);
    if (!releaseMetaResponse.ok) throw new Error(`Metadados da release: HTTP ${releaseMetaResponse.status}`);
    if (!examResponse.ok) throw new Error(`Concurso: HTTP ${examResponse.status}`);
    if (!studyIndexResponse.ok) throw new Error(`Índice de estudos: HTTP ${studyIndexResponse.status}`);
    state.catalog = await catalogResponse.json();
    state.releaseMeta = await releaseMetaResponse.json();
    state.exam = await examResponse.json();
    state.studyIndex = await studyIndexResponse.json();
    const declaredQuestions = Number(state.catalog?.summary?.questoes);
    const declaredMaterials = Number(state.catalog?.summary?.materiais);
    const indexedQuestions = Object.keys(state.catalog?.question_index || {}).length;
    const listedMaterials = Array.isArray(state.catalog?.materials) ? state.catalog.materials.length : 0;
    if (!Number.isInteger(declaredQuestions) || declaredQuestions <= 0 ||
        !Number.isInteger(declaredMaterials) || declaredMaterials <= 0 ||
        declaredQuestions !== indexedQuestions || declaredMaterials !== listedMaterials) {
      throw new Error("Catálogo inconsistente.");
    }
    state.route = routeFromHash();
    syncLabel.textContent = `${state.releaseMeta.banco_mestre} no banco · ${state.releaseMeta.questions} publicadas`;
    profileButton?.addEventListener("click", () => go("perfil"));
    updateShell();
    renderRoute();
    window.setInterval(updateLiveCountdown, 60000);
  } catch (error) {
    console.error(error);
    syncLabel.textContent = "Falha no catálogo";
    app.replaceChildren(document.querySelector("#error-template").content.cloneNode(true));
  }
}

init();
