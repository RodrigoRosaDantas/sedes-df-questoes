import fs from "node:fs";
import {test, expect} from "@playwright/test";

const packageData = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const expectedVersion = String(packageData.version || "").trim();
const versionToken = expectedVersion.replace(/\./g, "-");
const expectedBuilder = `copy-public-v${versionToken}`;
const expectedCache = `sedes-questoes-v${versionToken}`;
const expectedSha = String(process.env.EXPECTED_SHA || "").trim();
const publicBase = new URL(`${String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "")}/`);

if (!/^\d+\.\d+\.\d+$/.test(expectedVersion)) throw new Error(`Versão inválida no package.json: ${expectedVersion || "ausente"}.`);
if (!publicBase.href.startsWith("http")) throw new Error("PUBLIC_BASE_URL não informada para o teste público.");

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const clean = value => String(value ?? "").trim();
const resourceURL = relative => new URL(String(relative).replace(/^\/+/, ""), publicBase);

async function fetchEventually(request, relative, type = "text", predicate = () => true) {
  let last = "não consultado";
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    const url = resourceURL(relative);
    url.searchParams.set("verify", `${Date.now()}-${attempt}`);
    try {
      const response = await request.get(url.href, {
        headers: {"cache-control": "no-cache, no-store", pragma: "no-cache"},
      });
      if (!response.ok()) {
        last = `HTTP ${response.status()} ${response.statusText()} em ${url.pathname}`;
      } else {
        const value = type === "json" ? await response.json() : await response.text();
        if (predicate(value)) return value;
        last = `conteúdo ainda não corresponde à release esperada em ${url.pathname}`;
      }
    } catch (error) {
      last = `${url.pathname}: ${error.message}`;
    }
    if (attempt < 18) await sleep(5000);
  }
  throw new Error(`Recurso público não estabilizou: ${last}`);
}

function releaseTargets() {
  const targets = new Set();
  const addRange = (prefix, start, end, excluded = new Set()) => {
    for (let number = start; number <= end; number += 1) {
      if (!excluded.has(number)) targets.add(`${prefix}${String(number).padStart(3, "0")}`);
    }
  };
  addRange("PROVA-QDX-CRMVRN-2026-AGENTE-ADMINISTRATIVO-200-", 1, 120, new Set([107]));
  addRange("PROVA-QDX-CRBM6-2026-AUXILIAR-ADMINISTRATIVO-200-", 29, 55);
  addRange("PROVA-QDX-CRTR12-2026-AUXILIAR-ADMINISTRATIVO-200-", 17, 18);
  addRange("PROVA-QDX-CRTR12-2026-AUXILIAR-ADMINISTRATIVO-200-", 21, 22);
  addRange("PROVA-QDX-CRTR12-2026-AUXILIAR-ADMINISTRATIVO-200-", 25, 34);
  addRange("PROVA-QDX-CRTR12-2026-AUXILIAR-ADMINISTRATIVO-200-", 36, 120);
  return targets;
}

