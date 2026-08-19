(() => {
  const ACTIVE_PROFILE_KEY = "sedes.questoes.activeProfile.v3";
  const THEME_KEY = "sedes.questoes.theme";
  const validTheme = value => value === "dark" || value === "light";
  const profileId = localStorage.getItem(ACTIVE_PROFILE_KEY) || "rodrigo";
  const preferencesKey = `sedes.questoes.${profileId}.preferences.v1`;
  const migrationKey = `sedes.questoes.themeMigration.v1:${profileId}`;
  const globalTheme = localStorage.getItem(THEME_KEY);
  if (!validTheme(globalTheme)) return;

  let stored = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(preferencesKey) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed;
  } catch {}

  const migratedTheme = localStorage.getItem(migrationKey);
  const hasExplicitTheme = validTheme(stored.theme);
  const stillLegacyManaged = validTheme(migratedTheme) && stored.theme === migratedTheme;

  if (hasExplicitTheme && !stillLegacyManaged) {
    localStorage.removeItem(migrationKey);
    return;
  }
  if (hasExplicitTheme && stillLegacyManaged && stored.theme === globalTheme) return;

  const next = {...stored, theme: globalTheme, updatedAt: new Date().toISOString()};
  localStorage.setItem(preferencesKey, JSON.stringify(next));
  localStorage.setItem(migrationKey, globalTheme);
  window.dispatchEvent(new CustomEvent("sedes:theme-preference-migrated", {detail: {profileId, theme: globalTheme}}));
})();
