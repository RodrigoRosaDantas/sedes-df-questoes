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
], "Navegação v2.15");
requireMarkers(navigationPolish, ["relativeSync", "sincronizado há", "ux15-breadcrumb", "focusSearchWhenReady", "pruneLegacyHome", ":scope > [data-ux15-home]", 'event.key === "/"'], "Polimento da navegação v2.15");
requireMarkers(css, ["ux15-home-active", "ux15-home-grid", "ux15-settings-page", "ux15-sync-card", "ux15-facts-grid"], "CSS v2.15");
requireMarkers(polishCss, ["ux15-sync-age", "ux15-breadcrumb", "fresh", "attention", "stale"], "CSS de polimento v2.15");
requireMarkers(builder, ["platform_navigation_js", "platform_navigation_css", "platform_navigation_polish_js", "platform_navigation_polish_css", "navigation-v2-15-polish.js", "navigation-v2-15-polish.css"], "Build público");

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

console.log("✓ Navegação v2.15 validada: Home limpa, DOM enxuto, Brasília, Configurações, breadcrumbs e busca rápida.");
