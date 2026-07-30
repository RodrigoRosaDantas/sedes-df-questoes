import fs from "node:fs/promises";
import {test, expect} from "@playwright/test";

const FIXED_NOW = Date.parse("2026-07-30T15:00:00.000Z");

async function seedProfile(page) {
  await page.addInitScript(({now}) => { Date.now = () => now; }, {now: FIXED_NOW});
  await page.goto("/");
  await page.evaluate(({now}) => {
    localStorage.setItem("sedes.questoes.activeProfile.v3", "rodrigo");
    localStorage.setItem("sedes.questoes.profiles.v3", JSON.stringify([
      {id: "rodrigo", name: "Rodrigo", roles: ["202", "400"]},
      {id: "amanda", name: "Amanda", roles: ["202", "403"]},
      {id: "andressa", name: "Andressa", roles: ["200", "405"]},
    ]));
    localStorage.setItem("sedes.questoes.rodrigo.history.v3", JSON.stringify([
      {
        id: "attempt-night",
        materialName: "Treino noturno",
        materialId: "treino-noturno",
        mode: "treino",
        finishedAt: "2026-07-30T02:30:00.000Z",
        correct: 1,
        elapsed: 120,
        answeredQuestionIds: ["QN"],
        questionResults: [{id: "QN", answer: "C", correct: true, discipline: "Português", assunto: "Interpretação"}],
      },
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
      {
        id: "attempt-old",
        materialName: "Treino antigo",
        materialId: "treino-antigo",
        mode: "treino",
        finishedAt: "2026-05-15T15:00:00.000Z",
        correct: 1,
        elapsed: 180,
        answeredQuestionIds: ["QO"],
        questionResults: [{id: "QO", answer: "A", correct: true, discipline: "Direito", assunto: "Princípios"}],
      },
    ]));
    localStorage.setItem("sedes.questoes.rodrigo.errorReasons.v1", JSON.stringify({
      Q3: {reason: "Confundi a regra ou a lei", updatedAt: new Date(now - 1000).toISOString()},
      Q5: {reason: "Distração", updatedAt: new Date(now - 60 * 86400000).toISOString()},
    }));
    localStorage.setItem("sedes.questoes.rodrigo.notes.v1", JSON.stringify({Q3: {text: "Revisar planejamento", updatedAt: new Date(now).toISOString()}}));
    localStorage.setItem("sedes.questoes.rodrigo.reviewSchedule.v1", JSON.stringify({Q3: {id: "Q3", stage: 0, dueAt: now, mastered: false}}));
    localStorage.setItem("sedes.questoes.rodrigo.reviewProcessedAttempts.v1", JSON.stringify(["attempt-current"]));
  }, {now: FIXED_NOW});
}

test("relatório respeita fuso, períodos e conteúdo exportado", async ({page}) => {
  await seedProfile(page);
  await page.goto("/#/desempenho");

  const report = page.locator("[data-progress-reports]");
  await expect(page.getByRole("heading", {name: "Relatório de Rodrigo"})).toBeVisible();
  await expect(report.locator(".report-summary > div").first().locator("strong")).toHaveText("7");
  await expect(report).toContainText("Confundi a regra ou a lei");
  await expect(report).not.toContainText("Distração");
  await expect(report.locator('.report-bar-column[title="29/07: 1"]')).toBeVisible();

  await page.getByRole("button", {name: "30 dias"}).click();
  await expect(page.getByRole("button", {name: "30 dias"})).toHaveClass(/primary/);
  await expect(report.locator(".report-summary > div").first().locator("strong")).toHaveText("11");

  await page.getByRole("button", {name: "Tudo"}).click();
  await expect(page.getByRole("heading", {name: "Questões por mês"})).toBeVisible();
  await expect(report.locator(".report-summary > div").first().locator("strong")).toHaveText("12");
  await expect(report).toContainText("mai/26");
  await expect(report).toContainText("jul/26");
  await expect(report).toContainText("Distração");

  const reportDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", {name: "Exportar relatório CSV"}).click();
  const reportDownload = await reportDownloadPromise;
  const reportPath = await reportDownload.path();
  const reportContent = await fs.readFile(reportPath, "utf8");
  expect(reportContent).toContain("Questões por mês");
  expect(reportContent).toContain("Confundi a regra ou a lei");
  expect(reportContent).toContain("Distração");

  const backupDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", {name: "Backup completo"}).click();
  const backupDownload = await backupDownloadPromise;
  expect(backupDownload.suggestedFilename()).toBe("sedes-backup-completo-rodrigo-2026-07-30.json");
  const backupPath = await backupDownload.path();
  const backup = JSON.parse(await fs.readFile(backupPath, "utf8"));
  expect(backup.schema_version).toBe("2.10");
  expect(backup.app_version).toBe("2.10.1");
  expect(backup.data.notes.Q3.text).toBe("Revisar planejamento");
  expect(backup.data.reviewSchedule.Q3.stage).toBe(0);
  expect(backup.data.reviewProcessedAttempts).toEqual(["attempt-current"]);
});

