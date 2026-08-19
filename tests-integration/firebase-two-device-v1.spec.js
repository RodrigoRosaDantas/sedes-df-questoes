import {test, expect} from "@playwright/test";

const SESSION_KEY = "sedes.questoes.rodrigo.session.v3";
const HISTORY_KEY = "sedes.questoes.rodrigo.history.v3";
const ERRORS_KEY = "sedes.questoes.rodrigo.errors.v3";
const MARKED_KEY = "sedes.questoes.rodrigo.marked.v3";
const NOTES_KEY = "sedes.questoes.rodrigo.notes.v1";
const RESET_KEY = "sedes.questoes.rodrigo.performanceReset.v1";
const PASSWORD = "Teste123!";

async function openEmulated(page) {
  await page.goto("./?firebaseEmulator=1#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-cloud-progress]")).toBeVisible({timeout: 30000});
}

async function authenticate(page, email, mode) {
  const cloud = page.locator("[data-cloud-progress]");
  await cloud.click();
  const dialog = page.locator(".cloud-dialog-backdrop");
  await expect(dialog).toBeVisible({timeout: 30000});
  await dialog.locator("[data-cloud-email]").fill(email);
  await dialog.locator("[data-cloud-password]").fill(PASSWORD);
  await dialog.locator(mode === "signup" ? "[data-cloud-signup]" : "[data-cloud-signin]").click();
  await expect(cloud).toHaveAttribute("data-cloud-state", "saved", {timeout: 30000});
}

async function waitAndSync(page) {
  await page.evaluate(async () => {
    for (let attempt = 0; attempt < 150 && window.SEDES_CLOUD_PROGRESS.getState().syncing; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await window.SEDES_CLOUD_PROGRESS.sync();
  });
  await expect(page.locator("[data-cloud-progress]")).toHaveAttribute("data-cloud-state", "saved", {timeout: 30000});
}

async function writeSession(page, device, savedAt) {
  await page.evaluate(async ({key, device, savedAt}) => {
    localStorage.setItem(key, JSON.stringify({
      id: "integration-session",
      materialId: "integration",
      questionIds: ["integration-question"],
      index: 0,
      answers: {},
      device,
      savedAt,
    }));
    await window.SEDES_CLOUD_PROGRESS.sync();
  }, {key: SESSION_KEY, device, savedAt});
  await expect(page.locator("[data-cloud-progress]")).toHaveAttribute("data-cloud-state", "saved", {timeout: 30000});
}

async function readSession(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), SESSION_KEY);
}

async function seedOldPerformance(page) {
  const oldAt = new Date(Date.now() - 86400000).toISOString();
  await page.evaluate(({historyKey, errorsKey, markedKey, notesKey, oldAt}) => {
    localStorage.setItem(historyKey, JSON.stringify([{
      id: "attempt-before-reset",
      materialId: "integration",
      finishedAt: oldAt,
      correct: 0,
      answeredQuestionIds: ["q-old"],
      questionResults: [{id: "q-old", answer: "A", correct: false, materialId: "integration", discipline: "Teste", assunto: "Antes"}],
      answers: {"q-old": "A"},
      questionTimes: {"q-old": 30},
    }]));
    localStorage.setItem(errorsKey, JSON.stringify({"q-old": {id: "q-old", count: 1, open: true, updatedAt: oldAt}}));
    localStorage.setItem(markedKey, JSON.stringify({"q-marked": {id: "q-marked", updatedAt: oldAt}}));
    localStorage.setItem(notesKey, JSON.stringify({"q-note": {text: "preservar", updatedAt: oldAt}}));
  }, {historyKey: HISTORY_KEY, errorsKey: ERRORS_KEY, markedKey: MARKED_KEY, notesKey: NOTES_KEY, oldAt});
  await waitAndSync(page);
}

async function snapshotProgress(page) {
  return page.evaluate(({historyKey, errorsKey, markedKey, notesKey, resetKey}) => ({
    history: JSON.parse(localStorage.getItem(historyKey) || "[]"),
    errors: JSON.parse(localStorage.getItem(errorsKey) || "{}"),
    marked: JSON.parse(localStorage.getItem(markedKey) || "{}"),
    notes: JSON.parse(localStorage.getItem(notesKey) || "{}"),
    reset: JSON.parse(localStorage.getItem(resetKey) || "null"),
  }), {historyKey: HISTORY_KEY, errorsKey: ERRORS_KEY, markedKey: MARKED_KEY, notesKey: NOTES_KEY, resetKey: RESET_KEY});
}

