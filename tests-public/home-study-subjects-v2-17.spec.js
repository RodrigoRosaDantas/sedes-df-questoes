import {test, expect} from "@playwright/test";

const publicHome = () => `${String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "")}/#/inicio`;

async function dragUpWithTouch(context, page, x, y, distance = 220) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{x, y, radiusX: 6, radiusY: 6, force: 1}],
  });
  for (let step = 1; step <= 10; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{x, y: y - (distance * step / 10), radiusX: 6, radiusY: 6, force: 1}],
    });
    await page.waitForTimeout(18);
  }
  await cdp.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
  await page.waitForTimeout(300);
}

async function prepareTouchPage(page) {
  await page.goto(publicHome(), {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux17-subjects]")).toBeVisible({timeout: 30000});
  await page.evaluate(() => {
    localStorage.removeItem("sedes.questoes.rodrigo.session.v3");
    localStorage.setItem("sedes.questoes.rodrigo.homeStudyToday.v2", JSON.stringify(["prova-202"]));
    sessionStorage.removeItem("sedes.questoes.rodrigo.homeStudySubjects.v2");
  });
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux17-subjects]")).toBeVisible({timeout: 30000});
  const group = page.locator('[data-ux17-subject-group="prova-202"]');
  await group.locator("summary").tap();
  await expect(group.locator(".ux17-subject-chips")).toBeVisible();
  return group;
}

test("home pública permite personalizar matérias diretamente a partir de Todas e cria sessão de prova", async ({page}) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux17-subjects]")).toBeVisible({timeout: 30000});
  await page.evaluate(() => {
    localStorage.removeItem("sedes.questoes.rodrigo.session.v3");
    localStorage.setItem("sedes.questoes.rodrigo.homeStudyToday.v2", JSON.stringify(["prova-202"]));
    sessionStorage.removeItem("sedes.questoes.rodrigo.homeStudySubjects.v2");
  });
  await page.reload({waitUntil: "domcontentloaded"});
  const group = page.locator('[data-ux17-subject-group="prova-202"]');
  await expect(group).toHaveCount(1);
  await group.locator("summary").click();
  const subjects = group.locator("[data-ux17-subject-button]");
  expect(await subjects.count()).toBeGreaterThan(0);
  await expect(group.locator('[data-ux17-all="prova-202"]')).toHaveAttribute("aria-pressed", "true");
  await expect(group.locator('[data-ux17-subject-button][aria-pressed="true"]')).toHaveCount(0);

  await subjects.first().click();
  await expect(group.locator('[data-ux17-subject-button][aria-pressed="true"]')).toHaveCount(1);
  await expect(group.locator("[data-ux17-subject-status]")).toContainText("1 de");
  await expect(group.locator('[data-ux17-all="prova-202"]')).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-ux17-start]")).toBeEnabled();
  await page.locator("[data-ux17-start]").click();
  await page.waitForURL(/#\/resolver/, {timeout: 30000});
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.session.v3")));
  expect(session?.material?.tipo_material).toBe("prova");
  expect(errors).toEqual([]);
});

test("recorte público 202/400 não admite disciplina Artes por colisão textual", async ({page}) => {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  const audit = await page.evaluate(async () => {
    const module = await import("./assets/home-study-edital-v2-18.js?v=1");
    const response = await fetch("./data/release/study-index.json", {cache: "no-store"});
    const studyIndex = await response.json();
    const arts = (studyIndex.disciplines || []).find(item => item.name === "Artes")?.question_ids || [];
    const result = {};
    for (const target of ["202", "400"]) {
      const ids = module.targetQuestionIdsForStudyIndex(studyIndex, target);
      result[target] = {count: ids.size, arts: arts.filter(id => ids.has(id))};
    }
    return result;
  });
  expect(audit["202"].count).toBeGreaterThan(0);
  expect(audit["400"].count).toBeGreaterThan(0);
  expect(audit["202"].arts).toEqual([]);
  expect(audit["400"].arts).toEqual([]);
});

test.describe("matérias no mobile por toque", () => {
  test.use({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});

  test("lista pública de matérias não cria barra interna no mobile", async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
    await expect(page.locator("[data-ux17-subjects]")).toBeVisible({timeout: 30000});
    const group = page.locator('[data-ux17-subject-group="prova-202"]');
    await group.locator("summary").tap();
    const chips = group.locator(".ux17-subject-chips");
    const layout = await chips.evaluate(node => {
      const style = getComputedStyle(node);
      return {
        overflowY: style.overflowY,
        maxHeight: style.maxHeight,
        touchAction: style.touchAction,
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
      };
    });
    expect(layout.overflowY).toBe("visible");
    expect(layout.maxHeight).toBe("none");
    expect(layout.touchAction).toBe("auto");
    expect(Math.abs(layout.scrollHeight - layout.clientHeight)).toBeLessThanOrEqual(1);
    await group.locator("[data-ux17-subject-button]").last().scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("toque seleciona e remove matéria sem erro", async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
    await expect(page.locator("[data-ux17-subjects]")).toBeVisible({timeout: 30000});

    const group = page.locator('[data-ux17-subject-group="prova-202"]');
    await group.locator("summary").tap();
    const first = group.locator("[data-ux17-subject-button]").first();
    await first.tap();
    await expect(group.locator('[data-ux17-subject-button][aria-pressed="true"]')).toHaveCount(1);
    await first.tap();
    await expect(group.locator('[data-ux17-subject-button][aria-pressed="true"]')).toHaveCount(0);
    await expect(page.locator("[data-ux17-start]")).toBeDisabled();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});

for (const viewport of [
  {width: 390, height: 844, label: "retrato"},
  {width: 844, height: 390, label: "paisagem touch"},
]) {
  test(`gesto touch real na página pública rola dentro das matérias — ${viewport.label}`, async ({browser}) => {
    const context = await browser.newContext({
      viewport: {width: viewport.width, height: viewport.height},
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const group = await prepareTouchPage(page);
    const chips = group.locator(".ux17-subject-chips");
    const style = await chips.evaluate(node => {
      const css = getComputedStyle(node);
      return {overflowY: css.overflowY, maxHeight: css.maxHeight, touchAction: css.touchAction};
    });
    expect(style).toEqual({overflowY: "visible", maxHeight: "none", touchAction: "auto"});
    await group.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 50));
    const box = await chips.boundingBox();
    expect(box).toBeTruthy();
    const startX = Math.round(Math.min(viewport.width - 24, Math.max(24, box.x + box.width / 2)));
    const startY = Math.round(Math.min(Math.max(120, viewport.height - 65), Math.max(120, box.y + Math.min(box.height - 20, Math.max(150, viewport.height * 0.58)))));
    const before = await page.evaluate(() => window.scrollY);
    await dragUpWithTouch(context, page, startX, startY, Math.min(220, Math.max(130, viewport.height * 0.42)));
    const after = await page.evaluate(() => window.scrollY);
    expect(after, `${viewport.label} deve mover a página para baixo`).toBeGreaterThan(before + 45);
    expect(errors).toEqual([]);
    await context.close();
  });
}