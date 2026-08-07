import {test, expect} from "@playwright/test";

test("publica a experiência de estudo v2.14", async ({page, request}) => {
  await page.goto("/#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux-today]").first()).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-ux-tech-status]")).toBeVisible();
  await page.goto("/#/estudar", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux-study-launcher]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-ux-question-search]")).toBeVisible();
  const response = await request.get("/data/release/question-search-index.json");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.questions).toBeGreaterThan(3000);
  expect(payload.items.length).toBe(payload.questions);
});
