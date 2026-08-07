import {test, expect} from "@playwright/test";

test("home pública fica limpa e configurações expõem sincronização", async ({page}) => {
  await page.goto("/#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
  await expect(page.locator(".bank-status")).toBeHidden();
  await expect(page.locator("#sync-label")).toContainText("Brasília");
  await expect(page.locator("[data-ux15-sync-time]").first()).toContainText(/\d{2}\/\d{2}\/\d{4}/);
  await page.locator("[data-ux15-settings]").click();
  await expect(page.locator("[data-ux15-settings-page]")).toBeVisible({timeout: 30000});
  await page.locator("[data-ux15-settings-tab=plataforma]").click();
  await expect(page.getByRole("heading", {name: "Dados do projeto"})).toBeVisible();
  await expect(page.getByText("Questões publicadas")).toBeVisible();
});
