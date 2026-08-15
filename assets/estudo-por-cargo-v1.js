import {
  activeHistory,
  currentRoute,
  ensureData,
  esc,
  materialIdFromIndex,
  observeApp,
  profileKey,
  profileName,
  readJSON,
  saveJSON,
  shuffle,
  state,
  toast,
} from "./shared-v2-13.js?v=1";

const MAP_URL = "./data/release/edital-map-v1.json";
const TARGET_KEY = () => profileKey("studyByRole.target.v1");
const PAGE_SELECTOR = "[data-estudo-por-cargo-page]";
let mapPromise = null;
let entryInjecting = false;

function cleanLabel(value = "") {
  return String(value).replace(/^\s*\d+(?:\.\d+)*\s*/, "").trim();
}

function loadMap() {
  if (mapPromise) return mapPromise;
  mapPromise = fetch(MAP_URL, {cache: "no-store"}).then(response => {
    if (!response.ok) throw new Error(`Mapa do edital indisponível: HTTP ${response.status}`);
    return response.json();
  }).catch(error => {
    mapPromise = null;
    throw error;
  });
  return mapPromise;
}

function answeredIdsForAttempt(attempt) {
  if (Array.isArray(attempt?.answeredQuestionIds)) return attempt.answeredQuestionIds.map(String);
  if (attempt?.answers && typeof attempt.answers === "object") {
    return Object.entries(attempt.answers).filter(([, answer]) => Boolean(answer)).map(([id]) => String(id));
  }
  return Array.isArray(attempt?.questionIds) ? attempt.questionIds.map(String) : [];
}

function globalQuestionState() {
  const answered = new Set();
  const latest = new Map();
  for (const attempt of activeHistory()) {
    const answeredHere = new Set(answeredIdsForAttempt(attempt));
    for (const id of answeredHere) answered.add(id);
    for (const result of attempt?.questionResults || []) {
      const id = String(result?.id || "");
      if (!id || (!answeredHere.has(id) && !result?.answer)) continue;
      answered.add(id);
      if (!latest.has(id)) latest.set(id, {
        id,
        correct: typeof result.correct === "boolean" ? result.correct : null,
        answer: result.answer || attempt?.answers?.[id] || null,
        at: attempt.completedAt || attempt.finishedAt || attempt.endedAt || attempt.createdAt || attempt.savedAt || null,
        mode: attempt.mode || "",
        materialId: result.materialId || attempt.materialId || materialIdFromIndex(state.catalog?.question_index?.[id]) || "",
      });
    }
    for (const id of answeredHere) {
      if (latest.has(id)) continue;
      latest.set(id, {
        id,
        correct: null,
        answer: attempt?.answers?.[id] || null,
        at: attempt.completedAt || attempt.finishedAt || attempt.endedAt || attempt.createdAt || attempt.savedAt || null,
        mode: attempt.mode || "",
        materialId: attempt.materialId || materialIdFromIndex(state.catalog?.question_index?.[id]) || "",
      });
    }
  }
  return {answered, latest};
}

function eligibleSections(map, targetCode) {
  const target = map.targets?.[targetCode];
  if (!target) return [];
  const generalSections = new Set(map.general_section_ids || []);
  const specificItems = new Set(target.specific_item_ids || []);
  return (map.sections || []).filter(section => {
    if (generalSections.has(section.id)) return true;
    return (section.items || []).some(item => specificItems.has(item.id));
  }).map(section => ({
    ...section,
    items: (section.items || []).filter(item => generalSections.has(section.id) || specificItems.has(item.id)),
  }));
}

function progressForIds(ids, progress) {
  const unique = [...new Set(ids || [])];
  const answered = unique.filter(id => progress.answered.has(id));
  const evaluated = answered.map(id => progress.latest.get(id)).filter(row => typeof row?.correct === "boolean");
  const correct = evaluated.filter(row => row.correct).length;
  const wrongIds = answered.filter(id => progress.latest.get(id)?.correct === false);
  return {
    total: unique.length,
    answered: answered.length,
    remaining: Math.max(0, unique.length - answered.length),
    correct,
    wrong: wrongIds.length,
    wrongIds,
    accuracy: evaluated.length ? Math.round(correct / evaluated.length * 100) : null,
  };
}

function sectionQuestionIds(section) {
  return [...new Set((section.items || []).flatMap(item => item.question_ids || []))];
}

function targetStats(map, targetCode, progress) {
  const sections = eligibleSections(map, targetCode);
  const ids = [...new Set(sections.flatMap(sectionQuestionIds))];
  const stats = progressForIds(ids, progress);
  const topics = sections.flatMap(section => section.items || []);
  const started = topics.filter(item => progressForIds(item.question_ids, progress).answered > 0).length;
  return {...stats, subjects: sections.length, topics: topics.length, startedTopics: started};
}

