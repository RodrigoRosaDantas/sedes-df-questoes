(() => {
  const ACTIVE_PROFILE_KEY = "sedes.questoes.activeProfile.v3";
  const THEME_KEY = "sedes.questoes.theme";
  const validTheme = value => value === "dark" || value === "light";
  const profileId = localStorage.getItem(ACTIVE_PROFILE_KEY) || "rodrigo";
  const preferencesKey = `sedes.questoes.${profileId}.preferences.v1`;
  const globalTheme = localStorage.getItem(THEME_KEY);
  if (!validTheme(globalTheme)) return;

  let stored = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(preferencesKey) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed;
  } catch {}
  if (validTheme(stored.theme)) return;

  const next = {...stored, theme: globalTheme, updatedAt: new Date().toISOString()};
  localStorage.setItem(preferencesKey, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("sedes:theme-preference-migrated", {detail: {profileId, theme: globalTheme}}));
})();
