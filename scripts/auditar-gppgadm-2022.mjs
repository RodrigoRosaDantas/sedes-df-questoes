import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const MATERIAL_NAME = 'Gestor em Políticas Públicas e Gestão Governamental — Administração — SEEDF/DF — Quadrix 2022 — Tipo A';
const PREFIX = 'PROVA-QDX-SEEDF-2022-GPPGADM-A-';
const LOCAL_PATH = path.join(root, 'data/release/materials/prova-qdx-seedf-2022-gppgadm-a.json');
const PUBLIC_URL = 'https://rodrigorosadantas.github.io/sedes-df-questoes/data/release/materials/prova-qdx-seedf-2022-gppgadm-a.json';
const PUBLIC_CATALOG_URL = 'https://rodrigorosadantas.github.io/sedes-df-questoes/data/release/catalogo.json';
const ARTIFACT_DIR = path.join(root, 'artifacts/auditoria-gppgadm-2022');

if (!TOKEN) throw new Error('NOTION_TOKEN não está disponível.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
const clean = value => String(value ?? '')
  .replace(/\r/g, '')
  .replace(/[\u00A0\t ]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .trim();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

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
    return formula[formula.type] ?? null;
  }
  return null;
}

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

async function readMaterialRows() {
  const rows = [];
  let cursor;
  do {
    const body = {
      page_size: 100,
      filter: {
        property: 'Nome do material',
        rich_text: {equals: MATERIAL_NAME},
      },
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
        last_edited_time: item.last_edited_time,
        ...Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)])),
      });
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

function notionQuestion(row) {
  const number = Number(row['Número original']);
  return {
    id: `qdx-seedf-2022-gppgadm-a-${String(number).padStart(3, '0')}`,
    codigo: clean(row['Código']),
    numero: number,
    bloco: clean(row['Bloco']),
    disciplina: clean(row['Disciplina']),
    assunto: clean(row['Assunto']),
    subassunto: clean(row['Subassunto']),
    texto_base: clean(row['Texto-base']),
    enunciado: clean(row['Enunciado']),
    alternativas: {Certo: 'Certo', Errado: 'Errado'},
    gabarito: clean(row['Gabarito']),
    comentario: clean(row['Comentário geral']),
    fundamento: clean(row['Fundamento legal']),
    pegadinha: clean(row['Pegadinha']),
    observacoes: clean(row['Observações']),
    formato_questao: clean(row['Formato da questão']),
    numero_original: number,
    pagina_pdf: clean(row['Página do PDF']),
    fonte_oficial: clean(row['URL da fonte']),
    notion_url: row.notion_url,
    anulada: Boolean(row['Anulada']),
    possui_imagem: Boolean(row['Possui imagem']),
    imagem: number === 23 ? './assets/images/excel-analise-rapida-q23.svg' : '',
    descricao_imagem: clean(row['Descrição da imagem']),
    publication: {
      liberada: Boolean(row['Liberada para exportação']),
      lote: clean(row['Lote de publicação']),
      github: clean(row['Código GitHub']),
      data_publicacao: clean(row['Data da publicação']),
      status_manual: clean(row['Status editorial - registro manual anterior'] || row['Status editorial — registro manual anterior']),
      bloqueio: Boolean(row['Bloqueio manual de publicação']),
      auditoria: clean(row['Auditoria de conteúdo']),
      transcricao_conferida: Boolean(row['Transcrição conferida']),
      gabarito_conferido: Boolean(row['Gabarito conferido - registro manual anterior'] || row['Gabarito conferido — registro manual anterior']),
      pode_publicar: Boolean(row['Pode publicar']),
    },
    notion_id: row.notion_id,
    last_edited_time: row.last_edited_time,
  };
}

const COMPARE_FIELDS = [
  'codigo', 'numero', 'bloco', 'disciplina', 'assunto', 'subassunto', 'texto_base', 'enunciado',
  'gabarito', 'comentario', 'fundamento', 'pegadinha', 'observacoes', 'formato_questao',
  'numero_original', 'pagina_pdf', 'fonte_oficial', 'anulada', 'possui_imagem', 'imagem', 'descricao_imagem',
];

function compareQuestion(current, published) {
  const differences = [];
  for (const field of COMPARE_FIELDS) {
    const a = typeof current[field] === 'string' ? clean(current[field]) : current[field];
    const b = typeof published[field] === 'string' ? clean(published[field]) : published[field];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      differences.push({field, notion: a, published: b});
    }
  }
  return differences;
}