async function publishedCodesFromMaterials(request, catalog) {
  const metadata = Array.isArray(catalog.materials) ? catalog.materials : [];
  const missingFiles = metadata.filter(item => !clean(item?.file));
  if (missingFiles.length) {
    throw new Error(`${missingFiles.length} material(is) do catálogo não possuem caminho público.`);
  }

  const materials = await Promise.all(metadata.map(item => {
    const relative = clean(item.file).replace(/^\.\//, "");
    return fetchEventually(request, relative, "json", value => Array.isArray(value?.questoes));
  }));

  const codes = new Set();
  for (const material of materials) {
    for (const question of material.questoes || []) {
      const code = clean(question.codigo);
      const sourceCode = clean(question.codigo_fonte);
      if (code) codes.add(code);
      if (sourceCode) codes.add(sourceCode);
    }
  }
  return codes;
}

async function findTrueFalseCase(request, catalog) {
  for (const metadata of catalog.materials || []) {
    const relative = clean(metadata.file).replace(/^\.\//, "");
    const material = await fetchEventually(request, relative, "json", value => Array.isArray(value?.questoes));
    const questionIndex = (material.questoes || []).findIndex(question => {
      const entries = Object.entries(question.alternativas || {});
      return entries.length === 2
        && entries.every(([letter, text]) => ["Certo", "Errado"].includes(clean(letter)) && clean(text) === clean(letter));
    });
    if (questionIndex >= 0) {
      return {
        metadata,
        questionIndex,
        expectedLabels: Object.keys(material.questoes[questionIndex].alternativas),
      };
    }
  }
  throw new Error("Nenhuma questão Certo/Errado com rótulos equivalentes foi encontrada no pacote público.");
}

test("GitHub Pages serve a release completa e executável", async ({page, request}) => {
  const build = await fetchEventually(request, "data/release/build-info.json", "json", value =>
    value?.version === expectedVersion && (!expectedSha || value?.source_sha === expectedSha));

  const [catalog, worker, reports] = await Promise.all([
    fetchEventually(request, "data/release/catalogo.json", "json"),
    fetchEventually(request, "service-worker.js"),
    fetchEventually(request, "assets/reports-v2-10.js"),
  ]);

  const questionCount = Object.keys(catalog.question_index || {}).length;
  const materialCount = Array.isArray(catalog.materials) ? catalog.materials.length : 0;
  expect(build.version).toBe(expectedVersion);
  expect(build.builder).toBe(expectedBuilder);
  expect(build.cache_version).toBe(expectedCache);
  if (expectedSha) expect(build.source_sha).toBe(expectedSha);
  expect(build.questions).toBe(questionCount);
  expect(build.materials).toBe(materialCount);
  expect(questionCount).toBe(Number(catalog.summary?.questoes));
  expect(materialCount).toBe(Number(catalog.summary?.materiais));
  expect(worker).toContain(expectedCache);
  expect(worker).toContain('event.request.mode === "navigate"');
  expect(worker).toContain('cache: "no-store"');
  expect(reports).toContain("restoreBackupTransaction");

  const targets = releaseTargets();
  expect(targets.size).toBe(245);
  const publicCodes = await publishedCodesFromMaterials(request, catalog);
  const missingTargets = [...targets].filter(code => !publicCodes.has(code));
  expect(
    missingTargets,
    `Questões do lote ausentes dos materiais publicados: ${missingTargets.slice(0, 20).join(", ")}`,
  ).toEqual([]);
  const trueFalseCase = await findTrueFalseCase(request, catalog);
  expect(trueFalseCase.expectedLabels).toEqual(["Certo", "Errado"]);

  const homeURL = resourceURL("");
  homeURL.searchParams.set("verify", String(Date.now()));
  homeURL.hash = "/inicio";
  await page.goto(homeURL.href, {waitUntil: "domcontentloaded"});
  await expect(page.locator(".error-state")).toHaveCount(0);
  await expect(page.locator("#app h1")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-smart-today]")).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "./manifest.webmanifest");

  const workerActive = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise(resolve => setTimeout(() => resolve(null), 20000)),
    ]);
    return Boolean(registration?.active);
  });
  expect(workerActive).toBeTruthy();

  await page.locator('[data-route="estudar"]').first().click();
  await expect(page.locator('[data-study-view="materias"]')).toBeVisible();
  await expect(page.locator('[data-study-view="simulados"]')).toBeVisible();
  await expect(page.locator('[data-study-view="provas"]')).toBeVisible();

  await page.locator('[data-study-view="provas"]').click();
  const examCard = page.locator(".material-card").filter({hasText: "Gestor em Políticas Públicas"});
  await expect(examCard).toBeVisible();
  await examCard.locator("[data-open-material]").click();
  await expect(page.locator(".detail-summary")).toContainText("120");

  const studyURL = resourceURL("");
  studyURL.hash = "/estudar";
  await page.goto(studyURL.href, {waitUntil: "domcontentloaded"});
  await page.locator('[data-study-view="materias"]').click();
  const firstDiscipline = page.locator("[data-open-discipline]").first();
  await expect(firstDiscipline).toBeVisible();
  await firstDiscipline.click();
  await expect(page.locator(".topic-builder")).toBeVisible();
  await expect(page.locator("[data-select-weak-topics]")).toBeVisible();

  const trueFalseURL = resourceURL("");
  trueFalseURL.hash = "/estudar";
  await page.goto(trueFalseURL.href, {waitUntil: "domcontentloaded"});
  const trueFalseView = clean(trueFalseCase.metadata.tipo_material).toLocaleLowerCase("pt-BR") === "prova" ? "provas" : "simulados";
  await page.locator(`[data-study-view="${trueFalseView}"]`).click();
  await page.locator("#study-search").fill(clean(trueFalseCase.metadata.nome));
  const trueFalseCard = page.locator(".material-card").filter({hasText: clean(trueFalseCase.metadata.nome)}).first();
  await expect(trueFalseCard).toBeVisible({timeout: 30000});
  await trueFalseCard.locator("[data-open-material]").click();
  await page.locator('[data-start="treino"]').click();
  if (trueFalseCase.questionIndex > 0) {
    await page.locator(`[data-jump="${trueFalseCase.questionIndex}"]`).click();
  }
  const trueFalseOptions = page.locator(".options .option");
  await expect(trueFalseOptions).toHaveCount(2);
  expect((await trueFalseOptions.allTextContents()).map(clean)).toEqual(trueFalseCase.expectedLabels);
  await expect(page.locator(".options .option > span:visible")).toHaveCount(2);

  const performanceURL = resourceURL("");
  performanceURL.hash = "/desempenho";
  await page.goto(performanceURL.href, {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-progress-reports]")).toBeVisible({timeout: 30000});
  await expect(page.getByRole("button", {name: "Backup completo"})).toBeVisible();
});
