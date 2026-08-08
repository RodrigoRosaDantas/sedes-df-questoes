import {test, expect} from '@playwright/test';

const expectedCodes = Array.from({length: 50}, (_, index) => `PROVA-QDX-SEEDF-2025-BIOMED-A-${String(index + 71).padStart(3, '0')}`);

test('publica somente as 50 questões autorizadas de Direito, Biologia e Biomedicina', async ({page}) => {
  await page.goto('/#/inicio', {waitUntil: 'domcontentloaded'});
  await expect(page.locator('[data-ux15-home]')).toBeVisible({timeout: 30000});
  const result = await page.evaluate(async codes => {
    const response = await fetch(`data/release/catalogo.json?publication=${Date.now()}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`Catálogo: HTTP ${response.status}`);
    const catalog = await response.json();
    const found = new Map(codes.map(code => [code, 0]));
    let targetMaterial = '';
    for (const metadata of catalog.materials || []) {
      const file = String(metadata.file || '').replace(/^\.\//, '');
      const materialResponse = await fetch(`${file}?publication=${Date.now()}`, {cache: 'no-store'});
      if (!materialResponse.ok) throw new Error(`${file}: HTTP ${materialResponse.status}`);
      const material = await materialResponse.json();
      for (const question of material.questoes || []) {
        if (!found.has(question.codigo)) continue;
        found.set(question.codigo, found.get(question.codigo) + 1);
        targetMaterial = material.nome;
      }
    }
    return {questions: Number(catalog.summary?.questoes), materials: Number(catalog.summary?.materiais), targetMaterial, occurrences: Object.fromEntries(found)};
  }, expectedCodes);
  expect(result.questions).toBeGreaterThanOrEqual(2659);
  expect(result.materials).toBeGreaterThanOrEqual(65);
  expect(result.targetMaterial).toContain('Biomedicina');
  for (const code of expectedCodes) expect(result.occurrences[code], code).toBe(1);
});
