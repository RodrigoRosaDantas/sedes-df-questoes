import {test, expect} from "@playwright/test";
const TRACK_KEY = "sedes.questoes.rodrigo.homeStudyToday.v2";
const SUBJECT_KEY = "sedes.questoes.rodrigo.homeStudySubjects.v2";
const FORMAT_KEY = "sedes.questoes.rodrigo.homeStudyFormat.v1";
const SESSION_KEY = "sedes.questoes.rodrigo.session.v3";
async function seed(page, tracks = ["prova-202"]) {
  await page.addInitScript(({trackKey, subjectKey, formatKey, sessionKey, tracks}) => {
    localStorage.setItem(trackKey, JSON.stringify(tracks));
    localStorage.removeItem(sessionKey);
    sessionStorage.removeItem(subjectKey);
    sessionStorage.removeItem(formatKey);
  }, {trackKey: TRACK_KEY, subjectKey: SUBJECT_KEY, formatKey: FORMAT_KEY, sessionKey: SESSION_KEY, tracks});
}
async function openHome(page) {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux20-format]")).toBeVisible({timeout: 30000});
}
test("Limpar → recarregar → Todas nunca bloqueia a recuperação", async ({page}) => {
  await seed(page); await openHome(page);
  const group = page.locator('[data-ux17-subject-group="prova-202"]');
  await group.locator("summary").click();
  await group.locator('[data-ux17-clear="prova-202"]').click();
  await expect(group.locator('[data-ux17-subject-status]')).toContainText("0 de");
  await page.reload({waitUntil: "domcontentloaded"});
  const reloaded = page.locator('[data-ux17-subject-group="prova-202"]');
  await reloaded.locator("summary").click();
  const all = reloaded.locator('[data-ux17-all="prova-202"]');
  await expect(all).toBeEnabled(); await all.click();
  await expect(reloaded.locator('[data-ux17-subject-status]')).toContainText("Todas");
  await expect(page.locator('[data-ux17-start]')).toBeEnabled();
  await expect(page.locator("html")).not.toHaveAttribute("data-ux20-format-gate", /.+/);
});
test("matérias continuam acessíveis por teclado enquanto o índice chega", async ({page}) => {
  let releaseIndex, markRequested;
  const gate = new Promise(resolve => { releaseIndex = resolve; });
  const requested = new Promise(resolve => { markRequested = resolve; });
  await page.route("**/data/release/question-format-index.json", async route => { markRequested(); await gate; await route.continue(); });
  await seed(page); await openHome(page); await requested;
  const panel = page.locator("[data-ux20-format]");
  await expect(panel).toHaveAttribute("aria-busy", "true");
  await expect(panel.locator('[data-ux20-format-option="true-false"]')).toBeDisabled();
  const group = page.locator('[data-ux17-subject-group="prova-202"]');
  await group.locator("summary").click();
  const chip = group.locator('[data-ux17-subject-button]').first();
  const subject = await chip.getAttribute('data-ux17-subject');
  await chip.focus(); await page.keyboard.press("Enter");
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await group.evaluate(node => node.dataset.v221Sentinel = "keep");
  releaseIndex();
  await expect(panel).toHaveAttribute("aria-busy", "false", {timeout: 30000});
  await expect(panel.locator('[data-ux20-format-option="true-false"]')).toBeEnabled();
  await expect(group).toHaveAttribute("data-v221-sentinel", "keep");
  await expect(group.locator('[data-ux17-subject-button][aria-pressed="true"]')).toHaveAttribute('data-ux17-subject', subject);
});
test("falha do índice não impede estudar em Todas", async ({page}) => {
  await page.route("**/data/release/question-format-index.json", route => route.abort("failed"));
  await seed(page); await openHome(page);
  const panel = page.locator("[data-ux20-format]");
  await expect(panel.locator('[data-ux20-format-option="all"]')).toBeEnabled();
  await expect(panel.locator('[data-ux20-format-option="true-false"]')).toBeDisabled();
  const group = page.locator('[data-ux17-subject-group="prova-202"]');
  await group.locator("summary").click();
  const chip = group.locator('[data-ux17-subject-button]').first();
  await chip.click(); await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-ux17-start]')).toBeEnabled();
  await page.locator('[data-ux17-start]').click();
  await page.waitForURL(/#\/resolver/, {timeout: 30000});
  const session = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SESSION_KEY);
  expect(session?.questionIds?.length).toBeGreaterThan(0);
});
