/* UX v2.14 — progressive enhancement only.
   Não altera respostas, histórico, banco ou regras de correção. */

const FOCUS_KEY = "sedes.questoes.ux.focus.v1";
const app = document.querySelector("#app");

function currentRoute() {
  return (location.hash.replace(/^#\/?/, "").split("/")[0] || "inicio").toLowerCase();
}

function syncRouteClass() {
  document.body.dataset.uxRoute = currentRoute();
  if (currentRoute() !== "resolver") {
    document.body.classList.remove("ux-map-open");
  }
}

function focusEnabled() {
  return localStorage.getItem(FOCUS_KEY) === "1";
}

function applyFocusState() {
  document.body.classList.toggle("ux-focus-mode", currentRoute() === "resolver" && focusEnabled());
  document.querySelectorAll("[data-ux-focus]").forEach(button => {
    const active = focusEnabled();
    button.setAttribute("aria-pressed", String(active));
    button.textContent = active ? "Sair do foco" : "Modo foco";
  });
}

function toggleFocus() {
  localStorage.setItem(FOCUS_KEY, focusEnabled() ? "0" : "1");
  applyFocusState();
}

function closeMap() {
  document.body.classList.remove("ux-map-open");
  document.querySelector("[data-ux-map]")?.setAttribute("aria-expanded", "false");
}

function toggleMap() {
  const open = !document.body.classList.contains("ux-map-open");
  document.body.classList.toggle("ux-map-open", open);
  document.querySelector("[data-ux-map]")?.setAttribute("aria-expanded", String(open));
}

function enhancePlatformStatus() {
  if (currentRoute() !== "inicio") return;
  const bank = document.querySelector(".bank-status");
  if (!bank || bank.closest(".ux-platform-status")) return;

  const details = document.createElement("details");
  details.className = "ux-platform-status card";
  details.innerHTML = "<summary>Estado técnico do banco <span>cadastro, publicação e auditoria</span></summary>";
  bank.replaceWith(details);
  bank.classList.add("ux-platform-status-content");
  details.append(bank);
}

function enhanceExam() {
  if (currentRoute() !== "resolver") return;
  const header = document.querySelector(".exam-header");
  if (!header || header.querySelector("[data-ux-exam-tools]")) return;

  const tools = document.createElement("div");
  tools.className = "ux-exam-tools";
  tools.dataset.uxExamTools = "";
  tools.innerHTML = `
    <button type="button" class="ux-tool-btn" data-ux-focus aria-pressed="${focusEnabled()}">${focusEnabled() ? "Sair do foco" : "Modo foco"}</button>
    <button type="button" class="ux-tool-btn ux-map-toggle" data-ux-map aria-expanded="false">Mapa de questões</button>`;
  header.append(tools);

  if (!document.querySelector(".ux-map-backdrop")) {
    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "ux-map-backdrop";
    backdrop.setAttribute("aria-label", "Fechar mapa de questões");
    backdrop.addEventListener("click", closeMap);
    document.body.append(backdrop);
  }

  document.querySelector("[data-ux-focus]")?.addEventListener("click", toggleFocus);
  document.querySelector("[data-ux-map]")?.addEventListener("click", toggleMap);

  document.querySelectorAll(".exam-side [data-jump], .exam-side [data-save-exit], .exam-side [data-abandon]").forEach(control => {
    control.addEventListener("click", closeMap, {once:true});
  });

  applyFocusState();
}

function labelQuestionStates() {
  if (currentRoute() !== "resolver") return;
  document.querySelectorAll(".map-btn").forEach(button => {
    const states = [];
    if (button.classList.contains("current")) states.push("atual");
    if (button.classList.contains("correct")) states.push("correta");
    else if (button.classList.contains("incorrect")) states.push("incorreta");
    else if (button.classList.contains("answered")) states.push("respondida");
    if (button.classList.contains("flagged")) states.push("marcada");
    button.dataset.uxState = states.join(" ");
  });
}

function enhanceTouchTargets() {
  document.querySelectorAll(".option").forEach(option => {
    if (option.dataset.uxTouch === "1") return;
    option.dataset.uxTouch = "1";
    option.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const input = option.querySelector('input[name="answer"]');
      if (!input || input.disabled) return;
      event.preventDefault();
      input.click();
    });
    if (!option.hasAttribute("tabindex")) option.tabIndex = 0;
  });
}

function enhancePage() {
  syncRouteClass();
  enhancePlatformStatus();
  enhanceExam();
  labelQuestionStates();
  enhanceTouchTargets();
  applyFocusState();
}

window.addEventListener("hashchange", () => requestAnimationFrame(enhancePage));
window.addEventListener("resize", () => {
  if (window.innerWidth > 760) closeMap();
});

document.addEventListener("keydown", event => {
  if (currentRoute() !== "resolver") return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
  if (event.key.toLowerCase() === "f") {
    event.preventDefault();
    toggleFocus();
  }
  if (event.key === "Escape") closeMap();
  if (event.key.toLowerCase() === "m" && window.innerWidth <= 760) {
    event.preventDefault();
    toggleMap();
  }
});

const observer = new MutationObserver(() => requestAnimationFrame(enhancePage));
if (app) observer.observe(app, {childList:true, subtree:true});
enhancePage();
