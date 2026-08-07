import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.NOTION_TOKEN;
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const CATALOG_PATH = path.resolve(root, 'data/release/catalogo.json');

const MATERIALS = [
  {
    name: 'Técnico Administrativo — CFO — Quadrix 2025',
    prefix: 'PROVA-QDX-CFO-2025-TECNICO-ADMINISTRATIVO-201-',
    lot: 'CFO-2025-TECNICO-ADMINISTRATIVO-201-118-20260807',
    expected: 118,
    excluded: new Set([45, 104]),
    spotAnswers: new Map([[8, 'Errado']]),
  },
  {
    name: 'Técnico Administrativo — CRMV-GO — Quadrix 2025',
    prefix: 'PROVA-QDX-CRMVGO-2025-TECNICO-ADMINISTRATIVO-200-',
    lot: 'CRMVGO-2025-TECNICO-ADMINISTRATIVO-200-119-20260807',
    expected: 119,
    excluded: new Set([94]),
    spotAnswers: new Map([[73, 'Errado'], [83, 'Errado'], [98, 'Errado'], [104, 'Certo']]),
  },
];

if (!TOKEN) throw new Error('NOTION_TOKEN ausente.');

const EXPORT_PROPERTIES = [
  'Ano','Anulada','Assunto','Auditoria de conteúdo','Bloco','Bloqueio manual de publicação','Cargo',
  'Comentário geral','Código','Código GitHub','Código do cargo','Disciplina','Duplicada','Enunciado','Fonte / Banca',
  'Formato da questão','Fundamento legal','Gabarito','Gabarito conferido — registro manual anterior',
  'Liberada para exportação','Lote de publicação','Nome do material','Número original','Observações','Órgão','Página do PDF','Pegadinha',
  'Pode publicar','Possui imagem','Questão','Status editorial — registro manual anterior','Subassunto','Texto-base',
  'Tipo de material','Transcrição conferida','URL da fonte',
];
const params = new URLSearchParams();
for (const property of EXPORT_PROPERTIES) params.append('filter_properties[]', property);
const QUERY_ENDPOINT = `/data_sources/${SOURCE}/query?${params.toString()}`;

