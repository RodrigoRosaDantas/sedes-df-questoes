import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resolve = relative => path.join(root, relative.replace(/^\.\//, ""));
const read = relative => fs.readFileSync(resolve(relative), "utf8");
const readJSON = relative => JSON.parse(read(relative));
const fail = message => { throw new Error(message); };
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

const config = readJSON("data/release-config.json");
const catalog = readJSON("data/release/catalogo.json");
const manifest = readJSON("data/release/manifest.json");
const app = read("assets/app-v4.js");
const migration = read("assets/progress-migration-v2-3.js");
const index = read("index.html");
const styles = read("assets/quality-v2-3.css");

if (catalog.release_version !== config.release_version) fail("Versão do catálogo divergente da configuração.");
if (catalog.summary.banco_mestre !== config.banco_mestre) fail("Total do Banco Mestre divergente.");
if (catalog.summary.aguardando_auditoria !== config.aguardando_auditoria) fail("Total em auditoria divergente.");
if (catalog.summary.questoes !== config.expected_questions) fail("Total publicado divergente.");
if (catalog.summary.materiais !== config.expected_materials) fail("Total de materiais divergente.");
if (catalog.materials.length !== config.expected_materials) fail("Lista de materiais incompleta.");
if (Object.keys(catalog.question_index || {}).length !== config.expected_questions) fail("Índice de questões incompleto.");
if (manifest.materials.length !== config.expected_materials) fail("Manifesto de materiais incompleto.");

const catalogContent = read("data/release/catalogo.json");
if (manifest.catalog_sha256 !== sha256(catalogContent)) fail("Hash do catálogo divergente.");

const ids = new Set();
const codes = new Set();
let questions = 0;
for (const meta of catalog.materials) {
  if (!meta.file || !fs.existsSync(resolve(meta.file))) fail(`${meta.id}: arquivo publicado ausente.`);
  const content = fs.readFileSync(resolve(meta.file));
  const manifestItem = manifest.materials.find(item => item.id === meta.id);
  if (!manifestItem) fail(`${meta.id}: ausente do manifesto.`);
  if (manifestItem.bytes !== content.length || manifestItem.sha256 !== sha256(content)) fail(`${meta.id}: integridade divergente.`);
  const material = JSON.parse(content.toString("utf8"));
  if (material.questoes.length !== meta.quantidade_questoes) fail(`${meta.id}: contagem divergente.`);
  for (const question of material.questoes) {
    questions += 1;
    if (!question.id || !question.codigo || !question.enunciado || !question.comentario) fail(`${meta.id}: questão incompleta.`);
    if (ids.has(question.id) || codes.has(question.codigo)) fail(`Questão duplicada: ${question.id}/${question.codigo}.`);
    ids.add(question.id); codes.add(question.codigo);
    if (catalog.question_index[question.id] !== meta.id) fail(`${question.id}: índice aponta para material incorreto.`);
    for (const letter of ["A", "B", "C", "D", "E"]) if (!question.alternativas?.[letter]) fail(`${question.codigo}: alternativa ${letter} ausente.`);
    if (!["A", "B", "C", "D", "E", "Certo", "Errado", "Anulada"].includes(question.gabarito)) fail(`${question.codigo}: gabarito inválido.`);
  }
}
if (questions !== config.expected_questions || ids.size !== config.expected_questions || codes.size !== config.expected_questions) fail("Fechamento global da release inválido.");

for (const legacy of ["bundle-fetch.js", "data-updates.js", "consolidated-data-v2.js", "profile-defaults.js", "ux-improvements.js", "app-v3.js"]) {
  if (index.includes(legacy)) fail(`Camada legada ainda ativa no HTML: ${legacy}`);
}
if (!index.includes("assets/progress-migration-v2-3.js") || !index.includes("assets/app-v4.js") || !index.includes("assets/quality-v2-3.css")) fail("Migração, aplicativo ou estilos da release 2.3 não estão ativos.");
if (!app.includes('const CATALOG_URL = "./data/release/catalogo.json"')) fail("Aplicativo não referencia o catálogo estático final.");
if (app.includes("CompressionStream") || app.includes("DecompressionStream") || app.includes("window.fetch =")) fail("O navegador ainda executa montagem ou recompressão do banco.");

for (const feature of [
  "answeredQuestionIds",
  "presentedQuestionIds",
  "ensureCanStartNewAttempt",
  "pagehide",
  "visibilitychange",
  "questionIds: state.questions.map",
  "loadQuestionsByIds",
  "Exportar progresso",
  "Importar backup",
  "aria-live=\"polite\"",
  "aria-current=\"step\"",
  "focusMainHeading",
  "result-options",
]) if (!app.includes(feature)) fail(`Melhoria obrigatória ausente: ${feature}`);

for (const feature of ["progressMigration.v2.3", "answeredQuestionIds", "metricsMigrated", "answerEvidence"]) {
  if (!migration.includes(feature)) fail(`Proteção de migração ausente: ${feature}`);
}
if (app.includes("questions: state.questions")) fail("A sessão ainda armazena o conteúdo completo das questões.");
for (const assignment of [
  '{id: "rodrigo", name: "Rodrigo", roles: ["202", "400"]}',
  '{id: "amanda", name: "Amanda", roles: ["202", "403"]}',
  '{id: "andressa", name: "Andressa", roles: ["200", "405"]}',
]) if (!app.includes(assignment)) fail(`Vínculo de perfil ausente: ${assignment}`);

for (const selector of [".sr-only", ".dialog-backdrop", ".result-option", ":focus-visible", "prefers-reduced-motion"]) {
  if (!styles.includes(selector)) fail(`Estilo de acessibilidade ausente: ${selector}`);
}

console.log(`✓ Release ${config.release_version} validada: ${catalog.materials.length} materiais, ${questions} questões, pacote estático, sessões compactas e métricas corrigidas.`);
