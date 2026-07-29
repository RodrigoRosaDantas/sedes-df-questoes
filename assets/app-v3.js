const CATALOG_URL = "./data/catalogo.json";
const EXAM_URL = "./data/concurso.json";
const THEME_KEY = "sedes.questoes.theme";
const PROFILES_KEY = "sedes.questoes.profiles.v3";
const ACTIVE_PROFILE_KEY = "sedes.questoes.activeProfile.v3";
const MIGRATION_KEY = "sedes.questoes.migrated.v3";
const LEGACY_HISTORY_KEY = "sedes.questoes.history.v2";
const LEGACY_ERROR_KEY = "sedes.questoes.errorbook.v2";
const MASTER_TOTAL_FALLBACK = 570;

const DEFAULT_PROFILES = [
  {id: "rodrigo", name: "Rodrigo", roles: ["202"]},
  {id: "amanda", name: "Amanda", roles: []},
  {id: "andressa", name: "Andressa", roles: []},
];

const app = document.querySelector("#app");
const themeToggle = document.querySelector("#theme-toggle");
const syncLabel = document.querySelector("#sync-label");
const profileButton = document.querySelector("#profile-button");
const profileButtonLabel = document.querySelector("#profile-button-label");

const state = {
  catalog: null,
  exam: null,
  bundle: null,
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
  filters: {type: "", discipline: "", cargo: "", search: "", scope: "all", count: 20, mode: "treino"},
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

const writeJSON = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const profileKey = suffix => `sedes.questoes.${activeProfile().id}.${suffix}.v3`;

function loadProfiles() {
  const saved = readJSON(PROFILES_KEY, DEFAULT_PROFILES);
  const profiles = DEFAULT_PROFILES.map(defaultProfile => {
    const current = saved.find(item => item.id === defaultProfile.id);
    return current ? {...defaultProfile, ...current, roles: Array.isArray(current.roles) ? current.roles : []} : defaultProfile;
  });
  writeJSON(PROFILES_KEY, profiles);
  return profiles;
}

function activeProfile() {
  const profiles = loadProfiles();
  const id = localStorage.getItem(ACTIVE_PROFILE_KEY) || profiles[0].id;
  return profiles.find(profile => profile.id === id) || profiles[0];
}

function setActiveProfile(id) {
  if (!loadProfiles().some(profile => profile.id === id)) return;
  localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  updateShell();
  renderRoute();
}

function updateProfile(profile) {
  const profiles = loadProfiles().map(item => item.id === profile.id ? profile : item);
  writeJSON(PROFILES_KEY, profiles);
  updateShell();
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

const loadHistory = () => readJSON(profileKey("history"), []);
const saveHistory = attempt => writeJSON(profileKey("history"), [attempt, ...loadHistory()].slice(0, 200));
const loadErrors = () => readJSON(profileKey("errors"), {});
const saveErrors = errors => writeJSON(profileKey("errors"), errors);
const loadMarked = () => readJSON(profileKey("marked"), {});
const saveMarked = marked => writeJSON(profileKey("marked"), marked);
const loadSession = () => readJSON(profileKey("session"), null);
const clearSession = () => localStorage.removeItem(profileKey("session"));

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
  return role ? `${role.carreira} ${role.codigo} — ${role.nome}` : `Cargo ${code}`;
};

function activeRoleLabel() {
  const roles = activeProfile().roles;
  if (!roles.length) return "Todos os cargos";
  return roles.map(roleName).join(" · ");
}

function updateShell() {
  const profile = activeProfile();
  if (profileButtonLabel) profileButtonLabel.textContent = profile.name;
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

function aggregateStats() {
  const history = loadHistory();
  const completed = history.length;
  const answered = history.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const correct = history.reduce((sum, item) => sum + Number(item.correct || 0), 0);
  const accuracy = answered ? Math.round(correct / answered * 1000) / 10 : 0;
  const elapsed = history.reduce((sum, item) => sum + Number(item.elapsed || 0), 0);
  const unique = new Set(history.flatMap(item => item.questionIds || []));
  const openErrors = Object.values(loadErrors()).filter(item => item.open).length;
  const marked = Object.keys(loadMarked()).length;
  return {completed, answered, correct, accuracy, elapsed, unique: unique.size, openErrors, marked};
}

function materialProgress(material) {
  const history = loadHistory().filter(item => item.materialId === material.id);
  const ids = new Set(history.flatMap(item => item.questionIds || []));
  const best = history.length ? Math.max(...history.map(item => Number(item.percent || 0))) : null;
  const progress = material.quantidade_questoes ? Math.min(100, Math.round(ids.size / material.quantidade_questoes * 100)) : 0;
  return {attempts: history.length, answered: ids.size, best, progress};
}

function relevantMaterials() {
  const roles = activeProfile().roles;
  if (!roles.length) return state.catalog.materials;
  const matching = state.catalog.materials.filter(material => roles.includes(String(material.codigo_cargo)));
  return matching.length ? matching : state.catalog.materials;
}

function renderCountdownCard() {
  const countdown = getCountdown();
  const roles = activeProfile().roles;
  const rolesText = roles.length ? roles.map(roleName).join(" · ") : "Cinco cargos acompanhados";
  return `<article class="dashboard-countdown card">
    <div>
      <p class="eyebrow">Prova SEDES/DF</p>
      <h2>${formatDate(state.exam.data_prova)}</h2>
      <p>${esc(rolesText)}</p>
    </div>
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
  const masterTotal = Number(state.catalog.summary.banco_mestre || MASTER_TOTAL_FALLBACK);
  const published = Number(state.catalog.summary.questoes || 0);
  const pending = Math.max(0, masterTotal - published);
  const greeting = session ? "Sua tentativa está salva." : stats.completed ? "Vamos manter a consistência." : "Vamos começar sua preparação.";

  app.innerHTML = `<section class="home-hero card">
    <div>
      <p class="eyebrow">Perfil ativo · ${esc(profile.name)}</p>
      <h1>${greeting}</h1>
      <p class="lead">${esc(activeRoleLabel())}. Seu histórico, caderno de erros e progresso ficam separados dos demais perfis neste aparelho.</p>
      <div class="hero-actions">
        ${session ? `<button class="btn primary" data-resume>Continuar de onde parou</button>` : `<button class="btn primary" data-quick-training>Começar treino rápido</button>`}
        <button class="btn" data-route="estudar">Escolher conteúdo</button>
      </div>
    </div>
    <div class="profile-orb"><span>${esc(profile.name.slice(0, 1).toUpperCase())}</span><small>${stats.accuracy}% geral</small></div>
  </section>

  ${renderCountdownCard()}

  <section class="bank-status card" aria-label="Situação do banco">
    <div><span>Banco Mestre</span><strong>${masterTotal}</strong><small>questões cadastradas no Notion</small></div>
    <div><span>Disponíveis no site</span><strong>${published}</strong><small>questões atualmente publicadas</small></div>
    <div><span>Próxima sincronização</span><strong>${pending}</strong><small>questões aguardando exportação integral</small></div>
  </section>

  <section class="metrics dashboard-metrics">
    <article class="metric card"><small>Questões resolvidas</small><strong>${stats.answered}</strong><span>${stats.unique} questões únicas identificadas</span></article>
    <article class="metric card"><small>Aproveitamento</small><strong>${stats.accuracy}%</strong><span>${stats.correct} acertos acumulados</span></article>
    <article class="metric card"><small>Revisão pendente</small><strong>${stats.openErrors}</strong><span>questões no caderno de erros</span></article>
    <article class="metric card"><small>Tempo de estudo</small><strong>${formatTime(stats.elapsed)}</strong><span>${stats.completed} tentativas concluídas</span></article>
  </section>

  <section class="home-actions-grid section">
    <button class="action-card card" data-route="estudar"><span>▣</span><div><strong>Estudar</strong><small>Monte treinos por disciplina, cargo e situação.</small></div></button>
    <button class="action-card card" data-route="revisar"><span>◎</span><div><strong>Revisar</strong><small>${stats.openErrors} erros e ${stats.marked} questões marcadas.</small></div></button>
    <button class="action-card card" data-route="desempenho"><span>◔</span><div><strong>Desempenho</strong><small>Acompanhe evolução, tempo e pontos fracos.</small></div></button>
  </section>

  <section class="section">
    <div class="section-head"><div><p class="eyebrow">Acesso rápido</p><h2>Materiais em destaque</h2><p>Conteúdos disponíveis para o perfil ativo.</p></div><button class="btn" data-route="estudar">Ver todos</button></div>
    <div class="material-grid compact-grid">${recentMaterials.map(materialCard).join("")}</div>
  </section>

  ${history.length ? `<section class="section"><div class="section-head"><div><p class="eyebrow">Última atividade</p><h2>Tentativas recentes</h2></div><button class="btn" data-route="desempenho">Histórico completo</button></div><div class="history-list">${history.slice(0, 3).map(historyRow).join("")}</div></section>` : ""}`;

  bindHomeEvents();
  updateLiveCountdown();
}

function bindHomeEvents() {
  document.querySelector("[data-quick-training]")?.addEventListener("click", () => startCustomTraining({count: 20, mode: "treino", scope: "all"}));
  document.querySelector("[data-resume]")?.addEventListener("click", resumeSession);
  bindMaterialButtons();
}

function getFilteredMaterials() {
  const query = state.filters.search.trim().toLocaleLowerCase("pt-BR");
  return state.catalog.materials.filter(material => {
    const typeOk = !state.filters.type || normalizeType(material.tipo_material) === state.filters.type;
    const disciplineOk = !state.filters.discipline || material.disciplina === state.filters.discipline;
    const cargoOk = !state.filters.cargo || String(material.codigo_cargo) === state.filters.cargo;
    const haystack = `${material.nome} ${material.disciplina} ${material.fonte} ${material.cargo} ${material.codigo_cargo}`.toLocaleLowerCase("pt-BR");
    return typeOk && disciplineOk && cargoOk && (!query || haystack.includes(query));
  });
}

function renderStudy() {
  stopTimer();
  const materials = getFilteredMaterials();
  const disciplines = [...new Set(state.catalog.materials.map(material => material.disciplina))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const cargos = [...new Set(state.catalog.materials.map(material => String(material.codigo_cargo)).filter(Boolean))];
  app.innerHTML = `<section class="page-heading">
    <div><p class="eyebrow">Estudar</p><h1>Monte sua próxima sessão.</h1><p>Combine cargo, disciplina, quantidade e situação das questões.</p></div>
    <button class="btn" data-route="inicio">← Início</button>
  </section>

  <section class="training-builder card">
    <div class="builder-head"><div><p class="eyebrow">Treino personalizado</p><h2>Configuração rápida</h2></div><span>${state.catalog.summary.questoes} questões disponíveis</span></div>
    <div class="builder-grid">
      <label><span>Cargo</span><select id="builder-cargo"><option value="">Todos os cargos</option>${cargos.map(code => `<option value="${esc(code)}" ${state.filters.cargo === code ? "selected" : ""}>${esc(roleName(code))}</option>`).join("")}</select></label>
      <label><span>Disciplina</span><select id="builder-discipline"><option value="">Todas as disciplinas</option>${disciplines.map(discipline => `<option ${state.filters.discipline === discipline ? "selected" : ""}>${esc(discipline)}</option>`).join("")}</select></label>
      <label><span>Situação</span><select id="builder-scope">
        <option value="all" ${state.filters.scope === "all" ? "selected" : ""}>Todas as questões</option>
        <option value="unanswered" ${state.filters.scope === "unanswered" ? "selected" : ""}>Somente inéditas</option>
        <option value="errors" ${state.filters.scope === "errors" ? "selected" : ""}>Somente erradas</option>
        <option value="marked" ${state.filters.scope === "marked" ? "selected" : ""}>Somente marcadas</option>
      </select></label>
      <label><span>Quantidade</span><select id="builder-count">${[10,20,30,50].map(count => `<option value="${count}" ${Number(state.filters.count) === count ? "selected" : ""}>${count} questões</option>`).join("")}</select></label>
      <label><span>Modo</span><select id="builder-mode"><option value="treino" ${state.filters.mode === "treino" ? "selected" : ""}>Treino com correção</option><option value="prova" ${state.filters.mode === "prova" ? "selected" : ""}>Simulação de prova</option></select></label>
      <button class="btn primary builder-submit" data-build-training>Montar treino</button>
    </div>
  </section>

  <section class="section">
    <div class="section-head"><div><p class="eyebrow">Catálogo</p><h2>Materiais disponíveis</h2><p>Escolha um simulado ou uma prova completa.</p></div><span class="stamp">Atualizado em ${new Date(state.catalog.exported_at).toLocaleString("pt-BR")}</span></div>
    <div class="catalog-toolbar card">
      <div class="tabs" role="tablist"><button class="tab ${state.filters.type === "" ? "active" : ""}" data-type="">Todos <b>${state.catalog.summary.materiais}</b></button><button class="tab ${state.filters.type === "simulado" ? "active" : ""}" data-type="simulado">Simulados <b>${state.catalog.summary.simulados}</b></button><button class="tab ${state.filters.type === "prova" ? "active" : ""}" data-type="prova">Provas <b>${state.catalog.summary.provas}</b></button></div>
      <label class="search"><span>⌕</span><input id="search-material" value="${esc(state.filters.search)}" placeholder="Buscar material, disciplina ou cargo"></label>
    </div>
    ${materials.length ? `<div class="material-grid">${materials.map(materialCard).join("")}</div>` : `<div class="empty-state card"><div class="empty-icon">⌕</div><h3>Nenhum material corresponde aos filtros.</h3><p>Altere o cargo, a disciplina ou a busca para ampliar os resultados.</p></div>`}
  </section>`;
  bindStudyEvents();
}

function materialCard(material) {
  const progress = materialProgress(material);
  const errorCount = Object.values(loadErrors()).filter(item => item.open && item.materialId === material.id).length;
  const status = progress.attempts ? `${progress.progress}% concluído` : "Não iniciado";
  return `<article class="material-card card">
    <div class="material-top"><span class="type-badge">${humanType(material.tipo_material)}</span><span class="year-badge">${material.ano}</span></div>
    <div><p class="discipline">${esc(material.disciplina)}</p><h3>${esc(material.nome)}</h3><p class="material-source">${esc(material.fonte)} · ${esc(roleName(material.codigo_cargo))}</p></div>
    <div class="material-progress"><div><span>${status}</span><b>${progress.best === null ? "—" : `${progress.best}% melhor nota`}</b></div><div class="progress"><span style="width:${progress.progress}%"></span></div></div>
    <div class="material-stats"><span><b>${material.quantidade_questoes}</b> questões</span><span><b>${material.tempo_sugerido_minutos}</b> min</span>${errorCount ? `<span class="error-count"><b>${errorCount}</b> erros</span>` : ""}</div>
    <div class="material-actions"><button class="btn primary" data-open-material="${esc(material.id)}">${progress.attempts ? "Continuar estudando" : "Abrir material"}</button>${errorCount ? `<button class="btn compact" data-review-material="${esc(material.id)}">Revisar erros</button>` : ""}</div>
  </article>`;
}

function bindStudyEvents() {
  document.querySelectorAll("[data-type]").forEach(button => button.addEventListener("click", () => { state.filters.type = button.dataset.type; renderStudy(); }));
  document.querySelector("#search-material")?.addEventListener("input", event => {
    state.filters.search = event.target.value;
    const cursor = event.target.selectionStart;
    renderStudy();
    const next = document.querySelector("#search-material");
    next?.focus(); next?.setSelectionRange(cursor, cursor);
  });
  ["cargo", "discipline", "scope", "count", "mode"].forEach(name => {
    document.querySelector(`#builder-${name}`)?.addEventListener("change", event => {
      state.filters[name] = name === "count" ? Number(event.target.value) : event.target.value;
      if (["cargo", "discipline"].includes(name)) renderStudy();
    });
  });
  document.querySelector("[data-build-training]")?.addEventListener("click", () => startCustomTraining());
  bindMaterialButtons();
}

