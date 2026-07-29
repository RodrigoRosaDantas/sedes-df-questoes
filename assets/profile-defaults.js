(() => {
  const PROFILES_KEY = "sedes.questoes.profiles.v3";
  const ASSIGNMENTS_VERSION_KEY = "sedes.questoes.profileAssignments.v1";
  const VERSION = "2026-07-29-1";

  const assignments = {
    rodrigo: {id: "rodrigo", name: "Rodrigo", roles: ["202", "400"]},
    amanda: {id: "amanda", name: "Amanda", roles: ["202", "403"]},
    andressa: {id: "andressa", name: "Andressa", roles: ["200", "405"]},
  };

  if (localStorage.getItem(ASSIGNMENTS_VERSION_KEY) === VERSION) return;

  let current = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
    if (Array.isArray(parsed)) current = parsed;
  } catch {
    current = [];
  }

  const byId = new Map(current.map(profile => [profile.id, profile]));
  const managed = Object.values(assignments).map(profile => ({
    ...(byId.get(profile.id) || {}),
    ...profile,
    roles: [...profile.roles],
  }));
  const extras = current.filter(profile => profile?.id && !assignments[profile.id]);

  localStorage.setItem(PROFILES_KEY, JSON.stringify([...managed, ...extras]));
  localStorage.setItem(ASSIGNMENTS_VERSION_KEY, VERSION);
})();
