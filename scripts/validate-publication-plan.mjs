import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPublicationPlan, validatePublicationPlan} from './publication-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.resolve(root, process.env.NOTION_SNAPSHOT_PATH || 'data/notion/published.json');
const planPath = path.resolve(root, process.env.PUBLICATION_PLAN_PATH || 'data/notion/publication-plan.json');

if (!fs.existsSync(snapshotPath)) throw new Error('Snapshot do Notion não encontrado para validar o plano.');
const snapshotContent = fs.readFileSync(snapshotPath);
const expected = buildPublicationPlan(snapshotContent);

if (!fs.existsSync(planPath)) {
  if (expected.total_records) {
    throw new Error(`Há ${expected.total_records} registro(s) sem rastreabilidade, mas nenhum plano explícito foi criado.`);
  }
  console.log('✓ Nenhum registro aguarda rastreabilidade; plano de publicação ainda não é necessário.');
  process.exit(0);
}

const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
validatePublicationPlan(plan, snapshotContent);
console.log(`✓ Plano validado: ${plan.total_records} registro(s) em ${plan.lots.length} lote(s), com códigos e contagens exatos.`);
