const ACTIVE_PROFILE_KEY = "sedes.questoes.activeProfile.v3";
const PROFILES_KEY = "sedes.questoes.profiles.v3";
const DAY = 86400000;

const readJSON = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
};
const writeJSON = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (error) { console.error("Falha ao salvar dados do relatório:", error); return false; }
};
const profileId = () => localStorage.getItem(ACTIVE_PROFILE_KEY) || "rodrigo";
const profileKey = suffix => `sedes.questoes.${profileId()}.${suffix}.v3`;
const smartKey = suffix => `sedes.questoes.${profileId()}.${suffix}.v1`;
const history = () => readJSON(profileKey("history"), []);
const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const state = {period: 7, processing: false};

function activeProfile() {
  const profiles = readJSON(PROFILES_KEY, []);
  return profiles.find(item => item.id === profileId()) || {id: profileId(), name: profileId()};
}

function attemptTime(attempt) {
  const value = attempt?.finishedAt || attempt?.savedAt || attempt?.createdAt;
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function answeredIds(attempt) {
  if (Array.isArray(attempt?.answeredQuestionIds)) return attempt.answeredQuestionIds.filter(Boolean);
  if (attempt?.answers && typeof attempt.answers === "object") {
    return Object.entries(attempt.answers).filter(([, answer]) => Boolean(answer)).map(([id]) => id);
  }
  return (attempt?.questionResults || []).filter(item => item?.answer).map(item => item.id).filter(Boolean);
}

function attemptsInRange(days, offset = 0) {
  const now = Date.now();
  if (!days) return history().filter(item => attemptTime(item));
  const end = now - offset * days * DAY;
  const start = end - days * DAY;
  return history().filter(item => {
    const time = attemptTime(item);
    return time >= start && time < end;
  });
}

function periodStats(days, offset = 0) {
  const attempts = attemptsInRange(days, offset);
  const unique = new Set();
  const daily = new Map();
  const disciplines = new Map();
  let answered = 0;
  let correct = 0;
  let elapsed = 0;

  for (const attempt of attempts) {
    const ids = answeredIds(attempt);
    ids.forEach(id => unique.add(id));
    answered += ids.length;
    correct += Number(attempt.correct || 0);
    elapsed += Number(attempt.elapsed || 0);
    const timestamp = attemptTime(attempt);
    const day = new Date(timestamp).toISOString().slice(0, 10);
    const dailyCurrent = daily.get(day) || {answered: 0, correct: 0, elapsed: 0};
    dailyCurrent.answered += ids.length;
    dailyCurrent.correct += Number(attempt.correct || 0);
    dailyCurrent.elapsed += Number(attempt.elapsed || 0);
    daily.set(day, dailyCurrent);

    for (const result of attempt.questionResults || []) {
      if (!result?.answer) continue;
      const name = result.discipline || "Sem classificação";
      const current = disciplines.get(name) || {answered: 0, correct: 0};
      current.answered += 1;
      if (result.correct) current.correct += 1;
      disciplines.set(name, current);
    }
  }

  return {
    attempts: attempts.length,
    answered,
    correct,
    accuracy: answered ? Math.round(correct / answered * 1000) / 10 : 0,
    elapsed,
    unique: unique.size,
    daily,
    disciplines: [...disciplines.entries()].map(([name, values]) => ({
      name,
      ...values,
      accuracy: values.answered ? Math.round(values.correct / values.answered * 1000) / 10 : 0,
    })).sort((a, b) => b.answered - a.answered || b.accuracy - a.accuracy),
  };
}

function formatDuration(seconds) {
  const safe = Math.max(0, Math.round(Number(seconds || 0)));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return hours ? `${hours}h ${minutes}min` : `${minutes}min`;
}

function delta(current, previous, suffix = "") {
  const difference = Math.round((Number(current || 0) - Number(previous || 0)) * 10) / 10;
  if (!difference) return `<span class="report-delta neutral">sem mudança</span>`;
  const className = difference > 0 ? "positive" : "negative";
  return `<span class="report-delta ${className}">${difference > 0 ? "+" : ""}${difference}${suffix}</span>`;
}

function daySeries(days, stats) {
  const count = days || 30;
  const start = new Date(Date.now() - (count - 1) * DAY);
  start.setHours(0, 0, 0, 0);
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const date = new Date(start.getTime() + index * DAY);
    const key = date.toISOString().slice(0, 10);
    values.push({
      key,
      label: date.toLocaleDateString("pt-BR", {day: "2-digit", month: "2-digit"}),
      answered: Number(stats.daily.get(key)?.answered || 0),
    });
  }
  return values;
}

function reasonStats() {
  const values = Object.values(readJSON(smartKey("errorReasons"), {}));
  const map = new Map();
  values.forEach(item => {
    const reason = item?.reason || "Não classificado";
    map.set(reason, (map.get(reason) || 0) + 1);
  });
  return [...map.entries()].map(([reason, count]) => ({reason, count})).sort((a, b) => b.count - a.count);
}

