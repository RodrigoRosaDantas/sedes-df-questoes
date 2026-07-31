import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPublicationPlan} from './publication-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.resolve(root, process.env.NOTION_SNAPSHOT_PATH || 'data/notion/published.json');
const planPath = path.resolve(root, process.env.PUBLICATION_PLAN_PATH || 'data/notion/publication-plan.json');

if (!fs.existsSync(snapshotPath)) {
  throw new Error(`Snapshot do Notion não encontrado: ${snapshotPath}`);
}

const plan = buildPublicationPlan(fs.readFileSync(snapshotPath));
fs.mkdirSync(path.dirname(planPath), {recursive: true});
fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);

const summary = plan.lots.length
  ? plan.lots.map(item => `${item.lot}=${item.expected_count}`).join(', ')
  : 'nenhum lote pendente';
console.log(`✓ Plano explícito de publicação criado: ${plan.total_records} registro(s); ${summary}.`);
