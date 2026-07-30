import {test, expect} from "@playwright/test";

const expectedSha = String(process.env.EXPECTED_SHA || "").trim();

test("GitHub Pages serve a release completa e executável", async ({page, request}) => {
  const nonce = Date.now();
  const [buildResponse, catalogResponse, workerResponse, reportsResponse] = await Promise.all([
    request.get(`/data/release/build-info.json?verify=${nonce}`),
    request.get(`/data/release/catalogo.json?verify=${nonce}`),
    request.get(`/service-worker.js?verify=${nonce}`),
    request.get(`/assets/reports-v2-10.js?verify=${nonce}`),
  ]);
  for (const response of [buildResponse, catalogResponse, workerResponse, reportsResponse]) expect(response.ok()).toBeTruthy();

  const build = await buildResponse.json();
  const catalog = await catalogResponse.json();
  expect(build.version).toBe("2.11.1");
  expect(build.builder).toBe("copy-public-v2-11-1");
  if (expectedSha) expect(build.source_sha).toBe(expectedSha);
  expect(build.questions).toBe(690);
  expect(build.materials).toBe(36);
  expect(Object.keys(catalog.question_index || {})).toHaveLength(690);
  expect(catalog.materials || []).toHaveLength(36);
  expect(await workerResponse.text()).toContain('sedes-questoes-v2-11-1');
  expect(await reportsResponse.text()).toContain("restoreBackupTransaction");

  await page.goto(`/?verify=${nonce}#/inicio`, {waitUntil: "networkidle"});
  await expect(page.locator(".error-state")).toHaveCount(0);
  await expect(page.locator("#app h1")).toBeVisible();
  await expect(page.locator("[data-smart-today]")).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "./manifest.webmanifest");

  const workerActive = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise(resolve => setTimeout(() => resolve(null), 20000)),
    ]);
    return Boolean(registration?.active);
  });
  expect(workerActive).toBeTruthy();

  await page.locator('[data-route="estudar"]').first().click();
  await expect(page.locator('[data-study-view="materias"]')).toBeVisible();
  await expect(page.locator('[data-study-view="simulados"]')).toBeVisible();
  await expect(page.locator('[data-study-view="provas"]')).toBeVisible();

  await page.locator('[data-study-view="provas"]').click();
  const examCard = page.locator(".material-card").filter({hasText: "Gestor em Políticas Públicas"});
  await expect(examCard).toBeVisible();
  await examCard.locator("[data-open-material]").click();
  await expect(page.locator(".detail-summary")).toContainText("120");

  await page.goto("/#/estudar", {waitUntil: "networkidle"});
  await page.locator('[data-study-view="materias"]').click();
  const firstDiscipline = page.locator("[data-open-discipline]").first();
  await expect(firstDiscipline).toBeVisible();
  await firstDiscipline.click();
  await expect(page.locator(".topic-builder")).toBeVisible();
  await expect(page.locator("[data-select-weak-topics]")).toBeVisible();

  await page.goto("/#/desempenho", {waitUntil: "networkidle"});
  await expect(page.locator("[data-progress-reports]")).toBeVisible();
  await expect(page.getByRole("button", {name: "Backup completo"})).toBeVisible();
});
