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
