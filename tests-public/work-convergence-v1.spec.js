import {test, expect} from "@playwright/test";

test("preferências do perfil são restauradas no estudo personalizado", async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem("sedes.questoes.activeProfile.v3", "rodrigo");
    localStorage.setItem("sedes.questoes.rodrigo.preferences.v1", JSON.stringify({
      count: "30",
      mode: "prova",
      scope: "marked",
      theme: "light",
      lastCriteria: {count: "30", mode: "prova", scope: "marked"},
    }));
  });
  await page.goto("./#/estudar", {waitUntil: "domcontentloaded"});
  const launcher = page.locator("[data-ux-study-launcher]");
  await expect(launcher).toBeVisible({timeout: 30000});
  await launcher.locator("[data-ux-toggle-advanced]").click();
  await expect(launcher.locator("[data-ux-filter-count]")).toHaveValue("30");
  await expect(launcher.locator("[data-ux-filter-mode]")).toHaveValue("prova");
  await expect(launcher.locator("[data-ux-filter-scope]")).toHaveValue("marked");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("central de comando do Work é visível, completa, legível e responsiva", async ({page}) => {
  await page.addInitScript(() => localStorage.setItem("sedes.questoes.activeProfile.v3", "rodrigo"));
  await page.setViewportSize({width: 1280, height: 900});
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  const center = page.locator("[data-work-command-center]");
  await expect(center).toBeVisible({timeout: 30000});
  await expect(center.locator(".work-command-action")).toHaveCount(6);
  await expect(center.locator("[data-work-now]")).toContainText(/Faça agora/i);
  await expect(center.locator("[data-work-bank]")).toContainText(/Banco de questões/i);
  await expect(center.locator("[data-work-review]")).toContainText(/Revisões/i);
  await expect(center.locator("[data-work-errors]")).toContainText(/Caderno de erros/i);
  await expect(center.locator("[data-work-performance]")).toContainText(/Desempenho/i);
  await expect(center.locator("[data-work-search]")).toContainText(/Buscar questões/i);
  await expect(center.locator("[data-work-cloud-state]")).not.toHaveText("");
  await expect(center.locator(".work-command-grid")).toHaveCSS("display", "grid");

  const desktopFontSizes = await center.locator(".work-command-action b, .work-command-action small, .work-data-separation strong").evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize)));
  expect(Math.min(...desktopFontSizes)).toBeGreaterThanOrEqual(12);
  const dataLabelSizes = await center.locator(".work-data-separation small").evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize)));
  expect(Math.min(...dataLabelSizes)).toBeGreaterThanOrEqual(11);

  await page.setViewportSize({width: 390, height: 844});
  await expect(center).toBeVisible();
  const columns = await center.locator(".work-command-grid").evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(2);
  const mobileFontSizes = await center.locator(".work-command-action b, .work-command-action small, .work-data-separation strong").evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize)));
  expect(Math.min(...mobileFontSizes)).toBeGreaterThanOrEqual(11.5);
  const buttonHeights = await center.locator(".work-command-action").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  expect(Math.min(...buttonHeights)).toBeGreaterThanOrEqual(44);
});

test("relato de problema é interno e não abre GitHub Issue", async ({request}) => {
  const response = await request.get("./assets/report-v2-13.js?v=2", {headers: {"cache-control": "no-cache, no-store"}});
  expect(response.ok()).toBeTruthy();
  const source = await response.text();
  expect(source).toContain("questionReports.v1");
  expect(source).toContain("Enviar relato para revisão");
  expect(source).not.toContain("issues/new");
});

test("modelo normalizado fecha com o catálogo publicado", async ({request}) => {
  const [catalogResponse, modelResponse] = await Promise.all([
    request.get("./data/release/catalogo.json", {headers: {"cache-control": "no-cache, no-store"}}),
    request.get("./data/release/content-model-v1.json", {headers: {"cache-control": "no-cache, no-store"}}),
  ]);
  expect(catalogResponse.ok()).toBeTruthy();
  expect(modelResponse.ok()).toBeTruthy();
  const catalog = await catalogResponse.json();
  const model = await modelResponse.json();
  expect(model.schema).toBe(1);
  expect(model.material_count).toBe((catalog.materials || []).length);
  expect(model.question_count).toBe(Object.keys(catalog.question_index || {}).length);
  expect(model.materials).toHaveLength(model.material_count);
  expect(model.questions).toHaveLength(model.question_count);
});
