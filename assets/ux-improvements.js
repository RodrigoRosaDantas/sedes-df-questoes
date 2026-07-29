(() => {
  const LEVEL_KEY = "sedes.questoes.studyLevel.v1";
  const catalogUrl = new URL("./data/catalogo.json", window.location.href).href;
  const previousFetch = window.fetch.bind(window);
  const app = document.querySelector("#app");

  const ROLE_DATA = [
    {codigo: "200", carreira: "TDAS", nome: "Agente Social", nivel: "medio", nivelLabel: "Nível médio"},
    {codigo: "202", carreira: "TDAS", nome: "Técnico Administrativo", nivel: "medio", nivelLabel: "Nível médio"},
    {codigo: "400", carreira: "EDAS", nome: "Administração", nivel: "superior", nivelLabel: "Nível superior"},
    {codigo: "403", carreira: "EDAS", nome: "Direito e Legislação", nivel: "superior", nivelLabel: "Nível superior"},
    {codigo: "405", carreira: "EDAS", nome: "Educador Social", nivel: "superior", nivelLabel: "Nível superior"},
  ];

  let catalogSnapshot = null;
  let enhancementQueued = false;

  const selectedLevel = () => {
    const value = localStorage.getItem(LEVEL_KEY) || "all";
    return ["all", "medio", "superior"].includes(value) ? value : "all";
  };

  const levelForCode = code => ROLE_DATA.find(role => role.codigo === String(code))?.nivel || "all";

  const filteredSummary = materials => ({
    materiais: materials.length,
    questoes: materials.reduce((sum, material) => sum + Number(material.quantidade_questoes || 0), 0),
    simulados: materials.filter(material => String(material.tipo_material).toLowerCase() === "simulado").length,
    provas: materials.filter(material => String(material.tipo_material).toLowerCase() === "prova").length,
  });

  window.fetch = async (input, init = {}) => {
    const requestedUrl = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
      window.location.href,
    ).href;
    const response = await previousFetch(input, init);
    if (requestedUrl !== catalogUrl || !response.ok) return response;

    try {
      const data = await response.clone().json();
      const level = selectedLevel();
      const allMaterials = Array.isArray(data.materials) ? data.materials : [];
      const materials = level === "all"
        ? allMaterials
        : allMaterials.filter(material => levelForCode(material.codigo_cargo) === level);
      catalogSnapshot = {
        level,
        allMaterials,
        materials,
        originalSummary: {...(data.summary || {})},
        filteredSummary: filteredSummary(materials),
      };
      return new Response(JSON.stringify({...data, materials, active_level_filter: level}), {
        status: response.status,
        statusText: response.statusText,
        headers: {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"},
      });
    } catch (error) {
      console.warn("Não foi possível aplicar o filtro por nível:", error);
      return response;
    }
  };

  function improveTopProfileButton() {
    const button = document.querySelector("#profile-button");
    if (!button || button.dataset.uxEnhanced === "true") return;
    const currentName = document.querySelector("#profile-button-label")?.textContent?.trim() || "Perfil";
    button.dataset.uxEnhanced = "true";
    button.classList.add("profile-switcher");
    button.innerHTML = `
      <i class="profile-switcher-avatar" aria-hidden="true">${currentName.slice(0, 1).toUpperCase()}</i>
      <span class="profile-switcher-copy"><small>Perfil ativo</small><strong id="profile-button-label">${currentName}</strong></span>
      <span class="profile-switcher-action">Trocar</span>`;
  }

  function enhanceProfiles() {
    const grid = document.querySelector(".profile-grid");
    if (!grid || grid.dataset.uxEnhanced === "true") return;
    grid.dataset.uxEnhanced = "true";

    grid.querySelectorAll(".profile-card").forEach(card => {
      const isActive = card.classList.contains("active");
      const button = card.querySelector("[data-activate-profile]");
      const selectedRoles = [...card.querySelectorAll("[data-profile-role]:checked")].map(input => {
        const choice = input.closest(".role-choice");
        return {
          title: choice?.querySelector("strong")?.textContent?.trim() || `Cargo ${input.value}`,
          level: choice?.querySelector("small")?.textContent?.trim() || "",
        };
      });
      const fieldset = card.querySelector("fieldset");
      if (fieldset) {
        const list = document.createElement("div");
        list.className = "profile-role-list";
        list.innerHTML = `<span class="profile-role-title">Cargos prioritários</span>${selectedRoles.map(role => `
          <div class="profile-role-item"><i aria-hidden="true">✓</i><span><strong>${role.title}</strong><small>${role.level}</small></span></div>`).join("")}`;
        fieldset.replaceWith(list);
      }
      if (button) {
        button.textContent = isActive ? "Perfil em uso" : `Selecionar ${card.querySelector("h2")?.textContent?.trim() || "perfil"}`;
        button.classList.toggle("primary", !isActive);
      }
      if (!isActive && button) {
        card.classList.add("profile-card-selectable");
        card.tabIndex = 0;
        const activate = event => {
          if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
          if (event.target.closest("button")) return;
          event.preventDefault();
          button.click();
        };
        card.addEventListener("click", activate);
        card.addEventListener("keydown", activate);
      }
    });
  }

  function availableCodes() {
    return new Set((catalogSnapshot?.materials || []).map(material => String(material.codigo_cargo)));
  }

  function rebuildCargoOptions(select, level) {
    if (!select) return;
    const current = select.value;
    const available = availableCodes();
    select.replaceChildren();
    const all = document.createElement("option");
    all.value = "";
    all.textContent = level === "all" ? "Todos os cargos" : "Todos os cargos deste nível";
    select.append(all);
    ROLE_DATA.filter(role => level === "all" || role.nivel === level).forEach(role => {
      const option = document.createElement("option");
      option.value = role.codigo;
      option.textContent = `${role.carreira} ${role.codigo} — ${role.nome}`;
      if (!available.has(role.codigo)) {
        option.disabled = true;
        option.textContent += " · aguardando publicação";
      }
      select.append(option);
    });
    select.value = [...select.options].some(option => option.value === current && !option.disabled) ? current : "";
  }

  function updateCatalogCounts() {
    if (!catalogSnapshot) return;
    const {filteredSummary: summary, originalSummary} = catalogSnapshot;
    const builderCount = document.querySelector(".builder-head > span");
    if (builderCount) builderCount.textContent = `${summary.questoes} neste nível · ${originalSummary.questoes || 0} no acervo publicado`;
    document.querySelectorAll("[data-type]").forEach(button => {
      const count = button.dataset.type === "simulado" ? summary.simulados
        : button.dataset.type === "prova" ? summary.provas
          : summary.materiais;
      const badge = button.querySelector("b");
      if (badge) badge.textContent = count;
    });
  }

  function enhanceStudy() {
    const builder = document.querySelector(".training-builder");
    if (!builder || builder.dataset.uxEnhanced === "true") return;
    builder.dataset.uxEnhanced = "true";
    const grid = builder.querySelector(".builder-grid");
    const cargoSelect = document.querySelector("#builder-cargo");
    const cargoLabel = cargoSelect?.closest("label");
    if (!grid || !cargoSelect || !cargoLabel) return;

    const level = selectedLevel();
    const levelLabel = document.createElement("label");
    levelLabel.className = "ux-level-field";
    levelLabel.innerHTML = `<span>Nível</span><select id="builder-level" aria-label="Filtrar por nível">
      <option value="all" ${level === "all" ? "selected" : ""}>Todos os níveis</option>
      <option value="medio" ${level === "medio" ? "selected" : ""}>Nível médio</option>
      <option value="superior" ${level === "superior" ? "selected" : ""}>Nível superior</option>
    </select>`;
    grid.prepend(levelLabel);

    rebuildCargoOptions(cargoSelect, level);
    const cargoTitle = cargoLabel.querySelector(":scope > span");
    if (cargoTitle) cargoTitle.textContent = "Cargo específico (opcional)";

    const details = document.createElement("details");
    details.className = "advanced-filters";
    details.innerHTML = `<summary>Mais filtros <small>cargo e tipo de material</small></summary><div class="advanced-filters-grid"></div>`;
    const detailsGrid = details.querySelector(".advanced-filters-grid");
    detailsGrid.append(cargoLabel);

    const typeLabel = document.createElement("label");
    const activeType = document.querySelector("[data-type].active")?.dataset.type || "";
    typeLabel.innerHTML = `<span>Tipo de material</span><select id="builder-type">
      <option value="" ${activeType === "" ? "selected" : ""}>Provas e simulados</option>
      <option value="simulado" ${activeType === "simulado" ? "selected" : ""}>Somente simulados</option>
      <option value="prova" ${activeType === "prova" ? "selected" : ""}>Somente provas anteriores</option>
    </select>`;
    detailsGrid.append(typeLabel);

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "btn advanced-reset";
    reset.textContent = "Limpar todos os filtros";
    detailsGrid.append(reset);
    builder.append(details);

    const headingText = document.querySelector(".page-heading p:not(.eyebrow)");
    if (headingText) headingText.textContent = "Escolha o nível, a matéria e como deseja treinar. Todos os perfis podem acessar todo o acervo.";
    const submit = document.querySelector("[data-build-training]");
    if (submit) submit.textContent = "Iniciar sessão";
    const search = document.querySelector("#search-material");
    if (search) search.placeholder = "Buscar material ou matéria";

    const accessNote = document.createElement("p");
    accessNote.className = "builder-access-note";
    accessNote.innerHTML = "<strong>Acesso livre:</strong> o perfil organiza histórico e recomendações, mas não restringe provas, simulados ou níveis.";
    builder.querySelector(".builder-head")?.insertAdjacentElement("afterend", accessNote);

    document.querySelector("#builder-level")?.addEventListener("change", event => {
      const value = event.target.value;
      value === "all" ? localStorage.removeItem(LEVEL_KEY) : localStorage.setItem(LEVEL_KEY, value);
      window.location.hash = "#/estudar";
      window.location.reload();
    });
    document.querySelector("#builder-type")?.addEventListener("change", event => {
      document.querySelector(`[data-type="${event.target.value}"]`)?.click();
    });
    reset.addEventListener("click", () => {
      localStorage.removeItem(LEVEL_KEY);
      window.location.hash = "#/estudar";
      window.location.reload();
    });

    const empty = document.querySelector(".empty-state");
    if (empty) {
      const title = empty.querySelector("h3");
      const paragraph = empty.querySelector("p");
      if (title) title.textContent = "Ainda não há material para esta combinação.";
      if (paragraph) paragraph.textContent = "Troque o nível ou a matéria, abra Mais filtros ou limpe a seleção para visualizar todo o acervo disponível.";
      if (!empty.querySelector("[data-clear-study-filters]")) {
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "btn primary";
        clear.dataset.clearStudyFilters = "true";
        clear.textContent = "Mostrar todo o acervo";
        clear.addEventListener("click", () => {
          localStorage.removeItem(LEVEL_KEY);
          window.location.hash = "#/estudar";
          window.location.reload();
        });
        empty.append(clear);
      }
    }
    updateCatalogCounts();
  }

  function enhance() {
    enhancementQueued = false;
    improveTopProfileButton();
    enhanceProfiles();
    enhanceStudy();
  }

  function scheduleEnhancement() {
    if (enhancementQueued) return;
    enhancementQueued = true;
    queueMicrotask(enhance);
  }

  improveTopProfileButton();
  if (app) new MutationObserver(scheduleEnhancement).observe(app, {childList: true, subtree: true});
  scheduleEnhancement();
})();
