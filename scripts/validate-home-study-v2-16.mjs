import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const index = read("index.html");
const script = read("assets/home-study-today-v2-16.js");
const css = read("assets/home-study-today-v2-16.css");
const subjectsScript = read("assets/home-study-subjects-v2-17.js");
const subjectsCss = read("assets/home-study-subjects-v2-17.css");

const requireText = (text, pattern, message) => {
  if (!pattern.test(text)) throw new Error(message);
};

requireText(index, /home-study-today-v2-16\.css/, "CSS do Estudo de hoje v2.16 não está conectado ao index.html.");
requireText(index, /home-study-today-v2-16\.js/, "JS do Estudo de hoje v2.16 não está conectado ao index.html.");
requireText(index, /home-study-subjects-v2-17\.css/, "CSS do filtro de matérias v2.17 não está conectado ao index.html.");
requireText(index, /home-study-subjects-v2-17\.js/, "JS do filtro de matérias v2.17 não está conectado ao index.html.");

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

requireText(subjectsScript, /sessionStorage\.setItem\(TEMP_SELECTION_KEY\(\)/, "A escolha de matérias deve ser temporária da sessão do navegador.");
requireText(subjectsScript, /subjectOptions\(track\)/, "O filtro precisa calcular as matérias disponíveis por recorte.");
requireText(subjectsScript, /discipline\.question_ids/, "As matérias precisam ser derivadas do índice publicado de questões.");
requireText(subjectsScript, /filteredIds\(track, options, selectedNames\)/, "A sessão precisa aplicar o filtro das matérias escolhidas.");
requireText(subjectsScript, /normalize\(material\.tipo_material\)\s*!==\s*track\.type/, "O filtro de matérias deve preservar a separação entre prova e simulado.");
requireText(subjectsScript, /Começar com estas matérias/, "A ação principal deve deixar explícito que respeita as matérias escolhidas.");
requireText(subjectsScript, /Escolha ao menos uma matéria em cada recorte selecionado/, "Recortes sem matéria não podem gerar sessão ambígua.");

requireText(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/, "Layout desktop das quatro opções ausente.");
requireText(css, /@media\(max-width:520px\).*grid-template-columns:1fr/s, "Layout mobile de uma coluna ausente.");
requireText(subjectsCss, /ux17-subject-list/, "Layout da seleção de matérias ausente.");
requireText(subjectsCss, /@media\(max-width:760px\).*ux17-subject-list/s, "A seleção de matérias precisa ter adaptação mobile.");

console.log("✓ Estudo de hoje v2.17: quatro trilhas preservadas, matérias personalizáveis por recorte, seleção temporária e sessão filtrada por edital + fonte + matéria.");
