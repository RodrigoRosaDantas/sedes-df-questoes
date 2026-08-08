import {test, expect} from "@playwright/test";

const SUBJECT_KEY = "sedes.questoes.rodrigo.homeStudySubjects.v2";
const TRACK_KEY = "sedes.questoes.rodrigo.homeStudyToday.v2";
const SESSION_KEY = "sedes.questoes.rodrigo.session.v3";

async function openHome(page, tracks = ["prova-202"]) {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
  await page.evaluate(({trackKey, subjectKey, sessionKey, tracks: selected}) => {
    localStorage.removeItem(sessionKey);
    localStorage.setItem(trackKey, JSON.stringify(selected));
    sessionStorage.removeItem(subjectKey);
  }, {trackKey: TRACK_KEY, subjectKey: SUBJECT_KEY, sessionKey: SESSION_KEY, tracks});
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux17-subjects]")).toBeVisible({timeout: 30000});
}

async function chooseOneSubjectAndStart(page, trackId, index = 0) {
  const group = page.locator(`[data-ux17-subject-group="${trackId}"]`);
  await group.locator("summary").click();
  const chip = group.locator("[data-ux17-subject-button]").nth(index);
  const subject = await chip.getAttribute("data-ux17-subject");
  expect(subject).toBeTruthy();
  await chip.click();
  await expect(group.locator('[data-ux17-subject-button][aria-pressed="true"]')).toHaveCount(1);
  await page.locator("[data-ux17-start]").click();
  await page.waitForURL(/#\/resolver/, {timeout: 30000});
  await expect(page.locator("[data-question-origin]")).toBeVisible({timeout: 30000});
  return subject;
}

async function expectedOrigin(page, request) {
  const session = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SESSION_KEY);
  const id = session.questionIds[session.current || 0];
  const response = await request.get("./data/release/catalogo.json");
  expect(response.ok()).toBeTruthy();
  const catalog = await response.json();
  const raw = catalog.question_index?.[id];
  const materialId = typeof raw === "string" ? raw : raw?.material_id || raw?.materialId || raw?.material || raw?.id_material;
  const material = (catalog.materials || []).find(item => String(item.id) === String(materialId));
  expect(material).toBeTruthy();
  return {session, id, material};
}

test("resolver mostra tipo, banca/fonte, ano e cargo reais da questão", async ({page, request}) => {
  await openHome(page, ["prova-202"]);
  await chooseOneSubjectAndStart(page, "prova-202");
  const {id, material} = await expectedOrigin(page, request);
  const origin = page.locator(`[data-question-origin="${id}"]`);
  await expect(origin).toContainText("Prova anterior");
  await expect(origin).toContainText("Banca/Fonte");
  await expect(origin).toContainText(String(material.fonte));
  await expect(origin).toContainText(String(material.ano));
  await expect(origin).toContainText(String(material.cargo || `Cargo ${material.codigo_cargo}`));
});

test("resolver também identifica a fonte real de questões de simulado", async ({page, request}) => {
  await openHome(page, ["simulado-202"]);
  await page.locator("[data-ux17-start]").click();
  await page.waitForURL(/#\/resolver/, {timeout: 30000});
  await expect(page.locator("[data-question-origin]")).toBeVisible({timeout: 30000});
  const {id, material} = await expectedOrigin(page, request);
  const origin = page.locator(`[data-question-origin="${id}"]`);
  await expect(origin).toContainText("Simulado");
  await expect(origin).toContainText(String(material.fonte));
  await expect(origin).toContainText(String(material.ano));
  await expect(origin).toContainText(String(material.cargo || `Cargo ${material.codigo_cargo}`));
});

test("concluir treino limpa a matéria temporária e permite iniciar outra imediatamente", async ({page}) => {
  await openHome(page, ["prova-202"]);
  const firstSubject = await chooseOneSubjectAndStart(page, "prova-202", 0);

  await page.evaluate(key => {
    const session = JSON.parse(localStorage.getItem(key));
    session.questionIds = session.questionIds.slice(0, 1);
    session.current = 0;
    session.answers = {};
    session.confirmed = {};
    session.flagged = {};
    session.questionTimes = {};
    localStorage.setItem(key, JSON.stringify(session));
  }, SESSION_KEY);
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-question-origin]")).toBeVisible({timeout: 30000});

  await page.locator(".option").first().click();
  await expect(page.locator("[data-confirm]")).toBeEnabled();
  await page.locator("[data-confirm]").click();
  await page.locator("[data-next]").click();
  await page.waitForURL(/#\/resultado/, {timeout: 30000});
  await expect(page.locator(".result-hero")).toBeVisible();
  await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), SUBJECT_KEY)).toBeNull();

  await page.locator('.result-hero [data-route="inicio"]').click();
  await page.waitForURL(/#\/inicio/, {timeout: 30000});
  await expect(page.locator("[data-ux17-subjects]")).toBeVisible({timeout: 30000});
  const group = page.locator('[data-ux17-subject-group="prova-202"]');
  await group.locator("summary").click();
  await expect(group.locator("[data-ux17-subject-status]")).toContainText("Todas");

  const count = await group.locator("[data-ux17-subject-button]").count();
  expect(count).toBeGreaterThan(1);
  const nextChip = group.locator("[data-ux17-subject-button]").nth(1);
  const nextSubject = await nextChip.getAttribute("data-ux17-subject");
  expect(nextSubject).toBeTruthy();
  expect(nextSubject).not.toBe(firstSubject);
  await nextChip.click();
  await expect(group.locator('[data-ux17-subject-button][aria-pressed="true"]')).toHaveCount(1);
  await page.locator("[data-ux17-start]").click();
  await page.waitForURL(/#\/resolver/, {timeout: 30000});
  const nextSession = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SESSION_KEY);
  expect(nextSession.material.disciplina).toBe(nextSubject);
  expect(nextSession.questionIds.length).toBeGreaterThan(0);
  await expect(page.locator("[data-question-origin]")).toBeVisible({timeout: 30000});
});
