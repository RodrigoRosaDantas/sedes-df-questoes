import {test, expect} from "@playwright/test";

test("PWA abre a Home offline e resolve JSON com ou sem query pela mesma chave", async ({page, context}) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});

  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) throw new Error("Service worker indisponível no navegador de teste.");
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, {once: true}));
    }
  });

  await context.setOffline(true);
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-ux16-track]")).toHaveCount(4);

  const probes = await page.evaluate(async () => {
    const urls = [
      "./data/release/catalogo.json",
      "./data/release/catalogo.json?release=legacy-probe",
      "./data/release/study-index.json",
      "./data/release/study-index.json?release=legacy-probe",
      "./data/release/release-meta.json",
      "./data/release/release-meta.json?release=legacy-probe",
    ];
    return Promise.all(urls.map(async url => {
      try {
        const response = await fetch(url, {cache: "no-store"});
        return {url, ok: response.ok, status: response.status};
      } catch (error) {
        return {url, ok: false, error: String(error)};
      }
    }));
  });
  expect(probes.every(item => item.ok), JSON.stringify(probes)).toBeTruthy();
  expect(errors).toEqual([]);
});
