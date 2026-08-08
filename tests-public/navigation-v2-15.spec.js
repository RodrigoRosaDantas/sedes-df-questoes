import {test, expect} from "@playwright/test";

test("home pública fica limpa e configurações expõem sincronização", async ({page}) => {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
  await expect(page.locator("#app > *")).toHaveCount(1);
  await expect(page.locator(".bank-status")).toHaveCount(0);
  await expect(page.locator("[data-release-health]")).toHaveCount(0);
  await expect(page.locator("[data-adaptive-review]")).toHaveCount(0);
  await expect(page.locator("[data-official-exam-card]")).toHaveCount(0);
  await expect(page.locator("#sync-label")).toContainText("Brasília");
  await expect(page.locator("[data-ux15-sync-time]").first()).toContainText(/\d{2}\/\d{2}\/\d{4}/);
  await expect(page.locator("[data-ux15-sync-age]").first()).toContainText(/sincroniz/);
  await page.locator("[data-ux15-settings]").click();
  await expect(page).toHaveURL(/#\/perfil\/configuracoes$/);
  await expect(page.locator("[data-ux15-settings-page]")).toBeVisible({timeout: 30000});
  await page.locator("[data-ux15-settings-tab=plataforma]").click();
  await expect(page.getByRole("heading", {name: "Dados do projeto"})).toBeVisible();
  await expect(page.getByText("Questões publicadas")).toBeVisible();
});

test("home pública oferece quatro recortes do Estudo de hoje por edital e fonte", async ({page}) => {
  await page.addInitScript(() => localStorage.removeItem("sedes.questoes.rodrigo.homeStudyToday.v2"));
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  const tracks = page.locator("[data-ux16-track]");
  await expect(tracks).toHaveCount(4, {timeout: 30000});
  await expect(page.locator('[data-ux16-track="prova-202"]')).toContainText("Técnico Administrativo");
  await expect(page.locator('[data-ux16-track="prova-400"]')).toContainText("Administrador");
  await expect(page.locator('[data-ux16-track="simulado-202"]')).toContainText("Simulados");
  await expect(page.locator('[data-ux16-track="simulado-400"]')).toContainText("Simulados");
  await expect(page.locator('[data-ux16-track="prova-202"] input')).toBeChecked();
  await expect(page.locator('[data-ux16-track="prova-400"] input')).toBeChecked();
  await expect(page.locator('[data-ux16-track="simulado-202"] input')).not.toBeChecked();
  await expect(page.locator('[data-ux16-track="simulado-400"] input')).not.toBeChecked();
  await expect(page.locator("[data-ux16-summary]")).toContainText("2 opção");
  await expect(page.locator("[data-ux16-start]")).toBeEnabled();
});

test("página pública de estudo preserva recursos sem poluição", async ({page}) => {
  await page.goto("./#/estudar", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-breadcrumb=estudar]")).toContainText("Início");
  await expect(page.locator("[data-ux15-breadcrumb=estudar]")).toContainText("Estudar");
  await expect(page.locator(".mobile-nav a")).toHaveCount(4);
  await expect(page.locator("[data-official-exam-card]")).toBeVisible({timeout: 30000});
  const roles = page.locator("[data-role-templates]");
  await expect(roles).toBeVisible({timeout: 30000});
  await expect(roles).not.toHaveAttribute("open", "");
});