function sequenceDiagnosis(questions) {
  const numbers = questions.map(item => item.numero).filter(Number.isFinite).sort((a, b) => a - b);
  const expected = Array.from({length: 120}, (_, index) => index + 1);
  const missing = expected.filter(number => !numbers.includes(number));
  const repeated = [...new Set(numbers.filter((number, index) => numbers.indexOf(number) !== index))];
  const outside = numbers.filter(number => number < 1 || number > 120);
  return {missing, repeated, outside};
}

function contradictionFlags(question) {
  const flags = [];
  const observation = clean(question.observacoes).toLowerCase();
  const publishedWords = ['publicad', 'liberad', 'exporta'];
  const pendingWords = ['em revisão', 'aguarda', 'fora do site', 'não publicar', 'nao publicar'];
  if (question.publication.github && pendingWords.some(word => observation.includes(word))) {
    flags.push('observação contradiz publicação comprovada');
  }
  if (!question.publication.github && publishedWords.some(word => observation.includes(word))) {
    flags.push('observação afirma publicação/liberação sem recibo');
  }
  if (question.gabarito === 'Certo' && /^item errado\b/i.test(question.comentario)) flags.push('comentário começa como item errado, mas gabarito é Certo');
  if (question.gabarito === 'Errado' && /^item certo\b/i.test(question.comentario)) flags.push('comentário começa como item certo, mas gabarito é Errado');
  if (question.gabarito === 'Anulada' && !/anulad/i.test(question.comentario)) flags.push('gabarito Anulada sem indicação de anulação no comentário');
  if (question.anulada && question.gabarito !== 'Anulada') flags.push('checkbox Anulada não corresponde ao gabarito');
  if (!question.anulada && question.gabarito === 'Anulada') flags.push('gabarito Anulada com checkbox Anulada desmarcado');
  if (question.possui_imagem && (!question.imagem || !question.descricao_imagem)) flags.push('imagem marcada sem caminho/descrição completa');
  if (!question.possui_imagem && question.imagem) flags.push('caminho de imagem preenchido sem checkbox Possui imagem');
  return flags;
}

async function fetchText(url) {
  const response = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0 auditoria-sedes-df'}});
  if (!response.ok) throw new Error(`Falha ao buscar ${url}: HTTP ${response.status}`);
  return response.text();
}

await fs.mkdir(ARTIFACT_DIR, {recursive: true});
const localRaw = await fs.readFile(LOCAL_PATH, 'utf8');
const localMaterial = JSON.parse(localRaw);
const rows = await readMaterialRows();
const currentQuestions = rows.map(notionQuestion).sort((a, b) => a.numero - b.numero);
const localQuestions = [...(localMaterial.questoes || [])].sort((a, b) => a.numero - b.numero);

const currentByNumber = new Map(currentQuestions.map(item => [item.numero, item]));
const localByNumber = new Map(localQuestions.map(item => [item.numero, item]));
const contentDifferences = [];
for (let number = 1; number <= 120; number += 1) {
  const current = currentByNumber.get(number);
  const published = localByNumber.get(number);
  if (!current || !published) continue;
  const differences = compareQuestion(current, published);
  if (differences.length) contentDifferences.push({number, codigo: current.codigo, differences});
}

let publicMaterial = null;
let publicRaw = '';
let publicError = null;
try {
  publicRaw = await fetchText(PUBLIC_URL);
  publicMaterial = JSON.parse(publicRaw);
} catch (error) {
  publicError = String(error.message || error);
}

let publicCatalog = null;
let publicCatalogError = null;
try {
  publicCatalog = JSON.parse(await fetchText(PUBLIC_CATALOG_URL));
} catch (error) {
  publicCatalogError = String(error.message || error);
}

const publicationIssues = [];
for (const question of currentQuestions) {
  const p = question.publication;
  const issues = [];
  if (!p.liberada) issues.push('Liberada para exportação = Não');
  if (p.lote !== 'REL-2026-07-QDX-2022-GPPGADM') issues.push(`lote divergente: ${p.lote || '(vazio)'}`);
  if (!p.github) issues.push('Código GitHub vazio');
  if (!p.data_publicacao) issues.push('Data da publicação vazia');
  if (p.bloqueio) issues.push('bloqueio manual ativo');
  if (!p.transcricao_conferida) issues.push('transcrição não conferida');
  if (!p.gabarito_conferido) issues.push('gabarito não conferido');
  if (!['Aprovada', 'Ajustada'].includes(p.auditoria)) issues.push(`auditoria ${p.auditoria || '(vazia)'}`);
  if (issues.length) publicationIssues.push({number: question.numero, codigo: question.codigo, issues});
}

