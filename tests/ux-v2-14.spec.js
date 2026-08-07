import {test, expect} from "@playwright/test";

test.beforeEach(async ({page}) => {
  await page.goto("/#/inicio", {waitUntil: "domcontentloaded"});
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: "domcontentloaded"});
});

test("home prioriza o estudo de hoje e mantém status técnico acessível", async ({page}) => {
  await expect(page.locator("[data-ux-today]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-release-health]")).toBeHidden();
  await expect(page.locator("[data-ux-start-today]")).toBeVisible();
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
