export const RELEASE_META_URL = "./data/release/release-meta.json";
export const CATALOG_URL = "./data/release/catalogo.json";
export const STUDY_INDEX_URL = "./data/release/study-index.json";
export const EXAM_URL = "./data/concurso.json";
export const ACTIVE_PROFILE_KEY = "sedes.questoes.activeProfile.v3";
export const PROFILES_KEY = "sedes.questoes.profiles.v3";
export const OFFICIAL_MATERIAL_ID = "prova-real-sedes-2026";
export const DAY = 86400000;

export const state = {release: null, catalog: null, studyIndex: null, exam: null};
let dataPromise = null;
export const safeParse = (value, fallback) => {
  try { return JSON.parse(value ?? JSON.stringify(fallback)); }
  catch { return fallback; }
};
export const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");
export const activeProfileId = () => localStorage.getItem(ACTIVE_PROFILE_KEY) || "rodrigo";
export const profileKey = suffix => `sedes.questoes.${activeProfileId()}.${suffix}`;
export const currentRoute = () => (location.hash.replace(/^#\/?/, "").split("/")[0] || "inicio").toLowerCase();
export const readJSON = (key, fallback) => safeParse(localStorage.getItem(key), fallback);
export const saveJSON = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (error) { console.error(error); toast("Falha ao salvar. Gere um backup e libere espaço.", "error"); return false; }
};
export const toast = (message, type = "info") => {
  document.querySelector(".platform-toast")?.remove();
  const element = document.createElement("div");
  element.className = `platform-toast ${type}`;
  element.role = "status";
  element.textContent = message;
  document.body.append(element);
  setTimeout(() => element.remove(), 4800);
};
export const shuffle = values => {
  const items = [...values];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const random = Math.floor(Math.random() * (index + 1));
    [items[index], items[random]] = [items[random], items[index]];
  }
  return items;
};
export const profileName = () => readJSON(PROFILES_KEY, []).find(item => item.id === activeProfileId())?.name || activeProfileId();
export const profileRoles = () => readJSON(PROFILES_KEY, []).find(item => item.id === activeProfileId())?.roles || [];
export const materialIdFromIndex = raw => {
  const meta = typeof raw === "string" ? {materialId: raw} : (raw || {});
  return meta.material_id || meta.materialId || meta.material || meta.id_material || null;
};
export const questionIndexEntries = () => Object.entries(state.catalog?.question_index || {}).map(([id, raw]) => {
  const meta = typeof raw === "string" ? {materialId: raw} : (raw || {});
  return {
    id,
    materialId: materialIdFromIndex(raw),
    code: meta.codigo || meta.code || id,
    discipline: meta.disciplina || meta.discipline || "",
  };
});
export const allQuestionIds = () => {
  const fromStudy = (state.studyIndex?.disciplines || []).flatMap(discipline => discipline.question_ids || []);
  return [...new Set(fromStudy.length ? fromStudy : questionIndexEntries().map(item => item.id))];
};
export const activeSession = () => readJSON(profileKey("session.v3"), null);
export const activeHistory = () => readJSON(profileKey("history.v3"), []);
export const createCompatibleSession = ({id, name, questionIds, questions = null, mode = "treino", minutes = questionIds.length * 2, discipline = "Múltiplas matérias", source = "Plataforma SEDES/DF", cargo = "multicargo", materialType = "simulado"}) => {
  if (!questionIds?.length) return false;
  const existing = activeSession();
  if (existing && !confirm("Existe uma tentativa salva. Deseja substituí-la por esta sessão?")) return false;
  const normalizedMaterialType = String(materialType || "simulado").toLocaleLowerCase("pt-BR") === "prova" ? "prova" : "simulado";
  const payload = {
    version: 4,
    material: {id, nome: name, disciplina: discipline, fonte: source, tipo_material: normalizedMaterialType, ano: 2026, codigo_cargo: cargo, tempo_sugerido_minutos: minutes},
    questionIds: [...new Set(questionIds)], mode, current: 0, answers: {}, confirmed: {}, flagged: {}, elapsedBase: 0, questionTimes: {}, savedAt: new Date().toISOString(),
  };
  if (Array.isArray(questions) && questions.length === payload.questionIds.length) payload.questions = questions;
  if (!saveJSON(profileKey("session.v3"), payload)) return false;
  // Troca o fragmento sem disparar hashchange antes do reload. Isso impede que a
  // instância antiga do app entre em /resolver e persista estado da sessão anterior
  // sobre o payload recém-gravado durante pagehide/visibilitychange.
  history.replaceState(history.state, "", "#/resolver");
  location.reload();
  return true;
};
export async function ensureData() {
  if (state.release && state.catalog && state.studyIndex && state.exam) return state;
  if (dataPromise) return dataPromise;
  dataPromise = (async () => {
    const responses = await Promise.all([
      fetch(RELEASE_META_URL, {cache: "no-store"}), fetch(CATALOG_URL, {cache: "no-store"}),
      fetch(STUDY_INDEX_URL, {cache: "no-store"}), fetch(EXAM_URL, {cache: "no-store"}),
    ]);
    if (!responses.every(response => response.ok)) throw new Error("Metadados da plataforma indisponíveis.");
    [state.release, state.catalog, state.studyIndex, state.exam] = await Promise.all(responses.map(response => response.json()));
    return state;
  })();
  try {
    return await dataPromise;
  } catch (error) {
    dataPromise = null;
    throw error;
  }
}
export const observeApp = callback => {
  let scheduled = false;
  const run = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      Promise.resolve(callback()).catch(console.error);
    });
  };
  new MutationObserver(run).observe(document.querySelector("#app") || document.body, {childList: true, subtree: true});
  window.addEventListener("hashchange", run);
  run();
};