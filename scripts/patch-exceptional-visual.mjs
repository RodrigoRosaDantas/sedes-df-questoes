import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resolve = relative => path.resolve(root, String(relative).replace(/^\.\//, ''));
const catalogPath = resolve('data/release/catalogo.json');
const manifestPath = resolve('data/release/manifest.json');
const imagePath = './assets/question-images/crtr12-2026-q35-original.jpg';
const targetCode = 'PROVA-QDX-CRTR12-2026-AUXILIAR-ADMINISTRATIVO-200-035';
const targetDescription = 'Tecla Del (Delete), reproduzida graficamente no caderno de prova.';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

if (!fs.existsSync(resolve(imagePath))) {
  throw new Error(`${targetCode}: arquivo visual não encontrado em ${imagePath}.`);
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
let matches = 0;

for (const metadata of catalog.materials || []) {
  const materialPath = resolve(metadata.file);
  const material = JSON.parse(fs.readFileSync(materialPath, 'utf8'));
  const question = (material.questoes || []).find(item =>
    item.codigo === targetCode || item.codigo_fonte === targetCode,
  );
  if (!question) continue;

  question.possui_imagem = true;
  question.descricao_imagem = question.descricao_imagem || targetDescription;
  question.imagem = imagePath;
  const content = `${JSON.stringify(material)}\n`;
  fs.writeFileSync(materialPath, content);

  const manifestEntry = (manifest.materials || []).find(item => item.id === metadata.id);
  if (!manifestEntry) {
    throw new Error(`${targetCode}: material ${metadata.id} ausente do manifesto.`);
  }
  manifestEntry.bytes = Buffer.byteLength(content);
  manifestEntry.sha256 = sha256(content);
  matches += 1;
}

if (matches !== 1) {
  throw new Error(`${targetCode}: esperado exatamente um registro na release; encontrados ${matches}.`);
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`✓ Recurso visual excepcional ligado a ${targetCode}; manifesto recalculado.`);
