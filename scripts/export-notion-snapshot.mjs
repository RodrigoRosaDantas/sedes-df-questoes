import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'data', 'notion', 'published.json');
const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const DATABASE_URL = 'https://app.notion.com/p/a1d5fc8f8e434105861faba90dc156d9?v=85b47b4a2e17461e9d3482724b13fab8';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível neste repositório.');

const clean = value => String(value ?? '')
  .replace(/\r/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .trim();
const key = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function request(endpoint, options = {}, attempt = 1) {
  const response = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (response.ok) return response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 7) {
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 500 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 600)}`);
}

const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
function value(property) {
  if (!property) return null;
  if (property.type === 'title') return rich(property.title);
  if (property.type === 'rich_text') return rich(property.rich_text);
  if (property.type === 'select') return property.select?.name ?? null;
  if (property.type === 'status') return property.status?.name ?? null;
  if (property.type === 'multi_select') return (property.multi_select || []).map(item => item.name);
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  if (property.type === 'number') return property.number;
  if (property.type === 'url') return property.url;
  if (property.type === 'date') return property.date?.start ?? null;
  if (property.type === 'created_time' || property.type === 'last_edited_time') return property[property.type];
  if (property.type === 'formula') {
    const formula = property.formula;
    if (!formula) return null;
    if (formula.type === 'string') return formula.string;
    if (formula.type === 'boolean') return formula.boolean;
    if (formula.type === 'number') return formula.number;
    if (formula.type === 'date') return formula.date?.start ?? null;
  }
  return null;
}

async function readAll() {
  const rows = [];
  let cursor;
  let batches = 0;
  do {
    const body = {page_size: 100};
    if (cursor) body.start_cursor = cursor;
    const page = await request(`/data_sources/${SOURCE}/query`, {method: 'POST', body: JSON.stringify(body)});
    for (const item of page.results || []) {
      const properties = Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)]));
      rows.push({notion_id: item.id, notion_url: item.url, ...properties});
    }
    batches += 1;
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  console.log(`Banco Mestre: ${rows.length} registros lidos em ${batches} lotes.`);
  return rows;
}

function record(row) {
  const declaredFormat = clean(row['Formato da questão']);
  const answer = clean(row['Gabarito']);
  const multipleChoiceAlternatives = {
    A: clean(row['Alternativa A']),
    B: clean(row['Alternativa B']),
    C: clean(row['Alternativa C']),
    D: clean(row['Alternativa D']),
    E: clean(row['Alternativa E']),
  };
  const alternativesAreBlank = Object.values(multipleChoiceAlternatives).every(alternative => !alternative);
  const trueFalse = alternativesAreBlank
    || /certo\s*\/\s*errado/i.test(declaredFormat)
    || ['Certo', 'Errado'].includes(answer);

  return {
    notion_id: row.notion_id,
    notion_url: row.notion_url,
    code: clean(row['Código']),
    github_id: clean(row['Código GitHub']),
    title: clean(row['Questão']),
    material_name: clean(row['Nome do material']),
    material_type: clean(row['Tipo de material']),
    year: Number(row['Ano']) || null,
    organization: clean(row['Órgão']),
    cargo: clean(row['Cargo']),
    cargo_code: clean(row['Código do cargo']),
    discipline: clean(row['Disciplina']),
    subject: clean(row['Assunto']),
    subsubject: clean(row['Subassunto']),
    block: clean(row['Bloco']),
    source_board: clean(row['Fonte / Banca']),
    source_url: clean(row['URL da fonte']),
    format: trueFalse ? 'Certo / Errado' : declaredFormat || 'Múltipla escolha A–E',
    format_inference: alternativesAreBlank ? 'alternativas_A_E_vazias' : 'formato_ou_gabarito',
    original_number: Number(row['Número original']) || null,
    text_base: clean(row['Texto-base']),
    prompt: clean(row['Enunciado']),
    alternatives: trueFalse ? {Certo: 'Certo', Errado: 'Errado'} : multipleChoiceAlternatives,
    answer,
    comment: clean(row['Comentário geral']),
    alternative_comments: {
      A: clean(row['Comentário A']),
      B: clean(row['Comentário B']),
      C: clean(row['Comentário C']),
      D: clean(row['Comentário D']),
      E: clean(row['Comentário E']),
    },
    foundation: clean(row['Fundamento legal']),
    trap: clean(row['Pegadinha']),
    observations: clean(row['Observações']),
    annulled: Boolean(row['Anulada']),
    has_image: Boolean(row['Possui imagem']),
    image_description: clean(row['Descrição da imagem']),
    pdf_page: clean(row['Página do PDF']),
    publication_lot: clean(row['Lote de publicação']),
    released_for_export: Boolean(row['Liberada para exportação']),
  };
}

function validate(records) {
  const codes = new Set();
  const ids = new Set();
  for (const item of records) {
    for (const [propertyValue, label] of [
      [item.code, 'Código'],
      [item.title, 'Questão'],
      [item.material_name, 'Nome do material'],
      [item.prompt, 'Enunciado'],
      [item.answer, 'Gabarito'],
      [item.comment, 'Comentário geral'],
    ]) {
      if (!propertyValue) throw new Error(`${label} ausente em ${item.code || item.notion_url}.`);
    }
    if (codes.has(key(item.code))) throw new Error(`Código publicável duplicado: ${item.code}`);
    codes.add(key(item.code));
    if (item.github_id) {
      if (ids.has(key(item.github_id))) throw new Error(`Código GitHub duplicado: ${item.github_id}`);
      ids.add(key(item.github_id));
    }
    if (item.format === 'Certo / Errado') {
      if (!['Certo', 'Errado', 'Anulada'].includes(item.answer)) {
        throw new Error(`${item.code}: alternativas A–E vazias ou formato C/E, mas o gabarito não é Certo, Errado ou Anulada.`);
      }
    } else {
      for (const letter of ['A', 'B', 'C', 'D', 'E']) {
        if (!item.alternatives[letter]) throw new Error(`${item.code}: alternativa ${letter} ausente.`);
      }
      if (!['A', 'B', 'C', 'D', 'E', 'Anulada'].includes(item.answer)) throw new Error(`${item.code}: gabarito A–E inválido.`);
    }
    if (item.released_for_export && !item.publication_lot) {
      throw new Error(`${item.code}: liberada para exportação sem lote de publicação.`);
    }
  }
}

const all = await readAll();
const records = all
  .filter(row => row['Pode publicar'] === true)
  .map(record)
  .sort((left, right) => left.material_name.localeCompare(right.material_name, 'pt-BR')
    || Number(left.original_number) - Number(right.original_number)
    || left.code.localeCompare(right.code));
validate(records);

const semantic = {
  schema_version: '1.1',
  source: {
    name: 'Banco Mestre — Provas e Simulados SEDES/DF',
    database_url: DATABASE_URL,
    data_source_id: SOURCE,
    publication_rule: 'Pode publicar = true; alternativas A–E vazias = Certo / Errado',
  },
  totals: {
    all: all.length,
    published: records.length,
    pending: all.length - records.length,
    materials: new Set(records.map(item => key(item.material_name))).size,
  },
  records,
};
let generatedAt = new Date().toISOString();
try {
  const previous = JSON.parse(await fs.readFile(output, 'utf8'));
  const previousSemantic = {...previous};
  delete previousSemantic.generated_at;
  if (JSON.stringify(previousSemantic) === JSON.stringify(semantic)) generatedAt = previous.generated_at || generatedAt;
} catch {}
await fs.mkdir(path.dirname(output), {recursive: true});
await fs.writeFile(output, `${JSON.stringify({...semantic, generated_at: generatedAt}, null, 2)}\n`);
console.log(`✓ Snapshot autorizado: ${records.length} questões publicáveis, ${semantic.totals.materials} materiais e ${semantic.totals.pending} registros mantidos fora do site.`);
