import {ensureData, state, activeSession, activeHistory, currentRoute, esc, observeApp} from "./shared-v2-13.js?v=1";

const ISSUES_URL = "https://github.com/RodrigoRosaDantas/sedes-df-questoes/issues/new";
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
function openDialog(context) {
  document.querySelector("[data-report-dialog]")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "platform-dialog-backdrop"; backdrop.dataset.reportDialog = "";
  backdrop.innerHTML = `<section class="platform-dialog card" role="dialog" aria-modal="true" aria-labelledby="report-title"><p class="eyebrow">Qualidade editorial</p><h2 id="report-title">Reportar problema nesta questão</h2><p><strong>${esc(context.id)}</strong> · ${esc(context.material)}</p><label>Tipo<select data-report-category><option>Possível erro de gabarito</option><option>Erro de transcrição</option><option>Comentário ou fundamento incompleto</option><option>Classificação incorreta</option><option>Imagem ausente ou ilegível</option><option>Problema visual ou de navegação</option><option>Outro</option></select></label><label>Descrição<textarea data-report-details rows="5" placeholder="Explique o problema e, quando possível, indique a fonte."></textarea></label><div class="dialog-actions"><button class="btn primary" data-report-open>Abrir relato no GitHub</button><button class="btn" data-report-cancel>Cancelar</button></div><p class="muted">O relato não altera automaticamente a questão, o Notion ou o site.</p></section>`;
  document.body.append(backdrop);
  backdrop.querySelector("[data-report-cancel]").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.remove(); });
  backdrop.querySelector("[data-report-open]").addEventListener("click", () => {
    const category = backdrop.querySelector("[data-report-category]").value;
    const details = backdrop.querySelector("[data-report-details]").value.trim() || "Descreva aqui o problema observado.";
    const release = state.release || {};
    const title = `[Questão] ${context.id} — ${category}`;
    const body = [`### Questão`, context.id, `### Material`, context.material, `### Tipo`, category, `### Descrição`, details, `### Ambiente`, `- Release: ${release.app_version || "desconhecida"}`, `- Commit: ${release.source_sha || "desconhecido"}`, `- Rota: ${context.route}`, `- Navegador: ${navigator.userAgent}`].join("\n\n");
    window.open(`${ISSUES_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, "_blank", "noopener,noreferrer");
    backdrop.remove();
  });
}
function injectReportButtons() {
  const route = currentRoute();
  if (route === "resolver") {
    const actions = document.querySelector(".exam-actions .actions");
    if (actions && !document.querySelector("[data-report-question]")) {
      const button = document.createElement("button"); button.className = "btn compact"; button.dataset.reportQuestion = ""; button.textContent = "⚑ Reportar problema";
      actions.append(button); button.addEventListener("click", () => openDialog(questionContext()));
    }
  }
  if (route === "resultado") document.querySelectorAll(".result-question").forEach((card, index) => {
    if (card.querySelector("[data-report-question]")) return;
    const button = document.createElement("button"); button.className = "btn compact"; button.dataset.reportQuestion = ""; button.textContent = "⚑ Reportar problema nesta questão";
    card.append(button); button.addEventListener("click", () => openDialog(questionContext(index)));
  });
}
ensureData().then(() => observeApp(injectReportButtons)).catch(console.error);
