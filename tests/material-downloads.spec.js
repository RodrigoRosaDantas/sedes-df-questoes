import {test, expect} from "@playwright/test";

test("permite gerar cadernos PDF de provas e simulados", async ({page}) => {
  await page.goto("/#/estudar", {waitUntil: "domcontentloaded"});
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

  const questionsPopupPromise = page.waitForEvent("popup");
  await downloadCard.getByRole("button", {name: "PDF para responder"}).click();
  const questionsPopup = await questionsPopupPromise;
  await questionsPopup.waitForLoadState("domcontentloaded");
  await expect(questionsPopup.locator(".cover h1")).toContainText(materialName);
  await expect(questionsPopup.locator(".question").first()).toBeVisible();
  await expect(questionsPopup.locator(".answer-section")).toHaveCount(0);
  await questionsPopup.close();

  const answersPopupPromise = page.waitForEvent("popup");
  await downloadCard.getByRole("button", {name: "PDF comentado"}).click();
  const answersPopup = await answersPopupPromise;
  await answersPopup.waitForLoadState("domcontentloaded");
  await expect(answersPopup.locator(".answer-section")).toBeVisible();
  await expect(answersPopup.locator(".comments")).toBeVisible();
  await answersPopup.close();
});
