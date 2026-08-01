import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resolve = relative => path.resolve(root, String(relative).replace(/^\.\//, ''));
const overridesPath = resolve('data/operations/visual-overrides.json');
const catalogPath = resolve('data/release/catalogo.json');
const manifestPath = resolve('data/release/manifest.json');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

if (!fs.existsSync(overridesPath)) {
  console.log('✓ Nenhuma substituição visual registrada.');
  process.exit(0);
}

const registry = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const overrides = Array.isArray(registry.overrides) ? registry.overrides : [];
const byCode = new Map();

for (const override of overrides) {
  const code = String(override.code || '').trim();
  const removeImage = override.remove_image === true;
  const image = String(override.image || '').trim();
  const description = String(override.description || '').trim();
  if (!code) throw new Error('Substituição visual incompleta: código é obrigatório.');
  if (removeImage) {
    if (image || description) throw new Error(`${code}: remoção de imagem não pode declarar arquivo ou descrição visual.`);
  } else {
    if (!image || !description) {
      throw new Error(`${code}: código, imagem e descrição são obrigatórios para adicionar recurso visual.`);
    }
    if (!fs.existsSync(resolve(image))) throw new Error(`${code}: arquivo visual não encontrado em ${image}.`);
  }
  if (byCode.has(code)) throw new Error(`Substituição visual duplicada: ${code}.`);
  byCode.set(code, {...override, code, remove_image: removeImage, image, description, matches: 0});
}

let changedMaterials = 0;
for (const metadata of catalog.materials || []) {
  const materialPath = resolve(metadata.file);
  const material = JSON.parse(fs.readFileSync(materialPath, 'utf8'));
  let changed = false;

  for (const question of material.questoes || []) {
    const override = byCode.get(question.codigo) || byCode.get(question.codigo_fonte);
    if (!override) continue;
    if (override.remove_image) {
      question.possui_imagem = false;
      question.descricao_imagem = '';
      delete question.imagem;
    } else {
      question.possui_imagem = true;
      question.descricao_imagem = override.description;
      question.imagem = override.image;
    }
    override.matches += 1;
    changed = true;
  }

  if (!changed) continue;
  const content = `${JSON.stringify(material)}\n`;
  fs.writeFileSync(materialPath, content);
  const manifestEntry = (manifest.materials || []).find(item => item.id === metadata.id);
  if (!manifestEntry) throw new Error(`Material ${metadata.id} ausente do manifesto.`);
  manifestEntry.bytes = Buffer.byteLength(content);
  manifestEntry.sha256 = sha256(content);
  changedMaterials += 1;
}

for (const override of byCode.values()) {
  if (override.matches > 1) {
    throw new Error(`${override.code}: substituição visual aplicada ${override.matches} vezes; esperado no máximo uma.`);
  }
  if (override.matches === 0) {
    console.log(`ℹ ${override.code}: registro não está na release atual; substituição preservada para execução futura.`);
  }
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`✓ Substituições visuais aplicadas em ${changedMaterials} material(is).`);