function bindMaterialButtons() {
  document.querySelectorAll("[data-open-material]").forEach(button => button.addEventListener("click", () => openMaterial(button.dataset.openMaterial)));
  document.querySelectorAll("[data-review-material]").forEach(button => button.addEventListener("click", () => startReviewByMaterial(button.dataset.reviewMaterial)));
}

async function loadBundle() {
  if (state.bundle) return state.bundle;
  if (typeof DecompressionStream === "undefined") throw new Error("Este navegador não oferece suporte à descompactação do banco.");
  const response = await fetch(state.catalog.bundle, {cache: "no-store"});
  if (!response.ok) throw new Error(`Falha ao carregar o banco: HTTP ${response.status}`);
  const encoded = (await response.text()).trim();
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  state.bundle = JSON.parse(await new Response(stream).text());
  return state.bundle;
}

async function fetchMaterial(meta) {
  if (state.cache.has(meta.id)) return state.cache.get(meta.id);
  const bundle = await loadBundle();
  const material = bundle.materials.find(item => item.id === meta.id);
  if (!material) throw new Error(`Material não encontrado no banco: ${meta.id}`);
  material.questoes = material.questoes.map(question => ({...question, _materialId: material.id, _materialName: material.nome, _discipline: material.disciplina, _cargo: String(material.codigo_cargo)}));
  state.cache.set(meta.id, material);
  return material;
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
    renderRuntimeError("Não foi possível carregar este material.");
  }
}