function materialForQuestion(id) {
  const materialId = materialIdFromIndex(state.catalog?.question_index?.[id]);
  return state.catalog?.materials?.find(item => item.id === materialId) || null;
}

function questionCode(id) {
  const raw = state.catalog?.question_index?.[id];
  const meta = typeof raw === "string" ? {} : (raw || {});
  return meta.codigo || meta.code || id;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {day: "2-digit", month: "2-digit", year: "numeric"}).format(date);
}

function sessionPayload({targetCode, section, item, questionIds, label}) {
  return {
    version: 4,
    material: {
      id: `estudo-cargo-${targetCode}-${item.id}-${Date.now()}`,
      nome: `Estudo por Cargo — ${targetCode} — ${cleanLabel(section.label)} — ${cleanLabel(item.label)} — ${label}`,
      disciplina: cleanLabel(section.label),
      fonte: `Edital SEDES/DF 2026 · ${cleanLabel(item.label)}`,
      tipo_material: "simulado",
      ano: 2026,
      codigo_cargo: targetCode,
      tempo_sugerido_minutos: Math.max(2, questionIds.length * 2),
    },
    questionIds: [...new Set(questionIds)],
    mode: "treino",
    current: 0,
    answers: {},
    confirmed: {},
    flagged: {},
    elapsedBase: 0,
    questionTimes: {},
    savedAt: new Date().toISOString(),
  };
}

function startSession({targetCode, section, item, questionIds, label}) {
  const ids = [...new Set(questionIds || [])];
  if (!ids.length) return toast("Não há questões disponíveis para esta ação.", "info");
  const existing = readJSON(profileKey("session.v3"), null);
  if (existing && !confirm("Existe uma tentativa salva. Deseja substituí-la por esta sessão?")) return;
  if (!saveJSON(profileKey("session.v3"), sessionPayload({targetCode, section, item, questionIds: ids, label}))) return;
  window.location.assign("./index.html#/resolver");
}

function orderedIds(item, subset, progress) {
  const ids = [...new Set(item.question_ids || [])];
  const fresh = shuffle(ids.filter(id => !progress.answered.has(id)));
  const wrong = shuffle(ids.filter(id => progress.latest.get(id)?.correct === false));
  const seen = shuffle(ids.filter(id => progress.answered.has(id)));
  if (subset === "fresh") return fresh;
  if (subset === "wrong") return wrong;
  return [...fresh, ...seen];
}

function pickIds(item, subset, size, progress) {
  const ordered = [...new Set(orderedIds(item, subset, progress))];
  return size === "all" ? ordered : ordered.slice(0, Math.max(1, Number(size) || 10));
}

function getQueryState(map) {
  const params = new URLSearchParams(location.search);
  const saved = readJSON(TARGET_KEY(), "202");
  const targetCode = map.targets?.[params.get("cargo")] ? params.get("cargo") : map.targets?.[saved] ? saved : "202";
  const sections = eligibleSections(map, targetCode);
  const sectionId = sections.some(section => section.id === params.get("materia")) ? params.get("materia") : "";
  const section = sections.find(candidate => candidate.id === sectionId) || null;
  const itemId = section?.items?.some(item => item.id === params.get("topico")) ? params.get("topico") : "";
  return {targetCode, sectionId, itemId};
}

function setQueryState({targetCode, sectionId = "", itemId = ""}) {
  const params = new URLSearchParams();
  params.set("cargo", targetCode);
  if (sectionId) params.set("materia", sectionId);
  if (itemId) params.set("topico", itemId);
  history.replaceState(history.state, "", `${location.pathname}?${params.toString()}`);
  saveJSON(TARGET_KEY(), targetCode);
}

function renderKpis(map, targetCode, progress) {
  const stats = targetStats(map, targetCode, progress);
  return `<div class="role-kpis" data-role-kpis>
    <article><span>Matérias</span><strong>${stats.subjects}</strong><small>${stats.topics} tópicos do edital</small></article>
    <article><span>Tópicos estudados</span><strong>${stats.startedTopics}/${stats.topics}</strong><small>alimentado por qualquer modo</small></article>
    <article><span>Questões feitas</span><strong>${stats.answered.toLocaleString("pt-BR")}</strong><small>${stats.remaining.toLocaleString("pt-BR")} inéditas mapeadas</small></article>
    <article><span>Aproveitamento</span><strong>${stats.accuracy == null ? "—" : `${stats.accuracy}%`}</strong><small>${stats.wrong} erro(s) no estado mais recente</small></article>
  </div>`;
}

