import {test, expect} from "@playwright/test";

const routes = [
  ["inicio", "#/inicio"],
  ["estudar", "#/estudar"],
  ["revisar", "#/revisar"],
  ["desempenho", "#/desempenho"],
  ["configuracoes", "#/perfil/configuracoes"],
];

async function expectNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document, `${label}: document overflow`).toBeLessThanOrEqual(dimensions.viewport + 2);
  expect(dimensions.body, `${label}: body overflow`).toBeLessThanOrEqual(dimensions.viewport + 2);
}

test("rotas essenciais permanecem utilizáveis no iPad em retrato e paisagem", async ({page}) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  for (const viewport of [{width: 834, height: 1194}, {width: 1366, height: 1024}]) {
    await page.setViewportSize(viewport);
    for (const [label, hash] of routes) {
      await page.goto(`./${hash}`, {waitUntil: "domcontentloaded"});
      await expect(page.locator("#app h1").first()).toBeVisible({timeout: 30000});
      await expectNoHorizontalOverflow(page, `${label} ${viewport.width}x${viewport.height}`);
    }
  }

  expect(pageErrors, `Erros JavaScript nas rotas essenciais: ${pageErrors.join(" | ")}`).toEqual([]);
});

test("Configurações de Dados refletem local-first + nuvem e expõem reset seguro", async ({page}) => {
  await page.setViewportSize({width: 834, height: 1194});
  await page.goto("./#/perfil/configuracoes", {waitUntil: "domcontentloaded"});
  await expect(page.locator('[data-ux15-settings-tab="dados"]')).toBeVisible({timeout: 30000});
  await page.locator('[data-ux15-settings-tab="dados"]').click();
  const settings = page.locator('[data-ux15-settings-page][data-ux15-tab="dados"]');
  await expect(settings).toBeVisible();
  await expect(settings.locator(".ux15-settings-intro")).toContainText("funciona localmente neste navegador");
  await expect(settings.locator(".ux15-settings-intro")).toContainText("acompanha sua conta entre aparelhos");
  await expect(settings.locator("[data-performance-reset-card]")).toBeVisible();
  await expectNoHorizontalOverflow(page, "configurações dados iPad retrato");
});

test("ativos críticos de estudo e recuperação são servidos pelo pacote público", async ({request}) => {
  for (const relative of [
    "assets/app-v4.js?v=13",
    "assets/navigation-v2-15.js?v=1",
    "assets/resolver-context-v2-19.js?v=2",
    "assets/cloud-progress-v1.js?v=1",
    "assets/performance-reset-v1.js?v=1",
    "service-worker.js",
    "data/release/catalogo.json",
    "data/release/study-index.json",
    "data/release/release-meta.json",
  ]) {
    const response = await request.get(`./${relative}`);
    expect(response.ok(), `Ativo crítico indisponível: ${relative}`).toBeTruthy();
  }
});
