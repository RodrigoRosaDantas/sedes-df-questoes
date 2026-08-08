const ROOT = document.documentElement;
const GATE = "ux20FormatGate";
let timer = null;

function numberFrom(selector, panel) {
  const node = panel.querySelector(selector);
  const digits = String(node?.textContent || "").replace(/\D+/g, "");
  return Number(digits || 0);
}

function panelReady(panel) {
  const all = numberFrom('[data-ux20-format-count="all"]', panel);
  const trueFalse = numberFrom('[data-ux20-format-count="true-false"]', panel);
  const multiple = numberFrom('[data-ux20-format-count="multiple-choice"]', panel);
  return all > 0 && trueFalse + multiple === all;
}

function setGate(value, panel = null) {
  ROOT.dataset[GATE] = value;
  if (panel) panel.setAttribute("aria-busy", value === "loading" ? "true" : "false");
}

function check() {
  if (!location.hash.startsWith("#/inicio")) return;
  const panel = document.querySelector("[data-ux17-subjects]");
  if (!panel || panel.hidden) {
    setGate("loading", panel);
    return;
  }
  if (panelReady(panel)) {
    setGate("ready", panel);
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    return;
  }
  setGate("loading", panel);
}

function arm() {
  if (!location.hash.startsWith("#/inicio")) return;
  if (ROOT.dataset[GATE] !== "ready") ROOT.dataset[GATE] = "loading";
  check();
  if (!timer && ROOT.dataset[GATE] !== "ready") timer = setInterval(check, 50);
}

window.addEventListener("hashchange", () => setTimeout(arm, 0));
arm();
