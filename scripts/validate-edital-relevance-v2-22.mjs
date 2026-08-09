import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {targetQuestionIdsForStudyIndex} from "../assets/home-study-edital-v2-18.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const studyIndex = JSON.parse(fs.readFileSync(path.join(root, "data/release/study-index.json"), "utf8"));
const target202 = targetQuestionIdsForStudyIndex(studyIndex, "202");
const target400 = targetQuestionIdsForStudyIndex(studyIndex, "400");

if (!target202.size || !target400.size) throw new Error("O recorte por edital não pode ficar vazio.");

const arts = (studyIndex.disciplines || []).find(item => item.name === "Artes");
if (!arts?.question_ids?.length) throw new Error("Disciplina Artes esperada no índice de regressão não foi encontrada.");
for (const id of arts.question_ids) {
  if (target202.has(id)) throw new Error(`Falso positivo no cargo 202: questão de Artes ${id}.`);
  if (target400.has(id)) throw new Error(`Falso positivo no cargo 400: questão de Artes ${id}.`);
}

for (const id of [
  "prova-qdx-seedf-2025-art-a-102",
  "prova-qdx-seedf-2025-art-a-103",
  "prova-qdx-seedf-2025-art-a-108",
]) {
  if (target400.has(id)) throw new Error(`Colisão semântica não corrigida no cargo 400: ${id}.`);
}

const allIds = new Set((studyIndex.disciplines || []).flatMap(item => item.question_ids || []));
for (const [label, ids] of [["202", target202], ["400", target400]]) {
  for (const id of ids) if (!allIds.has(id)) throw new Error(`Recorte ${label} contém ID inexistente: ${id}.`);
}

console.log(`✓ Relevância v2.22: cargo 202=${target202.size}; cargo 400=${target400.size}; Artes excluída de ambos os recortes.`);
