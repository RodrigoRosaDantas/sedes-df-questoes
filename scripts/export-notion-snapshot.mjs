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
const EXPORT_PROPERTIES = [
  'Alternativa A', 'Alternativa B', 'Alternativa C', 'Alternativa D', 'Alternativa E',
  'Ano', 'Anulada', 'Assunto', 'Bloco', 'Cargo',
  'Comentário A', 'Comentário B', 'Comentário C', 'Comentário D', 'Comentário E',
  'Comentário geral', 'Código', 'Código GitHub', 'Código do cargo', 'Descrição da imagem',
  'Disciplina', 'Duplicada', 'Enunciado', 'Fonte / Banca', 'Formato da questão',
  'Fundamento legal', 'Gabarito', 'Liberada para exportação', 'Lote de publicação',
  'Nome do material', 'Número original', 'Observações', 'Órgão', 'Página do PDF',
  'Pegadinha', 'Pode publicar', 'Possui imagem', 'Questão', 'Subassunto',
  'Texto-base', 'Tipo de material', 'Transcrição conferida', 'URL da fonte',
];
const queryParameters = new URLSearchParams();
for (const property of EXPORT_PROPERTIES) queryParameters.append('filter_properties[]', property);
const QUERY_ENDPOINT = `/data_sources/${SOURCE}/query?${queryParameters.toString()}`;
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
    const body = {page_size: 100, result_type: 'page'};
    if (cursor) body.start_cursor = cursor;
    const page = await request(QUERY_ENDPOINT, {method: 'POST', body: JSON.stringify(body)});
    for (const item of page.results || []) {
      const properties = Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)]));
      rows.push({
        notion_id: item.id,
        notion_url: item.url,
        notion_created_time: item.created_time || properties['Criado em'] || null,
        notion_last_edited_time: item.last_edited_time || properties['Última edição'] || null,
        ...properties,
      });
    }
    batches += 1;
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  console.log(`Banco Mestre: ${rows.length} registros lidos em ${batches} lotes com ${EXPORT_PROPERTIES.length} propriedades selecionadas.`);
  return rows;
}

function completenessScore(row) {
  const textFields = [
    'Texto-base', 'Enunciado', 'Comentário geral', 'Fundamento legal', 'Pegadinha',
    'Observações', 'Assunto', 'Subassunto', 'Disciplina', 'URL da fonte',
  ];
  const textScore = textFields.reduce((score, field) => score + Math.min(clean(row[field]).length, 1000), 0);
  const checks = ['Transcrição conferida', 'Gabarito conferido - registro manual anterior']
    .reduce((score, field) => score + (row[field] === true ? 5000 : 0), 0);
  return textScore + checks;
}

function canonicalPreference(row) {
  return {
    explicitlyDuplicate: row['Duplicada'] === true ? 1 : 0,
    editedAt: Date.parse(row.notion_last_edited_time || row['Última edição'] || row.notion_created_time || 0) || 0,
    completeness: completenessScore(row),
    id: clean(row.notion_id),
  };
}

function preferCanonical(left, right) {
  const a = canonicalPreference(left);
  const b = canonicalPreference(right);
  if (a.explicitlyDuplicate !== b.explicitlyDuplicate) return a.explicitlyDuplicate < b.explicitlyDuplicate ? left : right;
  if (a.editedAt !== b.editedAt) return a.editedAt > b.editedAt ? left : right;
  if (a.completeness !== b.completeness) return a.completeness > b.completeness ? left : right;
  return a.id.localeCompare(b.id) >= 0 ? left : right;
}

function deduplicatePublicableRows(rows) {
  const canonical = new Map();
  const duplicates = [];
  for (const row of rows) {
    const codeKey = key(row['Código']) || `sem-codigo:${row.notion_id}`;
    const current = canonical.get(codeKey);
    if (!current) {
      canonical.set(codeKey, row);
      continue;
    }
    const selected = preferCanonical(current, row);
    const ignored = selected === current ? row : current;
    canonical.set(codeKey, selected);
    duplicates.push({code: clean(row['Código']), selected: selected.notion_url, ignored: ignored.notion_url});
  }
  if (duplicates.length) {
    console.log(`Duplicidades publicáveis saneadas: ${duplicates.length} linha(s) ignorada(s); nenhuma página foi apagada do Notion.`);
    duplicates.slice(0, 10).forEach(item => console.log(`  ${item.code}: canônica ${item.selected}; ignorada ${item.ignored}`));
  }
  return {rows: [...canonical.values()], duplicates};
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
    notion_last_edited_time: row.notion_last_edited_time,
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
    if (codes.has(key(item.code))) throw new Error(`Código canônico duplicado após saneamento: ${item.code}`);
    codes.add(key(item.code));
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
const publicable = all.filter(row => row['Pode publicar'] === true);
const canonical = deduplicatePublicableRows(publicable);
const records = canonical.rows
  .map(record)
  .sort((left, right) => left.material_name.localeCompare(right.material_name, 'pt-BR')
    || Number(left.original_number) - Number(right.original_number)
    || left.code.localeCompare(right.code));
validate(records);

const semantic = {
  schema_version: '1.2',
  source: {
    name: 'Banco Mestre — Provas e Simulados SEDES/DF',
    database_url: DATABASE_URL,
    data_source_id: SOURCE,
    publication_rule: 'Pode publicar = true; alternativas A–E vazias = Certo / Errado; códigos repetidos usam a linha não duplicada, mais recente e mais completa',
  },
  totals: {
    all: all.length,
    publicable_rows_before_deduplication: publicable.length,
    duplicate_publicable_rows_ignored: canonical.duplicates.length,
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
console.log(`✓ Snapshot autorizado: ${records.length} questões canônicas, ${semantic.totals.materials} materiais, ${canonical.duplicates.length} duplicidade(s) ignorada(s) e ${semantic.totals.pending} registros mantidos fora do site.`);
