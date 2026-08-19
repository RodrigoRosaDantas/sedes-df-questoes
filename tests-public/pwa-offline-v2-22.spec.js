import {test, expect} from "@playwright/test";

test("Pages permanece utilizável offline com JSONs canônicos e controles de recuperação", async ({page, context}) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});

  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) throw new Error("Service worker indisponível.");
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, {once: true}));
    }
  });

  await context.setOffline(true);
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-ux16-track]")).toHaveCount(4);

  const ok = await page.evaluate(async () => {
    const urls = [
      "./data/release/catalogo.json",
      "./data/release/catalogo.json?release=legacy-probe",
      "./data/release/study-index.json",
      "./data/release/study-index.json?release=legacy-probe",
      "./data/release/release-meta.json",
      "./data/release/release-meta.json?release=legacy-probe",
      "./assets/cloud-progress-v1.js?v=1",
      "./assets/performance-reset-v1.js?v=1",
    ];
    const responses = await Promise.all(urls.map(url => fetch(url, {cache: "no-store"})));
    return responses.every(response => response.ok);
  });
  expect(ok).toBeTruthy();

  await page.goto("./#/perfil/configuracoes", {waitUntil: "domcontentloaded"});
  await expect(page.locator('[data-ux15-settings-tab="dados"]')).toBeVisible({timeout: 30000});
  await page.locator('[data-ux15-settings-tab="dados"]').click();
  await expect(page.locator("[data-performance-reset-card]")).toBeVisible();
  await expect(page.locator("[data-cloud-progress]")).toHaveAttribute("data-cloud-state", "offline");
  expect(errors).toEqual([]);
});
