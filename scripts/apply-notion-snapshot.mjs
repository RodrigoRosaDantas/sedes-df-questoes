import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const resolve=p=>path.resolve(root,String(p).replace(/^\.\//,''));
const snapshotPath=resolve('data/notion/published.json');
if(!fs.existsSync(snapshotPath)){console.log('✓ Snapshot do Notion ainda não instalado; release estática preservada.');process.exit(0)}

const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
const catalogPath=resolve('data/release/catalogo.json');
const manifestPath=resolve('data/release/manifest.json');
const materialsDir=resolve('data/release/materials');
const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));
const clean=v=>String(v??'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').trim();
const key=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const slug=v=>key(v).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100);
const composite=(material,number)=>`${key(material)}::${Number(number)||0}`;
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const prefixFromRecord=r=>clean(r.code).match(/-([A-Z0-9]+)-(\d+)$/i)?.[1]?.toUpperCase()||'';
const prefixFromQuestion=q=>clean(q.codigo).match(/(?:CONSOL|SIM-[^-]+(?:-[^-]+)*)-([A-Z]+\d+)-\d+$/i)?.[1]?.toUpperCase()||clean(q.material_id).match(/-([a-z]+\d+)$/i)?.[1]?.toUpperCase()||'';
const editorialCode=r=>{const m=clean(r.code).match(/-([A-Z0-9]+)-(\d+)$/i);return m?`consol-${m[1]}-${Number(m[2])}`:''};
const fingerprint=(prefix,enunciado,alternatives,gabarito)=>key([prefix,enunciado,...Object.values(alternatives||{}),gabarito].join('\u241f'));

const currentMaterials=new Map();const questions=[];
for(const meta of catalog.materials||[]){
 const material=JSON.parse(fs.readFileSync(resolve(meta.file),'utf8'));
 currentMaterials.set(material.id,material);
 for(const q of material.questoes||[])questions.push({...q,material_id:material.id,material_name:material.nome});
}
const byCode=new Map(questions.map(q=>[key(q.codigo),q]));
const byId=new Map(questions.map(q=>[key(q.id),q]));
const byComposite=new Map(questions.map(q=>[composite(q.material_name,q.numero),q]));
const byFingerprint=new Map();const materialByPrefix=new Map();const materialByName=new Map();
for(const q of questions){
 const fp=fingerprint(prefixFromQuestion(q),q.enunciado,q.alternativas,q.gabarito);
 if(!byFingerprint.has(fp))byFingerprint.set(fp,[]);byFingerprint.get(fp).push(q);
 const prefix=prefixFromQuestion(q);if(prefix&&!materialByPrefix.has(prefix))materialByPrefix.set(prefix,q.material_id);
}
for(const material of currentMaterials.values())materialByName.set(key(material.nome),material.id);

function matchRecord(r){
 const direct=byCode.get(key(r.code));if(direct)return direct;
 const github=byId.get(key(r.github_id));if(github)return github;
 const fp=fingerprint(prefixFromRecord(r),r.prompt,r.alternatives,r.answer);
 const exact=byFingerprint.get(fp)||[];if(exact.length===1)return exact[0];
 const derived=byCode.get(key(editorialCode(r)));if(derived)return derived;
 return byComposite.get(composite(r.material_name,r.original_number))||null;
}
function materialIdFor(r,matched){
 if(matched)return matched.material_id;
 const byName=materialByName.get(key(r.material_name));if(byName)return byName;
 const byPrefix=materialByPrefix.get(prefixFromRecord(r));if(byPrefix)return byPrefix;
 return `notion-${slug(r.material_name||r.code)}`;
}
function updatedQuestion(r,current){
 const id=current?.id||clean(r.github_id)||slug(r.code);
 const code=current?.codigo||r.code;
 const numero=current?.numero||Number(r.original_number)||0;
 const use=(source,fallback)=>clean(source)||clean(fallback);
 return{
  ...(current||{}),
  id, codigo:code, numero,
  assunto:use(r.subject,current?.assunto),
  subassunto:use(r.subsubject,current?.subassunto),
  texto_base:use(r.text_base,current?.texto_base),
  enunciado:r.prompt,
  alternativas:r.format==='Certo / Errado'?{Certo:'Certo',Errado:'Errado'}:r.alternatives,
  gabarito:r.annulled?'Anulada':r.answer,
  comentario:r.comment,
  comentarios_alternativas:r.alternative_comments,
  fundamento:use(r.foundation,current?.fundamento),
  pegadinha:use(r.trap,current?.pegadinha),
  observacoes:use(r.observations,current?.observacoes),
  formato_questao:r.format,
  fonte_consolidada:r.source_url||r.notion_url,
  auditoria:'Banco Mestre — Pode publicar = true',
  notion_url:r.notion_url,
  codigo_fonte:r.code
 };
}
function baseMaterial(id,r,current){
 const type=key(r.material_type).includes('prova')?'prova':'simulado';
 return{
  ...(current?Object.fromEntries(Object.entries(current).filter(([k])=>k!=='questoes')):{}),
  id,
  tipo_material:type,
  fonte:r.source_board||current?.fonte||'Banco Mestre do Notion',
  nome:r.material_name||current?.nome||id,
  ano:r.year||current?.ano||null,
  orgao:r.organization||current?.orgao||'SEDES/DF',
  cargo:r.cargo||current?.cargo||'',
  codigo_cargo:r.cargo_code||current?.codigo_cargo||'',
  disciplina:r.discipline||current?.disciplina||'',
  bloco:r.block||current?.bloco||'',
  status:'publicado',
  source_url:r.source_url||r.notion_url||current?.source_url||snapshot.source.database_url,
  formato_questao:r.format,
  questoes:[]
 };
}

