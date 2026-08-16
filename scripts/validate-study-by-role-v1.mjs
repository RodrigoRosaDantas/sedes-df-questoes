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

for (const marker of [
  "Estudo por Cargo",
  "data-estudo-por-cargo-page",
  "cargo-study-app",
  "estudo-por-cargo-v1.js?v=1",
  "Voltar para Estudar",
  "Cargo → bloco → matéria → tópico → questões",
  "Conhecimentos gerais",
  "Conhecimentos comuns — nível médio",
  "Conhecimentos comuns — nível superior",
  "Conhecimentos específicos — Técnico Administrativo (202)",
  "Conhecimentos específicos — Administrador (400)",
  "LEVEL_COMMON_IDS",
  "data-role-knowledge-group",
]) must(sourcePage, marker, "Página filha");
for (const marker of [
  "COMMON_STUDY_SUBJECTS",
  "TARGET_STUDY_SUBJECTS",
  "rawEligibleSections",
  "buildStudySubject",
  "eligibleSections",
  "globalQuestionState",
  "activeHistory",
  'profileKey("session.v3")',
  "index.html#/resolver",
  "data-role-subject",
  "data-role-topic",
  "data-role-run-one",
  "Questões deste tópico",
  "Matérias do cargo",
  "Língua Portuguesa",
  "Lei Maria da Penha",
  "Lei Orgânica do Distrito Federal (LODF)",
  "Direito Administrativo",
  "Arquivologia",
  "Administração de Recursos Materiais",
  "Administração Geral e Pública",
  "Administração Financeira e Orçamentária (AFO)",
  "Gestão de Pessoas",
]) must(sourceJs, marker, "Motor Estudo por Cargo");
for (const marker of ["role-subject-grid", "role-topic-list", "role-question-list", "role-study-entry", "@media(max-width:720px)"]) must(sourceCss, marker, "Estilos Estudo por Cargo");
for (const marker of ["estudo-por-cargo-v1.css?v=1", "estudo-por-cargo-v1.js?v=1"]) must(sourceIndex, marker, "Entrada na plataforma");
for (const marker of ["STUDY_BY_ROLE_URL", "estudo-por-cargo.html", "edital-map-v1", "isStudyByRoleNavigation"]) must(sourceSw, marker, "PWA Estudo por Cargo");

for (const forbidden of [
  '<strong>${esc(cleanLabel(section.label))}</strong>',
  'Abrir matéria →',
]) {
  if (sourceJs.includes(forbidden)) throw new Error(`Taxonomia antiga ainda ativa no Estudo por Cargo: ${forbidden}`);
}

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
  const rawSections = (map.sections || []).filter(section => generalSections.has(section.id) || (section.items || []).some(item => specificItems.has(item.id)));
  const topics = rawSections.flatMap(section => (section.items || []).filter(item => generalSections.has(section.id) || specificItems.has(item.id)));
  const ids = new Set(topics.flatMap(item => item.question_ids || []));
  if (rawSections.length < 3 || topics.length < 10 || ids.size < 60) throw new Error(`Cargo ${code} sem cobertura suficiente para a taxonomia de matérias.`);
}

console.log("✓ Estudo por Cargo validado: conhecimentos gerais → comuns do nível/carreira → específicos do cargo → matérias → tópicos → questões, com progresso global e resolvedor compartilhado.");
