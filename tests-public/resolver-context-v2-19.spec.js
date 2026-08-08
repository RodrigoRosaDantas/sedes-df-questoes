import {test, expect} from "@playwright/test";

const SUBJECT_KEY = "sedes.questoes.rodrigo.homeStudySubjects.v2";
const TRACK_KEY = "sedes.questoes.rodrigo.homeStudyToday.v2";
const SESSION_KEY = "sedes.questoes.rodrigo.session.v3";

async function prepare(page, tracks) {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
  await page.evaluate(({tracks: selected}) => {
    localStorage.removeItem("sedes.questoes.rodrigo.session.v3");
    localStorage.setItem("sedes.questoes.rodrigo.homeStudyToday.v2", JSON.stringify(selected));
    sessionStorage.removeItem("sedes.questoes.rodrigo.homeStudySubjects.v2");
  }, {tracks});
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux17-subjects]")).toBeVisible({timeout: 30000});
}

async function originMaterial(page, request) {
  const session = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SESSION_KEY);
  const id = session.questionIds[session.current || 0];
  const catalog = await (await request.get("./data/release/catalogo.json")).json();
  const raw = catalog.question_index?.[id];
  const materialId = typeof raw === "string" ? raw : raw?.material_id || raw?.materialId || raw?.material || raw?.id_material;
  const material = (catalog.materials || []).find(item => String(item.id) === String(materialId));
  return {id, material};
}

async function finishRealTraining(page) {
  const total = await page.evaluate(key => JSON.parse(localStorage.getItem(key))?.questionIds?.length || 0, SESSION_KEY);
  expect(total).toBeGreaterThan(0);
  for (let index = 0; index < total; index += 1) {
    await expect(page.locator(".option").first()).toBeVisible({timeout: 15000});
    await page.locator(".option").first().click();
    const confirm = page.locator("[data-confirm]");
    await expect(confirm).toBeEnabled({timeout: 15000});
    await confirm.click();
    const next = page.locator("[data-next]");
    await expect(next).toBeVisible({timeout: 15000});
    await next.click();
    if (index < total - 1) {
      await expect(page.locator(".exam-header .eyebrow")).toContainText(`Questão ${index + 2} de ${total}`, {timeout: 15000});
    }
  }
  await expect(page).toHaveURL(/#\/resultado/, {timeout: 30000});
  await expect(page.locator(".result-hero")).toBeVisible({timeout: 30000});
}

test("site público mostra banca/fonte, ano e cargo da questão de prova e simulado", async ({page, request}) => {
  for (const [track, expectedType] of [["prova-202", "Prova anterior"], ["simulado-202", "Simulado"]]) {
    await prepare(page, [track]);
    await page.locator("[data-ux17-start]").click();
    await page.waitForURL(/#\/resolver/, {timeout: 30000});
    await expect(page.locator("[data-question-origin]")).toBeVisible({timeout: 30000});
    const {id, material} = await originMaterial(page, request);
    expect(material).toBeTruthy();
    const origin = page.locator(`[data-question-origin="${id}"]`);
    await expect(origin).toContainText(expectedType);
    await expect(origin).toContainText("Banca/Fonte");
    await expect(origin).toContainText(String(material.fonte));
    await expect(origin).toContainText(String(material.ano));
    await expect(origin).toContainText(String(material.cargo || `Cargo ${material.codigo_cargo}`));
  }
});

test("site público permite concluir uma matéria real e começar outra sem estado temporário preso", async ({page}) => {
  await prepare(page, ["prova-202"]);
  const group = page.locator('[data-ux17-subject-group="prova-202"]');
  await group.locator("summary").click();
  const first = group.locator("[data-ux17-subject-button]").first();
  const firstSubject = await first.getAttribute("data-ux17-subject");
  await first.click();
  await page.locator("[data-ux17-start]").click();
  await page.waitForURL(/#\/resolver/, {timeout: 30000});
  await finishRealTraining(page);
  await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), SUBJECT_KEY)).toBeNull();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), SESSION_KEY)).toBeNull();

  await page.locator('.result-hero [data-route="inicio"]').click();
  await expect(page).toHaveURL(/#\/inicio/, {timeout: 30000});
  await expect(page.locator("[data-ux17-subjects]")).toBeVisible({timeout: 30000});
  const nextGroup = page.locator('[data-ux17-subject-group="prova-202"]');
  await nextGroup.locator("summary").click();
  await expect(nextGroup.locator("[data-ux17-subject-status]")).toContainText("Todas");
  const second = nextGroup.locator("[data-ux17-subject-button]").nth(1);
  const secondSubject = await second.getAttribute("data-ux17-subject");
  expect(secondSubject).not.toBe(firstSubject);
  await second.click();
  await page.locator("[data-ux17-start]").click();
  await page.waitForURL(/#\/resolver/, {timeout: 30000});
  const session = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SESSION_KEY);
  expect(session.material.disciplina).toBe(secondSubject);
  await expect(page.locator("[data-question-origin]")).toBeVisible({timeout: 30000});
});
