import {ensureData, state, allQuestionIds, materialIdFromIndex, currentRoute, activeSession, activeHistory, profileKey, readJSON, saveJSON, shuffle, createCompatibleSession, OFFICIAL_MATERIAL_ID, esc, observeApp, toast} from "./shared-v2-13.js?v=1";

const BLUEPRINT_KEY = () => profileKey("officialBlueprint.v1");
const GENERAL_PATTERN = /(portugu|língua|ride|distrito federal|maria da penha|mulher|primeiros socorros)/i;
function classifiedIds() {
  const general = [];
  const specific = [];
  for (const discipline of state.studyIndex?.disciplines || []) {
    const target = GENERAL_PATTERN.test(discipline.name || "") ? general : specific;
    target.push(...(discipline.question_ids || []));
  }
  const all = allQuestionIds();
  const generalSet = new Set(general);
  const specificSet = new Set(specific);
  all.forEach(id => { if (!generalSet.has(id) && !specificSet.has(id)) specific.push(id); });
  return {general: [...new Set(general)], specific: [...new Set(specific)]};
}
function fillBlock(preferred, total, excluded, fallback) {
  const selected = [];
  const used = new Set(excluded);
  for (const id of shuffle(preferred)) {
    if (!id || used.has(id)) continue;
    selected.push(id);
    used.add(id);
    if (selected.length === total) return selected;
  }
  for (const id of shuffle(fallback)) {
    if (!id || used.has(id)) continue;
    selected.push(id);
    used.add(id);
    if (selected.length === total) return selected;
  }
  return selected;
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
      questionMap.set(question.id, {...question, _materialId: material.id, _materialName: material.nome, _discipline: question.disciplina || material.disciplina, _cargo: String(material.codigo_cargo)});
    }
  }));
  return ids.map(id => questionMap.get(id)).filter(Boolean);
}
async function startOfficialExam() {
  const {general, specific} = classifiedIds();
  const all = allQuestionIds();
  const generalIds = fillBlock(general, 20, [], all);
  const specificIds = fillBlock(specific, 40, generalIds, all);
  const questionIds = [...generalIds, ...specificIds];
  if (generalIds.length !== 20 || specificIds.length !== 40 || new Set(questionIds).size !== 60) {
    return toast("O acervo publicado ainda não permite montar 60 questões únicas.", "error");
  }
  const button = document.querySelector("[data-start-official-exam]");
  if (button) { button.disabled = true; button.textContent = "Preparando prova…"; }
  try {
    const questions = await loadSelectedQuestions(questionIds);
    if (questions.length !== 60) throw new Error(`Questões carregadas: ${questions.length}/60.`);
    saveJSON(BLUEPRINT_KEY(), {createdAt: new Date().toISOString(), generalIds, specificIds, generalWeight: 1, specificWeight: 2, durationMinutes: 240});
    createCompatibleSession({id: OFFICIAL_MATERIAL_ID, name: "Prova Real SEDES/DF 2026", questionIds, questions, mode: "prova", minutes: 240, discipline: "Conhecimentos gerais e específicos", source: "Edital nº 1/2026 — simulação com o acervo publicado"});
  } catch (error) {
    console.error(error);
    toast("Não foi possível preparar a prova real. O acervo foi preservado.", "error");
    if (button) { button.disabled = false; button.textContent = "Iniciar prova real"; }
  }
}
function injectCard() {
  if (currentRoute() !== "inicio" || document.querySelector("[data-official-exam-card]")) return;
  const target = document.querySelector("[data-release-health]") || document.querySelector(".bank-status");
  if (!target) return;
  const card = document.createElement("section"); card.className = "official-exam-card card"; card.dataset.officialExamCard = "";
  card.innerHTML = `<div><p class="eyebrow">Modo Prova Real</p><h2>SEDES/DF 2026</h2><p>60 questões: 20 gerais (peso 1) e 40 específicas (peso 2). A janela oficial de 4 horas é compartilhada com a discursiva.</p></div><div class="official-exam-facts"><span><strong>60</strong><small>questões</small></span><span><strong>100</strong><small>pontos</small></span><span><strong>4h</strong><small>janela conjunta</small></span></div><button class="btn primary" data-start-official-exam>Iniciar prova real</button>`;
  target.insertAdjacentElement("afterend", card);
  card.querySelector("[data-start-official-exam]").addEventListener("click", startOfficialExam);
}
let timer = null;
function injectCountdown() {
  const session = activeSession();
  if (currentRoute() !== "resolver" || session?.material?.id !== OFFICIAL_MATERIAL_ID) { clearInterval(timer); timer = null; return; }
  const header = document.querySelector(".exam-header");
  if (!header) return;
  let pill = header.querySelector("[data-official-remaining]");
  if (!pill) { pill = document.createElement("div"); pill.className = "official-remaining"; pill.dataset.officialRemaining = ""; header.append(pill); }
  const update = () => {
    const current = activeSession() || session;
    const live = Math.max(0, (Date.now() - new Date(current.savedAt || Date.now()).getTime()) / 1000);
    const remaining = Math.max(0, 240 * 60 - Number(current.elapsedBase || 0) - live);
    const h = Math.floor(remaining / 3600), m = Math.floor(remaining % 3600 / 60), s = Math.floor(remaining % 60);
    pill.textContent = remaining ? `Restante: ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : "Tempo oficial esgotado";
    pill.classList.toggle("expired", remaining === 0);
  };
  update(); if (!timer) timer = setInterval(update, 1000);
}
function injectResult() {
  if (currentRoute() !== "resultado" || document.querySelector("[data-official-result]")) return;
  const attempt = activeHistory()[0];
  const blueprint = readJSON(BLUEPRINT_KEY(), null);
  if (attempt?.materialId !== OFFICIAL_MATERIAL_ID || !blueprint) return;
  const byId = new Map((attempt.questionResults || []).map(item => [item.id, item]));
  const general = blueprint.generalIds.reduce((sum, id) => sum + (byId.get(id)?.correct ? 1 : 0), 0);
  const specific = blueprint.specificIds.reduce((sum, id) => sum + (byId.get(id)?.correct ? 2 : 0), 0);
  const total = general + specific; const eliminated = general < 10 || specific < 40;
  const hero = document.querySelector(".result-hero"); if (!hero) return;
  const card = document.createElement("section"); card.className = `official-result card ${eliminated ? "risk" : "approved"}`; card.dataset.officialResult = "";
  card.innerHTML = `<div><p class="eyebrow">Pontuação conforme o edital</p><h2>${total} de 100 pontos</h2><p>${eliminated ? "Abaixo de pelo menos um mínimo eliminatório." : "Mínimos eliminatórios atingidos nesta simulação."}</p></div><div class="official-result-grid"><span><small>Gerais</small><strong>${general}/20</strong><em>mínimo 10</em></span><span><small>Específicas</small><strong>${specific}/80</strong><em>mínimo 40</em></span><span><small>Situação</small><strong>${eliminated ? "Risco" : "Apto"}</strong><em>simulação</em></span></div><p class="muted">A nota discursiva não está incluída.</p>`;
  hero.insertAdjacentElement("afterend", card);
}
ensureData().then(() => observeApp(() => { injectCard(); injectCountdown(); injectResult(); })).catch(console.error);
