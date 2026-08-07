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
const tfIndex = readJSON("data/true-false/index.json");
const activeEntries = Array.isArray(tfIndex.materials) ? tfIndex.materials : [];
const activeQuestions = activeEntries.reduce((sum, item) => sum + Number(item.expected_questions || 0), 0);
const snapshotPath = resolve("data/notion/published.json");
const snapshotInstalled = fs.existsSync(snapshotPath) && read("data/notion/published.json").trim();
const snapshot = snapshotInstalled ? readJSON("data/notion/published.json") : null;
const expectedQuestions = snapshot ? Number(catalog.summary.questoes) : Number(config.expected_questions) + activeQuestions;
const expectedMaterials = snapshot ? Number(catalog.summary.materiais) : Number(config.expected_materials) + activeEntries.length;
const expectedBank = snapshot ? Number(snapshot.totals.all) : Number(config.banco_mestre);
const expectedPending = snapshot ? Math.max(0, Number(snapshot.totals.all) - expectedQuestions) : Number(config.aguardando_auditoria) - activeQuestions;
const expectedTrueFalse = snapshot
  ? null
  : activeQuestions;
const app = read("assets/app-v4.js");
const migration = read("assets/progress-migration-v2-3.js");
const imageSupport = read("assets/question-images-v2-5.js");
const index = read("index.html");
const styles = `${read("assets/quality-v2-3.css")}\n${read("assets/true-false.css")}\n${read("assets/question-images-v2-5.css")}`;

if (catalog.release_version !== config.release_version) fail("Versão do catálogo divergente da configuração.");
if (catalog.summary.banco_mestre !== expectedBank) fail("Total do Banco Mestre divergente.");
if (catalog.summary.aguardando_auditoria !== expectedPending) fail("Total em auditoria divergente.");
if (catalog.summary.questoes !== expectedQuestions) fail("Total publicado divergente.");
if (catalog.summary.materiais !== expectedMaterials) fail("Total de materiais divergente.");
if (catalog.materials.length !== expectedMaterials) fail("Lista de materiais incompleta.");
if (Object.keys(catalog.question_index || {}).length !== expectedQuestions) fail("Índice de questões incompleto.");
if (manifest.materials.length !== expectedMaterials) fail("Manifesto de materiais incompleto.");

const catalogContent = read("data/release/catalogo.json");
if (manifest.catalog_sha256 !== sha256(catalogContent)) fail("Hash do catálogo divergente.");

function questionFormat(question, material) {
  const declared = question.formato_questao || material.formato_questao || material.formato || "";
  if (/certo\s*\/\s*errado/i.test(declared) || ["Certo", "Errado"].includes(question.gabarito)) return "Certo / Errado";
  return "Múltipla escolha A–E";
}
function validateAlternatives(question, material) {
  const format = questionFormat(question, material);
  if (format === "Certo / Errado") {
    if (!["Certo", "Errado", "Anulada"].includes(question.gabarito)) fail(`${question.codigo}: gabarito C/E inválido.`);
    if (question.alternativas?.Certo !== "Certo" || question.alternativas?.Errado !== "Errado") fail(`${question.codigo}: opções C/E inválidas.`);
    return format;
  }
  for (const letter of ["A", "B", "C", "D", "E"]) if (!question.alternativas?.[letter]) fail(`${question.codigo}: alternativa ${letter} ausente.`);
  if (!["A", "B", "C", "D", "E", "Anulada"].includes(question.gabarito)) fail(`${question.codigo}: gabarito A–E inválido.`);
  return format;
}

const ids = new Set();
const codes = new Set();
const sourceCodes = new Set();
const publicQuestionsByCode = new Map();
let questions = 0;
let trueFalseQuestions = 0;
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
    if (!question.id || !question.codigo || !question.enunciado) fail(`${meta.id}: questão sem identificação ou enunciado.`);
    const pendingComment = question.comentario_status === "pendente" || material.comentarios_status === "pendente";
    if (!question.comentario && !pendingComment) fail(`${question.codigo}: comentário ausente sem indicação editorial.`);
    if (pendingComment && String(material.tipo_material).toLowerCase() !== "prova") fail(`${question.codigo}: comentário pendente fora de prova anterior.`);
    if (question.possui_imagem && (!question.imagem || !question.descricao_imagem || !fs.existsSync(resolve(question.imagem)))) fail(`${question.codigo}: recurso visual publicado está incompleto.`);
    if (ids.has(question.id) || codes.has(question.codigo)) fail(`Questão duplicada: ${question.id}/${question.codigo}.`);
    ids.add(question.id); codes.add(question.codigo); publicQuestionsByCode.set(question.codigo, question);
    if (question.codigo_fonte) sourceCodes.add(question.codigo_fonte);
    if (catalog.question_index[question.id] !== meta.id) fail(`${question.id}: índice aponta para material incorreto.`);
    if (validateAlternatives(question, material) === "Certo / Errado") trueFalseQuestions += 1;
  }
}
if (questions !== expectedQuestions || ids.size !== expectedQuestions || codes.size !== expectedQuestions) fail("Fechamento global da release inválido.");
if (snapshot ? trueFalseQuestions < activeQuestions : trueFalseQuestions !== expectedTrueFalse) fail(`Total C/E ativo divergente: mínimo/esperado ${snapshot ? activeQuestions : expectedTrueFalse}, encontrado ${trueFalseQuestions}.`);
if (codes.has("PROVA-QDX-SEEDF-2022-GPPGADM-A-031")) fail("Item 31 anulado voltou ao catálogo público.");
const corrected113 = publicQuestionsByCode.get("PROVA-QDX-SEEDF-2022-GPPGADM-A-113");
if (!corrected113 || corrected113.gabarito !== "Certo" || corrected113.anulada !== false) fail("Item 113 não reproduz o gabarito definitivo Certo.");

