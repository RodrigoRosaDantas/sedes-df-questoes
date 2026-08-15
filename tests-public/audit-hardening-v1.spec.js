import crypto from "node:crypto";
import fs from "node:fs";
import {test, expect} from "@playwright/test";

const clean = value => String(value ?? "").trim();
const VISUAL_QUESTION = "No Windows 10 e 11, ao excluir um arquivo utilizando a tecla Del, o arquivo é removido permanentemente do sistema, não podendo ser recuperado pela Lixeira.";

test("release publica fila, PDF fiel, imagens e IDs estáveis com proveniência", async ({request}) => {
  const metaResponse = await request.get("./data/release/release-meta.json?audit-hardening=1");
  expect(metaResponse.ok()).toBeTruthy();
  const meta = await metaResponse.json();
  const targets = {
    platform_report_queue_js: "assets/question-report-queue-v2.js",
    platform_pdf_fidelity_js: "assets/pdf-fidelity-v2.js",
    platform_question_visuals_js: "assets/question-images-v2-5.js",
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
  expect(text).toContain("SEDES_QUESTION_VISUALS?.forText");
  expect(text).not.toContain("WinAnsiEncoding");
});

test("PDF fiel renderiza também imagem associada pelo mapa canônico", async ({page, request}) => {
  const imageWarnings = [];
  page.on("console", message => {
    if (message.type() === "warning" && message.text().includes("Imagem não pôde ser renderizada no PDF fiel")) imageWarnings.push(message.text());
  });
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect.poll(() => page.evaluate(() => Boolean(window.SEDES_QUESTION_VISUALS && window.SEDES_PDF_FIDELITY)), {timeout: 30000}).toBeTruthy();

  const visual = await page.evaluate(text => window.SEDES_QUESTION_VISUALS.forText(text), VISUAL_QUESTION);
  expect(visual?.src).toContain("crtr12-2026-q35-original.jpg");
  const imageResponse = await request.get(visual.src);
  expect(imageResponse.ok()).toBeTruthy();
  expect((await imageResponse.body()).length).toBeGreaterThan(1000);

  const rendered = await page.evaluate(async text => {
    const pages = await window.SEDES_PDF_FIDELITY.renderMaterial({
      nome: "Teste visual",
      disciplina: "Informática",
      fonte: "Auditoria",
      questoes: [{numero: 1, enunciado: text, alternativas: {A: "Certo", B: "Errado"}}],
    }, false);
    return {pages: pages.length, jpegLength: pages[0].toDataURL("image/jpeg", 0.45).length};
  }, VISUAL_QUESTION);
  expect(rendered.pages).toBeGreaterThanOrEqual(1);
  expect(rendered.jpegLength).toBeGreaterThan(10000);
  expect(imageWarnings).toEqual([]);
});
