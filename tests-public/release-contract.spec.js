import fs from "node:fs";
import {test, expect} from "@playwright/test";

const packageData = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const publicationPlan = JSON.parse(fs.readFileSync(new URL("../data/notion/publication-plan.json", import.meta.url), "utf8"));
const expectedVersion = String(packageData.version || "").trim();
const expectedSha = String(process.env.EXPECTED_SHA || "").trim();
const publicBase = new URL(`${String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "")}/`);
const expectedCodes = new Set((publicationPlan.lots || []).flatMap(item => item.codes || []).map(value => String(value || "").trim()).filter(Boolean));
const clean = value => String(value ?? "").trim();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

if (!publicBase.href.startsWith("http")) throw new Error("PUBLIC_BASE_URL não informada para o teste público.");
if (!expectedCodes.size && Number(publicationPlan.total_records || 0)) throw new Error("Plano de publicação sem códigos verificáveis.");
if (expectedCodes.size !== Number(publicationPlan.total_records || 0)) {
  throw new Error(`Plano divergente: ${publicationPlan.total_records} registros e ${expectedCodes.size} códigos únicos.`);
}

function resourceURL(relative, attempt = 1) {
  const url = new URL(String(relative || "").replace(/^\/+/, ""), publicBase);
  url.searchParams.set("release", expectedSha || expectedVersion);
  url.searchParams.set("attempt", String(attempt));
  return url;
}

function routeURL(route, attempt = 1) {
  const url = resourceURL("", attempt);
  url.hash = `/${String(route || "inicio").replace(/^\/+/, "")}`;
  return url.href;
}

async function fetchEventually(request, relative, type = "json", predicate = () => true) {
  let lastError = "recurso não consultado";
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    const url = resourceURL(relative, attempt);
    try {
      const response = await request.get(url.href, {
        headers: {"cache-control": "no-cache, no-store", pragma: "no-cache"},
      });
      if (!response.ok()) {
        lastError = `HTTP ${response.status()} em ${url.pathname}`;
      } else {
        const value = type === "text" ? await response.text() : await response.json();
        if (predicate(value)) return value;
        lastError = `${url.pathname} ainda não corresponde ao commit ${expectedSha || expectedVersion}`;
      }
    } catch (error) {
      lastError = error.message;
    }
    if (attempt < 18) await sleep(5000);
  }
  throw new Error(`Recurso público não estabilizou: ${lastError}`);
}

async function loadRelease(request) {
  const build = await fetchEventually(request, "data/release/build-info.json", "json", value =>
    value?.version === expectedVersion && (!expectedSha || value?.source_sha === expectedSha));
  const catalog = await fetchEventually(request, "data/release/catalogo.json", "json", value =>
    Array.isArray(value?.materials) && Object.keys(value?.question_index || {}).length === Number(build.questions));
  return {build, catalog};
}

