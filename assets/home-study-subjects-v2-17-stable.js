import {
  activeHistory,
  createCompatibleSession,
  currentRoute,
  ensureData,
  esc,
  materialIdFromIndex,
  profileKey,
  state,
  toast,
} from "./shared-v2-13.js?v=1";
import {
  TARGETS,
  TRACKS,
  normalizeStudyValue,
  sessionMaterialTypeForTracks,
  targetQuestionIdsForStudyIndex,
} from "./home-study-edital-v2-18.js?v=1";

const DAILY_SIZE = 25;
const TEMP_SELECTION_KEY = () => profileKey("homeStudySubjects.v2");
const TEMP_FORMAT_KEY = () => profileKey("homeStudyFormat.v1");
const FORMAT_MODES = [
  {id: "all", label: "Todas"},
  {id: "true-false", label: "Certo ou Errado"},
  {id: "multiple-choice", label: "Múltipla escolha"},
];
const targetCache = new Map();
const trackCache = new Map();
const subjectCache = new Map();
let questionFormatIndex = null;
let questionFormatPromise = null;
let formatRetryTimer = null;
let watchdog = null;

const dateKey = value => new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo"}).format(new Date(value));

async function ensureQuestionFormatIndex() {
  if (questionFormatIndex) return questionFormatIndex;
  if (!questionFormatPromise) {
    questionFormatPromise = fetch("./data/release/question-format-index.json", {cache: "no-store"})
      .then(response => {
        if (!response.ok) throw new Error(`Índice de formato indisponível (${response.status}).`);
        return response.json();
      })
      .then(payload => {
        if (!payload?.formats || typeof payload.formats !== "object") throw new Error("Índice de formato inválido.");
        questionFormatIndex = payload.formats;
        return questionFormatIndex;
      })
      .catch(error => {
        questionFormatPromise = null;
        throw error;
      });
  }
  return questionFormatPromise;
}

function readFormatSelection() {
  try {
    const value = sessionStorage.getItem(TEMP_FORMAT_KEY()) || "all";
    return FORMAT_MODES.some(mode => mode.id === value) ? value : "all";
  } catch {
    return "all";
  }
}

function saveFormatSelection(value) {
  const normalized = FORMAT_MODES.some(mode => mode.id === value) ? value : "all";
  try { sessionStorage.setItem(TEMP_FORMAT_KEY(), normalized); }
  catch { /* filtro temporário não deve bloquear o estudo */ }
}

function formatLabel(value) {
  return FORMAT_MODES.find(mode => mode.id === value)?.label || "Todas";
}

function questionFormat(questionId) {
  return questionFormatIndex?.[questionId] || "unknown";
}

function applyQuestionFormat(ids, formatMode = readFormatSelection()) {
  if (formatMode === "all") return [...ids];
  return ids.filter(id => questionFormat(id) === formatMode);
}

