import fs from "node:fs";
import {test, expect} from "@playwright/test";

const packageData = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const publicationPlan = JSON.parse(fs.readFileSync(new URL("../data/notion/publication-plan.json", import.meta.url), "utf8"));
const expectedVersion = String(packageData.version || "").trim();
const expectedSha = String(process.env.EXPECTED_SHA || "").trim();
const publicBase = new URL(`${String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "")}/`);
const plannedCodes = new Set((publicationPlan.lots || [])
  .flatMap(item => item.codes || [])
  .map(value => String(value || "").trim())
  .filter(Boolean));
const clean = value => String(value ?? "").trim();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

if (!publicBase.href.startsWith("http")) throw new Error("PUBLIC_BASE_URL não informada para o teste público.");
if (plannedCodes.size !== Number(publicationPlan.total_records || 0)) {
  throw new Error(`Plano divergente: ${publicationPlan.total_records} registros e ${plannedCodes.size} códigos únicos.`);
}

function urlFor(relative = "", attempt = 1) {
  const url = new URL(String(relative).replace(/^\/+/, ""), publicBase);
  url.searchParams.set("release", expectedSha || expectedVersion);
  url.searchParams.set("attempt", String(attempt));
  return url;
}

async function fetchEventually(request, relative, predicate = () => true) {
  let last = "recurso não consultado";
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    const url = urlFor(relative, attempt);
    try {
      const response = await request.get(url.href, {
        headers: {"cache-control": "no-cache, no-store", pragma: "no-cache"},
      });
      if (!response.ok()) {
        last = `HTTP ${response.status()} em ${url.pathname}`;
      } else {
        const value = await response.json();
        if (predicate(value)) return value;
        last = `${url.pathname} ainda não corresponde à release esperada`;
      }
    } catch (error) {
      last = error.message;
    }
    if (attempt < 18) await sleep(5000);
  }
  throw new Error(`Recurso público não estabilizou: ${last}`);
}

async function loadRelease(request) {
  const build = await fetchEventually(request, "data/release/build-info.json", value =>
    value?.version === expectedVersion && (!expectedSha || value?.source_sha === expectedSha));
  const catalog = await fetchEventually(request, "data/release/catalogo.json", value =>
    Array.isArray(value?.materials)
    && Object.keys(value?.question_index || {}).length === Number(build.questions));
  return {build, catalog};
}

