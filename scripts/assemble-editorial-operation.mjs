import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.resolve(root, process.env.EDITORIAL_MANIFEST_PATH || 'data/editorial/editorial-completion-2026-08-01.json');
const outputPath = path.resolve(root, process.env.EDITORIAL_ASSEMBLED_PATH || 'data/editorial/editorial-completion-assembled.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const expected = Number(manifest.expected_records || 0);

if (!Array.isArray(manifest.parts) || !manifest.parts.length) throw new Error('Manifesto editorial sem partes.');
if (!Number.isInteger(expected) || expected < 1) throw new Error('Manifesto editorial sem contagem esperada válida.');

const records = [];
for (const relativePath of manifest.parts) {
  const partPath = path.resolve(root, relativePath);
  const part = JSON.parse(fs.readFileSync(partPath, 'utf8'));
  if (!Array.isArray(part)) throw new Error(`Parte inválida: ${relativePath}`);
  records.push(...part);
}

if (records.length !== expected) throw new Error(`Lote montado com ${records.length} registros; esperado: ${expected}.`);
const codes = new Set(records.map(record => String(record.code || '').trim()));
const ids = new Set(records.map(record => String(record.notion_id || '').trim()));
if (codes.has('') || ids.has('')) throw new Error('Lote montado contém registro sem código ou página.');
if (codes.size !== records.length || ids.size !== records.length) throw new Error('Lote montado contém códigos ou páginas duplicados.');

fs.writeFileSync(outputPath, `${JSON.stringify({...manifest, records}, null, 2)}\n`);
console.log(`✓ Lote editorial montado: ${records.length} registros em ${outputPath}.`);