function stableScore(id, salt) {
  let hash = 2166136261;
  for (const char of `${salt}:${id}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function stableSort(ids, salt) {
  return [...ids].sort((a, b) => stableScore(a, salt) - stableScore(b, salt));
}

function answeredIds() {
  const ids = new Set();
  for (const attempt of activeHistory()) {
    if (Array.isArray(attempt?.answeredQuestionIds)) attempt.answeredQuestionIds.forEach(id => ids.add(id));
    else if (attempt?.answers && typeof attempt.answers === "object") {
      Object.entries(attempt.answers).forEach(([id, answer]) => { if (answer) ids.add(id); });
    } else if (Array.isArray(attempt?.questionIds)) attempt.questionIds.forEach(id => ids.add(id));
  }
  return ids;
}

function targetQuestionIds(targetCode) {
  if (targetCache.has(targetCode)) return targetCache.get(targetCode);
  const result = targetQuestionIdsForStudyIndex(state.studyIndex, targetCode);
  targetCache.set(targetCode, result);
  return result;
}

function materialMap() {
  return new Map((state.catalog?.materials || []).map(material => [String(material.id), material]));
}

function trackPool(track) {
  if (trackCache.has(track.id)) return trackCache.get(track.id);
  const materials = materialMap();
  const eligible = targetQuestionIds(track.target);
  const ids = [];
  for (const id of eligible) {
    const materialId = materialIdFromIndex(state.catalog?.question_index?.[id]);
    const material = materials.get(String(materialId || ""));
    if (!material || normalizeStudyValue(material.tipo_material) !== track.type) continue;
    ids.push(id);
  }
  const unique = [...new Set(ids)];
  trackCache.set(track.id, unique);
  return unique;
}

function subjectOptions(track) {
  if (subjectCache.has(track.id)) return subjectCache.get(track.id);
  const pool = new Set(trackPool(track));
  const merged = new Map();
  for (const discipline of state.studyIndex?.disciplines || []) {
    const ids = [...new Set((discipline.question_ids || []).filter(id => pool.has(id)))];
    if (!ids.length) continue;
    const key = normalizeStudyValue(discipline.name);
    if (!key) continue;
    const current = merged.get(key) || {name: discipline.name, ids: new Set()};
    ids.forEach(id => current.ids.add(id));
    merged.set(key, current);
  }
  const options = [...merged.values()]
    .map(item => ({name: item.name, ids: [...item.ids]}))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  subjectCache.set(track.id, options);
  return options;
}

function readTempSelection() {
  try {
    const raw = sessionStorage.getItem(TEMP_SELECTION_KEY());
    const value = raw ? JSON.parse(raw) : {};
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function saveTempSelection(value) {
  try { sessionStorage.setItem(TEMP_SELECTION_KEY(), JSON.stringify(value)); }
  catch { /* escolha temporária não deve bloquear o estudo */ }
}

function selectionForTrack(track, options, selection) {
  const stored = selection[track.id];
  const allMode = !Array.isArray(stored);
  if (allMode) return {allMode: true, names: options.map(option => option.name)};
  const valid = new Set(options.map(option => option.name));
  return {allMode: false, names: [...new Set(stored.filter(name => valid.has(name)))]};
}

function selectedTrackIds(card) {
  return [...card.querySelectorAll("[data-ux16-track-input]:checked")].map(input => input.value);
}

function filteredIds(track, options, selectedNames, allMode = false) {
  if (allMode) return trackPool(track);
  if (!selectedNames.length) return [];
  const selected = new Set(selectedNames);
  return [...new Set(options.filter(option => selected.has(option.name)).flatMap(option => option.ids))];
}

function currentPools(card) {
  const selection = readTempSelection();
  const formatMode = readFormatSelection();
  const selectedIds = new Set(selectedTrackIds(card));
  return TRACKS.filter(track => selectedIds.has(track.id)).map(track => {
    const options = subjectOptions(track);
    const chosen = selectionForTrack(track, options, selection);
    const subjectIds = filteredIds(track, options, chosen.names, chosen.allMode);
    return {
      track,
      options,
      names: chosen.names,
      allMode: chosen.allMode,
      subjectIds,
      ids: applyQuestionFormat(subjectIds, formatMode),
      formatMode,
    };
  });
}

function formatCounts(pools) {
  const ids = [...new Set(pools.flatMap(pool => pool.subjectIds || []))];
  return {
    all: ids.length,
    "true-false": applyQuestionFormat(ids, "true-false").length,
    "multiple-choice": applyQuestionFormat(ids, "multiple-choice").length,
  };
}

function formatPanel(pools) {
  const selected = readFormatSelection();
  const counts = formatCounts(pools);
  return `<section class="ux20-format" data-ux20-format aria-label="Formato das questões" aria-busy="${questionFormatIndex ? "false" : "true"}">
    <div class="ux20-format-copy"><small>Formato das questões</small><strong>Como você quer responder agora?</strong></div>
    <div class="ux20-format-options" role="group" aria-label="Filtrar formato das questões">${FORMAT_MODES.map(mode => `<button type="button" class="ux20-format-option ${selected === mode.id ? "selected" : ""}" data-ux20-format-option="${mode.id}" aria-pressed="${selected === mode.id ? "true" : "false"}" ${(!questionFormatIndex || counts[mode.id] === 0) && mode.id !== "all" ? "disabled" : ""}><span>${esc(mode.label)}</span><small data-ux20-format-count="${mode.id}">${counts[mode.id].toLocaleString("pt-BR")}</small></button>`).join("")}</div>
  </section>`;
}

function subjectGroup(pool, openIds) {
  const {track, options, names, allMode} = pool;
  const selected = new Set(allMode ? [] : names);
  const formatMode = readFormatSelection();
  const target = TARGETS[track.target];
  const typeLabel = track.type === "prova" ? "Provas anteriores" : "Simulados";
  const status = allMode ? `Todas · ${options.length}` : `${names.length} de ${options.length}`;
  return `<details class="ux17-subject-group" data-ux17-subject-group="${track.id}" ${openIds.has(track.id) ? "open" : ""}>
    <summary><span><small>${typeLabel} · ${esc(target.label)}</small><strong>Matérias</strong></span><b data-ux17-subject-status>${status}</b></summary>
    <div class="ux17-subject-body">
      <div class="ux17-subject-actions">
        <span>Toque em uma matéria para estudar só ela; toque em outras para combinar.</span>
        <div>
          <button type="button" class="ux17-mini ${allMode ? "selected" : ""}" data-ux17-all="${track.id}" aria-pressed="${allMode ? "true" : "false"}">Todas</button>
          <button type="button" class="ux17-mini" data-ux17-clear="${track.id}">Limpar</button>
        </div>
      </div>
      <div class="ux17-subject-chips" role="group" aria-label="Matérias de ${esc(track.label)}">${options.map(option => `<button type="button" class="ux17-subject-chip ${selected.has(option.name) ? "selected" : ""}" data-ux17-subject-button data-ux17-track="${track.id}" data-ux17-subject="${esc(option.name)}" aria-pressed="${selected.has(option.name) ? "true" : "false"}"><span>${esc(option.name)}</span><small>${applyQuestionFormat(option.ids, formatMode).length}</small></button>`).join("")}</div>
    </div>
  </details>`;
}

function summaryText(pools) {
  if (!pools.length) return "Selecione pelo menos uma das quatro opções.";
  const available = new Set(pools.flatMap(pool => pool.ids)).size;
  const custom = pools.filter(pool => !pool.allMode);
  const matterText = custom.length
    ? `${custom.reduce((total, pool) => total + pool.names.length, 0)} matéria(s) escolhida(s) manualmente`
    : "todas as matérias disponíveis";
  const formatMode = pools[0]?.formatMode || readFormatSelection();
  return `${pools.length} opção(ões) · ${matterText} · formato: ${formatLabel(formatMode)} · ${available.toLocaleString("pt-BR")} questões disponíveis · sessão de até ${DAILY_SIZE}.`;
}

function balancedDailyIds(pools, answered) {
  const picked = [];
  const used = new Set();
  const today = dateKey(Date.now());
  const active = pools.filter(pool => pool.ids.length)
    .sort((a, b) => Number(b.track.type === "prova") - Number(a.track.type === "prova"));
  if (!active.length) return [];
  const base = Math.floor(DAILY_SIZE / active.length);
  let remainder = DAILY_SIZE - base * active.length;
  const add = (ids, count, salt) => {
    const fresh = stableSort(ids.filter(id => !answered.has(id) && !used.has(id)), `${today}:${salt}:fresh`);
    const seen = stableSort(ids.filter(id => answered.has(id) && !used.has(id)), `${today}:${salt}:seen`);
    for (const id of [...fresh, ...seen]) {
      if (picked.length >= DAILY_SIZE || count <= 0) break;
      picked.push(id);
      used.add(id);
      count -= 1;
    }
  };
  for (const pool of active) {
    const quota = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    add(pool.ids, quota, pool.track.id);
  }
  if (picked.length < DAILY_SIZE) add(active.flatMap(pool => pool.ids), DAILY_SIZE - picked.length, "fill-v20");
  return picked;
}

function updateSummary(card) {
  const pools = currentPools(card);
  const summary = card.querySelector("[data-ux16-summary]");
  if (summary) summary.textContent = summaryText(pools);
  const start = card.querySelector("[data-ux17-start]");
  const available = new Set(pools.flatMap(pool => pool.ids)).size;
  if (start) start.disabled = !pools.length || pools.some(pool => !pool.names.length) || !available;
  return pools;
}

function openGroupIds(card, extra = null) {
  const ids = new Set([...card.querySelectorAll("[data-ux17-subject-group][open]")].map(node => node.dataset.ux17SubjectGroup));
  if (extra) ids.add(extra);
  return ids;
}

function syncFormatControls(card) {
  const pools = currentPools(card);
  const counts = formatCounts(pools);
  const selected = readFormatSelection();
  card.querySelectorAll("[data-ux20-format-option]").forEach(button => {
    const mode = button.dataset.ux20FormatOption;
    const active = selected === mode;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = mode !== "all" && (!questionFormatIndex || counts[mode] === 0);
  });
  card.querySelectorAll("[data-ux20-format-count]").forEach(node => {
    const mode = node.dataset.ux20FormatCount;
    node.textContent = Number(counts[mode] || 0).toLocaleString("pt-BR");
  });
}

function syncSubjectCounts(card) {
  const formatMode = readFormatSelection();
  for (const track of TRACKS) {
    const group = card.querySelector(`[data-ux17-subject-group="${CSS.escape(track.id)}"]`);
    if (!group) continue;
    const options = new Map(subjectOptions(track).map(option => [option.name, option]));
    group.querySelectorAll("[data-ux17-subject-button]").forEach(button => {
      const option = options.get(button.dataset.ux17Subject);
      const count = option ? applyQuestionFormat(option.ids, formatMode).length : 0;
      const node = button.querySelector("small");
      if (node) node.textContent = count.toLocaleString("pt-BR");
    });
  }
}

function syncDerivedState(card) {
  const formatPanelNode = card.querySelector("[data-ux20-format]");
  if (formatPanelNode) formatPanelNode.setAttribute("aria-busy", questionFormatIndex ? "false" : "true");
  syncFormatControls(card);
  syncSubjectCounts(card);
  updateSummary(card);
}

function syncSubjectGroup(card, trackId) {
  const track = TRACKS.find(item => item.id === trackId);
  const group = card.querySelector(`[data-ux17-subject-group="${CSS.escape(trackId)}"]`);
  if (!track || !group) return;
  const options = subjectOptions(track);
  const chosen = selectionForTrack(track, options, readTempSelection());
  const selected = new Set(chosen.allMode ? [] : chosen.names);

  group.querySelectorAll("[data-ux17-subject-button]").forEach(button => {
    const active = selected.has(button.dataset.ux17Subject);
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const allButton = group.querySelector(`[data-ux17-all="${CSS.escape(trackId)}"]`);
  if (allButton) {
    allButton.classList.toggle("selected", chosen.allMode);
    allButton.setAttribute("aria-pressed", String(chosen.allMode));
  }

  const status = group.querySelector("[data-ux17-subject-status]");
  if (status) status.textContent = chosen.allMode ? `Todas · ${options.length}` : `${chosen.names.length} de ${options.length}`;
  syncFormatControls(card);
  updateSummary(card);
}

function setCustomSubject(card, trackId, subjectName) {
  const track = TRACKS.find(item => item.id === trackId);
  if (!track) return;
  const options = subjectOptions(track);
  const valid = new Set(options.map(option => option.name));
  if (!valid.has(subjectName)) return;
  const selection = readTempSelection();
  const stored = selection[trackId];

  if (!Array.isArray(stored)) {
    selection[trackId] = [subjectName];
  } else if (stored.includes(subjectName)) {
    selection[trackId] = stored.filter(name => name !== subjectName);
  } else {
    selection[trackId] = [...stored, subjectName];
  }

  const normalized = [...new Set(selection[trackId].filter(name => valid.has(name)))];
  if (normalized.length === options.length && options.length) delete selection[trackId];
  else selection[trackId] = normalized;
  saveTempSelection(selection);
  syncSubjectGroup(card, trackId);
}

function bindSubjectControls(card) {
  card.querySelectorAll("[data-ux17-all]").forEach(button => button.addEventListener("click", () => {
    const trackId = button.dataset.ux17All;
    const selection = readTempSelection();
    delete selection[trackId];
    saveTempSelection(selection);
    syncSubjectGroup(card, trackId);
  }));

  card.querySelectorAll("[data-ux17-clear]").forEach(button => button.addEventListener("click", () => {
    const trackId = button.dataset.ux17Clear;
    const selection = readTempSelection();
    selection[trackId] = [];
    saveTempSelection(selection);
    syncSubjectGroup(card, trackId);
  }));

  card.querySelectorAll("[data-ux17-subject-button]").forEach(button => button.addEventListener("click", () => {
    setCustomSubject(card, button.dataset.ux17Track, button.dataset.ux17Subject);
  }));

  card.querySelectorAll("[data-ux20-format-option]").forEach(button => button.addEventListener("click", () => {
    if (button.disabled) return;
    saveFormatSelection(button.dataset.ux20FormatOption);
    syncDerivedState(card);
  }));
}

function renderSubjects(card, keepOpen = null) {
  let panel = card.querySelector("[data-ux17-subjects]");
  const openIds = openGroupIds(card, keepOpen);
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "ux17-subjects";
    panel.dataset.ux17Subjects = "";
    card.querySelector(".ux16-track-grid")?.insertAdjacentElement("afterend", panel);
  }
  const pools = currentPools(card);
  panel.innerHTML = pools.length
    ? `<div class="ux17-subjects-head"><div><small>Personalize o conteúdo</small><strong>Quais matérias e formato você quer fazer agora?</strong></div><span>Combine o recorte do edital, as matérias e o formato das questões.</span></div>${formatPanel(pools)}<div class="ux17-subject-list">${pools.map(pool => subjectGroup(pool, openIds)).join("")}</div>`
    : "";
  panel.hidden = !pools.length;
  bindSubjectControls(card);
  updateSummary(card);
}

function startFilteredSession(card) {
  const pools = updateSummary(card);
  if (!pools.length) return toast("Selecione pelo menos uma opção para o estudo de hoje.", "info");
  if (pools.some(pool => !pool.names.length)) return toast("Escolha ao menos uma matéria em cada recorte selecionado ou desmarque o recorte vazio.", "info");
  const ids = balancedDailyIds(pools, answeredIds());
  const formatMode = readFormatSelection();
  if (!ids.length) return toast("Não há questões disponíveis para as matérias e o formato escolhidos nessa combinação.", "info");
  const activePools = pools.filter(pool => pool.ids.length);
  const names = activePools.map(pool => `${pool.track.label} (${pool.allMode ? "todas" : `${pool.names.length} matérias`})`).join(" + ");
  const uniqueSubjects = [...new Set(activePools.flatMap(pool => pool.names))];
  const activeTracks = activePools.map(pool => pool.track);
  createCompatibleSession({
    id: `estudo-hoje-materias-${dateKey(Date.now())}`,
    name: `Estudo de hoje — ${names}${formatMode === "all" ? "" : ` · ${formatLabel(formatMode)}`}`,
    questionIds: ids,
    mode: "treino",
    minutes: ids.length * 2,
    discipline: uniqueSubjects.length === 1 ? uniqueSubjects[0] : "Matérias selecionadas",
    source: `Provas/simulados filtrados por edital, matérias e formato ${formatLabel(formatMode)}`,
    cargo: activePools.length === 1 ? activePools[0].track.target : "multicargo",
    materialType: sessionMaterialTypeForTracks(activeTracks),
  });
}

function replaceStartButton(card) {
  const current = card.querySelector("[data-ux16-start]");
  if (!current || current.dataset.ux17Start) return;
  const replacement = current.cloneNode(true);
  replacement.dataset.ux17Start = "";
  replacement.textContent = "Começar com estes filtros";
  replacement.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    startFilteredSession(card);
  });
  current.replaceWith(replacement);
}

function enhanceCard(card) {
  if (!card.dataset.ux17Ready) {
    card.dataset.ux17Ready = "";
    card.addEventListener("change", event => {
      if (event.target.matches("[data-ux16-track-input]")) window.setTimeout(() => renderSubjects(card), 0);
    });
  }
  replaceStartButton(card);
  renderSubjects(card);
}

function stopWatchdog() {
  if (!watchdog) return;
  window.clearInterval(watchdog);
  watchdog = null;
}

function tick() {
  if (currentRoute() !== "inicio") {
    stopWatchdog();
    return;
  }
  const card = document.querySelector("#app > [data-ux15-home] [data-ux-today][data-ux16-ready]");
  if (!card) return;
  const stable = card.dataset.ux17Ready
    && card.querySelector("[data-ux17-subjects]")
    && card.querySelector("[data-ux17-start]")
    && card.querySelector("[data-ux20-format]");
  if (!stable) enhanceCard(card);
}

function arm() {
  tick();
  if (!watchdog && currentRoute() === "inicio") watchdog = window.setInterval(tick, 900);
}

function stopFormatRetry() {
  if (!formatRetryTimer) return;
  window.clearTimeout(formatRetryTimer);
  formatRetryTimer = null;
}

function refreshAfterFormatIndex() {
  stopFormatRetry();
  const card = document.querySelector("#app > [data-ux15-home] [data-ux-today][data-ux16-ready]");
  if (card) syncDerivedState(card);
}

function loadFormatIndexAndRefresh() {
  if (currentRoute() !== "inicio" || questionFormatIndex) return;
  ensureQuestionFormatIndex()
    .then(refreshAfterFormatIndex)
    .catch(error => {
      console.error("Falha temporária ao carregar formatos do Estudo de hoje v2.21:", error);
      if (currentRoute() !== "inicio") {
        stopFormatRetry();
        return;
      }
      if (!formatRetryTimer) formatRetryTimer = window.setTimeout(() => {
        formatRetryTimer = null;
        loadFormatIndexAndRefresh();
      }, 1200);
    });
}

window.addEventListener("hashchange", () => {
  if (currentRoute() !== "inicio") stopFormatRetry();
  window.setTimeout(() => {
    arm();
    if (currentRoute() === "inicio" && !questionFormatIndex) loadFormatIndexAndRefresh();
  }, 120);
});
ensureData()
  .then(() => {
    window.setTimeout(arm, 120);
    loadFormatIndexAndRefresh();
  })
  .catch(error => console.error("Falha ao preparar matérias do Estudo de hoje v2.21:", error));
