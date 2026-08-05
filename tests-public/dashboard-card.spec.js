import {test, expect} from "@playwright/test";

const configuredURL = String(process.env.PUBLIC_BASE_URL || "").trim();
const expectedSha = String(process.env.EXPECTED_SHA || "").trim();
if (!configuredURL.startsWith("http")) throw new Error("PUBLIC_BASE_URL não informada.");
if (!expectedSha) throw new Error("EXPECTED_SHA não informado.");
const publicBase = new URL(`${configuredURL.replace(/\/+$/, "")}/`);

const expected = {
  bancoMestre: 2946,
  questions: 2871,
  awaitingAudit: 75,
  materials: 67,
};

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

test("cartão Banco Mestre usa o release-meta reconciliado", async ({page, request}) => {
  await fetchEventually(request, "data/release/build-info.json", value =>
    value?.source_sha === expectedSha
    && Number(value?.questions) === expected.questions
    && Number(value?.materials) === expected.materials);

  const releaseMeta = await fetchEventually(request, "data/release/release-meta.json", value =>
    Number(value?.banco_mestre) === expected.bancoMestre
    && Number(value?.questions) === expected.questions
    && Number(value?.awaiting_audit) === expected.awaitingAudit
    && Number(value?.materials) === expected.materials);

  const url = urlFor("", Date.now());
  url.hash = "/inicio";
  await page.goto(url.href, {waitUntil: "domcontentloaded"});
  await expect(page.locator(".error-state")).toHaveCount(0);

  const values = page.locator(".bank-status strong");
  await expect(values).toHaveCount(3);
  await expect(values.nth(0)).toHaveText(String(releaseMeta.banco_mestre), {timeout: 30000});
  await expect(values.nth(1)).toHaveText(String(releaseMeta.questions));
  await expect(values.nth(2)).toHaveText(String(releaseMeta.awaiting_audit));
  await expect(page.locator('script[src*="app-v4.js?v=9"]')).toHaveCount(1);
});