test("restauração identifica o perfil de origem e substitui todos os dados", async ({page}) => {
  await seedProfile(page);
  await page.goto("/#/desempenho");
  const dialogs = [];
  page.on("dialog", async dialog => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });

  const restoredPayload = {
    schema_version: "2.10",
    app_version: "2.10.1",
    profile: {id: "amanda", name: "Amanda"},
    data: {
      history: [{id: "restored-attempt", finishedAt: "2026-07-30T12:00:00.000Z", answeredQuestionIds: []}],
      errors: {QX: {id: "QX", open: true}},
      marked: {QY: {id: "QY"}},
      session: null,
      notes: {QX: {text: "Anotação restaurada"}},
      errorReasons: {QX: {reason: "Distração"}},
      reviewSchedule: {QX: {id: "QX", stage: 7}},
      reviewProcessedAttempts: ["restored-attempt"],
    },
  };

  const nextLoad = page.waitForEvent("load");
  await page.locator("[data-import-complete]").setInputFiles({
    name: "backup-amanda.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(restoredPayload)),
  });
  await nextLoad;

  expect(dialogs[0]).toContain("Amanda");
  expect(dialogs[0]).toContain("Rodrigo");
  expect(dialogs.at(-1)).toContain("restaurado com sucesso");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.history.v3"))[0].id)).toBe("restored-attempt");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.notes.v1")).QX.text)).toBe("Anotação restaurada");
});

test("falha de armazenamento restaura o estado anterior", async ({page}) => {
  await seedProfile(page);
  await page.goto("/#/desempenho");
  const dialogs = [];
  page.on("dialog", async dialog => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let failed = false;
    Storage.prototype.setItem = function(key, value) {
      if (!failed && key.includes(".marked.v3")) {
        failed = true;
        throw new DOMException("Quota simulada", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });

  const payload = {
    schema_version: "2.10",
    profile: {id: "amanda", name: "Amanda"},
    data: {
      history: [{id: "should-not-persist"}],
      errors: {}, marked: {}, session: null, notes: {}, errorReasons: {}, reviewSchedule: {}, reviewProcessedAttempts: [],
    },
  };
  await page.locator("[data-import-complete]").setInputFiles({
    name: "backup-falha.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });

  await expect.poll(() => dialogs.some(message => message.includes("não pôde ser restaurado"))).toBeTruthy();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.history.v3"))[0].id)).toBe("attempt-night");
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
  expect(build.version).toBe("2.10.1");
  expect(build.data_release_version).toBe(catalog.release_version);
  expect(build.catalog_schema_version).toBe(catalog.schema_version);
  expect(build.questions).toBe(catalog.summary.questoes);
  expect(build.materials).toBe(catalog.summary.materiais);
});
