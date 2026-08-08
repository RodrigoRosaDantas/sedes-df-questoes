import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const index = read("index.html");
const worker = read("service-worker.js");
const css = read("assets/home-question-format-v2-20-hotfix.css");
const script = read("assets/home-question-format-v2-20-hotfix.js");
const requireText = (text, pattern, message) => { if (!pattern.test(text)) throw new Error(message); };

requireText(index, /data-ux20-format-gate="loading"/, "O documento precisa nascer com o gate de formato fechado.");
requireText(index, /home-question-format-v2-20-hotfix\.css\?v=1/, "CSS do gate v2.20 não está conectado.");
requireText(index, /home-question-format-v2-20-hotfix\.js\?v=1/, "JS do gate v2.20 não está conectado.");
requireText(worker, /home-question-format-v2-20-hotfix\.css\?v=1/, "CSS do gate precisa estar no shell PWA.");
requireText(worker, /home-question-format-v2-20-hotfix\.js\?v=1/, "JS do gate precisa estar no shell PWA.");
requireText(worker, /\.\/data\/release\/question-format-index\.json/, "Índice de formato precisa ser pré-cacheado no PWA.");
requireText(css, /data-ux20-format-gate="loading"[^}]*data-ux17-subjects[^}]*pointer-events:none/s, "Matérias precisam ficar inertes enquanto o índice não estiver consistente.");
requireText(script, /trueFalse \+ multiple === all/, "Gate precisa exigir partição completa das questões visíveis.");
requireText(script, /all > 0/, "Gate não pode marcar painel vazio como pronto.");
requireText(script, /setInterval\(check, 50\)/, "Gate precisa acompanhar a chegada assíncrona do índice.");
requireText(script, /aria-busy/, "Gate deve expor estado de carregamento acessível.");

console.log("✓ Gate v2.20: matérias ficam protegidas até C/E + múltipla escolha = total do recorte.");
