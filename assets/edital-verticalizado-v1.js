import {
  activeHistory,
  createCompatibleSession,
  currentRoute,
  ensureData,
  esc,
  materialIdFromIndex,
  observeApp,
  profileKey,
  readJSON,
  saveJSON,
  shuffle,
  state,
  toast,
} from "./shared-v2-13.js?v=1";

const MAP_URL = "./data/release/edital-map-v1.json";
const TARGET_KEY = () => profileKey("editalVerticalizado.target.v1");
let mapPromise = null;
let verticalInjecting = false;

function ensureStyles() {
  if (document.querySelector('link[data-edital-verticalizado-css]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./assets/edital-verticalizado-v1.css?v=1";
  link.dataset.editalVerticalizadoCss = "";
  document.head.append(link);
}

async function loadMap() {
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
  const attempts = activeHistory();
  for (const attempt of attempts) {
    const answeredHere = new Set(answeredIdsForAttempt(attempt));
    for (const id of answeredHere) answered.add(id);
    for (const item of attempt?.questionResults || []) {
      const id = String(item?.id || "");
      if (!id || (!answeredHere.has(id) && !item?.answer)) continue;
      answered.add(id);
      if (!latest.has(id)) {
        latest.set(id, {
          id,
          correct: typeof item.correct === "boolean" ? item.correct : null,
          answer: item.answer || attempt?.answers?.[id] || null,
          discipline: item.discipline || "",
          subject: item.assunto || "",
          materialId: item.materialId || attempt.materialId || materialIdFromIndex(state.catalog?.question_index?.[id]) || "",
          materialName: attempt.materialName || "",
          mode: attempt.mode || "",
          at: attempt.completedAt || attempt.finishedAt || attempt.endedAt || attempt.createdAt || attempt.savedAt || null,
        });
      }
    }
    for (const id of answeredHere) {
      if (latest.has(id)) continue;
      latest.set(id, {
        id,
        correct: null,
        answer: attempt?.answers?.[id] || null,
        discipline: "",
        subject: "",
        materialId: attempt.materialId || materialIdFromIndex(state.catalog?.question_index?.[id]) || "",
        materialName: attempt.materialName || "",
        mode: attempt.mode || "",
        at: attempt.completedAt || attempt.finishedAt || attempt.endedAt || attempt.createdAt || attempt.savedAt || null,
      });
    }
  }
  return {answered, latest, attempts};
}

function itemProgress(item, progress) {
  let answered = 0;
  let evaluated = 0;
  let correct = 0;
  let wrong = 0;
  for (const id of item.question_ids || []) {
    if (progress.answered.has(id)) answered += 1;
    const latest = progress.latest.get(id);
    if (typeof latest?.correct === "boolean") {
      evaluated += 1;
      if (latest.correct) correct += 1;
      else wrong += 1;
    }
  }
  return {
    answered,
    correct,
    wrong,
    remaining: Math.max(0, Number(item.question_count || 0) - answered),
    accuracy: evaluated ? Math.round(correct / evaluated * 100) : null,
  };
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

function questionToItems(map, targetCode) {
  const index = new Map();
  for (const section of eligibleSections(map, targetCode)) {
    for (const item of section.items || []) {
      for (const id of item.question_ids || []) {
        if (!index.has(id)) index.set(id, []);
        index.get(id).push({itemId: item.id, itemLabel: item.label, sectionId: section.id, sectionLabel: section.label, scope: section.scope});
      }
    }
  }
  return index;
}

function targetStats(map, targetCode, progress) {
  const sections = eligibleSections(map, targetCode);
  const items = sections.flatMap(section => section.items || []);
  const ids = new Set(items.flatMap(item => item.question_ids || []));
  const answeredIds = [...ids].filter(id => progress.answered.has(id));
  const evaluated = answeredIds.map(id => progress.latest.get(id)).filter(item => typeof item?.correct === "boolean");
  const correct = evaluated.filter(item => item.correct).length;
  const startedItems = items.filter(item => itemProgress(item, progress).answered > 0).length;
  const coveredItems = items.filter(item => Number(item.question_count || 0) > 0).length;
  return {
    items: items.length,
    coveredItems,
    startedItems,
    questions: ids.size,
    answered: answeredIds.length,
    remaining: Math.max(0, ids.size - answeredIds.length),
    accuracy: evaluated.length ? Math.round(correct / evaluated.length * 100) : null,
  };
}

function renderTargetKpis(map, targetCode, progress) {
  const stats = targetStats(map, targetCode, progress);
  const coverage = stats.items ? Math.round(stats.coveredItems / stats.items * 100) : 0;
  const studied = stats.items ? Math.round(stats.startedItems / stats.items * 100) : 0;
  return `<div class="edital-kpis" data-edital-kpis>
    <article><span>Cobertura do banco</span><strong>${coverage}%</strong><small>${stats.coveredItems}/${stats.items} itens com questões</small></article>
    <article><span>Tópicos estudados</span><strong>${studied}%</strong><small>${stats.startedItems}/${stats.items} itens já tocados</small></article>
    <article><span>Questões realizadas</span><strong>${stats.answered.toLocaleString("pt-BR")}</strong><small>${stats.remaining.toLocaleString("pt-BR")} ainda inéditas neste edital</small></article>
    <article><span>Aproveitamento</span><strong>${stats.accuracy == null ? "—" : `${stats.accuracy}%`}</strong><small>${stats.questions.toLocaleString("pt-BR")} questões relacionadas no banco</small></article>
  </div>`;
}

function sectionProgress(section, progress) {
  const ids = new Set((section.items || []).flatMap(item => item.question_ids || []));
  const answered = [...ids].filter(id => progress.answered.has(id)).length;
  const evaluated = [...ids].map(id => progress.latest.get(id)).filter(item => typeof item?.correct === "boolean");
  const correct = evaluated.filter(item => item.correct).length;
  return {total: ids.size, answered, accuracy: evaluated.length ? Math.round(correct / evaluated.length * 100) : null};
}

function renderItem(item, progress) {
  const stats = itemProgress(item, progress);
  const count = Number(item.question_count || 0);
  const percent = count ? Math.round(stats.answered / count * 100) : 0;
  const accuracy = stats.accuracy == null ? "sem taxa" : `${stats.accuracy}% de acerto`;
  const disabled = count === 0 ? "disabled" : "";
  return `<article class="edital-item ${count ? "covered" : "empty"}" data-edital-item="${esc(item.id)}">
    <div class="edital-item-main">
      <div class="edital-item-copy"><strong>${esc(item.label)}</strong><small>${stats.answered.toLocaleString("pt-BR")}/${count.toLocaleString("pt-BR")} realizadas · ${stats.remaining.toLocaleString("pt-BR")} inéditas · ${accuracy}</small><div class="edital-progress" aria-label="${percent}% realizado"><span style="width:${percent}%"></span></div></div>
      <span class="edital-coverage" aria-label="${count ? "Questões disponíveis" : "Item sem cobertura"}">${count}</span>
    </div>
    <div class="edital-item-actions" role="group" aria-label="Ações deste item">
      <button type="button" class="btn secondary" data-edital-run="${esc(item.id)}" data-edital-size="10" data-edital-subset="fresh" ${stats.remaining ? "" : "disabled"}>10 inéditas</button>
      <button type="button" class="btn secondary" data-edital-run="${esc(item.id)}" data-edital-size="10" data-edital-subset="wrong" ${stats.wrong ? "" : "disabled"}>Revisar erros (${stats.wrong})</button>
      <button type="button" class="btn secondary" data-edital-run="${esc(item.id)}" data-edital-size="20" data-edital-subset="mixed" ${disabled}>Resolver 20</button>
      <button type="button" class="btn ghost" data-edital-run="${esc(item.id)}" data-edital-size="all" data-edital-subset="mixed" ${disabled}>Todas</button>
      <button type="button" class="btn ghost" data-edital-item-history="${esc(item.id)}" ${stats.answered ? "" : "disabled"}>Ver realizadas</button>
    </div>
  </article>`;
}

function renderSections(map, targetCode, filter = "") {
  const progress = globalQuestionState();
  const normalizedFilter = String(filter || "").trim().toLocaleLowerCase("pt-BR");
  return eligibleSections(map, targetCode).map((section, index) => {
    const items = (section.items || []).filter(item => !normalizedFilter || String(item.label || "").toLocaleLowerCase("pt-BR").includes(normalizedFilter));
    if (!items.length) return "";
    const stats = sectionProgress({...section, items}, progress);
    const percent = stats.total ? Math.round(stats.answered / stats.total * 100) : 0;
    return `<details class="edital-section" ${index < 2 || normalizedFilter ? "open" : ""} data-edital-section="${esc(section.id)}">
      <summary><span><small>${section.scope === "general" ? "Conhecimentos gerais" : "Conhecimentos específicos"}</small><strong>${esc(section.label)}</strong><span class="edital-section-progress"><i style="width:${percent}%"></i></span></span><em>${stats.answered}/${stats.total} feitas${stats.accuracy == null ? "" : ` · ${stats.accuracy}%`}</em></summary>
      <div class="edital-items">${items.map(item => renderItem(item, progress)).join("")}</div>
    </details>`;
  }).join("");
}

function pickQuestionIds(item, size, subset = "mixed") {
  const progress = globalQuestionState();
  const ids = [...new Set(item.question_ids || [])];
  const fresh = shuffle(ids.filter(id => !progress.answered.has(id)));
  const wrong = shuffle(ids.filter(id => progress.latest.get(id)?.correct === false));
  const seen = shuffle(ids.filter(id => progress.answered.has(id)));
  let ordered = subset === "fresh" ? fresh : subset === "wrong" ? wrong : [...fresh, ...seen];
  ordered = [...new Set(ordered)];
  if (size === "all") return ordered;
  return ordered.slice(0, Math.max(1, Number(size) || 10));
}

function findItem(map, targetCode, itemId) {
  for (const section of eligibleSections(map, targetCode)) {
    const item = (section.items || []).find(candidate => candidate.id === itemId);
    if (item) return {section, item};
  }
  return null;
}

function startItemSession(map, targetCode, itemId, size, subset) {
  const found = findItem(map, targetCode, itemId);
  if (!found) return toast("Este item não pertence ao edital do cargo selecionado.", "error");
  const questionIds = pickQuestionIds(found.item, size, subset);
  if (!questionIds.length) return toast(subset === "wrong" ? "Você não possui erros registrados neste item." : subset === "fresh" ? "Você já realizou todas as questões mapeadas deste item." : "Este ponto do edital ainda não possui questões mapeadas no acervo.", "info");
  const subsetLabel = subset === "wrong" ? "revisão de erros" : subset === "fresh" ? "questões inéditas" : "sessão do tópico";
  createCompatibleSession({
    id: `edital-${targetCode}-${found.item.id}-${subset}`,
    name: `Edital verticalizado — ${map.targets[targetCode].label} — ${found.item.label} — ${subsetLabel}`,
    questionIds,
    mode: "treino",
    minutes: questionIds.length * 2,
    discipline: found.section.label,
    source: `${map.source?.notice || "Edital SEDES/DF 2026"} · item ${found.item.label}`,
    cargo: targetCode,
    materialType: "simulado",
  });
}

function materialNameFor(row) {
  if (row.materialName) return row.materialName;
  const meta = state.catalog?.materials?.find(item => item.id === row.materialId);
  return meta?.nome || row.materialId || "Origem não identificada";
}

function formatAttemptMode(mode) {
  const normalized = String(mode || "").toLocaleLowerCase("pt-BR");
  if (normalized === "prova") return "Modo prova";
  if (normalized === "treino") return "Modo treino";
  return normalized ? normalized : "Sessão anterior";
}

function historyRows(map, targetCode) {
  const progress = globalQuestionState();
  const relation = questionToItems(map, targetCode);
  return [...progress.latest.values()].map(row => {
    const links = relation.get(row.id) || [];
    const indexMeta = state.catalog?.question_index?.[row.id];
    const format = map.question_formats?.[row.id] || "Outro";
    return {
      ...row,
      discipline: row.discipline || indexMeta?.disciplina || indexMeta?.discipline || "Sem classificação",
      materialName: materialNameFor(row),
      format,
      inEdital: links.length > 0,
      links,
    };
  });
}

function relationLabel(row) {
  return row.inEdital ? "No edital" : "Fora do edital";
}

function resultLabel(row) {
  return row.correct === true ? "Acertou" : row.correct === false ? "Errou" : "Realizada";
}

function renderHistoryPage(map, targetCode, filters = {}) {
  let rows = historyRows(map, targetCode);
  const relation = filters.relation || "all";
  const result = filters.result || "all";
  const itemId = filters.itemId || "";
  const search = String(filters.search || "").trim().toLocaleLowerCase("pt-BR");
  if (relation === "mapped") rows = rows.filter(row => row.inEdital);
  if (relation === "unmapped") rows = rows.filter(row => !row.inEdital);
  if (result === "correct") rows = rows.filter(row => row.correct === true);
  if (result === "wrong") rows = rows.filter(row => row.correct === false);
  if (itemId) rows = rows.filter(row => row.links.some(link => link.itemId === itemId));
  if (search) rows = rows.filter(row => [row.id, row.discipline, row.materialName, row.format, ...row.links.map(link => `${link.sectionLabel} ${link.itemLabel}`)].join(" ").toLocaleLowerCase("pt-BR").includes(search));
  const totalHistory = historyRows(map, targetCode);
  const mappedCount = totalHistory.filter(row => row.inEdital).length;
  const outsideCount = totalHistory.length - mappedCount;
  const itemLabel = itemId ? totalHistory.flatMap(row => row.links).find(link => link.itemId === itemId)?.itemLabel : "";
  return `<div class="edital-history-head">
      <div><h3>Questões realizadas</h3><p>Histórico global do perfil. Uma questão conta aqui independentemente de ter sido feita no Banco, Prova Real, simulado, revisão ou no próprio verticalizado.</p>${itemLabel ? `<p class="edital-history-focus">Filtro do item: <strong>${esc(itemLabel)}</strong> <button type="button" class="link-button" data-edital-clear-item>limpar</button></p>` : ""}</div>
      <div class="edital-history-counts"><span><strong>${totalHistory.length}</strong> únicas realizadas</span><span><strong>${mappedCount}</strong> no edital ${esc(targetCode)}</span><span><strong>${outsideCount}</strong> fora deste edital</span></div>
    </div>
    <div class="edital-history-filters">
      <label><span>Relação com o edital</span><select data-edital-history-relation><option value="all" ${relation === "all" ? "selected" : ""}>Todas</option><option value="mapped" ${relation === "mapped" ? "selected" : ""}>No edital</option><option value="unmapped" ${relation === "unmapped" ? "selected" : ""}>Fora do edital</option></select></label>
      <label><span>Resultado mais recente</span><select data-edital-history-result><option value="all" ${result === "all" ? "selected" : ""}>Todos</option><option value="correct" ${result === "correct" ? "selected" : ""}>Acertos</option><option value="wrong" ${result === "wrong" ? "selected" : ""}>Erros</option></select></label>
      <label class="edital-history-search"><span>Buscar</span><input type="search" data-edital-history-search value="${esc(filters.search || "")}" placeholder="ID, matéria, origem ou item do edital"></label>
    </div>
    <div class="edital-history-list" data-edital-history-list>${rows.length ? rows.map(row => `<article class="edital-history-row ${row.inEdital ? "mapped" : "outside"}" data-edital-history-question="${esc(row.id)}">
      <div class="edital-history-main"><div class="edital-history-title"><strong>${esc(row.id)}</strong><span class="edital-badge ${row.inEdital ? "mapped" : "outside"}">${relationLabel(row)}</span><span class="edital-badge result-${row.correct === true ? "correct" : row.correct === false ? "wrong" : "neutral"}">${resultLabel(row)}</span><span class="edital-badge format">${esc(row.format)}</span></div><small>${esc(row.discipline)} · ${esc(materialNameFor(row))} · ${esc(formatAttemptMode(row.mode))}</small></div>
      <div class="edital-history-links">${row.inEdital ? row.links.slice(0, 3).map(link => `<span><small>${link.scope === "general" ? "Geral" : "Específico"}</small>${esc(link.itemLabel)}</span>`).join("") : `<span><small>Classificação</small>Esta questão ainda não está relacionada a um item do edital ${esc(targetCode)}.</span>`}</div>
    </article>`).join("") : `<div class="edital-history-empty"><strong>Nenhuma questão encontrada.</strong><span>Ajuste os filtros ou resolva novas questões para alimentar este histórico.</span></div>`}</div>`;
}

async function injectVerticalized() {
  if (currentRoute() !== "estudar") return;
  ensureStyles();
  if (verticalInjecting || document.querySelector("[data-edital-verticalizado]")) return;
  verticalInjecting = true;
  try {
    const map = await loadMap();
    if (currentRoute() !== "estudar" || document.querySelector("[data-edital-verticalizado]")) return;
    const targetAnchor = document.querySelector("[data-official-exam-card]") || document.querySelector("[data-ux-study-launcher]") || document.querySelector(".study-view-tabs") || document.querySelector(".page-heading") || document.querySelector("#app > *");
    if (!targetAnchor) return;
    const stored = readJSON(TARGET_KEY(), "202");
    let targetCode = map.targets?.[stored] ? stored : "202";
    let view = "map";
    const historyFilters = {relation: "all", result: "all", search: "", itemId: ""};
    const card = document.createElement("section");
    card.className = "card edital-verticalizado";
    card.dataset.editalVerticalizado = "";
    card.innerHTML = `<div class="edital-head">
        <div><p class="eyebrow">Edital verticalizado</p><h2>Seu mapa de domínio do edital.</h2><p>O progresso usa todo o histórico do perfil. Se você já resolveu uma questão por qualquer modo da plataforma, ela conta automaticamente no item correspondente.</p></div>
        <span class="edital-source">Matriz canônica · item 20 do edital</span>
      </div>
      <div class="edital-targets" role="group" aria-label="Escolher cargo">
        ${Object.entries(map.targets || {}).map(([code, target]) => `<button type="button" data-edital-target="${code}" class="${code === targetCode ? "active" : ""}"><strong>${esc(target.label)}</strong><small>${esc(target.subtitle)}</small></button>`).join("")}
      </div>
      <div data-edital-kpi-slot></div>
      <nav class="edital-view-tabs" aria-label="Visualização do edital"><button type="button" data-edital-view="map" class="active">Mapa do edital</button><button type="button" data-edital-view="history">Questões realizadas</button></nav>
      <div class="edital-view" data-edital-map-view>
        <div class="edital-toolbar"><div><strong data-edital-summary></strong><small>Itens sem cobertura permanecem visíveis. O percentual é calculado por IDs únicos já realizados.</small></div><label><span>Filtrar edital</span><input type="search" data-edital-search placeholder="Ex.: ato administrativo, PNAS, AFO"></label></div>
        <div class="edital-sections" data-edital-sections></div>
      </div>
      <div class="edital-view" data-edital-history-view hidden></div>`;
    if (targetAnchor.matches?.("[data-official-exam-card]")) targetAnchor.insertAdjacentElement("beforebegin", card);
    else targetAnchor.insertAdjacentElement("afterend", card);

    const repaintHistory = () => {
      const holder = card.querySelector("[data-edital-history-view]");
      holder.innerHTML = renderHistoryPage(map, targetCode, historyFilters);
    };

    const repaint = () => {
      card.querySelectorAll("[data-edital-target]").forEach(button => button.classList.toggle("active", button.dataset.editalTarget === targetCode));
      card.querySelectorAll("[data-edital-view]").forEach(button => button.classList.toggle("active", button.dataset.editalView === view));
      card.querySelector("[data-edital-map-view]").hidden = view !== "map";
      card.querySelector("[data-edital-history-view]").hidden = view !== "history";
      const progress = globalQuestionState();
      card.querySelector("[data-edital-kpi-slot]").innerHTML = renderTargetKpis(map, targetCode, progress);
      const filter = card.querySelector("[data-edital-search]")?.value || "";
      card.querySelector("[data-edital-sections]").innerHTML = renderSections(map, targetCode, filter);
      const stats = targetStats(map, targetCode, progress);
      card.querySelector("[data-edital-summary]").textContent = `${map.targets[targetCode].label} · ${stats.answered}/${stats.questions} questões realizadas · ${stats.accuracy == null ? "sem taxa ainda" : `${stats.accuracy}% de acerto`}`;
      repaintHistory();
    };

    card.addEventListener("click", event => {
      const targetButton = event.target.closest("[data-edital-target]");
      if (targetButton) {
        targetCode = targetButton.dataset.editalTarget;
        saveJSON(TARGET_KEY(), targetCode);
        historyFilters.itemId = "";
        repaint();
        return;
      }
      const viewButton = event.target.closest("[data-edital-view]");
      if (viewButton) {
        view = viewButton.dataset.editalView;
        repaint();
        return;
      }
      const historyButton = event.target.closest("[data-edital-item-history]");
      if (historyButton && !historyButton.disabled) {
        historyFilters.itemId = historyButton.dataset.editalItemHistory;
        historyFilters.relation = "mapped";
        view = "history";
        repaint();
        return;
      }
      if (event.target.closest("[data-edital-clear-item]")) {
        historyFilters.itemId = "";
        repaintHistory();
        return;
      }
      const run = event.target.closest("[data-edital-run]");
      if (run && !run.disabled) startItemSession(map, targetCode, run.dataset.editalRun, run.dataset.editalSize, run.dataset.editalSubset || "mixed");
    });
    card.addEventListener("input", event => {
      if (event.target.matches("[data-edital-search]")) repaint();
      if (event.target.matches("[data-edital-history-search]")) {
        historyFilters.search = event.target.value;
        repaintHistory();
      }
    });
    card.addEventListener("change", event => {
      if (event.target.matches("[data-edital-history-relation]")) {
        historyFilters.relation = event.target.value;
        repaintHistory();
      }
      if (event.target.matches("[data-edital-history-result]")) {
        historyFilters.result = event.target.value;
        repaintHistory();
      }
    });
    repaint();
  } finally {
    verticalInjecting = false;
  }
}

ensureData()
  .then(() => observeApp(() => injectVerticalized().catch(error => {
    console.error("Falha ao montar Edital verticalizado:", error);
  })))
  .catch(error => console.error("Falha ao carregar dados para o Edital verticalizado:", error));
