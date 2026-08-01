import {test, expect} from "@playwright/test";

test("expõe release unificada, prova real, reporte e proteção do progresso", async ({page}) => {
  await page.goto("/#/inicio", {waitUntil: "domcontentloaded"});
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-release-health]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-official-exam-card]")).toContainText("60 questões");
  await expect(page.locator("[data-adaptive-review]")).toBeVisible();
  await page.locator("[data-start-official-exam]").click();
  await expect(page.locator(".question-card")).toBeVisible({timeout: 30000});
  await expect.poll(() => page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.session.v3") || "null");
    return {id: session?.material?.id, questionIds: session?.questionIds?.length, questions: session?.questions?.length};
  })).toEqual({id: "prova-real-sedes-2026", questionIds: 60, questions: 60});
  await expect(page.locator("[data-official-remaining]")).toBeVisible();
  await expect(page.locator("[data-report-question]")).toBeVisible();
  await page.locator("[data-report-question]").click();
  await expect(page.locator("[data-report-dialog]")).toContainText("Reportar problema nesta questão");
  await page.locator("[data-report-cancel]").click();
  await page.goto("/#/desempenho", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-vault-tools]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-vault-snapshot]")).toBeVisible();
  await expect(page.locator("[data-vault-export]")).toBeVisible();
});