function renderSubjectCards(sections, progress) {
  return `<div class="role-subject-grid" data-role-subject-grid>${sections.map(section => {
    const stats = progressForIds(sectionQuestionIds(section), progress);
    const percent = stats.total ? Math.round(stats.answered / stats.total * 100) : 0;
    return `<button type="button" class="role-subject-card" data-role-subject="${esc(section.id)}">
      <span class="role-scope">${section.scope === "general" ? "Conhecimentos gerais" : "Conhecimentos específicos"}</span>
      <strong>${esc(cleanLabel(section.label))}</strong>
      <span>${(section.items || []).length} tópicos · ${stats.total.toLocaleString("pt-BR")} questões</span>
      <span>${stats.answered.toLocaleString("pt-BR")} feitas · ${stats.accuracy == null ? "sem taxa" : `${stats.accuracy}% de acerto`}</span>
      <i class="role-progress"><b style="width:${percent}%"></b></i>
      <em>Abrir matéria →</em>
    </button>`;
  }).join("")}</div>`;
}

function renderTopics(section, progress) {
  return `<section class="role-panel" data-role-topics>
    <div class="role-panel-head"><div><p class="eyebrow">Matéria</p><h2>${esc(cleanLabel(section.label))}</h2><p>Escolha um tópico para ver exatamente quais questões estão disponíveis e o que você já realizou.</p></div><button type="button" class="btn ghost" data-role-back-subjects>← Todas as matérias</button></div>
    <div class="role-topic-list">${(section.items || []).map(item => {
      const stats = progressForIds(item.question_ids, progress);
      const percent = stats.total ? Math.round(stats.answered / stats.total * 100) : 0;
      return `<article class="role-topic-card ${stats.total ? "" : "is-empty"}" data-role-topic-card="${esc(item.id)}">
        <div class="role-topic-copy"><strong>${esc(cleanLabel(item.label))}</strong><span>${stats.total} questões · ${stats.answered} feitas · ${stats.remaining} inéditas${stats.accuracy == null ? "" : ` · ${stats.accuracy}% de acerto`}</span><i class="role-progress"><b style="width:${percent}%"></b></i></div>
        <button type="button" class="btn ${stats.total ? "primary" : "secondary"}" data-role-topic="${esc(item.id)}" ${stats.total ? "" : "disabled"}>${stats.total ? "Abrir tópico" : "Sem questões"}</button>
      </article>`;
    }).join("")}</div>
  </section>`;
}

function statusMarkup(id, progress) {
  if (!progress.answered.has(id)) return `<span class="role-question-status fresh">Inédita</span>`;
  const latest = progress.latest.get(id);
  if (latest?.correct === true) return `<span class="role-question-status correct">Acertou</span>`;
  if (latest?.correct === false) return `<span class="role-question-status wrong">Errou</span>`;
  return `<span class="role-question-status done">Realizada</span>`;
}

function renderQuestions(map, targetCode, section, item, progress) {
  const stats = progressForIds(item.question_ids, progress);
  const percent = stats.total ? Math.round(stats.answered / stats.total * 100) : 0;
  return `<section class="role-panel role-topic-detail" data-role-topic-detail="${esc(item.id)}">
    <div class="role-breadcrumb"><button type="button" class="link-button" data-role-back-subjects>Matérias</button><span>›</span><button type="button" class="link-button" data-role-back-topics>${esc(cleanLabel(section.label))}</button><span>›</span><strong>${esc(cleanLabel(item.label))}</strong></div>
    <div class="role-topic-hero"><div><p class="eyebrow">Tópico do edital</p><h1>${esc(cleanLabel(item.label))}</h1><p>${stats.total} questões mapeadas · ${stats.answered} realizadas · ${stats.remaining} inéditas · ${stats.wrong} erro(s).</p></div><div class="role-topic-score"><strong>${stats.accuracy == null ? "—" : `${stats.accuracy}%`}</strong><span>aproveitamento</span></div></div>
    <i class="role-progress role-progress-large"><b style="width:${percent}%"></b></i>
    <div class="role-topic-actions" role="group" aria-label="Ações do tópico">
      <button type="button" class="btn primary" data-role-run="fresh" data-role-size="10" ${stats.remaining ? "" : "disabled"}>Resolver 10 inéditas</button>
      <button type="button" class="btn secondary" data-role-run="wrong" data-role-size="all" ${stats.wrong ? "" : "disabled"}>Revisar erros (${stats.wrong})</button>
      <button type="button" class="btn secondary" data-role-run="mixed" data-role-size="20" ${stats.total ? "" : "disabled"}>Resolver 20</button>
      <button type="button" class="btn ghost" data-role-run="mixed" data-role-size="all" ${stats.total ? "" : "disabled"}>Todas</button>
    </div>
    <div class="role-question-head"><div><h2>Questões deste tópico</h2><p>As questões abaixo são as mesmas do banco principal; o status considera seu histórico inteiro.</p></div><label>Filtrar<select data-role-question-filter><option value="all">Todas</option><option value="fresh">Inéditas</option><option value="wrong">Erros</option><option value="correct">Acertos</option></select></label></div>
    <div class="role-question-list" data-role-question-list>${renderQuestionRows(map, targetCode, section, item, progress, "all")}</div>
  </section>`;
}