function renderMaterialDetail() {
  const material = state.material;
  if (!material) return go("estudar");
  const progress = materialProgress(material);
  const errors = Object.values(loadErrors()).filter(item => item.open && item.materialId === material.id).length;
  app.innerHTML = `<section class="detail-hero card">
    <button class="back-link" data-route="estudar">← Voltar a Estudar</button>
    <div class="detail-grid"><div><div class="pills"><span class="pill">${humanType(material.tipo_material)}</span><span class="pill">${material.ano}</span><span class="pill">${esc(roleName(material.codigo_cargo))}</span></div><p class="eyebrow">${esc(material.disciplina)}</p><h1>${esc(material.nome)}</h1><p class="lead">Fonte: ${esc(material.fonte)}. Escolha como deseja resolver.</p></div>
    <div class="detail-summary"><div><small>Questões</small><strong>${material.questoes.length}</strong></div><div><small>Tempo sugerido</small><strong>${material.tempo_sugerido_minutos} min</strong></div><div><small>Melhor resultado</small><strong>${progress.best === null ? "—" : `${progress.best}%`}</strong></div><div><small>No caderno de erros</small><strong>${errors}</strong></div></div></div>
  </section>
  <section class="mode-grid section"><article class="mode-card card"><span class="mode-icon">✓</span><div><p class="eyebrow">Aprendizado guiado</p><h2>Modo treino</h2><p>Veja o gabarito e o comentário após confirmar cada resposta.</p></div><button class="btn primary" data-start="treino">Iniciar treino</button></article><article class="mode-card card"><span class="mode-icon">◷</span><div><p class="eyebrow">Simulação real</p><h2>Modo prova</h2><p>Resolva sem pistas e confira tudo somente no final.</p></div><button class="btn primary" data-start="prova">Iniciar prova</button></article>${errors ? `<article class="mode-card card accent"><span class="mode-icon">↻</span><div><p class="eyebrow">Revisão direcionada</p><h2>Caderno de erros</h2><p>Refaça as ${errors} questões pendentes deste material.</p></div><button class="btn" data-review-errors>Revisar erros</button></article>` : ""}</section>`;
  document.querySelectorAll("[data-start]").forEach(button => button.addEventListener("click", () => beginAttempt(button.dataset.start, material.questoes)));
  document.querySelector("[data-review-errors]")?.addEventListener("click", () => startReviewByMaterial(material.id));
}

