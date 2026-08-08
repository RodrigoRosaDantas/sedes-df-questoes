import {
  activeHistory,
  createCompatibleSession,
  currentRoute,
  ensureData,
  esc,
  materialIdFromIndex,
  profileKey,
  readJSON,
  saveJSON,
  state,
  toast,
} from "./shared-v2-13.js?v=1";

const DAILY_SIZE = 25;
const SELECTION_KEY = () => profileKey("homeStudyToday.v2");
const DEFAULT_SELECTION = ["prova-202", "prova-400"];
let homeObserver = null;
let stabilityRetry = 0;

const COMMON_DISCIPLINES = [
  "lingua portuguesa",
  "distrito federal",
  "ride",
  "primeiros socorros",
  "politicas para mulheres",
  "seguranca alimentar",
  "legislacao do distrito federal",
];

const COMMON_TOPICS = [
  "ride",
  "distrito federal",
  "plano distrital de politica para mulheres",
  "pdpm",
  "maria da penha",
  "lei 11.340",
  "lodf",
  "lei organica do distrito federal",
  "lc 840",
  "lei complementar 840",
  "primeiros socorros",
  "programas sociais do df",
  "beneficios eventuais",
  "sisan",
  "seguranca alimentar",
  "restaurante comunitario",
  "lei 7.484",
];

const TARGETS = {
  "202": {
    label: "Técnico Administrativo",
    subtitle: "Cargo 202 · TDAS",
    disciplines: [
      ...COMMON_DISCIPLINES,
      "direito administrativo",
      "administracao publica",
      "direito constitucional",
      "arquivologia",
      "redacao oficial",
      "atendimento ao publico",
      "administracao de materiais",
      "gestao de materiais",
      "recursos materiais",
      "gestao patrimonial",
      "patrimonio",
      "licitacoes",
      "compras publicas",
    ],
    topics: [
      ...COMMON_TOPICS,
      "administrativo",
      "atos administrativos",
      "agentes publicos",
      "provimento",
      "vacancia",
      "direitos e deveres",
      "responsabilidade",
      "processo administrativo disciplinar",
      "pad",
      "suas",
      "pnas",
      "nob/suas",
      "nob suas",
      "segurancas socioassistenciais",
      "protocolo",
      "classificacao de documentos",
      "metodos de arquivamento",
      "preservacao documental",
      "digitalizacao",
      "atendimento ao publico",
      "trabalho em equipe",
      "redacao oficial",
      "comunicacoes administrativas",
      "classificacao de materiais",
      "estoque",
      "armazenagem",
      "tombamento",
      "inventario patrimonial",
      "baixa patrimonial",
      "compras publicas",
      "lei 14.133",
      "licitacao",
      "contratacao publica",
    ],
  },
  "400": {
    label: "Administrador",
    subtitle: "Cargo 400 · EDAS Administração",
    disciplines: [
      ...COMMON_DISCIPLINES,
      "administracao",
      "administracao geral",
      "teorias da administracao",
      "administracao publica",
      "gestao publica",
      "gestao organizacional",
      "gestao de pessoas",
      "gestao de projetos",
      "gestao de riscos",
      "administracao financeira e orcamentaria",
      "afo",
      "orcamento publico",
      "financas publicas",
      "organizacao sistemas e metodos",
      "os&m",
      "qualidade",
    ],
    topics: [
      ...COMMON_TOPICS,
      "suas",
      "loas",
      "pnas",
      "nob/suas",
      "nob suas",
      "siafem",
      "administracao por objetivos",
      "apo",
      "processo decisorio",
      "descentralizacao",
      "delegacao",
      "arquitetura organizacional",
      "estrutura organizacional",
      "modelos de excelencia em gestao publica",
      "planejamento",
      "indicadores",
      "qualidade",
      "gestao de pessoas",
      "gestao por competencias",
      "analise e descricao de cargos",
      "cargos carreiras e salarios",
      "motivacao",
      "etica",
      "gestao de projetos",
      "gestao de riscos",
      "mrosc",
      "cadunico",
      "cadastro unico",
      "controle social",
      "orcamento",
      "afo",
    ],
  },
};

const TRACKS = [
  {id: "prova-202", type: "prova", target: "202", eyebrow: "Provas anteriores", icon: "P"},
  {id: "prova-400", type: "prova", target: "400", eyebrow: "Provas anteriores", icon: "P"},
  {id: "simulado-202", type: "simulado", target: "202", eyebrow: "Simulados", icon: "S"},
  {id: "simulado-400", type: "simulado", target: "400", eyebrow: "Simulados", icon: "S"},
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
  const target = TARGETS[targetCode];
  if (!target) return new Set();
  const result = new Set();
  for (const discipline of state.studyIndex?.disciplines || []) {
    if (matchesDiscipline(discipline.name, target.disciplines)) {
      (discipline.question_ids || []).forEach(id => result.add(id));
      continue;
    }
    for (const topic of discipline.topics || []) {
      const descriptor = `${discipline.name} ${topic.name}`;
      if (includesAny(descriptor, target.topics)) (topic.question_ids || []).forEach(id => result.add(id));
    }
  }
  return result;
}

