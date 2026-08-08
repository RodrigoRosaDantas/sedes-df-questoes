import {test, expect} from "@playwright/test";

const clean = value => String(value ?? "").trim();

async function openHome(page) {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-ux16-track]")).toHaveCount(4, {timeout: 30000});
}

test("Estudo de hoje mostra quatro trilhas e prioriza provas na primeira visita", async ({page}) => {
  await page.addInitScript(() => localStorage.removeItem("sedes.questoes.rodrigo.homeStudyToday.v2"));
  await openHome(page);

  const ids = await page.locator("[data-ux16-track]").evaluateAll(nodes => nodes.map(node => node.dataset.ux16Track));
  expect(ids).toEqual(["prova-202", "prova-400", "simulado-202", "simulado-400"]);

  await expect(page.locator('[data-ux16-track="prova-202"] input')).toBeChecked();
  await expect(page.locator('[data-ux16-track="prova-400"] input')).toBeChecked();
  await expect(page.locator('[data-ux16-track="simulado-202"] input')).not.toBeChecked();
  await expect(page.locator('[data-ux16-track="simulado-400"] input')).not.toBeChecked();
  await expect(page.getByRole("button", {name: "Escolher estudo de hoje"})).toBeVisible();

  for (const id of ids) {
    const count = Number(clean(await page.locator(`[data-ux16-track="${id}"] .ux16-track-stats b`).textContent()).replace(/\D/g, ""));
    expect(count, `${id} deve possuir questões elegíveis`).toBeGreaterThan(0);
  }
});

test("seleção do Estudo de hoje fica salva por perfil", async ({page}) => {
  await page.addInitScript(() => localStorage.removeItem("sedes.questoes.rodrigo.homeStudyToday.v2"));
  await openHome(page);
  await page.locator('[data-ux16-track="prova-202"]').click();
  await page.locator('[data-ux16-track="prova-400"]').click();
  await page.locator('[data-ux16-track="simulado-202"]').click();
  await expect(page.locator("[data-ux16-summary]")).toContainText("1 opção");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.homeStudyToday.v2")))).toEqual(["simulado-202"]);

  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator('[data-ux16-track="simulado-202"] input')).toBeChecked({timeout: 30000});
  await expect(page.locator('[data-ux16-track="prova-202"] input')).not.toBeChecked();
});

test("Provas 202 cria sessão apenas com questões oriundas de provas", async ({page, request}) => {
  await page.addInitScript(() => {
    localStorage.removeItem("sedes.questoes.rodrigo.session.v3");
    localStorage.setItem("sedes.questoes.rodrigo.homeStudyToday.v2", JSON.stringify(["prova-202"]));
  });
  await openHome(page);
  const catalogResponse = await request.get("./data/release/catalogo.json");
  expect(catalogResponse.ok()).toBeTruthy();
  const catalog = await catalogResponse.json();
  const materialById = new Map((catalog.materials || []).map(item => [String(item.id), item]));

  await page.locator("[data-ux16-start]").click();
  await page.waitForURL(/#\/resolver/, {timeout: 30000});
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.session.v3")));
  expect(session).toBeTruthy();
  expect(session.questionIds.length).toBeGreaterThan(0);
  expect(session.questionIds.length).toBeLessThanOrEqual(25);
  expect(session.material.codigo_cargo).toBe("202");
  expect(session.material.nome).toContain("Provas 202");

  for (const id of session.questionIds) {
    const raw = catalog.question_index?.[id];
    const materialId = typeof raw === "string" ? raw : raw?.material_id || raw?.materialId || raw?.material || raw?.id_material;
    const material = materialById.get(String(materialId || ""));
    expect(material, `material de ${id}`).toBeTruthy();
    expect(clean(material.tipo_material).toLowerCase(), `${id} precisa vir de prova`).toBe("prova");
  }
});

test("Home v2.16 não gera overflow horizontal no celular", async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await openHome(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator("[data-ux16-track]")).toHaveCount(4);
  const first = page.locator("[data-ux16-track]").first();
  await expect(first).toBeVisible();
});
