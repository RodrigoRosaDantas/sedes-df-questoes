import crypto from 'node:crypto';

const TOKEN = process.env.NOTION_TOKEN;
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const MATERIAL = 'Agente Fiscal — CREFITO-17 — Quadrix 2026';
const PREFIX = 'PROVA-QDX-CREFITO17-2026-AGENTE-FISCAL-401-';
const DATE = '2026-07-31';
if (!TOKEN) throw new Error('NOTION_TOKEN ausente.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[\t\u00a0 ]+/g, ' ').replace(/ *\n */g, '\n').trim();
const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
const chunks = value => {
  const text = String(value ?? '');
  const result = [];
  for (let index = 0; index < text.length; index += 1900) result.push({ type: 'text', text: { content: text.slice(index, index + 1900) } });
  return result;
};

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
    await sleep(500 * 2 ** (attempt - 1));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion ${response.status}: ${body.slice(0, 1200)}`);
}

function value(property) {
  if (!property) return null;
  if (property.type === 'title') return rich(property.title);
  if (property.type === 'rich_text') return rich(property.rich_text);
  if (property.type === 'number') return property.number;
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  if (property.type === 'select') return property.select?.name ?? '';
  if (property.type === 'date') return property.date?.start ?? '';
  return null;
}

async function readRows() {
  const rows = [];
  let cursor;
  do {
    const body = {
      page_size: 100,
      filter: { property: 'Nome do material', rich_text: { equals: MATERIAL } },
      sorts: [{ property: 'Número original', direction: 'ascending' }],
    };
    if (cursor) body.start_cursor = cursor;
    const page = await request(`/data_sources/${SOURCE}/query`, { method: 'POST', body: JSON.stringify(body) });
    for (const item of page.results || []) {
      rows.push({
        id: item.id,
        values: Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)])),
      });
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

const corrections = new Map([
  [40, 'Na Internet, a comunicação entre dois dispositivos ocorre sem a necessidade de definição prévia de protocolos, pois a transmissão é realizada automaticamente pela infraestrutura física.'],
  [45, 'Suponha-se que um servidor tenha realizado um ato legal motivado por um interesse pessoal disfarçado de interesse público. Nesse caso, é correto afirmar que a conduta será considerada antiética, ainda que seja, formalmente, correta.'],
  [50, 'Após a vigência da Lei nº 14.230/2021, a responsabilização por ato de improbidade administrativa que cause dano ao erário passou a exigir a demonstração de dolo específico do agente, sendo a culpa grave, ainda que devidamente comprovada, insuficiente para configurar a conduta ímproba e ensejar o ressarcimento ao erário no âmbito da ação de improbidade.'],
  [55, 'No âmbito do processo administrativo federal regido pela Lei nº 9.784/1999, antes de ser proferida decisão que possa afetar negativamente os interesses do administrado, deve-se garantir a este a oportunidade de apresentar alegações escritas, assegurando-se prazo mínimo de cinco dias úteis para a manifestação, salvo disposição específica em sentido diverso.'],
  [65, 'A nomeação de encarregado (DPO) é dispensável para os órgãos públicos de pequeno porte.'],
  [70, 'A atuação do servidor público, mesmo quando em estrita conformidade com as normas legais e com os regulamentares vigentes, pode ser questionada sob o prisma ético quando caracterizar o desvio de finalidade, o abuso de poder formal ou a instrumentalização da legalidade para fins estranhos ao interesse público, hipóteses nas quais a observância da letra da lei não exclui a responsabilização por violação da moralidade administrativa.'],
  [120, 'Ainda que não possa exercer as atribuições de preceptoria, o fisioterapeuta especialista em gerontologia está habilitado a trabalhar nas áreas de direção, de chefia, de consultoria e de assessoria de seu campo profissional de atuação.'],
]);

const suspicious = [
  /RASCUNHO/i,
  /CONHECIMENTOS\s+(?:BÁSICOS|COMPLEMENTARES|ESPECÍFICOS)/i,
  /PROVA\s+(?:OBJETIVA|DISCURSIVA)/i,
  /Agente Fiscal\s+CONSELHO REGIONAL/i,
  /P\s*r\s*o\s*v\s*a\s*a\s*p\s*l\s*i\s*c\s*a\s*d\s*a/i,
  /Acerca da improbidade administrativa, julgue os itens/i,
  /No que diz respeito ao processo administrativo na Administração Pública Federal, julgue os itens/i,
  /À luz das normas acerca da transparência e do acesso à informação, julgue os itens/i,
  /Considerando a proteção de dados pessoais, no âmbito da Administração Pública, julgue os itens/i,
  /No que diz respeito à integração entre ética, transparência e responsabilidade administrativa, julgue os itens/i,
  /Considerando que o texto acima tenha caráter exclusivamente motivador/i,
];

const before = await readRows();
if (before.length !== 120) throw new Error(`Pré-gate: ${before.length}/120 registros.`);
const byNumber = new Map();
for (const row of before) {
  const number = Number(row.values['Número original']);
  const expected = `${PREFIX}${String(number).padStart(3, '0')}`;
  if (clean(row.values['Código']) !== expected || byNumber.has(number)) throw new Error(`Estrutura inválida no item ${number}.`);
  byNumber.set(number, row);
}

const changed = [];
for (const [number, enunciado] of corrections) {
  const row = byNumber.get(number);
  if (!row) throw new Error(`Item ${number} não localizado.`);
  const observation = `${clean(row.values['Observações'])} Reparo pós-gate de ${DATE}: removidos comando de bloco, rodapé ou conteúdo discursivo absorvido após o enunciado.`.trim();
  await request(`/pages/${row.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        Enunciado: { rich_text: chunks(enunciado) },
        Observações: { rich_text: chunks(observation) },
        'Data da revisão': { date: { start: DATE } },
      },
    }),
  });
  changed.push(number);
  await sleep(120);
}

const after = await readRows();
if (after.length !== 120) throw new Error(`Pós-gate: ${after.length}/120 registros.`);
const findings = [];
for (const row of after) {
  const number = Number(row.values['Número original']);
  const enunciado = clean(row.values['Enunciado']);
  const markers = suspicious.filter(pattern => pattern.test(enunciado)).map(pattern => String(pattern));
  if (markers.length) findings.push({ number, markers, excerpt: enunciado.slice(0, 500) });
  if (row.values['Liberada para exportação'] || clean(row.values['Lote de publicação']) || clean(row.values['Código GitHub']) || clean(row.values['Data da publicação'])) {
    findings.push({ number, markers: ['rastro de publicação'], excerpt: '' });
  }
}
if (findings.length) throw new Error(`Marcadores residuais: ${JSON.stringify(findings)}`);

for (const [number, expected] of corrections) {
  const row = after.find(item => Number(item.values['Número original']) === number);
  if (clean(row?.values['Enunciado']) !== clean(expected)) throw new Error(`Correção não persistiu no item ${number}.`);
}

const report = {
  generated_at: new Date().toISOString(),
  material: MATERIAL,
  rows: after.length,
  corrected_boundary_items: changed,
  residual_markers: 0,
  publication_traces: 0,
  sha256_corrections: crypto.createHash('sha256').update(JSON.stringify([...corrections])).digest('hex'),
  main_changes: 0,
  site_changes: 0,
};
console.log(`BOUNDARY_REPAIR_RESULT=${JSON.stringify(report)}`);
