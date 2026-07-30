import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const fail = message => { throw new Error(message); };

const exam = JSON.parse(read("data/concurso.json"));
const index = read("index.html");
const app = read("assets/app-v4.js");
const styles = `${read("assets/dashboard.css")}\n${read("assets/quality-v2-3.css")}`;
const required = ["nome", "titulo_painel", "descricao_painel", "etapa", "data_prova", "alvo_contagem", "niveis", "cargos", "banca", "divulgacao_locais_horarios", "url_oficial", "observacao"];
for (const property of required) if (!exam[property] || (Array.isArray(exam[property]) && !exam[property].length)) fail(`Campo obrigatório ausente: ${property}`);

const examDate = new Date(`${exam.data_prova}T12:00:00-03:00`);
const target = new Date(exam.alvo_contagem);
const locations = new Date(`${exam.divulgacao_locais_horarios}T12:00:00-03:00`);
if ([examDate, target, locations].some(date => Number.isNaN(date.getTime()))) fail("Data inválida na configuração do concurso.");
if (locations > examDate) fail("Divulgação de locais posterior à prova.");
if (!exam.alvo_contagem.startsWith(`${exam.data_prova}T`) || !exam.alvo_contagem.endsWith("-03:00")) fail("Alvo da contagem divergente do dia da prova ou do horário de Brasília.");
if (!/^https:\/\//.test(exam.url_oficial)) fail("URL oficial deve usar HTTPS.");
if (!exam.niveis.includes("Médio") || !exam.niveis.includes("Superior")) fail("Níveis Médio e Superior são obrigatórios.");
const expectedCodes = ["200", "202", "400", "403", "405"];
const actualCodes = exam.cargos.map(role => String(role.codigo)).sort();
if (actualCodes.join(",") !== [...expectedCodes].sort().join(",")) fail(`Códigos divergentes: ${actualCodes.join(", ")}`);
if (!index.includes("assets/app-v4.js") || !index.includes("assets/dashboard.css")) fail("Dashboard v4 não referenciado no HTML.");
if (!app.includes("function getCountdown()") || !app.includes("updateLiveCountdown")) fail("Contador regressivo não integrado ao dashboard.");
if (!app.includes("builder-level") || !app.includes("Todos os perfis podem acessar todo o acervo")) fail("Filtro por nível ou acesso livre ausente.");
if (!styles.includes(".dashboard-countdown") || !styles.includes(".mini-countdown")) fail("Estilos do contador ausentes.");
console.log(`✓ Concurso validado em ${exam.data_prova}: ${exam.cargos.length} cargos, níveis ${exam.niveis.join(" e ")} e contador no horário de Brasília.`);
