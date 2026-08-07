import {test, expect} from "@playwright/test";

test.beforeEach(async ({page}) => {
  await page.goto("/#/inicio", {waitUntil: "domcontentloaded"});
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: "domcontentloaded"});
});

test("home prioriza o estudo de hoje e mantém configurações acessíveis", async ({page}) => {
  await expect(page.locator("[data-ux-today]").first()).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-release-health]")).toBeHidden();
  await expect(page.locator("[data-ux-start-today]").first()).toBeVisible();
  await expect(page.locator("[data-ux-tech-status]")).toBeVisible();
});

test("estudar oferece atalhos, filtros avançados e busca textual", async ({page, request}) => {
  await page.goto("/#/estudar", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux-study-launcher]")).toBeVisible({timeout: 30000});
  await page.locator("[data-ux-toggle-advanced]").click();
  await expect(page.locator("[data-ux-advanced]")).toBeVisible();
  await expect(page.locator("[data-ux-filter-discipline]")).toBeVisible();
  await expect(page.locator("[data-ux-question-search]")).toBeVisible();
  const response = await request.get("/data/release/question-search-index.json");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.questions).toBeGreaterThan(3000);
  expect(payload.items.length).toBe(payload.questions);
});

test("filtro por disciplina inclui questões de provas multidisciplinares", async ({page, request}) => {
  const studyResponse = await request.get("/data/release/study-index.json");
  expect(studyResponse.ok()).toBeTruthy();
  const study = await studyResponse.json();
  const portuguese = study.disciplines.find(item => item.name === "Língua Portuguesa");
  expect(portuguese?.question_ids?.length).toBeGreaterThan(10);

  await page.goto("/#/estudar", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux-study-launcher]")).toBeVisible({timeout: 30000});
  await page.locator("[data-ux-toggle-advanced]").click();
  await page.locator("[data-ux-filter-discipline]").selectOption({label: "Língua Portuguesa"});
  await page.locator("[data-ux-filter-count]").selectOption("10");
  await page.locator("[data-ux-run-filter]").click();
  await expect(page.locator(".question-card")).toBeVisible({timeout: 30000});
  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.session.v3") || "null")?.questionIds || []);
  const allowed = new Set(portuguese.question_ids);
  expect(ids).toHaveLength(10);
  expect(ids.every(id => allowed.has(id))).toBeTruthy();
});

test("caderno mantém erro aberto até três acertos consecutivos", async ({page}) => {
  await expect(page.locator("[data-ux-today]").first()).toBeVisible({timeout: 30000});
  const id = "teste-politica-dominio";
  await page.evaluate(questionId => {
    const policyKey = "sedes.questoes.rodrigo.errorMasteryPolicy.v1";
    const policy = JSON.parse(localStorage.getItem(policyKey) || "null") || {schema_version: "1.0", activatedAt: new Date(Date.now() - 60000).toISOString(), closeAfterConsecutiveCorrect: 3};
    policy.activatedAt = new Date(Date.now() - 60000).toISOString();
    localStorage.setItem(policyKey, JSON.stringify(policy));
    localStorage.setItem("sedes.questoes.rodrigo.errors.v3", JSON.stringify({[questionId]: {id: questionId, count: 1, open: false, updatedAt: new Date().toISOString()}}));
    localStorage.setItem("sedes.questoes.rodrigo.adaptiveReview.v1", JSON.stringify({[questionId]: {id: questionId, streak: 2, mastery: 70}}));
  }, id);
  await page.goto("/#/revisar", {waitUntil: "domcontentloaded"});
  await expect.poll(() => page.evaluate(questionId => JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.errors.v3") || "{}")[questionId]?.open, id)).toBe(true);
  await page.evaluate(questionId => {
    const model = JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.adaptiveReview.v1") || "{}");
    model[questionId].streak = 3;
    localStorage.setItem("sedes.questoes.rodrigo.adaptiveReview.v1", JSON.stringify(model));
  }, id);
  await page.goto("/#/inicio", {waitUntil: "domcontentloaded"});
  await expect.poll(() => page.evaluate(questionId => JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.errors.v3") || "{}")[questionId]?.open, id)).toBe(false);
});

test("mobile entra em modo foco e mantém o mapa sob demanda", async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/#/estudar", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux-quick]")).toBeVisible({timeout: 30000});
  await page.locator("[data-ux-quick]").click();
  await expect(page.locator(".question-card")).toBeVisible({timeout: 30000});
  await expect(page.locator("html")).toHaveClass(/ux-focus-mode/);
  await expect(page.locator(".mobile-nav")).toBeHidden();
  await expect(page.locator("[data-ux-map-toggle]")).toBeVisible();
  const position = await page.locator(".exam-actions").evaluate(element => getComputedStyle(element).position);
  expect(position).toBe("fixed");
  await page.locator("[data-ux-map-toggle]").click();
  await expect(page.locator(".exam-side")).toBeVisible();
});
