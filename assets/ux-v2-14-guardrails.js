import {
  activeHistory,
  createCompatibleSession,
  currentRoute,
  observeApp,
  profileKey,
  questionIndexEntries,
  readJSON,
  saveJSON,
  state,
  toast,
} from "./shared-v2-13.js?v=1";

const ERRORS_KEY = () => profileKey("errors.v3");
const MARKED_KEY = () => profileKey("marked.v3");
const ADAPTIVE_KEY = () => profileKey("adaptiveReview.v1");
const POLICY_KEY = () => profileKey("errorMasteryPolicy.v1");

const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const stableScore = (id, salt) => {
  let hash = 2166136261;
  for (const char of `${salt}:${id}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
};
const stableTake = (ids, count, salt) => [...ids].sort((a, b) => stableScore(a, salt) - stableScore(b, salt)).slice(0, count);
const answeredIds = () => new Set(activeHistory().flatMap(attempt => {
  if (Array.isArray(attempt?.answeredQuestionIds)) return attempt.answeredQuestionIds;
  if (attempt?.answers && typeof attempt.answers === "object") return Object.entries(attempt.answers).filter(([, answer]) => Boolean(answer)).map(([id]) => id);
  return Array.isArray(attempt?.questionIds) ? attempt.questionIds : [];
}));

function ensurePolicyActivation() {
  const key = POLICY_KEY();
  let policy = readJSON(key, null);
  if (!policy?.activatedAt) {
    policy = {schema_version: "1.0", activatedAt: new Date().toISOString(), closeAfterConsecutiveCorrect: 3};
    saveJSON(key, policy);
  }
  return policy;
}

function reconcileErrorMastery() {
  const policy = ensurePolicyActivation();
  const activation = Date.parse(policy.activatedAt || "");
  if (!Number.isFinite(activation)) return;
  const book = readJSON(ERRORS_KEY(), {});
  const model = readJSON(ADAPTIVE_KEY(), {});
  let changed = false;
  for (const [id, item] of Object.entries(book)) {
    const updated = Date.parse(item?.updatedAt || "");
    if (!item?.count || !Number.isFinite(updated) || updated < activation) continue;
    const streak = Number(model[id]?.streak || 0);
    const shouldOpen = streak < Number(policy.closeAfterConsecutiveCorrect || 3);
    if (Boolean(item.open) !== shouldOpen) {
      item.open = shouldOpen;
      if (!shouldOpen) item.masteredAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) saveJSON(ERRORS_KEY(), book);
}

function criteriaFrom(root) {
  const value = name => root.querySelector(`[data-ux-filter-${name}]`)?.value || "";
  return {
    type: value("type"), discipline: value("discipline"), cargo: value("cargo"), year: value("year"),
    source: value("source"), scope: value("scope") || "all", count: value("count") || "20", mode: value("mode") || "treino",
  };
}

function correctedFilteredIds(criteria) {
  const matchingMaterials = (state.catalog?.materials || []).filter(item => {
    const type = normalize(item.tipo_material);
    return (!criteria.type || type === criteria.type)
      && (!criteria.cargo || String(item.codigo_cargo) === criteria.cargo)
      && (!criteria.year || String(item.ano) === criteria.year)
      && (!criteria.source || item.fonte === criteria.source);
  });
  const materialIds = new Set(matchingMaterials.map(item => item.id));
  let ids = questionIndexEntries().filter(item => materialIds.has(item.materialId)).map(item => item.id);

  if (criteria.discipline) {
    const discipline = (state.studyIndex?.disciplines || []).find(item => item.name === criteria.discipline);
    const allowed = new Set(discipline?.question_ids || []);
    ids = ids.filter(id => allowed.has(id));
  }

  const answered = answeredIds();
  const errors = readJSON(ERRORS_KEY(), {});
  const marked = readJSON(MARKED_KEY(), {});
  if (criteria.scope === "unanswered") ids = ids.filter(id => !answered.has(id));
  if (criteria.scope === "errors") ids = ids.filter(id => errors[id]?.open);
  if (criteria.scope === "marked") ids = ids.filter(id => Boolean(marked[id]));
  const count = criteria.count === "all" ? ids.length : Math.max(1, Number(criteria.count || 20));
  return stableTake(ids, count, `guarded-filter:${JSON.stringify(criteria)}`);
}

function startCorrectedFilter(event) {
  const button = event.target.closest("[data-ux-run-filter]");
  if (!button) return;
  const root = button.closest("[data-ux-study-launcher]") || document;
  const criteria = criteriaFrom(root);
  const ids = correctedFilteredIds(criteria);
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!ids.length) return toast("Não há questões disponíveis para os filtros selecionados.", "info");
  createCompatibleSession({
    id: "treino-personalizado-v2",
    name: "Treino personalizado",
    questionIds: ids,
    mode: criteria.mode,
    minutes: ids.length * 2,
    discipline: criteria.discipline || "Múltiplas matérias",
    source: "Filtros avançados v2.14",
  });
}

function closeMasteredByStreak(event) {
  const button = event.target.closest("[data-ux-close-mastered]");
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const book = readJSON(ERRORS_KEY(), {});
  const model = readJSON(ADAPTIVE_KEY(), {});
  let closed = 0;
  for (const [id, item] of Object.entries(book)) {
    if (item?.open && Number(model[id]?.streak || 0) >= 3) {
      item.open = false;
      item.masteredAt = new Date().toISOString();
      closed += 1;
    }
  }
  if (!closed) return toast("Nenhum erro atingiu 3 acertos consecutivos ainda.", "info");
  saveJSON(ERRORS_KEY(), book);
  toast(`${closed} erro(s) dominado(s) encerrado(s).`, "success");
  location.reload();
}

document.addEventListener("click", startCorrectedFilter, true);
document.addEventListener("click", closeMasteredByStreak, true);

observeApp(() => {
  document.documentElement.classList.toggle("ux-student-home", currentRoute() === "inicio");
  queueMicrotask(reconcileErrorMastery);
});
