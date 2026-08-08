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

const DAILY_SIZE = 25;
const TEMP_SELECTION_KEY = () => profileKey("homeStudySubjects.v2");
const targetCache = new Map();
const trackCache = new Map();
const subjectCache = new Map();
let watchdog = null;

const COMMON_DISCIPLINES = [
  "lingua portuguesa", "distrito federal", "ride", "primeiros socorros",
  "politicas para mulheres", "seguranca alimentar", "legislacao do distrito federal",
];

const COMMON_TOPICS = [
  "ride", "distrito federal", "plano distrital de politica para mulheres", "pdpm",
  "maria da penha", "lei 11.340", "lodf", "lei organica do distrito federal",
  "lc 840", "lei complementar 840", "primeiros socorros", "programas sociais do df",
  "beneficios eventuais", "sisan", "seguranca alimentar", "restaurante comunitario", "lei 7.484",
];

const TARGETS = {
  "202": {
    label: "Técnico Administrativo",
    disciplines: [
      ...COMMON_DISCIPLINES,
      "direito administrativo", "administracao publica", "direito constitucional", "arquivologia",
      "redacao oficial", "atendimento ao publico", "administracao de materiais", "gestao de materiais",
      "recursos materiais", "gestao patrimonial", "patrimonio", "licitacoes", "compras publicas",
    ],
    topics: [
      ...COMMON_TOPICS,
      "administrativo", "atos administrativos", "agentes publicos", "provimento", "vacancia",
      "direitos e deveres", "responsabilidade", "processo administrativo disciplinar", "pad",
      "suas", "pnas", "nob/suas", "nob suas", "segurancas socioassistenciais", "protocolo",
      "classificacao de documentos", "metodos de arquivamento", "preservacao documental", "digitalizacao",
      "atendimento ao publico", "trabalho em equipe", "redacao oficial", "comunicacoes administrativas",
      "classificacao de materiais", "estoque", "armazenagem", "tombamento", "inventario patrimonial",
      "baixa patrimonial", "compras publicas", "lei 14.133", "licitacao", "contratacao publica",
    ],
  },
  "400": {
    label: "Administrador",
    disciplines: [
      ...COMMON_DISCIPLINES,
      "administracao", "administracao geral", "teorias da administracao", "administracao publica",
      "gestao publica", "gestao organizacional", "gestao de pessoas", "gestao de projetos", "gestao de riscos",
      "administracao financeira e orcamentaria", "afo", "orcamento publico", "financas publicas",
      "organizacao sistemas e metodos", "os&m", "qualidade",
    ],
    topics: [
      ...COMMON_TOPICS,
      "suas", "loas", "pnas", "nob/suas", "nob suas", "siafem", "administracao por objetivos", "apo",
      "processo decisorio", "descentralizacao", "delegacao", "arquitetura organizacional",
      "estrutura organizacional", "modelos de excelencia em gestao publica", "planejamento", "indicadores",
      "qualidade", "gestao de pessoas", "gestao por competencias", "analise e descricao de cargos",
      "cargos carreiras e salarios", "motivacao", "etica", "gestao de projetos", "gestao de riscos",
      "mrosc", "cadunico", "cadastro unico", "controle social", "orcamento", "afo",
    ],
  },
};

const TRACKS = [
  {id: "prova-202", type: "prova", target: "202", label: "Provas 202"},
  {id: "prova-400", type: "prova", target: "400", label: "Provas 400"},
  {id: "simulado-202", type: "simulado", target: "202", label: "Simulados 202"},
  {id: "simulado-400", type: "simulado", target: "400", label: "Simulados 400"},
];

const normalize = value => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
  .replace(/\s+/g, " ")
  .trim();

const dateKey = value => new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo"}).format(new Date(value));

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

function includesAny(text, terms) {
  const value = normalize(text);
  return terms.some(term => value.includes(normalize(term)));
}

function matchesDiscipline(name, terms) {
  const value = normalize(name);
  return terms.some(term => {
    const expected = normalize(term);
    return value === expected || value.startsWith(`${expected} `) || value.endsWith(` ${expected}`);
  });
}

function targetQuestionIds(targetCode) {
  if (targetCache.has(targetCode)) return targetCache.get(targetCode);
  const target = TARGETS[targetCode];
  const result = new Set();
  if (target) {
    for (const discipline of state.studyIndex?.disciplines || []) {
      if (matchesDiscipline(discipline.name, target.disciplines)) {
        (discipline.question_ids || []).forEach(id => result.add(id));
        continue;
      }
      for (const topic of discipline.topics || []) {
        if (includesAny(`${discipline.name} ${topic.name}`, target.topics)) {
          (topic.question_ids || []).forEach(id => result.add(id));
        }
      }
    }
  }
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
    if (!material || normalize(material.tipo_material) !== track.type) continue;
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
    const key = normalize(discipline.name);
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
  const selectedIds = new Set(selectedTrackIds(card));
  return TRACKS.filter(track => selectedIds.has(track.id)).map(track => {
    const options = subjectOptions(track);
    const chosen = selectionForTrack(track, options, selection);
    return {
      track,
      options,
      names: chosen.names,
      allMode: chosen.allMode,
      ids: filteredIds(track, options, chosen.names, chosen.allMode),
    };
  });
}

