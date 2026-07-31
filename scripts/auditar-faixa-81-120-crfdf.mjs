const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const MATERIAL = 'Administrador — CRF-DF — Quadrix 2026';

if (!TOKEN) throw new Error('NOTION_TOKEN não disponível.');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = value => String(value ?? '').trim();
const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();

async function request(endpoint, options = {}, attempt = 1) {
  const response = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
  });
  if (response.ok) return response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 9) {
    await sleep(500 * 2 ** (attempt - 1));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 600)}`);
}

function value(property) {
  if (!property) return null;
  if (property.type === 'title') return rich(property.title);
  if (property.type === 'rich_text') return rich(property.rich_text);
  if (property.type === 'select') return property.select?.name ?? null;
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  if (property.type === 'number') return property.number;
  if (property.type === 'date') return property.date?.start ?? null;
  return null;
}

const rows = [];
let cursor;
do {
  const body = {page_size: 100};
  if (cursor) body.start_cursor = cursor;
  const page = await request(`/data_sources/${SOURCE}/query`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  for (const item of page.results || []) {
    const row = Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)]));
    if (clean(row['Nome do material']) !== MATERIAL || row['Duplicada'] === true) continue;
    const number = Number(row['Número original']);
    if (number < 81 || number > 120) continue;
    rows.push({
      numero: number,
      codigo: row['Código'],
      texto_base: row['Texto-base'],
      enunciado: row['Enunciado'],
      gabarito: row['Gabarito'],
      disciplina: row['Disciplina'],
      assunto: row['Assunto'],
      subassunto: row['Subassunto'],
      comentario: row['Comentário geral'],
      fundamento: row['Fundamento legal'],
      pegadinha: row['Pegadinha'],
      observacoes: row['Observações'],
      auditoria: row['Auditoria de conteúdo'],
      bloqueio: row['Bloqueio manual de publicação'],
      codigo_github: row['Código GitHub'],
      data_publicacao: row['Data da publicação'],
    });
  }
  cursor = page.has_more ? page.next_cursor : null;
} while (cursor);

rows.sort((a, b) => a.numero - b.numero);
if (rows.length !== 40) throw new Error(`Faixa incompleta: ${rows.length}/40.`);
for (const row of rows) console.log(`AUDIT_ROW=${JSON.stringify(row)}`);
console.log('AUDIT_SUMMARY=' + JSON.stringify({total: rows.length, inicio: rows[0].numero, fim: rows.at(-1).numero}));
