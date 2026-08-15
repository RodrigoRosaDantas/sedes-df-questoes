import {test, expect} from "@playwright/test";

test("expõe release unificada, prova real, reporte e proteção do progresso", async ({page}) => {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-release-health]")).toBeHidden({timeout: 30000});
  await expect(page.locator("[data-ux-tech-status]")).toBeVisible({timeout: 30000});
  await page.locator("[data-ux-tech-status]").click();
  await expect(page.locator("[data-ux15-settings-page]")).toBeVisible({timeout: 30000});
  await page.locator("[data-ux15-settings-tab=plataforma]").click();
  await expect(page.getByRole("heading", {name: "Dados do projeto"})).toBeVisible();

  await page.goto("./#/revisar", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-adaptive-review]")).toBeVisible({timeout: 30000});

  await page.goto("./#/estudar", {waitUntil: "domcontentloaded"});
  const official = page.locator("[data-official-exam-card]");
  await expect(official).toContainText("60 questões", {timeout: 30000});
  await expect(official.locator("[data-start-official-exam]")).toHaveCount(2);
  const enabled = official.locator("[data-start-official-exam]:not([disabled])");
  if (await enabled.count()) {
    await enabled.first().click();
    await expect(page.locator(".question-card")).toBeVisible({timeout: 30000});
    await expect(page.locator("[data-official-remaining]")).toBeVisible();
    await expect(page.locator("[data-report-question]")).toBeVisible();
    await page.locator("[data-report-question]").click();
    await expect(page.locator("[data-report-dialog]")).toContainText("Reportar problema nesta questão");
    await page.locator("[data-report-cancel]").click();
  } else {
    await expect(official).toContainText("Faltam");
  }
  await page.goto("./#/desempenho", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-vault-tools]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-vault-snapshot]")).toBeVisible();
  await expect(page.locator("[data-vault-export]")).toBeVisible();
});
