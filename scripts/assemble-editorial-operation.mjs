import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.resolve(root, process.env.EDITORIAL_MANIFEST_PATH || 'data/editorial/editorial-completion-2026-08-01.json');
const outputPath = path.resolve(root, process.env.EDITORIAL_ASSEMBLED_PATH || 'data/editorial/editorial-completion-assembled.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (!Array.isArray(manifest.parts) || !manifest.parts.length) {
  throw new Error('Manifesto editorial sem partes.');
}

const records = [];
for (const relativePath of manifest.parts) {
  const partPath = path.resolve(root, relativePath);
  const part = JSON.parse(fs.readFileSync(partPath, 'utf8'));
  if (!Array.isArray(part)) throw new Error(`Parte inválida: ${relativePath}`);
  records.push(...part);
}

if (records.length !== 120) throw new Error(`Lote montado com ${records.length} registros; esperado: 120.`);
const codes = new Set(records.map(record => record.code));
const ids = new Set(records.map(record => record.notion_id));
if (codes.size !== records.length || ids.size !== records.length) throw new Error('Lote montado contém códigos ou páginas duplicados.');

fs.writeFileSync(outputPath, `${JSON.stringify({...manifest, records}, null, 2)}\n`);
console.log(`✓ Lote editorial montado: ${records.length} registros em ${outputPath}.`);
