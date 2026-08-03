import fs from 'node:fs';
import {test, expect} from '@playwright/test';

const config = JSON.parse(fs.readFileSync(new URL('../data/operations/publication-additions.json', import.meta.url), 'utf8'));
const expectedCodes = (config.lots || []).flatMap(lot => Array.from(
  {length: Number(lot.expected_count)},
  (_, index) => `${lot.code_prefix}${String(Number(lot.first_number) + index).padStart(3, '0')}`,
));

test('publica somente os lotes adicionais autorizados', async ({page}) => {
  await page.goto('/#/inicio', {waitUntil: 'domcontentloaded'});
  await expect(page.locator('[data-release-health]')).toBeVisible({timeout: 30000});

  const result = await page.evaluate(async codes => {
    const catalogResponse = await fetch(`data/release/catalogo.json?publication=${Date.now()}`, {cache: 'no-store'});
    if (!catalogResponse.ok) throw new Error(`Catálogo: HTTP ${catalogResponse.status}`);
    const catalog = await catalogResponse.json();
    const found = new Map(codes.map(code => [code, 0]));
    const targetMaterials = new Set();

    for (const metadata of catalog.materials || []) {
      const file = String(metadata.file || '').replace(/^\.\//, '');
      const response = await fetch(`${file}?publication=${Date.now()}`, {cache: 'no-store'});
      if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
      const material = await response.json();
      for (const question of material.questoes || []) {
        if (!found.has(question.codigo)) continue;
        found.set(question.codigo, found.get(question.codigo) + 1);
        targetMaterials.add(material.nome);
      }
    }

    return {
      questions: Number(catalog.summary?.questoes),
      materials: Number(catalog.summary?.materiais),
      targetMaterials: [...targetMaterials],
      occurrences: Object.fromEntries(found),
    };
  }, expectedCodes);

  expect(result.questions).toBe(Number(config.expected_final_questions));
  expect(result.materials).toBeGreaterThanOrEqual(63);
  expect(result.targetMaterials).toHaveLength((config.lots || []).length);
  for (const code of expectedCodes) expect(result.occurrences[code], code).toBe(1);
});
