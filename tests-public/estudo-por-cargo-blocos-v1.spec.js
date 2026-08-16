import {test, expect} from "@playwright/test";

test("Estudo por Cargo separa conhecimentos comuns por nível e específicos por cargo", async ({page}) => {
  test.setTimeout(90000);
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("./estudo-por-cargo.html?cargo=202", {waitUntil: "domcontentloaded"});
  const shell = page.locator("[data-role-study-shell]");
  await expect(shell).toBeVisible({timeout: 30000});

  const common202 = page.locator('[data-role-knowledge-group="common"]');
  const specific202 = page.locator('[data-role-knowledge-group="specific"]');
  await expect(common202).toContainText("Conhecimentos comuns — nível médio");
  await expect(common202.locator('[data-role-subject="lingua-portuguesa"]')).toBeVisible();
  await expect(common202.locator('[data-role-subject="lei-maria-da-penha"]')).toBeVisible();
  await expect(specific202).toContainText("Conhecimentos específicos — Técnico Administrativo (202)");
  await expect(specific202.locator('[data-role-subject="direito-administrativo"]')).toBeVisible();
  await expect(specific202.locator('[data-role-subject="arquivologia"]')).toBeVisible();
  await expect(page.locator("[data-role-level-summary]")).toContainText("nível médio");
  await expect(page.locator("[data-role-study-context]")).toContainText("Cargo → bloco → matéria → tópico → questões");

  await page.locator('[data-role-target="400"]').click();
  const common400 = page.locator('[data-role-knowledge-group="common"]');
  const specific400 = page.locator('[data-role-knowledge-group="specific"]');
  await expect(common400).toContainText("Conhecimentos comuns — nível superior");
  await expect(common400.locator('[data-role-subject="lingua-portuguesa"]')).toBeVisible();
  await expect(specific400).toContainText("Conhecimentos específicos — Administrador (400)");
  await expect(specific400.locator('[data-role-subject="administracao-geral-publica"]')).toBeVisible();
  await expect(specific400.locator('[data-role-subject="afo"]')).toBeVisible();
  await expect(page.locator("[data-role-level-summary]")).toContainText("nível superior");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