function renderQuestionRows(map, targetCode, section, item, progress, filter) {
  let ids = [...new Set(item.question_ids || [])];
  if (filter === "fresh") ids = ids.filter(id => !progress.answered.has(id));
  if (filter === "wrong") ids = ids.filter(id => progress.latest.get(id)?.correct === false);
  if (filter === "correct") ids = ids.filter(id => progress.latest.get(id)?.correct === true);
  if (!ids.length) return `<div class="role-empty"><strong>Nenhuma questão neste filtro.</strong><span>Escolha outro filtro ou volte aos tópicos.</span></div>`;
  return ids.map(id => {
    const material = materialForQuestion(id);
    const latest = progress.latest.get(id);
    const date = formatDate(latest?.at);
    return `<article class="role-question-row" data-role-question="${esc(id)}">
      <div><div class="role-question-title"><strong>${esc(questionCode(id))}</strong>${statusMarkup(id, progress)}<span class="role-format">${esc(map.question_formats?.[id] || "Questão")}</span></div><small>${esc(material?.nome || material?.id || "Banco de questões")}${date ? ` · última resposta ${esc(date)}` : ""}</small></div>
      <button type="button" class="btn secondary" data-role-run-one="${esc(id)}">Fazer questão</button>
    </article>`;
  }).join("");
}

function renderPage(map) {
  const app = document.querySelector("#cargo-study-app");
  if (!app) return;
  const query = getQueryState(map);
  const {targetCode, sectionId, itemId} = query;
  saveJSON(TARGET_KEY(), targetCode);
  const target = map.targets[targetCode];
  const sections = eligibleSections(map, targetCode);
  const section = sections.find(candidate => candidate.id === sectionId) || null;
  const item = section?.items?.find(candidate => candidate.id === itemId) || null;
  const progress = globalQuestionState();

  app.innerHTML = `<section class="role-study-shell" data-role-study-shell data-role-target-code="${esc(targetCode)}">
    <div class="role-hero card"><div><p class="eyebrow">Estudo por Cargo</p><h1>${esc(target.label)} · Cargo ${esc(targetCode)}</h1><p>Escolha a matéria, entre no tópico e faça somente as questões ligadas àquele ponto. Seu progresso inclui respostas feitas no Banco, Prova Real, simulados, revisões e Edital Verticalizado.</p></div><div class="role-profile"><span>Perfil ativo</span><strong>${esc(profileName())}</strong><small>histórico global por ID permanente</small></div></div>
    <div class="role-targets" role="group" aria-label="Escolher cargo">
      ${["202", "400"].map(code => `<button type="button" data-role-target="${code}" class="${code === targetCode ? "active" : ""}" aria-pressed="${code === targetCode}"><strong>${esc(map.targets[code].label)}</strong><span>${esc(map.targets[code].subtitle)}</span></button>`).join("")}
    </div>
    ${renderKpis(map, targetCode, progress)}
    ${!section ? `<section class="role-section-intro"><div><p class="eyebrow">1 · Matérias</p><h2>Escolha uma matéria do ${esc(target.label)}</h2><p>São exibidas apenas as matérias que pertencem ao edital deste cargo.</p></div><a class="btn ghost" href="./index.html#/estudar">Abrir Banco livre</a></section>${renderSubjectCards(sections, progress)}` : item ? renderQuestions(map, targetCode, section, item, progress) : renderTopics(section, progress)}
  </section>`;
  bindPageEvents(map, query, progress);
}