const contradictionIssues = currentQuestions
  .map(question => ({number: question.numero, codigo: question.codigo, flags: contradictionFlags(question)}))
  .filter(item => item.flags.length);

const imageQuestions = currentQuestions.filter(item => item.possui_imagem).map(item => item.numero);
const annulledQuestions = currentQuestions.filter(item => item.anulada || item.gabarito === 'Anulada').map(item => item.numero);
const duplicateCodes = [...new Set(currentQuestions.map(item => item.codigo).filter((code, index, all) => all.indexOf(code) !== index))];
const githubReceipts = [...new Set(currentQuestions.map(item => item.publication.github).filter(Boolean))];
const publicationDates = [...new Set(currentQuestions.map(item => item.publication.data_publicacao).filter(Boolean))];

const publicComparison = {
  available: Boolean(publicMaterial),
  error: publicError,
  raw_equal_to_main: publicMaterial ? publicRaw.trim() === localRaw.trim() : false,
  local_sha256: sha256(localRaw.trim()),
  public_sha256: publicMaterial ? sha256(publicRaw.trim()) : null,
  local_questions: localQuestions.length,
  public_questions: publicMaterial?.questoes?.length ?? null,
  catalog_release_version: publicCatalog?.release_version ?? null,
  catalog_summary: publicCatalog?.summary ?? null,
  catalog_error: publicCatalogError,
};

const report = {
  generated_at: new Date().toISOString(),
  mode: 'read_only',
  material: MATERIAL_NAME,
  prefix: PREFIX,
  source_official: 'https://quadrix.org.br/informacoes/1180/',
  counts: {
    notion_rows: rows.length,
    current_questions: currentQuestions.length,
    main_questions: localQuestions.length,
    content_difference_records: contentDifferences.length,
    publication_issue_records: publicationIssues.length,
    contradiction_records: contradictionIssues.length,
  },
  sequence: {
    notion: sequenceDiagnosis(currentQuestions),
    main: sequenceDiagnosis(localQuestions),
  },
  integrity: {
    duplicate_codes: duplicateCodes,
    image_questions: imageQuestions,
    annulled_questions: annulledQuestions,
    github_receipts: githubReceipts,
    publication_dates: publicationDates,
  },
  public_comparison: publicComparison,
  content_differences: contentDifferences,
  publication_issues: publicationIssues,
  contradiction_issues: contradictionIssues,
  current_questions: currentQuestions,
};

await fs.writeFile(path.join(ARTIFACT_DIR, 'auditoria.json'), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(ARTIFACT_DIR, 'resumo.json'), `${JSON.stringify({
  material: report.material,
  counts: report.counts,
  sequence: report.sequence,
  integrity: report.integrity,
  public_comparison: report.public_comparison,
  divergent_items: contentDifferences.map(item => item.number),
  publication_issue_items: publicationIssues.map(item => item.number),
  contradiction_items: contradictionIssues.map(item => item.number),
}, null, 2)}\n`);

console.log(`AUDIT_RESULT=${JSON.stringify({
  notion_rows: rows.length,
  main_questions: localQuestions.length,
  content_difference_records: contentDifferences.length,
  publication_issue_records: publicationIssues.length,
  contradiction_records: contradictionIssues.length,
  image_questions: imageQuestions,
  annulled_questions: annulledQuestions,
  github_receipts: githubReceipts.length,
  publication_dates: publicationDates,
  public_equal_to_main: publicComparison.raw_equal_to_main,
  public_release: publicComparison.catalog_release_version,
})}`);
console.log(`AUDIT_DIVERGENT_ITEMS=${JSON.stringify(contentDifferences.map(item => item.number))}`);
console.log(`AUDIT_PUBLICATION_ISSUES=${JSON.stringify(publicationIssues.map(item => item.number))}`);
console.log(`AUDIT_CONTRADICTIONS=${JSON.stringify(contradictionIssues.map(item => item.number))}`);
console.log(`AUDIT_ARTIFACT=${path.relative(root, ARTIFACT_DIR)}`);
