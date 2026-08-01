import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const MATERIAL = 'Gestor em Políticas Públicas e Gestão Governamental — Administração — SEEDF/DF — Quadrix 2022 — Tipo A';
const PREFIX = 'PROVA-QDX-SEEDF-2022-GPPGADM-A-';
const LOT = 'REL-2026-07-QDX-2022-GPPGADM';
const RECEIPT = 'release-2.5:c8acc1ca772b8d5175cdadc55f998def563833eb';
const PUBLICATION_DATE = '2026-07-30';
const REVIEW_DATE = '2026-07-31';
const OFFICIAL_ANALYSIS = 'https://ps-adm-861.selecao.net.br/uploads/861/concursos/1180/anexos/7aaaec2a52a98fd7e3093ac1d937e4de.pdf?v152514=';
const MATERIAL_PATH = path.join(root, 'data/release/materials/prova-qdx-seedf-2022-gppgadm-a.json');
const REPORT_PATH = path.join(root, 'artifacts/saneamento-gppgadm-2022-20260731.json');

if (!TOKEN) throw new Error('NOTION_TOKEN não disponível.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[\t\u00a0 ]+/g, ' ').replace(/ *\n */g, '\n').trim();
const codeFor = number => `${PREFIX}${String(number).padStart(3, '0')}`;

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
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 800)}`);
}

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
    return formula ? formula[formula.type] ?? null : null;
  }
  return null;
}

async function readRows() {
  const rows = [];
  let cursor;
  do {
    const body = {
      page_size: 100,
      filter: {property: 'Nome do material', rich_text: {equals: MATERIAL}},
    };
    if (cursor) body.start_cursor = cursor;
    const page = await request(`/data_sources/${SOURCE}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    for (const item of page.results || []) {
      rows.push({
        notion_id: item.id,
        notion_url: item.url,
        ...Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)])),
      });
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows.sort((a, b) => Number(a['Número original']) - Number(b['Número original']));
}

function chunks(text, max = 1900) {
  const source = clean(text);
  const result = [];
  for (let index = 0; index < source.length; index += max) result.push(source.slice(index, index + max));
  return result;
}
const richProperty = text => ({rich_text: chunks(text).map(content => ({type: 'text', text: {content}}))});

function snapshot(row) {
  return {
    numero: Number(row['Número original']),
    codigo: clean(row['Código']),
    notion_id: row.notion_id,
    notion_url: row.notion_url,
    texto_base: clean(row['Texto-base']),
    enunciado: clean(row['Enunciado']),
    gabarito: clean(row['Gabarito']),
    anulada: Boolean(row['Anulada']),
    comentario: clean(row['Comentário geral']),
    fundamento: clean(row['Fundamento legal']),
    pegadinha: clean(row['Pegadinha']),
    observacoes: clean(row['Observações']),
    auditoria: clean(row['Auditoria de conteúdo']),
    bloqueio: Boolean(row['Bloqueio manual de publicação']),
    status_manual: clean(row['Status editorial — registro manual anterior']),
    liberada: Boolean(row['Liberada para exportação']),
    lote: clean(row['Lote de publicação']),
    codigo_github: clean(row['Código GitHub']),
    data_publicacao: clean(row['Data da publicação']),
    data_revisao: clean(row['Data da revisão']),
    possui_imagem: Boolean(row['Possui imagem']),
    descricao_imagem: clean(row['Descrição da imagem']),
  };
}

const CONTENT_MAP = [
  ['codigo', 'Código'], ['numero', 'Número original'], ['bloco', 'Bloco'], ['disciplina', 'Disciplina'],
  ['assunto', 'Assunto'], ['subassunto', 'Subassunto'], ['texto_base', 'Texto-base'], ['enunciado', 'Enunciado'],
  ['gabarito', 'Gabarito'], ['comentario', 'Comentário geral'], ['fundamento', 'Fundamento legal'],
  ['pegadinha', 'Pegadinha'], ['observacoes', 'Observações'], ['formato_questao', 'Formato da questão'],
  ['numero_original', 'Número original'], ['pagina_pdf', 'Página do PDF'], ['fonte_oficial', 'URL da fonte'],
  ['anulada', 'Anulada'], ['possui_imagem', 'Possui imagem'], ['descricao_imagem', 'Descrição da imagem'],
];

