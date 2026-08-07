import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const requireMarkers = (content, markers, context) => markers.forEach(marker => {
  if (!content.includes(marker)) throw new Error(`${context}: marcador ausente: ${marker}`);
});

const index = read("index.html");
const worker = read("service-worker.js");
const ux = read("assets/ux-v2-14.js");
const css = read("assets/ux-v2-14.css");
const builder = read("scripts/build-question-search-index.mjs");
requireMarkers(index, ["ux-v2-14.css?v=1", "ux-v2-14.js?v=1"], "HTML");
requireMarkers(worker, ["ux-v2-14.css?v=1", "ux-v2-14.js?v=1", "question-search-index.json"], "Service worker");
requireMarkers(ux, ["Estudo de hoje", "Busca inteligente", "Treino personalizado", "Por que você errou?", "Mapa de domínio por matéria", "Encerrar dominadas"], "UX");
requireMarkers(css, ["ux-focus-mode", "ux-today", "ux-start-grid", "ux-mastery-grid", "ux-error-reasons"], "CSS UX");
requireMarkers(builder, ["question-search-index.json", "question.texto_base", "question.comentario", "question.fundamento"], "Builder de busca");
const generated = path.join(root, "data/release/question-search-index.json");
if (fs.existsSync(generated)) {
  const catalog = JSON.parse(read("data/release/catalogo.json"));
  const search = JSON.parse(read("data/release/question-search-index.json"));
  const expected = Object.keys(catalog.question_index || {}).length;
  if (search.schema_version !== "1.0" || search.questions !== expected || search.items?.length !== expected) throw new Error("Índice textual gerado diverge do catálogo.");
}
console.log("✓ UX v2.14 validada: estudo diário, filtros, busca, foco mobile, diagnóstico e revisão.");
