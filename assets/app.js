const CATALOG_URL = "./data/catalogo.json";
const HISTORY_KEY = "sedes.questoes.history.v2";
const ERROR_BOOK_KEY = "sedes.questoes.errorbook.v2";
const THEME_KEY = "sedes.questoes.theme";

const app = document.querySelector("#app");
const themeToggle = document.querySelector("#theme-toggle");
const syncLabel = document.querySelector("#sync-label");

const state = {
  catalog: null,
  cache: new Map(),
  bundle: null,
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
  subset: null,
  filters: {type: "simulado", discipline: "", search: ""},
};

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const formatTime = (seconds) => {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const readJSON = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
};

const loadHistory = () => readJSON(HISTORY_KEY, []);
const loadErrorBook = () => readJSON(ERROR_BOOK_KEY, {});
const saveHistory = (attempt) => {
  const history = [attempt, ...loadHistory()].slice(0, 100);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
};
const saveErrorBook = (book) => localStorage.setItem(ERROR_BOOK_KEY, JSON.stringify(book));

const totalElapsed = () => state.startedAt
  ? state.elapsedBase + (Date.now() - state.startedAt) / 1000
  : state.elapsedBase;

const stopTimer = () => {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
};

const currentQuestionElapsed = () => {
  const question = state.questions[state.current];
  if (!question) return 0;
  const stored = state.questionTimes[question.id] || 0;
  const active = state.questionStartedAt ? (Date.now() - state.questionStartedAt) / 1000 : 0;
  return stored + active;
};

const startTimer = () => {
  stopTimer();
  state.timerId = setInterval(() => {
    document.querySelectorAll("[data-total-time]").forEach(el => el.textContent = formatTime(totalElapsed()));
    document.querySelectorAll("[data-question-time]").forEach(el => el.textContent = formatTime(currentQuestionElapsed()));
  }, 250);
};

const trackQuestionTime = () => {
  if (!state.questionStartedAt) return;
  const question = state.questions[state.current];
  if (question) {
    state.questionTimes[question.id] = (state.questionTimes[question.id] || 0)
      + (Date.now() - state.questionStartedAt) / 1000;
  }
  state.questionStartedAt = Date.now();
};

const setTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
};
themeToggle.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
setTheme(localStorage.getItem(THEME_KEY) || "dark");

const normalizeType = value => String(value || "").toLowerCase();
const humanType = value => normalizeType(value) === "prova" ? "Prova anterior" : "Simulado";

function getFilteredMaterials() {
  const query = state.filters.search.trim().toLocaleLowerCase("pt-BR");
  return state.catalog.materials.filter(material => {
    const typeOk = !state.filters.type || normalizeType(material.tipo_material) === state.filters.type;
    const disciplineOk = !state.filters.discipline || material.disciplina === state.filters.discipline;
    const haystack = `${material.nome} ${material.disciplina} ${material.fonte} ${material.cargo}`.toLocaleLowerCase("pt-BR");
    const searchOk = !query || haystack.includes(query);
    return typeOk && disciplineOk && searchOk;
  });
}

function aggregateStats() {
  const history = loadHistory();
  const completed = history.length;
  const answered = history.reduce((sum, item) => sum + item.total, 0);
  const correct = history.reduce((sum, item) => sum + item.correct, 0);
  const accuracy = answered ? Math.round(correct / answered * 1000) / 10 : 0;
  const errorBook = loadErrorBook();
  const errors = Object.values(errorBook).reduce((sum, ids) => sum + ids.length, 0);
  return {completed, answered, accuracy, errors};
}

