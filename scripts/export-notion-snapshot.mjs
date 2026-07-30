import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'data','notion','published.json');
const TOKEN=process.env.NOTION_TOKEN;
const SOURCE='784234ae-deca-4514-b60d-19524e122a89';
const DATABASE_URL='https://app.notion.com/p/a1d5fc8f8e434105861faba90dc156d9?v=85b47b4a2e17461e9d3482724b13fab8';
const API='https://api.notion.com/v1';
const VERSION='2026-03-11';
if(!TOKEN)throw new Error('NOTION_TOKEN não está disponível neste repositório.');

const clean=v=>String(v??'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').trim();
const key=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function request(endpoint,options={},attempt=1){
 const response=await fetch(`${API}${endpoint}`,{...options,headers:{Authorization:`Bearer ${TOKEN}`,'Notion-Version':VERSION,'Content-Type':'application/json',...(options.headers||{})}});
 if(response.ok)return response.json();
 const body=await response.text();
 if((response.status===429||response.status>=500)&&attempt<7){await sleep(Math.max(Number(response.headers.get('retry-after')||0)*1000,500*2**(attempt-1)));return request(endpoint,options,attempt+1)}
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
 if(p.type==='formula'){
  const f=p.formula;if(!f)return null;
  if(f.type==='string')return f.string;
  if(f.type==='boolean')return f.boolean;
  if(f.type==='number')return f.number;
  if(f.type==='date')return f.date?.start??null;
 }
 return null;
}
async function readAll(){
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
 console.log(`Banco Mestre: ${rows.length} registros lidos em ${batches} lotes.`);
 return rows;
}
function record(row){
 const format=clean(row['Formato da questão']);
 const trueFalse=/certo\s*\/\s*errado/i.test(format)||['Certo','Errado'].includes(clean(row['Gabarito']));
 return{
  notion_id:row.notion_id,
  notion_url:row.notion_url,
  code:clean(row['Código']),
  github_id:clean(row['Código GitHub']),
  title:clean(row['Questão']),
  material_name:clean(row['Nome do material']),
  material_type:clean(row['Tipo de material']),
  year:Number(row['Ano'])||null,
  organization:clean(row['Órgão']),
  cargo:clean(row['Cargo']),
  cargo_code:clean(row['Código do cargo']),
  discipline:clean(row['Disciplina']),
  subject:clean(row['Assunto']),
  subsubject:clean(row['Subassunto']),
  block:clean(row['Bloco']),
  source_board:clean(row['Fonte / Banca']),
  source_url:clean(row['URL da fonte']),
  format:trueFalse?'Certo / Errado':format||'Múltipla escolha A–E',
  original_number:Number(row['Número original'])||null,
  text_base:clean(row['Texto-base']),
  prompt:clean(row['Enunciado']),
  alternatives:trueFalse?{Certo:'Certo',Errado:'Errado'}:{A:clean(row['Alternativa A']),B:clean(row['Alternativa B']),C:clean(row['Alternativa C']),D:clean(row['Alternativa D']),E:clean(row['Alternativa E'])},
  answer:clean(row['Gabarito']),
  comment:clean(row['Comentário geral']),
  alternative_comments:{A:clean(row['Comentário A']),B:clean(row['Comentário B']),C:clean(row['Comentário C']),D:clean(row['Comentário D']),E:clean(row['Comentário E'])},
  foundation:clean(row['Fundamento legal']),
  trap:clean(row['Pegadinha']),
  observations:clean(row['Observações']),
  annulled:Boolean(row['Anulada']),
  has_image:Boolean(row['Possui imagem']),
  image_description:clean(row['Descrição da imagem']),
  pdf_page:clean(row['Página do PDF'])
 };
}
function validate(records){
 const codes=new Set(),ids=new Set();
 for(const r of records){
  for(const [value,label] of [[r.code,'Código'],[r.title,'Questão'],[r.material_name,'Nome do material'],[r.prompt,'Enunciado'],[r.answer,'Gabarito'],[r.comment,'Comentário geral']])if(!value)throw new Error(`${label} ausente em ${r.code||r.notion_url}.`);
  if(codes.has(key(r.code)))throw new Error(`Código publicável duplicado: ${r.code}`);codes.add(key(r.code));
  if(r.github_id){if(ids.has(key(r.github_id)))throw new Error(`Código GitHub duplicado: ${r.github_id}`);ids.add(key(r.github_id))}
  if(r.format==='Certo / Errado'){
   if(!['Certo','Errado','Anulada'].includes(r.answer))throw new Error(`${r.code}: gabarito C/E inválido.`);
  }else{
   for(const letter of ['A','B','C','D','E'])if(!r.alternatives[letter])throw new Error(`${r.code}: alternativa ${letter} ausente.`);
   if(!['A','B','C','D','E','Anulada'].includes(r.answer))throw new Error(`${r.code}: gabarito A–E inválido.`);
  }
 }
}

const all=await readAll();
const records=all.filter(row=>row['Pode publicar']===true).map(record).sort((a,b)=>a.material_name.localeCompare(b.material_name,'pt-BR')||Number(a.original_number)-Number(b.original_number)||a.code.localeCompare(b.code));
validate(records);
const semantic={schema_version:'1.0',source:{name:'Banco Mestre — Provas e Simulados SEDES/DF',database_url:DATABASE_URL,data_source_id:SOURCE,publication_rule:'Pode publicar = true'},totals:{all:all.length,published:records.length,pending:all.length-records.length,materials:new Set(records.map(r=>key(r.material_name))).size},records};
let generatedAt=new Date().toISOString();
try{
 const previous=JSON.parse(await fs.readFile(output,'utf8'));
 const previousSemantic={...previous};delete previousSemantic.generated_at;
 if(JSON.stringify(previousSemantic)===JSON.stringify(semantic))generatedAt=previous.generated_at||generatedAt;
}catch{}
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,`${JSON.stringify({...semantic,generated_at:generatedAt},null,2)}\n`);
console.log(`✓ Snapshot autorizado: ${records.length} questões publicáveis, ${semantic.totals.materials} materiais e ${semantic.totals.pending} registros mantidos fora do site.`);
