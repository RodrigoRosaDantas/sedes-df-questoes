const THEME_KEY = "sedes.questoes.theme";

function accountIsSignedIn() {
  const work = window.SEDES_WORK_CONVERGENCE?.getAccountState?.();
  const cloud = window.SEDES_CLOUD_PROGRESS?.getState?.();
  return Boolean(work?.signedIn || cloud?.signedIn);
}

function updateSettingsDataCopy() {
  const page = document.querySelector('[data-ux15-settings-page][data-ux15-tab="dados"]');
  if (!page) return;
  const intro = page.querySelector(".ux15-settings-intro > p:last-child");
  if (intro) intro.textContent = "O progresso funciona primeiro neste aparelho e, quando você entra na sincronização, acompanha sua conta entre dispositivos.";
  const cards = [...page.querySelectorAll(".ux15-data-actions > .card")];
  const storage = cards.find(card => /Armazenamento local/i.test(card.textContent || ""));
  if (storage) {
    const title = storage.querySelector("strong");
    if (title) title.textContent = "Local-first + nuvem";
    const paragraph = storage.querySelector("p");
    if (paragraph && !paragraph.dataset.integrityCloudCopy) {
      paragraph.dataset.integrityCloudCopy = "true";
      paragraph.insertAdjacentText("beforeend", accountIsSignedIn()
        ? " · sincronização da conta ativa."
        : " · entre na sincronização para manter uma cópia entre aparelhos.");
    }
  }
}

function updateLegacyProfileCopy() {
  const page = document.querySelector("#app");
  if (!page) return;
  const heading = [...page.querySelectorAll("h1")].find(node => /Quem está estudando/i.test(node.textContent || ""));
  if (!heading) return;
  const lead = heading.parentElement?.querySelector("p:last-child");
  if (lead && /neste aparelho/i.test(lead.textContent || "")) {
    lead.textContent = "Cada perfil mantém histórico, erros, marcadas e progresso separados. O armazenamento é local-first e pode ser sincronizado com uma conta para uso entre aparelhos.";
  }
  const note = page.querySelector(".privacy-note");
  if (note) {
    const title = note.querySelector("strong");
    const paragraph = note.querySelector("p");
    if (title) title.textContent = "Dados do perfil";
    if (paragraph) paragraph.textContent = "A plataforma funciona sem login. Ao entrar na sincronização, o progresso do perfil principal é enviado ao Firebase para acompanhar sua conta entre aparelhos; o backup manual continua disponível como camada adicional de segurança.";
  }
}

function openSafeDataSettings() {
  location.hash = "#/perfil/configuracoes";
  let attempts = 0;
  const open = () => {
    const tab = document.querySelector('[data-ux15-settings-tab="dados"]');
    if (tab) { tab.click(); return; }
    if (attempts++ < 20) window.setTimeout(open, 50);
  };
  window.setTimeout(open, 0);
}

function hardenPerformanceDataActions() {
  const exportButton = document.querySelector("[data-export-profile]");
  if (!exportButton) return;
  const panel = exportButton.closest(".performance-panel") || exportButton.closest(".card");
  if (!panel) return;
  const heading = panel.querySelector("h2");
  if (heading && /Backup local/i.test(heading.textContent || "")) heading.textContent = "Backup complementar";
  const copy = panel.querySelector("p.muted");
  if (copy) copy.textContent = "Exporte uma cópia manual dos dados principais do perfil. Se você usa sincronização, a nuvem continua sendo a camada entre aparelhos.";

  const unsafe = panel.querySelector("[data-clear-profile]");
  if (unsafe) {
    const safe = document.createElement("button");
    safe.type = "button";
    safe.className = "btn";
    safe.dataset.integrityManageData = "";
    safe.textContent = "Gerenciar dados com segurança";
    safe.addEventListener("click", openSafeDataSettings);
    unsafe.replaceWith(safe);
  }
}

function synchronizeThemeChoice(theme) {
  if (!["dark", "light"].includes(theme)) return;
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.dataset.theme = theme;
  document.querySelector("#theme-toggle")?.setAttribute("aria-pressed", String(theme === "dark"));
  window.SEDES_WORK_CONVERGENCE?.savePreferences?.({theme});
  document.querySelectorAll("[data-ux15-theme]").forEach(button => button.classList.toggle("primary", button.dataset.ux15Theme === theme));
}

function routeSignedInProfileChoice(profileId) {
  const work = window.SEDES_WORK_CONVERGENCE;
  if (!work?.manageProfile) {
    window.SEDES_CLOUD_PROGRESS?.open?.();
    return;
  }
  work.manageProfile();
  window.setTimeout(() => {
    const select = document.querySelector("[data-work-account-profile]");
    if (select && [...select.options].some(option => option.value === profileId)) select.value = profileId;
  }, 0);
}

function captureSettingsActions(event) {
  const themeButton = event.target.closest?.("[data-ux15-theme]");
  if (themeButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    synchronizeThemeChoice(themeButton.dataset.ux15Theme);
    return;
  }

  const profileButton = event.target.closest?.("[data-ux15-profile]");
  if (!profileButton || !accountIsSignedIn()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  routeSignedInProfileChoice(profileButton.dataset.ux15Profile);
}

function enhance() {
  updateSettingsDataCopy();
  updateLegacyProfileCopy();
  hardenPerformanceDataActions();
}

document.addEventListener("click", captureSettingsActions, true);
window.addEventListener("hashchange", () => window.setTimeout(enhance, 0));
window.addEventListener("sedes:cloud-status", () => window.setTimeout(enhance, 0));
window.addEventListener("sedes:account-binding", () => window.setTimeout(enhance, 0));
new MutationObserver(mutations => {
  if (!mutations.some(mutation => mutation.addedNodes.length || mutation.removedNodes.length)) return;
  window.requestAnimationFrame(enhance);
}).observe(document.querySelector("#app") || document.body, {childList: true, subtree: true});

enhance();
