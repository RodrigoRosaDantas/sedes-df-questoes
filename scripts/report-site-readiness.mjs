import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://rodrigorosadantas.github.io/sedes-df-questoes';
const OUTPUT = process.env.READINESS_REPORT || path.join(root, 'artifacts', 'site-readiness-report.json');
if (!TOKEN) throw new Error('NOTION_TOKEN ausente.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const normalized = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

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
  if (response.ok) return response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 7) {
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 500 * 2 ** (attempt - 1)));
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

async function readAll() {
  const rows = [];
  let cursor;
  do {
    const body = {page_size: 100};
    if (cursor) body.start_cursor = cursor;
    const page = await request(`/data_sources/${SOURCE}/query`, {method: 'POST', body: JSON.stringify(body)});
    for (const item of page.results || []) {
      const properties = Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)]));
      rows.push({
        notion_id: item.id,
        notion_url: item.url,
        notion_last_edited_time: item.last_edited_time,
        ...properties,
      });
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

const first = (row, names) => {
  for (const name of names) if (row[name] !== undefined && row[name] !== null) return row[name];
  return null;
};
const yes = value => value === true || value === '__YES__';

function liveRecord(row) {
  const alternatives = ['A', 'B', 'C', 'D', 'E'].map(letter => clean(row[`Alternativa ${letter}`]));
  const answer = clean(row['Gabarito']);
  const declared = clean(row['Formato da questão']);
  const trueFalse = alternatives.every(item => !item) || /certo\s*\/\s*errado/i.test(declared) || ['Certo', 'Errado'].includes(answer);
  return {
    notion_id: row.notion_id,
    notion_url: row.notion_url,
    notion_last_edited_time: row.notion_last_edited_time,
    code: clean(row['Código']),
    github_id: clean(row['Código GitHub']),
    title: clean(row['Questão']),
    material_name: clean(row['Nome do material']),
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
    format: trueFalse ? 'Certo / Errado' : declared || 'Múltipla escolha A–E',
    original_number: Number(row['Número original']) || null,
    text_base: clean(row['Texto-base']),
    prompt: clean(row['Enunciado']),
    alternatives: trueFalse ? {Certo: 'Certo', Errado: 'Errado'} : {
      A: alternatives[0], B: alternatives[1], C: alternatives[2], D: alternatives[3], E: alternatives[4],
    },
    answer,
    comment: clean(row['Comentário geral']),
    alternative_comments: {
      A: clean(row['Comentário A']), B: clean(row['Comentário B']), C: clean(row['Comentário C']), D: clean(row['Comentário D']), E: clean(row['Comentário E']),
    },
    foundation: clean(row['Fundamento legal']),
    trap: clean(row['Pegadinha']),
    observations: clean(row['Observações']),
    annulled: yes(row['Anulada']),
    has_image: yes(row['Possui imagem']),
    image_description: clean(row['Descrição da imagem']),
    pdf_page: clean(row['Página do PDF']),
    publication_lot: clean(row['Lote de publicação']),
    released_for_export: yes(row['Liberada para exportação']),
  };
}

function comparable(record) {
  const copy = {...record};
  delete copy.notion_id;
  delete copy.notion_url;
  delete copy.notion_last_edited_time;
  return copy;
}

function summarizeRows(rows) {
  const result = {};
  for (const row of rows) {
    const material = clean(row['Nome do material']) || '(sem material)';
    const lot = clean(row['Lote de publicação']) || '(sem lote)';
    const key = `${material}|||${lot}`;
    if (!result[key]) result[key] = {material, lot, count: 0, codes: []};
    result[key].count += 1;
    result[key].codes.push(clean(row['Código']));
  }
  return Object.values(result)
    .map(item => ({...item, codes: item.codes.sort()}))
    .sort((a, b) => a.material.localeCompare(b.material, 'pt-BR') || a.lot.localeCompare(b.lot, 'pt-BR'));
}

const rows = await readAll();
const snapshot = JSON.parse(await fs.readFile(path.join(root, 'data', 'notion', 'published.json'), 'utf8'));
const snapshotByCode = new Map((snapshot.records || []).map(record => [clean(record.code), record]));

const prepared = rows.map(row => {
  const code = clean(row['Código']);
  const github = clean(row['Código GitHub']);
  const publicationDate = clean(first(row, ['Data da publicação']));
  const lot = clean(row['Lote de publicação']);
  const canPublish = yes(row['Pode publicar']);
  const released = yes(row['Liberada para exportação']);
  const blocked = yes(row['Bloqueio manual de publicação']);
  const audit = clean(row['Auditoria de conteúdo']);
  const manualStatus = clean(first(row, ['Status editorial — registro manual anterior', 'Status editorial - registro manual anterior']));
  return {row, code, github, publicationDate, lot, canPublish, released, blocked, audit, manualStatus};
});

