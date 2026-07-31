const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const MATERIAL = 'Administrador — CRF-DF — Quadrix 2026';
const PREFIX = 'PROVA-QDX-CRFDF-2026-ADMINISTRADOR-400-';
const PUBLICATION_DATE = '2026-07-30';
const PUBLIC_BASE = 'https://rodrigorosadantas.github.io/sedes-df-questoes/';

if (!TOKEN) throw new Error('NOTION_TOKEN não disponível.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = value => String(value ?? '').trim();
const richText = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
const expectedLetters = [
  'C','E','C','E','C','C','C','E','C','C','C','E','E','E','C','E','E','C','E','C',
  'E','E','C','C','C','C','E','C','E','E','E','C','E','C','C','E','E','C','E','C',
  'C','C','E','E','C','C','E','E','C','E','C','C','E','E','C','C','E','C','E','C',
  'C','C','E','E','C','E','C','C','E','E','C','E','E','E','E','C','C','C','E','E',
  'E','C','E','C','E','E','C','C','C','C','E','E','E','E','C','C','C','C','E','E',
  'E','C','E','C','E','E','C','C','C','E','E','C','E','C','C','E','E','E','C','C',
];
const expectedAnswers = expectedLetters.map(letter => letter === 'C' ? 'Certo' : 'Errado');

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

function value(property) {
  if (!property) return null;
  if (property.type === 'title') return richText(property.title);
  if (property.type === 'rich_text') return richText(property.rich_text);
  if (property.type === 'select') return property.select?.name ?? null;
  if (property.type === 'status') return property.status?.name ?? null;
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  if (property.type === 'number') return property.number;
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
  do {
    const body = {page_size: 100};
    if (cursor) body.start_cursor = cursor;
    const page = await request(`/data_sources/${SOURCE}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    for (const item of page.results || []) {
      rows.push({
        notion_id: item.id,
        property_types: Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, property.type])),
        ...Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)])),
      });
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

async function readPublicCodes() {
  const catalogUrl = new URL('data/release/catalogo.json', PUBLIC_BASE);
  const response = await fetch(catalogUrl, {headers: {'cache-control': 'no-cache'}});
  if (!response.ok) throw new Error(`Catálogo público indisponível: HTTP ${response.status}.`);
  const catalog = await response.json();
  const codes = new Set();
  for (const metadata of catalog.materials || []) {
    const materialUrl = new URL(String(metadata.file || '').replace(/^\.\//, ''), PUBLIC_BASE);
    const materialResponse = await fetch(materialUrl, {headers: {'cache-control': 'no-cache'}});
    if (!materialResponse.ok) throw new Error(`${metadata.id}: material público indisponível, HTTP ${materialResponse.status}.`);
    const material = await materialResponse.json();
    for (const question of material.questoes || []) {
      if (question.codigo) codes.add(clean(question.codigo));
      if (question.codigo_fonte) codes.add(clean(question.codigo_fonte));
    }
  }
  return {catalog, codes};
}

function failList(label, values) {
  if (values.length) throw new Error(`${label}: ${values.join(', ')}`);
}

const allRows = await readAll();
const rows = allRows
  .filter(row => clean(row['Nome do material']) === MATERIAL && row['Duplicada'] !== true)
  .sort((a, b) => Number(a['Número original']) - Number(b['Número original']));

if (rows.length !== 120) throw new Error(`Material incompleto: ${rows.length}/120 registros canônicos.`);
const numbers = rows.map(row => Number(row['Número original']));
failList('Numeração divergente', numbers.filter((number, index) => number !== index + 1));
const codes = rows.map((row, index) => clean(row['Código']) === `${PREFIX}${String(index + 1).padStart(3, '0')}`);
if (codes.some(ok => !ok)) throw new Error('Há código editorial fora do padrão 1–120.');

failList('Transcrição não conferida', rows.filter(row => row['Transcrição conferida'] !== true).map(row => row['Código']));
failList('Gabarito não conferido', rows.filter(row => row['Gabarito conferido — registro manual anterior'] !== true).map(row => row['Código']));
failList('Gabarito divergente do definitivo', rows.filter((row, index) => clean(row['Gabarito']) !== expectedAnswers[index]).map(row => `${row['Número original']}=${row['Gabarito']}`));
failList('Duplicidade indevida', rows.filter(row => row['Duplicada'] === true).map(row => row['Código']));
failList('Anulação inesperada', rows.filter(row => row['Anulada'] === true).map(row => row['Código']));
failList('Imagem inesperada', rows.filter(row => row['Possui imagem'] === true).map(row => row['Código']));
failList('Comentário ausente', rows.filter(row => !clean(row['Comentário geral'])).map(row => row['Código']));
failList('Metadado essencial ausente', rows.filter(row => !clean(row['Fonte / Banca']) || !clean(row['Cargo']) || !clean(row['Disciplina']) || !Number(row['Ano']) || !clean(row['Órgão']) || !clean(row['Bloco']) || !clean(row['Assunto']) || !clean(row['Formato da questão']) || !clean(row['Página do PDF']) || !clean(row['Enunciado'])).map(row => row['Código']));

const blocked = rows.filter(row => row['Bloqueio manual de publicação'] === true).map(row => Number(row['Número original']));
if (JSON.stringify(blocked) !== JSON.stringify([4, 8])) throw new Error(`Bloqueios divergentes: ${blocked.join(', ') || 'nenhum'}.`);
for (const number of [4, 8]) {
  const row = rows[number - 1];
  if (clean(row['Auditoria de conteúdo']) !== 'Não aprovada' || clean(row['Status editorial — registro manual anterior']) !== 'Bloqueada' || row['Liberada para exportação'] === true || clean(row['Lote de publicação'])) {
    throw new Error(`Item ${number}: bloqueio editorial não está integralmente preservado.`);
  }
}

const unpublished = rows.slice(0, 8);
failList('Itens 1–8 com recibo indevido', unpublished.filter(row => clean(row['Código GitHub'])).map(row => row['Código']));
failList('Itens 1–8 com data indevida', unpublished.filter(row => clean(row['Data da publicação'])).map(row => row['Código']));
failList('Itens 1–8 liberados indevidamente', unpublished.filter(row => row['Liberada para exportação'] === true || clean(row['Lote de publicação'])).map(row => row['Código']));

const published = rows.slice(8);
if (published.length !== 112) throw new Error(`Recorte publicado divergente: ${published.length}/112.`);
failList('Itens 9–120 sem Código GitHub', published.filter(row => !clean(row['Código GitHub'])).map(row => row['Código']));
failList('Código GitHub legado divergente', published.filter(row => clean(row['Código GitHub']) !== clean(row['Código'])).map(row => row['Código']));

const {catalog, codes: publicCodes} = await readPublicCodes();
failList('Itens 9–120 ausentes do site público', published.filter(row => !publicCodes.has(clean(row['Código']))).map(row => row['Código']));
failList('Itens 1–8 presentes indevidamente no site público', unpublished.filter(row => publicCodes.has(clean(row['Código']))).map(row => row['Código']));

let updated = 0;
for (const row of published) {
  const observations = clean(row['Observações']);
  const marker = observations.search(/\s*RASTREABILIDADE PENDENTE:/i);
  const cleanedObservations = marker >= 0 ? observations.slice(0, marker).trim() : observations;
  const patch = {};
  if (clean(row['Data da publicação']) !== PUBLICATION_DATE) {
    patch['Data da publicação'] = {date: {start: PUBLICATION_DATE}};
  }
  if (row.property_types['Status editorial — registro manual anterior'] === 'select' && clean(row['Status editorial — registro manual anterior']) !== 'Publicada') {
    patch['Status editorial — registro manual anterior'] = {select: {name: 'Publicada'}};
  }
  if (cleanedObservations !== observations) {
    patch['Observações'] = {rich_text: cleanedObservations ? [{type: 'text', text: {content: cleanedObservations}}] : []};
  }
  if (!Object.keys(patch).length) continue;
  await request(`/pages/${row.notion_id}`, {
    method: 'PATCH',
    body: JSON.stringify({properties: patch}),
  });
  updated += 1;
  if (updated % 20 === 0) console.log(`${updated}/112 registros reconciliados.`);
}

await sleep(3000);
const verifiedRows = (await readAll())
  .filter(row => clean(row['Nome do material']) === MATERIAL && row['Duplicada'] !== true)
  .sort((a, b) => Number(a['Número original']) - Number(b['Número original']));
const verifiedPublished = verifiedRows.slice(8);
failList('Data ainda divergente', verifiedPublished.filter(row => clean(row['Data da publicação']) !== PUBLICATION_DATE).map(row => row['Código']));
failList('Status ainda divergente', verifiedPublished.filter(row => clean(row['Status editorial — registro manual anterior']) !== 'Publicada').map(row => row['Código']));
failList('Aviso obsoleto ainda presente', verifiedPublished.filter(row => /RASTREABILIDADE PENDENTE:/i.test(clean(row['Observações']))).map(row => row['Código']));
failList('Itens 1–8 alterados indevidamente', verifiedRows.slice(0, 8).filter(row => clean(row['Data da publicação']) || clean(row['Código GitHub']) || row['Liberada para exportação'] === true || clean(row['Lote de publicação'])).map(row => row['Código']));

console.log(JSON.stringify({
  material: MATERIAL,
  total: verifiedRows.length,
  gabaritos_oficiais_conferidos: 120,
  publicados_reconciliados: verifiedPublished.length,
  registros_alterados: updated,
  data_publicacao: PUBLICATION_DATE,
  nao_publicados_preservados: verifiedRows.slice(0, 8).map(row => row['Número original']),
  bloqueados_preservados: [4, 8],
  candidatos_preservados: [1, 2, 3, 5, 6, 7],
  catalogo_publico: {
    versao: catalog.release_version ?? null,
    questoes: catalog.summary?.questoes ?? null,
    materiais: catalog.summary?.materiais ?? null,
  },
  liberacoes_criadas: 0,
  lotes_criados: 0,
}, null, 2));
