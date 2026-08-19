import {test, expect} from "@playwright/test";

function localReferences(text) {
  const refs = new Set();
  for (const match of text.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
    const value = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|blob:|#)/i.test(value)) continue;
    refs.add(value.replace(/^\.\//, ""));
  }
  return [...refs];
}

function shellReferences(text) {
  return [...new Set([...text.matchAll(/["']\.\/([^"']+)["']/g)].map(match => match[1]))];
}

test("todos os recursos locais declarados pelo HTML e shell PWA respondem", async ({request}) => {
  const indexResponse = await request.get("./index.html?integrity=1");
  const workerResponse = await request.get("./service-worker.js?integrity=1");
  expect(indexResponse.ok()).toBeTruthy();
  expect(workerResponse.ok()).toBeTruthy();
  const refs = new Set([
    ...localReferences(await indexResponse.text()),
    ...shellReferences(await workerResponse.text()),
  ]);
  expect(refs.size).toBeGreaterThan(30);
  const failures = [];
  for (const relative of refs) {
    const response = await request.get(`./${relative}`);
    if (!response.ok()) failures.push(`${relative}: HTTP ${response.status()}`);
  }
  expect(failures, `Recursos locais quebrados:\n${failures.join("\n")}`).toEqual([]);
});

const routes = ["#/inicio", "#/estudar", "#/revisar", "#/desempenho", "#/perfil/configuracoes"];

test("rotas principais não expõem IDs duplicados nem controles sem nome acessível", async ({page}) => {
  const findings = [];
  for (const route of routes) {
    await page.goto(`./${route}`, {waitUntil: "domcontentloaded"});
    await expect(page.locator("#app h1").first()).toBeVisible({timeout: 30000});
    if (route === "#/estudar") {
      await expect(page.locator("[data-ux-question-search]")).toHaveAttribute("aria-label", "Buscar dentro das questões", {timeout: 30000});
    }
    const result = await page.evaluate(() => {
      const idCounts = new Map();
      document.querySelectorAll("[id]").forEach(node => idCounts.set(node.id, (idCounts.get(node.id) || 0) + 1));
      const duplicateIds = [...idCounts.entries()].filter(([, count]) => count > 1).map(([id, count]) => `${id} (${count})`);
      const unnamed = [...document.querySelectorAll("button,a[href],input,select,textarea")].filter(node => {
        if (node.hidden || node.closest("[hidden]") || node.getAttribute("aria-hidden") === "true") return false;
        if (node.matches('input[type="hidden"]')) return false;
        const labelled = node.getAttribute("aria-label") || node.getAttribute("aria-labelledby") || node.getAttribute("title");
        if (labelled) return false;
        if ((node.textContent || "").trim()) return false;
        if (node instanceof HTMLInputElement && ["submit", "button", "reset"].includes(node.type) && node.value.trim()) return false;
        if (node.id && document.querySelector(`label[for="${CSS.escape(node.id)}"]`)) return false;
        if (node.closest("label")) return false;
        return true;
      }).map(node => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${node.className ? `.${String(node.className).trim().replace(/\s+/g, ".")}` : ""}`);
      return {duplicateIds, unnamed};
    });
    if (result.duplicateIds.length) findings.push(`${route}: IDs duplicados: ${result.duplicateIds.join(", ")}`);
    if (result.unnamed.length) findings.push(`${route}: controles sem nome: ${result.unnamed.join(", ")}`);
  }
  expect(findings, findings.join("\n")).toEqual([]);
});

test("navegação por teclado mantém skip link funcional sem alterar a rota da SPA", async ({page}) => {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("#app h1").first()).toBeVisible({timeout: 30000});
  const beforeHash = await page.evaluate(() => location.hash);
  await page.evaluate(() => {
    document.body.setAttribute("tabindex", "-1");
    document.body.focus();
    document.body.removeAttribute("tabindex");
  });
  await page.keyboard.press("Tab");
  const skip = page.locator("a.skip");
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#app")).toBeFocused();
  expect(await page.evaluate(() => location.hash)).toBe(beforeHash);
});