import {test, expect} from "@playwright/test";

test("home pública permite personalizar matérias dentro do recorte do edital", async ({page}) => {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux17-subjects]")).toBeVisible({timeout: 30000});
  await expect(page.locator('[data-ux17-subject-group="prova-202"]')).toHaveCount(1);
  const group = page.locator('[data-ux17-subject-group="prova-202"]');
  await group.locator("summary").click();
  const subjects = group.locator("[data-ux17-subject-input]");
  expect(await subjects.count()).toBeGreaterThan(0);
  await group.locator('[data-ux17-clear="prova-202"]').click();
  await subjects.first().check();
  await expect(group.locator("[data-ux17-subject-status]")).toContainText("1 de");
  await expect(page.locator("[data-ux17-start]")).toBeEnabled();
});
