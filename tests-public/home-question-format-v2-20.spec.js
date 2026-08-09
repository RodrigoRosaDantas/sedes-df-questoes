import {test, expect} from "@playwright/test";

const SUBJECT_KEY = "sedes.questoes.rodrigo.homeStudySubjects.v2";
const FORMAT_KEY = "sedes.questoes.rodrigo.homeStudyFormat.v1";
const SESSION_KEY = "sedes.questoes.rodrigo.session.v3";

async function prepare(page) {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux20-format]")).toBeVisible({timeout: 30000});

  await page.evaluate(({subjectKey, formatKey, sessionKey}) => {
    localStorage.removeItem(sessionKey);
    sessionStorage.removeItem(subjectKey);
    sessionStorage.removeItem(formatKey);
    const selected = new Set(["prova-202", "prova-400"]);
    const inputs = [...document.querySelectorAll("[data-ux16-track-input]")];
    for (const input of inputs) input.checked = selected.has(input.value);
    inputs[0]?.dispatchEvent(new Event("change", {bubbles: true}));
  }, {subjectKey: SUBJECT_KEY, formatKey: FORMAT_KEY, sessionKey: SESSION_KEY});

  await expect(page.locator("[data-ux17-subject-group]")).toHaveCount(2, {timeout: 30000});
  const all = page.locator('[data-ux20-format-option="all"]');
  await expect(all).toBeEnabled();
  await all.click();
  await expect(all).toHaveAttribute("aria-pressed", "true");
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
