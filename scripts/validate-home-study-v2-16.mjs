import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const index = read("index.html");
const script = read("assets/home-study-today-v2-16.js");
const css = read("assets/home-study-today-v2-16.css");
const subjectsScript = read("assets/home-study-subjects-v2-17-stable.js");
const subjectsCss = read("assets/home-study-subjects-v2-17.css");
const edital = read("assets/home-study-edital-v2-18.js");
const shared = read("assets/shared-v2-13.js");

const requireText = (text, pattern, message) => {
  if (!pattern.test(text)) throw new Error(message);
};

requireText(index, /home-study-today-v2-16\.css/, "CSS do Estudo de hoje v2.16 não está conectado ao index.html.");
requireText(index, /home-study-today-v2-16\.js\?v=5/, "JS do Estudo de hoje precisa estar conectado ao index.html com cache-bust v5.");
requireText(index, /home-study-subjects-v2-17\.css\?v=6/, "CSS do filtro de matérias/formato precisa estar conectado ao index.html com cache-bust v6.");
requireText(index, /home-study-subjects-v2-17-stable\.js\?v=6/, "JS do filtro de matérias/formato precisa estar conectado ao index.html com cache-bust v6.");

for (const id of ["prova-202", "prova-400", "simulado-202", "simulado-400"]) {
  requireText(edital, new RegExp(`id:\\s*["']${id}["']`), `Trilha canônica ${id} ausente.`);
}
requireText(edital, /export const TARGETS/, "A matriz dos editais precisa ser exportada por módulo único.");
requireText(edital, /targetQuestionIdsForStudyIndex/, "A regra de elegibilidade por edital precisa ser canônica.");
requireText(edital, /sessionMaterialTypeForTracks/, "A classificação do tipo da sessão precisa ser canônica.");
requireText(edital, /active\.every\(track => track\.type === "prova"\) \? "prova" : "simulado"/, "Sessões exclusivamente de provas precisam ser classificadas como prova.");
if (/const TARGETS\s*=|const TRACKS\s*=/.test(script) || /const TARGETS\s*=|const TRACKS\s*=/.test(subjectsScript)) {
  throw new Error("Regressão: matriz de edital e trilhas não podem voltar a ser duplicadas nos módulos da Home.");
}
requireText(script, /home-study-edital-v2-18\.js\?v=1/, "Estudo de hoje precisa importar a matriz canônica v2.18.");
requireText(subjectsScript, /home-study-edital-v2-18\.js\?v=1/, "Filtro de matérias precisa importar a matriz canônica v2.18.");

requireText(script, /DEFAULT_SELECTION\s*=\s*\["prova-202",\s*"prova-400"\]/, "Provas 202 e 400 devem ser a seleção inicial.");
requireText(script, /targetQuestionIdsForStudyIndex\(state\.studyIndex, track\.target\)/, "A elegibilidade precisa usar o índice por disciplina/tópico via módulo canônico.");
requireText(script, /materialIdFromIndex/, "O recorte precisa resolver a origem de cada questão pelo catálogo.");
requireText(script, /normalizeStudyValue\(material\.tipo_material\)\s*!==\s*track\.type/, "Provas e simulados precisam permanecer separados por tipo de material.");
requireText(script, /materialType:\s*sessionMaterialTypeForTracks\(selectedTracks\)/, "O Estudo de hoje precisa gravar o tipo correto da sessão.");
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
requireText(subjectsScript, /normalizeStudyValue\(material\.tipo_material\)\s*!==\s*track\.type/, "O filtro de matérias deve preservar a separação entre prova e simulado.");
requireText(subjectsScript, /materialType:\s*sessionMaterialTypeForTracks\(activeTracks\)/, "A sessão filtrada precisa registrar prova quando todas as fontes ativas forem provas.");
requireText(subjectsScript, /data-ux17-subject-button/, "As matérias devem usar chips-botão explícitos em vez de checkbox invisível.");
requireText(subjectsScript, /aria-pressed/, "Os chips de matéria devem expor estado acessível.");
requireText(subjectsScript, /if \(!Array\.isArray\(stored\)\)\s*\{\s*selection\[trackId\]\s*=\s*\[subjectName\]/s, "Ao sair de Todas, tocar numa matéria deve selecionar somente essa matéria.");
requireText(subjectsScript, /function syncSubjectGroup\(card, trackId\)/, "A seleção de matérias deve atualizar o grupo no próprio DOM.");
if (/saveTempSelection\(selection\);\s*renderSubjects\(card, trackId\)/s.test(subjectsScript)) {
  throw new Error("Regressão: selecionar matéria não pode recriar o painel no mobile.");
}
requireText(subjectsScript, /Começar com estes filtros/, "A ação principal deve deixar explícito que respeita matérias e formato.");
requireText(subjectsScript, /Escolha ao menos uma matéria em cada recorte selecionado/, "Recortes sem matéria não podem gerar sessão ambígua.");
requireText(subjectsScript, /targetCache = new Map\(\)/, "O recorte por edital deve ser cacheado para evitar recomputação da Home.");
requireText(subjectsScript, /subjectCache = new Map\(\)/, "As matérias por trilha devem ser cacheadas.");
requireText(subjectsScript, /setInterval\(tick, 900\)/, "A recuperação do seletor deve usar watchdog leve.");
requireText(subjectsScript, /stopWatchdog/, "O watchdog precisa ser encerrado ao sair da Home.");
if (/new MutationObserver/.test(subjectsScript)) throw new Error("O filtro de matérias não pode criar MutationObserver concorrente com a Home.");

requireText(shared, /materialType = "simulado"/, "createCompatibleSession precisa aceitar tipo de material explícito.");
requireText(shared, /tipo_material: normalizedMaterialType/, "A sessão compatível precisa persistir o tipo de material informado.");

requireText(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/, "Layout desktop das quatro opções ausente.");
requireText(css, /@media\(max-width:520px\).*grid-template-columns:1fr/s, "Layout mobile de uma coluna ausente.");
requireText(subjectsCss, /ux17-subject-list/, "Layout da seleção de matérias ausente.");
requireText(subjectsCss, /ux17-subject-chip/, "Chips de matéria ausentes.");
requireText(subjectsCss, /min-height:40px/, "Chips de matéria precisam de alvo de toque adequado no mobile.");
requireText(subjectsCss, /@media\(max-width:760px\).*\.ux17-subject-chips\{[^}]*max-height:none;[^}]*overflow:visible;[^}]*touch-action:auto/s, "No mobile estreito a lista de matérias deve usar a rolagem natural da página.");
requireText(subjectsCss, /@media\(pointer:coarse\).*\.ux17-subject-chips\{[^}]*max-height:none;[^}]*overflow:visible;[^}]*touch-action:auto/s, "Dispositivos touch/coarse precisam evitar scroll interno mesmo acima de 760px.");

console.log("✓ Estudo de hoje v2.20: matriz canônica, matérias, formato, tipo de sessão e rolagem touch preservados.");
