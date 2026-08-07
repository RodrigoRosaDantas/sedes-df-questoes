import {test, expect} from "@playwright/test";

test.beforeEach(async ({page}) => {
  await page.goto("/#/inicio", {waitUntil: "domcontentloaded"});
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: "domcontentloaded"});
});

test("home exibe apenas o essencial e horário de Brasília", async ({page}) => {
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-ux15-current-date]").first()).toBeVisible();
  await expect(page.locator("[data-ux15-current-time]").first()).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await expect(page.locator("[data-ux15-sync-time]").first()).toContainText(/\d{2}\/\d{2}\/\d{4}/);
  await expect(page.locator("#sync-label")).toContainText("Brasília");
  await expect(page.locator(".bank-status")).toBeHidden();
  await expect(page.locator(".dashboard-metrics")).toBeHidden();
  await expect(page.locator(".home-actions-grid")).toBeHidden();
  await expect(page.locator("[data-ux-start-today]").first()).toBeVisible();
});

test("configurações concentram dados do projeto", async ({page}) => {
  await page.locator("[data-ux15-settings]").click();
  await expect(page.locator("[data-ux15-settings-page]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-ux15-settings-tab=plataforma]")).toBeVisible();
  await page.locator("[data-ux15-settings-tab=plataforma]").click();
  await expect(page.locator("[data-ux15-settings-page]")).toHaveAttribute("data-ux15-tab", "plataforma");
  await expect(page.getByRole("heading", {name: "Dados do projeto"})).toBeVisible();
  await expect(page.getByText("Questões publicadas")).toBeVisible();
  await expect(page.getByText("Banco Mestre")).toBeVisible();
  await expect(page.getByText("Última sincronização do catálogo")).toBeVisible();
  await expect(page.locator("[data-ux15-current-time]")).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
});

test("mobile mantém quatro destinos principais e configurações no topo", async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator(".mobile-nav a")).toHaveCount(4);
  await expect(page.locator("[data-ux15-settings]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-ux15-home]")).toBeVisible();
  await page.locator("[data-ux15-settings]").click();
  await expect(page.locator(".ux15-settings-tabs")).toBeVisible({timeout: 30000});
});
