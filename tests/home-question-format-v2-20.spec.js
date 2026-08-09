import {test, expect} from "@playwright/test";

const TRACK_KEY = "sedes.questoes.rodrigo.homeStudyToday.v2";
const SUBJECT_KEY = "sedes.questoes.rodrigo.homeStudySubjects.v2";
const FORMAT_KEY = "sedes.questoes.rodrigo.homeStudyFormat.v1";
const SESSION_KEY = "sedes.questoes.rodrigo.session.v3";

async function prepare(page, tracks = ["prova-202", "prova-400"]) {
  await page.addInitScript(({tracks, trackKey, subjectKey, formatKey, sessionKey}) => {
    localStorage.setItem(trackKey, JSON.stringify(tracks));
    localStorage.removeItem(sessionKey);
    sessionStorage.removeItem(subjectKey);
    sessionStorage.removeItem(formatKey);
  }, {tracks, trackKey: TRACK_KEY, subjectKey: SUBJECT_KEY, formatKey: FORMAT_KEY, sessionKey: SESSION_KEY});
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux20-format]")).toBeVisible({timeout: 30000});
}

async function formatIndex(request) {
  const response = await request.get("./data/release/question-format-index.json");
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test("Home oferece Todas, Certo ou Errado e Múltipla escolha com contagens", async ({page, request}) => {
  await prepare(page);
  const panel = page.locator("[data-ux20-format]");
  await expect(panel.locator("[data-ux20-format-option]")).toHaveCount(3);
  await expect(panel.locator('[data-ux20-format-option="all"]')).toHaveAttribute("aria-pressed", "true");
  await expect(panel).toContainText("Certo ou Errado");
  await expect(panel).toContainText("Múltipla escolha");
  await expect(panel.locator('[data-ux20-format-count="true-false"]')).not.toHaveText("0");
  await expect(panel.locator('[data-ux20-format-count="multiple-choice"]')).not.toHaveText("0");

  const index = await formatIndex(request);
  expect(index.question_count).toBe(3447);
  expect(index.summary["true-false"]).toBeGreaterThan(0);
  expect(index.summary["multiple-choice"]).toBeGreaterThan(0);
  expect(index.summary["true-false"] + index.summary["multiple-choice"]).toBe(3447);
});

for (const mode of ["true-false", "multiple-choice"]) {
  test(`sessão respeita exclusivamente o formato ${mode}`, async ({page, request}) => {
    await prepare(page);
    const index = await formatIndex(request);
    const button = page.locator(`[data-ux20-format-option="${mode}"]`);
    await expect(button).toBeEnabled();
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-ux16-summary]")).toContainText(mode === "true-false" ? "Certo ou Errado" : "Múltipla escolha");

    await page.locator("[data-ux17-start]").click();
    await page.waitForURL(/#\/resolver/, {timeout: 30000});
    const session = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SESSION_KEY);
    expect(session).toBeTruthy();
    expect(session.questionIds.length).toBeGreaterThan(0);
    expect(session.questionIds.length).toBeLessThanOrEqual(25);
    expect(session.material.tipo_material).toBe("prova");
    for (const id of session.questionIds) expect(index.formats[id], id).toBe(mode);
  });
}

test("formato é temporário e não altera a seleção permanente de trilhas", async ({page}) => {
  await prepare(page, ["prova-400"]);
  const button = page.locator('[data-ux20-format-option="multiple-choice"]');
  await expect(button).toBeEnabled();
  await button.click();
  const values = await page.evaluate(({formatKey, trackKey}) => ({
    format: sessionStorage.getItem(formatKey),
    tracks: JSON.parse(localStorage.getItem(trackKey)),
  }), {formatKey: FORMAT_KEY, trackKey: TRACK_KEY});
  expect(values.format).toBe("multiple-choice");
  expect(values.tracks).toEqual(["prova-400"]);
});

test.describe("mobile", () => {
  test.use({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});

  test("filtro de formato usa botões tocáveis sem overflow", async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await prepare(page);
    await page.locator('[data-ux20-format-option="true-false"]').tap();
    await expect(page.locator('[data-ux20-format-option="true-false"]')).toHaveAttribute("aria-pressed", "true");
    const minHeight = await page.locator('[data-ux20-format-option="true-false"]').evaluate(node => parseFloat(getComputedStyle(node).minHeight));
    expect(minHeight).toBeGreaterThanOrEqual(42);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});
