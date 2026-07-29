(() => {
  const app = document.querySelector("#app");
  if (!app) return;
  let roles = [];

  const enhance = () => {
    const select = document.querySelector("#builder-cargo");
    if (!select || !roles.length || select.dataset.allRoles === "true") return;
    const selected = select.value;
    select.querySelectorAll("option:not(:first-child)").forEach(option => option.remove());
    for (const role of roles) {
      const option = document.createElement("option");
      option.value = String(role.codigo);
      option.textContent = `${role.carreira} ${role.codigo} — ${role.nome}`;
      select.append(option);
    }
    select.value = selected;
    select.dataset.allRoles = "true";
  };

  new MutationObserver(enhance).observe(app, {childList: true, subtree: true});
  fetch("./data/concurso.json", {cache: "no-store"})
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      roles = Array.isArray(data.cargos) ? data.cargos : [];
      enhance();
    })
    .catch(error => console.warn("Não foi possível completar o filtro de cargos:", error));
})();
