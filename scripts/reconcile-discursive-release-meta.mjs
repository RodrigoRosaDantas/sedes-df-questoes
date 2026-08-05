import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDirectory = path.join(root, 'dist', 'data', 'release');
const catalogPath = path.join(releaseDirectory, 'catalogo.json');
const releaseMetaPath = path.join(releaseDirectory, 'release-meta.json');

if (!fs.existsSync(catalogPath) || !fs.existsSync(releaseMetaPath)) {
  throw new Error('Metadados públicos ausentes para reconciliar as discursivas de consulta.');
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const releaseMeta = JSON.parse(fs.readFileSync(releaseMetaPath, 'utf8'));
const displayItems = Number(catalog.summary?.discursivas_consulta || 0);
const master = Number(releaseMeta.banco_mestre || 0);
const questions = Number(releaseMeta.questions || 0);
const awaiting = master - questions - displayItems;

if (![displayItems, master, questions, awaiting].every(value => Number.isInteger(value) && value >= 0)) {
  throw new Error(`Contrato inválido após separar discursivas: banco=${master}, questões=${questions}, consulta=${displayItems}, auditoria=${awaiting}.`);
}

releaseMeta.discursive_display_items = displayItems;
releaseMeta.awaiting_audit = awaiting;
fs.writeFileSync(releaseMetaPath, `${JSON.stringify(releaseMeta, null, 2)}\n`);
console.log(`✓ Release-meta separa ${questions} questões, ${displayItems} discursivas de consulta e ${awaiting} registros em auditoria.`);
