import {test, expect} from "@playwright/test";

test("site público gera PDFs de provas e simulados", async ({page}) => {
  await page.goto("./#/estudar", {waitUntil: "domcontentloaded"});
  await expect(page.locator('[data-study-view="provas"]')).toBeVisible({timeout: 30000});
  await page.locator('[data-study-view="provas"]').click();

  const materialCard = page.locator(".material-card").first();
  await expect(materialCard).toBeVisible({timeout: 30000});
  const materialName = (await materialCard.locator("h3").textContent())?.trim();
  expect(materialName).toBeTruthy();
  await materialCard.locator("[data-open-material]").click();

  const downloadCard = page.locator("[data-material-download-card]");
  await expect(downloadCard).toBeVisible({timeout: 30000});
  await expect(downloadCard.getByRole("button", {name: "PDF para responder"})).toBeVisible();
  await expect(downloadCard.getByRole("button", {name: "PDF comentado"})).toBeVisible();

  const popupPromise = page.waitForEvent("popup");
  await downloadCard.getByRole("button", {name: "PDF comentado"}).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  await expect(popup.locator(".cover h1")).toContainText(materialName);
  await expect(popup.locator(".question").first()).toBeVisible();
  await expect(popup.locator(".answer-section")).toBeVisible();
  await expect(popup.locator(".comments")).toBeVisible();
  await popup.close();
});
