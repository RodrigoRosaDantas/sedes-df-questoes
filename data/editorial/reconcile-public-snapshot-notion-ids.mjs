import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const catalogPath = path.join(root, 'data', 'release', 'catalogo.json');
const outputPath = path.join(root, 'data', 'editorial', 'notion-trash-classified-20260804-public-codes.json');
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
if (Number(catalog.summary?.questoes) !== 2871) {
  throw new Error(`Catálogo reconstruído contém ${catalog.summary?.questoes} questões; esperado 2871.`);
}
const codes = [];
const duplicates = [];
const seen = new Set();
for (const metadata of catalog.materials || []) {
  const materialPath = path.join(root, String(metadata.file).replace(/^\.\//, ''));
  const material = JSON.parse(await fs.readFile(materialPath, 'utf8'));
  for (const question of material.questoes || []) {
    const code = String(question.codigo || question.codigo_fonte || '').trim();
    if (!code) throw new Error(`${material.id}: questão pública sem código.`);
    if (seen.has(code)) duplicates.push(code);
    seen.add(code);
    codes.push(code);
  }
}
if (codes.length !== 2871 || seen.size !== 2871 || duplicates.length) {
  throw new Error(`Códigos públicos inválidos: total ${codes.length}, únicos ${seen.size}, duplicados ${duplicates.length}.`);
}
const receipt = {
  schema_version: '1.0',
  operation_id: 'NOTION-TRASH-CLASSIFIED-20260804',
  created_at: new Date().toISOString(),
  source: 'catálogo reconstruído pelo pipeline oficial sem deploy',
  questions: codes.length,
  unique_codes: seen.size,
  codes: [...seen].sort((left, right) => left.localeCompare(right, 'pt-BR')),
};
await fs.writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`✓ ${receipt.unique_codes} códigos públicos extraídos do catálogo reconstruído.`);
