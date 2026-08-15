import crypto from "node:crypto";
import {test, expect} from "@playwright/test";

test("controle de nuvem e Central de comando expõem estados coerentes", async ({page}) => {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  const cloudButton = page.locator("[data-cloud-progress]");
  await expect(cloudButton).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-work-command-center]")).toBeVisible({timeout: 30000});

  await cloudButton.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("[data-cloud-email]")).toBeVisible();
  await expect(page.locator("[data-cloud-password]")).toBeVisible();
  await page.locator("[data-cloud-close]").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const progress = page.locator("[data-work-cloud-state]");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("sedes:cloud-status", {detail: {kind: "saving"}})));
  await expect(progress).toHaveText("sincronizando seu progresso");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("sedes:cloud-status", {detail: {kind: "saved", lastSyncAt: Date.now()}})));
  await expect(progress).toHaveText("progresso salvo na conta · agora");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("sedes:cloud-status", {detail: {kind: "error"}})));
  await expect(progress).toHaveText("progresso local; falha ao sincronizar");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("sedes:cloud-status", {detail: {kind: "offline"}})));
  await expect(progress).toHaveText("offline; progresso salvo localmente");
});

test("abertura offline recupera a inicialização da nuvem quando a conexão volta", async ({page}) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("sedes.test.navigatorOnline") == null) sessionStorage.setItem("sedes.test.navigatorOnline", "0");
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => sessionStorage.getItem("sedes.test.navigatorOnline") === "1",
    });
  });
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-cloud-progress]")).toHaveAttribute("data-cloud-state", "offline", {timeout: 30000});

  const reloaded = page.waitForEvent("domcontentloaded", {timeout: 30000});
  await page.evaluate(() => {
    sessionStorage.setItem("sedes.test.navigatorOnline", "1");
    window.setTimeout(() => window.dispatchEvent(new Event("online")), 0);
  });
  await reloaded;

  const navigationType = await page.evaluate(() => performance.getEntriesByType("navigation")[0]?.type || "");
  expect(navigationType).toBe("reload");
  await expect(page.locator("[data-cloud-progress]")).toBeVisible({timeout: 30000});
});

test("release publica hashes SHA-256 das camadas Firebase, Work e reporte", async ({request}) => {
  const releaseResponse = await request.get("./data/release/release-meta.json?cloud-audit=1");
  const buildResponse = await request.get("./data/release/build-info.json?cloud-audit=1");
  expect(releaseResponse.ok()).toBeTruthy();
  expect(buildResponse.ok()).toBeTruthy();
  const release = await releaseResponse.json();
  const build = await buildResponse.json();
  const targets = {
    platform_cloud_progress_js: "assets/cloud-progress-v1.js",
    platform_cloud_progress_css: "assets/cloud-progress-v1.css",
    platform_work_command_center_js: "assets/work-command-center-v1.js",
    platform_work_convergence_js: "assets/work-convergence-v1.js",
    platform_work_convergence_css: "assets/work-convergence-v1.css",
    platform_question_report_js: "assets/report-v2-13.js",
  };

  for (const [key, relative] of Object.entries(targets)) {
    const response = await request.get(`./${relative}?cloud-audit=1`);
    expect(response.ok(), relative).toBeTruthy();
    const digest = crypto.createHash("sha256").update(await response.body()).digest("hex");
    expect(release.source_files_sha256?.[key], `release ${key}`).toBe(digest);
    expect(build.source_files_sha256?.[key], `build ${key}`).toBe(digest);
  }
  const protectedFiles = Object.keys(targets).length;
  expect(release.cloud_progress_provenance?.files).toBe(protectedFiles);
  expect(build.cloud_progress_provenance?.files).toBe(protectedFiles);
});