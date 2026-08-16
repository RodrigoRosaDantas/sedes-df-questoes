import {test, expect} from "@playwright/test";

function rgbParts(value) {
  const match = String(value || "").match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const parts = match[1].split(",").map(part => Number.parseFloat(part.trim()));
  return {r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1};
}

function luminance({r, g, b}) {
  const channel = value => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground, background) {
  const fg = rgbParts(foreground);
  const bg = rgbParts(background);
  if (!fg || !bg || bg.a === 0) return 0;
  const lighter = Math.max(luminance(fg), luminance(bg));
  const darker = Math.min(luminance(fg), luminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

async function visualSnapshot(page) {
  return page.evaluate(() => {
    const read = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        color: style.color,
        backgroundColor: style.backgroundColor,
        opacity: style.opacity,
        filter: style.filter,
      };
    };
    const body = getComputedStyle(document.body);
    return {
      theme: document.documentElement.dataset.theme,
      aliases: {
        surface: body.getPropertyValue("--surface").trim(),
        surfaceSoft: body.getPropertyValue("--surface-soft").trim(),
        border: body.getPropertyValue("--border").trim(),
        accent: body.getPropertyValue("--accent").trim(),
      },
      shell: read("[data-role-study-shell]"),
      quick: read("[data-role-study-quicknav] a"),
      hero: read(".role-hero"),
      heroTitle: read(".role-hero h1"),
      target: read("[data-role-target].active"),
      targetTitle: read("[data-role-target].active strong"),
      kpi: read("[data-role-kpis] article"),
      kpiValue: read("[data-role-kpis] article strong"),
      group: read("[data-role-knowledge-group]"),
      groupTitle: read("[data-role-knowledge-group] h2"),
      loadingCount: document.querySelectorAll("#cargo-study-app .loading").length,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

async function setThemeAndReload(page, theme) {
  await page.evaluate(value => localStorage.setItem("sedes.questoes.theme", value), theme);
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-role-study-shell]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-role-knowledge-group]")).toHaveCount(3);
}

test("Estudo por Cargo preserva contraste no iPad em paisagem", async ({page}) => {
  await page.setViewportSize({width: 1366, height: 1024});
  await page.goto("./estudo-por-cargo.html?cargo=400", {waitUntil: "domcontentloaded"});
  await setThemeAndReload(page, "dark");

  const dark = await visualSnapshot(page);
  expect(dark.theme).toBe("dark");
  expect(dark.loadingCount).toBe(0);
  expect(dark.overflow).toBeLessThanOrEqual(1);
  expect(Object.values(dark.aliases).every(Boolean)).toBeTruthy();
  for (const surface of [dark.shell, dark.quick, dark.hero, dark.target, dark.kpi, dark.group]) {
    expect(surface?.opacity).toBe("1");
    expect(surface?.filter).toBe("none");
  }
  expect(rgbParts(dark.quick.backgroundColor)?.a).toBeGreaterThan(0);
  expect(rgbParts(dark.hero.backgroundColor)?.a).toBeGreaterThan(0);
  expect(contrast(dark.heroTitle.color, dark.hero.backgroundColor)).toBeGreaterThan(4.5);
  expect(contrast(dark.targetTitle.color, dark.target.backgroundColor)).toBeGreaterThan(4.5);
  expect(contrast(dark.kpiValue.color, dark.kpi.backgroundColor)).toBeGreaterThan(4.5);
  expect(contrast(dark.groupTitle.color, dark.group.backgroundColor)).toBeGreaterThan(4.5);

  await setThemeAndReload(page, "light");
  const light = await visualSnapshot(page);
  expect(light.theme).toBe("light");
  expect(light.loadingCount).toBe(0);
  expect(light.overflow).toBeLessThanOrEqual(1);
  expect(contrast(light.heroTitle.color, light.hero.backgroundColor)).toBeGreaterThan(4.5);
  expect(contrast(light.targetTitle.color, light.target.backgroundColor)).toBeGreaterThan(4.5);
  expect(contrast(light.kpiValue.color, light.kpi.backgroundColor)).toBeGreaterThan(4.5);
  expect(contrast(light.groupTitle.color, light.group.backgroundColor)).toBeGreaterThan(4.5);
});