function subjectGroup(pool, openIds) {
  const {track, options, names, allMode} = pool;
  const selected = new Set(allMode ? [] : names);
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
      <div class="ux17-subject-chips" role="group" aria-label="Matérias de ${esc(track.label)}">${options.map(option => `<button type="button" class="ux17-subject-chip ${selected.has(option.name) ? "selected" : ""}" data-ux17-subject-button data-ux17-track="${track.id}" data-ux17-subject="${esc(option.name)}" aria-pressed="${selected.has(option.name) ? "true" : "false"}"><span>${esc(option.name)}</span><small>${option.ids.length}</small></button>`).join("")}</div>
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
  return `${pools.length} opção(ões) · ${matterText} · ${available.toLocaleString("pt-BR")} questões disponíveis · sessão de até ${DAILY_SIZE}.`;
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
  if (picked.length < DAILY_SIZE) add(active.flatMap(pool => pool.ids), DAILY_SIZE - picked.length, "fill-v17");
  return picked;
}

function updateSummary(card) {
  const pools = currentPools(card);
  const summary = card.querySelector("[data-ux16-summary]");
  if (summary) summary.textContent = summaryText(pools);
  const start = card.querySelector("[data-ux17-start]");
  if (start) start.disabled = !pools.length || pools.some(pool => !pool.names.length || !pool.ids.length);
  return pools;
}

function openGroupIds(card, extra = null) {
  const ids = new Set([...card.querySelectorAll("[data-ux17-subject-group][open]")].map(node => node.dataset.ux17SubjectGroup));
  if (extra) ids.add(extra);
  return ids;
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
  renderSubjects(card, trackId);
}

function bindSubjectControls(card) {
  card.querySelectorAll("[data-ux17-all]").forEach(button => button.addEventListener("click", () => {
    const trackId = button.dataset.ux17All;
    const selection = readTempSelection();
    delete selection[trackId];
    saveTempSelection(selection);
    renderSubjects(card, trackId);
  }));

  card.querySelectorAll("[data-ux17-clear]").forEach(button => button.addEventListener("click", () => {
    const trackId = button.dataset.ux17Clear;
    const selection = readTempSelection();
    selection[trackId] = [];
    saveTempSelection(selection);
    renderSubjects(card, trackId);
  }));

  card.querySelectorAll("[data-ux17-subject-button]").forEach(button => button.addEventListener("click", () => {
    setCustomSubject(card, button.dataset.ux17Track, button.dataset.ux17Subject);
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
    ? `<div class="ux17-subjects-head"><div><small>Personalize o conteúdo</small><strong>Quais matérias você quer fazer agora?</strong></div><span>“Todas” mantém o recorte completo; tocar numa matéria inicia uma seleção específica.</span></div><div class="ux17-subject-list">${pools.map(pool => subjectGroup(pool, openIds)).join("")}</div>`
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
  if (!ids.length) return toast("Não há questões disponíveis para as matérias escolhidas nessa combinação.", "info");
  const names = pools.map(pool => `${pool.track.label} (${pool.allMode ? "todas" : `${pool.names.length} matérias`})`).join(" + ");
  const uniqueSubjects = [...new Set(pools.flatMap(pool => pool.names))];
  createCompatibleSession({
    id: `estudo-hoje-materias-${dateKey(Date.now())}`,
    name: `Estudo de hoje — ${names}`,
    questionIds: ids,
    mode: "treino",
    minutes: ids.length * 2,
    discipline: uniqueSubjects.length === 1 ? uniqueSubjects[0] : "Matérias selecionadas",
    source: "Provas/simulados filtrados por edital e pelas matérias escolhidas na Home",
    cargo: pools.length === 1 ? pools[0].track.target : "multicargo",
  });
}

function replaceStartButton(card) {
  const current = card.querySelector("[data-ux16-start]");
  if (!current || current.dataset.ux17Start) return;
  const replacement = current.cloneNode(true);
  replacement.dataset.ux17Start = "";
  replacement.textContent = "Começar com estas matérias";
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
  const stable = card.dataset.ux17Ready && card.querySelector("[data-ux17-subjects]") && card.querySelector("[data-ux17-start]");
  if (!stable) enhanceCard(card);
}

function arm() {
  tick();
  if (!watchdog && currentRoute() === "inicio") watchdog = window.setInterval(tick, 900);
}

window.addEventListener("hashchange", () => window.setTimeout(arm, 120));
ensureData().then(() => window.setTimeout(arm, 120)).catch(error => console.error("Falha ao preparar matérias do Estudo de hoje v2.17:", error));