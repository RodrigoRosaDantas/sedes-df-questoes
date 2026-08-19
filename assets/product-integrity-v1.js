const THEME_KEY = "sedes.questoes.theme";
const ACTIVE_PROFILE_KEY = "sedes.questoes.activeProfile.v3";

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function accountIsSignedIn() {
  const work = window.SEDES_WORK_CONVERGENCE?.getAccountState?.();
  const cloud = window.SEDES_CLOUD_PROGRESS?.getState?.();
  return Boolean(work?.signedIn || cloud?.signedIn);
}

function activeProfileId() {
  return localStorage.getItem(ACTIVE_PROFILE_KEY) || "rodrigo";
}

function profileKey(suffix) {
  return `sedes.questoes.${activeProfileId()}.${suffix}`;
}

function installSkipLinkGuard() {
  const skip = document.querySelector("a.skip");
  if (!skip || skip.dataset.integritySkip === "1") return;
  skip.dataset.integritySkip = "1";
  skip.addEventListener("click", event => {
    event.preventDefault();
    document.querySelector("#app")?.focus({preventScroll: false});
  });
}

function ensureAccessibleNames() {
  const questionSearch = document.querySelector("[data-ux-question-search]");
  if (questionSearch && !questionSearch.getAttribute("aria-label") && !questionSearch.getAttribute("aria-labelledby")) {
    questionSearch.setAttribute("aria-label", "Buscar dentro das questões");
  }
}

