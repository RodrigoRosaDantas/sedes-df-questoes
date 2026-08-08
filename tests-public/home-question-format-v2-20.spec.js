import {test, expect} from "@playwright/test";

const TRACK_KEY = "sedes.questoes.rodrigo.homeStudyToday.v2";
const SUBJECT_KEY = "sedes.questoes.rodrigo.homeStudySubjects.v2";
const FORMAT_KEY = "sedes.questoes.rodrigo.homeStudyFormat.v1";
const SESSION_KEY = "sedes.questoes.rodrigo.session.v3";

async function prepare(page) {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
  await page.evaluate(({trackKey, subjectKey, formatKey, sessionKey}) => {
    localStorage.setItem(trackKey, JSON.stringify(["prova-202", "prova-400"]));
    localStorage.removeItem(sessionKey);
    sessionStorage.removeItem(subjectKey);
    sessionStorage.removeItem(formatKey);
  }, {trackKey: TRACK_KEY, subjectKey: SUBJECT_KEY, formatKey: FORMAT_KEY, sessionKey: SESSION_KEY});
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux20-format]")).toBeVisible({timeout: 30000});
}

test("site público filtra sessões por Certo/Errado e Múltipla escolha", async ({page, request}) => {
  const response = await request.get("./data/release/question-format-index.json");
  expect(response.ok()).toBeTruthy();
  const index = await response.json();
  expect(index.question_count).toBe(3447);
  expect(index.summary["true-false"] + index.summary["multiple-choice"]).toBe(3447);

  for (const mode of ["true-false", "multiple-choice"]) {
    await prepare(page);
    const button = page.locator(`[data-ux20-format-option="${mode}"]`);
    await expect(button).toBeEnabled();
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await page.locator("[data-ux17-start]").click();
    await page.waitForURL(/#\/resolver/, {timeout: 30000});
    const session = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SESSION_KEY);
    expect(session.questionIds.length).toBeGreaterThan(0);
    for (const id of session.questionIds) expect(index.formats[id], `${mode}:${id}`).toBe(mode);
  }
});