function questionPoolStatus() {
  const answered = new Set(loadHistory().flatMap(item => item.questionIds || []));
  const errors = new Set(Object.values(loadErrors()).filter(item => item.open).map(item => item.id));
  const marked = new Set(Object.keys(loadMarked()));
  return {answered, errors, marked};
}

async function buildQuestionPool() {
  const materials = getFilteredMaterials();
  const all = [];
  for (const meta of materials) {
    const material = await fetchMaterial(meta);
    all.push(...material.questoes);
  }
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
  renderLoading("Montando seu treino personalizado…");
  try {
    const pool = await buildQuestionPool();
    const selected = shuffle(pool).slice(0, Math.min(Number(state.filters.count || 20), pool.length));
    if (!selected.length) return renderRuntimeError("Não há questões disponíveis para os filtros selecionados.", "estudar");
    state.selectedMeta = null;
    state.material = {id: "treino-personalizado", nome: "Treino personalizado — Banco SEDES/DF", disciplina: state.filters.discipline || "Múltiplas disciplinas", fonte: "Banco Mestre", tipo_material: "simulado", ano: 2026, codigo_cargo: state.filters.cargo || "multicargo", tempo_sugerido_minutos: selected.length * 2, questoes: selected};
    beginAttempt(state.filters.mode || "treino", selected);
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

function saveSession() {
  if (!state.questions.length || !state.material || !state.mode) return;
  writeJSON(profileKey("session"), {
    version: 3,
    material: state.material,
    questions: state.questions,
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

function resumeSession() {
  const session = loadSession();
  if (!session?.questions?.length) return go("estudar");
  state.material = session.material;
  state.questions = session.questions;
  state.mode = session.mode;
  state.current = Math.min(session.current || 0, session.questions.length - 1);
  state.answers = session.answers || {};
  state.confirmed = session.confirmed || {};
  state.flagged = session.flagged || {};
  state.elapsedBase = Number(session.elapsedBase || 0);
  state.questionTimes = session.questionTimes || {};
  state.startedAt = Date.now();
  state.questionStartedAt = Date.now();
  state.route = "resolver";
  history.replaceState(null, "", "#/resolver");
  startTimer();
  renderQuestion();
}

function beginAttempt(mode, questions) {
  if (!questions?.length) return;
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
  return `<section class="feedback ${correct ? "good" : "bad"}"><h3>${correct ? "✓ Resposta correta" : "✕ Resposta incorreta"}</h3><p>Você marcou <strong>${esc(answer || "em branco")}</strong>. Gabarito: <strong>${esc(question.gabarito)}</strong>.</p><p>${esc(question.comentario || "Comentário não disponível.")}</p>${question.fundamento ? `<p><strong>Fundamento:</strong> ${esc(question.fundamento)}</p>` : ""}${question.pegadinha ? `<p><strong>Pegadinha:</strong> ${esc(question.pegadinha)}</p>` : ""}</section>`;
}

function renderQuestion() {
  const question = state.questions[state.current];
  if (!question) return finishAttempt();
  const answered = Object.keys(state.answers).length;
  const confirmed = Object.keys(state.confirmed).length;
  const progress = (state.current + 1) / state.questions.length * 100;
  const isLast = state.current === state.questions.length - 1;
  app.innerHTML = `<section class="exam-layout"><article class="question-card card"><header class="exam-header"><div><p class="eyebrow">${state.mode === "treino" ? "Modo treino" : "Modo prova"} · Questão ${state.current + 1} de ${state.questions.length}</p><small>${esc(question._discipline || question.assunto || state.material.disciplina)}</small></div><div class="timer">◷ <span data-total-time>${formatTime(totalElapsed())}</span></div></header><div class="progress"><span style="width:${progress}%"></span></div>${question.texto_base ? `<div class="text-base">${esc(question.texto_base)}</div>` : ""}<h1 class="question-title">${esc(question.enunciado)}</h1><div class="options">${Object.entries(question.alternativas || {}).map(([letter, text]) => `<label class="${optionClass(question, letter)}"><input type="radio" name="answer" value="${letter}" ${state.answers[question.id] === letter ? "checked" : ""} ${state.confirmed[question.id] ? "disabled" : ""}><span class="letter">${letter}</span><span>${esc(text)}</span></label>`).join("")}</div>${feedback(question)}<footer class="exam-actions"><div class="actions"><button class="btn" data-prev ${state.current === 0 ? "disabled" : ""}>Anterior</button><button class="btn" data-flag>${state.flagged[question.id] ? "★ Marcada" : "☆ Marcar para revisão"}</button></div><div class="actions">${state.mode === "treino" && !state.confirmed[question.id] ? `<button class="btn primary" data-confirm ${state.answers[question.id] ? "" : "disabled"}>Confirmar resposta</button>` : ""}<button class="btn primary" data-next>${isLast ? "Finalizar" : "Próxima"}</button></div></footer></article><aside class="exam-side card"><div><p class="eyebrow">Navegação</p><h2>Mapa de questões</h2></div><div class="question-map">${state.questions.map((item, index) => mapButton(item, index)).join("")}</div><div class="side-stats"><div><span>Respondidas</span><strong>${answered}/${state.questions.length}</strong></div>${state.mode === "treino" ? `<div><span>Confirmadas</span><strong>${confirmed}</strong></div>` : ""}<div><span>Nesta questão</span><strong data-question-time>${formatTime(currentQuestionElapsed())}</strong></div></div><div class="legend"><span><i class="legend-current"></i>Atual</span><span><i class="legend-answered"></i>Respondida</span><span><i class="legend-flagged"></i>Revisar</span></div><button class="btn full" data-save-exit>Salvar e sair</button><button class="btn danger full" data-abandon>Abandonar tentativa</button></aside></section>`;
  bindQuestionEvents(question);
  updateShell();
}

function mapButton(question, index) {
  let classes = "map-btn";
  if (index === state.current) classes += " current";
  if (state.answers[question.id]) classes += " answered";
  if (state.flagged[question.id]) classes += " flagged";
  if (state.mode === "treino" && state.confirmed[question.id]) classes += state.answers[question.id] === question.gabarito ? " correct" : " incorrect";
  return `<button class="${classes}" data-jump="${index}">${index + 1}</button>`;
}

function toggleMarked(question) {
  const marked = loadMarked();
  if (state.flagged[question.id]) {
    marked[question.id] = {id: question.id, materialId: question._materialId || state.material.id, discipline: question._discipline || state.material.disciplina, assunto: question.assunto || "", markedAt: new Date().toISOString()};
  } else {
    delete marked[question.id];
  }
  saveMarked(marked);
}

function bindQuestionEvents(question) {
  document.querySelectorAll('input[name="answer"]').forEach(input => input.addEventListener("change", () => { state.answers[question.id] = input.value; saveSession(); renderQuestion(); }));
  document.querySelector("[data-confirm]")?.addEventListener("click", () => { if (!state.answers[question.id]) return; state.confirmed[question.id] = true; saveSession(); renderQuestion(); });
  document.querySelector("[data-prev]")?.addEventListener("click", () => navigateQuestion(state.current - 1));
  document.querySelector("[data-next]")?.addEventListener("click", () => {
    if (state.mode === "treino" && state.answers[question.id] && !state.confirmed[question.id]) return;
    if (state.current === state.questions.length - 1) {
      const blanks = state.questions.filter(item => !state.answers[item.id]).length;
      if (blanks && !confirm(`Há ${blanks} questão(ões) em branco. Deseja finalizar mesmo assim?`)) return;
      finishAttempt();
    } else navigateQuestion(state.current + 1);
  });
  document.querySelector("[data-flag]")?.addEventListener("click", () => { state.flagged[question.id] = !state.flagged[question.id]; toggleMarked(question); saveSession(); renderQuestion(); });
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
    return {question, answer, correct: answer === question.gabarito};
  });
  const correct = results.filter(item => item.correct).length;
  const blank = results.filter(item => !item.answer).length;
  const wrong = results.length - correct - blank;
  const percent = Math.round(correct / results.length * 1000) / 10;
  updateErrorBook(results);
  const attempt = {
    id: crypto.randomUUID?.() || String(Date.now()),
    profileId: activeProfile().id,
    materialId: state.material.id,
    materialName: state.material.nome,
    mode: state.mode,
    finishedAt: new Date().toISOString(),
    elapsed: Math.round(state.elapsedBase),
    total: results.length,
    correct, wrong, blank, percent,
    questionIds: results.map(item => item.question.id),
    questionResults: results.map(item => ({id: item.question.id, correct: item.correct, materialId: item.question._materialId || state.material.id, discipline: item.question._discipline || state.material.disciplina, assunto: item.question.assunto || ""})),
    answers: state.answers,
    questionTimes: Object.fromEntries(Object.entries(state.questionTimes).map(([id, seconds]) => [id, Math.round(seconds)])),
  };
  saveHistory(attempt);
  clearSession();
  state.route = "resultado";
  history.replaceState(null, "", "#/resultado");
  renderResults(results, attempt);
}

function renderResults(results, attempt) {
  const reviewQuestions = results.filter(item => !item.correct).map(item => item.question);
  app.innerHTML = `<section class="result-hero card"><p class="eyebrow">Tentativa concluída · ${esc(activeProfile().name)}</p><div class="result-head"><div><h1>${attempt.percent}% de aproveitamento</h1><p>${esc(attempt.materialName)} · ${attempt.mode === "treino" ? "Modo treino" : "Modo prova"}</p></div><div class="result-grade">${attempt.percent >= 80 ? "Desempenho forte" : attempt.percent >= 60 ? "Em consolidação" : "Revisão necessária"}</div></div><div class="summary-grid"><div><small>Acertos</small><strong>${attempt.correct}</strong></div><div><small>Erros</small><strong>${attempt.wrong}</strong></div><div><small>Em branco</small><strong>${attempt.blank}</strong></div><div><small>Tempo total</small><strong>${formatTime(attempt.elapsed)}</strong></div></div><div class="actions result-actions"><button class="btn primary" data-route="inicio">Ir para o início</button>${reviewQuestions.length ? `<button class="btn" data-retry>Refazer erradas</button>` : ""}<button class="btn" data-route="desempenho">Ver desempenho</button></div></section><section class="section"><div class="section-head"><div><p class="eyebrow">Correção detalhada</p><h2>Revisão das questões</h2></div></div><div class="result-list">${results.map((item, index) => resultQuestion(item, index)).join("")}</div></section>`;
  document.querySelector("[data-retry]")?.addEventListener("click", () => beginAttempt("treino", reviewQuestions));
  updateShell();
}

function resultQuestion(item, index) {
  const {question, answer, correct} = item;
  return `<article class="result-question card"><header><div><span class="question-index">${index + 1}</span><strong>${esc(question.assunto || question._discipline || state.material.disciplina)}</strong></div><span class="result-status ${correct ? "good" : "bad"}">${correct ? "Correta" : answer ? "Incorreta" : "Em branco"}</span></header><h3>${esc(question.enunciado)}</h3><p class="answer-line">Marcada: <strong>${esc(answer || "em branco")}</strong> · Gabarito: <strong>${esc(question.gabarito)}</strong></p><p>${esc(question.comentario || "")}</p>${question.fundamento ? `<p class="foundation"><strong>Fundamento:</strong> ${esc(question.fundamento)}</p>` : ""}${question.pegadinha ? `<p class="trap"><strong>Pegadinha:</strong> ${esc(question.pegadinha)}</p>` : ""}</article>`;
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
  app.innerHTML = `<section class="page-heading"><div><p class="eyebrow">Revisar</p><h1>Transforme erros em acertos.</h1><p>Priorize questões recorrentes, marcadas e conteúdos com menor domínio.</p></div><button class="btn" data-route="inicio">← Início</button></section>
  <section class="review-summary metrics dashboard-metrics"><article class="metric card"><small>Erros pendentes</small><strong>${errors.length}</strong><span>saem da fila quando você acerta</span></article><article class="metric card"><small>Questões marcadas</small><strong>${marked.length}</strong><span>salvas para revisão manual</span></article><article class="metric card"><small>Erros recorrentes</small><strong>${errors.filter(item => item.count > 1).length}</strong><span>erradas mais de uma vez</span></article><article class="metric card"><small>Disciplinas afetadas</small><strong>${new Set(errors.map(item => item.discipline).filter(Boolean)).size}</strong><span>áreas com revisão aberta</span></article></section>
  <section class="review-actions section"><article class="card review-priority"><div><p class="eyebrow">Revisão inteligente</p><h2>As 10 mais críticas</h2><p>Ordenadas pela quantidade de erros e pela recência.</p></div><button class="btn primary" data-review-critical ${errors.length ? "" : "disabled"}>Começar revisão</button></article><article class="card review-priority"><div><p class="eyebrow">Marcadas</p><h2>Revisão voluntária</h2><p>Questões que você marcou durante os treinos.</p></div><button class="btn" data-review-marked ${marked.length ? "" : "disabled"}>Revisar marcadas</button></article></section>
  <section class="section"><div class="section-head"><div><p class="eyebrow">Caderno de erros</p><h2>Por material</h2></div></div>${grouped.size ? `<div class="review-list">${[...grouped.entries()].map(([materialId, items]) => reviewGroup(materialId, items)).join("")}</div>` : `<div class="empty-state card"><div class="empty-icon">✓</div><h3>Seu caderno de erros está vazio.</h3><p>Continue resolvendo questões. Os erros aparecerão aqui automaticamente.</p></div>`}</section>`;
  document.querySelector("[data-review-critical]")?.addEventListener("click", () => startReviewByIds(errors.slice(0, 10).map(item => item.id)));
  document.querySelector("[data-review-marked]")?.addEventListener("click", () => startReviewByIds(marked.map(item => item.id)));
  document.querySelectorAll("[data-review-group]").forEach(button => button.addEventListener("click", () => startReviewByMaterial(button.dataset.reviewGroup)));
}

function reviewGroup(materialId, items) {
  const material = materialById(materialId);
  const recurring = items.filter(item => item.count > 1).length;
  return `<article class="review-row card"><div><p class="discipline">${esc(material?.disciplina || items[0]?.discipline || "Revisão")}</p><h3>${esc(material?.nome || "Treino personalizado")}</h3><small>${items.length} pendente(s) · ${recurring} recorrente(s)</small></div><button class="btn" data-review-group="${esc(materialId)}">Revisar</button></article>`;
}

async function allQuestionsMap() {
  const map = new Map();
  const bundle = await loadBundle();
  for (const meta of state.catalog.materials) {
    const material = bundle.materials.find(item => item.id === meta.id);
    if (!material) continue;
    material.questoes.forEach(question => map.set(question.id, {...question, _materialId: material.id, _materialName: material.nome, _discipline: material.disciplina, _cargo: String(material.codigo_cargo)}));
  }
  return map;
}

async function startReviewByIds(ids) {
  if (!ids?.length) return;
  renderLoading("Preparando sua revisão…");
  try {
    const map = await allQuestionsMap();
    const questions = ids.map(id => map.get(id)).filter(Boolean);
    if (!questions.length) return renderRuntimeError("As questões selecionadas ainda não estão disponíveis no pacote publicado.", "revisar");
    state.material = {id: "revisao-personalizada", nome: "Revisão personalizada", disciplina: "Múltiplas disciplinas", fonte: "Caderno de erros", tipo_material: "simulado", ano: 2026, codigo_cargo: "multicargo", tempo_sugerido_minutos: questions.length * 2, questoes: questions};
    beginAttempt("treino", questions);
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
    const discipline = result.discipline || "Sem classificação";
    const current = aggregates.get(discipline) || {total: 0, correct: 0};
    current.total += 1;
    if (result.correct) current.correct += 1;
    aggregates.set(discipline, current);
  }));
  return [...aggregates.entries()].map(([discipline, values]) => ({discipline, ...values, percent: values.total ? Math.round(values.correct / values.total * 1000) / 10 : 0})).sort((a, b) => b.total - a.total);
}

function renderPerformance() {
  stopTimer();
  const stats = aggregateStats();
  const history = loadHistory();
  const disciplines = performanceByDiscipline();
  const coverage = state.catalog.summary.questoes ? Math.min(100, Math.round(stats.unique / state.catalog.summary.questoes * 1000) / 10) : 0;
  app.innerHTML = `<section class="page-heading"><div><p class="eyebrow">Desempenho · ${esc(activeProfile().name)}</p><h1>Seu progresso em números.</h1><p>Dados salvos somente neste navegador e separados por perfil.</p></div><button class="btn" data-route="inicio">← Início</button></section>
  <section class="performance-hero card"><div><span>Cobertura do acervo</span><strong>${coverage}%</strong><small>${stats.unique} de ${state.catalog.summary.questoes} questões publicadas identificadas como resolvidas</small></div><div class="coverage-ring" style="--coverage:${coverage * 3.6}deg"><span>${coverage}%</span></div></section>
  <section class="metrics dashboard-metrics"><article class="metric card"><small>Aproveitamento</small><strong>${stats.accuracy}%</strong><span>${stats.correct}/${stats.answered || 0} respostas corretas</span></article><article class="metric card"><small>Tentativas</small><strong>${stats.completed}</strong><span>concluídas por ${esc(activeProfile().name)}</span></article><article class="metric card"><small>Tempo acumulado</small><strong>${formatTime(stats.elapsed)}</strong><span>em tentativas finalizadas</span></article><article class="metric card"><small>Pendências</small><strong>${stats.openErrors}</strong><span>questões no caderno de erros</span></article></section>
  <section class="two-col section"><article class="card performance-panel"><p class="eyebrow">Por disciplina</p><h2>Precisão acumulada</h2>${disciplines.length ? `<div class="discipline-bars">${disciplines.map(item => `<div class="discipline-bar"><div><strong>${esc(item.discipline)}</strong><span>${item.correct}/${item.total} · ${item.percent}%</span></div><div class="bar-track"><span style="width:${item.percent}%"></span></div></div>`).join("")}</div>` : `<p class="muted">As estatísticas por disciplina aparecerão após novas tentativas nesta versão.</p>`}</article><article class="card performance-panel"><p class="eyebrow">Histórico</p><h2>Tentativas recentes</h2>${history.length ? `<div class="history-list">${history.slice(0, 10).map(historyRow).join("")}</div>` : `<p class="muted">Nenhuma tentativa concluída neste perfil.</p>`}</article></section>`;
}

function historyRow(item) {
  return `<div class="history-item"><div><strong>${esc(item.materialName)}</strong><small>${new Date(item.finishedAt).toLocaleString("pt-BR")} · ${item.mode === "treino" ? "Treino" : "Prova"}</small></div><div class="history-score"><strong>${Number(item.percent || 0).toLocaleString("pt-BR")}%</strong><small>${item.correct}/${item.total} · ${formatTime(item.elapsed)}</small></div></div>`;
}

function renderProfiles() {
  stopTimer();
  const profiles = loadProfiles();
  const active = activeProfile();
  app.innerHTML = `<section class="page-heading"><div><p class="eyebrow">Perfis locais</p><h1>Quem está estudando?</h1><p>Cada perfil possui histórico, erros, marcadas e progresso próprios neste aparelho.</p></div><button class="btn" data-route="inicio">← Início</button></section>
  <section class="profile-grid section">${profiles.map(profile => profileCard(profile, profile.id === active.id)).join("")}</section>
  <section class="privacy-note card"><strong>Privacidade local</strong><p>Não há login ou envio de dados pessoais. Os perfis existem apenas no armazenamento deste navegador. Em outro aparelho, o histórico começa vazio.</p></section>`;
  document.querySelectorAll("[data-activate-profile]").forEach(button => button.addEventListener("click", () => setActiveProfile(button.dataset.activateProfile)));
  document.querySelectorAll("[data-profile-role]").forEach(input => input.addEventListener("change", () => {
    const profile = loadProfiles().find(item => item.id === input.dataset.profileRole);
    if (!profile) return;
    const roles = new Set(profile.roles);
    input.checked ? roles.add(input.value) : roles.delete(input.value);
    updateProfile({...profile, roles: [...roles]});
    renderProfiles();
  }));
}

function profileCard(profile, isActive) {
  const roles = state.exam.cargos || [];
  return `<article class="profile-card card ${isActive ? "active" : ""}"><div class="profile-card-head"><span>${esc(profile.name.slice(0, 1).toUpperCase())}</span><div><p class="eyebrow">${isActive ? "Perfil ativo" : "Perfil local"}</p><h2>${esc(profile.name)}</h2></div></div><fieldset><legend>Cargos acompanhados</legend>${roles.map(role => `<label class="role-choice"><input type="checkbox" data-profile-role="${esc(profile.id)}" value="${esc(role.codigo)}" ${profile.roles.includes(String(role.codigo)) ? "checked" : ""}><span><strong>${esc(role.carreira)} ${esc(role.codigo)} — ${esc(role.nome)}</strong><small>Nível ${esc(role.nivel)}</small></span></label>`).join("")}</fieldset><button class="btn ${isActive ? "" : "primary"}" data-activate-profile="${esc(profile.id)}" ${isActive ? "disabled" : ""}>${isActive ? "Em uso" : "Usar este perfil"}</button></article>`;
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
}

function renderLoading(message) {
  app.innerHTML = `<section class="card loading"><div class="spinner"></div><h1>${esc(message)}</h1><p>Isso pode levar alguns segundos na primeira abertura.</p></section>`;
}

function renderRuntimeError(message, returnRoute = "inicio") {
  app.innerHTML = `<section class="card error-state"><p class="eyebrow">Não foi possível concluir</p><h1>${esc(message)}</h1><button class="btn primary" data-return>Voltar</button></section>`;
  document.querySelector("[data-return]")?.addEventListener("click", () => go(returnRoute));
}

async function init() {
  try {
    migrateLegacyData();
    const [catalogResponse, examResponse] = await Promise.all([
      fetch(CATALOG_URL, {cache: "no-store"}),
      fetch(EXAM_URL, {cache: "no-store"}),
    ]);
    if (!catalogResponse.ok) throw new Error(`Catálogo: HTTP ${catalogResponse.status}`);
    if (!examResponse.ok) throw new Error(`Concurso: HTTP ${examResponse.status}`);
    state.catalog = await catalogResponse.json();
    state.exam = await examResponse.json();
    state.route = routeFromHash();
    syncLabel.textContent = `${state.catalog.summary.banco_mestre || MASTER_TOTAL_FALLBACK} no banco · ${state.catalog.summary.questoes} publicadas`;
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
