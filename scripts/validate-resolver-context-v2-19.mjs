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

requireText(index, /resolver-context-v2-19\.css\?v=1/, "CSS v2.19 não está conectado ao index.");
requireText(index, /resolver-context-v2-19\.js\?v=1/, "JS v2.19 não está conectado ao index.");
requireText(worker, /resolver-context-v2-19\.css\?v=1/, "CSS v2.19 não está no shell PWA.");
requireText(worker, /resolver-context-v2-19\.js\?v=1/, "JS v2.19 não está no shell PWA.");
requireText(script, /currentRoute\(\).*===\s*["']resultado["']/s, "A conclusão precisa detectar a rota de resultado.");
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

console.log("✓ Resolver v2.19: nova matéria após conclusão + banca/fonte, ano e cargo por questão.");
