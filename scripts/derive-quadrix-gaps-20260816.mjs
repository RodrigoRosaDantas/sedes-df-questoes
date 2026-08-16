import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.join(root, "dist", "data", "release");
const gapDir = path.join(root, "data", "notion", "quadrix-gaps-20260816");
const readJSON = file => JSON.parse(fs.readFileSync(file, "utf8"));
const clean = value => String(value ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
const key = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const slug = value => key(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
const unique = values => [...new Set(values)];
const gapManifest = readJSON(path.join(gapDir, "manifest.json"));
if (gapManifest.operation_id !== "SEDES-QDX-GAPS-20260816" || Number(gapManifest.expected_count) !== 12) throw new Error("Manifesto Quadrix de lacunas inválido.");
const expectedQuestions = Number(gapManifest.source?.expected_public_questions || 0);
const gapIds = (gapManifest.expected_codes || []).map(slug);

const catalog = readJSON(path.join(releaseDir, "catalogo.json"));
const materialsDir = path.join(releaseDir, "materials");
const materials = new Map(), questionById = new Map();
for (const meta of catalog.materials || []) {
  const file = path.join(materialsDir, path.basename(String(meta.file || "")));
  if (!fs.existsSync(file)) throw new Error(`Material público ausente: ${meta.file || meta.id}.`);
  const material = readJSON(file); materials.set(material.id, material);
  for (const q of material.questoes || []) { if (!q.id || questionById.has(key(q.id))) throw new Error(`Questão inválida ou duplicada: ${q.id || "sem-id"}.`); questionById.set(key(q.id), q); }
}
if (questionById.size !== expectedQuestions || Number(catalog.summary?.questoes || 0) !== expectedQuestions) throw new Error(`Catálogo final divergente: ${questionById.size}/${expectedQuestions}.`);
for (const qid of gapIds) if (!catalog.question_index?.[qid]) throw new Error(`Questão nova ausente do catálogo: ${qid}.`);

const normalizeForSearch = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
function classify(question, material) {
  const declared = normalizeForSearch(question?.formato_questao || material?.formato_questao);
  if (declared.includes("certo") && declared.includes("errado")) return "true-false";
  if (declared.includes("multipla") || declared.includes("escolha") || declared.includes("alternativa")) return "multiple-choice";
  const alternatives = question?.alternativas && typeof question.alternativas === "object" && !Array.isArray(question.alternativas) ? Object.entries(question.alternativas).filter(([a,b])=>clean(a)&&clean(b)) : [];
  const tokens = new Set(alternatives.flatMap(([a,b])=>[normalizeForSearch(a),normalizeForSearch(b)]));
  if (alternatives.length===2 && tokens.has("certo") && tokens.has("errado")) return "true-false";
  if (alternatives.length>=2) return "multiple-choice";
  throw new Error(`Formato não reconhecido: ${question?.id || "sem-id"}.`);
}
const searchItems=[], formats={}, formatSummary={"true-false":0,"multiple-choice":0}, studyDisciplines=new Map();
for (const material of materials.values()) for (const q of material.questoes || []) {
  const discipline=clean(q.disciplina||material.disciplina||""), subject=clean(q.assunto||""), alternativesText=Object.values(q.alternativas||{}).join(" "), format=classify(q,material);
  formats[q.id]=format; formatSummary[format]+=1;
  searchItems.push({id:q.id,material_id:material.id,discipline,subject,source:material.fonte||"",year:material.ano||"",snippet:clean(q.enunciado).slice(0,280),search:normalizeForSearch([material.nome,discipline,subject,material.fonte,material.ano,q.texto_base,q.enunciado,alternativesText,q.comentario,q.fundamento,q.pegadinha].filter(Boolean).join(" "))});
  const dn=discipline||"Sem classificação", tn=subject||"Outros tópicos"; if(!studyDisciplines.has(dn)) studyDisciplines.set(dn,{name:dn,question_ids:[],material_ids:new Set(),topics:new Map()}); const s=studyDisciplines.get(dn); s.question_ids.push(q.id); s.material_ids.add(material.id); if(!s.topics.has(tn)) s.topics.set(tn,[]); s.topics.get(tn).push(q.id);
}
if(searchItems.length!==expectedQuestions||Object.keys(formats).length!==expectedQuestions) throw new Error("Índices derivados não fecham com o catálogo final.");
if(formatSummary["true-false"]!==2572||formatSummary["multiple-choice"]!==932) throw new Error(`Formatos finais inesperados: ${formatSummary["true-false"]} C/E + ${formatSummary["multiple-choice"]} A–E.`);
fs.writeFileSync(path.join(releaseDir,"question-search-index.json"),`${JSON.stringify({schema_version:"1.0",release_version:catalog.release_version||null,exported_at:catalog.exported_at||null,questions:searchItems.length,items:searchItems})}\n`);
fs.writeFileSync(path.join(releaseDir,"question-format-index.json"),`${JSON.stringify({schema_version:"1.0",release_version:catalog.release_version||null,exported_at:catalog.exported_at||null,question_count:expectedQuestions,summary:formatSummary,formats})}\n`);
const studyOutput={schema_version:"1.0",release_version:catalog.release_version,generated_at:gapManifest.captured_at,summary:{disciplines:studyDisciplines.size,topics:[...studyDisciplines.values()].reduce((sum,i)=>sum+i.topics.size,0),questions:expectedQuestions},disciplines:[...studyDisciplines.values()].map(d=>({name:d.name,question_count:d.question_ids.length,question_ids:d.question_ids,material_count:d.material_ids.size,material_ids:[...d.material_ids],topics:[...d.topics.entries()].map(([name,ids])=>({name,question_count:ids.length,question_ids:ids})).sort((a,b)=>b.question_count-a.question_count||a.name.localeCompare(b.name,"pt-BR"))})).sort((a,b)=>b.question_count-a.question_count||a.name.localeCompare(b.name,"pt-BR"))};
fs.writeFileSync(path.join(releaseDir,"study-index.json"),`${JSON.stringify(studyOutput,null,2)}\n`);

const editalMapPath=path.join(releaseDir,"edital-map-v1.json");
if(!fs.existsSync(editalMapPath)) throw new Error("Mapa do edital anterior ausente.");
const priorMap=readJSON(editalMapPath), priorItems=new Map((priorMap.sections||[]).flatMap(s=>(s.items||[]).map(i=>[i.id,{question_ids:i.question_ids||[],ae_question_ids:i.ae_question_ids||[],ce_question_ids:i.ce_question_ids||[],exam_question_ids:i.exam_question_ids||[]}]))), priorFormats={...(priorMap.question_formats||{})};
execFileSync(process.execPath,["scripts/build-edital-map-v1.mjs"],{cwd:root,stdio:"inherit",env:{...process.env}});
const editalMap=readJSON(editalMapPath), editalItems=new Map((editalMap.sections||[]).flatMap(s=>(s.items||[]).map(i=>[i.id,i])));
for(const [itemId,prior] of priorItems){const item=editalItems.get(itemId); if(!item) continue; for(const field of ["question_ids","ae_question_ids","ce_question_ids","exam_question_ids"]) item[field]=unique([...(item[field]||[]),...(prior[field]||[])]);}
const id=code=>slug(code);
const assignments=new Map([
 [id("PROVA-QDX-CRESSPR-2018-ASSISTENTE-ADMINISTRATIVO-400-067"),["400-osm-2-1"]],
 [id("PROVA-QDX-CRESSPR-2018-ASSISTENTE-ADMINISTRATIVO-400-068"),["400-osm-2-1"]],
 [id("PROVA-QDX-CRESSPR-2018-ASSISTENTE-ADMINISTRATIVO-400-069"),["400-osm-2-1"]],
 [id("PROVA-QDX-CRESSPR-2018-ASSISTENTE-ADMINISTRATIVO-400-100"),["202-adm-2-3"]],
 [id("PROVA-QDX-CRESSPR-2018-ASSISTENTE-ADMINISTRATIVO-400-111"),["400-gp-5-4"]],
 [id("PROVA-QDX-CRESSPR-2018-ASSISTENTE-ADMINISTRATIVO-400-112"),["400-gp-5-4"]],
 [id("PROVA-QDX-CRESSPR-2018-AGENTE-FISCAL-400-073"),["edas-dir-1"]],
 [id("PROVA-QDX-CRESSPR-2018-AGENTE-FISCAL-400-099"),["edas-suas-3"]],
 [id("PROVA-QDX-CRABA-2021-ADMINISTRADOR-400-103"),["400-gp-5-7"]],
 [id("PROVA-QDX-CRABA-2021-ADMINISTRADOR-400-104"),["400-gp-5-8"]],
 [id("PROVA-QDX-CRABA-2021-TECNOLOGO-RH-400-071"),["400-gp-5-3"]],
 [id("PROVA-QDX-CRABA-2021-TECNOLOGO-RH-400-075"),["400-gp-5-6"]]
]);
const editalQuestionFormats={...(editalMap.question_formats||{}),...priorFormats}; for(const qid of gapIds) editalQuestionFormats[qid]="Certo/Errado";
for(const [qid,itemIds] of assignments){if(!catalog.question_index?.[qid]) throw new Error(`Mapeamento referencia questão inexistente: ${qid}.`); for(const itemId of itemIds){const item=editalItems.get(itemId); if(!item) throw new Error(`Item do edital inexistente: ${itemId}.`); item.question_ids=unique([...(item.question_ids||[]),qid]); item.ce_question_ids=unique([...(item.ce_question_ids||[]),qid]); item.exam_question_ids=unique([...(item.exam_question_ids||[]),qid]);}}
for(const item of editalItems.values()){for(const field of ["question_ids","ae_question_ids","ce_question_ids","exam_question_ids"]) item[field]=unique(item[field]||[]); item.question_count=item.question_ids.length; item.ae_question_count=item.ae_question_ids.length; item.ce_question_count=item.ce_question_ids.length; item.exam_question_count=item.exam_question_ids.length;}
const unionForItems=(ids,field)=>unique((ids||[]).flatMap(itemId=>editalItems.get(itemId)?.[field]||[]));
for(const target of Object.values(editalMap.targets||{})){
 target.general_question_ids=unionForItems(target.general_item_ids,"question_ids"); target.general_ae_question_ids=unionForItems(target.general_item_ids,"ae_question_ids"); target.general_ce_question_ids=unionForItems(target.general_item_ids,"ce_question_ids"); target.general_exam_question_ids=unionForItems(target.general_item_ids,"exam_question_ids");
 target.specific_question_ids=unionForItems(target.specific_item_ids,"question_ids"); target.specific_ae_question_ids=unionForItems(target.specific_item_ids,"ae_question_ids"); target.specific_ce_question_ids=unionForItems(target.specific_item_ids,"ce_question_ids"); target.specific_exam_question_ids=unionForItems(target.specific_item_ids,"exam_question_ids");
 const maria=unique(editalItems.get("geral-df-maria-penha")?.exam_question_ids||[]); target.maria_da_penha_exam_question_ids=maria; const bp=editalMap.objective_blueprint||{}; const deficits={general:Math.max(0,Number(bp.general_questions||20)-target.general_exam_question_ids.length),specific:Math.max(0,Number(bp.specific_questions||40)-target.specific_exam_question_ids.length),maria_da_penha:Math.max(0,Number(bp.maria_da_penha_minimum_questions||3)-maria.length)}; target.readiness={ready:deficits.general===0&&deficits.specific===0&&deficits.maria_da_penha===0,deficits,general_exam:target.general_exam_question_ids.length,general_ae:target.general_ae_question_ids.length,general_ce:target.general_ce_question_ids.length,specific_exam:target.specific_exam_question_ids.length,specific_ae:target.specific_ae_question_ids.length,specific_ce:target.specific_ce_question_ids.length,maria_da_penha_exam:maria.length};
}
if(Object.keys(editalQuestionFormats).length!==expectedQuestions) throw new Error(`Formatos do mapa não fecham: ${Object.keys(editalQuestionFormats).length}/${expectedQuestions}.`);
const mappedIds=new Set([...editalItems.values()].flatMap(i=>i.question_ids||[])), editalAe=Object.values(editalQuestionFormats).filter(f=>f==="A–E").length, editalCe=Object.values(editalQuestionFormats).filter(f=>f==="Certo/Errado").length;
editalMap.generated_at=gapManifest.captured_at; editalMap.question_formats=editalQuestionFormats; editalMap.summary={...(editalMap.summary||{}),catalog_questions:expectedQuestions,catalog_multiple_choice_ae:editalAe,catalog_true_false:editalCe,catalog_exam_eligible:editalAe+editalCe,mapped_questions:mappedIds.size,unmapped_questions:expectedQuestions-mappedIds.size,official_items:editalItems.size};
for(const code of ["202","400"]){const target=editalMap.targets?.[code],generalSections=new Set(editalMap.general_section_ids||[]),specificItems=new Set(target?.specific_item_ids||[]),topics=(editalMap.sections||[]).filter(s=>generalSections.has(s.id)||(s.items||[]).some(i=>specificItems.has(i.id))).flatMap(s=>(s.items||[]).filter(i=>generalSections.has(s.id)||specificItems.has(i.id))),empty=topics.filter(i=>Number(i.question_count||0)<1).map(i=>i.id); if(empty.length) throw new Error(`Cargo ${code} possui tópicos vazios: ${empty.join(", ")}.`);}
fs.writeFileSync(editalMapPath,`${JSON.stringify(editalMap,null,2)}\n`);
console.log(`✓ Derivação final Quadrix gaps: ${expectedQuestions} questões; ${formatSummary["true-false"]} C/E + ${formatSummary["multiple-choice"]} A–E; ${mappedIds.size} mapeadas; cargos 202/400 sem tópicos vazios.`);
