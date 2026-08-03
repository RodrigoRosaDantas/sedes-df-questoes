import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(root, '.github', 'workflows', 'pages.yml');
const anchor = `      - name: Testar as 50 novas questões no navegador
        run: npx playwright test tests/publication-additions.spec.js`;
const addition = `${anchor}
      - name: Acrescentar somente o lote validado de Biologia
        run: node scripts/apply-seedf-bio-24-addition.mjs
      - name: Testar as 24 novas questões de Biologia no navegador
        run: npx playwright test tests/seedf-bio-24-publication.spec.js`;

const current = fs.readFileSync(workflowPath, 'utf8');
if (current.includes('apply-seedf-bio-24-addition.mjs')) {
  console.log('✓ O pipeline de Biologia já está ativado.');
  process.exit(0);
}
if (!current.includes(anchor)) throw new Error('Ponto seguro de inserção não encontrado em pages.yml.');
const updated = current.replace(anchor, addition);
if ((updated.match(/apply-seedf-bio-24-addition\.mjs/g) || []).length !== 1) {
  throw new Error('A ativação de Biologia não resultou em uma única etapa.');
}
fs.writeFileSync(workflowPath, updated);
console.log('✓ Pipeline de Pages atualizado para aplicar Direito e, depois, Biologia.');