test("mesma conta sincroniza ida e volta entre dois aparelhos e outra conta permanece isolada", async ({browser}) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `sedes-two-device-${suffix}@example.com`;
  const otherEmail = `sedes-isolated-${suffix}@example.com`;

  const contextA = await browser.newContext({serviceWorkers: "block"});
  const contextB = await browser.newContext({serviceWorkers: "block"});
  const contextC = await browser.newContext({serviceWorkers: "block"});
  try {
    const pageA = await contextA.newPage();
    await openEmulated(pageA);
    await authenticate(pageA, email, "signup");
    await writeSession(pageA, "A", "2026-08-15T21:00:00.000Z");

    const pageB = await contextB.newPage();
    await openEmulated(pageB);
    await authenticate(pageB, email, "signin");
    const receivedOnB = await readSession(pageB);
    expect(receivedOnB?.device).toBe("A");

    await writeSession(pageB, "B", "2026-08-15T21:01:00.000Z");
    await waitAndSync(pageA);
    const receivedBackOnA = await readSession(pageA);
    expect(receivedBackOnA?.device).toBe("B");

    const pageC = await contextC.newPage();
    await openEmulated(pageC);
    await authenticate(pageC, otherEmail, "signup");
    const isolated = await readSession(pageC);
    expect(isolated).toBeNull();
  } finally {
    await contextA.close();
    await contextB.close();
    await contextC.close();
  }
});

