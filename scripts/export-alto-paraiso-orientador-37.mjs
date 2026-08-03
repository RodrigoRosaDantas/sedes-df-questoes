import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPublicationPlan} from './publication-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(root, 'data', 'notion', 'publication-additions', 'alto-paraiso-orientador-37.json');
const planPath = path.join(root, 'data', 'notion', 'publication-additions', 'alto-paraiso-orientador-37-plan.json');
const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const MATERIAL = 'Orientador Social — Prefeitura de Alto Paraíso de Goiás/GO — Quadrix 2023';
const LOT = 'QDX-ALTOPARAISO-GO-2023-ORIENTADOR-SOCIAL-202-001-040-20260803';
const EXCLUDED = new Set([9, 12, 19]);
const IMAGES = new Set([6, 7, 8, 17, 18, 20, 25]);
if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível.');

const properties = [
  'Alternativa A', 'Alternativa B', 'Alternativa C', 'Alternativa D', 'Alternativa E',
  'Ano', 'Anulada', 'Arquivo da fonte', 'Assunto', 'Auditoria de conteúdo', 'Bloco',
  'Bloqueio manual de publicação', 'Cargo', 'Comentário A', 'Comentário B', 'Comentário C',
  'Comentário D', 'Comentário E', 'Comentário geral', 'Código', 'Código GitHub',
  'Código do cargo', 'Descrição da imagem', 'Disciplina', 'Duplicada', 'Enunciado',
  'Fonte / Banca', 'Formato da questão', 'Fundamento legal', 'Gabarito',
  'Gabarito conferido — registro manual anterior', 'Imagem da questão',
  'Liberada para exportação', 'Lote de publicação', 'Nome do material', 'Número original',
  'Observações', 'Órgão', 'Página do PDF', 'Pegadinha', 'Possui imagem', 'Questão',
  'Subassunto', 'Texto-base', 'Tipo de material', 'Transcrição conferida', 'URL da fonte',
];
const params = new URLSearchParams();
for (const property of properties) params.append('filter_properties[]', property);
const endpoint = `/data_sources/${SOURCE}/query?${params.toString()}`;
const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(body, attempt = 1) {
  const response = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (response.ok) return response.json();
  const text = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 7) {
    await sleep(500 * 2 ** (attempt - 1));
    return request(body, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${text.slice(0, 600)}`);
}

const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
function value(property) {
  if (!property) return null;
  if (property.type === 'title') return rich(property.title);
  if (property.type === 'rich_text') return rich(property.rich_text);
  if (property.type === 'select') return property.select?.name ?? null;
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  if (property.type === 'number') return property.number;
  if (property.type === 'url') return property.url;
  if (property.type === 'files') return (property.files || []).map(file => ({
    name: file.name || '',
    type: file.type || '',
    url: file.file?.url || file.external?.url || '',
  }));
  if (property.type === 'formula') {
    const formula = property.formula;
    if (formula?.type === 'boolean') return formula.boolean;
    if (formula?.type === 'string') return formula.string;
    if (formula?.type === 'number') return formula.number;
  }
  return null;
}

const rows = [];
let cursor;
do {
  const body = {
    page_size: 100,
    result_type: 'page',
    filter: {property: 'Nome do material', rich_text: {equals: MATERIAL}},
  };
  if (cursor) body.start_cursor = cursor;
  const page = await request(body);
  for (const item of page.results || []) {
    const row = Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)]));
    rows.push({
      notion_id: item.id,
      notion_url: item.url,
      notion_last_edited_time: item.last_edited_time,
      ...row,
    });
  }
  cursor = page.has_more ? page.next_cursor : null;
} while (cursor);

if (rows.length !== 40) throw new Error(`Material retornou ${rows.length} registros; esperado 40.`);
rows.sort((a, b) => Number(a['Número original']) - Number(b['Número original']));
for (let index = 0; index < 40; index += 1) {
  if (Number(rows[index]['Número original']) !== index + 1) throw new Error('Numeração da prova não é contínua de 1 a 40.');
}

const records = [];
for (const row of rows) {
  const number = Number(row['Número original']);
  const sourceFiles = Array.isArray(row['Arquivo da fonte']) ? row['Arquivo da fonte'] : [];
  if (!sourceFiles.length) throw new Error(`${row['Código']}: Arquivo da fonte ausente.`);
  if (EXCLUDED.has(number)) {
    if (row['Anulada'] !== true || clean(row['Gabarito']) !== 'Anulada') throw new Error(`${row['Código']}: anulação oficial não preservada.`);
    if (row['Liberada para exportação'] === true || clean(row['Lote de publicação']) || clean(row['Código GitHub'])) {
      throw new Error(`${row['Código']}: questão anulada recebeu liberação ou rastreabilidade indevida.`);
    }
    continue;
  }

  const expectedImage = IMAGES.has(number);
  const imageFiles = Array.isArray(row['Imagem da questão']) ? row['Imagem da questão'] : [];
  for (const [condition, message] of [
    [row['Anulada'] !== true, 'marcada como anulada'],
    [row['Duplicada'] !== true, 'marcada como duplicada'],
    [row['Transcrição conferida'] === true, 'transcrição não conferida'],
    [row['Gabarito conferido — registro manual anterior'] === true, 'gabarito não conferido'],
    [clean(row['Auditoria de conteúdo']) === 'Aprovada', 'auditoria não aprovada'],
    [row['Bloqueio manual de publicação'] !== true, 'bloqueio manual ativo'],
    [row['Liberada para exportação'] === true, 'não liberada para exportação'],
    [clean(row['Lote de publicação']) === LOT, 'lote divergente'],
    [!clean(row['Código GitHub']), 'Código GitHub já preenchido'],
    [Boolean(row['Possui imagem']) === expectedImage, 'marcação Possui imagem divergente'],
    [!expectedImage || imageFiles.length > 0, 'arquivo de imagem ausente'],
    [!expectedImage || Boolean(clean(row['Descrição da imagem'])), 'descrição da imagem ausente'],
  ]) if (!condition) throw new Error(`${row['Código']}: ${message}.`);

  const alternatives = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map(letter => [letter, clean(row[`Alternativa ${letter}`])]));
  for (const [letter, alternative] of Object.entries(alternatives)) if (!alternative) throw new Error(`${row['Código']}: alternativa ${letter} ausente.`);
  if (!['A', 'B', 'C', 'D', 'E'].includes(clean(row['Gabarito']))) throw new Error(`${row['Código']}: gabarito inválido.`);
  for (const [field, label] of [
    ['Código', 'Código'], ['Questão', 'Questão'], ['Enunciado', 'Enunciado'],
    ['Comentário geral', 'Comentário geral'], ['Fundamento legal', 'Fundamento legal'],
    ['Página do PDF', 'Página do PDF'],
  ]) if (!clean(row[field])) throw new Error(`${row['Código']}: ${label} ausente.`);

  records.push({
    notion_id: row.notion_id,
    notion_url: row.notion_url,
    notion_last_edited_time: row.notion_last_edited_time,
    code: clean(row['Código']),
    github_id: '',
    title: clean(row['Questão']),
    material_name: clean(row['Nome do material']),
    material_type: clean(row['Tipo de material']),
    year: Number(row['Ano']) || 2023,
    organization: clean(row['Órgão']),
    cargo: clean(row['Cargo']),
    cargo_code: clean(row['Código do cargo']),
    discipline: clean(row['Disciplina']),
    subject: clean(row['Assunto']),
    subsubject: clean(row['Subassunto']),
    block: clean(row['Bloco']),
    source_board: clean(row['Fonte / Banca']),
    source_url: clean(row['URL da fonte']),
    format: clean(row['Formato da questão']),
    format_inference: 'formato_ou_gabarito',
    original_number: number,
    text_base: clean(row['Texto-base']),
    prompt: clean(row['Enunciado']),
    alternatives,
    answer: clean(row['Gabarito']),
    comment: clean(row['Comentário geral']),
    alternative_comments: Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map(letter => [letter, clean(row[`Comentário ${letter}`])])),
    foundation: clean(row['Fundamento legal']),
    trap: clean(row['Pegadinha']),
    observations: clean(row['Observações']),
    annulled: false,
    has_image: expectedImage,
    image_description: clean(row['Descrição da imagem']),
    pdf_page: clean(row['Página do PDF']),
    publication_lot: LOT,
    released_for_export: true,
  });
}
if (records.length !== 37) throw new Error(`Foram preparados ${records.length} registros; esperado 37.`);

const snapshot = {
  schema_version: '1.2',
  source: {
    name: 'Banco Mestre — Provas e Simulados SEDES/DF',
    database_url: 'https://app.notion.com/p/a1d5fc8f8e434105861faba90dc156d9',
    data_source_id: SOURCE,
    publication_rule: 'Lote explicitamente autorizado; 37 questões válidas, com arquivos e imagens tratados; questões 9, 12 e 19 excluídas por anulação oficial',
  },
  totals: {
    all: 40,
    publicable_rows_before_deduplication: 37,
    duplicate_publicable_rows_ignored: 0,
    published: 37,
    pending: 3,
    materials: 1,
  },
  records,
  generated_at: new Date().toISOString(),
};
const snapshotText = `${JSON.stringify(snapshot, null, 2)}\n`;
const plan = buildPublicationPlan(snapshotText);
await fs.mkdir(path.dirname(snapshotPath), {recursive: true});
await fs.writeFile(snapshotPath, snapshotText);
await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(`✓ Snapshot imutável preparado: ${records.length} questões válidas, sete com imagem e três anuladas excluídas.`);
