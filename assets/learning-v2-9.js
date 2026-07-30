const CATALOG_URL = "./data/release/catalogo.json";
const STUDY_INDEX_URL = "./data/release/study-index.json";
const EXAM_URL = "./data/concurso.json";
const ACTIVE_PROFILE_KEY = "sedes.questoes.activeProfile.v3";
const PROFILES_KEY = "sedes.questoes.profiles.v3";
const SESSION_SCHEMA = 4;
const DAY = 86400000;

const enhancement = {
  catalog: null,
  studyIndex: null,
  exam: null,
  processing: false,
};

const safeParse = (value, fallback) => {
  try { return JSON.parse(value ?? JSON.stringify(fallback)); }
  catch { return fallback; }
};
const readJSON = (key, fallback) => safeParse(localStorage.getItem(key), fallback);
const writeJSON = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (error) { console.error("Falha ao salvar recurso inteligente:", error); return false; }
};
const profileId = () => localStorage.getItem(ACTIVE_PROFILE_KEY) || "rodrigo";
const profileKey = suffix => `sedes.questoes.${profileId()}.${suffix}.v3`;
const smartKey = suffix => `sedes.questoes.${profileId()}.${suffix}.v1`;
const history = () => readJSON(profileKey("history"), []);
const session = () => readJSON(profileKey("session"), null);
const notes = () => readJSON(smartKey("notes"), {});
const reasons = () => readJSON(smartKey("errorReasons"), {});
const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function activeProfile() {
  const profiles = readJSON(PROFILES_KEY, []);
  return profiles.find(item => item.id === profileId()) || {id: profileId(), name: profileId(), roles: []};
}

function allQuestionIds() {
  return enhancement.studyIndex?.disciplines?.flatMap(item => item.question_ids) || [];
}

function answeredIds() {
  const ids = new Set();
  for (const attempt of history()) {
    const answered = attempt.answeredQuestionIds || Object.entries(attempt.answers || {}).filter(([, value]) => Boolean(value)).map(([id]) => id);
    answered.forEach(id => ids.add(id));
  }
  return ids;
}

function syncReviewSchedule() {
  const schedule = readJSON(smartKey("reviewSchedule"), {});
  const processed = new Set(readJSON(smartKey("reviewProcessedAttempts"), []));
  const attempts = [...history()].sort((a, b) => new Date(a.finishedAt || 0) - new Date(b.finishedAt || 0));
  let changed = false;
  for (const attempt of attempts) {
    if (!attempt?.id || processed.has(attempt.id)) continue;
    const when = new Date(attempt.finishedAt || Date.now()).getTime();
    const reviewAttempt = /revis/i.test(`${attempt.materialId || ""} ${attempt.materialName || ""}`);
    for (const result of attempt.questionResults || []) {
      if (!result?.id || !result.answer) continue;
      const current = schedule[result.id];
      if (!result.correct) {
        schedule[result.id] = {
          id: result.id,
          stage: 0,
          dueAt: when,
          lastResultAt: when,
          materialId: result.materialId || current?.materialId || null,
          discipline: result.discipline || current?.discipline || "Sem classificação",
          assunto: result.assunto || current?.assunto || "",
          mastered: false,
        };
      } else if (current || reviewAttempt) {
        const stage = Number(current?.stage || 0);
        const nextStage = stage < 7 ? 7 : stage < 20 ? 20 : 99;
        schedule[result.id] = {
          ...(current || {id: result.id, discipline: result.discipline || "Sem classificação", assunto: result.assunto || ""}),
          stage: nextStage,
          dueAt: nextStage === 99 ? null : when + nextStage * DAY,
          lastResultAt: when,
          mastered: nextStage === 99,
        };
      }
    }
    processed.add(attempt.id);
    changed = true;
  }
  if (changed) {
    writeJSON(smartKey("reviewSchedule"), schedule);
    writeJSON(smartKey("reviewProcessedAttempts"), [...processed].slice(-1000));
  }
  return schedule;
}

function dueReviewItems() {
  const now = Date.now();
  return Object.values(syncReviewSchedule())
    .filter(item => !item.mastered && Number(item.dueAt || 0) <= now)
    .sort((a, b) => Number(a.dueAt || 0) - Number(b.dueAt || 0));
}

function reviewStageLabel(item) {
  if (item.stage === 0) return "D0";
  if (item.stage === 7) return "D7";
  if (item.stage === 20) return "D20";
  return "Revisão";
}

