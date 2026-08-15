import {test, expect} from "@playwright/test";

async function clearState(page) {
  await page.goto("./estudo-por-cargo.html?cargo=202");
  await page.evaluate(() => {
    localStorage.removeItem("sedes.questoes.rodrigo.session.v3");
    localStorage.removeItem("sedes.questoes.rodrigo.history.v3");
    localStorage.removeItem("sedes.questoes.rodrigo.studyByRole.target.v1");
  });
  await page.reload();
}

async function loadMap(page) {
  const response = await page.request.get("./data/release/edital-map-v1.json", {headers: {"cache-control": "no-cache"}});
  expect(response.ok()).toBeTruthy();
  return response.json();
}

function targetSections(map, code) {
  const general = new Set(map.general_section_ids || []);
  const specific = new Set(map.targets[code].specific_item_ids || []);
  return map.sections.filter(section => general.has(section.id) || section.items.some(item => specific.has(item.id))).map(section => ({
    ...section,
    items: section.items.filter(item => general.has(section.id) || specific.has(item.id)),
  }));
}

test("Estudar oferece acesso à página filha por cargo", async ({page}) => {
  await page.goto("./#/estudar");
  const entry = page.locator("[data-role-study-entry]");
  await expect(entry).toBeVisible({timeout: 30000});
  await expect(entry).toContainText("Matérias → tópicos → questões");
  await expect(entry.locator('a[href*="estudo-por-cargo.html?cargo=202"]')).toBeVisible();
  await expect(entry.locator('a[href*="estudo-por-cargo.html?cargo=400"]')).toBeVisible();
});

test("página filha navega cargo → matéria → tópico → questão e usa o resolvedor existente", async ({page}) => {
  test.setTimeout(90000);
  await clearState(page);
  const map = await loadMap(page);
  const sections = targetSections(map, "202");
  expect(sections.length).toBeGreaterThan(2);

  const shell = page.locator("[data-role-study-shell]");
  await expect(shell).toBeVisible({timeout: 30000});
  await expect(shell).toHaveAttribute("data-role-target-code", "202");
  await expect(page.locator("[data-role-subject-grid] [data-role-subject]")).toHaveCount(sections.length);

  const section = sections.find(candidate => candidate.items.some(item => item.question_ids.length > 0));
  expect(section).toBeTruthy();
  await page.locator(`[data-role-subject="${section.id}"]`).click();
  await expect(page.locator("[data-role-topics]")).toBeVisible();
  await expect(page.locator("[data-role-topics]")).toContainText(section.label.replace(/^\s*\d+(?:\.\d+)*\s*/, ""));

  const item = section.items.find(candidate => candidate.question_ids.length > 0);
  await page.locator(`[data-role-topic="${item.id}"]`).click();
  const detail = page.locator(`[data-role-topic-detail="${item.id}"]`);
  await expect(detail).toBeVisible();
  await expect(detail.locator("[data-role-question]").first()).toBeVisible();
  const firstId = item.question_ids[0];
  await expect(detail.locator(`[data-role-question="${firstId}"]`)).toBeVisible();

  await detail.locator(`[data-role-question="${firstId}"] [data-role-run-one]`).click();
  await page.waitForURL(/index\.html#\/resolver/);
  await expect(page.locator(".question-card")).toBeVisible({timeout: 30000});
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.session.v3") || "null"));
  expect(session.material.codigo_cargo).toBe("202");
  expect(session.questionIds).toEqual([firstId]);
  expect(session.material.nome).toContain("Estudo por Cargo");
});

test("progresso da página filha considera histórico global e cargo 400 possui matérias próprias", async ({page}) => {
  test.setTimeout(90000);
  await clearState(page);
  const map = await loadMap(page);
  const sections202 = targetSections(map, "202");
  const mapped = sections202.flatMap(section => section.items).find(item => item.question_ids.length > 0);
  const mappedId = mapped.question_ids[0];

  await page.evaluate(mappedId => {
    localStorage.setItem("sedes.questoes.rodrigo.history.v3", JSON.stringify([{
      id: "study-by-role-global-history",
      materialId: "banco-livre",
      materialName: "Banco de questões",
      mode: "treino",
      answeredQuestionIds: [mappedId],
      questionIds: [mappedId],
      questionResults: [{id: mappedId, answer: "Certo", correct: true}],
      completedAt: "2026-08-15T20:00:00-03:00"
    }]));
  }, mappedId);
  await page.reload();
  await expect(page.locator("[data-role-kpis]")).toContainText("Questões feitas");
  await expect(page.locator("[data-role-kpis]")).toContainText("1");

  await page.locator('[data-role-target="400"]').click();
  const shell = page.locator("[data-role-study-shell]");
  await expect(shell).toHaveAttribute("data-role-target-code", "400");
  const sections400 = targetSections(map, "400");
  await expect(page.locator("[data-role-subject-grid] [data-role-subject]")).toHaveCount(sections400.length);
  const labels400 = sections400.map(section => section.label).join(" ");
  expect(labels400).toMatch(/Gestão de Pessoas|Administração Financeira|Teoria Geral/i);
});