const finalMaterials=new Map();const usedIds=new Set();const usedCodes=new Set();
for(const r of snapshot.records||[]){
 const current=matchRecord(r);
 const materialId=materialIdFor(r,current);
 if(!finalMaterials.has(materialId))finalMaterials.set(materialId,baseMaterial(materialId,r,currentMaterials.get(materialId)));
 const q=updatedQuestion(r,current);
 if(!q.id||!q.codigo||!q.enunciado||!q.comentario)throw new Error(`${r.code}: questão incompleta após aplicação do snapshot.`);
 if(usedIds.has(key(q.id)))throw new Error(`ID duplicado após sincronização: ${q.id}`);
 if(usedCodes.has(key(q.codigo)))throw new Error(`Código duplicado após sincronização: ${q.codigo}`);
 usedIds.add(key(q.id));usedCodes.add(key(q.codigo));
 finalMaterials.get(materialId).questoes.push(q);
}

for(const material of finalMaterials.values()){
 material.questoes.sort((a,b)=>Number(a.numero)-Number(b.numero)||a.codigo.localeCompare(b.codigo));
 material.quantidade_questoes=material.questoes.length;
 material.tempo_sugerido_minutos=material.tempo_sugerido_minutos||material.questoes.length*(material.formato_questao==='Certo / Errado'?1:2);
 const formats=new Set(material.questoes.map(q=>q.formato_questao));
 if(formats.size>1)material.formato_questao='Híbrido';
}

fs.rmSync(materialsDir,{recursive:true,force:true});fs.mkdirSync(materialsDir,{recursive:true});
const catalogMaterials=[];const questionIndex={};
for(const material of [...finalMaterials.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))){
 const file=`./data/release/materials/${material.id}.json`;
 const content=`${JSON.stringify(material)}\n`;
 fs.writeFileSync(resolve(file),content);
 for(const q of material.questoes)questionIndex[q.id]=material.id;
 const{questoes,...meta}=material;catalogMaterials.push({...meta,file});
}

catalog.exported_at=new Date().toISOString();
catalog.source={name:snapshot.source.name,notion_url:snapshot.source.database_url,criteria:`${snapshot.totals.published} questões liberadas por “Pode publicar = true”; ${snapshot.totals.pending} registros permanecem em revisão editorial.`};
catalog.summary={banco_mestre:snapshot.totals.all,materiais:catalogMaterials.length,questoes:snapshot.totals.published,aguardando_auditoria:snapshot.totals.pending,provas:catalogMaterials.filter(m=>m.tipo_material==='prova').length,simulados:catalogMaterials.filter(m=>m.tipo_material==='simulado').length};
catalog.materials=catalogMaterials;catalog.question_index=questionIndex;
const catalogContent=`${JSON.stringify(catalog,null,2)}\n`;fs.writeFileSync(catalogPath,catalogContent);
const manifest={schema_version:'3.0',release_version:catalog.release_version,generated_at:new Date().toISOString(),summary:catalog.summary,catalog_sha256:sha256(catalogContent),materials:catalogMaterials.map(meta=>{const content=fs.readFileSync(resolve(meta.file));return{id:meta.id,file:meta.file,questions:meta.quantidade_questoes,bytes:content.length,sha256:sha256(content)}})};
fs.writeFileSync(manifestPath,`${JSON.stringify(manifest,null,2)}\n`);
console.log(`✓ Snapshot do Notion aplicado: ${catalog.summary.questoes} questões em ${catalog.summary.materiais} materiais; IDs públicos preservados quando já existentes.`);