function createSession(questionIds, {name, discipline = "Múltiplas matérias", mode = "treino", minutes, materialId = "treino-inteligente", cargo = "multicargo"}) {
  const ids = [...new Set(questionIds)].filter(Boolean);
  if (!ids.length) return false;
  const existing = session();
  if (existing && !confirm("Existe uma tentativa salva. Deseja substituí-la por esta nova sessão?")) return false;
  const payload = {
    version: SESSION_SCHEMA,
    material: {
      id: materialId,
      nome: name,
      disciplina,
      fonte: "Plano inteligente da plataforma",
      tipo_material: "simulado",
      ano: new Date().getFullYear(),
      codigo_cargo: cargo,
      tempo_sugerido_minutos: minutes || ids.length * 2,
    },
    questionIds: ids,
    mode,
    current: 0,
    answers: {},
    confirmed: {},
    flagged: {},
    elapsedBase: 0,
    questionTimes: {},
    savedAt: new Date().toISOString(),
  };
  writeJSON(profileKey("session"), payload);
  location.hash = "#/resolver";
  location.reload();
  return true;
}

function shuffle(values) {
  const items = [...values];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const random = Math.floor(Math.random() * (index + 1));
    [items[index], items[random]] = [items[random], items[index]];
  }
  return items;
}

function resultAggregates() {
  const map = new Map();
  for (const attempt of history()) {
    for (const result of attempt.questionResults || []) {
      if (!result?.id || !result.answer) continue;
      const current = map.get(result.id) || {answered: 0, correct: 0, totalTime: 0, lastAt: null};
      current.answered += 1;
      if (result.correct) current.correct += 1;
      current.totalTime += Number(attempt.questionTimes?.[result.id] || 0);
      current.lastAt = attempt.finishedAt || current.lastAt;
      map.set(result.id, current);
    }
  }
  return map;
}

function topicMetrics(topic, aggregates = resultAggregates()) {
  let answered = 0;
  let correct = 0;
  let time = 0;
  for (const id of topic.question_ids || []) {
    const value = aggregates.get(id);
    if (!value) continue;
    answered += value.answered;
    correct += value.correct;
    time += value.totalTime;
  }
  const uniqueAnswered = (topic.question_ids || []).filter(id => aggregates.has(id)).length;
  return {
    uniqueAnswered,
    coverage: topic.question_count ? Math.round(uniqueAnswered / topic.question_count * 100) : 0,
    accuracy: answered ? Math.round(correct / answered * 100) : null,
    averageSeconds: answered ? Math.round(time / answered) : null,
    sample: answered,
  };
}

function weakestTopic() {
  const aggregates = resultAggregates();
  const candidates = [];
  for (const discipline of enhancement.studyIndex?.disciplines || []) {
    for (const topic of discipline.topics || []) {
      const metrics = topicMetrics(topic, aggregates);
      if (metrics.sample < 2) continue;
      candidates.push({discipline: discipline.name, topic, ...metrics});
    }
  }
  return candidates.sort((a, b) => a.accuracy - b.accuracy || b.sample - a.sample)[0] || null;
}

function daysUntilExam() {
  const target = new Date(enhancement.exam?.data_prova ? `${enhancement.exam.data_prova}T23:59:59-03:00` : Date.now()).getTime();
  return Math.max(1, Math.ceil((target - Date.now()) / DAY));
}

