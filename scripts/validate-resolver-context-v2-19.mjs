import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const index = read("index.html");
const script = read("assets/resolver-context-v2-19.js");
const css = read("assets/resolver-context-v2-19.css");
const worker = read("service-worker.js");
const publicConfig = read("playwright.public.config.js");

const requireText = (text, pattern, message) => {
  if (!pattern.test(text)) throw new Error(message);
};
const rejectText = (text, pattern, message) => {
  if (pattern.test(text)) throw new Error(message);
};

requireText(index, /resolver-context-v2-19\.css\?v=1/, "CSS v2.19 não está conectado ao index.");
requireText(index, /resolver-context-v2-19\.js\?v=2/, "JS do resolver precisa estar conectado com cache-bust v2.");
requireText(worker, /resolver-context-v2-19\.css\?v=1/, "CSS v2.19 não está no shell PWA.");
requireText(worker, /resolver-context-v2-19\.js\?v=2/, "JS do resolver v2 não está no shell PWA.");
requireText(script, /const route = currentRoute\(\)/, "O módulo precisa ler a rota atual.");
requireText(script, /let resultSelectionCleared = false/, "A limpeza pós-resultado precisa manter estado idempotente por ciclo.");
requireText(script, /function clearFinishedSubjectSelectionOnce\(\)/, "A limpeza pós-resultado precisa ter função idempotente.");
requireText(script, /if \(resultSelectionCleared\) return;/, "A limpeza repetida do resultado precisa ser bloqueada.");
requireText(script, /clearFinishedSubjectSelection\(\);\s*resultSelectionCleared = true;/s, "A limpeza precisa marcar o ciclo como concluído.");
requireText(script, /route === ["']resultado["'][\s\S]*clearFinishedSubjectSelectionOnce\(\)/, "A rota de resultado deve chamar somente a limpeza idempotente.");
requireText(script, /resultSelectionCleared = false;\s*if \(route !== ["']resolver["']\) return;/s, "Ao sair do resultado, um novo ciclo deve poder ser limpo no futuro.");
rejectText(script, /route === ["']resultado["'][\s\S]{0,160}clearFinishedSubjectSelection\(\)/, "A rota de resultado não pode chamar a limpeza bruta repetidamente.");
requireText(script, /sessionStorage\.removeItem\(profileKey\(suffix\)\)/, "A seleção temporária de matérias deve ser limpa ao concluir.");
requireText(script, /homeStudySubjects\.v2/, "A chave temporária v2 precisa ser limpa após a conclusão.");
requireText(script, /state\.catalog\?\.question_index/, "A origem da questão deve vir do question_index publicado.");
requireText(script, /materialIdFromIndex/, "A origem deve aceitar o contrato canônico do question_index.");
requireText(script, /Banca\/Fonte/, "A tela precisa mostrar banca/fonte.");
requireText(script, /<b>Ano<\/b>/, "A tela precisa mostrar ano.");
requireText(script, /<b>Cargo<\/b>/, "A tela precisa mostrar cargo.");
requireText(script, /\["prova",\s*"simulado"\]/, "Metadados devem ser limitados a prova/simulado.");
requireText(css, /question-origin-meta/, "Estilo dos metadados da questão ausente.");
requireText(css, /flex-wrap:wrap/, "Metadados precisam quebrar linha sem overflow no mobile.");
requireText(publicConfig, /resolver-context-v2-19\.spec\.js/, "Teste público v2.19 precisa estar no allowlist.");

console.log("✓ Resolver v2.21.1: limpeza pós-resultado idempotente + nova matéria + banca/fonte, ano e cargo por questão.");