function materialMap() {
  return new Map((state.catalog?.materials || []).map(material => [String(material.id), material]));
}

function trackPool(track) {
  const materials = materialMap();
  const eligible = targetQuestionIds(track.target);
  const ids = [];
  const materialIds = new Set();
  for (const id of eligible) {
    const materialId = materialIdFromIndex(state.catalog?.question_index?.[id]);
    const material = materials.get(String(materialId || ""));
    if (!material || normalize(material.tipo_material) !== track.type) continue;
    ids.push(id);
    materialIds.add(material.id);
  }
  return {ids: [...new Set(ids)], materialIds};
}

function trackStats(track, answered) {
  const pool = trackPool(track);
  const seen = pool.ids.filter(id => answered.has(id)).length;
  const fresh = pool.ids.length - seen;
  const viewed = pool.ids.length ? Math.round(seen / pool.ids.length * 100) : 0;
  return {...pool, seen, fresh, viewed};
}

function readSelection() {
  const stored = readJSON(SELECTION_KEY(), DEFAULT_SELECTION);
  if (!Array.isArray(stored)) return [...DEFAULT_SELECTION];
  return stored.filter(id => TRACKS.some(track => track.id === id));
}

function writeSelection(ids) {
  saveJSON(SELECTION_KEY(), ids);
}

function balancedDailyIds(selectedTracks, statsByTrack, answered) {
  const picked = [];
  const used = new Set();
  const today = dateKey(Date.now());
  const ordered = [...selectedTracks].sort((a, b) => Number(b.type === "prova") - Number(a.type === "prova"));
  const base = Math.floor(DAILY_SIZE / Math.max(1, ordered.length));
  let remainder = DAILY_SIZE - base * ordered.length;
  const add = (ids, count, salt) => {
    if (count <= 0) return;
    const fresh = stableSort(ids.filter(id => !answered.has(id) && !used.has(id)), `${today}:${salt}:fresh`);
    const revisits = stableSort(ids.filter(id => answered.has(id) && !used.has(id)), `${today}:${salt}:seen`);
    for (const id of [...fresh, ...revisits]) {
      if (picked.length >= DAILY_SIZE || count <= 0) break;
      picked.push(id);
      used.add(id);
      count -= 1;
    }
  };
  for (const track of ordered) {
    const quota = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    add(statsByTrack.get(track.id)?.ids || [], quota, track.id);
  }
  if (picked.length < DAILY_SIZE) {
    const combined = ordered.flatMap(track => statsByTrack.get(track.id)?.ids || []);
    add(combined, DAILY_SIZE - picked.length, "fill");
  }
  return picked;
}

function trackCard(track, stats, selected) {
  const target = TARGETS[track.target];
  const materialWord = track.type === "prova" ? "provas" : "simulados";
  return `<label class="ux16-track ${selected ? "selected" : ""}" data-ux16-track="${track.id}">
    <input type="checkbox" value="${track.id}" ${selected ? "checked" : ""} data-ux16-track-input>
    <span class="ux16-track-mark" aria-hidden="true">${track.icon}</span>
    <span class="ux16-track-copy"><small>${track.eyebrow}</small><strong>${esc(target.label)}</strong><em>${esc(target.subtitle)}</em></span>
    <span class="ux16-track-stats"><b>${stats.ids.length.toLocaleString("pt-BR")}</b><small>questões · ${stats.materialIds.size} ${materialWord}</small><em>${stats.fresh.toLocaleString("pt-BR")} inéditas · ${stats.viewed}% vistas</em></span>
    <span class="ux16-check" aria-hidden="true">✓</span>
  </label>`;
}

function summaryText(selectedTracks, statsByTrack) {
  const total = new Set(selectedTracks.flatMap(track => statsByTrack.get(track.id)?.ids || [])).size;
  if (!selectedTracks.length) return "Selecione pelo menos uma das quatro opções.";
  return `${selectedTracks.length} opção(ões) selecionada(s) · ${total.toLocaleString("pt-BR")} questões elegíveis · sessão diária de até ${DAILY_SIZE} questões.`;
}

function rewireHeaderAction(card) {
  const button = document.querySelector("[data-ux15-home] .ux15-home-head [data-ux15-start]");
  if (!button || button.dataset.ux16Rewired) return;
  const replacement = button.cloneNode(true);
  replacement.dataset.ux16Rewired = "";
  replacement.dataset.uxStartToday = "";
  replacement.textContent = "Escolher estudo de hoje";
  replacement.removeAttribute("data-ux15-start");
  replacement.addEventListener("click", () => {
    card.scrollIntoView({behavior: "smooth", block: "center"});
    card.querySelector("[data-ux16-track]")?.focus?.({preventScroll: true});
  });
  button.replaceWith(replacement);
}

