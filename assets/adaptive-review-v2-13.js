import {DAY, currentRoute, profileKey, activeHistory, readJSON, saveJSON, createCompatibleSession, esc, observeApp, toast} from "./shared-v2-13.js?v=1";

const MODEL_KEY = () => profileKey("adaptiveReview.v1");
const PROCESSED_KEY = () => profileKey("adaptiveProcessed.v1");
function syncModel() {
  const model = readJSON(MODEL_KEY(), {});
  const processed = new Set(readJSON(PROCESSED_KEY(), []));
  const history = [...activeHistory()].sort((a, b) => new Date(a.finishedAt || 0) - new Date(b.finishedAt || 0));
  let changed = false;
  for (const attempt of history) {
    if (!attempt?.id || processed.has(attempt.id)) continue;
    const when = new Date(attempt.finishedAt || Date.now()).getTime();
    for (const result of attempt.questionResults || []) {
      if (!result?.id || !result.answer) continue;
      const item = model[result.id] || {id: result.id, attempts: 0, correct: 0, streak: 0, lapses: 0, averageSeconds: 0};
      const seconds = Number(attempt.questionTimes?.[result.id] || 0);
      item.averageSeconds = Math.round((item.averageSeconds * item.attempts + seconds) / (item.attempts + 1));
      item.attempts += 1; item.correct += result.correct ? 1 : 0; item.lastResultAt = when;
      item.materialId = result.materialId || item.materialId || null; item.discipline = result.discipline || item.discipline || "Sem classificação"; item.assunto = result.assunto || item.assunto || "";
      if (result.correct) {
        item.streak += 1;
        const base = [2, 4, 8, 15, 30, 60][Math.min(item.streak - 1, 5)];
        item.interval = Math.max(1, Math.round(base * (seconds > 180 ? 0.55 : seconds > 120 ? 0.75 : 1)));
        item.dueAt = when + item.interval * DAY;
      } else { item.streak = 0; item.lapses += 1; item.interval = 0; item.dueAt = when; }
      item.mastery = Math.min(100, Math.max(0, Math.round(item.correct / item.attempts * 70 + Math.min(item.streak, 5) * 6 - item.lapses * 4)));
      model[result.id] = item;
    }
    processed.add(attempt.id); changed = true;
  }
  if (changed) { saveJSON(MODEL_KEY(), model); saveJSON(PROCESSED_KEY(), [...processed].slice(-1500)); }
  return model;
}
function dueItems() {
  const now = Date.now();
  return Object.values(syncModel()).filter(item => Number(item.dueAt || 0) <= now || item.mastery < 45).sort((a, b) => b.lapses - a.lapses || a.mastery - b.mastery || Number(a.dueAt || 0) - Number(b.dueAt || 0));
}
function startReview() {
  const due = dueItems().slice(0, 20);
  if (!due.length) return toast("Não há revisões adaptativas vencidas.");
  createCompatibleSession({id: "revisao-adaptativa", name: "Revisão adaptativa", questionIds: due.map(item => item.id), mode: "treino", minutes: due.length * 2, discipline: "Prioridades calculadas", source: "Histórico local"});
}
function injectCard() {
  if (currentRoute() !== "revisar" || document.querySelector("[data-adaptive-review]")) return;
  const due = dueItems(); const model = Object.values(readJSON(MODEL_KEY(), {}));
  const weakest = [...model].filter(item => item.attempts >= 2).sort((a, b) => a.mastery - b.mastery || b.lapses - a.lapses)[0];
  const target = document.querySelector(".review-actions");
  if (!target) return;
  const card = document.createElement("section"); card.className = "adaptive-review card"; card.dataset.adaptiveReview = "";
  card.innerHTML = `<div><p class="eyebrow">Revisão adaptativa</p><h2>${due.length} questão(ões) prioritária(s)</h2><p>Intervalos ajustados por acerto, reincidência e tempo de resposta. ${weakest ? `Menor domínio: ${esc(weakest.discipline)}${weakest.assunto ? ` · ${esc(weakest.assunto)}` : ""} (${weakest.mastery}%).` : "Resolva novas tentativas para calibrar o modelo."}</p></div><div class="adaptive-facts"><span><strong>${model.filter(item => item.lapses > 1).length}</strong><small>reincidentes</small></span><span><strong>${model.filter(item => item.mastery >= 80).length}</strong><small>dominadas</small></span><span><strong>${due.filter(item => item.averageSeconds > 120).length}</strong><small>lentas</small></span></div><button class="btn primary" data-start-adaptive ${due.length ? "" : "disabled"}>Iniciar revisão adaptativa</button>`;
  target.insertAdjacentElement("beforebegin", card);
  card.querySelector("[data-start-adaptive]").addEventListener("click", startReview);
}
observeApp(injectCard);