function reportInsight(stats, previous) {
  if (!stats.answered) return "Ainda não há respostas neste período. Uma sessão curta já será suficiente para iniciar a comparação.";
  if (!previous.answered) return `Você respondeu ${stats.answered} questões no período. O próximo ciclo criará uma comparação real.`;
  const answerDelta = stats.answered - previous.answered;
  const accuracyDelta = Math.round((stats.accuracy - previous.accuracy) * 10) / 10;
  if (answerDelta > 0 && accuracyDelta >= 0) return `Volume e precisão avançaram juntos: ${answerDelta} respostas a mais e ${accuracyDelta} ponto(s) percentual(is) de evolução.`;
  if (answerDelta > 0 && accuracyDelta < 0) return `O volume aumentou, mas a precisão caiu ${Math.abs(accuracyDelta)} ponto(s). Priorize a revisão dos erros antes de ampliar novamente a carga.`;
  if (answerDelta <= 0 && accuracyDelta > 0) return `A precisão melhorou ${accuracyDelta} ponto(s), embora o volume tenha diminuído. O ganho de qualidade é positivo; agora falta recuperar consistência.`;
  return "Volume e precisão ficaram abaixo do período anterior. Retome pelo painel Hoje e por uma meta pequena de questões inéditas.";
}

function renderBars(series) {
  const max = Math.max(1, ...series.map(item => item.answered));
  return `<div class="report-bars" role="img" aria-label="Questões respondidas por dia">${series.map(item => `<div class="report-bar-column" title="${esc(item.label)}: ${item.answered}"><span class="report-bar-value">${item.answered || ""}</span><i style="height:${Math.max(item.answered ? 8 : 2, Math.round(item.answered / max * 100))}%"></i><small>${esc(item.label)}</small></div>`).join("")}</div>`;
}

function renderReport() {
  const days = state.period;
  const current = periodStats(days, 0);
  const previous = days ? periodStats(days, 1) : {answered: 0, accuracy: 0, elapsed: 0, attempts: 0};
  const series = daySeries(days, current);
  const reasons = reasonStats();
  const topDisciplines = current.disciplines.slice(0, 6);
  const periodLabel = days === 7 ? "Últimos 7 dias" : days === 30 ? "Últimos 30 dias" : "Todo o histórico";

  return `<section class="progress-report section" data-progress-reports>
    <div class="section-head report-heading"><div><p class="eyebrow">Evolução por período</p><h2>Relatório de ${esc(activeProfile().name)}</h2><p>Respostas em branco são desconsideradas. A comparação usa um período anterior de igual duração.</p></div><div class="report-periods" role="group" aria-label="Período do relatório"><button class="btn compact ${days === 7 ? "primary" : ""}" data-report-period="7">7 dias</button><button class="btn compact ${days === 30 ? "primary" : ""}" data-report-period="30">30 dias</button><button class="btn compact ${days === 0 ? "primary" : ""}" data-report-period="0">Tudo</button></div></div>
    <article class="card report-summary"><div><span>${periodLabel}</span><strong>${current.answered}</strong><small>respostas marcadas</small>${days ? delta(current.answered, previous.answered) : ""}</div><div><span>Precisão</span><strong>${current.accuracy}%</strong><small>${current.correct} acertos</small>${days ? delta(current.accuracy, previous.accuracy, " p.p.") : ""}</div><div><span>Tempo de estudo</span><strong>${formatDuration(current.elapsed)}</strong><small>${current.attempts} tentativa(s)</small>${days ? delta(Math.round(current.elapsed / 60), Math.round(previous.elapsed / 60), " min") : ""}</div><div><span>Cobertura no período</span><strong>${current.unique}</strong><small>questões únicas</small></div></article>
    <article class="card report-insight"><strong>Leitura automática</strong><p>${esc(reportInsight(current, previous))}</p></article>
    <div class="two-col report-grid"><article class="card performance-panel"><p class="eyebrow">Consistência</p><h3>Questões por dia</h3>${renderBars(series)}</article><article class="card performance-panel"><p class="eyebrow">Matérias no período</p><h3>Volume e precisão</h3>${topDisciplines.length ? `<div class="report-discipline-list">${topDisciplines.map(item => `<div><span><strong>${esc(item.name)}</strong><small>${item.answered} respostas</small></span><b>${item.accuracy}%</b></div>`).join("")}</div>` : `<p class="muted">Nenhuma matéria respondida neste período.</p>`}</article></div>
    <div class="two-col report-grid"><article class="card performance-panel"><p class="eyebrow">Diagnóstico de execução</p><h3>Motivos registrados nos erros</h3>${reasons.length ? `<div class="report-reason-list">${reasons.slice(0, 7).map(item => `<div><span>${esc(item.reason)}</span><strong>${item.count}</strong></div>`).join("")}</div>` : `<p class="muted">Classifique os erros na correção para gerar este diagnóstico.</p>`}</article><article class="card performance-panel"><p class="eyebrow">Exportação</p><h3>Relatório e backup completo</h3><p class="muted">O backup completo inclui histórico, erros, marcadas, revisão D0/D7/D20, anotações e motivos dos erros.</p><div class="backup-actions"><button class="btn" data-export-report>Exportar relatório CSV</button><button class="btn primary" data-export-complete>Backup completo</button><label class="btn file-button">Restaurar completo<input type="file" accept="application/json" data-import-complete></label></div></article></div>
  </section>`;
}

