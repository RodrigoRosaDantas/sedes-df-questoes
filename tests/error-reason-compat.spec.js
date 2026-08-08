import {test, expect} from "@playwright/test";

test("normaliza motivos de erro legados sem apagar classificações", async ({page}) => {
  await page.goto("/#/inicio", {waitUntil: "domcontentloaded"});
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("sedes.questoes.rodrigo.errorReasons.v1", JSON.stringify({
      q1: {reason: "desatencao", updatedAt: "2026-08-07T18:00:00.000Z"},
      q2: {reason: "confundi", updatedAt: "2026-08-07T18:01:00.000Z"},
      q3: {reason: "interpretacao", updatedAt: "2026-08-07T18:02:00.000Z"},
      q4: {reason: "Questão ambígua", updatedAt: "2026-08-07T18:03:00.000Z"},
    }));
  });
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
  await expect.poll(() => page.evaluate(() => {
    const values = JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.errorReasons.v1") || "{}");
    return [values.q1?.reason, values.q2?.reason, values.q3?.reason, values.q4?.reason];
  })).toEqual(["Distração", "Confundi a regra ou a lei", "Erro de interpretação", "Questão ambígua"]);
});
