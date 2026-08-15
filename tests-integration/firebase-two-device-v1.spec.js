import {test, expect} from "@playwright/test";

const SESSION_KEY = "sedes.questoes.rodrigo.session.v3";
const PASSWORD = "Teste123!";

async function openEmulated(page) {
  await page.goto("./?firebaseEmulator=1#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-cloud-progress]")).toBeVisible({timeout: 30000});
}

async function authenticate(page, email, mode) {
  const cloud = page.locator("[data-cloud-progress]");
  await cloud.click();
  const dialog = page.locator(".cloud-dialog-backdrop");
  await expect(dialog).toBeVisible({timeout: 30000});
  await dialog.locator("[data-cloud-email]").fill(email);
  await dialog.locator("[data-cloud-password]").fill(PASSWORD);
  await dialog.locator(mode === "signup" ? "[data-cloud-signup]" : "[data-cloud-signin]").click();
  await expect(cloud).toHaveAttribute("data-cloud-state", "saved", {timeout: 30000});
}

async function writeSession(page, device, savedAt) {
  await page.evaluate(async ({key, device, savedAt}) => {
    localStorage.setItem(key, JSON.stringify({
      id: "integration-session",
      materialId: "integration",
      questionIds: ["integration-question"],
      index: 0,
      answers: {},
      device,
      savedAt,
    }));
    await window.SEDES_CLOUD_PROGRESS.sync();
  }, {key: SESSION_KEY, device, savedAt});
  await expect(page.locator("[data-cloud-progress]")).toHaveAttribute("data-cloud-state", "saved", {timeout: 30000});
}

async function readSession(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), SESSION_KEY);
}

test("mesma conta sincroniza ida e volta entre dois aparelhos e outra conta permanece isolada", async ({browser}) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `sedes-two-device-${suffix}@example.com`;
  const otherEmail = `sedes-isolated-${suffix}@example.com`;

  const contextA = await browser.newContext({serviceWorkers: "block"});
  const contextB = await browser.newContext({serviceWorkers: "block"});
  const contextC = await browser.newContext({serviceWorkers: "block"});
  try {
    const pageA = await contextA.newPage();
    await openEmulated(pageA);
    await authenticate(pageA, email, "signup");
    await writeSession(pageA, "A", "2026-08-15T21:00:00.000Z");

    const pageB = await contextB.newPage();
    await openEmulated(pageB);
    await authenticate(pageB, email, "signin");
    const receivedOnB = await readSession(pageB);
    expect(receivedOnB?.device).toBe("A");

    await writeSession(pageB, "B", "2026-08-15T21:01:00.000Z");
    await pageA.evaluate(() => window.SEDES_CLOUD_PROGRESS.sync());
    await expect(pageA.locator("[data-cloud-progress]")).toHaveAttribute("data-cloud-state", "saved", {timeout: 30000});
    const receivedBackOnA = await readSession(pageA);
    expect(receivedBackOnA?.device).toBe("B");

    const pageC = await contextC.newPage();
    await openEmulated(pageC);
    await authenticate(pageC, otherEmail, "signup");
    const isolated = await readSession(pageC);
    expect(isolated).toBeNull();
  } finally {
    await contextA.close();
    await contextB.close();
    await contextC.close();
  }
});
