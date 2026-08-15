import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));
const requireMarkers = (content, markers, context) => markers.forEach(marker => {
  if (!content.includes(marker)) throw new Error(`${context}: marcador ausente: ${marker}`);
});

const index = read("index.html");
const worker = read("service-worker.js");
const navigation = read("assets/navigation-v2-15.js");
const navigationPolish = read("assets/navigation-v2-15-polish.js");
const css = read("assets/navigation-v2-15.css");
const polishCss = read("assets/navigation-v2-15-polish.css");
const builder = read("scripts/build-public.mjs");
const publicVerifier = read("scripts/verify-public-release.mjs");
const deploymentVerifier = read("scripts/verify-deployment.mjs");
const publicPlaywright = read("playwright.public.config.js");
const packageData = read("package.json");
const publicReleaseContract = read("tests-public/release-contract.spec.js");
const publicDashboard = read("tests-public/dashboard-card.spec.js");
const publicNavigation = read("tests-public/navigation-v2-15.spec.js");
const publicUx = read("tests-public/ux-v2-14.spec.js");
const publicPlatform = read("tests-public/platform-v2-13.spec.js");
const localNavigation = read("tests/navigation-v2-15.spec.js");

requireMarkers(index, ["navigation-v2-15.css?v=1", "navigation-v2-15.js?v=1", "navigation-v2-15-polish.css?v=1", "navigation-v2-15-polish.js?v=1", "data-ux-tech-status>Configurações"], "HTML");
requireMarkers(worker, ["navigation-v2-15.css?v=1", "navigation-v2-15.js?v=1", "navigation-v2-15-polish.css?v=1", "navigation-v2-15-polish.js?v=1"], "Service worker");
requireMarkers(navigation, [
  "Seu estudo, sem ruído.",
  "Última sincronização do catálogo",
  "America/Sao_Paulo",
  "Configurações",
  "Dados do projeto",
  "data-ux15-current-time",
  "data-ux15-settings-tab",
  "dataset.ux15Settings",
  "#/perfil/configuracoes",
  "setNodeText",
], "Navegação v2.15");
if (navigation.includes('location.hash = "#/perfil";')) throw new Error("Navegação v2.15 voltou a depender da rota legada #/perfil.");
requireMarkers(navigationPolish, [
  "relativeCatalogAge",
  "Catálogo oficial atualizado em",
  "atualizado há",
  "ux15-breadcrumb",
  'aria-current="page"',
  "focusSearchWhenReady",
  "pruneLegacyHome",
  ":scope > [data-ux15-home]",
  "#/perfil/configuracoes",
  "history.replaceState",
  "ux15-settings-route",
  'event.key === "/"',
  "primeRouteClass",
  "injectRoleTemplatesInStudy",
  "enhanceSearchResultActions",
  "data-ux15-open-question",
  "reconcileHomeReviewTotal",
  "aria-selected",
  'aria-controls", "ux15-settings-panel"',
  'panel.id = "ux15-settings-panel"',
  "tabpanel",
  "aria-labelledby",
  "pendingSettingsTabFocus",
  "moveSettingsTabFocus",
  'event.key === "ArrowRight"',
  'event.key === "Home"',
  "button.tabIndex = active ? 0 : -1",
], "Polimento da navegação v2.15");
requireMarkers(css, ["ux15-home-active", "ux15-home-grid", "ux15-settings-page", "ux15-sync-card", "ux15-facts-grid"], "CSS v2.15");
requireMarkers(polishCss, ["ux15-clean-home", "ux15-settings-route", "ux15-sync-age", "ux15-sync-age.catalog", "ux15-breadcrumb", "ux15-role-templates", "data-ux15-open-question", ".brand strong{display:none}", ".top-actions{gap:6px}"], "CSS de polimento v2.15");
requireMarkers(builder, ["platform_navigation_js", "platform_navigation_css", "platform_navigation_polish_js", "platform_navigation_polish_css", "navigation-v2-15-polish.js", "navigation-v2-15-polish.css", "relativeCatalogAge", "Catálogo oficial atualizado em"], "Build público");
requireMarkers(publicPlaywright, ["release-contract.spec.js", "dashboard-card.spec.js", "material-downloads.spec.js", "platform-v2-13.spec.js", "ux-v2-14.spec.js", "navigation-v2-15.spec.js"], "Playwright público");
requireMarkers(packageData, ['"check": "node scripts/verify-public-release.mjs"'], "npm check");
requireMarkers(publicVerifier, ['const syntaxFiles = git(["ls-files"])', 'run("--check", [file])'], "Auditoria de sintaxe");
requireMarkers(deploymentVerifier, ["enhanceReleaseMetadata", "data-release-footer", "Dados do projeto", "Aguardando auditoria"], "Verificador público atual");
if (deploymentVerifier.includes("Integridade da publicação")) throw new Error("Verificador público ainda depende do cartão técnico removido da Home.");
requireMarkers(publicReleaseContract, ["arquitetura v2.15", "perfil/configuracoes", "[data-ux15-home]", "[data-official-exam-card]", "[data-adaptive-review]"], "Contrato público da release");
requireMarkers(publicDashboard, ["Configurações usa o release-meta reconciliado", "Banco Mestre", "navigation-v2-15.js?v=1"], "Smoke público do painel");
requireMarkers(publicNavigation, ["distingue catálogo de progresso", "Catálogo oficial atualizado em", "atualizad", "catalog"], "Smoke público da separação catálogo/progresso");
requireMarkers(publicUx, ["[data-ux15-open-question]", "question-search-index.json", "catalogo.json"], "Smoke público da busca");
requireMarkers(localNavigation, ["ux15-settings-panel", "aria-controls", "tabpanel", "aria-labelledby", "aria-current=page", "ArrowRight", "End", "Home", "#install-app", "scrollWidth <= element.clientWidth"], "Teste local de acessibilidade e PWA mobile");

