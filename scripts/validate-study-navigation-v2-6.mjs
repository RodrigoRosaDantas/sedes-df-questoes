import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resolve = relative => path.join(root, relative.replace(/^\.\//, ""));
const read = relative => fs.readFileSync(resolve(relative), "utf8");
const readJSON = relative => JSON.parse(read(relative));
const fail = message => { throw new Error(message); };

const catalog = readJSON("data/release/catalogo.json");
const study = readJSON("data/release/study-index.json");
const app = read("assets/app-v4.js");
const html = read("index.html");
const css = read("assets/study-navigation-v2-6.css");

if (study.release_version !== catalog.release_version) fail("Índice de estudos pertence a outra release.");
if (study.summary.questions !== catalog.summary.questoes) fail("Total do índice de estudos divergente do catálogo.");
if (!Array.isArray(study.disciplines) || !study.disciplines.length) fail("Nenhuma matéria indexada.");

const catalogIds = new Set(Object.keys(catalog.question_index || {}));
const indexedIds = new Set();
for (const discipline of study.disciplines) {
  if (!discipline.name || !discipline.question_count || !Array.isArray(discipline.topics) || !discipline.topics.length) fail(`Matéria inválida: ${discipline.name || "sem nome"}.`);
  const topicIds = new Set();
  for (const topic of discipline.topics) {
    if (!topic.name || topic.question_count !== topic.question_ids.length) fail(`${discipline.name}: tópico inválido.`);
    for (const id of topic.question_ids) {
      if (topicIds.has(id)) fail(`${discipline.name}: questão repetida entre tópicos: ${id}.`);
      topicIds.add(id);
    }
  }
  if (topicIds.size !== discipline.question_count || discipline.question_ids.length !== discipline.question_count) fail(`${discipline.name}: fechamento da matéria divergente.`);
  for (const id of discipline.question_ids) {
    if (!topicIds.has(id)) fail(`${discipline.name}: questão fora dos tópicos: ${id}.`);
    if (indexedIds.has(id)) fail(`Questão atribuída a mais de uma matéria: ${id}.`);
    indexedIds.add(id);
  }
}
if (indexedIds.size !== catalogIds.size) fail("Cobertura global do índice de estudos divergente.");
for (const id of catalogIds) if (!indexedIds.has(id)) fail(`Questão ausente do índice de estudos: ${id}.`);

const proof = catalog.materials.find(item => item.id === "prova-qdx-seedf-2022-gppgadm-a");
if (!proof || String(proof.tipo_material).toLowerCase() !== "prova" || proof.quantidade_questoes !== 120) fail("Prova Quadrix 2022 não está disponível como material completo.");

for (const feature of [
  'const STUDY_INDEX_URL = "./data/release/study-index.json"',
  'data-study-view="materias"',
  'data-study-view="simulados"',
  'data-study-view="provas"',
  'function renderDisciplineTopics()',
  'data-start-topic-training',
  'view === "provas" || state.filters.level === "all"',
  '_discipline: question.disciplina || material.disciplina',
]) if (!app.includes(feature)) fail(`Funcionalidade de estudos ausente: ${feature}`);

if (!html.includes("assets/study-navigation-v2-6.css?v=1")) fail("Estilos da navegação de estudos não estão ativos.");
if (!html.includes("assets/app-v4.js?v=3")) fail("Cache do aplicativo não foi renovado para a navegação nova.");
for (const selector of [".study-view-tabs", ".discipline-grid", ".topic-list", ".topic-config"]) if (!css.includes(selector)) fail(`Estilo ausente: ${selector}`);

console.log(`✓ Navegação validada: ${study.summary.disciplines} matérias, ${study.summary.topics} tópicos, ${catalog.summary.simulados} simulados e ${catalog.summary.provas} prova(s).`);
