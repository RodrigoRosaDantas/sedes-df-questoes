import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRelease = path.join(root, 'dist', 'data', 'release');
const trackedRelease = path.join(root, 'data', 'release');

if (!fs.existsSync(path.join(distRelease, 'catalogo.json'))) {
  throw new Error('O pacote dist validado não contém data/release/catalogo.json.');
}

fs.rmSync(trackedRelease, {recursive: true, force: true});
fs.mkdirSync(path.dirname(trackedRelease), {recursive: true});
fs.cpSync(distRelease, trackedRelease, {recursive: true});
console.log('✓ Catálogo e materiais validados do dist preparados para o fechamento da rastreabilidade.');

await import('./mark-notion-published.mjs');
