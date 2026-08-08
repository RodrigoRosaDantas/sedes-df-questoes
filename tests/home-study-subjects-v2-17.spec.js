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
    sessionStorage.removeItem("sedes.questoes.rodrigo.homeStudySubjects.v2");
  }, ids);
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux17-subjects]")).toBeVisible({timeout: 30000});
}

test("matérias aparecem nos recortes escolhidos e Todas é um modo próprio", async ({page}) => {
  await openHome(page);
  await expect(page.locator('[data-ux17-subject-group="prova-202"]')).toHaveCount(1);
  await expect(page.locator('[data-ux17-subject-group="prova-400"]')).toHaveCount(1);
  await expect(page.locator('[data-ux17-subject-group="simulado-202"]')).toHaveCount(0);
  await expect(page.locator('[data-ux17-subject-group="simulado-400"]')).toHaveCount(0);

  for (const id of ["prova-202", "prova-400"]) {
    const group = page.locator(`[data-ux17-subject-group="${id}"]`);
    await group.locator("summary").click();
    const subjects = group.locator("[data-ux17-subject-button]");
    const total = await subjects.count();
    expect(total, `${id} deve oferecer matérias elegíveis`).toBeGreaterThan(0);
    await expect(group.locator(`[data-ux17-all="${id}"]`)).toHaveAttribute("aria-pressed", "true");
    await expect(group.locator('[data-ux17-subject-button][aria-pressed="true"]')).toHaveCount(0);
    await expect(group.locator("[data-ux17-subject-status]")).toContainText("Todas");
  }
});

test("toque natural a partir de Todas seleciona somente a matéria tocada e a sessão respeita o filtro", async ({page, request}) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await openHome(page);
  await setTracks(page, ["prova-202"]);

  const group = page.locator('[data-ux17-subject-group="prova-202"]');
  await group.locator("summary").click();
  const firstChip = group.locator("[data-ux17-subject-button]").first();
  const subject = await firstChip.getAttribute("data-ux17-subject");
  expect(subject).toBeTruthy();

  await firstChip.click();
  await expect(group.locator('[data-ux17-subject-button][aria-pressed="true"]')).toHaveCount(1);
  await expect(group.locator("[data-ux17-subject-status]")).toContainText("1 de");
  await expect(group.locator('[data-ux17-all="prova-202"]')).toHaveAttribute("aria-pressed", "false");
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
  expect(errors).toEqual([]);
});

test("seleção customizada permite combinar, remover, limpar e voltar para Todas", async ({page}) => {
  await openHome(page);
  await setTracks(page, ["simulado-400"]);
  const group = page.locator('[data-ux17-subject-group="simulado-400"]');
  await group.locator("summary").click();

  const first = group.locator("[data-ux17-subject-button]").nth(0);
  const second = group.locator("[data-ux17-subject-button]").nth(1);
  await first.click();
  await second.click();
  await expect(group.locator('[data-ux17-subject-button][aria-pressed="true"]')).toHaveCount(2);

  await group.locator('[data-ux17-subject-button][aria-pressed="true"]').first().click();
  await expect(group.locator('[data-ux17-subject-button][aria-pressed="true"]')).toHaveCount(1);

  await group.locator('[data-ux17-clear="simulado-400"]').click();
  await expect(group.locator('[data-ux17-subject-button][aria-pressed="true"]')).toHaveCount(0);
  await expect(group.locator("[data-ux17-subject-status]")).toContainText("0 de");
  await expect(page.locator("[data-ux17-start]")).toBeDisabled();

  await group.locator('[data-ux17-all="simulado-400"]').click();
  await expect(group.locator('[data-ux17-all="simulado-400"]')).toHaveAttribute("aria-pressed", "true");
  await expect(group.locator("[data-ux17-subject-status]")).toContainText("Todas");
  await expect(page.locator("[data-ux17-start]")).toBeEnabled();
});

test("filtro de matérias usa estado temporário v2 e não altera as quatro trilhas", async ({page}) => {
  await openHome(page);
  await setTracks(page, ["simulado-400"]);
  const group = page.locator('[data-ux17-subject-group="simulado-400"]');
  await group.locator("summary").click();
  await group.locator("[data-ux17-subject-button]").first().click();

  const state = await page.evaluate(() => ({
    permanent: JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.homeStudyToday.v2")),
    oldTemporary: sessionStorage.getItem("sedes.questoes.rodrigo.homeStudySubjects.v1"),
    temporary: JSON.parse(sessionStorage.getItem("sedes.questoes.rodrigo.homeStudySubjects.v2")),
  }));
  expect(state.permanent).toEqual(["simulado-400"]);
  expect(state.oldTemporary).toBeNull();
  expect(state.temporary["simulado-400"]).toHaveLength(1);
});

test.describe("mobile touch", () => {
  test.use({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});

  test("rolagem da lista permanece estável ao selecionar matérias", async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await openHome(page);
    await setTracks(page, ["prova-202"]);
    const group = page.locator('[data-ux17-subject-group="prova-202"]');
    await group.locator("summary").tap();
    const chips = group.locator(".ux17-subject-chips");
    await expect(chips).toBeVisible();
    await chips.evaluate(node => {
      node.scrollTop = node.scrollHeight;
      node.dataset.scrollSentinel = "keep";
    });
    const before = await chips.evaluate(node => node.scrollTop);
    expect(before).toBeGreaterThan(0);
    const last = group.locator("[data-ux17-subject-button]").last();
    await last.tap();
    await expect(chips).toHaveAttribute("data-scroll-sentinel", "keep");
    const after = await chips.evaluate(node => node.scrollTop);
    expect(after).toBeGreaterThanOrEqual(Math.max(0, before - 2));
    await expect(last).toHaveAttribute("aria-pressed", "true");
    expect(errors).toEqual([]);
  });

  test("toque em matéria funciona sem overflow nem erro de página", async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await openHome(page);
    const group = page.locator('[data-ux17-subject-group="prova-202"]');
    await group.locator("summary").tap();
    await group.locator("[data-ux17-subject-button]").first().tap();
    await expect(group.locator('[data-ux17-subject-button][aria-pressed="true"]')).toHaveCount(1);
    await expect(group.locator("[data-ux17-subject-status]")).toContainText("1 de");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});