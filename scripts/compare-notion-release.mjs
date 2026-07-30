import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const resolve=p=>path.resolve(root,String(p).replace(/^\.\//,''));
const TOKEN=process.env.NOTION_TOKEN;
const SOURCE='784234ae-deca-4514-b60d-19524e122a89';
const API='https://api.notion.com/v1';
const VERSION='2026-03-11';
if(!TOKEN)throw new Error('NOTION_TOKEN não está disponível neste repositório.');

const clean=v=>String(v??'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').trim();
const key=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const composite=(material,number)=>`${key(material)}::${Number(number)||0}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function request(endpoint,options={},attempt=1){
 const response=await fetch(`${API}${endpoint}`,{...options,headers:{Authorization:`Bearer ${TOKEN}`,'Notion-Version':VERSION,'Content-Type':'application/json',...(options.headers||{})}});
 if(response.ok)return response.json();
 const body=await response.text();
 if((response.status===429||response.status>=500)&&attempt<7){
  await sleep(Math.max(Number(response.headers.get('retry-after')||0)*1000,500*2**(attempt-1)));
  return request(endpoint,options,attempt+1);
 }
 throw new Error(`Notion API ${response.status}: ${body.slice(0,600)}`);
}

const rich=items=>(items||[]).map(x=>x.plain_text??x.text?.content??'').join('').trim();
function value(p){
 if(!p)return null;
 if(p.type==='title')return rich(p.title);
 if(p.type==='rich_text')return rich(p.rich_text);
 if(p.type==='select')return p.select?.name??null;
 if(p.type==='status')return p.status?.name??null;
 if(p.type==='multi_select')return(p.multi_select||[]).map(x=>x.name);
 if(p.type==='checkbox')return Boolean(p.checkbox);
 if(p.type==='number')return p.number;
 if(p.type==='url')return p.url;
 if(p.type==='date')return p.date?.start??null;
 if(p.type==='created_time'||p.type==='last_edited_time')return p[p.type];
 if(p.type==='unique_id')return p.unique_id?`${p.unique_id.prefix||''}${p.unique_id.number}`:null;
 if(p.type==='formula'){
  const f=p.formula;if(!f)return null;
  if(f.type==='string')return f.string;
  if(f.type==='boolean')return f.boolean;
  if(f.type==='number')return f.number;
  if(f.type==='date')return f.date?.start??null;
 }
 return null;
}

async function notionRows(){
 const rows=[];let cursor;let batches=0;
 do{
  const body={page_size:100};if(cursor)body.start_cursor=cursor;
  const page=await request(`/data_sources/${SOURCE}/query`,{method:'POST',body:JSON.stringify(body)});
  for(const item of page.results||[]){
   const props=Object.fromEntries(Object.entries(item.properties||{}).map(([name,p])=>[name,value(p)]));
   rows.push({notion_id:item.id,notion_url:item.url,...props});
  }
  batches++;cursor=page.has_more?page.next_cursor:null;
 }while(cursor);
 console.log(`Notion: ${rows.length} registros lidos em ${batches} lotes.`);
 return rows;
}

async function release(){
 const catalog=JSON.parse(await fs.readFile(resolve('data/release/catalogo.json'),'utf8'));
 const questions=[];const materials=new Map();
 for(const meta of catalog.materials||[]){
  const material=JSON.parse(await fs.readFile(resolve(meta.file),'utf8'));
  materials.set(material.id,material);
  for(const q of material.questoes||[])questions.push({...q,material_id:material.id,material_name:material.nome});
 }
 return{catalog,questions,materials};
}

const rowPrefix=row=>clean(row['Código']).match(/-([A-Z0-9]+)-(\d+)$/i)?.[1]?.toUpperCase()||'';
const questionPrefix=q=>clean(q.codigo).match(/(?:CONSOL|SIM-[^-]+(?:-[^-]+)*)-([A-Z]+\d+)-\d+$/i)?.[1]?.toUpperCase()||clean(q.material_id).match(/-([a-z]+\d+)$/i)?.[1]?.toUpperCase()||'';
const editorialCode=row=>{const m=clean(row['Código']).match(/-([A-Z0-9]+)-(\d+)$/i);return m?`consol-${m[1]}-${Number(m[2])}`:''};
const fingerprint=(prefix,enunciado,alternatives,gabarito)=>key([prefix,enunciado,...Object.values(alternatives||{}),gabarito].join('\u241f'));
const rowAlternatives=row=>({A:row['Alternativa A'],B:row['Alternativa B'],C:row['Alternativa C'],D:row['Alternativa D'],E:row['Alternativa E']});
function currentField(q,field){
 const map={'Texto-base':q.texto_base,'Enunciado':q.enunciado,'Alternativa A':q.alternativas?.A,'Alternativa B':q.alternativas?.B,'Alternativa C':q.alternativas?.C,'Alternativa D':q.alternativas?.D,'Alternativa E':q.alternativas?.E,'Gabarito':q.gabarito,'Comentário geral':q.comentario,'Fundamento legal':q.fundamento,'Pegadinha':q.pegadinha,'Observações':q.observacoes,'Assunto':q.assunto,'Subassunto':q.subassunto};
 return map[field];
}

const rows=await notionRows();
const published=rows.filter(r=>r['Pode publicar']===true);
const duplicateCodes=[...published.reduce((m,r)=>{const k=key(r['Código']);m.set(k,(m.get(k)||0)+1);return m},new Map())].filter(([k,n])=>!k||n>1);
const duplicateComposite=[...published.reduce((m,r)=>{const k=composite(r['Nome do material'],r['Número original']);m.set(k,(m.get(k)||0)+1);return m},new Map())].filter(([k,n])=>k.endsWith('::0')||n>1);

const{catalog,questions,materials}=await release();
const byCode=new Map(questions.map(q=>[key(q.codigo),q]));
const byId=new Map(questions.map(q=>[key(q.id),q]));
const byComposite=new Map(questions.map(q=>[composite(q.material_name,q.numero),q]));
const byFingerprint=new Map();
for(const q of questions){
 const fp=fingerprint(questionPrefix(q),q.enunciado,q.alternativas,q.gabarito);
 if(!byFingerprint.has(fp))byFingerprint.set(fp,[]);
 byFingerprint.get(fp).push(q);
}

const matched=new Set();const missing=[];const reused=[];const oldIds=[];
const strategies=new Map();const formats=new Map();const materialCounts=new Map();
const diffCounts=new Map();const diffSamples=new Map();
const fields=['Texto-base','Enunciado','Alternativa A','Alternativa B','Alternativa C','Alternativa D','Alternativa E','Gabarito','Comentário geral','Fundamento legal','Pegadinha','Observações','Assunto','Subassunto'];

for(const row of published){
 const format=clean(row['Formato da questão'])||'Não informado';formats.set(format,(formats.get(format)||0)+1);
 const direct=byCode.get(key(row['Código']));
 const github=byId.get(key(row['Código GitHub']));
 const fp=fingerprint(rowPrefix(row),row['Enunciado'],rowAlternatives(row),row['Gabarito']);
 const fingerprintMatches=byFingerprint.get(fp)||[];
 const exact=fingerprintMatches.length===1?fingerprintMatches[0]:null;
 const derived=byCode.get(key(editorialCode(row)));
 const grouped=byComposite.get(composite(row['Nome do material'],row['Número original']));
 const q=direct||github||exact||derived||grouped;
 const strategy=direct?'codigo':github?'codigo_github':exact?'conteudo_integral':derived?'codigo_editorial_derivado':grouped?'material_e_numero':'nao_encontrada';
 strategies.set(strategy,(strategies.get(strategy)||0)+1);
 if(!q){missing.push({code:row['Código'],github_id:row['Código GitHub'],material:row['Nome do material'],number:row['Número original'],notion_url:row.notion_url});continue}
 const identity=key(q.id);if(matched.has(identity)){reused.push({code:row['Código'],release_id:q.id});continue}matched.add(identity);
 if(key(row['Código GitHub'])&&key(row['Código GitHub'])!==identity)oldIds.push({code:row['Código'],notion_github_id:row['Código GitHub'],release_id:q.id,strategy});
 materialCounts.set(q.material_id,(materialCounts.get(q.material_id)||0)+1);
 for(const field of fields){
  const a=clean(row[field]),b=clean(currentField(q,field));if(a===b)continue;
  diffCounts.set(field,(diffCounts.get(field)||0)+1);
  if(!diffSamples.has(field))diffSamples.set(field,[]);
  if(diffSamples.get(field).length<10)diffSamples.get(field).push({code:row['Código'],notion:a,release:b});
 }
}

const extra=questions.filter(q=>!matched.has(key(q.id))).map(q=>({code:q.codigo,id:q.id,material_id:q.material_id}));
const report={generated_at:new Date().toISOString(),source:{database:'Banco Mestre — Provas e Simulados SEDES/DF',data_source_id:SOURCE,total_rows:rows.length,publishable_rows:published.length,pending_rows:rows.length-published.length},release:{version:catalog.release_version,materials:materials.size,questions:questions.length},identity_validation:{match_strategies:Object.fromEntries([...strategies].sort((a,b)=>b[1]-a[1])),duplicate_publishable_codes:duplicateCodes,duplicate_material_numbers:duplicateComposite,missing_in_release:missing,extra_in_release:extra,reused_release_questions:reused,legacy_id_differences:oldIds},formats:Object.fromEntries([...formats].sort((a,b)=>b[1]-a[1])),material_counts:Object.fromEntries([...materialCounts].sort((a,b)=>a[0].localeCompare(b[0]))),content_differences:Object.fromEntries([...diffCounts].map(([field,count])=>[field,{count,samples:diffSamples.get(field)||[]}]))};
await fs.writeFile('/tmp/notion-release-comparison.json',`${JSON.stringify(report,null,2)}\n`);

console.log(`Publicáveis no Notion: ${published.length}. Release atual: ${questions.length}.`);
console.log(`Vínculos: ${JSON.stringify(report.identity_validation.match_strategies)}.`);
console.log(`Identidade — ausentes: ${missing.length}; extras: ${extra.length}; reutilizações: ${reused.length}; códigos duplicados: ${duplicateCodes.length}; material+número duplicados: ${duplicateComposite.length}.`);
console.log(`IDs editoriais antigos diferentes dos IDs públicos atuais: ${oldIds.length}.`);
console.log(`Formatos publicáveis: ${JSON.stringify(report.formats)}.`);
console.log(`Diferenças de conteúdo por campo: ${JSON.stringify(Object.fromEntries(diffCounts))}.`);
if(published.length!==questions.length)throw new Error('A quantidade publicável do Notion difere da release atual.');
if(duplicateCodes.length||duplicateComposite.length||missing.length||extra.length||reused.length)throw new Error('A identidade entre o Banco Mestre e a release atual não é compatível para sincronização segura.');
console.log('✓ As 570 questões publicáveis foram vinculadas integralmente à release, preservando os IDs públicos atuais.');
