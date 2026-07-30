import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resolve = relative => path.join(root, relative.replace(/^\.\//, ""));
const appPath = resolve("assets/app-v4.js");
const indexPath = resolve("index.html");
const fragmentPath = resolve("scripts/fragments/study-navigation-v2-6.js.txt");

let app = fs.readFileSync(appPath, "utf8");
const fragment = fs.readFileSync(fragmentPath, "utf8").trim();

if (!app.includes('const STUDY_INDEX_URL = "./data/release/study-index.json";')) {
  app = app.replace('const EXAM_URL = "./data/concurso.json";', 'const EXAM_URL = "./data/concurso.json";\nconst STUDY_INDEX_URL = "./data/release/study-index.json";');
}

if (!app.includes("studyIndex: null")) {
  app = app.replace("  exam: null,", "  exam: null,\n  studyIndex: null,\n  studyView: \"materias\",\n  selectedDiscipline: null,");
}

app = app.replace("_discipline: material.disciplina, _cargo:", "_discipline: question.disciplina || material.disciplina, _cargo:");

const studyBlock = /function getFilteredMaterials\(\) \{[\s\S]*?\nfunction bindMaterialButtons\(\) \{/;
if (!studyBlock.test(app)) throw new Error("Bloco antigo da área Estudar não foi localizado.");
app = app.replace(studyBlock, `${fragment}\n\nfunction bindMaterialButtons() {`);

const oldFetch = `const [catalogResponse, examResponse] = await Promise.all([\n      fetch(CATALOG_URL, {cache: "no-store"}),\n      fetch(EXAM_URL, {cache: "no-store"}),\n    ]);`;
const newFetch = `const [catalogResponse, examResponse, studyIndexResponse] = await Promise.all([\n      fetch(CATALOG_URL, {cache: "no-store"}),\n      fetch(EXAM_URL, {cache: "no-store"}),\n      fetch(STUDY_INDEX_URL, {cache: "no-store"}),\n    ]);`;
if (!app.includes(oldFetch)) throw new Error("Inicialização antiga do catálogo não foi localizada.");
app = app.replace(oldFetch, newFetch);
app = app.replace('if (!examResponse.ok) throw new Error(`Concurso: HTTP ${examResponse.status}`);', 'if (!examResponse.ok) throw new Error(`Concurso: HTTP ${examResponse.status}`);\n    if (!studyIndexResponse.ok) throw new Error(`Índice de estudos: HTTP ${studyIndexResponse.status}`);');
app = app.replace("    state.exam = await examResponse.json();", "    state.exam = await examResponse.json();\n    state.studyIndex = await studyIndexResponse.json();");

fs.writeFileSync(appPath, app);

let index = fs.readFileSync(indexPath, "utf8");
if (!index.includes("assets/study-navigation-v2-6.css")) {
  index = index.replace('  <link rel="stylesheet" href="./assets/question-images-v2-5.css?v=1">', '  <link rel="stylesheet" href="./assets/question-images-v2-5.css?v=1">\n  <link rel="stylesheet" href="./assets/study-navigation-v2-6.css?v=1">');
}
index = index.replace(/assets\/app-v4\.js\?v=\d+/, "assets/app-v4.js?v=3");
fs.writeFileSync(indexPath, index);

console.log("✓ Navegação de estudos aplicada: matérias, tópicos, simulados e provas anteriores.");
