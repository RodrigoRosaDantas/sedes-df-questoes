import crypto from "node:crypto";
import fs from "node:fs";
import {test, expect} from "@playwright/test";

const clean = value => String(value ?? "").trim();

test("release publica fila, PDF fiel e IDs estáveis com proveniência", async ({request}) => {
  const metaResponse = await request.get("./data/release/release-meta.json?audit-hardening=1");
  expect(metaResponse.ok()).toBeTruthy();
  const meta = await metaResponse.json();
  const targets = {
    platform_report_queue_js: "assets/question-report-queue-v2.js",
    platform_pdf_fidelity_js: "assets/pdf-fidelity-v2.js",
    platform_cloud_progress_js_v2audit: "assets/cloud-progress-v1.js",
  };
  for (const [key, relative] of Object.entries(targets)) {
    const response = await request.get(`./${relative}?audit-hardening=1`, {headers: {"cache-control": "no-cache, no-store"}});
    expect(response.ok(), relative).toBeTruthy();
    const body = await response.body();
    const digest = crypto.createHash("sha256").update(body).digest("hex");
    expect(meta.source_files_sha256?.[key], key).toBe(digest);
  }
  expect(meta.audit_hardening_provenance?.files).toBe(Object.keys(targets).length);

  const cloud = await (await request.get("./assets/cloud-progress-v1.js?stable-attempt=1")).text();
  expect(cloud).toContain("stableAttemptId");
  expect(cloud).toContain("normalizeAttempt");
  expect(cloud).toContain("batch.delete");
  expect(cloud).not.toContain("-${index}-");

  const queue = await (await request.get("./assets/question-report-queue-v2.js?queue=1")).text();
  expect(queue).toContain('"reportQueue", String(reportId)');
  expect(queue).toContain('status: "novo"');
  expect(queue).toContain("refreshRemoteStatuses");
});

test("download direto gera PDF raster fiel em vez de WinAnsi simplificado", async ({page}) => {
  await page.goto("./#/estudar", {waitUntil: "domcontentloaded"});
  await expect(page.locator('[data-study-view="provas"]')).toBeVisible({timeout: 30000});
  await page.locator('[data-study-view="provas"]').click();
  const card = page.locator(".material-card").first();
  await expect(card).toBeVisible({timeout: 30000});
  const name = clean(await card.locator("h3").textContent());
  expect(name).toBeTruthy();
  await card.locator("[data-open-material]").click();
  const downloadCard = page.locator("[data-material-download-card]");
  await expect(downloadCard).toBeVisible({timeout: 30000});

  const downloadPromise = page.waitForEvent("download");
  await downloadCard.getByRole("button", {name: "Baixar PDF direto"}).click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).toBeTruthy();
  const bytes = fs.readFileSync(file);
  expect(bytes.subarray(0, 8).toString("ascii")).toContain("%PDF-1.4");
  expect(bytes.length).toBeGreaterThan(15000);

  const source = await page.request.get("./assets/pdf-fidelity-v2.js?pdf-source=1");
  const text = await source.text();
  expect(text).toContain("canvas.toBlob");
  expect(text).toContain("drawImage");
  expect(text).toContain("/DCTDecode");
  expect(text).not.toContain("WinAnsiEncoding");
});
