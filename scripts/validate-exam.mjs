import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const fail = message => { throw new Error(message); };

const exam = JSON.parse(read("data/concurso.json"));
const index = read("index.html");
const script = read("assets/home-enhancements.js");
const styles = read("assets/home-enhancements.css");

const required = ["nome", "etapa", "data_prova", "alvo_contagem", "cargo", "codigo_cargo", "banca", "divulgacao_locais_horarios", "url_oficial", "observacao"];
for (const property of required) {
  if (!exam[property]) fail(`Campo obrigatório ausente em concurso.json: ${property}`);
}

const examDate = new Date(`${exam.data_prova}T12:00:00-03:00`);
const countdownTarget = new Date(exam.alvo_contagem);
const locationsDate = new Date(`${exam.divulgacao_locais_horarios}T12:00:00-03:00`);
if (Number.isNaN(examDate.getTime())) fail("Data da prova inválida.");
if (Number.isNaN(countdownTarget.getTime())) fail("Alvo da contagem regressiva inválido.");
if (Number.isNaN(locationsDate.getTime())) fail("Data de divulgação dos locais inválida.");
if (locationsDate > examDate) fail("A divulgação dos locais não pode ocorrer após a prova.");
if (!exam.alvo_contagem.startsWith(`${exam.data_prova}T`)) fail("O alvo da contagem deve corresponder ao dia da prova.");
if (!exam.alvo_contagem.endsWith("-03:00")) fail("A contagem deve utilizar o horário de Brasília (-03:00).");
if (!/^https:\/\//.test(exam.url_oficial)) fail("A URL oficial deve usar HTTPS.");

const enhancementScriptPosition = index.indexOf("assets/home-enhancements.js");
const appScriptPosition = index.indexOf("assets/app.js");
if (!index.includes("assets/home-enhancements.css")) fail("Estilos da página inicial não estão referenciados no HTML.");
if (enhancementScriptPosition < 0) fail("Script da página inicial não está referenciado no HTML.");
if (appScriptPosition < 0) fail("Aplicação principal não está referenciada no HTML.");
if (enhancementScriptPosition > appScriptPosition) fail("As melhorias da página inicial devem ser carregadas antes da aplicação principal.");
if (!script.includes('DISPLAY_TIME_ZONE = "America/Sao_Paulo"')) fail("A exibição da data deve estar fixada no horário de Brasília.");
if (!script.includes("data-exam-days") || !script.includes("data-countdown-dias")) fail("Contador regressivo incompleto.");
if (!styles.includes(".exam-focus") || !styles.includes(".countdown-grid")) fail("Estilos do painel da prova incompletos.");

console.log(`✓ Prova validada: ${exam.cargo} em ${exam.data_prova}, com contador no horário de Brasília.`);
