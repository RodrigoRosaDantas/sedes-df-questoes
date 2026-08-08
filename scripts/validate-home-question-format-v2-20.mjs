import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("assets/home-study-subjects-v2-17-stable.js");
const css = read("assets/home-study-subjects-v2-17.css");
const index = read("index.html");
const worker = read("service-worker.js");
const builder = read("scripts/build-question-search-index.mjs");
const publicConfig = read("playwright.public.config.js");
const requireText = (text, pattern, message) => { if (!pattern.test(text)) throw new Error(message); };

requireText(index, /home-study-subjects-v2-17\.css\?v=6/, "CSS do filtro v2.20 precisa de cache-bust v6.");
requireText(index, /home-study-subjects-v2-17-stable\.js\?v=6/, "JS do filtro v2.20 precisa de cache-bust v6.");
requireText(worker, /home-study-subjects-v2-17\.css\?v=6/, "CSS v2.20 precisa estar no shell PWA.");
requireText(worker, /home-study-subjects-v2-17-stable\.js\?v=6/, "JS v2.20 precisa estar no shell PWA.");
requireText(worker, /question-format-index/, "Índice de formato precisa ser tratado como dado mutável network-first.");
requireText(builder, /question-format-index\.json/, "Build do índice precisa gerar o arquivo de formato por questão.");
requireText(builder, /alternatives\.length === 2.*tokens\.has\("certo"\).*tokens\.has\("errado"\)/s, "Classificação C/E precisa considerar a estrutura das alternativas.");
requireText(builder, /alternatives\.length >= 2.*multiple-choice/s, "Classificação de múltipla escolha ausente.");
requireText(builder, /missingFormats/, "Geração precisa exigir identidade 1:1 entre catálogo e índice de formato.");
requireText(home, /homeStudyFormat\.v1/, "Filtro de formato precisa usar estado temporário próprio.");
requireText(home, /question-format-index\.json/, "Home precisa carregar o índice de formato derivado.");
requireText(home, /data-ux20-format-option/, "Controles de formato ausentes.");
requireText(home, /Certo ou Errado/, "Opção Certo ou Errado ausente.");
requireText(home, /Múltipla escolha/, "Opção Múltipla escolha ausente.");
requireText(home, /applyQuestionFormat\(subjectIds, formatMode\)/, "Formato precisa ser aplicado depois do filtro de matérias.");
requireText(home, /pools\.some\(pool => !pool\.names\.length\) \|\| !available/, "Recorte sem aquele formato não pode bloquear recortes válidos.");
requireText(home, /activeTracks = pools\.filter\(pool => pool\.ids\.length\)/, "Tipo da sessão deve considerar apenas recortes que realmente contribuíram com questões.");
requireText(home, /const stable = card\.dataset\.ux17Ready[\s\S]*card\.querySelector\("\[data-ux20-format\]"\)/, "Watchdog precisa recuperar o filtro de formato se a Home for redesenhada.");
requireText(home, /ensureData\(\)[\s\S]*window\.setTimeout\(arm, 120\)[\s\S]*loadFormatIndexAndRefresh\(\)/, "Home e matérias precisam subir sem depender do índice de formato.");
requireText(home, /questionFormatPromise = null;[\s\S]*throw error/, "Falha do índice de formato precisa liberar nova tentativa.");
requireText(home, /setTimeout\(\(\) => \{[\s\S]*loadFormatIndexAndRefresh\(\);[\s\S]*\}, 1200\)/, "Índice de formato precisa ter retry não bloqueante.");
requireText(home, /Começar com estes filtros/, "CTA precisa refletir matérias + formato.");
requireText(css, /ux20-format-option/, "Estilos do filtro de formato ausentes.");
requireText(css, /min-height:42px/, "Filtro de formato precisa ter alvo de toque adequado no mobile.");
requireText(publicConfig, /home-question-format-v2-20\.spec\.js/, "Teste público v2.20 precisa estar allowlisted.");

const distIndex = new URL("../dist/data/release/question-format-index.json", import.meta.url);
if (fs.existsSync(distIndex)) {
  const payload = JSON.parse(fs.readFileSync(distIndex, "utf8"));
  const formats = payload.formats || {};
  if (Number(payload.question_count) !== 3447 || Object.keys(formats).length !== 3447) throw new Error("Índice de formato não cobre as 3.447 questões.");
  if (!Number(payload.summary?.["true-false"]) || !Number(payload.summary?.["multiple-choice"])) throw new Error("Índice precisa conter C/E e múltipla escolha.");
}

console.log("✓ Filtro v2.20: formatos 1:1, recuperação de rerender e bootstrap resiliente sem bloquear a Home.");
