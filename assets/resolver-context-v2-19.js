import {
  currentRoute,
  ensureData,
  esc,
  materialIdFromIndex,
  observeApp,
  profileKey,
  state,
} from "./shared-v2-13.js?v=1";

const SUBJECT_SELECTION_KEYS = ["homeStudySubjects.v1", "homeStudySubjects.v2"];

function readSession() {
  try {
    const raw = localStorage.getItem(profileKey("session.v3"));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearFinishedSubjectSelection() {
  for (const suffix of SUBJECT_SELECTION_KEYS) {
    try { sessionStorage.removeItem(profileKey(suffix)); }
    catch { /* armazenamento temporário não deve bloquear a navegação */ }
  }
}

function materialForQuestion(questionId, session) {
  const raw = state.catalog?.question_index?.[questionId];
  const indexedId = materialIdFromIndex(raw);
  const directId = session?.material?.id;
  const materialId = indexedId || directId;
  if (!materialId) return null;
  return (state.catalog?.materials || []).find(material => String(material.id) === String(materialId)) || null;
}

function currentQuestionId(session) {
  const ids = Array.isArray(session?.questionIds)
    ? session.questionIds
    : Array.isArray(session?.questions)
      ? session.questions.map(question => question?.id).filter(Boolean)
      : [];
  if (!ids.length) return null;
  const index = Math.min(Math.max(Number(session?.current || 0), 0), ids.length - 1);
  return ids[index] || null;
}

function typeLabel(material) {
  return String(material?.tipo_material || "").toLocaleLowerCase("pt-BR") === "prova" ? "Prova anterior" : "Simulado";
}

function cargoLabel(material) {
  return material?.cargo || (material?.codigo_cargo ? `Cargo ${material.codigo_cargo}` : "Não informado");
}

function originMarkup(questionId, material) {
  const source = material?.fonte || "Não informada";
  const year = material?.ano || "Não informado";
  const cargo = cargoLabel(material);
  return `<div class="question-origin-meta" data-question-origin="${esc(questionId)}" data-question-origin-material="${esc(material.id)}" aria-label="Origem desta questão">
    <span class="question-origin-kind">${esc(typeLabel(material))}</span>
    <span><b>Banca/Fonte</b>${esc(source)}</span>
    <span><b>Ano</b>${esc(year)}</span>
    <span><b>Cargo</b>${esc(cargo)}</span>
  </div>`;
}

async function enhanceResolver() {
  const route = currentRoute();
  if (route === "resultado") {
    clearFinishedSubjectSelection();
    return;
  }
  if (route !== "resolver") return;

  const header = document.querySelector("#app .exam-header > div:first-child");
  if (!header) return;

  const session = readSession();
  const questionId = currentQuestionId(session);
  if (!questionId) return;

  await ensureData();
  const material = materialForQuestion(questionId, session);
  const type = String(material?.tipo_material || "").toLocaleLowerCase("pt-BR");
  if (!material || !["prova", "simulado"].includes(type)) return;

  const current = header.querySelector("[data-question-origin]");
  if (current?.dataset.questionOrigin === questionId && current?.dataset.questionOriginMaterial === String(material.id)) return;
  current?.remove();
  header.insertAdjacentHTML("beforeend", originMarkup(questionId, material));
}

observeApp(enhanceResolver);
window.addEventListener("pageshow", () => enhanceResolver().catch(console.error));
