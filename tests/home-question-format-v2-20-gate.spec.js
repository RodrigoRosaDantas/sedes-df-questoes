import {test, expect} from "@playwright/test";

const TRACK_KEY = "sedes.questoes.rodrigo.homeStudyToday.v2";
const SUBJECT_KEY = "sedes.questoes.rodrigo.homeStudySubjects.v2";
const FORMAT_KEY = "sedes.questoes.rodrigo.homeStudyFormat.v1";
const SESSION_KEY = "sedes.questoes.rodrigo.session.v3";

test("índice atrasado não pode trocar a matéria selecionada", async ({page}) => {
  let releaseIndex;
  let markRequested;
  const gate = new Promise(resolve => { releaseIndex = resolve; });
  const requested = new Promise(resolve => { markRequested = resolve; });

  await page.route("**/data/release/question-format-index.json", async route => {
    markRequested();
    await gate;
    await route.continue();
  });

  await page.addInitScript(({trackKey, subjectKey, formatKey, sessionKey}) => {
    const setupKey = "__sedes.v220.gate.setup";
    if (sessionStorage.getItem(setupKey)) return;
    localStorage.setItem(trackKey, JSON.stringify(["prova-202"]));
    localStorage.removeItem(sessionKey);
    sessionStorage.removeItem(subjectKey);
    sessionStorage.removeItem(formatKey);
    sessionStorage.setItem(setupKey, "1");
  }, {trackKey: TRACK_KEY, subjectKey: SUBJECT_KEY, formatKey: FORMAT_KEY, sessionKey: SESSION_KEY});

  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
  const panel = page.locator("[data-ux17-subjects]");
  await expect(panel).toBeVisible({timeout: 30000});
  await requested;
  await expect(page.locator("html")).toHaveAttribute("data-ux20-format-gate", "loading");
  await expect(panel).toHaveAttribute("aria-busy", "true");

  const group = page.locator('[data-ux17-subject-group="prova-202"]');
  const openAttempt = group.locator("summary").click();
  await page.waitForTimeout(200);
  await expect(page.locator("html")).toHaveAttribute("data-ux20-format-gate", "loading");

  releaseIndex();
  await expect(page.locator("html")).toHaveAttribute("data-ux20-format-gate", "ready", {timeout: 30000});
  await openAttempt;

  const chip = group.locator("[data-ux17-subject-button]").nth(1);
  const selectedSubject = await chip.getAttribute("data-ux17-subject");
  expect(selectedSubject).toBeTruthy();
  await chip.click();
  await expect(group.locator('[data-ux17-subject-button][aria-pressed="true"]')).toHaveAttribute("data-ux17-subject", selectedSubject);

  await page.locator("[data-ux17-start]").click();
  await page.waitForURL(/#\/resolver/, {timeout: 30000});
  const session = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SESSION_KEY);
  expect(session).toBeTruthy();
  expect(session.material.disciplina).toBe(selectedSubject);
});
