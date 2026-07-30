import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'data','notion','published.json');
if(!fs.existsSync(file)){console.log('✓ Snapshot do Notion ainda não instalado.');process.exit(0)}
const data=JSON.parse(fs.readFileSync(file,'utf8'));
const fail=message=>{throw new Error(message)};
const key=v=>String(v??'').trim().toLowerCase();
if(data.schema_version!=='1.0')fail('Versão do snapshot do Notion inválida.');
if(!Array.isArray(data.records))fail('Registros do snapshot ausentes.');
if(data.records.length!==Number(data.totals?.published))fail('Total publicável divergente no snapshot.');
if(Number(data.totals?.all)!==Number(data.totals?.published)+Number(data.totals?.pending))fail('Fechamento do Banco Mestre divergente.');
const codes=new Set(),githubIds=new Set(),urls=new Set(),materials=new Set();
for(const record of data.records){
 for(const [value,label] of [[record.code,'Código'],[record.title,'Questão'],[record.material_name,'Material'],[record.prompt,'Enunciado'],[record.answer,'Gabarito'],[record.comment,'Comentário']])if(!String(value||'').trim())fail(`${label} ausente no snapshot.`);
 if(codes.has(key(record.code)))fail(`Código duplicado: ${record.code}`);codes.add(key(record.code));
 if(record.github_id){if(githubIds.has(key(record.github_id)))fail(`Código GitHub duplicado: ${record.github_id}`);githubIds.add(key(record.github_id))}
 if(urls.has(record.notion_url))fail(`URL duplicada: ${record.notion_url}`);urls.add(record.notion_url);
 materials.add(key(record.material_name));
 if(record.format==='Certo / Errado'){
  if(!['Certo','Errado','Anulada'].includes(record.answer))fail(`${record.code}: gabarito C/E inválido.`);
 }else{
  for(const letter of ['A','B','C','D','E'])if(!record.alternatives?.[letter])fail(`${record.code}: alternativa ${letter} ausente.`);
  if(!['A','B','C','D','E','Anulada'].includes(record.answer))fail(`${record.code}: gabarito A–E inválido.`);
 }
}
if(materials.size!==Number(data.totals?.materials))fail('Total de materiais divergente no snapshot.');
for(const forbidden of ['Pode publicar','Status editorial','Auditoria efetiva','formulaResult','ID interno'])if(JSON.stringify(data).includes(`"${forbidden}"`))fail(`Campo técnico indevido no snapshot: ${forbidden}`);
console.log(`✓ Snapshot do Notion validado: ${data.records.length} questões, ${materials.size} materiais e ${data.totals.pending} registros excluídos da publicação.`);