function todayPanel() {
  const due = dueReviewItems();
  const answered = answeredIds();
  const total = Number(enhancement.catalog?.summary?.questoes || allQuestionIds().length || 0);
  const unseen = Math.max(0, total - answered.size);
  const daily = Math.ceil(unseen / daysUntilExam());
  const weak = weakestTopic();
  const saved = session();
  const stages = due.reduce((acc, item) => {
    const label = reviewStageLabel(item);
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const profile = activeProfile();
  return `<section class="today-panel card" data-smart-today>
    <div class="today-panel-head"><div><p class="eyebrow">Plano de hoje · ${esc(profile.name)}</p><h2>O próximo passo já está definido.</h2><p>Revisões vencidas, inéditas e ponto fraco calculados a partir do seu histórico local.</p></div><span class="today-badge">${due.length} para revisar</span></div>
    <div class="today-metrics">
      <div><small>Revisão D0/D7/D20</small><strong>${due.length}</strong><span>${["D0","D7","D20"].map(label => `${label}: ${stages[label] || 0}`).join(" · ")}</span></div>
      <div><small>Questões inéditas</small><strong>${unseen}</strong><span>ritmo sugerido: ${daily}/dia</span></div>
      <div><small>Ponto fraco atual</small><strong>${weak ? `${weak.accuracy}%` : "—"}</strong><span>${weak ? `${esc(weak.discipline)} · ${esc(weak.topic.name)}` : "dados insuficientes"}</span></div>
      <div><small>Tentativa salva</small><strong>${saved ? `${Number(saved.current || 0) + 1}/${saved.questionIds?.length || 0}` : "—"}</strong><span>${saved ? esc(saved.material?.nome || "sessão em andamento") : "nenhuma tentativa"}</span></div>
    </div>
    <div class="today-actions">
      <button class="btn primary" data-smart-review ${due.length ? "" : "disabled"}>Começar revisão</button>
      <button class="btn" data-smart-unseen ${unseen ? "" : "disabled"}>Resolver inéditas</button>
      <button class="btn" data-smart-weak ${weak ? "" : "disabled"}>Treinar ponto fraco</button>
      ${saved ? '<button class="btn" data-smart-resume>Continuar tentativa</button>' : ""}
    </div>
  </section>`;
}

function injectTodayPanel() {
  const hero = document.querySelector(".home-hero");
  if (!hero || document.querySelector("[data-smart-today]")) return;
  hero.insertAdjacentHTML("afterend", todayPanel());
  document.querySelector("[data-smart-review]")?.addEventListener("click", () => {
    const due = dueReviewItems();
    createSession(due.slice(0, 30).map(item => item.id), {name: "Revisão D0/D7/D20", materialId: "revisao-d0-d7-d20", minutes: Math.max(15, due.length * 2)});
  });
  document.querySelector("[data-smart-unseen]")?.addEventListener("click", () => {
    const answered = answeredIds();
    const ids = shuffle(allQuestionIds().filter(id => !answered.has(id))).slice(0, 20);
    createSession(ids, {name: "Meta de questões inéditas", materialId: "meta-ineditas"});
  });
  document.querySelector("[data-smart-weak]")?.addEventListener("click", () => {
    const weak = weakestTopic();
    if (weak) createSession(shuffle(weak.topic.question_ids).slice(0, 20), {name: `Ponto fraco — ${weak.topic.name}`, discipline: weak.discipline, materialId: "ponto-fraco"});
  });
  document.querySelector("[data-smart-resume]")?.addEventListener("click", () => { location.hash = "#/resolver"; location.reload(); });
  injectRoleTemplates(hero.parentElement);
}

function availableIdsForRole(role) {
  const materialIds = new Set((enhancement.catalog?.materials || [])
    .filter(item => String(item.codigo_cargo) === String(role) || String(item.codigo_cargo) === "multicargo")
    .map(item => item.id));
  return Object.entries(enhancement.catalog?.question_index || {})
    .filter(([, materialId]) => materialIds.has(materialId))
    .map(([id]) => id);
}

function balancedRoleSample(role, count = 30) {
  const available = new Set(availableIdsForRole(role));
  const groups = (enhancement.studyIndex?.disciplines || [])
    .map(item => ({name: item.name, ids: shuffle(item.question_ids.filter(id => available.has(id))) }))
    .filter(item => item.ids.length);
  const selected = [];
  while (selected.length < count && groups.some(group => group.ids.length)) {
    for (const group of groups) {
      const id = group.ids.shift();
      if (id) selected.push(id);
      if (selected.length >= count) break;
    }
  }
  return selected;
}

function injectRoleTemplates(container) {
  if (!container || document.querySelector("[data-role-templates]")) return;
  const profile = activeProfile();
  if (!profile.roles?.length) return;
  container.insertAdjacentHTML("beforeend", `<section class="role-templates section" data-role-templates><div class="section-head"><div><p class="eyebrow">Simulado por cargo</p><h2>Modelo equilibrado com o acervo disponível</h2><p>Não substitui a distribuição oficial do edital; organiza 30 questões entre as matérias disponíveis para cada cargo.</p></div></div><div class="role-template-grid">${profile.roles.map(role => `<article class="card role-template"><span class="type-badge">Cargo ${esc(role)}</span><h3>${esc(role)}</h3><p>${availableIdsForRole(role).length} questões correlatas disponíveis.</p><button class="btn primary full" data-role-sim="${esc(role)}">Iniciar 30 questões</button></article>`).join("")}</div></section>`);
  document.querySelectorAll("[data-role-sim]").forEach(button => button.addEventListener("click", () => {
    const role = button.dataset.roleSim;
    const ids = balancedRoleSample(role, 30);
    createSession(ids, {name: `Simulado por cargo ${role}`, materialId: `cargo-${role}`, mode: "prova", minutes: 60, cargo: role});
  }));
}

function injectTopicMetrics() {
  const topicList = document.querySelector(".topic-list");
  if (!topicList || topicList.dataset.smartMetrics === "1") return;
  const heading = document.querySelector(".page-heading h1")?.textContent?.trim();
  const discipline = (enhancement.studyIndex?.disciplines || []).find(item => item.name === heading);
  if (!discipline) return;
  topicList.dataset.smartMetrics = "1";
  const aggregates = resultAggregates();
  for (const label of topicList.querySelectorAll(".topic-option")) {
    const input = label.querySelector("[data-topic]");
    const topic = discipline.topics.find(item => item.name === input?.value);
    if (!topic || label.querySelector(".topic-insight")) continue;
    const metric = topicMetrics(topic, aggregates);
    const detail = document.createElement("small");
    detail.className = "topic-insight";
    const accuracy = metric.accuracy === null ? "sem precisão" : `${metric.accuracy}% de acerto`;
    const time = metric.averageSeconds === null ? "sem tempo médio" : `${Math.floor(metric.averageSeconds / 60)}m${String(metric.averageSeconds % 60).padStart(2, "0")}s médios`;
    detail.textContent = `${metric.coverage}% coberto · ${accuracy} · ${time}`;
    label.querySelector("span")?.append(detail);
  }
  const actions = document.querySelector(".topic-bulk-actions");
  if (actions && !actions.querySelector("[data-select-weak-topics]")) {
    actions.insertAdjacentHTML("beforeend", '<button class="btn compact" data-select-weak-topics>Selecionar pontos fracos</button>');
    actions.querySelector("[data-select-weak-topics]").addEventListener("click", () => {
      const ranked = discipline.topics.map(topic => ({topic, ...topicMetrics(topic, aggregates)}))
        .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101) || a.coverage - b.coverage);
      let selected = ranked.filter(item => item.sample >= 2 && item.accuracy < 75).slice(0, 5);
      if (!selected.length) selected = ranked.slice(0, 3);
      const names = new Set(selected.map(item => item.topic.name));
      topicList.querySelectorAll("[data-topic]").forEach(input => { input.checked = names.has(input.value); input.dispatchEvent(new Event("change", {bubbles: true})); });
    });
  }
}