function enhanceTodayCard() {
  if (currentRoute() !== "inicio") return false;
  const home = document.querySelector("#app > [data-ux15-home]");
  const card = home?.querySelector("[data-ux-today]");
  if (!home || !card) return false;
  if (card.dataset.ux16Ready) return true;

  const answered = answeredIds();
  const selectedIds = new Set(readSelection());
  const statsByTrack = new Map(TRACKS.map(track => [track.id, trackStats(track, answered)]));
  card.dataset.ux16Ready = "";
  card.classList.add("ux16-today-card");
  card.innerHTML = `<div class="ux16-today-head"><div><p class="eyebrow">Estudo de hoje</p><h2>Escolha a origem e o cargo.</h2><p>As questões são filtradas pelo conteúdo do respectivo edital. Provas e simulados ficam separados para você decidir a fonte do treino.</p></div><span class="ux16-edital-badge">Edital → disciplina → assunto</span></div>
    <div class="ux16-track-grid" role="group" aria-label="Opções do estudo de hoje">${TRACKS.map(track => trackCard(track, statsByTrack.get(track.id), selectedIds.has(track.id))).join("")}</div>
    <div class="ux16-today-footer"><div><strong data-ux16-summary></strong><small>Prioridade para questões ainda não respondidas; se faltar conteúdo, entram revisões do mesmo recorte.</small></div><button class="btn primary" data-ux-start-today data-ux16-start>Começar seleção</button></div>
    <details class="ux16-criteria"><summary>Como o site decide se a questão pertence ao edital?</summary><p>O recorte usa a classificação publicada de <strong>disciplina e assunto/tópico</strong> e a cruza com os eixos dos macros pós-edital dos cargos 202 e 400. O tipo do material define se a questão entra em <strong>Provas</strong> ou <strong>Simulados</strong>. Uma questão de outro órgão pode entrar quando o conteúdo dela pertence ao edital selecionado.</p></details>`;

  const update = () => {
    const checked = [...card.querySelectorAll("[data-ux16-track-input]:checked")].map(input => input.value);
    writeSelection(checked);
    card.querySelectorAll("[data-ux16-track]").forEach(node => node.classList.toggle("selected", checked.includes(node.dataset.ux16Track)));
    const selectedTracks = TRACKS.filter(track => checked.includes(track.id));
    const summary = card.querySelector("[data-ux16-summary]");
    if (summary) summary.textContent = summaryText(selectedTracks, statsByTrack);
    const start = card.querySelector("[data-ux16-start]");
    if (start) start.disabled = !selectedTracks.length || !selectedTracks.some(track => (statsByTrack.get(track.id)?.ids.length || 0) > 0);
  };

  card.querySelectorAll("[data-ux16-track-input]").forEach(input => input.addEventListener("change", update));
  card.querySelector("[data-ux16-start]")?.addEventListener("click", () => {
    const checked = [...card.querySelectorAll("[data-ux16-track-input]:checked")].map(input => input.value);
    const selectedTracks = TRACKS.filter(track => checked.includes(track.id));
    if (!selectedTracks.length) return toast("Selecione pelo menos uma opção para o estudo de hoje.", "info");
    const ids = balancedDailyIds(selectedTracks, statsByTrack, answered);
    if (!ids.length) return toast("Não há questões elegíveis para esta combinação de edital e fonte.", "info");
    const names = selectedTracks.map(track => `${track.type === "prova" ? "Provas" : "Simulados"} ${track.target}`).join(" + ");
    createCompatibleSession({
      id: `estudo-hoje-edital-${dateKey(Date.now())}`,
      name: `Estudo de hoje — ${names}`,
      questionIds: ids,
      mode: "treino",
      minutes: ids.length * 2,
      discipline: "Recorte por edital",
      source: "Provas/simulados filtrados por disciplina e assunto do edital",
      cargo: selectedTracks.length === 1 ? selectedTracks[0].target : "multicargo",
    });
  });
  update();
  rewireHeaderAction(card);
  return true;
}

function stopHomeObserver() {
  homeObserver?.disconnect();
  homeObserver = null;
}

function armHomeEnhancement() {
  stopHomeObserver();
  if (currentRoute() !== "inicio") return;
  if (enhanceTodayCard()) {
    window.setTimeout(() => {
      if (currentRoute() !== "inicio") return;
      const stable = document.querySelector("#app > [data-ux15-home] [data-ux-today][data-ux16-ready]");
      if (stable) stabilityRetry = 0;
      else if (stabilityRetry < 3) {
        stabilityRetry += 1;
        armHomeEnhancement();
      }
    }, 180);
    return;
  }
  const app = document.querySelector("#app");
  if (!app) return;
  homeObserver = new MutationObserver(() => {
    if (!enhanceTodayCard()) return;
    stopHomeObserver();
    window.setTimeout(() => {
      const stable = document.querySelector("#app > [data-ux15-home] [data-ux-today][data-ux16-ready]");
      if (!stable && currentRoute() === "inicio" && stabilityRetry < 3) {
        stabilityRetry += 1;
        armHomeEnhancement();
      } else if (stable) stabilityRetry = 0;
    }, 180);
  });
  homeObserver.observe(app, {childList: true, subtree: true});
}

window.addEventListener("hashchange", () => {
  stabilityRetry = 0;
  window.setTimeout(armHomeEnhancement, 0);
});

ensureData()
  .then(() => armHomeEnhancement())
  .catch(error => console.error("Falha ao preparar Estudo de hoje v2.16:", error));