function normalize(value) {
  return typeof value === 'string' ? clean(value) : value;
}

const material = JSON.parse(await fs.readFile(MATERIAL_PATH, 'utf8'));
const publishedByNumber = new Map((material.questoes || []).map(item => [Number(item.numero), item]));
const rows = await readRows();

if (rows.length !== 120 || publishedByNumber.size !== 120) {
  throw new Error(`Material incompleto: Notion ${rows.length}/120; main ${publishedByNumber.size}/120.`);
}

const preflightErrors = [];
for (let index = 0; index < rows.length; index += 1) {
  const number = index + 1;
  const row = rows[index];
  const published = publishedByNumber.get(number);
  if (Number(row['Número original']) !== number) preflightErrors.push(`posição ${number}: número ${row['Número original']}`);
  if (clean(row['Código']) !== codeFor(number)) preflightErrors.push(`item ${number}: código divergente`);
  if (!published) preflightErrors.push(`item ${number}: ausente da main`);
  if (published) {
    for (const [publishedField, notionField] of CONTENT_MAP) {
      const expected = normalize(published[publishedField]);
      const actual = normalize(row[notionField]);
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        preflightErrors.push(`item ${number}: ${notionField} diverge da main`);
      }
    }
  }
  if (clean(row['Código GitHub']) !== RECEIPT) preflightErrors.push(`item ${number}: recibo divergente`);
  if (clean(row['Data da publicação']) !== PUBLICATION_DATE) preflightErrors.push(`item ${number}: data de publicação divergente`);
  if (clean(row['Lote de publicação']) !== LOT) preflightErrors.push(`item ${number}: lote divergente`);
  if (row['Liberada para exportação'] !== true) preflightErrors.push(`item ${number}: liberação histórica ausente`);
  if (row['Bloqueio manual de publicação'] === true) preflightErrors.push(`item ${number}: bloqueio prévio inesperado`);
  if (clean(row['Status editorial — registro manual anterior']) !== 'Publicada') preflightErrors.push(`item ${number}: status histórico divergente`);
  if (row['Transcrição conferida'] !== true) preflightErrors.push(`item ${number}: transcrição não conferida`);
  if (row['Gabarito conferido — registro manual anterior'] !== true) preflightErrors.push(`item ${number}: gabarito não conferido`);
}

const staleRows = rows.filter(row => /O material segue Em revisão até a auditoria global da prova\./i.test(clean(row['Observações'])));
if (staleRows.length !== 118) preflightErrors.push(`observações obsoletas: ${staleRows.length}/118`);
if (rows[22]['Possui imagem'] !== true || !clean(rows[22]['Descrição da imagem'])) preflightErrors.push('item 23: recurso visual incompleto');
if (clean(rows[30]['Gabarito']) !== 'Certo' || rows[30]['Anulada'] === true) preflightErrors.push('item 31: estado inicial inesperado');
if (clean(rows[112]['Gabarito']) !== 'Errado' || rows[112]['Anulada'] === true) preflightErrors.push('item 113: estado inicial inesperado');
if (preflightErrors.length) throw new Error(`Preflight recusou a manutenção:\n${preflightErrors.slice(0, 80).join('\n')}`);

const before = rows.map(snapshot);
const staleReplacement = `Estado editorial reconciliado em ${REVIEW_DATE}: registro efetivamente publicado em ${PUBLICATION_DATE} no lote ${LOT}. Enunciado, gabarito, comentário, fundamento e recibo foram preservados nesta manutenção.`;

let observationsUpdated = 0;
for (const row of staleRows.filter(item => Number(item['Número original']) !== 31)) {
  const updatedObservation = clean(row['Observações']).replace(
    /O material segue Em revisão até a auditoria global da prova\./i,
    staleReplacement,
  );
  await request(`/pages/${row.notion_id}`, {
    method: 'PATCH',
    body: JSON.stringify({properties: {
      'Observações': richProperty(updatedObservation),
      'Data da revisão': {date: {start: REVIEW_DATE}},
    }}),
  });
  observationsUpdated += 1;
  if (observationsUpdated % 25 === 0) console.log(`${observationsUpdated}/117 observações reconciliadas.`);
}