function bindPageEvents(map, query, progress) {
  document.querySelectorAll("[data-role-target]").forEach(button => button.addEventListener("click", () => {
    setQueryState({targetCode: button.dataset.roleTarget});
    renderPage(map);
  }));
  document.querySelectorAll("[data-role-subject]").forEach(button => button.addEventListener("click", () => {
    setQueryState({targetCode: query.targetCode, sectionId: button.dataset.roleSubject});
    renderPage(map);
    document.querySelector("#cargo-study-app")?.scrollIntoView({behavior: "smooth", block: "start"});
  }));
  document.querySelectorAll("[data-role-topic]").forEach(button => button.addEventListener("click", () => {
    setQueryState({targetCode: query.targetCode, sectionId: query.sectionId, itemId: button.dataset.roleTopic});
    renderPage(map);
    document.querySelector("#cargo-study-app")?.scrollIntoView({behavior: "smooth", block: "start"});
  }));
  document.querySelectorAll("[data-role-back-subjects]").forEach(button => button.addEventListener("click", () => {
    setQueryState({targetCode: query.targetCode});
    renderPage(map);
  }));
  document.querySelectorAll("[data-role-back-topics]").forEach(button => button.addEventListener("click", () => {
    setQueryState({targetCode: query.targetCode, sectionId: query.sectionId});
    renderPage(map);
  }));

  const sections = eligibleSections(map, query.targetCode);
  const section = sections.find(candidate => candidate.id === query.sectionId);
  const item = section?.items?.find(candidate => candidate.id === query.itemId);
  if (!section || !item) return;

  document.querySelectorAll("[data-role-run]").forEach(button => button.addEventListener("click", () => {
    const ids = pickIds(item, button.dataset.roleRun, button.dataset.roleSize, progress);
    const label = button.dataset.roleRun === "fresh" ? "inéditas" : button.dataset.roleRun === "wrong" ? "revisão de erros" : "questões do tópico";
    startSession({targetCode: query.targetCode, section, item, questionIds: ids, label});
  }));
  document.querySelectorAll("[data-role-run-one]").forEach(button => button.addEventListener("click", () => {
    startSession({targetCode: query.targetCode, section, item, questionIds: [button.dataset.roleRunOne], label: "questão individual"});
  }));
  const filter = document.querySelector("[data-role-question-filter]");
  filter?.addEventListener("change", () => {
    const list = document.querySelector("[data-role-question-list]");
    if (list) list.innerHTML = renderQuestionRows(map, query.targetCode, section, item, progress, filter.value);
    document.querySelectorAll("[data-role-run-one]").forEach(button => button.addEventListener("click", () => {
      startSession({targetCode: query.targetCode, section, item, questionIds: [button.dataset.roleRunOne], label: "questão individual"});
    }));
  });
}

async function initChildPage() {
  try {
    await ensureData();
    const map = await loadMap();
    renderPage(map);
  } catch (error) {
    console.error(error);
    const app = document.querySelector("#cargo-study-app");
    if (app) app.innerHTML = `<section class="card error-state"><p class="eyebrow">Falha de carregamento</p><h1>Não foi possível abrir o Estudo por Cargo.</h1><p>Seu progresso não foi alterado. Atualize a página para tentar novamente.</p><button class="btn primary" type="button" onclick="location.reload()">Tentar novamente</button></section>`;
  }
}

async function injectEntry() {
  if (document.querySelector(PAGE_SELECTOR) || entryInjecting || currentRoute() !== "estudar" || document.querySelector("[data-role-study-entry]")) return;
  entryInjecting = true;
  try {
    const map = await loadMap();
    if (currentRoute() !== "estudar" || document.querySelector("[data-role-study-entry]")) return;
    const anchor = document.querySelector("[data-ux-study-launcher]") || document.querySelector(".study-view-tabs") || document.querySelector(".page-heading") || document.querySelector("#app > *");
    if (!anchor) return;
    const card = document.createElement("section");
    card.className = "card role-study-entry";
    card.dataset.roleStudyEntry = "";
    card.innerHTML = `<div><p class="eyebrow">Novo · Estudo por Cargo</p><h2>Matérias → tópicos → questões</h2><p>Entre por Técnico 202 ou Administrador 400 e navegue somente pelas matérias do edital daquele cargo. O progresso considera tudo que você já respondeu na plataforma.</p></div><div class="role-study-entry-actions">${["202", "400"].map(code => `<a class="btn ${code === "202" ? "primary" : "secondary"}" href="./estudo-por-cargo.html?cargo=${code}">${esc(map.targets[code].label)} · ${code}</a>`).join("")}</div>`;
    anchor.insertAdjacentElement("afterend", card);
  } catch (error) {
    console.error(error);
  } finally {
    entryInjecting = false;
  }
}

if (document.querySelector(PAGE_SELECTOR)) {
  initChildPage();
} else {
  observeApp(injectEntry);
}
