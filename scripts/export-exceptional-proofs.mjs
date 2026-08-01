import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(root, 'data/notion/published.json');
const reportPath = path.join(root, 'data/notion/exceptional-release-report.json');
const markerPath = path.join(root, 'data/operations/exceptional-release-2026-08-01.json');
const catalogPath = path.join(root, 'data/release/catalogo.json');
const TOKEN = process.env.NOTION_TOKEN;
const DATA_SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const DATABASE_URL = 'https://app.notion.com/p/a1d5fc8f8e434105861faba90dc156d9?v=85b47b4a2e17461e9d3482724b13fab8';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const OPERATION_ID = 'EXC-2026-08-01-PROVAS-PENDENTES';
if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível neste repositório.');

const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const key = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const fingerprint = (prompt, alternatives) => key([
  prompt,
  ...Object.entries(alternatives || {}).sort(([a], [b]) => a.localeCompare(b)).map(([letter, text]) => `${letter}:${text}`),
].join('\u241f'));

async function notion(endpoint, options = {}, attempt = 1) {
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
  if ((response.status === 429 || response.status >= 500) && attempt < 7) {
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 500 * 2 ** (attempt - 1)));
    return notion(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 600)}`);
}

const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
function propertyValue(property) {
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

async function readBancoMestre() {
  const rows = [];
  let cursor;
  let batches = 0;
  do {
    const body = {page_size: 100, ...(cursor ? {start_cursor: cursor} : {})};
    const page = await notion(`/data_sources/${DATA_SOURCE}/query`, {method: 'POST', body: JSON.stringify(body)});
    for (const item of page.results || []) {
      const properties = Object.fromEntries(Object.entries(item.properties || {}).map(([name, value]) => [name, propertyValue(value)]));
      rows.push({
        notion_id: item.id,
        notion_url: item.url,
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

async function readPublicSite() {
  const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
  const codes = new Set();
  const fingerprints = new Set();
  let count = 0;
  for (const metadata of catalog.materials || []) {
    const file = path.resolve(root, String(metadata.file).replace(/^\.\//, ''));
    const material = JSON.parse(await fs.readFile(file, 'utf8'));
    for (const question of material.questoes || []) {
      count += 1;
      [question.codigo, question.codigo_fonte].map(key).filter(Boolean).forEach(code => codes.add(code));
      fingerprints.add(fingerprint(question.enunciado, question.alternativas));
    }
  }
  return {codes, fingerprints, count};
}

function normalizeAnswer(raw, trueFalse) {
  const normalized = key(raw);
  if (['anulada', 'anulado'].includes(normalized)) return 'Anulada';
  if (trueFalse && ['c', 'certo', 'correto', 'verdadeiro'].includes(normalized)) return 'Certo';
  if (trueFalse && ['e', 'errado', 'incorreto', 'falso'].includes(normalized)) return 'Errado';
  const letter = clean(raw).toUpperCase();
  return ['A', 'B', 'C', 'D', 'E'].includes(letter) ? letter : clean(raw);
}

function toRecord(row) {
  const corrections = [];
  const alternatives = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map(letter => [letter, clean(row[`Alternativa ${letter}`])]));
  const alternativesBlank = Object.values(alternatives).every(value => !value);
  const declaredFormat = clean(row['Formato da questão']);
  const rawAnswer = clean(row['Gabarito']);
  const trueFalse = alternativesBlank || /certo\s*\/\s*errado/i.test(declaredFormat) || ['certo', 'errado'].includes(key(rawAnswer));
  const answer = normalizeAnswer(rawAnswer, trueFalse);
  const code = clean(row['Código']);
  const materialName = clean(row['Nome do material']) || `Prova — ${clean(row['Órgão']) || 'órgão não informado'} — ${Number(row['Ano']) || 'ano não informado'}`;
  const title = clean(row['Questão']) || code;
  const comment = clean(row['Comentário geral']) || 'Comentário não disponível no Banco Mestre; publicação excepcional sem revisão editorial ordinária.';
  if (!clean(row['Nome do material'])) corrections.push('nome_material_padronizado');
  if (!clean(row['Questão']) && code) corrections.push('titulo_preenchido_com_codigo');
  if (!clean(row['Comentário geral'])) corrections.push('comentario_tecnico_adicionado');
  if (answer !== rawAnswer) corrections.push('gabarito_normalizado');

  return {corrections, record: {
    notion_id: row.notion_id,
    notion_url: row.notion_url,
    notion_last_edited_time: row.notion_last_edited_time,
    code,
    github_id: '',
    title,
    material_name: materialName,
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
    format: trueFalse ? 'Certo / Errado' : declaredFormat || 'Múltipla escolha A–E',
    format_inference: alternativesBlank ? 'alternativas_A_E_vazias' : 'formato_ou_gabarito',
    original_number: Number(row['Número original']) || null,
    text_base: clean(row['Texto-base']),
    prompt: clean(row['Enunciado']),
    alternatives: trueFalse ? {Certo: 'Certo', Errado: 'Errado'} : alternatives,
    answer,
    comment,
    alternative_comments: Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map(letter => [letter, clean(row[`Comentário ${letter}`])])),
    foundation: clean(row['Fundamento legal']),
    trap: clean(row['Pegadinha']),
    observations: clean(row['Observações']),
    annulled: false,
    has_image: Boolean(row['Possui imagem']),
    image_description: clean(row['Descrição da imagem']),
    pdf_page: clean(row['Página do PDF']),
    publication_lot: OPERATION_ID,
    released_for_export: true,
    publication_exception: true,
  }};
}

function technicalProblems(record) {
  const problems = [];
  if (!record.code) problems.push('codigo_ausente');
  if (!record.prompt) problems.push('enunciado_ausente');
  if (!record.answer) problems.push('gabarito_ausente');
  if (record.format === 'Certo / Errado') {
    if (!['Certo', 'Errado'].includes(record.answer)) problems.push('gabarito_certo_errado_invalido');
  } else {
    for (const letter of ['A', 'B', 'C', 'D', 'E']) if (!record.alternatives[letter]) problems.push(`alternativa_${letter.toLowerCase()}_ausente`);
    if (!['A', 'B', 'C', 'D', 'E'].includes(record.answer)) problems.push('gabarito_multipla_escolha_invalido');
  }
  return problems;
}

const marker = JSON.parse(await fs.readFile(markerPath, 'utf8'));
if (marker.operation_id !== OPERATION_ID || marker.authorized !== true || marker.scope !== 'provas_pendentes' || marker.revision !== 2) {
  throw new Error('Marcador da operação excepcional ausente, divergente ou sem a revisão corretiva 2.');
}

const [all, site] = await Promise.all([readBancoMestre(), readPublicSite()]);
const proofRows = all.filter(row => key(row['Tipo de material']).includes('prova'));
const exclusions = [];
const rawCandidates = [];
for (const row of proofRows) {
  const code = clean(row['Código']);
  if (key(code) && site.codes.has(key(code))) {
    exclusions.push({code, notion_id: row.notion_id, reason: 'ja_publicada'});
    continue;
  }
  if (row['Anulada'] === true || ['anulada', 'anulado'].includes(key(row['Gabarito']))) {
    exclusions.push({code, notion_id: row.notion_id, reason: 'anulada'});
    continue;
  }
  if (row['Duplicada'] === true) {
    exclusions.push({code, notion_id: row.notion_id, reason: 'duplicada_marcada'});
    continue;
  }
  const mapped = toRecord(row);
  const problems = technicalProblems(mapped.record);
  if (problems.length) {
    exclusions.push({code, notion_id: row.notion_id, reason: 'impedimento_tecnico', details: problems});
    continue;
  }
  const contentFingerprint = fingerprint(mapped.record.prompt, mapped.record.alternatives);
  if (site.fingerprints.has(contentFingerprint)) {
    exclusions.push({code, notion_id: row.notion_id, reason: 'duplicada_conteudo_publicado'});
    continue;
  }
  rawCandidates.push({...mapped, fingerprint: contentFingerprint});
}

rawCandidates.sort((a, b) => a.record.material_name.localeCompare(b.record.material_name, 'pt-BR')
  || Number(a.record.original_number) - Number(b.record.original_number)
  || a.record.code.localeCompare(b.record.code, 'pt-BR')
  || a.record.notion_id.localeCompare(b.record.notion_id));
const selected = [];
const lotCodes = new Set();
const lotFingerprints = new Set();
for (const item of rawCandidates) {
  const code = key(item.record.code);
  if (lotCodes.has(code)) {
    exclusions.push({code: item.record.code, notion_id: item.record.notion_id, reason: 'duplicada_codigo_no_lote'});
    continue;
  }
  if (lotFingerprints.has(item.fingerprint)) {
    exclusions.push({code: item.record.code, notion_id: item.record.notion_id, reason: 'duplicada_conteudo_no_lote'});
    continue;
  }
  lotCodes.add(code);
  lotFingerprints.add(item.fingerprint);
  selected.push(item);
}

const records = selected.map(item => item.record);
const duplicateReasons = new Set(['duplicada_marcada', 'duplicada_conteudo_publicado', 'duplicada_codigo_no_lote', 'duplicada_conteudo_no_lote']);
const duplicateCount = exclusions.filter(item => duplicateReasons.has(item.reason)).length;
const countsByReason = {};
for (const item of exclusions) countsByReason[item.reason] = (countsByReason[item.reason] || 0) + 1;
const corrections = {};
for (const item of selected) for (const correction of item.corrections) corrections[correction] = (corrections[correction] || 0) + 1;
const generatedAt = new Date().toISOString();
const snapshot = {
  schema_version: '1.2',
  source: {
    name: 'Banco Mestre — Provas e Simulados SEDES/DF',
    database_url: DATABASE_URL,
    data_source_id: DATA_SOURCE,
    publication_rule: 'Operação excepcional EXC-2026-08-01-PROVAS-PENDENTES, revisão 2: o site público é a fonte de verdade para detectar questões já publicadas; anuladas e duplicadas são excluídas',
  },
  totals: {
    all: all.length,
    publicable_rows_before_deduplication: records.length + duplicateCount,
    duplicate_publicable_rows_ignored: duplicateCount,
    published: records.length,
    pending: all.length - records.length,
    materials: new Set(records.map(record => key(record.material_name))).size,
  },
  records,
  generated_at: generatedAt,
};
const report = {
  schema_version: '1.1',
  operation_id: OPERATION_ID,
  revision: 2,
  generated_at: generatedAt,
  policy: {
    ordinary_editorial_gates_waived: true,
    existing_source_of_truth: 'catalogo_publico_versionado',
    existing_questions_preserved: true,
    excluded: ['ja_publicada', 'anulada', 'duplicada'],
    technical_corrections_only: true,
  },
  counts: {
    bank_total: all.length,
    proof_rows: proofRows.length,
    site_questions_before_operation: site.count,
    site_questions_preserved: site.count,
    eligible_before_lot_deduplication: rawCandidates.length,
    added: records.length,
    excluded_total: exclusions.length,
    ...countsByReason,
  },
  technical_corrections: corrections,
  added_codes: records.map(record => record.code),
  exclusions,
};
await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`✓ Revisão 2 preparada: ${records.length} prova(s) novas; ${countsByReason.ja_publicada || 0} já publicada(s), ${countsByReason.anulada || 0} anulada(s), ${duplicateCount} duplicada(s) e ${countsByReason.impedimento_tecnico || 0} impedimento(s) técnico(s).`);
