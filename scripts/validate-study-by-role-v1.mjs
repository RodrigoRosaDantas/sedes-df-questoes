import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const must = (content, marker, label) => {
  if (!content.includes(marker)) throw new Error(`${label}: marcador ausente: ${marker}`);
};

const sourcePage = read("estudo-por-cargo.html");
const sourceJs = read("assets/estudo-por-cargo-v1.js");
const sourceCss = read("assets/estudo-por-cargo-v1.css");
const sourceIndex = read("index.html");
const sourceSw = read("service-worker.js");

for (const marker of ["Estudo por Cargo", "data-estudo-por-cargo-page", "cargo-study-app", "estudo-por-cargo-v1.js?v=1", "Voltar para Estudar"]) must(sourcePage, marker, "Página filha");
for (const marker of ["eligibleSections", "globalQuestionState", "activeHistory", 'profileKey("session.v3")', "index.html#/resolver", "data-role-subject", "data-role-topic", "data-role-run-one", "Questões deste tópico", "alimentado por qualquer modo"]) must(sourceJs, marker, "Motor Estudo por Cargo");
for (const marker of ["role-subject-grid", "role-topic-list", "role-question-list", "role-study-entry", "@media(max-width:720px)"]) must(sourceCss, marker, "Estilos Estudo por Cargo");
for (const marker of ["estudo-por-cargo-v1.css?v=1", "estudo-por-cargo-v1.js?v=1"]) must(sourceIndex, marker, "Entrada na plataforma");
for (const marker of ["STUDY_BY_ROLE_URL", "estudo-por-cargo.html", "edital-map-v1", "isStudyByRoleNavigation"]) must(sourceSw, marker, "PWA Estudo por Cargo");

for (const relative of ["estudo-por-cargo.html", "assets/estudo-por-cargo-v1.js", "assets/estudo-por-cargo-v1.css", "data/release/edital-map-v1.json"]) {
  if (!fs.existsSync(path.join(root, "dist", relative))) throw new Error(`Dist sem recurso do Estudo por Cargo: ${relative}`);
}
if (read("estudo-por-cargo.html") !== read("dist/estudo-por-cargo.html")) throw new Error("Página filha no dist diverge da fonte.");
if (read("assets/estudo-por-cargo-v1.js") !== read("dist/assets/estudo-por-cargo-v1.js")) throw new Error("JS do Estudo por Cargo no dist diverge da fonte.");
if (read("assets/estudo-por-cargo-v1.css") !== read("dist/assets/estudo-por-cargo-v1.css")) throw new Error("CSS do Estudo por Cargo no dist diverge da fonte.");

const map = JSON.parse(read("dist/data/release/edital-map-v1.json"));
for (const code of ["202", "400"]) {
  const target = map.targets?.[code];
  if (!target) throw new Error(`Mapa sem cargo ${code}.`);
  const generalSections = new Set(map.general_section_ids || []);
  const specificItems = new Set(target.specific_item_ids || []);
  const subjects = (map.sections || []).filter(section => generalSections.has(section.id) || (section.items || []).some(item => specificItems.has(item.id)));
  const topics = subjects.flatMap(section => (section.items || []).filter(item => generalSections.has(section.id) || specificItems.has(item.id)));
  const ids = new Set(topics.flatMap(item => item.question_ids || []));
  if (subjects.length < 3 || topics.length < 10 || ids.size < 60) throw new Error(`Cargo ${code} sem cobertura suficiente para navegação por matéria/tópico.`);
}

console.log("✓ Estudo por Cargo validado: página filha independente, cargo → matéria → tópico → questões, progresso global e resolvedor compartilhado.");
