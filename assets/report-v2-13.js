import {ensureData, state, activeSession, activeHistory, currentRoute, esc, observeApp, profileKey, readJSON, saveJSON, toast} from "./shared-v2-13.js?v=1";

const REPORTS_KEY = () => profileKey("questionReports.v1");
const REPORT_LIMIT = 200;

function questionContext(index = null) {
  const route = currentRoute();
  if (route === "resolver") {
    const session = activeSession();
    const position = Number.isInteger(index) ? index : Number(session?.current || 0);
    return {id: session?.questionIds?.[position] || "não identificado", material: session?.material?.nome || "sessão", route};
  }
  const attempt = activeHistory()[0];
  const result = attempt?.questionResults?.[Number(index || 0)];
  return {id: result?.id || "não identificado", material: attempt?.materialName || "resultado", route};
}

function saveInternalReport(context, category, details) {
  const release = state.release || {};
  const current = readJSON(REPORTS_KEY(), []);
  const report = {
    id: crypto.randomUUID?.() || `report-${Date.now()}`,
    questionId: context.id,
    material: context.material,
    category,
    details,
    route: context.route,
    status: "novo",
    createdAt: new Date().toISOString(),
    release: release.app_version || "desconhecida",
    sourceSha: release.source_sha || "desconhecido",
    userAgent: navigator.userAgent,
  };
  if (!saveJSON(REPORTS_KEY(), [report, ...current].slice(0, REPORT_LIMIT))) return false;
  window.SEDES_CLOUD_PROGRESS?.sync?.();
  window.dispatchEvent(new CustomEvent("sedes:question-report-saved", {detail: report}));
  return report;
}

function openDialog(context) {
  document.querySelector("[data-report-dialog]")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "platform-dialog-backdrop";
  backdrop.dataset.reportDialog = "";
  backdrop.innerHTML = `<section class="platform-dialog card" role="dialog" aria-modal="true" aria-labelledby="report-title">
    <p class="eyebrow">Qualidade editorial</p><h2 id="report-title">Reportar problema nesta questão</h2>
    <p><strong>${esc(context.id)}</strong> · ${esc(context.material)}</p>
    <label>Tipo<select data-report-category><option>Possível erro de gabarito</option><option>Erro de transcrição</option><option>Comentário ou fundamento incompleto</option><option>Classificação incorreta</option><option>Imagem ausente ou ilegível</option><option>Problema visual ou de navegação</option><option>Outro</option></select></label>
    <label>Descrição<textarea data-report-details rows="5" placeholder="Explique o problema e, quando possível, indique a fonte."></textarea></label>
    <div class="dialog-actions"><button class="btn primary" data-report-save>Enviar relato para revisão</button><button class="btn" data-report-cancel>Cancelar</button></div>
    <p class="muted">O relato fica salvo no seu progresso e sincroniza com a sua conta quando a nuvem estiver disponível. Ele não altera automaticamente a questão, o Notion ou o site.</p>
  </section>`;
  document.body.append(backdrop);
  backdrop.querySelector("[data-report-cancel]").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.remove(); });
  backdrop.querySelector("[data-report-save]").addEventListener("click", () => {
    const category = backdrop.querySelector("[data-report-category]").value;
    const details = backdrop.querySelector("[data-report-details]").value.trim();
    if (!details) {
      backdrop.querySelector("[data-report-details]").focus();
      toast("Descreva o problema antes de enviar.", "info");
      return;
    }
    const report = saveInternalReport(context, category, details);
    if (!report) return toast("Não foi possível salvar o relato neste aparelho.", "error");
    backdrop.remove();
    toast("Relato salvo para revisão. Você não precisa abrir uma issue no GitHub.", "success");
  });
}

function injectReportButtons() {
  const route = currentRoute();
  if (route === "resolver") {
    const actions = document.querySelector(".exam-actions .actions");
    if (actions && !document.querySelector("[data-report-question]")) {
      const button = document.createElement("button");
      button.className = "btn compact";
      button.dataset.reportQuestion = "";
      button.textContent = "⚑ Reportar problema";
      actions.append(button);
      button.addEventListener("click", () => openDialog(questionContext()));
    }
  }
  if (route === "resultado") document.querySelectorAll(".result-question").forEach((card, index) => {
    if (card.querySelector("[data-report-question]")) return;
    const button = document.createElement("button");
    button.className = "btn compact";
    button.dataset.reportQuestion = "";
    button.textContent = "⚑ Reportar problema nesta questão";
    card.append(button);
    button.addEventListener("click", () => openDialog(questionContext(index)));
  });
}

ensureData().then(() => observeApp(injectReportButtons)).catch(console.error);