function csv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportReport() {
  const stats = periodStats(state.period, 0);
  const rows = [["Perfil", "Período", "Tentativas", "Respostas", "Acertos", "Precisão", "Tempo (s)", "Questões únicas"]];
  rows.push([activeProfile().name, state.period ? `${state.period} dias` : "Todo o histórico", stats.attempts, stats.answered, stats.correct, stats.accuracy, stats.elapsed, stats.unique]);
  rows.push([]);
  rows.push(["Matéria", "Respostas", "Acertos", "Precisão"]);
  stats.disciplines.forEach(item => rows.push([item.name, item.answered, item.correct, item.accuracy]));
  const content = "\ufeff" + rows.map(row => row.map(csv).join(";")).join("\n");
  downloadBlob(content, `sedes-relatorio-${profileId()}-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
}

function completeBackupPayload() {
  return {
    schema_version: "2.10",
    exported_at: new Date().toISOString(),
    profile: activeProfile(),
    data: {
      history: readJSON(profileKey("history"), []),
      errors: readJSON(profileKey("errors"), {}),
      marked: readJSON(profileKey("marked"), {}),
      session: readJSON(profileKey("session"), null),
      notes: readJSON(smartKey("notes"), {}),
      errorReasons: readJSON(smartKey("errorReasons"), {}),
      reviewSchedule: readJSON(smartKey("reviewSchedule"), {}),
      reviewProcessedAttempts: readJSON(smartKey("reviewProcessedAttempts"), []),
    },
  };
}

function downloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCompleteBackup() {
  downloadBlob(JSON.stringify(completeBackupPayload(), null, 2), `sedes-backup-completo-${profileId()}-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
}

async function importCompleteBackup(file) {
  try {
    const payload = JSON.parse(await file.text());
    if (payload?.schema_version !== "2.10" || !payload?.data || !Array.isArray(payload.data.history)) throw new Error("Formato inválido");
    if (!confirm(`Restaurar o backup completo no perfil ${activeProfile().name}? Os dados locais atuais deste perfil serão substituídos.`)) return;
    const data = payload.data;
    writeJSON(profileKey("history"), data.history || []);
    writeJSON(profileKey("errors"), data.errors || {});
    writeJSON(profileKey("marked"), data.marked || {});
    if (data.session) writeJSON(profileKey("session"), data.session); else localStorage.removeItem(profileKey("session"));
    writeJSON(smartKey("notes"), data.notes || {});
    writeJSON(smartKey("errorReasons"), data.errorReasons || {});
    writeJSON(smartKey("reviewSchedule"), data.reviewSchedule || {});
    writeJSON(smartKey("reviewProcessedAttempts"), data.reviewProcessedAttempts || []);
    alert("Backup completo restaurado com sucesso.");
    location.reload();
  } catch (error) {
    console.error(error);
    alert("Este arquivo não é um backup completo válido da plataforma.");
  }
}

function bindReportActions(section) {
  section.querySelectorAll("[data-report-period]").forEach(button => button.addEventListener("click", () => {
    state.period = Number(button.dataset.reportPeriod);
    section.outerHTML = renderReport();
    bindReportActions(document.querySelector("[data-progress-reports]"));
  }));
  section.querySelector("[data-export-report]")?.addEventListener("click", exportReport);
  section.querySelector("[data-export-complete]")?.addEventListener("click", exportCompleteBackup);
  section.querySelector("[data-import-complete]")?.addEventListener("change", event => event.target.files?.[0] && importCompleteBackup(event.target.files[0]));
}

function injectReports() {
  if (!location.hash.includes("desempenho")) return;
  const hero = document.querySelector(".performance-hero");
  if (!hero || document.querySelector("[data-progress-reports]")) return;
  hero.insertAdjacentHTML("afterend", renderReport());
  bindReportActions(document.querySelector("[data-progress-reports]"));
}

function refresh() {
  if (state.processing) return;
  state.processing = true;
  try { injectReports(); }
  finally { state.processing = false; }
}

const app = document.querySelector("#app");
if (app) new MutationObserver(() => queueMicrotask(refresh)).observe(app, {childList: true, subtree: true});
window.addEventListener("hashchange", () => setTimeout(refresh, 0));
window.addEventListener("storage", () => setTimeout(refresh, 0));
refresh();
