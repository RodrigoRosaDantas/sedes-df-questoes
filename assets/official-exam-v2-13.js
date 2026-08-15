import {
  ensureData,
  state,
  materialIdFromIndex,
  currentRoute,
  activeSession,
  activeHistory,
  profileKey,
  readJSON,
  saveJSON,
  shuffle,
  createCompatibleSession,
  OFFICIAL_MATERIAL_ID,
  esc,
  observeApp,
  toast,
} from "./shared-v2-13.js?v=1";
import "./edital-verticalizado-v1.js?v=1";

const MAP_URL = "./data/release/edital-map-v1.json";
const BLUEPRINT_KEY = () => profileKey("officialBlueprint.v1");
let mapPromise = null;
let timer = null;
let cardInjecting = false;

function ensureFeatureStyles() {
  if (document.querySelector('link[data-edital-verticalizado-css]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./assets/edital-verticalizado-v1.css?v=1";
  link.dataset.editalVerticalizadoCss = "";
  document.head.append(link);
}
ensureFeatureStyles();

async function loadEditalMap() {
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

function itemMap(map) {
  return new Map((map.sections || []).flatMap(section => (section.items || []).map(item => [item.id, item])));
}

function balancedSelect(map, itemIds, total, excluded = []) {
  const byId = itemMap(map);
  const used = new Set(excluded);
  const selected = [];
  const pools = shuffle(itemIds || []).map(id => ({id, values: shuffle(byId.get(id)?.exam_question_ids || [])}));
  let progressed = true;
  while (selected.length < total && progressed) {
    progressed = false;
    for (const pool of pools) {
      while (pool.values.length) {
        const id = pool.values.pop();
        if (!id || used.has(id)) continue;
        selected.push(id);
        used.add(id);
        progressed = true;
        break;
      }
      if (selected.length >= total) break;
    }
  }
  if (selected.length < total) {
    const fallbackInsideEdital = shuffle([...new Set((itemIds || []).flatMap(id => byId.get(id)?.exam_question_ids || []))]);
    for (const id of fallbackInsideEdital) {
      if (used.has(id)) continue;
      selected.push(id);
      used.add(id);
      if (selected.length >= total) break;
    }
  }
  return selected;
}

function buildExamSelection(map, targetCode) {
  const target = map.targets?.[targetCode];
  const rule = map.objective_blueprint || {};
  if (!target?.readiness?.ready) return null;
  const mariaRequired = Number(rule.maria_da_penha_minimum_questions || 3);
  const forcedMaria = shuffle(target.maria_da_penha_exam_question_ids || []).slice(0, mariaRequired);
  if (forcedMaria.length !== mariaRequired) return null;
  const generalRest = balancedSelect(map, target.general_item_ids, Number(rule.general_questions || 20) - forcedMaria.length, forcedMaria);
  const generalIds = [...forcedMaria, ...generalRest];
  if (generalIds.length !== Number(rule.general_questions || 20)) return null;
  const specificIds = balancedSelect(map, target.specific_item_ids, Number(rule.specific_questions || 40), generalIds);
  if (specificIds.length !== Number(rule.specific_questions || 40)) return null;
  if (new Set([...generalIds, ...specificIds]).size !== Number(rule.objective_questions || 60)) return null;
  return {generalIds, specificIds, questionIds: shuffle([...generalIds, ...specificIds])};
}

async function loadSelectedQuestions(ids) {
  const grouped = new Map();
  for (const id of ids) {
    const materialId = materialIdFromIndex(state.catalog?.question_index?.[id]);
    if (!materialId) continue;
    if (!grouped.has(materialId)) grouped.set(materialId, []);
    grouped.get(materialId).push(id);
  }
  const questionMap = new Map();
  await Promise.all([...grouped.entries()].map(async ([materialId, questionIds]) => {
    const meta = state.catalog.materials.find(item => item.id === materialId);
    if (!meta?.file) return;
    const response = await fetch(meta.file, {cache: "force-cache"});
    if (!response.ok) throw new Error(`Falha ao carregar ${materialId}: HTTP ${response.status}`);
    const material = await response.json();
    const wanted = new Set(questionIds);
    for (const question of material.questoes || []) {
      if (!wanted.has(question.id)) continue;
      questionMap.set(question.id, {
        ...question,
        _materialId: material.id,
        _materialName: material.nome,
        _discipline: question.disciplina || material.disciplina,
        _cargo: String(material.codigo_cargo),
      });
    }
  }));
  return ids.map(id => questionMap.get(id)).filter(Boolean);
}

function deficitText(target) {
  const deficits = target?.readiness?.deficits || {};
  const parts = [];
  if (deficits.general) parts.push(`${deficits.general} geral(is) elegível(is)`);
  if (deficits.specific) parts.push(`${deficits.specific} específica(s) elegível(is)`);
  if (deficits.maria_da_penha) parts.push(`${deficits.maria_da_penha} de Maria da Penha`);
  return parts.length ? `Faltam ${parts.join(", ")}.` : "Acervo apto para montar a prova híbrida por conteúdo.";
}

function formatPoolText(target) {
  const ready = target?.readiness || {};
  return `${Number(ready.general_ae || 0) + Number(ready.specific_ae || 0)} A–E · ${Number(ready.general_ce || 0) + Number(ready.specific_ce || 0)} Certo/Errado no pool do cargo`;
}

async function startOfficialExam(targetCode) {
  const map = await loadEditalMap();
  const target = map.targets?.[targetCode];
  if (!target) return toast("Cargo de Prova Real inválido.", "error");
  if (!target.readiness?.ready) return toast(`Prova Real ${targetCode} ainda bloqueada. ${deficitText(target)}`, "info");
  const selection = buildExamSelection(map, targetCode);
  if (!selection) return toast("O acervo não conseguiu fechar a matriz sem repetir ou sair do edital.", "error");
  const button = document.querySelector(`[data-start-official-exam="${targetCode}"]`);
  if (button) { button.disabled = true; button.textContent = "Preparando prova…"; }
  try {
    const questions = await loadSelectedQuestions(selection.questionIds);
    if (questions.length !== 60) throw new Error(`Questões carregadas: ${questions.length}/60.`);
    const invalid = questions.filter(question => {
      const keys = Object.keys(question.alternativas || {}).map(value => String(value).toLocaleLowerCase("pt-BR"));
      const ae = ["a", "b", "c", "d", "e"].every(key => keys.includes(key));
      const ce = keys.includes("certo") && keys.includes("errado");
      return !ae && !ce;
    });
    if (invalid.length) throw new Error(`Há ${invalid.length} questão(ões) com formato não elegível.`);
    const rule = map.objective_blueprint;
    const sessionMaterialId = `${OFFICIAL_MATERIAL_ID}-${targetCode}`;
    const selectedFormats = selection.questionIds.reduce((acc, id) => {
      const format = map.question_formats?.[id] || "Outro";
      acc[format] = (acc[format] || 0) + 1;
      return acc;
    }, {});
    saveJSON(BLUEPRINT_KEY(), {
      createdAt: new Date().toISOString(),
      matrixVersion: map.matrix_version,
      targetCode,
      targetLabel: target.label,
      sessionMaterialId,
      generalIds: selection.generalIds,
      specificIds: selection.specificIds,
      selectedFormats,
      generalWeight: Number(rule.general_weight || 1),
      specificWeight: Number(rule.specific_weight || 2),
      durationMinutes: Number(rule.joint_duration_minutes || 240),
      mariaDaPenhaMinimum: Number(rule.maria_da_penha_minimum_questions || 3),
      simulationPolicy: map.simulation_policy || null,
    });
    createCompatibleSession({
      id: sessionMaterialId,
      name: `Prova Real SEDES/DF 2026 — ${target.label} — Cargo ${targetCode}`,
      questionIds: selection.questionIds,
      questions,
      mode: "prova",
      minutes: Number(rule.joint_duration_minutes || 240),
      discipline: "Conhecimentos gerais e específicos",
      source: `${map.source?.notice || "Edital nº 1/2026"} — matriz de conteúdo do cargo ${targetCode}; formatos originais preservados`,
      cargo: targetCode,
      materialType: "simulado",
    });
  } catch (error) {
    console.error(error);
    toast("Não foi possível preparar a Prova Real. O acervo e seu progresso foram preservados.", "error");
    if (button) { button.disabled = false; button.textContent = `Iniciar Prova Real ${targetCode}`; }
  }
}

async function injectCard() {
  if (currentRoute() !== "estudar" || cardInjecting || document.querySelector("[data-official-exam-card]")) return;
  cardInjecting = true;
  try {
    const map = await loadEditalMap();
    if (currentRoute() !== "estudar" || document.querySelector("[data-official-exam-card]")) return;
    const targetAnchor = document.querySelector("[data-ux-study-launcher]") || document.querySelector(".study-view-tabs") || document.querySelector(".page-heading") || document.querySelector("#app > *");
    if (!targetAnchor) return;
    const rule = map.objective_blueprint || {};
    const card = document.createElement("section");
    card.className = "official-exam-card card";
    card.dataset.officialExamCard = "";
    card.innerHTML = `<div><p class="eyebrow">Modo Prova Real</p><h2>SEDES/DF 2026 · matriz do edital por cargo</h2><p>${rule.objective_questions || 60} questões: ${rule.general_questions || 20} gerais (peso ${rule.general_weight || 1}) e ${rule.specific_questions || 40} específicas (peso ${rule.specific_weight || 2}). O conteúdo respeita o edital; para aproveitar o acervo Quadrix, a sessão preserva o formato original de cada questão, seja A–E ou Certo/Errado.</p></div>
      <div class="official-exam-facts"><span><strong>60</strong><small>questões</small></span><span><strong>100</strong><small>pontos</small></span><span><strong>4h</strong><small>objetiva + discursiva</small></span><span><strong>≥3</strong><small>Maria da Penha</small></span></div>
      <div class="official-format-warning"><strong>Formato da simulação</strong><span>O edital atual prevê A–E. O modo híbrido também usa questões Certo/Errado já existentes no banco, sem convertê-las, para ampliar a prática dos conteúdos — especialmente no acervo de Administrador.</span></div>
      <div class="official-target-grid">${["202", "400"].map(code => {
        const target = map.targets?.[code];
        const ready = Boolean(target?.readiness?.ready);
        return `<article class="official-target-card"><header><strong>${esc(target?.label || code)}</strong><small>${esc(target?.subtitle || `Cargo ${code}`)}</small></header><p class="official-readiness ${ready ? "ready" : "blocked"}">${esc(deficitText(target))}</p><p class="official-pool">${esc(formatPoolText(target))}</p><button class="btn primary" data-start-official-exam="${code}" ${ready ? "" : "disabled"}>Iniciar Prova Real ${code}</button></article>`;
      }).join("")}</div>
      <p class="official-rule-note">A distribuição interna entre matérias é balanceada para diversidade, mas não é apresentada como cota oficial: o edital fixa os blocos 20/40 e o mínimo de três questões de Lei Maria da Penha.</p>
      <p class="official-source-note">Nenhuma falta é preenchida com conteúdo fora do mapa do edital. A questão mantém suas alternativas e seu gabarito originais.</p>`;
    targetAnchor.insertAdjacentElement("afterend", card);
    card.querySelectorAll("[data-start-official-exam]").forEach(button => button.addEventListener("click", () => startOfficialExam(button.dataset.startOfficialExam)));
  } finally {
    cardInjecting = false;
  }
}

function isOfficialSession(session) {
  return String(session?.material?.id || "").startsWith(`${OFFICIAL_MATERIAL_ID}-`);
}

function injectCountdown() {
  const session = activeSession();
  if (currentRoute() !== "resolver" || !isOfficialSession(session)) { clearInterval(timer); timer = null; return; }
  const header = document.querySelector(".exam-header");
  if (!header) return;
  let pill = header.querySelector("[data-official-remaining]");
  if (!pill) { pill = document.createElement("div"); pill.className = "official-remaining"; pill.dataset.officialRemaining = ""; header.append(pill); }
  const blueprint = readJSON(BLUEPRINT_KEY(), null);
  const duration = Number(blueprint?.durationMinutes || 240) * 60;
  const update = () => {
    const current = activeSession() || session;
    const live = Math.max(0, (Date.now() - new Date(current.savedAt || Date.now()).getTime()) / 1000);
    const remaining = Math.max(0, duration - Number(current.elapsedBase || 0) - live);
    const h = Math.floor(remaining / 3600), m = Math.floor(remaining % 3600 / 60), s = Math.floor(remaining % 60);
    pill.textContent = remaining ? `Restante: ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : "Tempo oficial esgotado";
    pill.classList.toggle("expired", remaining === 0);
  };
  update();
  if (!timer) timer = setInterval(update, 1000);
}

function injectResult() {
  if (currentRoute() !== "resultado" || document.querySelector("[data-official-result]")) return;
  const attempt = activeHistory()[0];
  const blueprint = readJSON(BLUEPRINT_KEY(), null);
  if (!blueprint || attempt?.materialId !== blueprint.sessionMaterialId) return;
  const byId = new Map((attempt.questionResults || []).map(item => [item.id, item]));
  const general = blueprint.generalIds.reduce((sum, id) => sum + (byId.get(id)?.correct ? 1 : 0), 0);
  const specific = blueprint.specificIds.reduce((sum, id) => sum + (byId.get(id)?.correct ? 2 : 0), 0);
  const total = general + specific;
  const eliminated = general < 10 || specific < 40;
  const formats = blueprint.selectedFormats || {};
  const formatLabel = Object.entries(formats).filter(([, count]) => count).map(([format, count]) => `${count} ${format}`).join(" · ");
  const hero = document.querySelector(".result-hero");
  if (!hero) return;
  const card = document.createElement("section");
  card.className = `official-result card ${eliminated ? "risk" : "approved"}`;
  card.dataset.officialResult = "";
  card.innerHTML = `<div><p class="eyebrow">Pontuação conforme os blocos e pesos do edital</p><h2>${total} de 100 pontos</h2><p>${eliminated ? "Abaixo de pelo menos um mínimo eliminatório." : "Mínimos eliminatórios atingidos nesta simulação."}</p><p class="official-target-label">${esc(blueprint.targetLabel || "Cargo")} · Cargo ${esc(blueprint.targetCode || "")}</p>${formatLabel ? `<p class="official-target-label">${esc(formatLabel)}</p>` : ""}</div><div class="official-result-grid"><span><small>Gerais</small><strong>${general}/20</strong><em>mínimo 10</em></span><span><small>Específicas</small><strong>${specific}/80</strong><em>mínimo 40</em></span><span><small>Situação</small><strong>${eliminated ? "Risco" : "Apto"}</strong><em>simulação</em></span></div><p class="muted">A nota discursiva não está incluída. Questões C/E, quando sorteadas, mantêm o formato original do acervo.</p>`;
  hero.insertAdjacentElement("afterend", card);
}

ensureData().then(() => observeApp(async () => {
  await injectCard();
  injectCountdown();
  injectResult();
})).catch(console.error);
