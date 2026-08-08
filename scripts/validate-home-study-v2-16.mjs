import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const index = read("index.html");
const script = read("assets/home-study-today-v2-16.js");
const css = read("assets/home-study-today-v2-16.css");
const subjectsScript = read("assets/home-study-subjects-v2-17-stable.js");
const subjectsCss = read("assets/home-study-subjects-v2-17.css");

const requireText = (text, pattern, message) => {
  if (!pattern.test(text)) throw new Error(message);
};

requireText(index, /home-study-today-v2-16\.css/, "CSS do Estudo de hoje v2.16 não está conectado ao index.html.");
requireText(index, /home-study-today-v2-16\.js/, "JS do Estudo de hoje v2.16 não está conectado ao index.html.");
requireText(index, /home-study-subjects-v2-17\.css\?v=2/, "CSS corrigido do filtro de matérias v2.17 não está conectado ao index.html com cache-bust.");
requireText(index, /home-study-subjects-v2-17-stable\.js\?v=2/, "JS corrigido do filtro de matérias v2.17 não está conectado ao index.html com cache-bust.");

for (const id of ["prova-202", "prova-400", "simulado-202", "simulado-400"]) {
  requireText(script, new RegExp(`id:\\s*["']${id}["']`), `Trilha ${id} ausente.`);
  requireText(subjectsScript, new RegExp(`id:\\s*["']${id}["']`), `Filtro de matérias não reconhece a trilha ${id}.`);
}

requireText(script, /DEFAULT_SELECTION\s*=\s*\["prova-202",\s*"prova-400"\]/, "Provas 202 e 400 devem ser a seleção inicial.");
requireText(script, /state\.studyIndex/, "A elegibilidade precisa usar o índice por disciplina/tópico.");
requireText(script, /discipline\.topics/, "A elegibilidade precisa considerar tópicos do índice de estudo.");
requireText(script, /materialIdFromIndex/, "O recorte precisa resolver a origem de cada questão pelo catálogo.");
requireText(script, /normalize\(material\.tipo_material\)\s*!==\s*track\.type/, "Provas e simulados precisam permanecer separados por tipo de material.");
requireText(script, /Prioridade para questões ainda não respondidas/, "A Home deve explicar a prioridade para questões inéditas.");
requireText(script, /Uma questão de outro órgão pode entrar quando o conteúdo dela pertence ao edital selecionado/, "A transparência do recorte por edital precisa permanecer visível.");

if (/String\(material\.codigo_cargo\)\s*===\s*track\.target/.test(script) || /codigo_cargo[^\n]{0,80}track\.target/.test(script)) {
  throw new Error("Regressão: o Estudo de hoje não pode limitar elegibilidade ao código do cargo do material.");
}

requireText(subjectsScript, /homeStudySubjects\.v2/, "A correção precisa usar uma chave temporária v2 para não reaproveitar o estado antigo.");
requireText(subjectsScript, /sessionStorage\.setItem\(TEMP_SELECTION_KEY\(\)/, "A escolha de matérias deve ser temporária da sessão do navegador.");
requireText(subjectsScript, /subjectOptions\(track\)/, "O filtro precisa calcular as matérias disponíveis por recorte.");
requireText(subjectsScript, /discipline\.question_ids/, "As matérias precisam ser derivadas do índice publicado de questões.");
requireText(subjectsScript, /filteredIds\(track, options, chosen\.names, chosen\.allMode\)/, "A sessão precisa aplicar o modo Todas ou o filtro das matérias escolhidas.");
requireText(subjectsScript, /normalize\(material\.tipo_material\)\s*!==\s*track\.type/, "O filtro de matérias deve preservar a separação entre prova e simulado.");
requireText(subjectsScript, /data-ux17-subject-button/, "As matérias devem usar chips-botão explícitos em vez de checkbox invisível.");
requireText(subjectsScript, /aria-pressed/, "Os chips de matéria devem expor estado acessível.");
requireText(subjectsScript, /if \(!Array\.isArray\(stored\)\)\s*\{\s*selection\[trackId\]\s*=\s*\[subjectName\]/s, "Ao sair de Todas, tocar numa matéria deve selecionar somente essa matéria.");
requireText(subjectsScript, /Começar com estas matérias/, "A ação principal deve deixar explícito que respeita as matérias escolhidas.");
requireText(subjectsScript, /Escolha ao menos uma matéria em cada recorte selecionado/, "Recortes sem matéria não podem gerar sessão ambígua.");
requireText(subjectsScript, /targetCache = new Map\(\)/, "O recorte por edital deve ser cacheado para evitar recomputação da Home.");
requireText(subjectsScript, /subjectCache = new Map\(\)/, "As matérias por trilha devem ser cacheadas.");
requireText(subjectsScript, /setInterval\(tick, 900\)/, "A recuperação do seletor deve usar watchdog leve.");
requireText(subjectsScript, /stopWatchdog/, "O watchdog precisa ser encerrado ao sair da Home.");
if (/new MutationObserver/.test(subjectsScript)) throw new Error("O filtro de matérias não pode criar MutationObserver concorrente com a Home.");

requireText(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/, "Layout desktop das quatro opções ausente.");
requireText(css, /@media\(max-width:520px\).*grid-template-columns:1fr/s, "Layout mobile de uma coluna ausente.");
requireText(subjectsCss, /ux17-subject-list/, "Layout da seleção de matérias ausente.");
requireText(subjectsCss, /ux17-subject-chip/, "Chips de matéria ausentes.");
requireText(subjectsCss, /min-height:40px/, "Chips de matéria precisam de alvo de toque adequado no mobile.");
requireText(subjectsCss, /@media\(max-width:760px\).*ux17-subject-list/s, "A seleção de matérias precisa ter adaptação mobile.");

console.log("✓ Estudo de hoje v2.17.1: modo Todas explícito, seleção direta por matéria, toque mobile, estado temporário v2 e cache-bust dos assets.");