for (const [name, content] of Object.entries({
  "release-contract": publicReleaseContract,
  "dashboard-card": publicDashboard,
  "navigation-v2-15": publicNavigation,
  "ux-v2-14": publicUx,
  "platform-v2-13": publicPlatform,
})) {
  if (content.includes('page.goto("/#/')) throw new Error(`${name}: rota pública absoluta ignora o subdiretório do GitHub Pages.`);
  if (content.includes('request.get("/data/')) throw new Error(`${name}: dado público absoluto ignora o subdiretório do GitHub Pages.`);
}
for (const forbidden of ["2946", "2871", 'app-v4.js?v=9']) {
  if (publicDashboard.includes(forbidden)) throw new Error(`dashboard-card ainda contém marcador histórico congelado: ${forbidden}`);
}

if (exists("dist")) {
  for (const required of ["dist/assets/navigation-v2-15.js", "dist/assets/navigation-v2-15.css", "dist/assets/navigation-v2-15-polish.js", "dist/assets/navigation-v2-15-polish.css", "dist/data/release/build-info.json", "dist/data/release/release-meta.json"]) {
    if (!exists(required)) throw new Error(`Pacote público sem recurso da navegação v2.15: ${required}`);
  }
  for (const relative of ["assets/navigation-v2-15.js", "assets/navigation-v2-15.css", "assets/navigation-v2-15-polish.js", "assets/navigation-v2-15-polish.css"]) {
    if (read(relative) !== read(`dist/${relative}`)) throw new Error(`O dist diverge da fonte canônica: ${relative}`);
  }
  const buildInfo = JSON.parse(read("dist/data/release/build-info.json"));
  const releaseMeta = JSON.parse(read("dist/data/release/release-meta.json"));
  for (const key of ["platform_navigation_js", "platform_navigation_css", "platform_navigation_polish_js", "platform_navigation_polish_css"]) {
    if (!buildInfo.source_files_sha256?.[key] || !releaseMeta.source_files_sha256?.[key]) throw new Error(`Proveniência da navegação v2.15 ausente: ${key}`);
  }
}

console.log("✓ Navegação v2.15 validada: Home limpa, catálogo oficial separado do progresso pessoal, Configurações com painel ARIA estável, PWA mobile sem overflow, simulados por cargo, busca individual e contrato público atual.");