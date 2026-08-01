import {test, expect} from "@playwright/test";

test("expõe release unificada, prova real, reporte e proteção do progresso", async ({page}) => {
  const browserMessages = [];
  page.on("console", message => browserMessages.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", error => browserMessages.push(`pageerror: ${error.message}`));
  await page.goto("/#/inicio", {waitUntil: "domcontentloaded"});
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-release-health]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-official-exam-card]")).toContainText("60 questões");
  await expect(page.locator("[data-adaptive-review]")).toBeVisible();
  await page.locator("[data-start-official-exam]").click();
  await page.waitForTimeout(5000);
  const diagnostic = await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.session.v3") || "null");
    return {
      hash: location.hash,
      sessionId: session?.material?.id || null,
      questionIds: session?.questionIds?.length || 0,
      embeddedQuestions: session?.questions?.length || 0,
      buttonText: document.querySelector("[data-start-official-exam]")?.textContent || null,
      buttonDisabled: document.querySelector("[data-start-official-exam]")?.disabled ?? null,
      toast: document.querySelector(".platform-toast")?.textContent || null,
      appText: document.querySelector("#app")?.textContent?.slice(0, 500) || null,
    };
  });
  console.log("DIAGNÓSTICO_PROVA_REAL", JSON.stringify({diagnostic, browserMessages}, null, 2));
  await expect(page.locator(".question-card")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-official-remaining]")).toBeVisible();
  await expect(page.locator("[data-report-question]")).toBeVisible();
  await page.locator("[data-report-question]").click();
  await expect(page.locator("[data-report-dialog]")).toContainText("Reportar problema nesta questão");
  await page.locator("[data-report-cancel]").click();
  await page.goto("/#/desempenho", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-vault-tools]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-vault-snapshot]")).toBeVisible();
  await expect(page.locator("[data-vault-export]")).toBeVisible();
});
