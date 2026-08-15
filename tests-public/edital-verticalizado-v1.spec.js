import {test, expect} from "@playwright/test";

async function cleanStudyState(page) {
  await page.goto("./#/estudar");
  await page.evaluate(() => {
    localStorage.removeItem("sedes.questoes.rodrigo.session.v3");
    localStorage.removeItem("sedes.questoes.rodrigo.officialBlueprint.v1");
  });
  await page.reload();
}

async function loadMap(page) {
  const response = await page.request.get("./data/release/edital-map-v1.json", {headers: {"cache-control": "no-cache"}});
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function readStableStudyState(page) {
  await expect(page.locator(".question-card")).toBeVisible({timeout: 30000});
  await page.waitForFunction(() => {
    const session = JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.session.v3") || "null");
    return Boolean(session?.questionIds?.length);
  });
  return page.evaluate(() => ({
    session: JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.session.v3") || "null"),
    blueprint: JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.officialBlueprint.v1") || "null"),
  }));
}

test("edital verticalizado separa 202/400 e abre somente questões do item escolhido", async ({page}) => {
  await cleanStudyState(page);
  const map = await loadMap(page);
  expect(map.objective_blueprint.general_questions).toBe(20);
  expect(map.objective_blueprint.specific_questions).toBe(40);
  expect(map.summary.official_items).toBeGreaterThanOrEqual(70);

  const vertical = page.locator("[data-edital-verticalizado]");
  await expect(vertical).toBeVisible();
  await expect(vertical.locator('[data-edital-target="202"]')).toBeVisible();
  await expect(vertical.locator('[data-edital-target="400"]')).toBeVisible();

  await vertical.locator('[data-edital-target="202"]').click();
  const run = vertical.locator('details[open] button[data-edital-run][data-edital-size="10"]:not([disabled])').first();
  await expect(run).toBeVisible();
  const itemId = await run.getAttribute("data-edital-run");
  const item = map.sections.flatMap(section => section.items).find(candidate => candidate.id === itemId);
  expect(item).toBeTruthy();
  const allowed = new Set(item.question_ids);

  await run.click();
  await page.waitForURL(/#\/resolver/);
  const {session} = await readStableStudyState(page);
  expect(session).toBeTruthy();
  expect(session.material.codigo_cargo).toBe("202");
  expect(session.questionIds.length).toBeGreaterThan(0);
  expect(session.questionIds.length).toBeLessThanOrEqual(10);
  for (const id of session.questionIds) expect(allowed.has(id)).toBeTruthy();
});

test("Prova Real usa matriz A–E do cargo e nunca faz fallback fora do edital", async ({page}) => {
  const targets = ["202", "400"];
  for (const code of targets) {
    await cleanStudyState(page);
    const map = await loadMap(page);
    const target = map.targets[code];
    const card = page.locator("[data-official-exam-card]");
    await expect(card).toBeVisible();
    const button = card.locator(`[data-start-official-exam="${code}"]`);
    await expect(button).toBeVisible();

    if (!target.readiness.ready) {
      await expect(button).toBeDisabled();
      expect(Object.values(target.readiness.deficits).some(value => Number(value) > 0)).toBeTruthy();
      continue;
    }

    await expect(button).toBeEnabled();
    await button.click();
    await page.waitForURL(/#\/resolver/);
    const data = await readStableStudyState(page);
    expect(data.session.material.codigo_cargo).toBe(code);
    expect(data.session.questionIds).toHaveLength(60);
    expect(new Set(data.session.questionIds).size).toBe(60);
    expect(data.blueprint.targetCode).toBe(code);
    expect(data.blueprint.generalIds).toHaveLength(20);
    expect(data.blueprint.specificIds).toHaveLength(40);
    const generalPool = new Set(target.general_ae_question_ids);
    const specificPool = new Set(target.specific_ae_question_ids);
    for (const id of data.blueprint.generalIds) expect(generalPool.has(id)).toBeTruthy();
    for (const id of data.blueprint.specificIds) expect(specificPool.has(id)).toBeTruthy();
    const maria = new Set(target.maria_da_penha_ae_question_ids);
    expect(data.blueprint.generalIds.filter(id => maria.has(id)).length).toBeGreaterThanOrEqual(3);
  }
});