function saveNote(id, value) {
  const current = notes();
  const text = String(value || "").trim();
  if (text) current[id] = {text, updatedAt: new Date().toISOString()}; else delete current[id];
  writeJSON(smartKey("notes"), current);
}

function noteEditor(id) {
  const value = notes()[id]?.text || "";
  return `<label class="question-note" data-note-for="${esc(id)}"><span>Minha anotação</span><textarea rows="3" placeholder="Regra, dúvida ou macete pessoal">${esc(value)}</textarea><small>Salva somente neste perfil e neste aparelho.</small></label>`;
}

function injectCurrentQuestionNote() {
  const card = document.querySelector(".question-card");
  if (!card || card.querySelector("[data-note-for]")) return;
  const currentSession = session();
  const id = currentSession?.questionIds?.[Number(currentSession.current || 0)];
  if (!id) return;
  const footer = card.querySelector(".exam-actions");
  footer?.insertAdjacentHTML("beforebegin", noteEditor(id));
  const textarea = card.querySelector(`[data-note-for="${CSS.escape(id)}"] textarea`);
  textarea?.addEventListener("input", event => saveNote(id, event.target.value));
}

function injectResultTools() {
  const reasonOptions = ["Não sabia o conteúdo", "Confundi a regra ou a lei", "Erro de interpretação", "Distração", "Falta de tempo", "Chute", "Questão ambígua"];
  const storedReasons = reasons();
  for (const card of document.querySelectorAll(".result-question")) {
    const marker = card.querySelector("[data-result-mark]");
    const id = marker?.dataset.resultMark;
    if (!id) continue;
    if (!card.querySelector("[data-note-for]")) {
      marker.insertAdjacentHTML("beforebegin", noteEditor(id));
      card.querySelector(`[data-note-for="${CSS.escape(id)}"] textarea`)?.addEventListener("input", event => saveNote(id, event.target.value));
    }
    const status = card.querySelector(".result-status")?.textContent?.trim();
    if (status !== "Incorreta" || card.querySelector("[data-error-reason]")) continue;
    marker.insertAdjacentHTML("beforebegin", `<label class="error-reason"><span>Por que eu errei?</span><select data-error-reason="${esc(id)}"><option value="">Selecionar motivo</option>${reasonOptions.map(option => `<option value="${esc(option)}" ${storedReasons[id]?.reason === option ? "selected" : ""}>${esc(option)}</option>`).join("")}</select></label>`);
    card.querySelector(`[data-error-reason="${CSS.escape(id)}"]`)?.addEventListener("change", event => {
      const current = reasons();
      if (event.target.value) current[id] = {reason: event.target.value, updatedAt: new Date().toISOString()}; else delete current[id];
      writeJSON(smartKey("errorReasons"), current);
    });
  }
}

