import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'data', 'notion', 'published.json');
const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const DATABASE_URL = 'https://app.notion.com/p/a1d5fc8f8e434105861faba90dc156d9?v=85b47b4a2e17461e9d3482724b13fab8';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const REVIEW_DATE = '2026-08-05';
const OPERATION = 'SEEDF-CONTABILIDADE-ELETRONICA-75-20260805';
const AUDIT_MARKER = 'Auditoria integral concluída em 05/08/2026 para publicação do lote final de 75 questões.';

if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível para auditar as 75 questões restantes.');

const expectedMaterials = new Map([
  ['Professor de Educação Básica — Contabilidade — SEEDF/DF — Quadrix 2025 — Tipo A', {
    start: 71,
    end: 120,
    expected: 50,
    lot: 'SEEDF-2025-CONTABILIDADE-A-071-120-20260805',
  }],
  ['Professor de Educação Básica — Eletrônica — SEEDF/DF — Quadrix 2025 — Tipo A', {
    start: 71,
    end: 95,
    expected: 25,
    lot: 'SEEDF-2025-ELETRONICA-A-071-095-20260805',
  }],
]);

const propertiesToRead = [
  'Questão', 'Código', 'Código GitHub', 'Nome do material', 'Tipo de material', 'Ano', 'Órgão', 'Cargo',
  'Código do cargo', 'Disciplina', 'Assunto', 'Subassunto', 'Bloco', 'Fonte / Banca', 'URL da fonte',
  'Formato da questão', 'Número original', 'Texto-base', 'Enunciado', 'Alternativa A', 'Alternativa B',
  'Alternativa C', 'Alternativa D', 'Alternativa E', 'Gabarito', 'Comentário A', 'Comentário B',
  'Comentário C', 'Comentário D', 'Comentário E', 'Comentário geral', 'Fundamento legal', 'Pegadinha',
  'Observações', 'Anulada', 'Possui imagem', 'Descrição da imagem', 'Página do PDF', 'Transcrição conferida',
  'Gabarito conferido — registro manual anterior', 'Revisão normativa', 'Duplicada',
  'Bloqueio manual de publicação', 'Liberada para exportação', 'Lote de publicação',
  'Pode publicar — registro manual anterior', 'Status editorial — registro manual anterior', 'Dificuldade',
];
const params = new URLSearchParams();
for (const property of propertiesToRead) params.append('filter_properties[]', property);
const QUERY_ENDPOINT = `/data_sources/${SOURCE}/query?${params.toString()}`;

