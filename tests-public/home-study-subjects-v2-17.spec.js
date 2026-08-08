import {test, expect} from "@playwright/test";

test("home pública permite personalizar matérias diretamente a partir de Todas", async ({page}) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux17-subjects]")).toBeVisible({timeout: 30000});
  await expect(page.locator('[data-ux17-subject-group="prova-202"]')).toHaveCount(1);

  const group = page.locator('[data-ux17-subject-group="prova-202"]');
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
  expect(errors).toEqual([]);
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