import {test, expect} from "@playwright/test";

test("exibe relatório periódico e gera backup completo", async ({page}) => {
  const now = Date.now();
  await page.addInitScript(({now}) => {
    localStorage.setItem("sedes.questoes.activeProfile.v3", "rodrigo");
    localStorage.setItem("sedes.questoes.profiles.v3", JSON.stringify([
      {id: "rodrigo", name: "Rodrigo", roles: ["202", "400"]},
      {id: "amanda", name: "Amanda", roles: ["202", "403"]},
      {id: "andressa", name: "Andressa", roles: ["200", "405"]},
    ]));
    localStorage.setItem("sedes.questoes.rodrigo.history.v3", JSON.stringify([
      {
        id: "attempt-current",
        materialName: "Treino recente",
        materialId: "treino-recente",
        mode: "treino",
        finishedAt: new Date(now - 2 * 86400000).toISOString(),
        correct: 4,
        elapsed: 720,
        answeredQuestionIds: ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"],
        questionResults: [
          {id: "Q1", answer: "A", correct: true, discipline: "Português", assunto: "Interpretação"},
          {id: "Q2", answer: "B", correct: true, discipline: "Português", assunto: "Interpretação"},
          {id: "Q3", answer: "C", correct: false, discipline: "Administração", assunto: "Planejamento"},
          {id: "Q4", answer: "D", correct: true, discipline: "Administração", assunto: "Planejamento"},
          {id: "Q5", answer: "E", correct: false, discipline: "Administração", assunto: "Organização"},
          {id: "Q6", answer: "A", correct: true, discipline: "Português", assunto: "Sintaxe"},
        ],
      },
      {
        id: "attempt-previous",
        materialName: "Treino anterior",
        materialId: "treino-anterior",
        mode: "treino",
        finishedAt: new Date(now - 10 * 86400000).toISOString(),
        correct: 2,
        elapsed: 500,
        answeredQuestionIds: ["Q7", "Q8", "Q9", "Q10"],
        questionResults: [
          {id: "Q7", answer: "A", correct: true, discipline: "Português", assunto: "Sintaxe"},
          {id: "Q8", answer: "B", correct: false, discipline: "Administração", assunto: "Planejamento"},
          {id: "Q9", answer: "C", correct: true, discipline: "Português", assunto: "Interpretação"},
          {id: "Q10", answer: "D", correct: false, discipline: "Administração", assunto: "Organização"},
        ],
      },
    ]));
    localStorage.setItem("sedes.questoes.rodrigo.errorReasons.v1", JSON.stringify({
      Q3: {reason: "Confundi a regra ou a lei", updatedAt: new Date(now).toISOString()},
      Q5: {reason: "Distração", updatedAt: new Date(now).toISOString()},
    }));
    localStorage.setItem("sedes.questoes.rodrigo.notes.v1", JSON.stringify({Q3: {text: "Revisar planejamento", updatedAt: new Date(now).toISOString()}}));
    localStorage.setItem("sedes.questoes.rodrigo.reviewSchedule.v1", JSON.stringify({Q3: {id: "Q3", stage: 0, dueAt: now, mastered: false}}));
  }, {now});

  await page.goto("/#/desempenho");
  await expect(page.getByRole("heading", {name: "Relatório de Rodrigo"})).toBeVisible();
  await expect(page.locator("[data-progress-reports]")).toContainText("6");
  await expect(page.locator("[data-progress-reports]")).toContainText("Confundi a regra ou a lei");

  await page.getByRole("button", {name: "30 dias"}).click();
  await expect(page.getByRole("button", {name: "30 dias"})).toHaveClass(/primary/);
  await expect(page.locator("[data-progress-reports]")).toContainText("10");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", {name: "Backup completo"}).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^sedes-backup-completo-rodrigo-\d{4}-\d{2}-\d{2}\.json$/);
});

test("publica build-info consistente com o catálogo", async ({request}) => {
  const [catalogResponse, buildResponse] = await Promise.all([
    request.get("/data/release/catalogo.json"),
    request.get("/data/release/build-info.json"),
  ]);
  expect(catalogResponse.ok()).toBeTruthy();
  expect(buildResponse.ok()).toBeTruthy();
  const catalog = await catalogResponse.json();
  const build = await buildResponse.json();
  expect(build.version).toBe("2.10.0");
  expect(build.questions).toBe(catalog.summary.questoes);
  expect(build.materials).toBe(catalog.summary.materiais);
});
