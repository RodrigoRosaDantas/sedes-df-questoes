import {test, expect} from "@playwright/test";

const clean = value => String(value ?? "").trim();

async function loadCatalog(request) {
  const response = await request.get("./data/release/catalogo.json", {
    headers: {"cache-control": "no-cache, no-store", pragma: "no-cache"},
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function loadMaterial(request, metadata) {
  const response = await request.get(clean(metadata.file).replace(/^\.\//, ""), {
    headers: {"cache-control": "no-cache, no-store", pragma: "no-cache"},
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function openFirstMaterial(page, request, catalog, view) {
  await page.goto("./#/estudar", {waitUntil: "domcontentloaded"});
  await expect(page.locator(`[data-study-view="${view}"]`)).toBeVisible({timeout: 30000});
  await page.locator(`[data-study-view="${view}"]`).click();

  const materialCard = page.locator(".material-card").first();
  await expect(materialCard).toBeVisible({timeout: 30000});
  const materialName = clean(await materialCard.locator("h3").textContent());
  expect(materialName).toBeTruthy();

  const expectedType = view === "provas" ? "prova" : "simulado";
  const metadata = (catalog.materials || []).find(item => clean(item.nome) === materialName && clean(item.tipo_material).toLowerCase() === expectedType);
  expect(metadata, `${materialName} não foi localizado no catálogo como ${expectedType}.`).toBeTruthy();
  const material = await loadMaterial(request, metadata);
  expect(Array.isArray(material.questoes)).toBeTruthy();
  expect(material.questoes.length).toBeGreaterThan(0);

  await materialCard.locator("[data-open-material]").click();
  const downloadCard = page.locator("[data-material-download-card]");
  await expect(downloadCard).toBeVisible({timeout: 30000});
  await expect(downloadCard.getByRole("button", {name: "PDF para responder"})).toBeVisible();
  await expect(downloadCard.getByRole("button", {name: "PDF comentado"})).toBeVisible();
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
  const firstNumber = clean(questions[0]?.numero) || "1";
  await expect(popup.locator(".cover h1")).toContainText(materialName);
  await expect(popup.locator(".question")).toHaveCount(questions.length);
  await expect(popup.locator(".question h2").first()).toHaveText(`Questão ${firstNumber}`);
  await expect(popup.locator("body")).not.toContainText("undefined");
  if (withAnswers) {
    await expect(popup.locator(".answer-section")).toBeVisible();
    await expect(popup.locator(".answer-grid > div")).toHaveCount(questions.length);
    await expect(popup.locator(".comments")).toBeVisible();
    await expect(popup.locator(".comment")).toHaveCount(questions.length);
  } else {
    await expect(popup.locator(".answer-section")).toHaveCount(0);
    await expect(popup.locator(".comments")).toHaveCount(0);
  }
}

test("site público gera PDFs íntegros de provas e simulados", async ({page, request}) => {
  const catalog = await loadCatalog(request);

  for (const view of ["provas", "simulados"]) {
    const {downloadCard, material, materialName} = await openFirstMaterial(page, request, catalog, view);

    const questionsPopup = await openGeneratedDocument(
      page,
      downloadCard.getByRole("button", {name: "PDF para responder"}),
    );
    await assertQuestionsDocument(questionsPopup, material, materialName, false);
    await questionsPopup.close();

    const commentedPopup = await openGeneratedDocument(
      page,
      downloadCard.getByRole("button", {name: "PDF comentado"}),
    );
    await assertQuestionsDocument(commentedPopup, material, materialName, true);
    await commentedPopup.close();
  }
});
