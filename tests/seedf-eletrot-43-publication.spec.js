import {test, expect} from '@playwright/test';

const excludedNumbers = new Set([76, 77, 78, 79, 80, 94, 102]);
const expectedCodes = Array.from({length: 50}, (_, index) => index + 71)
  .filter(number => !excludedNumbers.has(number))
  .map(number => `PROVA-QDX-SEEDF-2025-ELETROT-A-${String(number).padStart(3, '0')}`);
const excludedCodes = [...excludedNumbers].map(number => `PROVA-QDX-SEEDF-2025-ELETROT-A-${String(number).padStart(3, '0')}`);

test('publica somente as 50 questões autorizadas de Direito, Biologia, Biomedicina e os 43 itens aptos de Eletrotécnica', async ({page}) => {
  await page.goto('/#/inicio', {waitUntil: 'domcontentloaded'});
  await expect(page.locator('[data-ux15-home]')).toBeVisible({timeout: 30000});
  const result = await page.evaluate(async ({codes, excluded}) => {
    const response = await fetch(`data/release/catalogo.json?publication=${Date.now()}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`Catálogo: HTTP ${response.status}`);
    const catalog = await response.json();
    const found = new Map(codes.map(code => [code, 0]));
    const blocked = new Map(excluded.map(code => [code, 0]));
    let targetMaterial = '';
    for (const metadata of catalog.materials || []) {
      const file = String(metadata.file || '').replace(/^\.\//, '');
      const materialResponse = await fetch(`${file}?publication=${Date.now()}`, {cache: 'no-store'});
      if (!materialResponse.ok) throw new Error(`${file}: HTTP ${materialResponse.status}`);
      const material = await materialResponse.json();
      for (const question of material.questoes || []) {
        if (found.has(question.codigo)) {
          found.set(question.codigo, found.get(question.codigo) + 1);
          targetMaterial = material.nome;
        }
        if (blocked.has(question.codigo)) blocked.set(question.codigo, blocked.get(question.codigo) + 1);
      }
    }
    return {
      questions: Number(catalog.summary?.questoes),
      materials: Number(catalog.summary?.materiais),
      targetMaterial,
      occurrences: Object.fromEntries(found),
      blockedOccurrences: Object.fromEntries(blocked),
    };
  }, {codes: expectedCodes, excluded: excludedCodes});
  expect(result.questions).toBeGreaterThanOrEqual(2702);
  expect(result.materials).toBeGreaterThanOrEqual(66);
  expect(result.targetMaterial).toContain('Eletrotécnica');
  for (const code of expectedCodes) expect(result.occurrences[code], code).toBe(1);
  for (const code of excludedCodes) expect(result.blockedOccurrences[code], code).toBe(0);
});