function renderCatalog() {
  stopTimer();
  state.mode = null;
  state.material = null;
  state.questions = [];
  const materials = getFilteredMaterials();
  const disciplines = [...new Set(state.catalog.materials.map(m => m.disciplina))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const stats = aggregateStats();
  const history = loadHistory().slice(0, 5);
  const isProofTab = state.filters.type === "prova";

  app.innerHTML = `
    <section class="hero card">
      <div class="hero-copy">
        <p class="eyebrow">Plataforma independente de questões</p>
        <h1>Treine com o banco editorial da SEDES/DF.</h1>
        <p class="lead">Questões organizadas por prova, simulado, disciplina e fonte. Somente itens com transcrição e gabarito conferidos entram neste catálogo.</p>
        <div class="hero-actions">
          <button class="btn primary" data-random>Treino aleatório de 20 questões</button>
          <button class="btn" data-scroll-catalog>Explorar materiais</button>
        </div>
      </div>
      <div class="hero-number"><strong>${state.catalog.summary.questoes}</strong><span>questões publicadas</span></div>
    </section>

    <section class="metrics">
      <article class="metric card"><small>Materiais</small><strong>${state.catalog.summary.materiais}</strong><span>${state.catalog.summary.simulados} simulados · ${state.catalog.summary.provas} provas</span></article>
      <article class="metric card"><small>Tentativas</small><strong>${stats.completed}</strong><span>salvas neste navegador</span></article>
      <article class="metric card"><small>Questões resolvidas</small><strong>${stats.answered}</strong><span>em tentativas concluídas</span></article>
      <article class="metric card"><small>Aproveitamento</small><strong>${stats.accuracy}%</strong><span>média local acumulada</span></article>
      <article class="metric card"><small>Caderno de erros</small><strong>${stats.errors}</strong><span>questões para revisar</span></article>
    </section>

    <section id="catalogo" class="section">
      <div class="section-head">
        <div><p class="eyebrow">Catálogo</p><h2>Provas anteriores e simulados</h2><p>Escolha um material completo ou use os filtros para localizar um tema.</p></div>
        <span class="stamp">Atualizado em ${new Date(state.catalog.exported_at).toLocaleString("pt-BR")}</span>
      </div>

      <div class="catalog-toolbar card">
        <div class="tabs" role="tablist" aria-label="Tipo de material">
          <button class="tab ${state.filters.type === "simulado" ? "active" : ""}" data-type="simulado">Simulados <b>${state.catalog.summary.simulados}</b></button>
          <button class="tab ${state.filters.type === "prova" ? "active" : ""}" data-type="prova">Provas anteriores <b>${state.catalog.summary.provas}</b></button>
          <button class="tab ${state.filters.type === "" ? "active" : ""}" data-type="">Todos <b>${state.catalog.summary.materiais}</b></button>
        </div>
        <div class="filters">
          <label class="search"><span>⌕</span><input id="search-material" value="${esc(state.filters.search)}" placeholder="Buscar material ou disciplina"></label>
          <select id="discipline-filter" aria-label="Filtrar por disciplina">
            <option value="">Todas as disciplinas</option>
            ${disciplines.map(d => `<option ${state.filters.discipline === d ? "selected" : ""}>${esc(d)}</option>`).join("")}
          </select>
        </div>
      </div>

      ${materials.length ? `<div class="material-grid">
        ${materials.map(materialCard).join("")}
      </div>` : `<div class="empty-state card">
        <div class="empty-icon">${isProofTab ? "⌛" : "⌕"}</div>
        <h3>${isProofTab ? "As provas oficiais estão em preparação editorial." : "Nenhum material corresponde aos filtros."}</h3>
        <p>${isProofTab ? "O catálogo exibirá provas anteriores assim que cada questão receber identificação da prova, transcrição e gabarito oficiais." : "Remova filtros ou faça outra pesquisa."}</p>
      </div>`}
    </section>

    <section class="two-col section">
      <article class="card history-panel">
        <p class="eyebrow">Histórico local</p><h2>Tentativas recentes</h2>
        ${history.length ? `<div class="history-list">${history.map(historyRow).join("")}</div>` : `<p class="muted">Nenhuma tentativa concluída neste aparelho.</p>`}
      </article>
      <article class="card error-book-panel">
        <p class="eyebrow">Revisão ativa</p><h2>Caderno de erros</h2>
        <p class="muted">As questões erradas são acumuladas por material. Quando você acerta uma delas em nova tentativa, ela sai do caderno.</p>
        <div class="error-book-list">${renderErrorBook()}</div>
      </article>
    </section>`;

  bindCatalogEvents();
}

function materialCard(material) {
  const errorCount = (loadErrorBook()[material.id] || []).length;
  return `<article class="material-card card">
    <div class="material-top">
      <span class="type-badge">${humanType(material.tipo_material)}</span>
      <span class="year-badge">${material.ano}</span>
    </div>
    <div>
      <p class="discipline">${esc(material.disciplina)}</p>
      <h3>${esc(material.nome)}</h3>
      <p class="material-source">${esc(material.fonte)} · ${esc(material.cargo)}</p>
    </div>
    <div class="material-stats">
      <span><b>${material.quantidade_questoes}</b> questões</span>
      <span><b>${material.tempo_sugerido_minutos}</b> min</span>
      ${errorCount ? `<span class="error-count"><b>${errorCount}</b> no caderno</span>` : ""}
    </div>
    <div class="material-actions">
      <button class="btn primary" data-open-material="${esc(material.id)}">Abrir material</button>
      ${errorCount ? `<button class="btn compact" data-review-material="${esc(material.id)}">Revisar erros</button>` : ""}
    </div>
  </article>`;
}

function historyRow(item) {
  return `<div class="history-item">
    <div><strong>${esc(item.materialName)}</strong><small>${new Date(item.finishedAt).toLocaleString("pt-BR")} · ${item.mode === "treino" ? "Treino" : "Prova"}</small></div>
    <div class="history-score"><strong>${item.percent}%</strong><small>${item.correct}/${item.total} · ${formatTime(item.elapsed)}</small></div>
  </div>`;
}

function renderErrorBook() {
  const book = loadErrorBook();
  const rows = state.catalog.materials
    .map(material => ({material, ids: book[material.id] || []}))
    .filter(row => row.ids.length);
  if (!rows.length) return `<p class="muted">Seu caderno ainda está vazio. Erros aparecerão aqui após a primeira tentativa.</p>`;
  return rows.map(({material, ids}) => `<button class="error-book-row" data-review-material="${esc(material.id)}">
    <span><strong>${esc(material.disciplina)}</strong><small>${esc(material.nome)}</small></span><b>${ids.length}</b>
  </button>`).join("");
}

function bindCatalogEvents() {
  document.querySelectorAll("[data-type]").forEach(button => button.addEventListener("click", () => {
    state.filters.type = button.dataset.type;
    renderCatalog();
  }));
  document.querySelector("#discipline-filter")?.addEventListener("change", event => {
    state.filters.discipline = event.target.value;
    renderCatalog();
  });
  document.querySelector("#search-material")?.addEventListener("input", event => {
    state.filters.search = event.target.value;
    const cursor = event.target.selectionStart;
    renderCatalog();
    const next = document.querySelector("#search-material");
    next?.focus(); next?.setSelectionRange(cursor, cursor);
  });
  document.querySelectorAll("[data-open-material]").forEach(button => button.addEventListener("click", () => openMaterial(button.dataset.openMaterial)));
  document.querySelectorAll("[data-review-material]").forEach(button => button.addEventListener("click", () => openMaterial(button.dataset.reviewMaterial, true)));
  document.querySelector("[data-scroll-catalog]")?.addEventListener("click", () => document.querySelector("#catalogo")?.scrollIntoView({behavior: "smooth"}));
  document.querySelector("[data-random]")?.addEventListener("click", startRandomTraining);
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
  state.cache.set(meta.id, material);
  return material;
}

async function openMaterial(id, reviewErrors = false) {
  const meta = state.catalog.materials.find(item => item.id === id);
  if (!meta) return;
  renderLoading(`Carregando ${meta.nome}…`);
  try {
    const material = await fetchMaterial(meta);
    state.selectedMeta = meta;
    state.material = material;
    state.questions = material.questoes;
    if (reviewErrors) {
      const ids = loadErrorBook()[id] || [];
      return beginAttempt("treino", ids);
    }
    renderMaterialDetail();
  } catch (error) {
    console.error(error);
    renderRuntimeError("Não foi possível carregar este material.");
  }
}

function renderMaterialDetail() {
  const material = state.material;
  const history = loadHistory().filter(item => item.materialId === material.id);
  const best = history.length ? Math.max(...history.map(item => item.percent)) : null;
  const errors = (loadErrorBook()[material.id] || []).length;
  app.innerHTML = `<section class="detail-hero card">
    <button class="back-link" data-back>← Voltar ao catálogo</button>
    <div class="detail-grid">
      <div>
        <div class="pills"><span class="pill">${humanType(material.tipo_material)}</span><span class="pill">${material.ano}</span><span class="pill">Cargo ${esc(material.codigo_cargo)}</span></div>
        <p class="eyebrow">${esc(material.disciplina)}</p>
        <h1>${esc(material.nome)}</h1>
        <p class="lead">Fonte: ${esc(material.fonte)}. Escolha a experiência de resolução abaixo.</p>
      </div>
      <div class="detail-summary">
        <div><small>Questões</small><strong>${material.questoes.length}</strong></div>
        <div><small>Tempo sugerido</small><strong>${material.tempo_sugerido_minutos} min</strong></div>
        <div><small>Melhor resultado</small><strong>${best === null ? "—" : `${best}%`}</strong></div>
        <div><small>No caderno de erros</small><strong>${errors}</strong></div>
      </div>
    </div>
  </section>
  <section class="mode-grid section">
    <article class="mode-card card"><span class="mode-icon">✓</span><div><p class="eyebrow">Aprendizado guiado</p><h2>Modo treino</h2><p>Confirme cada resposta e veja imediatamente o gabarito, comentário, fundamento e pegadinha.</p></div><button class="btn primary" data-start="treino">Iniciar treino</button></article>
    <article class="mode-card card"><span class="mode-icon">◷</span><div><p class="eyebrow">Simulação real</p><h2>Modo prova</h2><p>Resolva sem pistas. O gabarito e os comentários aparecem somente depois da finalização.</p></div><button class="btn primary" data-start="prova">Iniciar prova</button></article>
    ${errors ? `<article class="mode-card card accent"><span class="mode-icon">↻</span><div><p class="eyebrow">Caderno de erros</p><h2>Revisão direcionada</h2><p>Refaça apenas as ${errors} questões atualmente registradas no seu caderno.</p></div><button class="btn" data-review-errors>Revisar erros</button></article>` : ""}
  </section>`;
  document.querySelector("[data-back]").addEventListener("click", renderCatalog);
  document.querySelectorAll("[data-start]").forEach(button => button.addEventListener("click", () => beginAttempt(button.dataset.start)));
  document.querySelector("[data-review-errors]")?.addEventListener("click", () => beginAttempt("treino", loadErrorBook()[material.id] || []));
}

async function startRandomTraining() {
  renderLoading("Sorteando questões entre os materiais…");
  try {
    const all = [];
    for (const meta of state.catalog.materials) {
      const material = await fetchMaterial(meta);
      material.questoes.forEach(question => all.push({...question, _materialId: material.id, _materialName: material.nome}));
    }
    const selected = all.sort(() => Math.random() - 0.5).slice(0, Math.min(20, all.length));
    state.selectedMeta = null;
    state.material = {
      id: "treino-aleatorio",
      nome: "Treino aleatório — Banco SEDES/DF",
      disciplina: "Múltiplas disciplinas",
      fonte: "Banco Mestre",
      tipo_material: "simulado",
      ano: 2026,
      codigo_cargo: "202",
      tempo_sugerido_minutos: 40,
      questoes: selected,
    };
    beginAttempt("treino", selected.map(question => question.id));
  } catch (error) {
    console.error(error);
    renderRuntimeError("Não foi possível montar o treino aleatório.");
  }
}

function beginAttempt(mode, subsetIds = null) {
  const source = state.material.questoes;
  const ids = subsetIds?.length ? subsetIds : source.map(question => question.id);
  state.questions = ids.map(id => source.find(question => question.id === id)).filter(Boolean);
  if (!state.questions.length) return renderMaterialDetail();
  state.mode = mode;
  state.subset = subsetIds;
  state.current = 0;
  state.answers = {};
  state.confirmed = {};
  state.flagged = {};
  state.elapsedBase = 0;
  state.questionTimes = {};
  state.startedAt = Date.now();
  state.questionStartedAt = Date.now();
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
  return `<section class="feedback ${correct ? "good" : "bad"}">
    <h3>${correct ? "✓ Resposta correta" : "✕ Resposta incorreta"}</h3>
    <p>Você marcou <strong>${esc(answer || "em branco")}</strong>. Gabarito: <strong>${esc(question.gabarito)}</strong>.</p>
    <p>${esc(question.comentario || "Comentário não disponível.")}</p>
    ${question.fundamento ? `<p><strong>Fundamento:</strong> ${esc(question.fundamento)}</p>` : ""}
    ${question.pegadinha ? `<p><strong>Pegadinha:</strong> ${esc(question.pegadinha)}</p>` : ""}
  </section>`;
}

function renderQuestion() {
  const question = state.questions[state.current];
  if (!question) return finishAttempt();
  const answered = Object.keys(state.answers).length;
  const confirmed = Object.keys(state.confirmed).length;
  const progress = (state.current + 1) / state.questions.length * 100;
  const isLast = state.current === state.questions.length - 1;

  app.innerHTML = `<section class="exam-layout">
    <article class="question-card card">
      <header class="exam-header">
        <div><p class="eyebrow">${state.mode === "treino" ? "Modo treino" : "Modo prova"} · Questão ${state.current + 1} de ${state.questions.length}</p><small>${esc(question.assunto || state.material.disciplina)}</small></div>
        <div class="timer">◷ <span data-total-time>${formatTime(totalElapsed())}</span></div>
      </header>
      <div class="progress"><span style="width:${progress}%"></span></div>
      ${question.texto_base ? `<div class="text-base">${esc(question.texto_base)}</div>` : ""}
      <h1 class="question-title">${esc(question.enunciado)}</h1>
      <div class="options">
        ${Object.entries(question.alternativas).map(([letter, text]) => `<label class="${optionClass(question, letter)}">
          <input type="radio" name="answer" value="${letter}" ${state.answers[question.id] === letter ? "checked" : ""} ${state.confirmed[question.id] ? "disabled" : ""}>
          <span class="letter">${letter}</span><span>${esc(text)}</span>
        </label>`).join("")}
      </div>
      ${feedback(question)}
      <footer class="exam-actions">
        <div class="actions"><button class="btn" data-prev ${state.current === 0 ? "disabled" : ""}>Anterior</button><button class="btn" data-flag>${state.flagged[question.id] ? "★ Marcada" : "☆ Marcar para revisão"}</button></div>
        <div class="actions">
          ${state.mode === "treino" && !state.confirmed[question.id] ? `<button class="btn primary" data-confirm ${state.answers[question.id] ? "" : "disabled"}>Confirmar resposta</button>` : ""}
          <button class="btn primary" data-next>${isLast ? "Finalizar" : "Próxima"}</button>
        </div>
      </footer>
    </article>
    <aside class="exam-side card">
      <div><p class="eyebrow">Navegação</p><h2>Mapa de questões</h2></div>
      <div class="question-map">${state.questions.map((item, index) => mapButton(item, index)).join("")}</div>
      <div class="side-stats">
        <div><span>Respondidas</span><strong>${answered}/${state.questions.length}</strong></div>
        ${state.mode === "treino" ? `<div><span>Confirmadas</span><strong>${confirmed}</strong></div>` : ""}
        <div><span>Nesta questão</span><strong data-question-time>${formatTime(currentQuestionElapsed())}</strong></div>
      </div>
      <div class="legend"><span><i class="legend-current"></i>Atual</span><span><i class="legend-answered"></i>Respondida</span><span><i class="legend-flagged"></i>Revisar</span></div>
      <button class="btn danger full" data-exit>Sair da tentativa</button>
    </aside>
  </section>`;
  bindQuestionEvents(question);
}

function mapButton(question, index) {
  let classes = "map-btn";
  if (index === state.current) classes += " current";
  if (state.answers[question.id]) classes += " answered";
  if (state.flagged[question.id]) classes += " flagged";
  if (state.mode === "treino" && state.confirmed[question.id]) {
    classes += state.answers[question.id] === question.gabarito ? " correct" : " incorrect";
  }
  return `<button class="${classes}" data-jump="${index}">${index + 1}</button>`;
}

function bindQuestionEvents(question) {
  document.querySelectorAll('input[name="answer"]').forEach(input => input.addEventListener("change", () => {
    state.answers[question.id] = input.value;
    renderQuestion();
  }));
  document.querySelector("[data-confirm]")?.addEventListener("click", () => {
    if (!state.answers[question.id]) return;
    state.confirmed[question.id] = true;
    renderQuestion();
  });
  document.querySelector("[data-prev]")?.addEventListener("click", () => navigate(state.current - 1));
  document.querySelector("[data-next]")?.addEventListener("click", () => state.current === state.questions.length - 1 ? finishAttempt() : navigate(state.current + 1));
  document.querySelector("[data-flag]")?.addEventListener("click", () => {
    state.flagged[question.id] = !state.flagged[question.id];
    renderQuestion();
  });
  document.querySelectorAll("[data-jump]").forEach(button => button.addEventListener("click", () => navigate(Number(button.dataset.jump))));
  document.querySelector("[data-exit]")?.addEventListener("click", () => {
    if (!confirm("Encerrar esta tentativa sem salvar o resultado?")) return;
    stopTimer();
    state.material?.id === "treino-aleatorio" ? renderCatalog() : renderMaterialDetail();
  });
}

function navigate(index) {
  if (index < 0 || index >= state.questions.length) return;
  trackQuestionTime();
  state.current = index;
  state.questionStartedAt = Date.now();
  renderQuestion();
}

function updateErrorBook(results) {
  const book = loadErrorBook();
  const grouped = new Map();
  results.forEach(result => {
    const materialId = result.question._materialId || state.material.id;
    if (!grouped.has(materialId)) grouped.set(materialId, []);
    grouped.get(materialId).push(result);
  });
  grouped.forEach((items, materialId) => {
    const set = new Set(book[materialId] || []);
    items.forEach(item => item.correct ? set.delete(item.question.id) : set.add(item.question.id));
    book[materialId] = [...set];
  });
  saveErrorBook(book);
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
    materialId: state.material.id,
    materialName: state.material.nome,
    mode: state.mode,
    finishedAt: new Date().toISOString(),
    elapsed: Math.round(state.elapsedBase),
    total: results.length,
    correct, wrong, blank, percent,
    answers: state.answers,
    questionTimes: Object.fromEntries(Object.entries(state.questionTimes).map(([id, seconds]) => [id, Math.round(seconds)])),
  };
  saveHistory(attempt);
  renderResults(results, attempt);
}

