import fs from "node:fs";
const data=JSON.parse(fs.readFileSync(new URL("../data/questoes.json",import.meta.url),"utf8"));
const ids=new Set();
if(!Array.isArray(data.questions)||!data.questions.length)throw new Error("Nenhuma questão encontrada.");
for(const q of data.questions){
  if(!q.id||ids.has(q.id))throw new Error(`ID ausente ou duplicado: ${q.id}`);
  ids.add(q.id);
  if(!q.enunciado)throw new Error(`Enunciado ausente: ${q.id}`);
  const keys=Object.keys(q.alternativas||{});
  if(keys.length<2||!keys.includes(q.gabarito))throw new Error(`Alternativas/gabarito inválidos: ${q.id}`);
}
for(const m of data.materials||[])for(const id of m.questoes||[])if(!ids.has(id))throw new Error(`Material referencia questão inexistente: ${id}`);
console.log(`Dados válidos: ${data.questions.length} questões, ${data.materials.length} material(is).`);
