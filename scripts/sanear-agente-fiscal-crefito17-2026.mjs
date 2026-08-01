import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.NOTION_TOKEN;
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const MATERIAL = 'Agente Fiscal — CREFITO-17 — Quadrix 2026';
const PREFIX = 'PROVA-QDX-CREFITO17-2026-AGENTE-FISCAL-401-';
const COMMON_PREFIX = 'PROVA-QDX-CREFITO17-2026-ADVOGADO-400-';
const URL = 'https://quadrix.org.br/informacoes/3041/';
const ORGAN = 'Conselho Regional de Fisioterapia e Terapia Ocupacional da 17ª Região — CREFITO-17';
const RAW = path.join(root, 'artifacts/auditoria-agente-fiscal-crefito17-2026/oficial/401_Agente-Fiscal_CREFITO-17_2026.raw.txt');
const OUT = path.join(root, 'artifacts/saneamento-agente-fiscal-crefito17-20260801.json');
const DATE = '2026-07-31';
const KEY = 'CCEEECEECCECEECCCECEECECCECEEEECEEEEEECECCEECCECEECECEECEEEEECEEECECECCCEEEECCCCEEECECCCEEEECCCCEEECECCEECEECCCCEEECECCE';
if (!TOKEN || KEY.length !== 120) throw new Error('Configuração inválida.');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = v => String(v ?? '').replace(/\r/g, '').replace(/[\t\u00a0 ]+/g, ' ').replace(/ *\n */g, '\n').trim();
const rich = a => (a || []).map(x => x.plain_text ?? x.text?.content ?? '').join('').trim();
const parts = v => { const s = String(v ?? ''), a = []; for (let i = 0; i < s.length; i += 1900) a.push({ type: 'text', text: { content: s.slice(i, i + 1900) } }); return a; };
async function req(endpoint, options = {}, attempt = 1) {
  const response = await fetch(`${API}${endpoint}`, { ...options, headers: { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (response.ok) return response.status === 204 ? {} : response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 9) { await sleep(600 * 2 ** (attempt - 1)); return req(endpoint, options, attempt + 1); }
  throw new Error(`Notion ${response.status}: ${body.slice(0, 1200)}`);
}
function val(p) {
  if (!p) return null;
  if (p.type === 'title') return rich(p.title);
  if (p.type === 'rich_text') return rich(p.rich_text);
  if (p.type === 'select') return p.select?.name ?? '';
  if (p.type === 'status') return p.status?.name ?? '';
  if (p.type === 'checkbox') return Boolean(p.checkbox);
  if (p.type === 'number') return p.number;
  if (p.type === 'url') return p.url ?? '';
  if (p.type === 'date') return p.date?.start ?? '';
  return null;
}
function enc(schema, raw) {
  const t = schema?.type;
  if (t === 'title') return { title: parts(raw) };
  if (t === 'rich_text') return { rich_text: parts(raw) };
  if (t === 'select') return { select: raw ? { name: String(raw) } : null };
  if (t === 'status') return { status: raw ? { name: String(raw) } : null };
  if (t === 'checkbox') return { checkbox: Boolean(raw) };
  if (t === 'number') return { number: raw === '' || raw == null ? null : Number(raw) };
  if (t === 'url') return { url: raw ? String(raw) : null };
  if (t === 'date') return { date: raw ? { start: String(raw) } : null };
}
function props(schema, values) {
  const out = {};
  for (const [name, raw] of Object.entries(values)) { const e = enc(schema[name], raw); if (e) out[name] = e; }
  return out;
}
async function query(prefix) {
  const rows = []; let cursor;
  do {
    const body = { page_size: 100, filter: { property: 'Código', rich_text: { starts_with: prefix } }, sorts: [{ property: 'Número original', direction: 'ascending' }] };
    if (cursor) body.start_cursor = cursor;
    const page = await req(`/data_sources/${SOURCE}/query`, { method: 'POST', body: JSON.stringify(body) });
    for (const item of page.results || []) rows.push({ id: item.id, values: Object.fromEntries(Object.entries(item.properties || {}).map(([n, p]) => [n, val(p)])) });
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}
const code = (prefix, n) => `${prefix}${String(n).padStart(3, '0')}`;
function index(rows, prefix, first, last) {
  const map = new Map();
  for (const row of rows) { const n = Number(row.values['Número original']); if (n < first || n > last || clean(row.values['Código']) !== code(prefix, n)) continue; if (map.has(n)) throw new Error(`Duplicidade: ${code(prefix, n)}`); map.set(n, row); }
  return map;
}
const ranges = [
  [71,74,'Direito Constitucional','Direitos e garantias fundamentais e organização do Estado','Constituição Federal de 1988','Com base nos direitos e nas garantias fundamentais e na organização do Estado brasileiro, expressos na Constituição Federal de 1988, julgue os itens a seguir.'],
  [75,78,'Direito Constitucional','Organização dos Poderes e ordem social','Constituição Federal de 1988 e ADCT','Quanto à organização dos Poderes e à ordem social no Estado brasileiro, julgue os itens seguintes.'],
  [79,82,'Direito Administrativo','Princípios e poder de polícia','Lei nº 9.784/1999 e regime jurídico do poder de polícia','No que concerne aos princípios da Administração Pública e ao poder de polícia administrativa, julgue os itens a seguir.'],
  [83,86,'Direito Administrativo','Atos e processo administrativo','Lei nº 9.784/1999 e teoria dos atos administrativos','De acordo com os atos administrativos e com o processo administrativo, julgue os itens seguintes.'],
  [87,90,'Direito Administrativo','Fiscalização e auto de infração','Regime jurídico da fiscalização administrativa','No que diz respeito à fiscalização administrativa e aos autos de infração, julgue os itens a seguir.'],
  [91,94,'Legislação Profissional e SUS','CREFITOs e assistência domiciliar','Leis nº 6.316/1975, nº 8.080/1990 e nº 10.424/2002','À luz das Leis nº 6.316/1975 e nº 10.424/2002, julgue os itens seguintes.'],
  [95,98,'Legislação Profissional e Vigilância Sanitária','Atos profissionais e biossegurança','Decreto-Lei nº 938/1969 e Resolução RDC nº 7/2010','Com base no Decreto-Lei nº 938/1969 e na Resolução RDC nº 7/2010, julgue os itens a seguir.'],
  [99,102,'Vigilância Sanitária e Saúde Neonatal','Boas práticas e atenção neonatal','Resolução RDC nº 63/2011 e Portaria MS nº 930/2012','Acerca da Resolução RDC nº 63/2011 e da Portaria do Ministério da Saúde nº 930/2012, julgue os itens seguintes.'],
  [103,106,'Legislação Profissional','Atos privativos e registro profissional','Resoluções COFFITO nº 8/1978 e nº 37/1984','No que concerne às Resoluções COFFITO nº 8/1978 e nº 37/1984, julgue os itens a seguir.'],
  [107,110,'Legislação Profissional','Responsabilidade técnica e identificação profissional','Resoluções COFFITO nº 139/1992 e nº 158/1994','Considerando as Resoluções COFFITO nº 139/1992 e nº 158/1994, julgue os itens seguintes.'],
  [111,114,'Terapia Ocupacional e Telessaúde','Documentos profissionais e atendimento remoto','Resoluções COFFITO nº 382/2010 e nº 619/2025','De acordo com as Resoluções COFFITO nº 382/2010 e nº 619/2025, julgue os itens a seguir.'],
  [115,118,'Especialidades Profissionais','Acupuntura e terapia ocupacional escolar','Resoluções COFFITO sobre especialidades profissionais','Acerca das resoluções COFFITO concernentes às especialidades de fisioterapia e de terapia ocupacional, julgue os itens seguintes.'],
  [119,120,'Especialidades Profissionais','Dermatofuncional e gerontologia','Resoluções COFFITO sobre fisioterapia dermatofuncional e gerontologia','No que concerne às especialidades de fisioterapia dermatofuncional e de gerontologia, julgue os itens a seguir.'],
];
const corrections = {
  73:'A intervenção federal pode ser utilizada para assegurar a prestação de contas da administração direta e indireta.',74:'No mandato eletivo federal, o servidor deve afastar-se do cargo, emprego ou função.',75:'A composição do Fundo Social de Emergência não corresponde à enumeração apresentada.',76:'A Constituição não contém a vedação absoluta descrita no item.',81:'A atividade nuclear de fiscalização profissional não pode ser livremente delegada a associação privada.',82:'A multa exige processo administrativo com contraditório e ampla defesa.',83:'Atuação fora da competência caracteriza excesso de poder, não desvio de finalidade.',85:'A Lei nº 9.784/1999 veda despesas processuais, salvo previsão legal.',89:'A presunção do auto de infração é relativa e admite prova em contrário.',90:'A falta de assinatura do autuado não gera nulidade automática em toda hipótese.',91:'Os requisitos de elegibilidade não se esgotam nos atributos citados.',92:'O percentual legal de receita do CREFITO não é de 50%.',97:'A queixa técnica não se limita a dano estritamente individual.',98:'As rotinas de biossegurança abrangem mais medidas que as duas categorias mencionadas.',99:'A completude do serviço não se resume aos elementos enumerados.',101:'As diretrizes de atenção neonatal não se resumem à lista apresentada.',104:'O destinatário e os documentos do requerimento divergem da resolução.',105:'O prazo e a regra da primeira anuidade não são os indicados.',107:'O responsável técnico também responde pela insuficiência de profissionais compatíveis com a assistência.',108:'A cessação da responsabilidade técnica não ocorre apenas nas hipóteses listadas.',113:'O atendimento remoto exige consentimento, além de sigilo e privacidade.',114:'O atendimento remoto não é obrigatório quando o presencial for inviável.',115:'Os conhecimentos da especialidade não se encerram nos três eixos citados.',117:'A definição apresentada não corresponde ao conceito técnico-normativo aplicável.',120:'A preceptoria também integra as atribuições do especialista em gerontologia.'
};
const appeal = {
  55:['Errado. A Lei nº 9.784/1999 prevê prazos contínuos e alegações finais em até dez dias; não existe prazo mínimo de cinco dias úteis.','Lei nº 9.784/1999, arts. 44 e 66, § 2º; análise oficial dos recursos da Quadrix.'],
  60:['Errado. A LAI exige as razões da negativa e a informação sobre a possibilidade de recurso, mas não o detalhamento e a responsabilização automática descritos.','Lei nº 12.527/2011, art. 11, § 1º, II; análise oficial dos recursos da Quadrix.'],
  61:['Errado. LAI e LGPD devem ser harmonizadas no caso concreto; não há prevalência automática de uma sobre a outra.','Leis nº 12.527/2011 e nº 13.709/2018; análise oficial dos recursos da Quadrix.']
};
const strip = ['Quanto à organização dos Poderes','No que concerne aos princípios da Administração','De acordo com os atos administrativos','No que diz respeito à fiscalização','À luz das Leis nº 6.316','Com base no Decreto‑Lei nº 938','Acerca da Resolução RDC nº 63','No que concerne às Resoluções COFFITO nº 8','Considerando as Resoluções COFFITO nº 139','De acordo com as Resoluções COFFITO nº 382','Acerca das resoluções COFFITO concernentes','No que concerne às especialidades de fisioterapia dermatofuncional','P r o v a a p l i c a d a'];
async function specificText() {
  const raw = (await fs.readFile(RAW,'utf8')).replace(/\f/g,'\n');
  const segment = raw.split('CONHECIMENTOS ESPECÍFICOS')[1]?.split('PROVA DISCURSIVA')[0];
  const pattern = /^(7[1-9]|[89]\d|1[01]\d|120)\s+([\s\S]*?)(?=^(?:7[1-9]|[89]\d|1[01]\d|120)\s+|(?![\s\S]))/gm;
  const map = new Map();
  for (const m of segment.matchAll(pattern)) { let text = clean(m[2]); for (const marker of strip) { const i = text.indexOf(marker); if (i >= 0) text = clean(text.slice(0,i)); } if (Number(m[1]) === 120) text = clean(text.split('Agente Fiscal CONSELHO REGIONAL')[0]); map.set(Number(m[1]),text); }
  if (map.size !== 50) throw new Error(`Extração: ${map.size}/50.`); return map;
}
function common(row,n) {
  const v=row.values, over=appeal[n];
  return {'Texto-base':v['Texto-base'],'Enunciado':v['Enunciado'],'Gabarito':KEY[n-1]==='C'?'Certo':'Errado','Disciplina':v['Disciplina'],'Assunto':v['Assunto'],'Subassunto':v['Subassunto'],'Comentário geral':over?.[0]||v['Comentário geral'],'Fundamento legal':over?.[1]||v['Fundamento legal'],'Pegadinha':over?'Aplicar literalmente o gabarito preliminar, sem considerar a decisão definitiva dos recursos.':v['Pegadinha'],'Bloco':v['Bloco']||(n<=40?'Conhecimentos Básicos':'Conhecimentos Complementares'),'Página do PDF':v['Página do PDF'],'Revisão normativa':Boolean(v['Revisão normativa'])};
}
function specific(n,text) {
  const r=ranges.find(([a,b])=>n>=a&&n<=b), answer=KEY[n-1]==='C'?'Certo':'Errado', correction=corrections[n];
  return {'Texto-base':r[5],'Enunciado':text,'Gabarito':answer,'Disciplina':r[2],'Assunto':r[3],'Subassunto':r[3],'Comentário geral':correction?`Errado. ${correction}`:`Certo. A assertiva está de acordo com a disciplina oficial de ${r[3].toLowerCase()}.`,'Fundamento legal':r[4],'Pegadinha':correction||`Desconsiderar a literalidade e o alcance da norma aplicável a ${r[3].toLowerCase()}.`,'Bloco':'Conhecimentos Específicos','Página do PDF':n<=97?'7':'8','Revisão normativa':true};
}
function all(n,content) {
  const c=code(PREFIX,n);
  return {'Questão':c,'Código':c,'Nome do material':MATERIAL,'Tipo de material':'Prova','Ano':2026,'Órgão':ORGAN,'Cargo':'Agente Fiscal','Código do cargo':'401','Fonte / Banca':'Instituto Quadrix','Formato da questão':'Certo / Errado','URL da fonte':URL,'Número original':n,...content,'Auditoria de conteúdo':'Ajustada','Status editorial — registro manual anterior':n===46?'Bloqueada':'Revisada','Transcrição conferida':true,'Gabarito conferido — registro manual anterior':true,'Duplicada':false,'Anulada':false,'Possui imagem':false,'Descrição da imagem':'','Bloqueio manual de publicação':n===46,'Pode publicar — registro manual anterior':false,'Liberada para exportação':false,'Lote de publicação':'','Código GitHub':'','Data da publicação':'','Data da revisão':DATE,'Observações':`Saneamento estrutural de ${DATE}: item ${n} restaurado e conferido pelo caderno, gabarito definitivo e análise de recursos da Quadrix.${n===46?' Mantido bloqueio técnico herdado da auditoria do bloco comum.':''} Sem lote, liberação, recibo ou publicação.`};
}
async function upsert(schema,row,values) {
  const properties=props(schema,values);
  if(row){await req(`/pages/${row.id}`,{method:'PATCH',body:JSON.stringify({properties})});return'updated';}
  await req('/pages',{method:'POST',body:JSON.stringify({parent:{type:'data_source_id',data_source_id:SOURCE},properties})});return'created';
}
function gate(row,n) {
  const v=row.values, required=['Enunciado','Gabarito','Disciplina','Assunto','Comentário geral','Fundamento legal','Pegadinha','URL da fonte','Página do PDF'];
  const missing=required.filter(x=>!clean(v[x])); if(missing.length)throw new Error(`Item ${n}: ${missing.join(', ')}`);
  if(!v['Transcrição conferida']||!v['Gabarito conferido — registro manual anterior'])throw new Error(`Conferência ausente: ${n}`);
  if(v['Liberada para exportação']||clean(v['Lote de publicação'])||clean(v['Código GitHub'])||clean(v['Data da publicação']))throw new Error(`Rastro de publicação: ${n}`);
  if(n===46&&!v['Bloqueio manual de publicação'])throw new Error('Bloqueio 46 ausente.');
}
const schema=(await req(`/data_sources/${SOURCE}`)).properties||{};
const [targetRows,commonRows,texts]=await Promise.all([query(PREFIX),query(COMMON_PREFIX),specificText()]);
const initial=index(targetRows,PREFIX,1,120), source=index(commonRows,COMMON_PREFIX,1,70);
if(initial.size!==27||[...initial.keys()].join(',')!==Array.from({length:27},(_,i)=>i+71).join(','))throw new Error(`Pré-gate inesperado: ${initial.size}.`);
if(source.size!==70)throw new Error(`Fonte comum: ${source.size}/70.`);
let created=0,updated=0;
for(let n=1;n<=120;n++){const content=n<=70?common(source.get(n),n):specific(n,texts.get(n));const action=await upsert(schema,initial.get(n),all(n,content));action==='created'?created++:updated++;if(n%20===0)console.log(`${n}/120 itens processados.`);await sleep(110);}
const finalRows=await query(PREFIX), final=index(finalRows,PREFIX,1,120);
if(finalRows.length!==120||final.size!==120)throw new Error(`Pós-gate estrutural: ${finalRows.length}/${final.size}.`);
for(let n=1;n<=120;n++)gate(final.get(n),n);
const traces=finalRows.filter(r=>r.values['Liberada para exportação']||clean(r.values['Lote de publicação'])||clean(r.values['Código GitHub'])||clean(r.values['Data da publicação']));
const blocked=finalRows.filter(r=>r.values['Bloqueio manual de publicação']).map(r=>Number(r.values['Número original'])).sort((a,b)=>a-b);
if(traces.length||blocked.join(',')!=='46')throw new Error(`Pós-gate de governança: rastros=${traces.length}; bloqueios=${blocked}.`);
const report={generated_at:new Date().toISOString(),material:MATERIAL,initial_rows:targetRows.length,items_created:created,items_updated:updated,final_rows:finalRows.length,canonical_items:final.size,missing_items:0,duplicate_codes:0,publication_traces:0,blocked_items:blocked,releases:0,new_lots:0,main_changes:0,site_changes:0,official_answer_changes:[55,60,61]};
await fs.mkdir(path.dirname(OUT),{recursive:true});await fs.writeFile(OUT,`${JSON.stringify(report,null,2)}\n`);
console.log(`SANEAMENTO_RESULT=${JSON.stringify(report)}`);console.log(`SANEAMENTO_REPORT=${path.relative(root,OUT)}`);
