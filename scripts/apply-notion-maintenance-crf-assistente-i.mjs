import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const patchFile=path.resolve(root,process.env.NOTION_MAINTENANCE_PATCH||'data/notion/maintenance/crf-df-assistente-i-2026-07-31.json');
const reportFile=path.resolve(root,process.env.NOTION_MAINTENANCE_REPORT||'artifacts/notion-maintenance-crf-assistente-i-report.json');
const TOKEN=process.env.NOTION_TOKEN, API='https://api.notion.com/v1', VERSION='2026-03-11';
if(!TOKEN) throw new Error('NOTION_TOKEN não está disponível.');
if(process.env.MAINTENANCE_CONFIRMATION!=='CRF-DF-ASSISTENTE-I-EDITORIAL-14') throw new Error('Confirmação de manutenção inválida.');
const plan=JSON.parse(await fs.readFile(patchFile,'utf8'));
if(plan.maintenance_id!=='CRF-DF-ASSISTENTE-I-2026-07-31-EDITORIAL-14'||plan.patches?.length!==14) throw new Error('Plano de manutenção inválido.');

const clean=v=>String(v??'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').trim();
const same=(a,b)=>clean(a)===clean(b), sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function request(endpoint,options={},attempt=1){
  const response=await fetch(`${API}${endpoint}`,{...options,headers:{Authorization:`Bearer ${TOKEN}`,'Notion-Version':VERSION,'Content-Type':'application/json',...(options.headers||{})}});
  if(response.ok) return response.status===204?{}:response.json();
  const body=await response.text();
  if((response.status===429||response.status>=500)&&attempt<8){await sleep(Math.max(Number(response.headers.get('retry-after')||0)*1000,400*2**(attempt-1)));return request(endpoint,options,attempt+1);}
  throw new Error(`Notion API ${response.status}: ${body.slice(0,900)}`);
}
function value(p){
  if(!p)return null;
  if(p.type==='title')return(p.title||[]).map(x=>x.plain_text??x.text?.content??'').join('');
  if(p.type==='rich_text')return(p.rich_text||[]).map(x=>x.plain_text??x.text?.content??'').join('');
  if(p.type==='select')return p.select?.name??null;if(p.type==='status')return p.status?.name??null;
  if(p.type==='checkbox')return p.checkbox===true;if(p.type==='date')return p.date?.start??null;
  if(p.type==='url')return p.url??null;if(p.type==='number')return p.number??null;
  if(p.type==='formula'){const f=p.formula;if(!f)return null;if(f.type==='string')return f.string;if(f.type==='boolean')return f.boolean;if(f.type==='number')return f.number;if(f.type==='date')return f.date?.start??null;}
  return null;
}
const text=value=>({rich_text:[{type:'text',text:{content:value}}]});
function textPatch(p,v,n){if(!p)throw new Error(`${n} ausente.`);if(p.type==='rich_text')return text(v);if(p.type==='title')return{title:text(v).rich_text};throw new Error(`${n} incompatível: ${p.type}.`);}
function namedPatch(p,v,n){if(!p)throw new Error(`${n} ausente.`);if(p.type==='select')return{select:{name:v}};if(p.type==='status')return{status:{name:v}};throw new Error(`${n} incompatível: ${p.type}.`);}
function datePatch(p,v,n){if(!p||p.type!=='date')throw new Error(`${n} ausente ou incompatível.`);return{date:{start:v}};}
const snap=(props,names)=>Object.fromEntries(names.map(n=>[n,value(props[n])]));
function preserved(before,after,ctx){for(const n of Object.keys(before))if(JSON.stringify(before[n])!==JSON.stringify(after[n]))throw new Error(`${ctx}: ${n} mudou.`);}
async function findCode(code){
  try{const r=await request(`/data_sources/${plan.data_source_id}/query`,{method:'POST',body:JSON.stringify({page_size:10,filter:{property:'Código',rich_text:{equals:code}}})});const x=(r.results||[]).find(p=>same(value(p.properties?.Código),code));if(x)return x;}catch(e){console.log(`Filtro direto indisponível: ${e.message}`);}
  let cursor;do{const body={page_size:100,...(cursor?{start_cursor:cursor}:{})};const r=await request(`/data_sources/${plan.data_source_id}/query`,{method:'POST',body:JSON.stringify(body)});const x=(r.results||[]).find(p=>same(value(p.properties?.Código),code));if(x)return x;cursor=r.has_more?r.next_cursor:null;}while(cursor);return null;
}
const report={maintenance_id:plan.maintenance_id,started_at:new Date().toISOString(),preflight:[],updates:[],item_41:null,totals:{planned:14,updated:0,already_correct:0},constraints:{publication_fields_preserved:true,github_or_site_changed:false,publication_lot_created:false,released_for_export_changed:false}};
async function save(){await fs.mkdir(path.dirname(reportFile),{recursive:true});await fs.writeFile(reportFile,`${JSON.stringify(report,null,2)}\n`,'utf8');}
try{
  const prepared=[],pages=new Set(),codes=new Set();
  for(const p of plan.patches){
    if(pages.has(p.page_id)||codes.has(p.code))throw new Error(`Duplicidade no plano: ${p.code}.`);pages.add(p.page_id);codes.add(p.code);
    const page=await request(`/pages/${p.page_id}`),props=page.properties||{},code=value(props['Código']);
    if(!same(code,p.code))throw new Error(`${p.code}: código divergente (${code||'vazio'}).`);
    const current=value(props[p.target_property]);
    const state=same(current,p.desired_after)?'already_correct':same(current,p.expected_before)?'ready':'unexpected';
    if(state==='unexpected')throw new Error(`${p.code}: valor atual inesperado em ${p.target_property}; nenhuma gravação iniciada.`);
    textPatch(props[p.target_property],p.desired_after,p.target_property);namedPatch(props['Auditoria de conteúdo'],p.audit_status,'Auditoria de conteúdo');datePatch(props['Data da revisão'],p.review_date,'Data da revisão');
    const keep=snap(props,p.preserve);report.preflight.push({code:p.code,number:p.original_number,state,target:p.target_property,preserved_before:keep});prepared.push({p,state,keep});
  }
  const item41=await findCode(plan.item_41_investigation.code);if(!item41)throw new Error('Item 41 não encontrado.');
  const props41=item41.properties||{},names=['Código','Questão','Número original','Gabarito','Auditoria de conteúdo','Transcrição conferida','Gabarito conferido - registro manual anterior','Gabarito conferido — registro manual anterior','Comentário geral','URL da fonte','Página do PDF','Bloqueio manual de publicação','Pode publicar','Liberada para exportação','Lote de publicação','Código GitHub','Data da publicação','Status editorial — registro manual anterior','Status editorial - registro manual anterior','Observações'];
  report.item_41={page_id:item41.id,url:item41.url,official_answer:plan.item_41_investigation.official_answer,finding:plan.item_41_investigation.finding,properties:Object.fromEntries(names.filter(n=>props41[n]).map(n=>[n,value(props41[n])])),changed:false};
  for(const x of prepared){
    const {p,state,keep}=x;if(state==='already_correct'){const now=await request(`/pages/${p.page_id}`);preserved(keep,snap(now.properties||{},p.preserve),p.code);report.updates.push({code:p.code,result:'already_correct'});report.totals.already_correct++;continue;}
    const before=await request(`/pages/${p.page_id}`),bp=before.properties||{};if(!same(value(bp['Código']),p.code)||!same(value(bp[p.target_property]),p.expected_before))throw new Error(`${p.code}: mudou após preflight.`);preserved(keep,snap(bp,p.preserve),`${p.code} antes`);
    await request(`/pages/${p.page_id}`,{method:'PATCH',body:JSON.stringify({properties:{[p.target_property]:textPatch(bp[p.target_property],p.desired_after,p.target_property),'Auditoria de conteúdo':namedPatch(bp['Auditoria de conteúdo'],p.audit_status,'Auditoria de conteúdo'),'Data da revisão':datePatch(bp['Data da revisão'],p.review_date,'Data da revisão')}})});
    const after=await request(`/pages/${p.page_id}`),ap=after.properties||{};if(!same(value(ap[p.target_property]),p.desired_after)||!same(value(ap['Auditoria de conteúdo']),p.audit_status)||!same(value(ap['Data da revisão']),p.review_date))throw new Error(`${p.code}: verificação pós-gravação falhou.`);preserved(keep,snap(ap,p.preserve),`${p.code} depois`);
    report.updates.push({code:p.code,number:p.original_number,result:'updated',target:p.target_property,value_after:value(ap[p.target_property]),audit_after:value(ap['Auditoria de conteúdo']),date_after:value(ap['Data da revisão']),preserved_after:snap(ap,p.preserve)});report.totals.updated++;
  }
  if(report.totals.updated+report.totals.already_correct!==14)throw new Error('Contagem final divergente.');report.status='success';report.completed_at=new Date().toISOString();await save();console.log(`✓ ${report.totals.updated} atualizados; ${report.totals.already_correct} já corretos; 14 verificados.`);console.log(`✓ Item 41 diagnosticado: ${report.item_41.url}`);console.log('✓ Publicação, lotes, liberação, gabaritos e comentários preservados.');
}catch(e){report.status='failure';report.completed_at=new Date().toISOString();report.error=e instanceof Error?e.message:String(e);await save();throw e;}
