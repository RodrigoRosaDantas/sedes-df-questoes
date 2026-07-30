import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPath = path.join(root, "assets", "app-v4.js");
const indexPath = path.join(root, "index.html");

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

let app = fs.readFileSync(appPath, "utf8");
if (app.includes(staleGuard)) {
  app = app.replace(staleGuard, dynamicGuard);
} else if (!app.includes("const indexedQuestions = Object.keys(state.catalog?.question_index || {}).length;")) {
  throw new Error("A validação do catálogo não pôde ser localizada para aplicação do hotfix.");
}
fs.writeFileSync(appPath, app);

let index = fs.readFileSync(indexPath, "utf8");
index = index.replace(/assets\/app-v4\.js\?v=\d+/, "assets/app-v4.js?v=2");
fs.writeFileSync(indexPath, index);

console.log("✓ Hotfix do catálogo aplicado: totais dinâmicos e cache do aplicativo renovado.");
