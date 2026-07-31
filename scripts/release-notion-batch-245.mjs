const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const LOT = 'REL-2026-07-QDX-2026-LOTE-245-001';

if (!TOKEN) throw new Error('NOTION_TOKEN não disponível.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = value => String(value ?? '').trim();
const rich = items => (items || [])
  .map(item => item.plain_text ?? item.text?.content ?? '')
  .join('')
  .trim();

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

  if (response.ok) {
    return response.status === 204 ? {} : response.json();
  }

  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 9) {
    await sleep(Math.max(
      Number(response.headers.get('retry-after') || 0) * 1000,
      500 * 2 ** (attempt - 1),
    ));
    return request(endpoint, options, attempt + 1);
  }

  throw new Error(`Notion API ${response.status}: ${body.slice(0, 600)}`);
}

function value(property) {
  if (!property) return null;
  if (property.type === 'title') return rich(property.title);
  if (property.type === 'rich_text') return rich(property.rich_text);
  if (property.type === 'select') return property.select?.name ?? null;
  if (property.type === 'status') return property.status?.name ?? null;
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  if (property.type === 'number') return property.number;
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
        ...Object.fromEntries(
          Object.entries(item.properties || {})
            .map(([name, property]) => [name, value(property)]),
        ),
      });
    }

    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);

  return rows;
}

const targetCodes = new Set();
const addRange = (prefix, start, end, excluded = new Set()) => {
  for (let number = start; number <= end; number += 1) {
    if (!excluded.has(number)) {
      targetCodes.add(`${prefix}${String(number).padStart(3, '0')}`);
    }
  }
};

addRange(
  'PROVA-QDX-CRMVRN-2026-AGENTE-ADMINISTRATIVO-200-',
  1,
  120,
  new Set([107]),
);
addRange(
  'PROVA-QDX-CRBM6-2026-AUXILIAR-ADMINISTRATIVO-200-',
  29,
  55,
);
addRange(
  'PROVA-QDX-CRTR12-2026-AUXILIAR-ADMINISTRATIVO-200-',
  17,
  18,
);
addRange(
  'PROVA-QDX-CRTR12-2026-AUXILIAR-ADMINISTRATIVO-200-',
  21,
  22,
);
addRange(
  'PROVA-QDX-CRTR12-2026-AUXILIAR-ADMINISTRATIVO-200-',
  25,
  34,
);
addRange(
  'PROVA-QDX-CRTR12-2026-AUXILIAR-ADMINISTRATIVO-200-',
  36,
  120,
);

if (targetCodes.size !== 245) {
  throw new Error(`Seleção interna incorreta: ${targetCodes.size} códigos.`);
}

const rows = await readAll();
const byCode = new Map();

for (const row of rows) {
  const code = clean(row['Código']);
  if (!targetCodes.has(code) || row['Duplicada'] === true) continue;

  if (byCode.has(code)) {
    throw new Error(`${code}: mais de uma linha canônica não duplicada.`);
  }

  byCode.set(code, row);
}

const missing = [...targetCodes].filter(code => !byCode.has(code));
if (missing.length) {
  throw new Error(`Códigos não encontrados no Banco Mestre: ${missing.join(', ')}`);
}

const gateErrors = [];
const pending = [];
let alreadyPublished = 0;

for (const code of targetCodes) {
  const row = byCode.get(code);

  if (clean(row['Código GitHub'])) {
    alreadyPublished += 1;
    continue;
  }

  const checks = [
    [row['Transcrição conferida'] === true, 'transcrição não conferida'],
    [row['Gabarito conferido — registro manual anterior'] === true, 'gabarito não conferido'],
    [['Aprovada', 'Ajustada'].includes(clean(row['Auditoria de conteúdo'])), 'auditoria não aprovada/ajustada'],
    [row['Duplicada'] !== true, 'duplicada'],
    [row['Anulada'] !== true, 'anulada'],
    [row['Possui imagem'] !== true, 'possui imagem'],
    [row['Bloqueio manual de publicação'] !== true, 'bloqueio manual'],
    [clean(row['Gabarito']) && clean(row['Gabarito']) !== 'Sem gabarito', 'gabarito ausente'],
    [clean(row['Comentário geral']), 'comentário geral ausente'],
    [clean(row['Nome do material']), 'nome do material ausente'],
    [clean(row['Fonte / Banca']), 'fonte/banca ausente'],
    [clean(row['Cargo']), 'cargo ausente'],
    [clean(row['Disciplina']), 'disciplina ausente'],
    [Number.isFinite(Number(row['Ano'])) && Number(row['Ano']) > 0, 'ano ausente'],
  ];

  const failures = checks
    .filter(([ok]) => !ok)
    .map(([, label]) => label);

  if (failures.length) {
    gateErrors.push(`${code}: ${failures.join('; ')}`);
  }

  pending.push(row);
}

if (gateErrors.length) {
  throw new Error(
    `Gate seguro recusou ${gateErrors.length} questão(ões):\n${gateErrors.join('\n')}`,
  );
}

console.log(
  `Lote validado: ${pending.length} pendentes e ${alreadyPublished} já publicadas.`,
);

let updated = 0;
for (const row of pending) {
  if (
    row['Liberada para exportação'] === true
    && clean(row['Lote de publicação']) === LOT
  ) {
    continue;
  }

  await request(`/pages/${row.notion_id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        'Liberada para exportação': {checkbox: true},
        'Lote de publicação': {
          rich_text: [{
            type: 'text',
            text: {content: LOT},
          }],
        },
      },
    }),
  });

  updated += 1;
  if (updated % 25 === 0) {
    console.log(`${updated}/${pending.length} liberações aplicadas.`);
  }
}

for (let attempt = 1; attempt <= 8; attempt += 1) {
  await sleep(attempt === 1 ? 12000 : 5000);

  const refreshed = await readAll();
  const publicable = new Set(
    refreshed
      .filter(row => (
        targetCodes.has(clean(row['Código']))
        && row['Duplicada'] !== true
        && row['Pode publicar'] === true
      ))
      .map(row => clean(row['Código'])),
  );

  if (publicable.size + alreadyPublished === 245) {
    console.log(
      `✓ Gate Pode publicar confirmado para ${publicable.size} registros; `
      + `${alreadyPublished} já possuíam rastreabilidade.`,
    );
    process.exit(0);
  }

  console.log(
    `Aguardando recálculo do Notion: ${publicable.size + alreadyPublished}/245 `
    + `confirmadas (tentativa ${attempt}/8).`,
  );
}

throw new Error(
  'O Notion não confirmou Pode publicar = true para as 245 questões '
  + 'dentro da janela de validação.',
);
