import {test, expect} from "@playwright/test";

test("fluxo principal, prova completa, matérias e recursos inteligentes", async ({page}) => {
  await page.goto("/");
  await expect(page.locator("#app h1")).toBeVisible();
  await expect(page.locator("[data-ux15-home]")).toBeVisible();
  await expect(page.locator("[data-ux-today]")).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "./manifest.webmanifest");

  await page.locator('[data-route="estudar"]').first().click();
  await expect(page.locator('[data-study-view="materias"]')).toBeVisible();
  await expect(page.locator('[data-study-view="simulados"]')).toBeVisible();
  await expect(page.locator('[data-study-view="provas"]')).toBeVisible();

  await page.locator('[data-study-view="provas"]').click();
  const examButton = page.locator('[data-open-material="prova-qdx-seedf-2022-gppgadm-a"]');
  const examCard = examButton.locator("xpath=ancestor::article[contains(@class, 'material-card')]");
  await expect(examButton).toBeVisible();
  await expect(examCard).toContainText("119 questões");
  await examButton.click();
  await expect(page.locator(".detail-summary")).toContainText("119");

  await page.goto("/#/estudar");
  await page.locator('[data-study-view="materias"]').click();
  const firstDiscipline = page.locator("[data-open-discipline]").first();
  await expect(firstDiscipline).toBeVisible();
  await firstDiscipline.click();
  await expect(page.locator(".topic-builder")).toBeVisible();
  await expect(page.locator("[data-select-weak-topics]")).toBeVisible();
  await expect(page.locator(".topic-insight").first()).toBeVisible();
});