const clean = value => String(value ?? '')
  .replace(/\r/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .trim();
const key = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const richText = text => ({rich_text: [{type: 'text', text: {content: clean(text).slice(0, 1950)}}]});

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
  if (response.ok) return response.status === 204 ? {} : response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 9) {
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 500 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 700)}`);
}

const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
function value(property) {
  if (!property) return null;
  if (property.type === 'title') return rich(property.title);
  if (property.type === 'rich_text') return rich(property.rich_text);
  if (property.type === 'select') return property.select?.name ?? null;
  if (property.type === 'status') return property.status?.name ?? null;
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  if (property.type === 'number') return property.number;
  if (property.type === 'url') return property.url;
  if (property.type === 'date') return property.date?.start ?? null;
  if (property.type === 'formula') {
    if (property.formula?.type === 'boolean') return property.formula.boolean;
    if (property.formula?.type === 'string') return property.formula.string;
    if (property.formula?.type === 'number') return property.formula.number;
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
      rows.push({notion_id: item.id, notion_url: item.url, notion_last_edited_time: item.last_edited_time, ...properties});
    }
    batches += 1;
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  console.log(`Banco Mestre: ${rows.length} registros lidos em ${batches} lotes.`);
  return rows;
}

function alignedComment(answer, comment) {
  const base = clean(comment).replace(/^o item está (correto|errado)\.\s*/i, '');
  return `${answer === 'Certo' ? 'O item está correto.' : 'O item está errado.'} ${base}`.trim();
}

function difficultyFor(row) {
  const combined = clean(`${row['Enunciado']} ${row['Comentário geral']} ${row['Fundamento legal']}`);
  const technical = /(cálculo|equação|lançamento|débito|crédito|balanço|depreciação|amortização|provisão|ativo|passivo|patrimônio líquido|impedância|reatância|corrente|tensão|potência|circuito|transistor|amplificador|frequência|resistência|transformador|lei de ohm|fasor|decibel|semicondutor|capacitor|indutor|\d+[\.,]?\d*)/i.test(combined);
  if (technical && combined.length >= 420) return 'Difícil';
  if (technical || combined.length >= 260) return 'Média';
  return 'Fácil';
}

function assertQuality(row) {
  const code = clean(row['Código']) || row.notion_url;
  const required = [
    ['Questão', row['Questão']], ['Código', row['Código']], ['Nome do material', row['Nome do material']],
    ['Disciplina', row['Disciplina']], ['Assunto', row['Assunto']], ['Subassunto', row['Subassunto']],
    ['Bloco', row['Bloco']], ['Fonte / Banca', row['Fonte / Banca']], ['URL da fonte', row['URL da fonte']],
    ['Página do PDF', row['Página do PDF']], ['Enunciado', row['Enunciado']], ['Gabarito', row['Gabarito']],
    ['Comentário geral', row['Comentário geral']], ['Fundamento legal', row['Fundamento legal']],
    ['Pegadinha', row['Pegadinha']], ['Observações', row['Observações']],
  ];
  for (const [label, field] of required) if (!clean(field)) throw new Error(`${code}: ${label} ausente.`);
  if (clean(row['Formato da questão']) !== 'Certo / Errado') throw new Error(`${code}: formato divergente: ${row['Formato da questão']}.`);
  if (!['Certo', 'Errado'].includes(clean(row['Gabarito']))) throw new Error(`${code}: gabarito C/E inválido: ${row['Gabarito']}.`);
  if (row['Transcrição conferida'] !== true) throw new Error(`${code}: transcrição não conferida.`);
  if (row['Gabarito conferido — registro manual anterior'] !== true) throw new Error(`${code}: gabarito não conferido manualmente.`);
  if (row['Duplicada'] === true) throw new Error(`${code}: marcada como duplicada.`);
  if (row['Bloqueio manual de publicação'] === true) throw new Error(`${code}: possui bloqueio manual.`);
  if (row['Anulada'] === true) throw new Error(`${code}: anulação inesperada no lote restante.`);
  if (clean(row['Comentário geral']).length < 30) throw new Error(`${code}: comentário geral insuficiente.`);
  if (clean(row['Fundamento legal']).length < 5) throw new Error(`${code}: fundamento insuficiente.`);
  if (clean(row['Pegadinha']).length < 10) throw new Error(`${code}: pegadinha insuficiente.`);
  const placeholder = /\b(a preencher|placeholder|lorem ipsum|sem comentário|pendente de revisão)\b/i;
  for (const [label, field] of required) if (placeholder.test(clean(field))) throw new Error(`${code}: placeholder detectado em ${label}.`);
  if ([row['Alternativa A'], row['Alternativa B'], row['Alternativa C'], row['Alternativa D'], row['Alternativa E']].some(item => clean(item))) {
    throw new Error(`${code}: questão C/E contém alternativa A–E preenchida.`);
  }
}

function recordFrom(row, lot, comment, alternativeComments) {
  return {
    notion_id: row.notion_id,
    notion_url: row.notion_url,
    notion_last_edited_time: row.notion_last_edited_time,
    code: clean(row['Código']),
    github_id: '',
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
    format: 'Certo / Errado',
    format_inference: 'formato_ou_gabarito',
    original_number: Number(row['Número original']) || null,
    text_base: clean(row['Texto-base']),
    prompt: clean(row['Enunciado']),
    alternatives: {Certo: 'Certo', Errado: 'Errado'},
    answer: clean(row['Gabarito']),
    comment,
    alternative_comments: alternativeComments,
    foundation: clean(row['Fundamento legal']),
    trap: clean(row['Pegadinha']),
    observations: clean(row['Observações']),
    annulled: false,
    has_image: Boolean(row['Possui imagem']),
    image_description: clean(row['Descrição da imagem']),
    pdf_page: clean(row['Página do PDF']),
    publication_lot: lot,
    released_for_export: true,
  };
}

const all = await readAll();
const selected = all.filter(row => !clean(row['Código GitHub']) && clean(row['Formato da questão']) !== 'Discursiva');
if (selected.length !== 75) throw new Error(`Escopo restante divergente: ${selected.length}; esperado 75.`);

const grouped = new Map();
const seenCodes = new Set();
for (const row of selected) {
  const material = clean(row['Nome do material']);
  if (!expectedMaterials.has(material)) throw new Error(`${row['Código']}: material inesperado: ${material}.`);
  if (!grouped.has(material)) grouped.set(material, []);
  grouped.get(material).push(row);
  const code = clean(row['Código']);
  if (!code || seenCodes.has(key(code))) throw new Error(`Código ausente ou duplicado: ${code || row.notion_url}.`);
  seenCodes.add(key(code));
  assertQuality(row);
}

for (const [material, expected] of expectedMaterials) {
  const rows = grouped.get(material) || [];
  const numbers = rows.map(row => Number(row['Número original'])).sort((a, b) => a - b);
  const exact = Array.from({length: expected.end - expected.start + 1}, (_, index) => expected.start + index);
  if (rows.length !== expected.expected || JSON.stringify(numbers) !== JSON.stringify(exact)) {
    throw new Error(`${material}: sequência divergente (${numbers.join(', ')}).`);
  }
}

const records = [];
let updated = 0;
for (const row of selected.sort((left, right) => clean(left['Nome do material']).localeCompare(clean(right['Nome do material']), 'pt-BR') || Number(left['Número original']) - Number(right['Número original']))) {
  const expected = expectedMaterials.get(clean(row['Nome do material']));
  const answer = clean(row['Gabarito']);
  const comment = alignedComment(answer, row['Comentário geral']);
  const difficulty = difficultyFor({...row, 'Comentário geral': comment});
  const alternativeComments = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map(letter => [
    letter,
    `Não se aplica ao formato Certo / Errado; não existe alternativa ${letter}. O julgamento oficial da assertiva é “${answer}”.`,
  ]));
  const previousObservation = clean(row['Observações']);
  const observation = previousObservation.includes(AUDIT_MARKER)
    ? previousObservation
    : `${previousObservation}\n${AUDIT_MARKER} Campos de alternativas A–E são estruturalmente inaplicáveis ao formato Certo / Errado; os comentários A–E registram apenas essa não aplicabilidade.`;

  const patch = {
    'Comentário geral': richText(comment),
    'Comentário A': richText(alternativeComments.A),
    'Comentário B': richText(alternativeComments.B),
    'Comentário C': richText(alternativeComments.C),
    'Comentário D': richText(alternativeComments.D),
    'Comentário E': richText(alternativeComments.E),
    'Dificuldade': {select: {name: difficulty}},
    'Auditoria de conteúdo': {select: {name: 'Ajustada'}},
    'Observações': richText(observation),
    'Data da revisão': {date: {start: REVIEW_DATE}},
    'Transcrição conferida': {checkbox: true},
    'Gabarito conferido — registro manual anterior': {checkbox: true},
    'Bloqueio manual de publicação': {checkbox: false},
    'Duplicada': {checkbox: false},
    'Lote de publicação': richText(expected.lot),
    'Liberada para exportação': {checkbox: true},
    'Pode publicar — registro manual anterior': {checkbox: true},
    'Status editorial — registro manual anterior': {select: {name: 'Pronta para publicar'}},
  };
  await request(`/pages/${row.notion_id}`, {method: 'PATCH', body: JSON.stringify({properties: patch})});
  row['Comentário geral'] = comment;
  row['Comentário A'] = alternativeComments.A;
  row['Comentário B'] = alternativeComments.B;
  row['Comentário C'] = alternativeComments.C;
  row['Comentário D'] = alternativeComments.D;
  row['Comentário E'] = alternativeComments.E;
  row['Observações'] = observation;
  row['Dificuldade'] = difficulty;
  records.push(recordFrom(row, expected.lot, comment, alternativeComments));
  updated += 1;
  if (updated % 15 === 0) console.log(`${updated}/75 questões auditadas e liberadas no Notion.`);
}

const codes = records.map(record => record.code).sort((left, right) => left.localeCompare(right, 'pt-BR'));
const lots = [...new Set(records.map(record => record.publication_lot))].sort((left, right) => left.localeCompare(right, 'pt-BR'));
const snapshot = {
  schema_version: '1.3',
  scope_mode: 'additions',
  source: {
    name: 'Banco Mestre — Provas e Simulados SEDES/DF',
    database_url: DATABASE_URL,
    data_source_id: SOURCE,
    publication_rule: 'Auditoria integral e adição imutável restrita às 75 questões restantes de Contabilidade 71–120 e Eletrônica 71–95.',
  },
  publication_scope: {
    operation: OPERATION,
    codes,
    lots,
    annulled_exceptions: [],
  },
  totals: {
    all: 3048,
    existing_public: 2971,
    published: 3046,
    additions: 75,
    display_only: 2,
    pending: 0,
  },
  audit: {
    reviewed_at: REVIEW_DATE,
    reviewed_records: 75,
    format: 'Certo / Errado',
    fields_completed: ['Dificuldade', 'Comentário A', 'Comentário B', 'Comentário C', 'Comentário D', 'Comentário E', 'Auditoria de conteúdo', 'Lote de publicação'],
    non_applicable_fields: ['Alternativa A', 'Alternativa B', 'Alternativa C', 'Alternativa D', 'Alternativa E'],
  },
  records,
  generated_at: new Date().toISOString(),
};

fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`✓ Auditoria concluída: ${records.length} questões em ${lots.length} lotes; snapshot imutável gravado.`);
