import {test, expect} from '@playwright/test';

const excludedNumbers = new Set([9, 12, 19]);
const imageNumbers = new Set([6, 7, 8, 17, 18, 20, 25]);
const prefix = 'PROVA-QDX-ALTOPARAISO-GO-2023-ORIENTADOR-SOCIAL-202-';
const expectedCodes = Array.from({length: 40}, (_, index) => index + 1)
  .filter(number => !excludedNumbers.has(number))
  .map(number => `${prefix}${String(number).padStart(3, '0')}`);
const excludedCodes = [...excludedNumbers].map(number => `${prefix}${String(number).padStart(3, '0')}`);

test('publica exatamente as 37 questões válidas de Orientador Social com sete imagens', async ({page}) => {
  await page.goto('/#/inicio', {waitUntil: 'domcontentloaded'});
  await expect(page.locator('[data-release-health]')).toBeVisible({timeout: 30000});
  const result = await page.evaluate(async ({codes, excluded, imageNums}) => {
    const response = await fetch(`data/release/catalogo.json?publication=${Date.now()}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`Catálogo: HTTP ${response.status}`);
    const catalog = await response.json();
    const found = new Map(codes.map(code => [code, 0]));
    const blocked = new Map(excluded.map(code => [code, 0]));
    const images = [];
    let targetMaterial = '';
    let targetCount = 0;
    for (const metadata of catalog.materials || []) {
      const file = String(metadata.file || '').replace(/^\.\//, '');
      const materialResponse = await fetch(`${file}?publication=${Date.now()}`, {cache: 'no-store'});
      if (!materialResponse.ok) throw new Error(`${file}: HTTP ${materialResponse.status}`);
      const material = await materialResponse.json();
      for (const question of material.questoes || []) {
        if (found.has(question.codigo)) {
          found.set(question.codigo, found.get(question.codigo) + 1);
          targetMaterial = material.nome;
          targetCount += 1;
          if (imageNums.includes(Number(question.numero))) images.push(question.imagem || '');
        }
        if (blocked.has(question.codigo)) blocked.set(question.codigo, blocked.get(question.codigo) + 1);
      }
    }
    const imageStatuses = [];
    for (const image of images) {
      const path = String(image).replace(/^\.\//, '');
      const asset = await fetch(`${path}?publication=${Date.now()}`, {cache: 'no-store'});
      imageStatuses.push({path, status: asset.status});
    }
    return {
      questions: Number(catalog.summary?.questoes),
      targetMaterial,
      targetCount,
      occurrences: Object.fromEntries(found),
      blockedOccurrences: Object.fromEntries(blocked),
      imageStatuses,
    };
  }, {codes: expectedCodes, excluded: excludedCodes, imageNums: [...imageNumbers]});

  expect(result.questions).toBe(2739);
  expect(result.targetMaterial).toContain('Orientador Social');
  expect(result.targetCount).toBe(37);
  for (const code of expectedCodes) expect(result.occurrences[code], code).toBe(1);
  for (const code of excludedCodes) expect(result.blockedOccurrences[code], code).toBe(0);
  expect(result.imageStatuses).toHaveLength(7);
  for (const image of result.imageStatuses) {
    expect(image.path).toContain('alto-paraiso-go-2023-orientador-social');
    expect(image.status, image.path).toBe(200);
  }
});