async function loadMaterial(request, metadata, attempt = 1) {
  const relative = clean(metadata?.file).replace(/^\.\//, "");
  expect(relative, `${metadata?.nome || metadata?.id || "Material"} sem arquivo público.`).toBeTruthy();
  const response = await request.get(urlFor(relative, attempt).href, {
    headers: {"cache-control": "no-cache, no-store", pragma: "no-cache"},
  });
  expect(response.ok(), `${relative}: HTTP ${response.status()}`).toBeTruthy();
  const material = await response.json();
  expect(Array.isArray(material?.questoes), `${relative} sem lista de questões.`).toBeTruthy();
  return material;
}

async function openRoute(page, route) {
  const url = urlFor("", Date.now());
  url.hash = `/${route}`;
  await page.goto(url.href, {waitUntil: "domcontentloaded"});
  await expect(page.locator(".error-state")).toHaveCount(0);
  await expect(page.locator("#app h1")).toBeVisible({timeout: 30000});
}

async function openFirstMaterial(page, request, catalog, view) {
  await openRoute(page, "estudar");
  await page.locator(`[data-study-view="${view}"]`).click();
  const card = page.locator(".material-card").first();
  await expect(card).toBeVisible({timeout: 30000});
  const name = clean(await card.locator("h3").textContent());
  const type = view === "provas" ? "prova" : "simulado";
  const metadata = (catalog.materials || []).find(item =>
    clean(item.nome) === name && clean(item.tipo_material).toLowerCase() === type);
  expect(metadata, `${name} não localizado no catálogo como ${type}.`).toBeTruthy();
  const material = await loadMaterial(request, metadata, Date.now());
  await card.locator("[data-open-material]").click();
  const download = page.locator("[data-material-download-card]");
  await expect(download).toBeVisible({timeout: 30000});
  return {download, material, name};
}

async function openGenerated(page, button) {
  const popupPromise = page.waitForEvent("popup");
  await button.click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  return popup;
}

async function assertDocument(popup, material, name, withAnswers) {
  const questions = material.questoes || [];
  const displayedFirstNumber = clean(questions[0]?.numero) || "1";
  await expect(popup.locator(".cover h1")).toContainText(name);
  await expect(popup.locator(".question")).toHaveCount(questions.length);
  await expect(popup.locator(".question h2").first()).toHaveText(`Questão ${displayedFirstNumber}`);
  await expect(popup.locator("body")).not.toContainText("undefined");
  if (withAnswers) {
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

  const materials = await Promise.all((catalog.materials || [])
    .map((metadata, index) => loadMaterial(request, metadata, index + 1)));
  const publicCodes = new Set();
  const duplicates = [];
  let total = 0;
  for (const material of materials) {
    total += material.questoes.length;
    for (const question of material.questoes) {
      const code = clean(question.codigo || question.codigo_fonte);
      const answer = clean(question.gabarito);
      expect(code, "Questão pública sem código.").toBeTruthy();
      expect(answer, `${code} sem gabarito.`).toBeTruthy();
      if (publicCodes.has(code)) duplicates.push(code);
      publicCodes.add(code);
      if (plannedCodes.has(code)) {
        expect(answer.toLowerCase(), `Questão do plano publicada como anulada: ${code}`).not.toBe("anulada");
      }
    }
  }

  expect(duplicates, `Códigos duplicados: ${duplicates.slice(0, 20).join(", ")}`).toEqual([]);
  expect(total).toBe(build.questions);
  const missing = [...plannedCodes].filter(code => !publicCodes.has(code));
  expect(missing, `Códigos autorizados ausentes: ${missing.slice(0, 20).join(", ")}`).toEqual([]);
});

test("interface pública usa a mesma release na arquitetura v2.15", async ({page, request}) => {
  const {build} = await loadRelease(request);

  await openRoute(page, "inicio");
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
  await expect(page.locator("#app > *")).toHaveCount(1);
  await expect(page.locator("[data-release-health]")).toHaveCount(0);
  await expect(page.locator("[data-official-exam-card]")).toHaveCount(0);
  await expect(page.locator("[data-adaptive-review]")).toHaveCount(0);

  await openRoute(page, "perfil/configuracoes");
  await expect(page.locator("[data-ux15-settings-page]")).toBeVisible({timeout: 30000});
  await page.locator("[data-ux15-settings-tab=plataforma]").click();
  const platform = page.locator("[data-ux15-settings-page]");
  await expect(platform).toContainText("Questões publicadas");
  await expect(platform).toContainText(Number(build.questions).toLocaleString("pt-BR"));

  await openRoute(page, "estudar");
  await expect(page.locator("[data-official-exam-card]")).toContainText("60 questões", {timeout: 30000});
  await expect(page.locator("[data-role-templates]")).toBeVisible({timeout: 30000});
  await page.locator("[data-start-official-exam]").click();
  await expect(page.locator(".question-card")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-report-question]")).toBeVisible();

  await openRoute(page, "revisar");
  await expect(page.locator("[data-adaptive-review]")).toBeVisible({timeout: 30000});

  await openRoute(page, "desempenho");
  await expect(page.locator("[data-vault-tools]")).toBeVisible({timeout: 30000});
});

test("gera download direto e mantém cadernos íntegros para prova e simulado", async ({page, request}) => {
  const {catalog} = await loadRelease(request);
  for (const view of ["provas", "simulados"]) {
    const {download, material, name} = await openFirstMaterial(page, request, catalog, view);
    await expect(download.getByRole("button", {name: "Baixar PDF direto"})).toBeVisible();
    const blank = await openGenerated(page, download.getByRole("button", {name: "Imprimir versão completa"}));
    await assertDocument(blank, material, name, false);
    await blank.close();
    const commented = await openGenerated(page, download.getByRole("button", {name: "Imprimir comentado"}));
    await assertDocument(commented, material, name, true);
    await commented.close();
  }
});