const q31 = rows[30];
const q31Observation = `SANEAMENTO EDITORIAL — ${REVIEW_DATE}: a análise oficial dos recursos da Quadrix anulou o item 31 da prova Tipo A por erro material. A banca esclareceu que a assertiva deveria indicar expressamente que tratava de cargo de provimento efetivo, o que impediu julgamento objetivo. O recibo, o lote e a data da publicação original foram preservados como histórico. Registro bloqueado e retirado de nova exportação até a correção da main e do site. Fonte oficial: ${OFFICIAL_ANALYSIS}`;
await request(`/pages/${q31.notion_id}`, {
  method: 'PATCH',
  body: JSON.stringify({properties: {
    'Gabarito': {select: {name: 'Anulada'}},
    'Anulada': {checkbox: true},
    'Comentário geral': richProperty('Item anulado pela banca. Na análise dos recursos, a Quadrix reconheceu erro material: embora a assertiva reproduzisse as hipóteses do parágrafo único do art. 51 da Lei Complementar Distrital nº 840/2011, ela não esclarecia que se referia a cargo de provimento efetivo, o que impossibilitou o julgamento objetivo.'),
    'Fundamento legal': richProperty('Lei Complementar Distrital nº 840/2011, art. 51, parágrafo único, incisos I e II; análise oficial de recursos da Quadrix, item 31 da prova Tipo A, parecer de anulação.'),
    'Pegadinha': richProperty('A redação parece reproduzir as hipóteses legais, mas omite que a regra se refere à exoneração de cargo de provimento efetivo.'),
    'Observações': richProperty(q31Observation),
    'Auditoria de conteúdo': {select: {name: 'Ajustada'}},
    'Bloqueio manual de publicação': {checkbox: true},
    'Status editorial — registro manual anterior': {select: {name: 'Bloqueada'}},
    'Liberada para exportação': {checkbox: false},
    'Gabarito conferido — registro manual anterior': {checkbox: true},
    'Data da revisão': {date: {start: REVIEW_DATE}},
  }}),
});

const q113 = rows[112];
const q113Observation = `SANEAMENTO EDITORIAL — ${REVIEW_DATE}: restaurado o gabarito oficial Certo. A análise dos recursos da Quadrix registrou “Indeferido. Gabarito mantido” para o item 113 da prova Tipo A. A correção técnica provisória para Errado, aplicada anteriormente sem acesso ao documento oficial, foi substituída pela resposta definitiva da banca. O recibo, o lote e a data da publicação original foram preservados como histórico. Registro bloqueado e retirado de nova exportação até a correção da main e do site. Fonte oficial: ${OFFICIAL_ANALYSIS}`;
await request(`/pages/${q113.notion_id}`, {
  method: 'PATCH',
  body: JSON.stringify({properties: {
    'Gabarito': {select: {name: 'Certo'}},
    'Anulada': {checkbox: false},
    'Comentário geral': richProperty('Item certo segundo o gabarito definitivo mantido pela banca. Na análise dos recursos, a Quadrix considerou que as contratações descritas se enquadram nos serviços técnicos especializados previstos no art. 74, inciso III, alíneas c e e, da Lei nº 14.133/2021. Para reprodução fiel da prova, prevalece o gabarito oficial sobre a avaliação técnica provisória anterior.'),
    'Fundamento legal': richProperty('Lei nº 14.133/2021, art. 74, inciso III, alíneas c e e; análise oficial de recursos da Quadrix, item 113 da prova Tipo A, parecer “Indeferido. Gabarito mantido”.'),
    'Pegadinha': richProperty('Substituir o gabarito oficial por uma ressalva jurídica não adotada pela banca na correção definitiva.'),
    'Observações': richProperty(q113Observation),
    'Auditoria de conteúdo': {select: {name: 'Ajustada'}},
    'Bloqueio manual de publicação': {checkbox: true},
    'Status editorial — registro manual anterior': {select: {name: 'Bloqueada'}},
    'Liberada para exportação': {checkbox: false},
    'Gabarito conferido — registro manual anterior': {checkbox: true},
    'Data da revisão': {date: {start: REVIEW_DATE}},
  }}),
});