function updateSettingsDataCopy() {
  const page = document.querySelector('[data-ux15-settings-page][data-ux15-tab="dados"]');
  if (!page) return;
  const intro = page.querySelector(".ux15-settings-intro > p:last-child");
  setText(intro, "O progresso funciona primeiro neste aparelho e, quando você entra na sincronização, acompanha sua conta entre dispositivos.");
  const cards = [...page.querySelectorAll(".ux15-data-actions > .card")];
  const storage = cards.find(card => /Armazenamento local|Local-first \+ nuvem/i.test(card.textContent || ""));
  if (storage) {
    setText(storage.querySelector("strong"), "Local-first + nuvem");
    const paragraph = storage.querySelector("p");
    if (paragraph) {
      if (!paragraph.dataset.integrityBaseCopy) paragraph.dataset.integrityBaseCopy = paragraph.textContent.replace(/ · (?:sincronização da conta ativa|entre na sincronização para manter uma cópia entre aparelhos)\.$/i, "");
      const suffix = accountIsSignedIn()
        ? " · sincronização da conta ativa."
        : " · entre na sincronização para manter uma cópia entre aparelhos.";
      setText(paragraph, `${paragraph.dataset.integrityBaseCopy}${suffix}`);
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
    setText(lead, "Cada perfil mantém histórico, erros, marcadas e progresso separados. O armazenamento é local-first e pode ser sincronizado com uma conta para uso entre aparelhos.");
  }
  const note = page.querySelector(".privacy-note");
  if (note) {
    setText(note.querySelector("strong"), "Dados do perfil");
    setText(note.querySelector("p"), "A plataforma funciona sem login. Ao entrar na sincronização, o progresso do perfil principal é enviado ao Firebase para acompanhar sua conta entre aparelhos; o backup manual continua disponível como camada adicional de segurança.");
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

function relabelImportControl(label) {
  if (!label) return;
  const text = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  if (text) text.textContent = "Importar e mesclar backup";
}

async function importCompatibleBackup(file) {
  try {
    const payload = JSON.parse(await file.text());
    if (payload.schema_version !== "1.0" || !Array.isArray(payload.history) || !payload.errors || typeof payload.errors !== "object" || !payload.marked || typeof payload.marked !== "object") {
      throw new Error("Formato de backup incompatível.");
    }
    const cloudNote = accountIsSignedIn()
      ? " O conteúdo será aplicado neste aparelho e reconciliado com a nuvem; dados remotos que não estejam no arquivo não serão apagados automaticamente."
      : " O conteúdo será aplicado neste aparelho.";
    if (!confirm(`Importar este backup para o perfil ${activeProfileId()}?${cloudNote}`)) return;
    localStorage.setItem(profileKey("history.v3"), JSON.stringify(payload.history));
    localStorage.setItem(profileKey("errors.v3"), JSON.stringify(payload.errors));
    localStorage.setItem(profileKey("marked.v3"), JSON.stringify(payload.marked));
    if (payload.session) localStorage.setItem(profileKey("session.v3"), JSON.stringify(payload.session));
    else localStorage.removeItem(profileKey("session.v3"));
    if (accountIsSignedIn()) await window.SEDES_CLOUD_PROGRESS?.sync?.();
    location.reload();
  } catch (error) {
    console.error("Falha ao importar backup:", error);
    alert(error?.message || "O arquivo não é um backup válido desta plataforma.");
  }
}

function hardenPerformanceDataActions() {
  const exportButton = document.querySelector("[data-export-profile]");
  if (!exportButton) return;
  const panel = exportButton.closest(".performance-panel") || exportButton.closest(".card");
  if (!panel) return;
  const heading = panel.querySelector("h2");
  if (heading && /Backup local|Backup complementar/i.test(heading.textContent || "")) setText(heading, "Backup complementar");
  setText(panel.querySelector("p.muted"), "Exporte uma cópia manual dos dados principais do perfil. Ao importar, a cópia local é aplicada e, se houver sincronização, reconciliada com a nuvem.");

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

  const legacyImport = panel.querySelector("[data-import-profile]");
  if (legacyImport) {
    const replacement = legacyImport.cloneNode();
    replacement.removeAttribute("data-import-profile");
    replacement.dataset.integrityImportProfile = "";
    replacement.addEventListener("change", event => {
      const file = event.target.files?.[0];
      if (file) importCompatibleBackup(file);
    });
    const label = legacyImport.closest("label");
    legacyImport.replaceWith(replacement);
    relabelImportControl(label);
  } else {
    relabelImportControl(panel.querySelector("[data-integrity-import-profile]")?.closest("label"));
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

function profileIdFromTarget(target) {
  const settings = target.closest?.("[data-ux15-profile]");
  if (settings?.dataset.ux15Profile) return settings.dataset.ux15Profile;
  const button = target.closest?.("[data-activate-profile]");
  if (button?.dataset.activateProfile) return button.dataset.activateProfile;
  const card = target.closest?.(".profile-card-selectable[data-profile-id]");
  return card?.dataset.profileId || "";
}

function captureActions(event) {
  const headerThemeButton = event.target.closest?.("#theme-toggle");
  if (headerThemeButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    synchronizeThemeChoice(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    return;
  }

  const themeButton = event.target.closest?.("[data-ux15-theme]");
  if (themeButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    synchronizeThemeChoice(themeButton.dataset.ux15Theme);
    return;
  }

  const profileId = profileIdFromTarget(event.target);
  if (!profileId || !accountIsSignedIn()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  routeSignedInProfileChoice(profileId);
}

function captureProfileKeyboard(event) {
  if (!["Enter", " "].includes(event.key) || !accountIsSignedIn()) return;
  const profileId = profileIdFromTarget(event.target);
  if (!profileId) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  routeSignedInProfileChoice(profileId);
}

function enhance() {
  installSkipLinkGuard();
  ensureAccessibleNames();
  updateSettingsDataCopy();
  updateLegacyProfileCopy();
  hardenPerformanceDataActions();
}

document.addEventListener("click", captureActions, true);
document.addEventListener("keydown", captureProfileKeyboard, true);
window.addEventListener("hashchange", () => window.setTimeout(enhance, 0));
window.addEventListener("sedes:cloud-status", () => window.setTimeout(enhance, 0));
window.addEventListener("sedes:account-binding", () => window.setTimeout(enhance, 0));
let enhanceScheduled = false;
new MutationObserver(mutations => {
  if (!mutations.some(mutation => mutation.addedNodes.length || mutation.removedNodes.length) || enhanceScheduled) return;
  enhanceScheduled = true;
  window.requestAnimationFrame(() => {
    enhanceScheduled = false;
    enhance();
  });
}).observe(document.querySelector("#app") || document.body, {childList: true, subtree: true});

enhance();