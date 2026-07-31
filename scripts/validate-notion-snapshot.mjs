import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'data', 'notion', 'published.json');
if (!fs.existsSync(file) || !fs.readFileSync(file, 'utf8').trim()) {
  console.log('✓ Snapshot do Notion ainda não instalado.');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = message => { throw new Error(message); };
const key = value => String(value ?? '').trim().toLowerCase();
if (!['1.0', '1.1', '1.2'].includes(data.schema_version)) fail('Versão do snapshot do Notion inválida.');
if (!Array.isArray(data.records)) fail('Registros do snapshot ausentes.');
if (data.records.length !== Number(data.totals?.published)) fail('Total publicável divergente no snapshot.');
if (Number(data.totals?.all) !== Number(data.totals?.published) + Number(data.totals?.pending)) fail('Fechamento do Banco Mestre divergente.');
if (data.schema_version === '1.2') {
  const rawPublicable = Number(data.totals?.publicable_rows_before_deduplication);
  const ignored = Number(data.totals?.duplicate_publicable_rows_ignored);
  if (!Number.isInteger(rawPublicable) || !Number.isInteger(ignored) || ignored < 0) fail('Totais de saneamento de duplicidades inválidos.');
  if (rawPublicable !== data.records.length + ignored) fail('Saneamento de duplicidades não fecha com o total publicável bruto.');
}

const codes = new Set();
const urls = new Set();
const materials = new Set();
for (const record of data.records) {
  for (const [value, label] of [
    [record.code, 'Código'],
    [record.title, 'Questão'],
    [record.material_name, 'Material'],
    [record.prompt, 'Enunciado'],
    [record.answer, 'Gabarito'],
    [record.comment, 'Comentário'],
  ]) if (!String(value || '').trim()) fail(`${label} ausente no snapshot.`);

  if (codes.has(key(record.code))) fail(`Código canônico duplicado: ${record.code}`);
  codes.add(key(record.code));
  if (urls.has(record.notion_url)) fail(`URL canônica duplicada: ${record.notion_url}`);
  urls.add(record.notion_url);
  materials.add(key(record.material_name));

  if (record.format === 'Certo / Errado') {
    if (!['Certo', 'Errado', 'Anulada'].includes(record.answer)) fail(`${record.code}: gabarito C/E inválido.`);
    if (record.format_inference === 'alternativas_A_E_vazias' && Object.keys(record.alternatives || {}).sort().join(',') !== 'Certo,Errado') {
      fail(`${record.code}: inferência C/E sem alternativas Certo/Errado normalizadas.`);
    }
  } else {
    for (const letter of ['A', 'B', 'C', 'D', 'E']) if (!record.alternatives?.[letter]) fail(`${record.code}: alternativa ${letter} ausente.`);
    if (!['A', 'B', 'C', 'D', 'E', 'Anulada'].includes(record.answer)) fail(`${record.code}: gabarito A–E inválido.`);
  }
  if (record.released_for_export && !record.publication_lot) fail(`${record.code}: liberada para exportação sem lote.`);
}

if (materials.size !== Number(data.totals?.materials)) fail('Total de materiais divergente no snapshot.');
for (const forbidden of ['Pode publicar', 'Status editorial', 'Auditoria efetiva', 'formulaResult', 'ID interno']) {
  if (JSON.stringify(data).includes(`"${forbidden}"`)) fail(`Campo técnico indevido no snapshot: ${forbidden}`);
}
console.log(`✓ Snapshot do Notion validado: ${data.records.length} questões canônicas, ${materials.size} materiais, ${data.totals.duplicate_publicable_rows_ignored || 0} duplicidade(s) ignorada(s) e ${data.totals.pending} registros fora da publicação.`);
