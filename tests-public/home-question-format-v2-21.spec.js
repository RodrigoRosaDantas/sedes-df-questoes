import {test, expect} from "@playwright/test";
const TRACK_KEY = "sedes.questoes.rodrigo.homeStudyToday.v2";
const SUBJECT_KEY = "sedes.questoes.rodrigo.homeStudySubjects.v2";
const FORMAT_KEY = "sedes.questoes.rodrigo.homeStudyFormat.v1";
const SESSION_KEY = "sedes.questoes.rodrigo.session.v3";
test("site público recupera seleção após Limpar e recarregar sem gate global", async ({page}) => {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await page.evaluate(({trackKey, subjectKey, formatKey, sessionKey}) => {
    localStorage.setItem(trackKey, JSON.stringify(["prova-202"])); localStorage.removeItem(sessionKey); sessionStorage.removeItem(subjectKey); sessionStorage.removeItem(formatKey);
  }, {trackKey: TRACK_KEY, subjectKey: SUBJECT_KEY, formatKey: FORMAT_KEY, sessionKey: SESSION_KEY});
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux20-format]")).toBeVisible({timeout: 30000});
  expect(await page.locator('script[src*="home-question-format-v2-20-hotfix"]').count()).toBe(0);
  expect(await page.locator('link[href*="home-question-format-v2-20-hotfix"]').count()).toBe(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-ux20-format-gate", /.+/);
  let group = page.locator('[data-ux17-subject-group="prova-202"]');
  await group.locator("summary").click(); await group.locator('[data-ux17-clear="prova-202"]').click();
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux20-format]")).toBeVisible({timeout: 30000});
  group = page.locator('[data-ux17-subject-group="prova-202"]'); await group.locator("summary").click();
  const all = group.locator('[data-ux17-all="prova-202"]'); await expect(all).toBeEnabled(); await all.click();
  await expect(group.locator('[data-ux17-subject-status]')).toContainText("Todas"); await expect(page.locator('[data-ux17-start]')).toBeEnabled();
});
