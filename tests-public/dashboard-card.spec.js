import {test, expect} from "@playwright/test";

const configuredURL = String(process.env.PUBLIC_BASE_URL || "").trim();
const expectedSha = String(process.env.EXPECTED_SHA || "").trim();
if (!configuredURL.startsWith("http")) throw new Error("PUBLIC_BASE_URL não informada.");
if (!expectedSha) throw new Error("EXPECTED_SHA não informado.");
const publicBase = new URL(`${configuredURL.replace(/\/+$/, "")}/`);

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function urlFor(relative = "", attempt = 1) {
  const url = new URL(String(relative).replace(/^\/+/, ""), publicBase);
  url.searchParams.set("dashboard-release", expectedSha);
  url.searchParams.set("attempt", String(attempt));
  return url;
}

async function fetchEventually(request, relative, predicate) {
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
        last = `${url.pathname} ainda não corresponde ao deploy autorizado`;
      }
    } catch (error) {
      last = error.message;
    }
    if (attempt < 18) await sleep(5000);
  }
  throw new Error(`Recurso público não estabilizou: ${last}`);
}

function fact(page, label) {
  return page.locator(".ux15-facts-grid span").filter({hasText: label}).first();
}

test("Configurações usa o release-meta reconciliado", async ({page, request}) => {
  const build = await fetchEventually(request, "data/release/build-info.json", value =>
    value?.source_sha === expectedSha
    && Number(value?.questions) > 0
    && Number(value?.materials) > 0);

  const releaseMeta = await fetchEventually(request, "data/release/release-meta.json", value =>
    value?.source_sha === expectedSha
    && Number(value?.questions) === Number(build.questions)
    && Number(value?.materials) === Number(build.materials));

  const catalog = await fetchEventually(request, "data/release/catalogo.json", value =>
    Number(value?.summary?.questoes) === Number(build.questions)
    && Number(value?.summary?.materiais) === Number(build.materials));

  expect(Object.keys(catalog.question_index || {})).toHaveLength(Number(build.questions));

  const url = urlFor("", Date.now());
  url.hash = "/perfil/configuracoes";
  await page.goto(url.href, {waitUntil: "domcontentloaded"});
  await expect(page.locator(".error-state")).toHaveCount(0);
  await expect(page.locator("[data-ux15-settings-page]")).toBeVisible({timeout: 30000});
  await page.locator("[data-ux15-settings-tab=plataforma]").click();

  await expect(fact(page, "Questões publicadas")).toContainText(Number(releaseMeta.questions).toLocaleString("pt-BR"));
  await expect(fact(page, "Materiais")).toContainText(String(releaseMeta.materials));
  await expect(fact(page, "Banco Mestre")).toContainText(Number(releaseMeta.banco_mestre || 0).toLocaleString("pt-BR"));
  await expect(fact(page, "Aguardando auditoria")).toContainText(String(Number(releaseMeta.awaiting_audit || 0)));
  await expect(page.locator('script[src*="app-v4.js?v=13"]')).toHaveCount(1);
  await expect(page.locator('script[src*="navigation-v2-15.js?v=1"]')).toHaveCount(1);
});
