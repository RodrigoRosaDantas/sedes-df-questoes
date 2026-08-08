import {test, expect} from "@playwright/test";

async function openHome(page) {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-ux16-track]")).toHaveCount(4, {timeout: 30000});
  await expect(page.locator("[data-ux17-subjects]")).toBeVisible({timeout: 30000});
}

async function setTracks(page, ids) {
  await page.evaluate(selected => {
    localStorage.removeItem("sedes.questoes.rodrigo.session.v3");
    localStorage.setItem("sedes.questoes.rodrigo.homeStudyToday.v2", JSON.stringify(selected));
    sessionStorage.removeItem("sedes.questoes.rodrigo.homeStudySubjects.v1");
  }, ids);
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux17-subjects]")).toBeVisible({timeout: 30000});
}

test("matérias aparecem somente para os recortes escolhidos e começam com Todas", async ({page}) => {
  await openHome(page);
  await expect(page.locator('[data-ux17-subject-group="prova-202"]')).toHaveCount(1);
  await expect(page.locator('[data-ux17-subject-group="prova-400"]')).toHaveCount(1);
  await expect(page.locator('[data-ux17-subject-group="simulado-202"]')).toHaveCount(0);
  await expect(page.locator('[data-ux17-subject-group="simulado-400"]')).toHaveCount(0);

  for (const id of ["prova-202", "prova-400"]) {
    const group = page.locator(`[data-ux17-subject-group="${id}"]`);
    await group.locator("summary").click();
    const total = await group.locator("[data-ux17-subject-input]").count();
    expect(total, `${id} deve oferecer matérias elegíveis`).toBeGreaterThan(0);
    await expect(group.locator("[data-ux17-subject-input]:checked")).toHaveCount(total);
    await expect(group.locator("[data-ux17-subject-status]")).toContainText("Todas");
  }
});

test("usuário pode escolher uma única matéria para Provas 202 e a sessão respeita o filtro", async ({page, request}) => {
  await openHome(page);
  await setTracks(page, ["prova-202"]);

  const group = page.locator('[data-ux17-subject-group="prova-202"]');
  await group.locator("summary").click();
  await group.locator('[data-ux17-clear="prova-202"]').click();
  const first = group.locator("[data-ux17-subject-input]").first();
  const subject = await first.getAttribute("value");
  expect(subject).toBeTruthy();
  await first.check();
  await expect(group.locator("[data-ux17-subject-status]")).toContainText("1 de");
  await expect(page.locator("[data-ux16-summary]")).toContainText("1 matéria");

  const catalogResponse = await request.get("./data/release/catalogo.json");
  const studyResponse = await request.get("./data/release/study-index.json");
  expect(catalogResponse.ok()).toBeTruthy();
  expect(studyResponse.ok()).toBeTruthy();
  const catalog = await catalogResponse.json();
  const study = await studyResponse.json();
  const materialById = new Map((catalog.materials || []).map(item => [String(item.id), item]));
  const discipline = (study.disciplines || []).find(item => item.name === subject);
  expect(discipline, `matéria ${subject} precisa existir no índice`).toBeTruthy();
  const allowed = new Set(discipline.question_ids || []);

  await page.locator("[data-ux17-start]").click();
  await page.waitForURL(/#\/resolver/, {timeout: 30000});
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.session.v3")));
  expect(session).toBeTruthy();
  expect(session.questionIds.length).toBeGreaterThan(0);
  expect(session.questionIds.length).toBeLessThanOrEqual(25);
  expect(session.material.codigo_cargo).toBe("202");
  expect(session.material.disciplina).toBe(subject);

  for (const id of session.questionIds) {
    expect(allowed.has(id), `${id} deve pertencer à matéria escolhida`).toBeTruthy();
    const raw = catalog.question_index?.[id];
    const materialId = typeof raw === "string" ? raw : raw?.material_id || raw?.materialId || raw?.material || raw?.id_material;
    const material = materialById.get(String(materialId || ""));
    expect(material, `material de ${id}`).toBeTruthy();
    expect(String(material.tipo_material || "").trim().toLowerCase()).toBe("prova");
  }
});

test("filtro de matérias é temporário da aba e não altera a seleção permanente das quatro trilhas", async ({page}) => {
  await openHome(page);
  await setTracks(page, ["simulado-400"]);
  const group = page.locator('[data-ux17-subject-group="simulado-400"]');
  await group.locator("summary").click();
  await group.locator('[data-ux17-clear="simulado-400"]').click();
  await group.locator("[data-ux17-subject-input]").first().check();

  const state = await page.evaluate(() => ({
    permanent: JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.homeStudyToday.v2")),
    temporary: JSON.parse(sessionStorage.getItem("sedes.questoes.rodrigo.homeStudySubjects.v1")),
  }));
  expect(state.permanent).toEqual(["simulado-400"]);
  expect(state.temporary["simulado-400"]).toHaveLength(1);
});

test("seletor de matérias não cria overflow horizontal no celular", async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await openHome(page);
  const group = page.locator('[data-ux17-subject-group="prova-202"]');
  await group.locator("summary").click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator("[data-ux17-start]")).toBeVisible();
});
