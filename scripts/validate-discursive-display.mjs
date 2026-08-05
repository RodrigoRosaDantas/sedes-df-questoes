import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'release', 'catalogo.json'), 'utf8'));
const expectedCodes = new Set([
  'PROVA-QDX-CRASP-2025-ANACOB-400-DISC-001',
  'PROVA-QDX-CREMAM-2025-ASSADM-200-DISC-001',
]);
const foundCodes = new Set();
let total = 0;

for (const metadata of catalog.materials || []) {
  const material = JSON.parse(fs.readFileSync(path.join(root, metadata.file.replace(/^\.\//, '')), 'utf8'));
  const discursivas = Array.isArray(material.discursivas) ? material.discursivas : [];
  if (Number(metadata.quantidade_discursivas || 0) !== discursivas.length) {
    throw new Error(`${metadata.id}: quantidade de discursivas divergente entre catálogo e material.`);
  }
  for (const item of discursivas) {
    if (!item.codigo || !item.enunciado || !item.orientacao) throw new Error(`${metadata.id}: discursiva incompleta.`);
    if (item.formato_questao !== 'Discursiva' || item.somente_visualizacao !== true || item.pontuada !== false) {
      throw new Error(`${item.codigo}: contrato de somente visualização inválido.`);
    }
    if (item.alternativas || item.gabarito) throw new Error(`${item.codigo}: discursiva não pode conter alternativas ou gabarito automático.`);
    if ((material.questoes || []).some(question => question.codigo === item.codigo)) {
      throw new Error(`${item.codigo}: discursiva foi inserida indevidamente no motor de questões.`);
    }
    if (catalog.question_index?.[item.id]) throw new Error(`${item.codigo}: discursiva foi indexada como questão resolvível.`);
    if (foundCodes.has(item.codigo)) throw new Error(`${item.codigo}: discursiva duplicada.`);
    foundCodes.add(item.codigo);
    total += 1;
  }
}

if (total !== 2 || Number(catalog.summary?.discursivas_consulta || 0) !== 2) {
  throw new Error(`Esperadas 2 discursivas para consulta; encontradas ${total}.`);
}
for (const code of expectedCodes) if (!foundCodes.has(code)) throw new Error(`Discursiva esperada ausente: ${code}.`);

console.log('✓ Duas discursivas disponíveis somente para visualização, fora do motor de resolução e das estatísticas.');
