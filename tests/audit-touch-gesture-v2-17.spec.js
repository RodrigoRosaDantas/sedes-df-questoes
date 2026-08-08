import {test, expect} from "@playwright/test";

async function prepare(page) {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux17-subjects]")).toBeVisible({timeout: 30000});
  await page.evaluate(() => {
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

async function dragUpWithTouch(context, page, x, y, distance = 260) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{x, y, radiusX: 6, radiusY: 6, force: 1}],
  });
  const steps = 10;
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{x, y: y - (distance * i / steps), radiusX: 6, radiusY: 6, force: 1}],
    });
    await page.waitForTimeout(18);
  }
  await cdp.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
  await page.waitForTimeout(350);
}

for (const width of [360, 390, 412]) {
  test(`gesto touch real dentro das matérias rola a página em ${width}px`, async ({browser}) => {
    const context = await browser.newContext({
      viewport: {width, height: 800},
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const group = await prepare(page);
    const chips = group.locator(".ux17-subject-chips");

    const style = await chips.evaluate(node => {
      const css = getComputedStyle(node);
      return {overflowY: css.overflowY, maxHeight: css.maxHeight, touchAction: css.touchAction};
    });
    expect(style).toEqual({overflowY: "visible", maxHeight: "none", touchAction: "auto"});

    await group.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 80));
    const box = await chips.boundingBox();
    expect(box).toBeTruthy();
    const startX = Math.round(Math.min(width - 24, Math.max(24, box.x + box.width / 2)));
    const startY = Math.round(Math.min(720, Math.max(360, box.y + Math.min(box.height - 20, 520))));
    const before = await page.evaluate(() => window.scrollY);

    await dragUpWithTouch(context, page, startX, startY);
    const after = await page.evaluate(() => window.scrollY);

    expect(after, `arrasto touch em ${width}px deve mover a página para baixo`).toBeGreaterThan(before + 80);
    expect(errors).toEqual([]);
    await context.close();
  });
}
