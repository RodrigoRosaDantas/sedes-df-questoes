import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resolve = relative => path.resolve(root, String(relative).replace(/^\.\//, ''));
const sourcePath = resolve('data/notion/discursive-display.json');

if (!fs.existsSync(sourcePath) || !fs.readFileSync(sourcePath, 'utf8').trim()) {
  console.log('✓ Nenhum pacote de discursivas instalado; release preservada.');
  process.exit(0);
}

const payload = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const catalogPath = resolve('data/release/catalogo.json');
const manifestPath = resolve('data/release/manifest.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const clean = value => String(value ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const key = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slug = value => key(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

const materialMetadataByName = new Map((catalog.materials || []).map(metadata => [key(metadata.nome), metadata]));
const touched = new Map();

function loadMaterial(metadata) {
  if (!touched.has(metadata.id)) {
    touched.set(metadata.id, {
      metadata,
      material: JSON.parse(fs.readFileSync(resolve(metadata.file), 'utf8')),
    });
  }
  return touched.get(metadata.id).material;
}

function displayItem(record) {
  return {
    id: slug(record.code),
    codigo: record.code,
    numero: Number(record.original_number) || 0,
    numero_original: Number(record.original_number) || 0,
    bloco: clean(record.block),
    disciplina: clean(record.discipline),
    assunto: clean(record.subject),
    subassunto: clean(record.subsubject),
    texto_base: clean(record.text_base),
    enunciado: clean(record.prompt),
    orientacao: clean(record.guidance),
    fundamento: clean(record.foundation),
    pegadinha: clean(record.trap),
    observacoes: clean(record.observations),
    dificuldade: clean(record.difficulty),
    pagina_pdf: clean(record.pdf_page),
    fonte_oficial: clean(record.source_url) || record.notion_url,
    notion_url: record.notion_url,
    formato_questao: 'Discursiva',
    somente_visualizacao: true,
    pontuada: false,
  };
}

for (const record of payload.records || []) {
  const metadata = materialMetadataByName.get(key(record.material_name));
  if (!metadata) throw new Error(`${record.code}: material objetivo correspondente não foi localizado: ${record.material_name}.`);
  const material = loadMaterial(metadata);
  material.discursivas = Array.isArray(material.discursivas) ? material.discursivas : [];
  const item = displayItem(record);
  if (!item.codigo || !item.enunciado || !item.orientacao) throw new Error(`${record.code}: discursiva incompleta após transformação.`);
  const index = material.discursivas.findIndex(current => key(current.codigo) === key(item.codigo));
  if (index >= 0) material.discursivas[index] = item;
  else material.discursivas.push(item);
}

let total = 0;
for (const {metadata, material} of touched.values()) {
  material.discursivas.sort((left, right) => Number(left.numero) - Number(right.numero) || left.codigo.localeCompare(right.codigo));
  material.quantidade_discursivas = material.discursivas.length;
  metadata.quantidade_discursivas = material.quantidade_discursivas;
  total += material.discursivas.length;
  fs.writeFileSync(resolve(metadata.file), `${JSON.stringify(material)}\n`);
}

if (total !== Number(payload.total)) throw new Error(`Total aplicado de discursivas divergente: ${total} de ${payload.total}.`);
catalog.summary = {...(catalog.summary || {}), discursivas_consulta: total};
const catalogContent = `${JSON.stringify(catalog, null, 2)}\n`;
fs.writeFileSync(catalogPath, catalogContent);

manifest.summary = {...(manifest.summary || {}), discursivas_consulta: total};
manifest.catalog_sha256 = sha256(catalogContent);
manifest.materials = (manifest.materials || []).map(entry => {
  const metadata = (catalog.materials || []).find(item => item.id === entry.id);
  if (!metadata) return entry;
  const content = fs.readFileSync(resolve(metadata.file));
  return {
    ...entry,
    questions: Number(metadata.quantidade_questoes) || entry.questions,
    display_items: Number(metadata.quantidade_discursivas) || 0,
    bytes: content.length,
    sha256: sha256(content),
  };
});
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`✓ Discursivas aplicadas somente para visualização: ${total} em ${touched.size} materiais.`);
