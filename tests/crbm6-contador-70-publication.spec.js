import fs from 'node:fs';
import {test, expect} from '@playwright/test';

const planPath = 'data/notion/publication-additions/crbm6-contador-70-plan.json';
const packageAvailable = fs.existsSync(planPath);
const plan = packageAvailable ? JSON.parse(fs.readFileSync(planPath, 'utf8')) : null;
const expectedCodes = plan?.lots?.[0]?.codes || [];
const prefix = 'PROVA-QDX-CRBM6-2026-CONTADOR-402-';
const historicalCodes = Array.from({length: 30}, (_, index) => `${prefix}${String(index + 71).padStart(3, '0')}`);

test('publica somente as 50 questões autorizadas de Direito e, após os lotes cumulativos, preserva 30 e acrescenta 70 questões de Contador', async ({page}) => {
  if (packageAvailable) {
    expect(plan.total_records).toBe(70);
    expect(plan.lots).toHaveLength(1);
    expect(plan.lots[0].lot).toBe('CRBM6-2026-CONTADOR-402-001-070-20260803');
    expect(expectedCodes).toEqual(Array.from({length: 70}, (_, index) => `${prefix}${String(index + 1).padStart(3, '0')}`));
  }

  await page.goto('/#/inicio', {waitUntil: 'domcontentloaded'});
  await expect(page.locator('[data-release-health]')).toBeVisible({timeout: 30000});

  const result = await page.evaluate(async ({newCodes, oldCodes, codePrefix}) => {
    const response = await fetch(`data/release/catalogo.json?publication=${Date.now()}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`Catálogo: HTTP ${response.status}`);
    const catalog = await response.json();
    const trackedCodes = [...newCodes, ...oldCodes];
    const found = new Map(trackedCodes.map(code => [code, 0]));
    let prefixOccurrences = 0;
    let targetMaterial = '';
    let targetMaterialQuestions = 0;

    for (const metadata of catalog.materials || []) {
      const file = String(metadata.file || '').replace(/^\.\//, '');
      const materialResponse = await fetch(`${file}?publication=${Date.now()}`, {cache: 'no-store'});
      if (!materialResponse.ok) throw new Error(`${file}: HTTP ${materialResponse.status}`);
      const material = await materialResponse.json();
      for (const question of material.questoes || []) {
        if (String(question.codigo || '').startsWith(codePrefix)) prefixOccurrences += 1;
        if (found.has(question.codigo)) {
          found.set(question.codigo, found.get(question.codigo) + 1);
          targetMaterial = material.nome;
          targetMaterialQuestions = Number(material.quantidade_questoes || material.questoes?.length || 0);
        }
      }
    }

    return {
      questions: Number(catalog.summary?.questoes),
      materials: Number(catalog.summary?.materiais),
      targetMaterial,
      targetMaterialQuestions,
      prefixOccurrences,
      occurrences: Object.fromEntries(found),
    };
  }, {newCodes: expectedCodes, oldCodes: historicalCodes, codePrefix: prefix});

  if (!packageAvailable) {
    expect(result.questions).toBe(2801);
    expect(result.prefixOccurrences).toBe(30);
    for (const code of historicalCodes) expect(result.occurrences[code], code).toBe(1);
    return;
  }

  expect(result.questions).toBe(2871);
  expect(result.materials).toBeGreaterThanOrEqual(67);
  expect(result.targetMaterial).toContain('Contador');
  expect(result.targetMaterial).toContain('CRBM-6');
  expect(result.targetMaterialQuestions).toBe(100);
  expect(result.prefixOccurrences).toBe(100);
  for (const code of [...expectedCodes, ...historicalCodes]) expect(result.occurrences[code], code).toBe(1);
});
