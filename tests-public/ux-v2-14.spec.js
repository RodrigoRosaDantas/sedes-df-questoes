import {test, expect} from "@playwright/test";

test("publica a experiência de estudo v2.14 com índice textual íntegro", async ({page, request}) => {
  await page.goto("/#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux-today]").first()).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-ux-tech-status]")).toBeVisible();
  await page.goto("/#/estudar", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux-study-launcher]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-ux-question-search]")).toBeVisible();

  const [searchResponse, catalogResponse] = await Promise.all([
    request.get("/data/release/question-search-index.json"),
    request.get("/data/release/catalogo.json"),
  ]);
  expect(searchResponse.ok()).toBeTruthy();
  expect(catalogResponse.ok()).toBeTruthy();
  const payload = await searchResponse.json();
  const catalog = await catalogResponse.json();
  const expectedIds = Object.keys(catalog.question_index || {}).sort();
  const indexedIds = (payload.items || []).map(item => item.id).sort();
  expect(payload.questions).toBeGreaterThan(3000);
  expect(payload.items.length).toBe(payload.questions);
  expect(payload.questions).toBe(expectedIds.length);
  expect(indexedIds).toEqual(expectedIds);
});