function renderResults(results, attempt) {
  const reviewIds = results.filter(item => !item.correct).map(item => item.question.id);
  app.innerHTML = `<section class="result-hero card">
    <p class="eyebrow">Tentativa concluída</p>
    <div class="result-head"><div><h1>${attempt.percent}% de aproveitamento</h1><p>${esc(attempt.materialName)} · ${attempt.mode === "treino" ? "Modo treino" : "Modo prova"}</p></div><div class="result-grade">${attempt.percent >= 80 ? "Desempenho forte" : attempt.percent >= 60 ? "Em consolidação" : "Revisão necessária"}</div></div>
    <div class="summary-grid">
      <div><small>Acertos</small><strong>${attempt.correct}</strong></div>
      <div><small>Erros</small><strong>${attempt.wrong}</strong></div>
      <div><small>Em branco</small><strong>${attempt.blank}</strong></div>
      <div><small>Tempo total</small><strong>${formatTime(attempt.elapsed)}</strong></div>
    </div>
    <div class="actions result-actions"><button class="btn primary" data-catalog>Voltar ao catálogo</button>${reviewIds.length ? `<button class="btn" data-retry>Refazer erradas e em branco</button>` : ""}<button class="btn" data-material>Voltar ao material</button></div>
  </section>
  <section class="section"><div class="section-head"><div><p class="eyebrow">Correção detalhada</p><h2>Revisão das questões</h2></div></div>
    <div class="result-list">${results.map((item, index) => resultQuestion(item, index)).join("")}</div>
  </section>`;
  document.querySelector("[data-catalog]").addEventListener("click", renderCatalog);
  document.querySelector("[data-material]").addEventListener("click", () => state.material.id === "treino-aleatorio" ? renderCatalog() : renderMaterialDetail());
  document.querySelector("[data-retry]")?.addEventListener("click", () => beginAttempt("treino", reviewIds));
}

