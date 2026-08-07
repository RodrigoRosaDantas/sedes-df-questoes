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
const ux = read("assets/ux-v2-14.js");
const guardrails = read("assets/ux-v2-14-guardrails.js");
const css = read("assets/ux-v2-14.css");
const builder = read("scripts/build-question-search-index.mjs");
requireMarkers(index, ["ux-v2-14.css?v=1", "ux-v2-14.js?v=1", "ux-v2-14-guardrails.js?v=1"], "HTML");
requireMarkers(worker, ["ux-v2-14.css?v=1", "ux-v2-14.js?v=1", "ux-v2-14-guardrails.js?v=1", "question-search-index.json"], "Service worker");
requireMarkers(ux, ["Estudo de hoje", "Busca inteligente", "Treino personalizado", "Por que você errou?", "Mapa de domínio por matéria", "Encerrar dominadas"], "UX");
requireMarkers(guardrails, ["closeAfterConsecutiveCorrect: 3", "correctedFilteredIds", "data-ux-run-filter", "data-ux-close-mastered"], "Guardrails UX");
requireMarkers(css, ["ux-focus-mode", "ux-today", "ux-start-grid", "ux-mastery-grid", "ux-error-reasons"], "CSS UX");
requireMarkers(builder, ["question-search-index.json", "question.texto_base", "question.comentario", "question.fundamento"], "Builder de busca");

const generated = "data/release/question-search-index.json";
if (exists(generated)) {
  const catalog = JSON.parse(read("data/release/catalogo.json"));
  const search = JSON.parse(read(generated));
  const expected = Object.keys(catalog.question_index || {}).length;
  if (search.schema_version !== "1.0" || search.questions !== expected || search.items?.length !== expected) throw new Error("Índice textual gerado diverge do catálogo.");
  if (exists("dist")) {
    for (const required of ["dist/assets/ux-v2-14.js", "dist/assets/ux-v2-14-guardrails.js", "dist/assets/ux-v2-14.css", "dist/data/release/question-search-index.json", "dist/data/release/build-info.json", "dist/data/release/release-meta.json"]) {
      if (!exists(required)) throw new Error(`Pacote público sem recurso da UX v2.14: ${required}`);
    }
    if (read("assets/ux-v2-14.js") !== read("dist/assets/ux-v2-14.js") || read("assets/ux-v2-14-guardrails.js") !== read("dist/assets/ux-v2-14-guardrails.js") || read("assets/ux-v2-14.css") !== read("dist/assets/ux-v2-14.css")) throw new Error("O dist diverge das fontes da UX v2.14.");
    const publicSearch = JSON.parse(read("dist/data/release/question-search-index.json"));
    if (publicSearch.questions !== expected || publicSearch.items?.length !== expected) throw new Error("Índice textual público diverge do catálogo.");
    const buildInfo = JSON.parse(read("dist/data/release/build-info.json"));
    const releaseMeta = JSON.parse(read("dist/data/release/release-meta.json"));
    for (const key of ["platform_ux_js", "platform_ux_guardrails_js", "platform_ux_css"]) {
      if (!buildInfo.source_files_sha256?.[key] || !releaseMeta.source_files_sha256?.[key]) throw new Error(`Proveniência da UX v2.14 ausente: ${key}`);
    }
  }
}
console.log("✓ UX v2.14 validada: estudo diário, filtros, busca, foco mobile, diagnóstico e revisão.");
