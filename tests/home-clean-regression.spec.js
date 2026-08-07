import {test, expect} from "@playwright/test";

test.beforeEach(async ({page}) => {
  await page.goto("/#/inicio", {waitUntil: "domcontentloaded"});
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
});

test("home não monta cards técnicos ou adaptativos antigos", async ({page}) => {
  await expect(page.locator("[data-release-health]")).toHaveCount(0);
  await expect(page.locator("[data-adaptive-review]")).toHaveCount(0);
  await expect(page.locator("[data-official-exam-card]")).toHaveCount(0);
});

test("modelo adaptativo continua sincronizando em segundo plano", async ({page}) => {
  await page.evaluate(() => {
    const now = new Date().toISOString();
    localStorage.setItem("sedes.questoes.rodrigo.history.v3", JSON.stringify([{
      id: "home-adaptive-sync-test",
      finishedAt: now,
      questionResults: [{id: "home-sync-q", answer: "A", correct: false, materialId: "teste", discipline: "Teste", assunto: "Teste"}],
      questionTimes: {"home-sync-q": 45},
    }]));
    localStorage.removeItem("sedes.questoes.rodrigo.adaptiveReview.v1");
    localStorage.removeItem("sedes.questoes.rodrigo.adaptiveProcessed.v1");
  });
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
  await expect.poll(() => page.evaluate(() => {
    const model = JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.adaptiveReview.v1") || "{}");
    return {attempts: model["home-sync-q"]?.attempts, lapses: model["home-sync-q"]?.lapses};
  })).toEqual({attempts: 1, lapses: 1});
  await expect(page.locator("[data-adaptive-review]")).toHaveCount(0);
});