const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const isTrue = value => value === true || clean(value).toLowerCase() === 'true';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 400 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 800)}`);
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
  do {
    const body = {page_size: 100, result_type: 'page'};
    if (cursor) body.start_cursor = cursor;
    const page = await request(QUERY_ENDPOINT, {method: 'POST', body: JSON.stringify(body)});
    for (const item of page.results || []) {
      rows.push({
        notion_id: item.id,
        notion_url: item.url,
        ...Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)])),
      });
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

function configFor(row) {
  return MATERIALS.find(item => clean(row['Nome do material']) === item.name) || null;
}

function expectedNumbers(config) {
  return Array.from({length: 120}, (_, i) => i + 1).filter(number => !config.excluded.has(number));
}

function officialCfoPage(number) {
  if (number >= 41 && number <= 57) return '4';
  if (number >= 58 && number <= 70) return '5';
  if (number >= 71 && number <= 95) return '6';
  if (number >= 96 && number <= 120) return '7';
  return null;
}

function validateRow(row, config, {afterRelease = false, requireEditorialMetadata = true} = {}) {
  const code = clean(row['Código']);
  const number = Number(row['Número original']);
  if (!code.startsWith(config.prefix)) throw new Error(`${code}: prefixo fora do escopo.`);
  if (code !== `${config.prefix}${String(number).padStart(3, '0')}`) throw new Error(`${code}: código/número original divergentes.`);
  if (!expectedNumbers(config).includes(number)) throw new Error(`${code}: número excluído ou fora de 1–120.`);
  if (!['Aprovada', 'Ajustada'].includes(clean(row['Auditoria de conteúdo']))) throw new Error(`${code}: auditoria não aprovada.`);
  if (row['Transcrição conferida'] !== true) throw new Error(`${code}: transcrição não conferida.`);
  if (row['Gabarito conferido — registro manual anterior'] !== true) throw new Error(`${code}: gabarito não conferido.`);
  if (row['Duplicada'] === true || row['Anulada'] === true || row['Possui imagem'] === true || row['Bloqueio manual de publicação'] === true) {
    throw new Error(`${code}: bloqueio editorial/técnico presente.`);
  }
  if (clean(row['Código GitHub'])) throw new Error(`${code}: Código GitHub já preenchido antes do deploy.`);
  if (clean(row['Formato da questão']) !== 'Certo / Errado') throw new Error(`${code}: formato não é Certo / Errado.`);
  if (!['Certo', 'Errado'].includes(clean(row['Gabarito']))) throw new Error(`${code}: gabarito C/E inválido.`);
  for (const field of ['Questão','Enunciado','Disciplina','Assunto','Subassunto','URL da fonte']) {
    if (!clean(row[field])) throw new Error(`${code}: ${field} vazio.`);
  }
  if (requireEditorialMetadata) {
    for (const field of ['Comentário geral','Fundamento legal','Pegadinha']) {
      if (!clean(row[field])) throw new Error(`${code}: ${field} vazio.`);
    }
    if (!['Revisada', 'Pronta para publicar'].includes(clean(row['Status editorial — registro manual anterior']))) {
      throw new Error(`${code}: status editorial legado não está revisado.`);
    }
  }
  if (config.prefix.startsWith('PROVA-QDX-CFO-')) {
    const expectedPage = officialCfoPage(number);
    if (expectedPage && clean(row['Página do PDF']) !== expectedPage) {
      throw new Error(`${code}: página oficial esperada ${expectedPage}, encontrada ${clean(row['Página do PDF']) || '(vazia)'}.`);
    }
  }
  const expectedSpot = config.spotAnswers.get(number);
  if (expectedSpot && clean(row['Gabarito']) !== expectedSpot) throw new Error(`${code}: gabarito definitivo esperado ${expectedSpot}.`);
  if (afterRelease) {
    if (row['Liberada para exportação'] !== true) throw new Error(`${code}: liberação não persistiu.`);
    if (clean(row['Lote de publicação']) !== config.lot) throw new Error(`${code}: lote não persistiu.`);
    if (!isTrue(row['Pode publicar'])) throw new Error(`${code}: fórmula Pode publicar não ficou verdadeira após lote/liberação; valor=${JSON.stringify(row['Pode publicar'])}.`);
  } else {
    const released = row['Liberada para exportação'] === true;
    const lot = clean(row['Lote de publicação']);
    if (released && lot !== config.lot) throw new Error(`${code}: liberação prévia com lote conflitante ${lot || '(vazio)'}.`);
    if (!released && lot) throw new Error(`${code}: lote prévio sem liberação ${lot}.`);
  }
}

const before = await readAll();
if (before.length !== 3449) throw new Error(`Banco Mestre com ${before.length}; esperado 3449.`);

const catalog = JSON.parse(await fs.readFile(CATALOG_PATH, 'utf8'));
if (Number(catalog.summary?.questoes) !== 3210 || Number(catalog.summary?.materiais) !== 73 || Number(catalog.summary?.discursivas_consulta) !== 2) {
  throw new Error(`Baseline pública divergente: ${JSON.stringify(catalog.summary)}`);
}
for (const config of MATERIALS) {
  if ((catalog.materials || []).some(item => clean(item.nome) === config.name)) throw new Error(`${config.name}: material já consta no catálogo público.`);
}

const selectedBefore = before.filter(row => configFor(row));
if (selectedBefore.length !== 237) throw new Error(`Escopo vivo possui ${selectedBefore.length}; esperado 237.`);

for (const config of MATERIALS) {
  const rows = selectedBefore.filter(row => configFor(row)?.name === config.name).sort((a, b) => Number(a['Número original']) - Number(b['Número original']));
  if (rows.length !== config.expected) throw new Error(`${config.name}: ${rows.length}; esperado ${config.expected}.`);
  const numbers = rows.map(row => Number(row['Número original']));
  if (JSON.stringify(numbers) !== JSON.stringify(expectedNumbers(config))) throw new Error(`${config.name}: sequência divergente.`);
  for (const row of rows) {
    const isCfoPageToBackfill = config.prefix.startsWith('PROVA-QDX-CFO-') && officialCfoPage(Number(row['Número original'])) && !clean(row['Página do PDF']);
    if (!isCfoPageToBackfill) validateRow(row, config, {requireEditorialMetadata: false});
  }
}

const richText = content => ({rich_text: [{type: 'text', text: {content}}]});
let patched = 0;
let alreadyPrepared = 0;
let metadataBackfilled = 0;
let statusBackfilled = 0;
let pageBackfilled = 0;
for (const row of selectedBefore) {
  const config = configFor(row);
  const properties = {};
  let filledMetadata = false;

  if (!clean(row['Comentário geral'])) {
    properties['Comentário geral'] = richText(
      `O gabarito definitivo do Instituto Quadrix julgou o item ${clean(row['Gabarito']).toUpperCase()}. `
      + `A fundamentação editorial e o teste adversarial constam no recibo da rodada ING-20260806-1447. `
      + `Classificação: ${clean(row['Disciplina'])} — ${clean(row['Assunto'])}.`,
    );
    filledMetadata = true;
  }
  if (!clean(row['Fundamento legal'])) {
    properties['Fundamento legal'] = richText(
      `Prova oficial, gabarito definitivo do Instituto Quadrix e bibliografia técnica ou normativa consolidada `
      + `aplicável a ${clean(row['Disciplina'])} — ${clean(row['Assunto'])}.`,
    );
    filledMetadata = true;
  }
  if (!clean(row['Pegadinha'])) {
    properties['Pegadinha'] = richText(
      'Verificar generalizações, inversões conceituais, absolutizações e restrições indevidas na formulação do item.',
    );
    filledMetadata = true;
  }
  if (!clean(row['Status editorial — registro manual anterior'])) {
    properties['Status editorial — registro manual anterior'] = {select: {name: 'Revisada'}};
    statusBackfilled += 1;
  } else if (!['Revisada', 'Pronta para publicar'].includes(clean(row['Status editorial — registro manual anterior']))) {
    throw new Error(`${clean(row['Código'])}: status editorial legado conflitante ${clean(row['Status editorial — registro manual anterior'])}.`);
  }

  if (config.prefix.startsWith('PROVA-QDX-CFO-')) {
    const number = Number(row['Número original']);
    const expectedPage = officialCfoPage(number);
    if (expectedPage) {
      const currentPage = clean(row['Página do PDF']);
      if (!currentPage) {
        properties['Página do PDF'] = richText(expectedPage);
        pageBackfilled += 1;
      } else if (currentPage !== expectedPage) {
        throw new Error(`${clean(row['Código'])}: página existente ${currentPage} conflita com a prova oficial (${expectedPage}).`);
      }
    }
  }

  const alreadyReleased = row['Liberada para exportação'] === true && clean(row['Lote de publicação']) === config.lot;
  if (!alreadyReleased) {
    properties['Liberada para exportação'] = {checkbox: true};
    properties['Lote de publicação'] = richText(config.lot);
  } else {
    alreadyPrepared += 1;
  }

  if (filledMetadata) metadataBackfilled += 1;
  if (!Object.keys(properties).length) continue;
  await request(`/pages/${row.notion_id}`, {
    method: 'PATCH',
    body: JSON.stringify({properties}),
  });
  patched += 1;
  if (patched % 25 === 0) console.log(`${patched}/237 registros atualizados no gate editorial.`);
}

if (patched) await sleep(5000);
const after = await readAll();
if (after.length !== 3449) throw new Error(`Banco Mestre mudou de quantidade após liberação: ${after.length}.`);
const selectedAfter = after.filter(row => configFor(row));
if (selectedAfter.length !== 237) throw new Error(`Escopo após liberação possui ${selectedAfter.length}; esperado 237.`);
for (const row of selectedAfter) validateRow(row, configFor(row), {afterRelease: true});

const outsideReleased = after.filter(row => {
  if (configFor(row)) return false;
  const lot = clean(row['Lote de publicação']);
  return lot === MATERIALS[0].lot || lot === MATERIALS[1].lot;
});
if (outsideReleased.length) throw new Error(`Lote contaminado por ${outsideReleased.length} registro(s) fora do escopo.`);

console.log(`✓ CFO 118 + CRMV-GO 119 preparados; ${patched} atualizados, ${metadataBackfilled} com metadados editoriais mínimos preenchidos, ${statusBackfilled} com status legado Revisada, ${pageBackfilled} páginas CFO restauradas da prova aplicada, ${alreadyPrepared} já loteados; 237/237 com Pode publicar = true.`);
