import {
  activeHistory,
  createCompatibleSession,
  currentRoute,
  ensureData,
  esc,
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

function latestQuestionState() {
  const answered = new Set();
  const result = new Map();
  for (const attempt of activeHistory()) {
    for (const item of attempt?.questionResults || []) {
      const id = String(item?.id || "");
      if (!id) continue;
      answered.add(id);
      if (!result.has(id) && typeof item.correct === "boolean") result.set(id, item.correct);
    }
    if (attempt?.answers && typeof attempt.answers === "object") {
      for (const [id, answer] of Object.entries(attempt.answers)) if (answer) answered.add(id);
    }
    for (const id of attempt?.answeredQuestionIds || []) answered.add(String(id));
  }
  return {answered, result};
}

function itemProgress(item, progress) {
  let answered = 0;
  let evaluated = 0;
  let correct = 0;
  for (const id of item.question_ids || []) {
    if (progress.answered.has(id)) answered += 1;
    if (progress.result.has(id)) {
      evaluated += 1;
      if (progress.result.get(id)) correct += 1;
    }
  }
  return {
    answered,
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

function renderItem(item, progress) {
  const stats = itemProgress(item, progress);
  const count = Number(item.question_count || 0);
  const accuracy = stats.accuracy == null ? "sem taxa ainda" : `${stats.accuracy}% de acerto`;
  const disabled = count === 0 ? "disabled" : "";
  return `<article class="edital-item ${count ? "covered" : "empty"}" data-edital-item="${esc(item.id)}">
    <div class="edital-item-main">
      <div><strong>${esc(item.label)}</strong><small>${count.toLocaleString("pt-BR")} questão(ões) disponível(is) · ${stats.answered.toLocaleString("pt-BR")} respondida(s) · ${accuracy}</small></div>
      <span class="edital-coverage" aria-label="${count ? "Item com questões" : "Item sem cobertura"}">${count ? `${count}` : "0"}</span>
    </div>
    <div class="edital-item-actions" role="group" aria-label="Resolver questões deste item">
      <button type="button" class="btn secondary" data-edital-run="${esc(item.id)}" data-edital-size="10" ${disabled}>Resolver 10</button>
      <button type="button" class="btn secondary" data-edital-run="${esc(item.id)}" data-edital-size="20" ${disabled}>Resolver 20</button>
      <button type="button" class="btn ghost" data-edital-run="${esc(item.id)}" data-edital-size="all" ${disabled}>Todas</button>
    </div>
  </article>`;
}

function renderSections(map, targetCode, filter = "") {
  const progress = latestQuestionState();
  const normalizedFilter = String(filter || "").trim().toLocaleLowerCase("pt-BR");
  return eligibleSections(map, targetCode).map((section, index) => {
    const items = (section.items || []).filter(item => !normalizedFilter || String(item.label || "").toLocaleLowerCase("pt-BR").includes(normalizedFilter));
    if (!items.length) return "";
    const available = new Set(items.flatMap(item => item.question_ids || [])).size;
    return `<details class="edital-section" ${index < 2 || normalizedFilter ? "open" : ""} data-edital-section="${esc(section.id)}">
      <summary><span><small>${section.scope === "general" ? "Conhecimentos gerais" : "Conhecimentos específicos"}</small><strong>${esc(section.label)}</strong></span><em>${available.toLocaleString("pt-BR")} questões</em></summary>
      <div class="edital-items">${items.map(item => renderItem(item, progress)).join("")}</div>
    </details>`;
  }).join("");
}

function pickQuestionIds(item, size) {
  const progress = latestQuestionState();
  const ids = [...new Set(item.question_ids || [])];
  const fresh = shuffle(ids.filter(id => !progress.answered.has(id)));
  const seen = shuffle(ids.filter(id => progress.answered.has(id)));
  const ordered = [...fresh, ...seen];
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

function startItemSession(map, targetCode, itemId, size) {
  const found = findItem(map, targetCode, itemId);
  if (!found) return toast("Este item não pertence ao edital do cargo selecionado.", "error");
  const questionIds = pickQuestionIds(found.item, size);
  if (!questionIds.length) return toast("Este ponto do edital ainda não possui questões mapeadas no acervo.", "info");
  createCompatibleSession({
    id: `edital-${targetCode}-${found.item.id}`,
    name: `Edital verticalizado — ${map.targets[targetCode].label} — ${found.item.label}`,
    questionIds,
    mode: "treino",
    minutes: questionIds.length * 2,
    discipline: found.section.label,
    source: `${map.source?.notice || "Edital SEDES/DF 2026"} · item ${found.item.label}`,
    cargo: targetCode,
    materialType: "simulado",
  });
}

function targetSummary(map, targetCode) {
  const sections = eligibleSections(map, targetCode);
  const items = sections.flatMap(section => section.items || []);
  const covered = items.filter(item => Number(item.question_count || 0) > 0).length;
  const questions = new Set(items.flatMap(item => item.question_ids || [])).size;
  return `${covered}/${items.length} itens com cobertura · ${questions.toLocaleString("pt-BR")} questões relacionadas`;
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
    const card = document.createElement("section");
    card.className = "card edital-verticalizado";
    card.dataset.editalVerticalizado = "";
    card.innerHTML = `<div class="edital-head">
        <div><p class="eyebrow">Edital verticalizado</p><h2>Estude pelo ponto exato do edital.</h2><p>Cada item oficial mostra a cobertura real do banco. O clique abre somente questões explicitamente mapeadas para aquele conteúdo.</p></div>
        <span class="edital-source">Matriz canônica · item 20 do edital</span>
      </div>
      <div class="edital-targets" role="group" aria-label="Escolher cargo">
        ${Object.entries(map.targets || {}).map(([code, target]) => `<button type="button" data-edital-target="${code}" class="${code === targetCode ? "active" : ""}"><strong>${esc(target.label)}</strong><small>${esc(target.subtitle)}</small></button>`).join("")}
      </div>
      <div class="edital-toolbar"><div><strong data-edital-summary></strong><small>Itens sem cobertura permanecem visíveis para mostrar o que ainda falta no acervo.</small></div><label><span>Filtrar edital</span><input type="search" data-edital-search placeholder="Ex.: ato administrativo, PNAS, AFO"></label></div>
      <div class="edital-sections" data-edital-sections></div>`;
    if (targetAnchor.matches?.("[data-official-exam-card]")) targetAnchor.insertAdjacentElement("beforebegin", card);
    else targetAnchor.insertAdjacentElement("afterend", card);

    const repaint = () => {
      card.querySelectorAll("[data-edital-target]").forEach(button => button.classList.toggle("active", button.dataset.editalTarget === targetCode));
      const filter = card.querySelector("[data-edital-search]")?.value || "";
      card.querySelector("[data-edital-sections]").innerHTML = renderSections(map, targetCode, filter);
      card.querySelector("[data-edital-summary]").textContent = `${map.targets[targetCode].label} · ${targetSummary(map, targetCode)}`;
    };

    card.addEventListener("click", event => {
      const targetButton = event.target.closest("[data-edital-target]");
      if (targetButton) {
        targetCode = targetButton.dataset.editalTarget;
        saveJSON(TARGET_KEY(), targetCode);
        repaint();
        return;
      }
      const run = event.target.closest("[data-edital-run]");
      if (run && !run.disabled) startItemSession(map, targetCode, run.dataset.editalRun, run.dataset.editalSize);
    });
    card.querySelector("[data-edital-search]")?.addEventListener("input", repaint);
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
