import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(process.env.CRFA_ROOT || scriptRoot);
const TOKEN = process.env.NOTION_TOKEN;
const RELEASE_SHA = process.env.RELEASE_SHA || '';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const operation = JSON.parse(fs.readFileSync(path.join(root, 'data/operations/publish-crfa1-analista-115.json'), 'utf8'));
const prepareReceipt = JSON.parse(fs.readFileSync(path.join(root, 'data/operations/crfa1-analista-115-prepare-receipt.json'), 'utf8'));
const snapshotPath = path.join(root, 'data/notion/publication-additions/crfa1-analista-115.json');
const planPath = path.join(root, 'data/notion/publication-additions/crfa1-analista-115-plan.json');
const snapshotBuffer = fs.readFileSync(snapshotPath);
const planBuffer = fs.readFileSync(planPath);
const snapshot = JSON.parse(snapshotBuffer.toString('utf8'));
const plan = JSON.parse(planBuffer.toString('utf8'));
const packageData = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const clean = value => String(value ?? '').trim();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

if (!TOKEN) throw new Error('NOTION_TOKEN ausente no fechamento CRFa-1.');
if (!/^[0-9a-f]{40}$/i.test(RELEASE_SHA)) throw new Error(`RELEASE_SHA inválido: ${RELEASE_SHA || 'vazio'}.`);
if (operation.authorized !== true || operation.close_notion_only_after_public_verification !== true) throw new Error('Operação não autoriza fechamento pós-deploy.');
if (sha256(snapshotBuffer) !== prepareReceipt.snapshot_sha256 || sha256(planBuffer) !== prepareReceipt.plan_sha256) throw new Error('Snapshot/plano imutáveis divergiram do recibo de preparação.');
if (plan.total_records !== 115 || snapshot.records?.length !== 115) throw new Error('Escopo imutável do fechamento não contém 115 registros.');

const releaseCode = `release-${packageData.version}:${RELEASE_SHA}`;
const publicationDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const distRelease = path.join(root, 'dist/data/release');
const buildInfo = JSON.parse(fs.readFileSync(path.join(distRelease, 'build-info.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(distRelease, 'catalogo.json'), 'utf8'));
if (clean(buildInfo.source_sha) !== RELEASE_SHA || Number(buildInfo.questions) !== 3161) throw new Error('Artefato local validado não corresponde ao commit/total público esperado.');
const publicCodes = new Set();
for (const metadata of catalog.materials || []) {
  const material = JSON.parse(fs.readFileSync(path.resolve(path.join(root, 'dist'), String(metadata.file).replace(/^\.\//, '')), 'utf8'));
  for (const question of material.questoes || []) publicCodes.add(clean(question.codigo));
}
for (const record of snapshot.records) {
  if (!publicCodes.has(clean(record.code))) throw new Error(`${record.code}: ausente do artefato público validado.`);
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
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 400 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 600)}`);
}

const rich = property => {
  if (!property) return '';
  if (property.type === 'title') return (property.title || []).map(item => item.plain_text || '').join('').trim();
  if (property.type === 'rich_text') return (property.rich_text || []).map(item => item.plain_text || '').join('').trim();
  return '';
};
const dateValue = property => property?.type === 'date' ? clean(property.date?.start) : '';
const checkbox = property => property?.type === 'checkbox' && property.checkbox === true;
const richPatch = text => ({rich_text: [{type: 'text', text: {content: text}}]});

function inspectLive(record, page) {
  const p = page.properties || {};
  const code = rich(p['Código']);
  const lot = rich(p['Lote de publicação']);
  const github = rich(p['Código GitHub']);
  const publishedAt = dateValue(p['Data da publicação']);
  if (code !== clean(record.code)) throw new Error(`${record.code}: identidade viva divergiu (${code || 'vazio'}).`);
  if (lot !== clean(record.publication_lot)) throw new Error(`${record.code}: lote vivo divergiu (${lot || 'vazio'}).`);
  if (!checkbox(p['Liberada para exportação'])) throw new Error(`${record.code}: liberação viva foi retirada.`);
  if (github && github !== releaseCode) throw new Error(`${record.code}: recibo GitHub conflitante (${github}).`);
  if (publishedAt && publishedAt !== publicationDate) throw new Error(`${record.code}: data de publicação conflitante (${publishedAt}).`);
  if (Boolean(github) !== Boolean(publishedAt)) throw new Error(`${record.code}: Código GitHub e data estão parcialmente preenchidos.`);
  return {properties: p, alreadyClosed: github === releaseCode && publishedAt === publicationDate};
}

const pending = [];
let alreadyClosed = 0;
for (const record of snapshot.records) {
  const page = await request(`/pages/${record.notion_id}`);
  const state = inspectLive(record, page);
  if (state.alreadyClosed) alreadyClosed += 1;
  else pending.push({record, properties: state.properties});
}

let updated = 0;
for (const {record, properties} of pending) {
  const patch = {
    'Código GitHub': richPatch(releaseCode),
    'Data da publicação': {date: {start: publicationDate}},
  };
  if (properties['Status editorial - registro manual anterior']?.type === 'select') {
    patch['Status editorial - registro manual anterior'] = {select: {name: 'Publicada'}};
  }
  await request(`/pages/${record.notion_id}`, {method: 'PATCH', body: JSON.stringify({properties: patch})});
  updated += 1;
  if (updated % 20 === 0) console.log(`${updated}/${pending.length} registros CRFa-1 fechados no Notion.`);
}

let confirmed = 0;
for (const record of snapshot.records) {
  const page = await request(`/pages/${record.notion_id}`);
  const state = inspectLive(record, page);
  if (!state.alreadyClosed) throw new Error(`${record.code}: fechamento não persistiu.`);
  confirmed += 1;
}
if (confirmed !== 115 || updated + alreadyClosed !== 115) throw new Error('Contagem final do fechamento CRFa-1 divergiu de 115.');
console.log(`✓ Fechamento CRFa-1 concluído por snapshot imutável: ${updated} atualizados, ${alreadyClosed} idempotentes, 115/115 confirmados; ${releaseCode}; data ${publicationDate}. Fórmula Pode publicar não foi reavaliada.`);