test("reset em um aparelho não pode ser desfeito por histórico antigo de outro aparelho", async ({browser}) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `sedes-reset-two-device-${suffix}@example.com`;
  const contextA = await browser.newContext({serviceWorkers: "block"});
  const contextB = await browser.newContext({serviceWorkers: "block"});
  try {
    const pageA = await contextA.newPage();
    await openEmulated(pageA);
    await authenticate(pageA, email, "signup");
    await seedOldPerformance(pageA);

    const pageB = await contextB.newPage();
    await openEmulated(pageB);
    await authenticate(pageB, email, "signin");
    let before = await snapshotProgress(pageB);
    expect(before.history.map(item => item.id)).toContain("attempt-before-reset");
    expect(before.errors["q-old"]).toBeTruthy();
    expect(before.marked["q-marked"]).toBeTruthy();
    expect(before.notes["q-note"]).toBeTruthy();

    await contextB.setOffline(true);
    const reset = await pageA.evaluate(async () => window.SEDES_PERFORMANCE_RESET.reset());
    expect(Number(reset.resetAt)).toBeGreaterThan(0);
    let afterResetA = await snapshotProgress(pageA);
    expect(afterResetA.history).toEqual([]);
    expect(afterResetA.errors).toEqual({});
    expect(afterResetA.marked["q-marked"]).toBeTruthy();
    expect(afterResetA.notes["q-note"]).toBeTruthy();
    expect(Number(afterResetA.reset?.at)).toBe(Number(reset.resetAt));

    const postResetAt = new Date(Number(reset.resetAt) + 1000).toISOString();
    await pageA.evaluate(({historyKey, postResetAt}) => {
      localStorage.setItem(historyKey, JSON.stringify([{
        id: "attempt-after-reset",
        materialId: "integration",
        finishedAt: postResetAt,
        correct: 1,
        answeredQuestionIds: ["q-new"],
        questionResults: [{id: "q-new", answer: "B", correct: true, materialId: "integration", discipline: "Teste", assunto: "Depois"}],
        answers: {"q-new": "B"},
        questionTimes: {"q-new": 20},
      }]));
    }, {historyKey: HISTORY_KEY, postResetAt});
    await waitAndSync(pageA);

    await contextB.setOffline(false);
    await waitAndSync(pageB);
    const afterB = await snapshotProgress(pageB);
    expect(afterB.history.map(item => item.id)).toEqual(["attempt-after-reset"]);
    expect(afterB.errors).toEqual({});
    expect(afterB.marked["q-marked"]).toBeTruthy();
    expect(afterB.notes["q-note"]).toBeTruthy();
    expect(Number(afterB.reset?.at)).toBe(Number(reset.resetAt));

    await waitAndSync(pageA);
    const finalA = await snapshotProgress(pageA);
    expect(finalA.history.map(item => item.id)).toEqual(["attempt-after-reset"]);
    expect(finalA.errors).toEqual({});
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("troca de perfil nas Configurações respeita e atualiza o vínculo da conta autenticada", async ({browser}) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `sedes-profile-binding-${suffix}@example.com`;
  const context = await browser.newContext({serviceWorkers: "block"});
  try {
    const page = await context.newPage();
    await openEmulated(page);
    await authenticate(page, email, "signup");
    await expect.poll(() => page.evaluate(() => window.SEDES_WORK_CONVERGENCE?.getAccountState?.().boundProfile || null), {timeout: 30000}).toBe("rodrigo");

    await page.goto("./?firebaseEmulator=1#/perfil/configuracoes", {waitUntil: "domcontentloaded"});
    const amanda = page.locator('[data-ux15-profile="amanda"]');
    await expect(amanda).toBeVisible({timeout: 30000});
    await amanda.click();

    const dialog = page.locator("[data-work-account-profile-dialog]");
    await expect(dialog).toBeVisible({timeout: 30000});
    await expect(dialog.locator("[data-work-account-profile]")).toHaveValue("amanda");
    await dialog.locator("[data-work-account-save]").evaluate(button => button.click());

    await expect.poll(() => page.evaluate(() => localStorage.getItem("sedes.questoes.activeProfile.v3")), {timeout: 30000}).toBe("amanda");
    await expect.poll(() => page.evaluate(() => window.SEDES_WORK_CONVERGENCE?.getAccountState?.().boundProfile || null), {timeout: 30000}).toBe("amanda");

    await page.reload({waitUntil: "domcontentloaded"});
    await expect.poll(() => page.evaluate(() => localStorage.getItem("sedes.questoes.activeProfile.v3")), {timeout: 30000}).toBe("amanda");
    await expect.poll(() => page.evaluate(() => window.SEDES_WORK_CONVERGENCE?.getAccountState?.().boundProfile || null), {timeout: 30000}).toBe("amanda");
  } finally {
    await context.close();
  }
});

test("Estudo por Cargo aberto diretamente restaura o progresso da conta", async ({browser}) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `sedes-role-direct-${suffix}@example.com`;
  const context = await browser.newContext({serviceWorkers: "block"});
  try {
    const page = await context.newPage();
    await openEmulated(page);
    await authenticate(page, email, "signup");
    const finishedAt = new Date().toISOString();
    await page.evaluate(async ({historyKey, finishedAt}) => {
      localStorage.setItem(historyKey, JSON.stringify([{
        id: "attempt-role-direct-cloud",
        materialId: "integration-role",
        materialName: "Integração por cargo",
        mode: "treino",
        finishedAt,
        total: 1,
        answered: 1,
        correct: 1,
        wrong: 0,
        blank: 0,
        percent: 100,
        accuracy: 100,
        answeredQuestionIds: ["q-role-direct"],
        questionResults: [{id: "q-role-direct", answer: "A", correct: true, materialId: "integration-role", discipline: "Teste", assunto: "Direto"}],
        answers: {"q-role-direct": "A"},
        questionTimes: {"q-role-direct": 12},
      }]));
      await window.SEDES_CLOUD_PROGRESS.sync();
    }, {historyKey: HISTORY_KEY, finishedAt});
    await expect(page.locator("[data-cloud-progress]")).toHaveAttribute("data-cloud-state", "saved", {timeout: 30000});

    await page.evaluate(historyKey => localStorage.removeItem(historyKey), HISTORY_KEY);
    await page.goto("./estudo-por-cargo.html?firebaseEmulator=1&cargo=202", {waitUntil: "domcontentloaded"});
    await expect(page.locator("body[data-estudo-por-cargo-page]")).toBeVisible({timeout: 30000});
    await expect(page.locator("[data-cloud-progress]")).toBeVisible({timeout: 30000});
    await expect(page.locator("[data-cloud-progress]")).toHaveAttribute("data-cloud-state", "saved", {timeout: 30000});
    await expect.poll(async () => page.evaluate(historyKey => {
      const history = JSON.parse(localStorage.getItem(historyKey) || "[]");
      return history.some(item => item.id === "attempt-role-direct-cloud");
    }, HISTORY_KEY), {timeout: 30000}).toBe(true);
    await expect.poll(() => page.evaluate(() => window.SEDES_WORK_CONVERGENCE?.getAccountState?.().boundProfile || null), {timeout: 30000}).toBe("rodrigo");
  } finally {
    await context.close();
  }
});