async function loadMaterial(request, metadata, attempt = 1) {
  const relative = clean(metadata?.file).replace(/^\.\//, "");
  expect(relative, `${metadata?.nome || metadata?.id || "Material"} sem arquivo público.`).toBeTruthy();
  const response = await request.get(resourceURL(relative, attempt).href, {
    headers: {"cache-control": "no-cache, no-store", pragma: "no-cache"},
  });
  expect(response.ok(), `${relative}: HTTP ${response.status()}`).toBeTruthy();
  const material = await response.json();
  expect(Array.isArray(material?.questoes), `${relative} sem lista de questões.`).toBeTruthy();
  return material;
}

async function openFresh(page, route) {
  await page.goto(routeURL(route, Date.now()), {waitUntil: "domcontentloaded"});
  await expect(page.locator(".error-state")).toHaveCount(0);
  await expect(page.locator("#app h1")).toBeVisible({timeout: 30000});
}

async function openFirstMaterial(page, request, catalog, view) {
  await openFresh(page, "estudar");
  await expect(page.locator(`[data-study-view="${view}"]`)).toBeVisible({timeout: 30000});
  await page.locator(`[data-study-view="${view}"]`).click();
  const materialCard = page.locator(".material-card").first();
  await expect(materialCard).toBeVisible({timeout: 30000});
  const materialName = clean(await materialCard.locator("h3").textContent());
  const expectedType = view === "provas" ? "prova" : "simulado";
  const metadata = (catalog.materials || []).find(item => clean(item.nome) === materialName && clean(item.tipo_material).toLowerCase() === expectedType);
  expect(metadata, `${materialName} não localizado no catálogo como ${expectedType}.`).toBeTruthy();
  const material = await loadMaterial(request, metadata, Date.now());
  expect(material.questoes.length).toBeGreaterThan(0);
  await materialCard.locator("[data-open-material]").click();
  const downloadCard = page.locator("[data-material-download-card]");
  await expect(downloadCard).toBeVisible({timeout: 30000});
  return {downloadCard, material, materialName};
}

async function openGeneratedDocument(page, button) {
  const popupPromise = page.waitForEvent("popup");
  await button.click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  return popup;
}

async function assertQuestionsDocument(popup, material, materialName, withAnswers) {
  const questions = material.questoes || [];
  const firstNumber = clean(questions[0]?.numero ?? questions[0]?.numero_original ?? 1);
  await expect(popup.locator(".cover h1")).toContainText(materialName);
  await expect(popup.locator(".question")).toHaveCount(questions.length);
  await expect(popup.locator(".question h2").first()).toHaveText(`Questão ${firstNumber}`);
  await expect(popup.locator("body")).not.toContainText("undefined");
  if (withAnswers) {
    await expect(popup.locator(".answer-section")).toBeVisible();
    await expect(popup.locator(".answer-grid > div")).toHaveCount(questions.length);
    await expect(popup.locator(".comment")).toHaveCount(questions.length);
  } else {
    await expect(popup.locator(".answer-section")).toHaveCount(0);
    await expect(popup.locator(".comments")).toHaveCount(0);
  }
}

test("publica exatamente o plano excepcional validado", async ({request}) => {
  const {build, catalog} = await loadRelease(request);
  expect(build.questions).toBe(Object.keys(catalog.question_index || {}).length);
  expect(build.materials).toBe((catalog.materials || []).length);
  expect(Number(catalog.summary?.questoes)).toBe(build.questions);
  expect(Number(catalog.summary?.materiais)).toBe(build.materials);

  const materials = await Promise.all((catalog.materials || []).map((metadata, index) => loadMaterial(request, metadata, index + 1)));
  const publicCodes = new Set();
  const duplicateCodes = [];
  let materialQuestionCount = 0;
  for (const material of materials) {
    materialQuestionCount += material.questoes.length;
    for (const question of material.questoes) {
      const code = clean(question.codigo || question.codigo_fonte);
      expect(code, "Questão pública sem código.").toBeTruthy();
      if (publicCodes.has(code)) duplicateCodes.push(code);
      publicCodes.add(code);
      expect(clean(question.gabarito).toLowerCase()).not.toBe("anulada");
    }
  }

  expect(duplicateCodes, `Códigos duplicados no pacote público: ${duplicateCodes.slice(0, 20).join(", ")}`).toEqual([]);
  expect(materialQuestionCount).toBe(build.questions);
  const missing = [...expectedCodes].filter(code => !publicCodes.has(code));
  expect(missing, `Códigos autorizados ausentes do site: ${missing.slice(0, 20).join(", ")}`).toEqual([]);
});

test("interface pública abre a mesma release e seus recursos essenciais", async ({page, request}) => {
  const {build} = await loadRelease(request);
  await page.context().setExtraHTTPHeaders({"cache-control": "no-cache, no-store", pragma: "no-cache"});
  await openFresh(page, "inicio");
  await expect(page.locator("[data-release-health]")).toContainText(Number(build.questions).toLocaleString("pt-BR"), {timeout: 30000});
  await expect(page.locator("[data-official-exam-card]")).toContainText("60 questões");
  await expect(page.locator("[data-adaptive-review]")).toBeVisible();
  await page.locator("[data-start-official-exam]").click();
  await expect(page.locator(".question-card")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-report-question]")).toBeVisible();
  await page.locator("[data-report-question]").click();
  await expect(page.locator("[data-report-dialog]")).toContainText("Reportar problema nesta questão");
  await page.locator("[data-report-cancel]").click();
  await openFresh(page, "desempenho");
  await expect(page.locator("[data-vault-tools]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-vault-snapshot]")).toBeVisible();
  await expect(page.locator("[data-vault-export]")).toBeVisible();
});

test("gera cadernos íntegros para prova e simulado", async ({page, request}) => {
  const {catalog} = await loadRelease(request);
  await page.context().setExtraHTTPHeaders({"cache-control": "no-cache, no-store", pragma: "no-cache"});
  for (const view of ["provas", "simulados"]) {
    const {downloadCard, material, materialName} = await openFirstMaterial(page, request, catalog, view);
    const questionsPopup = await openGeneratedDocument(page, downloadCard.getByRole("button", {name: "PDF para responder"}));
    await assertQuestionsDocument(questionsPopup, material, materialName, false);
    await questionsPopup.close();
    const commentedPopup = await openGeneratedDocument(page, downloadCard.getByRole("button", {name: "PDF comentado"}));
    await assertQuestionsDocument(commentedPopup, material, materialName, true);
    await commentedPopup.close();
  }
});
