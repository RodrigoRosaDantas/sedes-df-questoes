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

function mappedItem(map, sectionId, allowedIds = null) {
  const section = map.sections.find(candidate => candidate.id === sectionId);
  expect(section).toBeTruthy();
  const allowed = allowedIds ? new Set(allowedIds) : null;
  const item = section.items.find(candidate => (!allowed || allowed.has(candidate.id)) && candidate.question_ids.length > 0);
  expect(item).toBeTruthy();
  return item;
}

test("Estudar oferece acesso à página filha por cargo", async ({page}) => {
  await page.goto("./#/estudar");
  const entry = page.locator("[data-role-study-entry]");
  await expect(entry).toBeVisible({timeout: 30000});
  await expect(entry).toContainText("Matéria → tópico → questões");
  await expect(entry.locator('a[href*="estudo-por-cargo.html?cargo=202"]')).toBeVisible();
  await expect(entry.locator('a[href*="estudo-por-cargo.html?cargo=400"]')).toBeVisible();
  await expect(page.locator('.desktop-nav [data-role-study-nav]')).toHaveText("Por cargo");
});

test("mobile mostra Por cargo na navegação sem exigir link direto", async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("./#/estudar");
  const navLink = page.locator('.mobile-nav [data-role-study-nav]');
  await expect(navLink).toBeVisible({timeout: 30000});
  await expect(navLink).toContainText("Por cargo");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("página filha usa matérias reais do cargo e navega matéria → tópico → questão", async ({page}) => {
  test.setTimeout(90000);
  await clearState(page);
  const map = await loadMap(page);

  const shell = page.locator("[data-role-study-shell]");
  await expect(shell).toBeVisible({timeout: 30000});
  await expect(shell).toHaveAttribute("data-role-target-code", "202");

  const grid = page.locator("[data-role-subject-grid]");
  await expect(grid).toBeVisible();
  await expect(grid.locator('[data-role-subject="lingua-portuguesa"]')).toContainText("Língua Portuguesa");
  await expect(grid.locator('[data-role-subject="realidade-df-ride"]')).toContainText("Realidade do DF e RIDE");
  await expect(grid.locator('[data-role-subject="lei-organica-df"]')).toContainText("Lei Orgânica do Distrito Federal");
  await expect(grid.locator('[data-role-subject="lei-maria-da-penha"]')).toContainText("Lei Maria da Penha");
  await expect(grid.locator('[data-role-subject="direito-administrativo"]')).toContainText("Direito Administrativo");
  await expect(grid.locator('[data-role-subject="arquivologia"]')).toContainText("Arquivologia");
  await expect(grid.locator('[data-role-subject="administracao-recursos-materiais"]')).toContainText("Administração de Recursos Materiais");
  await expect(grid).not.toContainText("Distrito Federal, Política para Mulheres, Legislação e Primeiros Socorros");

  const item = mappedItem(map, "202-administrativo", ["202-adm-2-1", "202-adm-2-2", "202-adm-2-3"]);
  await grid.locator('[data-role-subject="direito-administrativo"]').click();
  const topics = page.locator("[data-role-topics]");
  await expect(topics).toBeVisible();
  await expect(topics.locator(`[data-role-topic="${item.id}"]`)).toBeVisible();
  await expect(topics.locator(`[data-role-topic="${item.id}"]`)).toContainText(`Ver questões (${item.question_ids.length})`);

  await topics.locator(`[data-role-topic="${item.id}"]`).click();
  const detail = page.locator(`[data-role-topic-detail="${item.id}"]`);
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Questões deste tópico");
  const firstId = item.question_ids[0];
  await expect(detail.locator(`[data-role-question="${firstId}"]`)).toBeVisible();

  await detail.locator(`[data-role-question="${firstId}"] [data-role-run-one]`).click();
  await page.waitForURL(/index\.html#\/resolver/);
  await expect(page.locator(".question-card")).toBeVisible({timeout: 30000});
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.session.v3") || "null"));
  expect(session.material.codigo_cargo).toBe("202");
  expect(session.questionIds).toEqual([firstId]);
  expect(session.material.nome).toContain("Direito Administrativo");
});

test("progresso é global e Administrador 400 mostra suas matérias próprias", async ({page}) => {
  test.setTimeout(90000);
  await clearState(page);
  const map = await loadMap(page);
  const mapped = mappedItem(map, "geral-portugues");
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
  const grid = page.locator("[data-role-subject-grid]");
  await expect(grid.locator('[data-role-subject="administracao-geral-publica"]')).toContainText("Administração Geral e Pública");
  await expect(grid.locator('[data-role-subject="afo"]')).toContainText("Administração Financeira e Orçamentária (AFO)");
  await expect(grid.locator('[data-role-subject="gestao-pessoas"]')).toContainText("Gestão de Pessoas");
  await expect(grid.locator('[data-role-subject="gestao-projetos"]')).toContainText("Gestão de Projetos");
  await expect(grid.locator('[data-role-subject="assistencia-social-suas"]')).toContainText("Assistência Social (SUAS)");
});