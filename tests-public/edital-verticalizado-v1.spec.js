import {test, expect} from "@playwright/test";

async function cleanStudyState(page) {
  await page.goto("./#/estudar");
  await page.evaluate(() => {
    localStorage.removeItem("sedes.questoes.rodrigo.session.v3");
    localStorage.removeItem("sedes.questoes.rodrigo.officialBlueprint.v1");
    localStorage.removeItem("sedes.questoes.rodrigo.history.v3");
  });
  await page.reload();
}

async function loadMap(page) {
  const response = await page.request.get("./data/release/edital-map-v1.json", {headers: {"cache-control": "no-cache"}});
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function loadCatalog(page) {
  const response = await page.request.get("./data/release/catalogo.json", {headers: {"cache-control": "no-cache"}});
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

function targetItems(map, code) {
  const generalSections = new Set(map.general_section_ids || []);
  const specificItems = new Set(map.targets[code].specific_item_ids || []);
  return map.sections.flatMap(section => (section.items || []).filter(item => generalSections.has(section.id) || specificItems.has(item.id)).map(item => ({...item, section})));
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
  await expect(vertical.locator('[data-edital-view="history"]')).toHaveText(/Questões realizadas/);

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

test("Prova Real usa A–E e Certo/Errado do cargo sem fallback fora do edital", async ({page}) => {
  const targets = ["202", "400"];
  for (const code of targets) {
    await cleanStudyState(page);
    const map = await loadMap(page);
    const target = map.targets[code];
    expect(map.simulation_policy.accepted_question_formats).toContain("true_false");
    expect(target.general_ce_question_ids.length + target.specific_ce_question_ids.length).toBeGreaterThan(0);
    const card = page.locator("[data-official-exam-card]");
    await expect(card).toBeVisible();
    await expect(card).toContainText(/Certo\/Errado/);
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
    const generalPool = new Set(target.general_exam_question_ids);
    const specificPool = new Set(target.specific_exam_question_ids);
    for (const id of data.blueprint.generalIds) expect(generalPool.has(id)).toBeTruthy();
    for (const id of data.blueprint.specificIds) expect(specificPool.has(id)).toBeTruthy();
    const maria = new Set(target.maria_da_penha_exam_question_ids);
    expect(data.blueprint.generalIds.filter(id => maria.has(id)).length).toBeGreaterThanOrEqual(3);
    for (const id of data.session.questionIds) expect(["A–E", "Certo/Errado"]).toContain(map.question_formats[id]);
    expect(Object.keys(data.blueprint.selectedFormats).every(format => ["A–E", "Certo/Errado"].includes(format))).toBeTruthy();
  }
});

test("questões feitas em qualquer modo alimentam progresso e página de realizadas do verticalizado", async ({page}) => {
  await cleanStudyState(page);
  const map = await loadMap(page);
  const catalog = await loadCatalog(page);
  const code = "202";
  const items = targetItems(map, code).filter(item => item.question_ids.length);
  const mappedItem = items.find(item => item.question_ids.length > 0);
  expect(mappedItem).toBeTruthy();
  const mappedId = mappedItem.question_ids[0];
  const targetIds = new Set(items.flatMap(item => item.question_ids));
  const outsideId = Object.keys(catalog.question_index).find(id => !targetIds.has(id));
  expect(outsideId).toBeTruthy();

  await page.evaluate(({mappedId, outsideId}) => {
    localStorage.setItem("sedes.questoes.rodrigo.history.v3", JSON.stringify([
      {
        id: "history-global-test",
        profileId: "rodrigo",
        materialId: "material-qualquer",
        materialName: "Sessão criada pelo Banco de questões",
        mode: "prova",
        answeredQuestionIds: [mappedId, outsideId],
        questionIds: [mappedId, outsideId],
        questionResults: [
          {id: mappedId, answer: "A", correct: true, discipline: "Teste"},
          {id: outsideId, answer: "Certo", correct: false, discipline: "Teste externo"},
        ],
      },
    ]));
  }, {mappedId, outsideId});
  await page.reload();

  const vertical = page.locator("[data-edital-verticalizado]");
  await expect(vertical).toBeVisible();
  await vertical.locator('[data-edital-target="202"]').click();
  const itemCard = vertical.locator(`[data-edital-item="${mappedItem.id}"]`);
  await expect(itemCard).toContainText(/1\//);
  await expect(vertical.locator("[data-edital-kpis]")).toContainText(/Questões realizadas/);

  await vertical.locator('[data-edital-view="history"]').click();
  const historyView = vertical.locator("[data-edital-history-view]");
  await expect(historyView).toBeVisible();
  await expect(historyView.locator(`[data-edital-history-question="${mappedId}"]`)).toContainText("No edital");
  await expect(historyView.locator(`[data-edital-history-question="${outsideId}"]`)).toContainText("Fora do edital");
  await expect(historyView).toContainText("Sessão criada pelo Banco de questões");

  await historyView.locator("[data-edital-history-relation]").selectOption("mapped");
  await expect(historyView.locator(`[data-edital-history-question="${mappedId}"]`)).toBeVisible();
  await expect(historyView.locator(`[data-edital-history-question="${outsideId}"]`)).toHaveCount(0);
});
