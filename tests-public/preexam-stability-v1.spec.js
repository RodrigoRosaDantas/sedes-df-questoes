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

test("rotas essenciais permanecem utilizáveis no celular e iPad", async ({page}) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  for (const viewport of [
    {width: 390, height: 844},
    {width: 834, height: 1194},
    {width: 1366, height: 1024},
  ]) {
    await page.setViewportSize(viewport);
    for (const [label, hash] of routes) {
      await page.goto(`./${hash}`, {waitUntil: "domcontentloaded"});
      await expect(page.locator("#app h1").first()).toBeVisible({timeout: 30000});
      await expectNoHorizontalOverflow(page, `${label} ${viewport.width}x${viewport.height}`);
    }
  }

  expect(pageErrors, `Erros JavaScript nas rotas essenciais: ${pageErrors.join(" | ")}`).toEqual([]);
});

test("Configurações de Dados descrevem local-first + nuvem sem mensagem legada", async ({page}) => {
  await page.setViewportSize({width: 834, height: 1194});
  await page.goto("./#/perfil/configuracoes", {waitUntil: "domcontentloaded"});
  await expect(page.locator('[data-ux15-settings-tab="dados"]')).toBeVisible({timeout: 30000});
  await page.locator('[data-ux15-settings-tab="dados"]').click();
  const settings = page.locator('[data-ux15-settings-page][data-ux15-tab="dados"]');
  await expect(settings).toBeVisible();
  await expect(settings.locator(".ux15-settings-intro")).toContainText("funciona primeiro neste aparelho");
  await expect(settings.locator(".ux15-settings-intro")).toContainText("acompanha sua conta entre dispositivos");
  await expect(settings).not.toContainText("permanecem armazenados localmente neste navegador");
  await expect(settings).toContainText("Local-first + nuvem");
  await expect(settings.locator("[data-performance-reset-card]")).toBeVisible();
  await expectNoHorizontalOverflow(page, "configurações dados iPad retrato");
});

test("Desempenho usa gestão segura de dados e preserva o cofre de restauração", async ({page}) => {
  await page.goto("./#/desempenho", {waitUntil: "domcontentloaded"});
  await expect(page.locator("#app h1").first()).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-clear-profile]")).toHaveCount(0);
  await expect(page.locator("[data-integrity-manage-data]")).toBeVisible();
  await expect(page.locator("[data-export-profile]").locator("xpath=ancestor::*[contains(@class,'performance-panel')][1]")).toContainText("Backup complementar");
  await expect(page.locator("[data-vault-tools]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-vault-export]")).toBeVisible();
});

test("tema escolhido em Configurações também atualiza a preferência sincronizável", async ({page}) => {
  await page.goto("./#/perfil/configuracoes", {waitUntil: "domcontentloaded"});
  const light = page.locator('[data-ux15-theme="light"]');
  await expect(light).toBeVisible({timeout: 30000});
  await light.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const stored = await page.evaluate(() => {
    const profile = localStorage.getItem("sedes.questoes.activeProfile.v3") || "rodrigo";
    return JSON.parse(localStorage.getItem(`sedes.questoes.${profile}.preferences.v1`) || "{}");
  });
  expect(stored.theme).toBe("light");
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light", {timeout: 30000});
});

test("ativos críticos de estudo e recuperação são servidos pelo pacote público", async ({request}) => {
  for (const relative of [
    "assets/app-v4.js?v=13",
    "assets/navigation-v2-15.js?v=1",
    "assets/resolver-context-v2-19.js?v=2",
    "assets/cloud-progress-v1.js?v=1",
    "assets/performance-reset-v1.js?v=1",
    "assets/product-integrity-v1.js?v=1",
    "assets/vault-v2-13.js?v=1",
    "service-worker.js",
    "data/release/catalogo.json",
    "data/release/study-index.json",
    "data/release/release-meta.json",
  ]) {
    const response = await request.get(`./${relative}`);
    expect(response.ok(), `Ativo crítico indisponível: ${relative}`).toBeTruthy();
  }
});