function csvValue(value) {
  return `"${String(value || "").replaceAll('"', '""')}"`;
}

async function questionMapFor(ids) {
  const grouped = new Map();
  for (const id of ids) {
    const materialId = enhancement.catalog?.question_index?.[id];
    if (!materialId) continue;
    if (!grouped.has(materialId)) grouped.set(materialId, []);
    grouped.get(materialId).push(id);
  }
  const map = new Map();
  await Promise.all([...grouped.entries()].map(async ([materialId, questionIds]) => {
    const meta = enhancement.catalog.materials.find(item => item.id === materialId);
    if (!meta) return;
    const response = await fetch(meta.file, {cache: "force-cache"});
    if (!response.ok) return;
    const material = await response.json();
    const wanted = new Set(questionIds);
    for (const question of material.questoes || []) if (wanted.has(question.id)) map.set(question.id, {...question, materialName: material.nome, discipline: question.disciplina || material.disciplina});
  }));
  return map;
}

async function exportAnki() {
  const noteMap = notes();
  const reasonMap = reasons();
  const errorIds = Object.values(readJSON(profileKey("errors"), {})).filter(item => item.open).map(item => item.id);
  const ids = [...new Set([...Object.keys(noteMap), ...Object.keys(reasonMap), ...errorIds])];
  if (!ids.length) return alert("Ainda não há anotações ou erros para exportar.");
  const questions = await questionMapFor(ids);
  const rows = [["Frente", "Verso", "Tags"]];
  for (const id of ids) {
    const question = questions.get(id);
    if (!question) continue;
    const back = [`Gabarito: ${question.gabarito}`, question.comentario ? `Comentário: ${question.comentario}` : "", noteMap[id]?.text ? `Minha anotação: ${noteMap[id].text}` : "", reasonMap[id]?.reason ? `Motivo do erro: ${reasonMap[id].reason}` : ""].filter(Boolean).join("\n\n");
    const tags = ["SEDESDF", question.discipline, question.assunto, question.materialName].filter(Boolean).join(" ").replaceAll(/\s+/g, "_");
    rows.push([question.enunciado, back, tags]);
  }
  const csv = "\ufeff" + rows.map(row => row.map(csvValue).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = `sedes-anki-${profileId()}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function injectAnkiExport() {
  const actions = document.querySelector(".backup-actions");
  if (!actions || actions.querySelector("[data-export-anki]")) return;
  actions.insertAdjacentHTML("beforeend", '<button class="btn" data-export-anki>Exportar para Anki (.csv)</button>');
  actions.querySelector("[data-export-anki]").addEventListener("click", exportAnki);
}

function refreshEnhancements() {
  if (enhancement.processing || !enhancement.catalog || !enhancement.studyIndex) return;
  enhancement.processing = true;
  try {
    syncReviewSchedule();
    injectTodayPanel();
    injectTopicMetrics();
    injectCurrentQuestionNote();
    injectResultTools();
    injectAnkiExport();
  } finally {
    enhancement.processing = false;
  }
}

async function initEnhancements() {
  try {
    const [catalogResponse, indexResponse, examResponse] = await Promise.all([
      fetch(CATALOG_URL, {cache: "no-store"}),
      fetch(STUDY_INDEX_URL, {cache: "no-store"}),
      fetch(EXAM_URL, {cache: "no-store"}),
    ]);
    if (!catalogResponse.ok || !indexResponse.ok || !examResponse.ok) throw new Error("Dados inteligentes indisponíveis.");
    enhancement.catalog = await catalogResponse.json();
    enhancement.studyIndex = await indexResponse.json();
    enhancement.exam = await examResponse.json();
    const observer = new MutationObserver(() => queueMicrotask(refreshEnhancements));
    const app = document.querySelector("#app");
    if (app) observer.observe(app, {childList: true, subtree: true});
    window.addEventListener("hashchange", () => setTimeout(refreshEnhancements, 0));
    window.addEventListener("storage", () => setTimeout(refreshEnhancements, 0));
    refreshEnhancements();
  } catch (error) {
    console.error("Melhorias inteligentes não puderam ser inicializadas:", error);
  }
}

initEnhancements();
