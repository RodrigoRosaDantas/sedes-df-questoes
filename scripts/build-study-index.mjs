import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resolve = relative => path.join(root, relative.replace(/^\.\//, ""));
const readJSON = relative => JSON.parse(fs.readFileSync(resolve(relative), "utf8"));
const catalog = readJSON("data/release/catalogo.json");
const disciplines = new Map();
const seenQuestions = new Set();

function normalized(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

for (const meta of catalog.materials || []) {
  const material = readJSON(meta.file);
  for (const question of material.questoes || []) {
    if (!question.id || seenQuestions.has(question.id)) throw new Error(`Questão inválida ou repetida no índice de estudos: ${question.id || "sem ID"}`);
    seenQuestions.add(question.id);
    const disciplineName = normalized(question.disciplina, normalized(material.disciplina, "Sem classificação"));
    const topicName = normalized(question.assunto, "Outros tópicos");
    if (!disciplines.has(disciplineName)) {
      disciplines.set(disciplineName, {
        name: disciplineName,
        question_ids: [],
        material_ids: new Set(),
        topics: new Map(),
      });
    }
    const discipline = disciplines.get(disciplineName);
    discipline.question_ids.push(question.id);
    discipline.material_ids.add(material.id);
    if (!discipline.topics.has(topicName)) discipline.topics.set(topicName, []);
    discipline.topics.get(topicName).push(question.id);
  }
}

if (seenQuestions.size !== Number(catalog.summary?.questoes || 0)) {
  throw new Error(`Índice de estudos incompleto: ${seenQuestions.size}/${catalog.summary?.questoes || 0}.`);
}

const output = {
  schema_version: "1.0",
  release_version: catalog.release_version,
  generated_at: new Date().toISOString(),
  summary: {
    disciplines: disciplines.size,
    topics: [...disciplines.values()].reduce((sum, item) => sum + item.topics.size, 0),
    questions: seenQuestions.size,
  },
  disciplines: [...disciplines.values()]
    .map(discipline => ({
      name: discipline.name,
      question_count: discipline.question_ids.length,
      question_ids: discipline.question_ids,
      material_count: discipline.material_ids.size,
      material_ids: [...discipline.material_ids],
      topics: [...discipline.topics.entries()]
        .map(([name, ids]) => ({name, question_count: ids.length, question_ids: ids}))
        .sort((a, b) => b.question_count - a.question_count || a.name.localeCompare(b.name, "pt-BR")),
    }))
    .sort((a, b) => b.question_count - a.question_count || a.name.localeCompare(b.name, "pt-BR")),
};

fs.writeFileSync(resolve("data/release/study-index.json"), `${JSON.stringify(output, null, 2)}\n`);
console.log(`✓ Índice de estudos gerado: ${output.summary.disciplines} matérias, ${output.summary.topics} tópicos e ${output.summary.questions} questões.`);
