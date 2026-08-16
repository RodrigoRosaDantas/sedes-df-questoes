import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.join(root, "dist", "data", "release");
const snapshotDir = path.join(root, "data", "notion", "quadrix-sparse-gaps-20260816");
const readJSON = file => JSON.parse(fs.readFileSync(file, "utf8"));
const clean = value => String(value ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
const key = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const slug = value => key(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
const unique = values => [...new Set(values)];

const snapshot = readJSON(path.join(snapshotDir, "manifest.json"));
if (snapshot.operation_id !== "SEDES-QDX-SPARSE-GAPS-20260816" || Number(snapshot.expected_count) !== 2) throw new Error("Manifesto sparse gaps inválido.");
const expectedQuestions = Number(snapshot.source?.expected_public_questions || 0);
const newIds = (snapshot.expected_codes || []).map(slug);
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
for (const qid of newIds) if (!catalog.question_index?.[qid]) throw new Error(`Questão sparse ausente do catálogo: ${qid}.`);

const normalize = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
function classify(q, material) {
  const declared = normalize(q?.formato_questao || material?.formato_questao);
  if (declared.includes("certo") && declared.includes("errado")) return "true-false";
  if (declared.includes("multipla") || declared.includes("escolha") || declared.includes("alternativa")) return "multiple-choice";
  const alternatives = q?.alternativas && typeof q.alternativas === "object" && !Array.isArray(q.alternativas) ? Object.entries(q.alternativas).filter(([a,b])=>clean(a)&&clean(b)) : [];
  const tokens = new Set(alternatives.flatMap(([a,b])=>[normalize(a),normalize(b)]));
  if (alternatives.length===2 && tokens.has("certo") && tokens.has("errado")) return "true-false";
  if (alternatives.length>=2) return "multiple-choice";
  throw new Error(`Formato não reconhecido: ${q?.id || "sem-id"}.`);
}

const searchItems=[], formats={}, formatSummary={"true-false":0,"multiple-choice":0}, studyDisciplines=new Map();
for (const material of materials.values()) for (const q of material.questoes || []) {
  const discipline=clean(q.disciplina||material.disciplina||""), subject=clean(q.assunto||""), alternativesText=Object.values(q.alternativas||{}).join(" "), format=classify(q,material);
  formats[q.id]=format; formatSummary[format]+=1;
  searchItems.push({id:q.id,material_id:material.id,discipline,subject,source:material.fonte||"",year:material.ano||"",snippet:clean(q.enunciado).slice(0,280),search:normalize([material.nome,discipline,subject,material.fonte,material.ano,q.texto_base,q.enunciado,alternativesText,q.comentario,q.fundamento,q.pegadinha].filter(Boolean).join(" "))});
  const dn=discipline||"Sem classificação", tn=subject||"Outros tópicos";
  if(!studyDisciplines.has(dn)) studyDisciplines.set(dn,{name:dn,question_ids:[],material_ids:new Set(),topics:new Map()});
  const s=studyDisciplines.get(dn); s.question_ids.push(q.id); s.material_ids.add(material.id); if(!s.topics.has(tn)) s.topics.set(tn,[]); s.topics.get(tn).push(q.id);
}
if(searchItems.length!==expectedQuestions||Object.keys(formats).length!==expectedQuestions) throw new Error("Índices derivados não fecham com o catálogo final.");
if(formatSummary["true-false"]!==2572||formatSummary["multiple-choice"]!==934) throw new Error(`Formatos finais inesperados: ${formatSummary["true-false"]} C/E + ${formatSummary["multiple-choice"]} A–E.`);
fs.writeFileSync(path.join(releaseDir,"question-search-index.json"),`${JSON.stringify({schema_version:"1.0",release_version:catalog.release_version||null,exported_at:catalog.exported_at||null,questions:searchItems.length,items:searchItems})}\n`);
fs.writeFileSync(path.join(releaseDir,"question-format-index.json"),`${JSON.stringify({schema_version:"1.0",release_version:catalog.release_version||null,exported_at:catalog.exported_at||null,question_count:expectedQuestions,summary:formatSummary,formats})}\n`);
const studyOutput={schema_version:"1.0",release_version:catalog.release_version,generated_at:snapshot.captured_at,summary:{disciplines:studyDisciplines.size,topics:[...studyDisciplines.values()].reduce((sum,i)=>sum+i.topics.size,0),questions:expectedQuestions},disciplines:[...studyDisciplines.values()].map(d=>({name:d.name,question_count:d.question_ids.length,question_ids:d.question_ids,material_count:d.material_ids.size,material_ids:[...d.material_ids],topics:[...d.topics.entries()].map(([name,ids])=>({name,question_count:ids.length,question_ids:ids})).sort((a,b)=>b.question_count-a.question_count||a.name.localeCompare(b.name,"pt-BR"))})).sort((a,b)=>b.question_count-a.question_count||a.name.localeCompare(b.name,"pt-BR"))};
fs.writeFileSync(path.join(releaseDir,"study-index.json"),`${JSON.stringify(studyOutput,null,2)}\n`);

const editalMapPath=path.join(releaseDir,"edital-map-v1.json");
if(!fs.existsSync(editalMapPath)) throw new Error("Mapa do edital anterior ausente.");
const editalMap=readJSON(editalMapPath), editalItems=new Map((editalMap.sections||[]).flatMap(s=>(s.items||[]).map(i=>[i.id,i])));
const editalFormats={...(editalMap.question_formats||{})};
for(const qid of newIds) editalFormats[qid]="A–E";
const assignments=new Map([
  [slug("PROVA-QDX-CRESSRO-2021-TECNICO-ADMINISTRATIVO-400-021"),["400-gp-5-11"]],
  [slug("PROVA-QDX-CRMMG-2025-ANALISTA-LICITACAO-400-038"),["edas-suas-7"]],
  ["prova-qdx-altoparaiso-2023-as-037",["edas-suas-5"]],
  ["prova-qdx-altoparaiso-2023-as-038",["edas-suas-5"]],
  ["prova-qdx-altoparaiso-2023-as-039",["edas-suas-5"]]
]);
for(const [qid,itemIds] of assignments){
  if(!catalog.question_index?.[qid]) throw new Error(`Mapeamento referencia questão inexistente: ${qid}.`);
  const declared=editalFormats[qid];
  if(!declared) throw new Error(`Formato do mapa ausente para ${qid}.`);
  for(const itemId of itemIds){
    const item=editalItems.get(itemId); if(!item) throw new Error(`Item do edital inexistente: ${itemId}.`);
    item.question_ids=unique([...(item.question_ids||[]),qid]);
    if(declared==="A–E") item.ae_question_ids=unique([...(item.ae_question_ids||[]),qid]);
    if(declared==="Certo/Errado") item.ce_question_ids=unique([...(item.ce_question_ids||[]),qid]);
    if(["A–E","Certo/Errado"].includes(declared)) item.exam_question_ids=unique([...(item.exam_question_ids||[]),qid]);
  }
}
for(const item of editalItems.values()){
  for(const field of ["question_ids","ae_question_ids","ce_question_ids","exam_question_ids"]) item[field]=unique(item[field]||[]);
  item.question_count=item.question_ids.length; item.ae_question_count=item.ae_question_ids.length; item.ce_question_count=item.ce_question_ids.length; item.exam_question_count=item.exam_question_ids.length;
}
const unionForItems=(ids,field)=>unique((ids||[]).flatMap(itemId=>editalItems.get(itemId)?.[field]||[]));
for(const target of Object.values(editalMap.targets||{})){
  target.general_question_ids=unionForItems(target.general_item_ids,"question_ids"); target.general_ae_question_ids=unionForItems(target.general_item_ids,"ae_question_ids"); target.general_ce_question_ids=unionForItems(target.general_item_ids,"ce_question_ids"); target.general_exam_question_ids=unionForItems(target.general_item_ids,"exam_question_ids");
  target.specific_question_ids=unionForItems(target.specific_item_ids,"question_ids"); target.specific_ae_question_ids=unionForItems(target.specific_item_ids,"ae_question_ids"); target.specific_ce_question_ids=unionForItems(target.specific_item_ids,"ce_question_ids"); target.specific_exam_question_ids=unionForItems(target.specific_item_ids,"exam_question_ids");
  const maria=unique(editalItems.get("geral-df-maria-penha")?.exam_question_ids||[]); target.maria_da_penha_exam_question_ids=maria;
  const bp=editalMap.objective_blueprint||{}, deficits={general:Math.max(0,Number(bp.general_questions||20)-target.general_exam_question_ids.length),specific:Math.max(0,Number(bp.specific_questions||40)-target.specific_exam_question_ids.length),maria_da_penha:Math.max(0,Number(bp.maria_da_penha_minimum_questions||3)-maria.length)};
  target.readiness={ready:deficits.general===0&&deficits.specific===0&&deficits.maria_da_penha===0,deficits,general_exam:target.general_exam_question_ids.length,general_ae:target.general_ae_question_ids.length,general_ce:target.general_ce_question_ids.length,specific_exam:target.specific_exam_question_ids.length,specific_ae:target.specific_ae_question_ids.length,specific_ce:target.specific_ce_question_ids.length,maria_da_penha_exam:maria.length};
}
if(Object.keys(editalFormats).length!==expectedQuestions) throw new Error(`Formatos do mapa não fecham: ${Object.keys(editalFormats).length}/${expectedQuestions}.`);
const mappedIds=new Set([...editalItems.values()].flatMap(i=>i.question_ids||[])), editalAe=Object.values(editalFormats).filter(f=>f==="A–E").length, editalCe=Object.values(editalFormats).filter(f=>f==="Certo/Errado").length;
editalMap.generated_at=snapshot.captured_at; editalMap.question_formats=editalFormats; editalMap.summary={...(editalMap.summary||{}),catalog_questions:expectedQuestions,catalog_multiple_choice_ae:editalAe,catalog_true_false:editalCe,catalog_exam_eligible:editalAe+editalCe,mapped_questions:mappedIds.size,unmapped_questions:expectedQuestions-mappedIds.size,official_items:editalItems.size};
for(const code of ["202","400"]){
  const target=editalMap.targets?.[code],generalSections=new Set(editalMap.general_section_ids||[]),specificItems=new Set(target?.specific_item_ids||[]),topics=(editalMap.sections||[]).filter(s=>generalSections.has(s.id)||(s.items||[]).some(i=>specificItems.has(i.id))).flatMap(s=>(s.items||[]).filter(i=>generalSections.has(s.id)||specificItems.has(i.id))),empty=topics.filter(i=>Number(i.question_count||0)<1).map(i=>i.id);
  if(empty.length) throw new Error(`Cargo ${code} possui tópicos vazios: ${empty.join(", ")}.`);
}
const sparseExpect={"edas-suas-5":4,"edas-suas-7":2,"400-gp-5-11":2};
for(const [itemId,min] of Object.entries(sparseExpect)) if(Number(editalItems.get(itemId)?.question_count||0)<min) throw new Error(`${itemId} não atingiu a cobertura mínima esperada (${min}).`);
fs.writeFileSync(editalMapPath,`${JSON.stringify(editalMap,null,2)}\n`);
console.log(`✓ Derivação sparse gaps: ${expectedQuestions} questões; ${formatSummary["true-false"]} C/E + ${formatSummary["multiple-choice"]} A–E; ${mappedIds.size} mapeadas; Conselhos>=4, MROSC>=2, cargos/salários>=2.`);
