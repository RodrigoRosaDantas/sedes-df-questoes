import {test, expect} from "@playwright/test";

test("fluxo principal, prova completa, matérias e recursos inteligentes", async ({page}) => {
  await page.goto("/");
  await expect(page.locator("#app h1")).toBeVisible();
  await expect(page.locator("[data-smart-today]")).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "./manifest.webmanifest");

  await page.locator('[data-route="estudar"]').first().click();
  await expect(page.locator('[data-study-view="materias"]')).toBeVisible();
  await expect(page.locator('[data-study-view="simulados"]')).toBeVisible();
  await expect(page.locator('[data-study-view="provas"]')).toBeVisible();

  await page.locator('[data-study-view="provas"]').click();
  const examCard = page.locator(".material-card").filter({hasText: "Gestor em Políticas Públicas"});
  await expect(examCard).toBeVisible();
  await examCard.locator("[data-open-material]").click();
  await expect(page.locator(".detail-summary")).toContainText("120");

  await page.goto("/#/estudar");
  await page.locator('[data-study-view="materias"]').click();
  const firstDiscipline = page.locator("[data-open-discipline]").first();
  await expect(firstDiscipline).toBeVisible();
  await firstDiscipline.click();
  await expect(page.locator(".topic-builder")).toBeVisible();
  await expect(page.locator("[data-select-weak-topics]")).toBeVisible();
  await expect(page.locator(".topic-insight").first()).toBeVisible();
});