if (snapshot) {
  for (const record of snapshot.records) {
    if (!codes.has(record.code) && !sourceCodes.has(record.code)) fail(`${record.code}: registro publicável do Notion não entrou na release.`);
  }
}
for (const entry of activeEntries) {
  const source = readJSON(entry.file);
  if (source.questoes.length !== Number(entry.expected_questions)) fail(`${source.id}: lote ativo incompleto.`);
  if (source.lote_publicacao !== entry.lote_publicacao) fail(`${source.id}: identificador editorial divergente.`);
  if (source.questoes.length === 120) {
    const numbers = source.questoes.map(item => Number(item.numero)).sort((a, b) => a - b);
    for (let number = 1; number <= 120; number += 1) if (numbers[number - 1] !== number) fail(`${source.id}: sequência 1–120 incompleta na posição ${number}.`);
  }
}

for (const legacy of ["bundle-fetch.js", "data-updates.js", "consolidated-data-v2.js", "profile-defaults.js", "ux-improvements.js", "app-v3.js"]) if (index.includes(legacy)) fail(`Camada legada ainda ativa no HTML: ${legacy}`);
if (!index.includes("assets/progress-migration-v2-3.js") || !index.includes("assets/app-v4.js") || !index.includes("assets/true-false.css") || !index.includes("assets/question-images-v2-5.js")) fail("Aplicativo ou camadas da release híbrida não estão ativos.");
if (!app.includes('const CATALOG_URL = "./data/release/catalogo.json?release=3048-3046-71-r5"')) fail("Aplicativo não referencia o catálogo estático final versionado.");
if (!app.includes("Object.entries(question.alternativas || {})")) fail("Resolvedor não renderiza alternativas dinâmicas.");
if (!app.includes("letter === question.gabarito")) fail("Resolvedor não compara respostas dinâmicas ao gabarito.");
if (app.includes("CompressionStream") || app.includes("DecompressionStream") || app.includes("window.fetch =")) fail("O navegador ainda executa montagem ou recompressão do banco.");
for (const feature of ["answeredQuestionIds", "presentedQuestionIds", "ensureCanStartNewAttempt", "pagehide", "visibilitychange", "questionIds: state.questions.map", "loadQuestionsByIds", "Exportar progresso", "Importar backup", "aria-live=\"polite\"", "aria-current=\"step\"", "focusMainHeading", "result-options"]) if (!app.includes(feature)) fail(`Melhoria obrigatória ausente: ${feature}`);
for (const feature of ["progressMigration.v2.3", "answeredQuestionIds", "metricsMigrated", "answerEvidence"]) if (!migration.includes(feature)) fail(`Proteção de migração ausente: ${feature}`);
if (app.includes("questions: state.questions")) fail("A sessão ainda armazena o conteúdo completo das questões.");
for (const assignment of ['{id: "rodrigo", name: "Rodrigo", roles: ["202", "400"]}', '{id: "amanda", name: "Amanda", roles: ["202", "403"]}', '{id: "andressa", name: "Andressa", roles: ["200", "405"]}']) if (!app.includes(assignment)) fail(`Vínculo de perfil ausente: ${assignment}`);
for (const selector of [".sr-only", ".dialog-backdrop", ".result-option", ":focus-visible", "prefers-reduced-motion", ".option .letter", ".question-visual"]) if (!styles.includes(selector)) fail(`Estilo obrigatório ausente: ${selector}`);
for (const feature of ["excel-analise-rapida-q23.svg", "MutationObserver", "question-visual"]) if (!imageSupport.includes(feature)) fail(`Suporte visual ausente: ${feature}`);
if (!Array.isArray(tfIndex.planned) || tfIndex.planned.reduce((sum, item) => sum + Number(item.questions || 0), 0) !== 240) fail("Planejamento das 240 questões C/E divergente.");
const fixture = {codigo: "FIXTURE-CE-001", enunciado: "Item de teste", gabarito: "Certo", alternativas: {Certo: "Certo", Errado: "Errado"}, comentario_status: "pendente"};
if (validateAlternatives(fixture, {formato_questao: "Certo / Errado"}) !== "Certo / Errado") fail("Fixture C/E não foi reconhecida.");
console.log(`✓ Release ${config.release_version} validada: ${questions} questões, ${expectedMaterials} materiais, ${trueFalseQuestions} C/E ativas e ${expectedPending} registros em auditoria.`);
