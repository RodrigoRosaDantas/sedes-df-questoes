import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const normalizeRootPath = value => String(value || '').replace(/^\.\//, '').replace(/^\//, '');
const resolveFromRoot = value => path.resolve(root, normalizeRootPath(value));
const catalogPath = resolveFromRoot('data/release/catalogo.json');
const outputPath = resolveFromRoot(process.env.VISUAL_AUDIT_PATH || 'data/operations/exceptional-visual-audit.json');

const report = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  catalog_available: fs.existsSync(catalogPath),
  materials_scanned: 0,
  questions_scanned: 0,
  visual_questions: 0,
  incomplete_visuals: 0,
  issues: [],
};

if (report.catalog_available) {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  for (const metadata of catalog.materials || []) {
    const materialPath = resolveFromRoot(metadata.file);
    if (!fs.existsSync(materialPath)) {
      report.issues.push({
        code: null,
        material_id: metadata.id || null,
        material_file: metadata.file || null,
        reasons: ['arquivo_do_material_ausente'],
      });
      continue;
    }

    const material = JSON.parse(fs.readFileSync(materialPath, 'utf8'));
    report.materials_scanned += 1;

    for (const question of material.questoes || []) {
      report.questions_scanned += 1;
      if (question.possui_imagem !== true) continue;
      report.visual_questions += 1;

      const image = String(question.imagem || '').trim();
      const description = String(question.descricao_imagem || '').trim();
      const reasons = [];
      if (!image) reasons.push('caminho_da_imagem_ausente');
      if (!description) reasons.push('descricao_da_imagem_ausente');
      if (image && !fs.existsSync(resolveFromRoot(image))) reasons.push('arquivo_da_imagem_ausente');
      if (!reasons.length) continue;

      report.issues.push({
        code: question.codigo || question.codigo_fonte || null,
        source_code: question.codigo_fonte || null,
        material_id: metadata.id || material.id || null,
        material_file: metadata.file || null,
        image: image || null,
        description: description || null,
        statement: String(question.enunciado || '').trim() || null,
        reasons,
      });
    }
  }
}

report.issues.sort((left, right) =>
  String(left.code || left.material_id || '').localeCompare(String(right.code || right.material_id || ''), 'pt-BR'),
);
report.incomplete_visuals = report.issues.length;
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`✓ Auditoria visual: ${report.visual_questions} questão(ões) com imagem; ${report.incomplete_visuals} pendência(s) listada(s).`);
