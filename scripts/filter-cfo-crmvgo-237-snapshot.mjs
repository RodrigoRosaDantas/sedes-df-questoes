import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.resolve(root, 'data/notion/published.json');
const OPERATION = 'CFO-CRMVGO-TECADM-237-PUBLICATION-20260807';
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

const clean = value => String(value ?? '').trim();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const full = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
if (!Array.isArray(full.records) || Number(full.totals?.all) !== 3449) throw new Error('Snapshot integral do Banco Mestre não corresponde à baseline 3449.');

const configFor = record => MATERIALS.find(item => clean(record.material_name) === item.name) || null;
const expectedNumbers = config => Array.from({length: 120}, (_, i) => i + 1).filter(number => !config.excluded.has(number));
const records = full.records.filter(record => configFor(record));
if (records.length !== 237) throw new Error(`Snapshot integral resolveu ${records.length}; esperado 237.`);

const allCodes = [];
for (const config of MATERIALS) {
  const rows = records.filter(record => configFor(record)?.name === config.name).sort((a, b) => Number(a.original_number) - Number(b.original_number));
  if (rows.length !== config.expected) throw new Error(`${config.name}: ${rows.length}; esperado ${config.expected}.`);
  const numbers = rows.map(record => Number(record.original_number));
  if (JSON.stringify(numbers) !== JSON.stringify(expectedNumbers(config))) throw new Error(`${config.name}: sequência divergente.`);
  for (const record of rows) {
    const number = Number(record.original_number);
    const expectedCode = `${config.prefix}${String(number).padStart(3, '0')}`;
    if (clean(record.code) !== expectedCode) throw new Error(`${record.code}: código canônico divergente.`);
    if (clean(record.github_id)) throw new Error(`${record.code}: já possui rastreabilidade GitHub; não pode entrar como adição.`);
    if (record.released_for_export !== true || clean(record.publication_lot) !== config.lot) throw new Error(`${record.code}: lote/liberação divergentes.`);
    if (clean(record.format) !== 'Certo / Errado' || !['Certo', 'Errado'].includes(clean(record.answer))) throw new Error(`${record.code}: formato/gabarito inválido.`);
    if (!clean(record.comment) || !clean(record.foundation) || !clean(record.prompt)) throw new Error(`${record.code}: conteúdo editorial incompleto.`);
    const expectedAnswer = config.spotAnswers.get(number);
    if (expectedAnswer && clean(record.answer) !== expectedAnswer) throw new Error(`${record.code}: gabarito definitivo esperado ${expectedAnswer}.`);
    allCodes.push(clean(record.code));
  }
}

const sortedCodes = [...allCodes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
if (new Set(sortedCodes).size !== 237) throw new Error('Há códigos repetidos no escopo 237.');

const additions = {
  schema_version: '1.3',
  scope_mode: 'additions',
  source: {
    ...full.source,
    publication_rule: 'Adição imutável restrita a 118 questões CFO e 119 questões CRMV-GO, com CFO 45/104 e CRMV-GO 94 excluídas.',
  },
  publication_scope: {
    operation: OPERATION,
    codes: sortedCodes,
    lots: MATERIALS.map(item => item.lot),
    excluded: {
      CFO: [45, 104],
      CRMVGO: [94],
    },
  },
  totals: {
    all: 3449,
    existing_public: 3210,
    publicable_rows_before_deduplication: 237,
    duplicate_publicable_rows_ignored: 0,
    published: 237,
    display_only: 2,
    pending: 0,
    materials: 2,
  },
  records: records.sort((a, b) => clean(a.material_name).localeCompare(clean(b.material_name), 'pt-BR') || Number(a.original_number) - Number(b.original_number)),
  generated_at: full.generated_at || new Date().toISOString(),
};

fs.writeFileSync(snapshotPath, `${JSON.stringify(additions, null, 2)}\n`);
console.log(`✓ Snapshot aditivo isolado: 237 registros; codes_sha256=${sha256(sortedCodes.join('\n'))}.`);
