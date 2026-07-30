import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const writeDist = (relative, content) => {
  const target = path.join(dist, relative);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, content);
};
const copy = (source, target = source) => {
  const sourcePath = path.join(root, source);
  if (!fs.existsSync(sourcePath)) throw new Error(`Arquivo obrigatório ausente: ${source}`);
  fs.cpSync(sourcePath, path.join(dist, target), {recursive: true});
};
const requireMarker = (content, marker, context) => {
  if (!content.includes(marker)) throw new Error(`${context}: marcador obrigatório ausente: ${marker}`);
};

function compileApplication() {
  let app = read("assets/app-v4.js");
  const fragment = read("scripts/fragments/study-navigation-v2-6.js.txt").trim();

  const staleGuard = 'if (state.catalog.summary.questoes !== 570 || state.catalog.summary.materiais !== 35) throw new Error("Release incompleta.");';
  const dynamicGuard = `const declaredQuestions = Number(state.catalog?.summary?.questoes);
    const declaredMaterials = Number(state.catalog?.summary?.materiais);
    const indexedQuestions = Object.keys(state.catalog?.question_index || {}).length;
    const listedMaterials = Array.isArray(state.catalog?.materials) ? state.catalog.materials.length : 0;
    if (!Number.isInteger(declaredQuestions) || declaredQuestions <= 0 ||
        !Number.isInteger(declaredMaterials) || declaredMaterials <= 0 ||
        declaredQuestions !== indexedQuestions || declaredMaterials !== listedMaterials) {
      throw new Error("Catálogo inconsistente.");
    }`;
  if (!app.includes(staleGuard)) throw new Error("Fonte-base: validação antiga do catálogo não localizada.");
  app = app.replace(staleGuard, dynamicGuard);

  app = app.replace(
    'const EXAM_URL = "./data/concurso.json";',
    'const EXAM_URL = "./data/concurso.json";\nconst STUDY_INDEX_URL = "./data/release/study-index.json";'
  );
  app = app.replace(
    "  exam: null,",
    '  exam: null,\n  studyIndex: null,\n  studyView: "materias",\n  selectedDiscipline: null,'
  );
  app = app.replace(
    "_discipline: material.disciplina, _cargo:",
    "_discipline: question.disciplina || material.disciplina, _cargo:"
  );

  const studyBlock = /function getFilteredMaterials\(\) \{[\s\S]*?\nfunction bindMaterialButtons\(\) \{/;
  if (!studyBlock.test(app)) throw new Error("Fonte-base: área Estudar antiga não localizada.");
  app = app.replace(studyBlock, `${fragment}\n\nfunction bindMaterialButtons() {`);

  const oldFetch = `const [catalogResponse, examResponse] = await Promise.all([\n      fetch(CATALOG_URL, {cache: "no-store"}),\n      fetch(EXAM_URL, {cache: "no-store"}),\n    ]);`;
  const newFetch = `const [catalogResponse, examResponse, studyIndexResponse] = await Promise.all([\n      fetch(CATALOG_URL, {cache: "no-store"}),\n      fetch(EXAM_URL, {cache: "no-store"}),\n      fetch(STUDY_INDEX_URL, {cache: "no-store"}),\n    ]);`;
  if (!app.includes(oldFetch)) throw new Error("Fonte-base: inicialização antiga não localizada.");
  app = app.replace(oldFetch, newFetch);
  app = app.replace(
    'if (!examResponse.ok) throw new Error(`Concurso: HTTP ${examResponse.status}`);',
    'if (!examResponse.ok) throw new Error(`Concurso: HTTP ${examResponse.status}`);\n    if (!studyIndexResponse.ok) throw new Error(`Índice de estudos: HTTP ${studyIndexResponse.status}`);'
  );
  app = app.replace(
    "    state.exam = await examResponse.json();",
    "    state.exam = await examResponse.json();\n    state.studyIndex = await studyIndexResponse.json();"
  );

  for (const marker of [
    "const indexedQuestions = Object.keys(state.catalog?.question_index || {}).length;",
    'const STUDY_INDEX_URL = "./data/release/study-index.json";',
    'data-study-view="materias"',
    'data-study-view="simulados"',
    'data-study-view="provas"',
    "function renderDisciplineTopics()",
    "Catálogo inconsistente.",
  ]) requireMarker(app, marker, "Aplicação compilada");

  return app;
}

function compileIndex() {
  let index = read("index.html");

  if (!index.includes('rel="manifest"')) {
    index = index.replace(
      '<meta name="description"',
      '<link rel="manifest" href="./manifest.webmanifest">\n  <meta name="apple-mobile-web-app-capable" content="yes">\n  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n  <meta name="description"'
    );
  }
  if (!index.includes("assets/study-navigation-v2-6.css")) {
    index = index.replace(
      '  <link rel="stylesheet" href="./assets/question-images-v2-5.css?v=1">',
      '  <link rel="stylesheet" href="./assets/question-images-v2-5.css?v=1">\n  <link rel="stylesheet" href="./assets/study-navigation-v2-6.css?v=1">'
    );
  }
  if (!index.includes("assets/intelligence-v2-9.css")) {
    index = index.replace(
      '  <link rel="stylesheet" href="./assets/study-navigation-v2-6.css?v=1">',
      '  <link rel="stylesheet" href="./assets/study-navigation-v2-6.css?v=1">\n  <link rel="stylesheet" href="./assets/intelligence-v2-9.css?v=1">'
    );
  }
  if (!index.includes("assets/reports-v2-10.css")) {
    index = index.replace(
      '  <link rel="stylesheet" href="./assets/intelligence-v2-9.css?v=1">',
      '  <link rel="stylesheet" href="./assets/intelligence-v2-9.css?v=1">\n  <link rel="stylesheet" href="./assets/reports-v2-10.css?v=2">'
    );
  }

  index = index.replace(/assets\/app-v4\.js\?v=\d+/, "assets/app-v4.js?v=6");
  if (!index.includes("assets/learning-v2-9.js")) {
    index = index.replace(
      '  <script type="module" src="./assets/app-v4.js?v=6"></script>',
      '  <script type="module" src="./assets/app-v4.js?v=6"></script>\n  <script type="module" src="./assets/learning-v2-9.js?v=1"></script>\n  <script type="module" src="./assets/pwa-v2-9.js?v=1"></script>\n  <script type="module" src="./assets/reports-v2-10.js?v=2"></script>'
    );
  }

  for (const marker of [
    "manifest.webmanifest",
    "study-navigation-v2-6.css?v=1",
    "intelligence-v2-9.css?v=1",
    "reports-v2-10.css?v=2",
    "app-v4.js?v=6",
    "learning-v2-9.js?v=1",
    "pwa-v2-9.js?v=1",
    "reports-v2-10.js?v=2",
  ]) requireMarker(index, marker, "HTML compilado");

  return index;
}

fs.rmSync(dist, {recursive: true, force: true});
fs.mkdirSync(dist, {recursive: true});
copy("manifest.webmanifest");
copy("service-worker.js");
copy("assets");
copy("data/concurso.json");
copy("data/release");
writeDist("index.html", compileIndex());
writeDist("assets/app-v4.js", compileApplication());
writeDist(".nojekyll", "");

const forbidden = ["scripts", ".github", "data/consolidated", "data/true-false"];
for (const entry of forbidden) {
  if (fs.existsSync(path.join(dist, entry))) throw new Error(`Conteúdo de desenvolvimento exposto no dist: ${entry}`);
}

const catalog = JSON.parse(fs.readFileSync(path.join(dist, "data/release/catalogo.json"), "utf8"));
const packageData = JSON.parse(read("package.json"));
const materialCount = Array.isArray(catalog.materials) ? catalog.materials.length : 0;
const questionCount = Object.keys(catalog.question_index || {}).length;
const materialDir = path.join(dist, "data/release/materials");
const materialFiles = fs.existsSync(materialDir) ? fs.readdirSync(materialDir).filter(file => file.endsWith(".json")).length : 0;

if (!materialCount || !questionCount) throw new Error("Dist gerado sem materiais ou questões.");
if (Number(catalog.summary?.questoes) !== questionCount) throw new Error(`Catálogo divergente: summary.questoes=${catalog.summary?.questoes}, índice=${questionCount}.`);
if (Number(catalog.summary?.materiais) !== materialCount) throw new Error(`Catálogo divergente: summary.materiais=${catalog.summary?.materiais}, lista=${materialCount}.`);
if (materialFiles !== materialCount) throw new Error(`Arquivos de material divergentes: ${materialFiles} arquivos para ${materialCount} materiais.`);

const buildInfo = {
  version: packageData.version,
  data_release_version: catalog.release_version || null,
  catalog_schema_version: catalog.schema_version || null,
  generated_at: new Date().toISOString(),
  source_sha: process.env.GITHUB_SHA || "local",
  builder: "build-public-v2-11",
  questions: questionCount,
  materials: materialCount,
  material_files: materialFiles,
};
writeDist("data/release/build-info.json", `${JSON.stringify(buildInfo, null, 2)}\n`);

console.log(`✓ Build público determinístico ${packageData.version}: ${questionCount} questões, ${materialCount} materiais, sem mutação do código-fonte.`);