function resultQuestion(item, index) {
  const {question, answer, correct} = item;
  return `<article class="result-question card">
    <header><div><span class="question-index">${index + 1}</span><strong>${esc(question.assunto || state.material.disciplina)}</strong></div><span class="result-status ${correct ? "good" : "bad"}">${correct ? "Correta" : answer ? "Incorreta" : "Em branco"}</span></header>
    <h3>${esc(question.enunciado)}</h3>
    <p class="answer-line">Marcada: <strong>${esc(answer || "em branco")}</strong> · Gabarito: <strong>${esc(question.gabarito)}</strong></p>
    <p>${esc(question.comentario || "")}</p>
    ${question.fundamento ? `<p class="foundation"><strong>Fundamento:</strong> ${esc(question.fundamento)}</p>` : ""}
    ${question.pegadinha ? `<p class="trap"><strong>Pegadinha:</strong> ${esc(question.pegadinha)}</p>` : ""}
  </article>`;
}

function renderLoading(message) {
  app.innerHTML = `<section class="card loading"><div class="spinner"></div><h1>${esc(message)}</h1><p>Isso ocorre apenas na primeira abertura do material.</p></section>`;
}

function renderRuntimeError(message) {
  app.innerHTML = `<section class="card error-state"><p class="eyebrow">Erro</p><h1>${esc(message)}</h1><button class="btn primary" data-return>Voltar ao catálogo</button></section>`;
  document.querySelector("[data-return]").addEventListener("click", renderCatalog);
}

async function init() {
  try {
    const response = await fetch(CATALOG_URL, {cache: "no-store"});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.catalog = await response.json();
    syncLabel.textContent = `${state.catalog.summary.questoes} questões validadas`;
    renderCatalog();
  } catch (error) {
    console.error(error);
    syncLabel.textContent = "Falha no catálogo";
    app.replaceChildren(document.querySelector("#error-template").content.cloneNode(true));
  }
}

init();
