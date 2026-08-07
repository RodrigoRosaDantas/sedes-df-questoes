import {test, expect} from "@playwright/test";

test.beforeEach(async ({page}) => {
  await page.goto("/#/inicio", {waitUntil: "domcontentloaded"});
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: "domcontentloaded"});
});

test("home exibe apenas o essencial e horário de Brasília", async ({page}) => {
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-ux15-current-date]").first()).toBeVisible();
  await expect(page.locator("[data-ux15-current-time]").first()).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await expect(page.locator("[data-ux15-sync-time]").first()).toContainText(/\d{2}\/\d{2}\/\d{4}/);
  await expect(page.locator("[data-ux15-sync-age]").first()).toContainText(/sincroniz/);
  await expect(page.locator("[data-ux15-sync-age]").first()).toHaveClass(/fresh|attention|stale/);
  await expect(page.locator("#sync-label")).toContainText("Brasília");
  await expect(page.locator(".bank-status")).toBeHidden();
  await expect(page.locator(".dashboard-metrics")).toBeHidden();
  await expect(page.locator(".home-actions-grid")).toBeHidden();
  await expect(page.locator("[data-ux-start-today]").first()).toBeVisible();
});

test("configurações concentram dados do projeto e suportam teclado", async ({page}) => {
  await page.locator("[data-ux15-settings]").click();
  await expect(page).toHaveURL(/#\/perfil\/configuracoes$/);
  await expect(page.locator("[data-ux15-settings-page]")).toBeVisible({timeout: 30000});
  await expect(page.locator(".ux15-settings-tabs")).toHaveAttribute("role", "tablist");
  const geral = page.locator("[data-ux15-settings-tab=geral]");
  await expect(geral).toHaveAttribute("aria-selected", "true");
  await expect(geral).toHaveAttribute("tabindex", "0");
  await expect(geral).toHaveAttribute("aria-controls", "ux15-panel-geral");
  await expect(page.locator("#ux15-panel-geral")).toHaveAttribute("role", "tabpanel");
  await expect(page.locator("#ux15-panel-geral")).toHaveAttribute("aria-labelledby", "ux15-tab-geral");
  await geral.focus();
  await page.keyboard.press("ArrowRight");
  const estudo = page.locator("[data-ux15-settings-tab=estudo]");
  await expect(estudo).toHaveAttribute("aria-selected", "true");
  await expect(estudo).toBeFocused();
  await page.keyboard.press("End");
  const dados = page.locator("[data-ux15-settings-tab=dados]");
  await expect(dados).toHaveAttribute("aria-selected", "true");
  await expect(dados).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.locator("[data-ux15-settings-tab=geral]")).toBeFocused();
  await page.locator("[data-ux15-settings-tab=plataforma]").click();
  await expect(page.locator("[data-ux15-settings-page]")).toHaveAttribute("data-ux15-tab", "plataforma");
  const plataforma = page.locator("[data-ux15-settings-tab=plataforma]");
  await expect(plataforma).toHaveAttribute("aria-selected", "true");
  await expect(plataforma).toHaveAttribute("aria-controls", "ux15-panel-plataforma");
  await expect(plataforma).toBeFocused();
  await expect(page.locator("#ux15-panel-plataforma")).toHaveAttribute("role", "tabpanel");
  await expect(page.locator("#ux15-panel-plataforma")).toHaveAttribute("aria-labelledby", "ux15-tab-plataforma");
  await expect(page.getByRole("heading", {name: "Dados do projeto"})).toBeVisible();
  await expect(page.getByText("Questões publicadas")).toBeVisible();
  await expect(page.getByText("Banco Mestre")).toBeVisible();
  await expect(page.getByText("Última sincronização do catálogo")).toBeVisible();
  await expect(page.locator("[data-ux15-current-time]")).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await expect(page.locator("[data-ux15-sync-age]")).toContainText(/sincroniz/);
});

test("estudar preserva simulados por cargo sem poluir a tela", async ({page}) => {
  await page.goto("/#/estudar", {waitUntil: "domcontentloaded"});
  const templates = page.locator("[data-role-templates]");
  await expect(templates).toBeVisible({timeout: 30000});
  await expect(templates).not.toHaveAttribute("open", "");
  await templates.locator("summary").click();
  await expect(templates).toHaveAttribute("open", "");
  await expect(templates.locator("[data-ux15-role-sim]")).toHaveCount(2);
  await expect(page.locator("[data-official-exam-card]")).toBeVisible({timeout: 30000});
});

test("navegação contextual orienta sem aumentar o menu principal", async ({page}) => {
  await page.goto("/#/estudar", {waitUntil: "domcontentloaded"});
  const estudarBreadcrumb = page.locator("[data-ux15-breadcrumb=estudar]");
  await expect(estudarBreadcrumb).toContainText("Início");
  await expect(estudarBreadcrumb).toContainText("Estudar");
  await expect(estudarBreadcrumb.locator("[aria-current=page]")).toHaveText("Estudar");
  await page.goto("/#/revisar", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-breadcrumb=revisar] [aria-current=page]")).toHaveText("Revisar");
  await page.goto("/#/desempenho", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux15-breadcrumb=desempenho] [aria-current=page]")).toHaveText("Desempenho");
  await expect(page.locator(".mobile-nav a")).toHaveCount(4);
});

test("atalho de barra abre e foca a busca", async ({page}) => {
  await expect(page.locator("[data-ux15-home]")).toBeVisible({timeout: 30000});
  await page.keyboard.press("/");
  await expect(page).toHaveURL(/#\/estudar$/);
  await expect(page.locator("[data-ux-question-search]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-ux-question-search]")).toBeFocused();
});

test("mobile mantém quatro destinos principais e configurações no topo", async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator(".mobile-nav a")).toHaveCount(4);
  await expect(page.locator("[data-ux15-settings]")).toBeVisible({timeout: 30000});
  await expect(page.locator("[data-ux15-home]")).toBeVisible();
  await page.locator("[data-ux15-settings]").click();
  await expect(page).toHaveURL(/#\/perfil\/configuracoes$/);
  await expect(page.locator(".ux15-settings-tabs")).toBeVisible({timeout: 30000});
});

test("topo mobile não estoura com instalação PWA disponível", async ({page}) => {
  await page.setViewportSize({width: 360, height: 800});
  await page.goto("/#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("#install-app")).toHaveCount(1);
  await page.locator("#install-app").evaluate(button => { button.hidden = false; });
  await expect(page.locator("#install-app")).toBeVisible();
  await expect(page.locator(".brand strong")).toBeHidden();
  await expect.poll(() => page.locator(".topbar").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});
