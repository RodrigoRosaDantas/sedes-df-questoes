import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const readDist = relative => fs.readFileSync(path.join(dist, relative), "utf8");
const requireMarkers = (content, markers, context) => {
  for (const marker of markers) if (!content.includes(marker)) throw new Error(`${context}: marcador ausente: ${marker}`);
};

const index = read("index.html");
const worker = read("service-worker.js");
const css = read("assets/ux-v2-14.css");
const js = read("assets/ux-v2-14.js");

requireMarkers(index, ["ux-v2-14.css?v=1", "ux-v2-14.js?v=1"], "HTML");
requireMarkers(worker, ["ux-v2-14.css?v=1", "ux-v2-14.js?v=1"], "Service worker");
requireMarkers(css, [
  "body[data-ux-route=\"inicio\"]",
  "today-panel",
  "ux-platform-status",
  "body[data-ux-route=\"resolver\"]",
  "ux-focus-mode",
  "ux-map-open",
  "@media (max-width:760px)",
  "prefers-reduced-motion",
], "CSS UX v2.14");
requireMarkers(js, [
  "progressive enhancement only",
  "data.uxRoute",
  "enhancePlatformStatus",
  "enhanceExam",
  "ux-focus-mode",
  "ux-map-open",
  "MutationObserver",
], "JS UX v2.14");

for (const relative of ["assets/ux-v2-14.css", "assets/ux-v2-14.js"]) {
  if (!fs.existsSync(path.join(dist, relative))) throw new Error(`Dist sem ${relative}.`);
  if (read(relative) !== readDist(relative)) throw new Error(`Dist diverge da fonte canônica: ${relative}.`);
}

if (/localStorage\.(?:clear|removeItem)\(/.test(js) && !js.includes("FOCUS_KEY")) throw new Error("A camada UX não deve apagar dados de estudo.");
if (js.includes("sedes.questoes.history") || js.includes("sedes.questoes.errors") || js.includes("sedes.questoes.marked")) throw new Error("A camada UX não deve escrever diretamente no histórico editorial do perfil.");

console.log("✓ UX v2.14 validada: desktop/mobile, modo foco, mapa móvel, status técnico recolhível e assets reproduzíveis.");