await sleep(8000);
const refreshed = await readRows();
const after = refreshed.map(snapshot);
const postErrors = [];

if (refreshed.length !== 120) postErrors.push(`pós-gate: ${refreshed.length}/120 registros`);
for (const row of refreshed) {
  const number = Number(row['Número original']);
  if (clean(row['Código GitHub']) !== RECEIPT) postErrors.push(`item ${number}: recibo alterado`);
  if (clean(row['Data da publicação']) !== PUBLICATION_DATE) postErrors.push(`item ${number}: data de publicação alterada`);
  if (clean(row['Lote de publicação']) !== LOT) postErrors.push(`item ${number}: lote alterado`);
  if (/Em revisão até a auditoria global da prova/i.test(clean(row['Observações']))) postErrors.push(`item ${number}: observação obsoleta remanescente`);
}
const blocked = refreshed.filter(row => row['Bloqueio manual de publicação'] === true).map(row => Number(row['Número original']));
if (JSON.stringify(blocked) !== JSON.stringify([31, 113])) postErrors.push(`bloqueios finais divergentes: ${blocked.join(', ')}`);
const releasedFalse = refreshed.filter(row => row['Liberada para exportação'] !== true).map(row => Number(row['Número original']));
if (JSON.stringify(releasedFalse) !== JSON.stringify([31, 113])) postErrors.push(`liberações finais divergentes: ${releasedFalse.join(', ')}`);
const annulled = refreshed.filter(row => row['Anulada'] === true || clean(row['Gabarito']) === 'Anulada').map(row => Number(row['Número original']));
if (JSON.stringify(annulled) !== JSON.stringify([31])) postErrors.push(`anulações finais divergentes: ${annulled.join(', ')}`);
if (clean(refreshed[112]['Gabarito']) !== 'Certo') postErrors.push('item 113: gabarito final não é Certo');
if (refreshed[22]['Possui imagem'] !== true || !clean(refreshed[22]['Descrição da imagem'])) postErrors.push('item 23: imagem não preservada');

const intendedProperties = new Set(['observacoes', 'data_revisao']);
for (let index = 0; index < before.length; index += 1) {
  const number = index + 1;
  for (const key of Object.keys(before[index])) {
    if (['notion_id', 'notion_url'].includes(key)) continue;
    const allowed = number === 31 || number === 113
      ? new Set(['gabarito', 'anulada', 'comentario', 'fundamento', 'pegadinha', 'observacoes', 'auditoria', 'bloqueio', 'status_manual', 'liberada', 'data_revisao'])
      : intendedProperties;
    if (!allowed.has(key) && JSON.stringify(before[index][key]) !== JSON.stringify(after[index][key])) {
      postErrors.push(`item ${number}: alteração não autorizada em ${key}`);
    }
  }
}
if (postErrors.length) throw new Error(`Pós-gate recusou o fechamento:\n${postErrors.slice(0, 80).join('\n')}`);

const report = {
  generated_at: new Date().toISOString(),
  material: MATERIAL,
  mode: 'notion_maintenance_without_site_sync',
  result: {
    total_material: 120,
    stale_observations_reconciled: 117,
    annulled_items_corrected: [31],
    official_answers_restored: [113],
    blocked_pending_site_sync: [31, 113],
    image_items_preserved: [23],
    receipts_preserved: 120,
    lots_preserved: 120,
    publication_dates_preserved: 120,
    main_changes: 0,
    site_changes: 0,
    new_lots: 0,
    new_releases: 0,
  },
  official_source: OFFICIAL_ANALYSIS,
  before,
  after,
};
await fs.mkdir(path.dirname(REPORT_PATH), {recursive: true});
await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(`SANEAMENTO_RESULT=${JSON.stringify(report.result)}`);
console.log(`SANEAMENTO_REPORT=${path.relative(root, REPORT_PATH)}`);