const newReady = prepared.filter(item => item.canPublish && item.released && item.lot && !item.github && !item.publicationDate && !item.blocked);
const releasedInconsistent = prepared.filter(item => item.released && !(item.canPublish && item.lot && !item.github && !item.publicationDate && !item.blocked));
const editorialCandidates = prepared.filter(item => item.canPublish && !item.released && !item.github && !item.publicationDate && !item.blocked);
const exportedNotPublished = prepared.filter(item => item.github && !item.publicationDate);
const published = prepared.filter(item => item.github && item.publicationDate);
const blocked = prepared.filter(item => item.blocked || normalized(item.audit) === 'nao aprovada');
const pendingAudit = prepared.filter(item => normalized(item.audit) === 'pendente');

const changedPublished = [];
for (const item of published) {
  const previous = snapshotByCode.get(item.code);
  if (!previous) {
    changedPublished.push({...item, difference: 'ausente_no_snapshot_main'});
    continue;
  }
  const live = liveRecord(item.row);
  if (JSON.stringify(comparable(live)) !== JSON.stringify(comparable(previous))) {
    const fields = [];
    for (const key of Object.keys(comparable(live))) {
      if (JSON.stringify(comparable(live)[key]) !== JSON.stringify(comparable(previous)[key])) fields.push(key);
    }
    changedPublished.push({...item, difference: fields});
  }
}

let publicBuildInfo = null;
let publicBuildError = null;
try {
  const response = await fetch(`${PUBLIC_BASE_URL}/data/release/build-info.json?readiness=${Date.now()}`, {headers: {'cache-control': 'no-cache, no-store'}});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  publicBuildInfo = await response.json();
} catch (error) {
  publicBuildError = String(error.message || error);
}

let mainSha = null;
try {
  execFileSync('git', ['fetch', 'origin', 'main'], {cwd: root, stdio: 'ignore'});
  mainSha = execFileSync('git', ['rev-parse', 'origin/main'], {cwd: root, encoding: 'utf8'}).trim();
} catch {}

const report = {
  generated_at: new Date().toISOString(),
  source: {
    data_source_id: SOURCE,
    total_rows: rows.length,
    main_snapshot_generated_at: snapshot.generated_at || null,
    main_snapshot_published: snapshot.totals?.published ?? (snapshot.records || []).length,
  },
  site: {
    public_base_url: PUBLIC_BASE_URL,
    public_build_info: publicBuildInfo,
    public_build_error: publicBuildError,
    main_sha: mainSha,
    site_matches_main: Boolean(mainSha && publicBuildInfo?.source_sha === mainSha),
  },
  counts: {
    new_ready_for_site: newReady.length,
    published_updates_pending_sync: changedPublished.length,
    editorial_candidates_not_released: editorialCandidates.length,
    released_inconsistent: releasedInconsistent.length,
    exported_without_publication_date: exportedNotPublished.length,
    already_published: published.length,
    blocked: blocked.length,
    pending_audit: pendingAudit.length,
  },
  new_ready_for_site: summarizeRows(newReady.map(item => item.row)),
  published_updates_pending_sync: summarizeRows(changedPublished.map(item => item.row)),
  published_updates_details: changedPublished.map(item => ({
    code: item.code,
    material: clean(item.row['Nome do material']),
    original_number: Number(item.row['Número original']) || null,
    lot: item.lot,
    github_id: item.github,
    publication_date: item.publicationDate,
    difference: item.difference,
    notion_url: item.row.notion_url,
  })),
  editorial_candidates_not_released: summarizeRows(editorialCandidates.map(item => item.row)),
  released_inconsistent: releasedInconsistent.map(item => ({
    code: item.code,
    material: clean(item.row['Nome do material']),
    can_publish: item.canPublish,
    released: item.released,
    lot: item.lot,
    github_id: item.github,
    publication_date: item.publicationDate,
    blocked: item.blocked,
    audit: item.audit,
    status: item.manualStatus,
    notion_url: item.row.notion_url,
  })),
  exported_without_publication_date: exportedNotPublished.map(item => ({
    code: item.code,
    material: clean(item.row['Nome do material']),
    github_id: item.github,
    lot: item.lot,
    notion_url: item.row.notion_url,
  })),
  blocked_by_material: summarizeRows(blocked.map(item => item.row)),
  pending_audit_by_material: summarizeRows(pendingAudit.map(item => item.row)),
};

await fs.mkdir(path.dirname(OUTPUT), {recursive: true});
await fs.writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report.counts));
console.log(`site_matches_main=${report.site.site_matches_main}`);
console.log(`report=${OUTPUT}`);
