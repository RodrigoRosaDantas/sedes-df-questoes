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
const EXCEPTION_LOT = 'EXCECAO-PUBLICACAO-INTEGRAL-2026-08-01';
if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível neste repositório.');

const clean = value => String(value ?? '')
  .replace(/\r/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .trim();
const key = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const stableId = value => clean(value).replace(/-/g, '') || Math.random().toString(16).slice(2);
const shortId = value => stableId(value).slice(-16);

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
  if ((response.status === 429 || response.status >= 500) && attempt < 9) {
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
  console.log(`Banco Mestre: ${rows.length} registros lidos em ${batches} lotes.`);
  return rows;
}

function uniqueCodes(rows) {
  const used = new Set();
  return rows.map(row => {
    const raw = clean(row['Código']);
    const fallback = `NOTION-${shortId(row.notion_id)}`;
    let candidate = raw || fallback;
    if (used.has(key(candidate))) candidate = `${candidate.slice(0, 90)}--${shortId(row.notion_id)}`;
    while (used.has(key(candidate))) candidate = `${candidate}-${Math.random().toString(16).slice(2, 6)}`;
    used.add(key(candidate));
    return {...row, __publication_code: candidate};
  });
}

function record(row) {
  const code = row.__publication_code;
  const declaredFormat = clean(row['Formato da questão']);
  const rawAnswer = clean(row['Gabarito']);
  const sourceAlternatives = {
    A: clean(row['Alternativa A']),
    B: clean(row['Alternativa B']),
    C: clean(row['Alternativa C']),
    D: clean(row['Alternativa D']),
    E: clean(row['Alternativa E']),
  };
  const alternativesAreBlank = Object.values(sourceAlternatives).every(alternative => !alternative);
  const trueFalse = alternativesAreBlank
    || /certo\s*\/\s*errado/i.test(declaredFormat)
    || ['Certo', 'Errado'].includes(rawAnswer);
  const validAnswer = trueFalse
    ? ['Certo', 'Errado', 'Anulada'].includes(rawAnswer)
    : ['A', 'B', 'C', 'D', 'E', 'Anulada'].includes(rawAnswer);
  const answer = validAnswer ? rawAnswer : 'Anulada';
  const alternatives = trueFalse
    ? {Certo: 'Certo', Errado: 'Errado'}
    : Object.fromEntries(Object.entries(sourceAlternatives).map(([letter, text]) => [
      letter,
      text || `[Alternativa ${letter} não cadastrada no Banco Mestre]`,
    ]));

  const notices = [];
  if (!clean(row['Código'])) notices.push('Código editorial ausente; foi criado identificador técnico a partir do ID do Notion.');
  if (code !== clean(row['Código']) && clean(row['Código'])) notices.push('Código editorial repetido; foi acrescentado sufixo técnico para preservar todas as linhas.');
  if (!clean(row['Enunciado'])) notices.push('Enunciado ausente; foi usada a melhor descrição disponível sem criar conteúdo substantivo.');
  if (!validAnswer) notices.push('Gabarito ausente ou incompatível; a questão foi publicada como anulada para não inventar resposta correta.');
  if (!trueFalse && Object.values(sourceAlternatives).some(alternative => !alternative)) notices.push('Uma ou mais alternativas não estavam cadastradas e foram sinalizadas literalmente.');
  if (!clean(row['Comentário geral'])) notices.push('Comentário editorial não cadastrado.');
  if (Boolean(row['Possui imagem'])) notices.push('Imagem indicada no Banco Mestre sem arquivo público disponível; questão publicada sem recurso visual.');

  const prompt = clean(row['Enunciado'])
    || clean(row['Texto-base'])
    || clean(row['Questão'])
    || '[Sem enunciado cadastrado no Banco Mestre]';
  const observations = [clean(row['Observações']), ...notices].filter(Boolean).join('\n');

  return {
    notion_id: row.notion_id,
    notion_url: row.notion_url,
    notion_last_edited_time: row.notion_last_edited_time,
    code,
    original_code: clean(row['Código']),
    github_id: `notion-${stableId(row.notion_id)}`,
    title: clean(row['Questão']) || code,
    material_name: clean(row['Nome do material']) || 'Banco Mestre — material não identificado',
    material_type: clean(row['Tipo de material']) || 'Simulado',
    year: Number(row['Ano']) || null,
    organization: clean(row['Órgão']),
    cargo: clean(row['Cargo']),
    cargo_code: clean(row['Código do cargo']),
    discipline: clean(row['Disciplina']) || 'Não classificada',
    subject: clean(row['Assunto']) || 'Não classificado',
    subsubject: clean(row['Subassunto']),
    block: clean(row['Bloco']),
    source_board: clean(row['Fonte / Banca']) || 'Banco Mestre do Notion',
    source_url: clean(row['URL da fonte']),
    format: trueFalse ? 'Certo / Errado' : declaredFormat || 'Múltipla escolha A–E',
    format_inference: alternativesAreBlank ? 'alternativas_A_E_vazias' : 'formato_ou_gabarito',
    original_number: Number(row['Número original']) || null,
    text_base: clean(row['Texto-base']),
    prompt,
    alternatives,
    answer,
    comment: clean(row['Comentário geral']) || 'Sem comentário cadastrado no Banco Mestre.',
    alternative_comments: {
      A: clean(row['Comentário A']),
      B: clean(row['Comentário B']),
      C: clean(row['Comentário C']),
      D: clean(row['Comentário D']),
      E: clean(row['Comentário E']),
    },
    foundation: clean(row['Fundamento legal']),
    trap: clean(row['Pegadinha']),
    observations,
    annulled: Boolean(row['Anulada']) || !validAnswer,
    has_image: false,
    image_description: clean(row['Descrição da imagem']),
    pdf_page: clean(row['Página do PDF']),
    publication_lot: clean(row['Lote de publicação']) || EXCEPTION_LOT,
    released_for_export: true,
    publication_exception: 'Ordem expressa do proprietário em 01/08/2026 para publicação integral sem filtro editorial.',
  };
}

function validate(records) {
  const codes = new Set();
  const urls = new Set();
  for (const item of records) {
    for (const [propertyValue, label] of [
      [item.code, 'Código'],
      [item.title, 'Questão'],
      [item.material_name, 'Nome do material'],
      [item.prompt, 'Enunciado'],
      [item.answer, 'Gabarito'],
      [item.comment, 'Comentário geral'],
      [item.github_id, 'Identificador técnico'],
    ]) {
      if (!propertyValue) throw new Error(`${label} ausente em ${item.notion_url}.`);
    }
    if (codes.has(key(item.code))) throw new Error(`Código técnico duplicado: ${item.code}`);
    codes.add(key(item.code));
    if (urls.has(item.notion_url)) throw new Error(`URL do Notion duplicada: ${item.notion_url}`);
    urls.add(item.notion_url);
    if (item.format === 'Certo / Errado') {
      if (!['Certo', 'Errado', 'Anulada'].includes(item.answer)) throw new Error(`${item.code}: gabarito C/E inválido.`);
    } else {
      for (const letter of ['A', 'B', 'C', 'D', 'E']) {
        if (!item.alternatives[letter]) throw new Error(`${item.code}: alternativa ${letter} ausente após neutralização.`);
      }
      if (!['A', 'B', 'C', 'D', 'E', 'Anulada'].includes(item.answer)) throw new Error(`${item.code}: gabarito A–E inválido.`);
    }
  }
}

const all = await readAll();
const records = uniqueCodes(all)
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
    publication_rule: 'Exceção expressa de 01/08/2026: publicação integral de todas as linhas; lacunas estruturais são sinalizadas, gabaritos inválidos são neutralizados como anulados e códigos repetidos recebem sufixo técnico.',
  },
  totals: {
    all: all.length,
    publicable_rows_before_deduplication: records.length,
    duplicate_publicable_rows_ignored: 0,
    published: records.length,
    pending: 0,
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
console.log(`✓ Exceção integral preparada: ${records.length} questões, ${semantic.totals.materials} materiais e nenhum registro mantido fora do site.`);
