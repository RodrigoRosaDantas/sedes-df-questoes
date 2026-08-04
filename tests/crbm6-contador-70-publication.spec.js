import fs from 'node:fs';
import {test, expect} from '@playwright/test';

const planPath = 'data/notion/publication-additions/crbm6-contador-70-plan.json';
const packageAvailable = fs.existsSync(planPath);
const plan = packageAvailable ? JSON.parse(fs.readFileSync(planPath, 'utf8')) : null;
const prefix = 'PROVA-QDX-CRBM6-2026-CONTADOR-402-';
const authorizedCodes = Array.from({length: 70}, (_, index) => `${prefix}${String(index + 1).padStart(3, '0')}`);
const historicalCodes = Array.from({length: 30}, (_, index) => `${prefix}${String(index + 71).padStart(3, '0')}`);
const fullExamCodes = [...authorizedCodes, ...historicalCodes];

test('preserva o que já está público e completa as 100 questões de Contador sem duplicação', async ({page}) => {
  if (packageAvailable) {
    expect(plan.total_records).toBe(70);
    expect(plan.lots).toHaveLength(1);
    expect(plan.lots[0].lot).toBe('CRBM6-2026-CONTADOR-402-001-070-20260803');
    expect(plan.lots[0].codes).toEqual(authorizedCodes);
  }

  await page.goto('/#/inicio', {waitUntil: 'domcontentloaded'});
  await expect(page.locator('[data-release-health]')).toBeVisible({timeout: 30000});

  const result = await page.evaluate(async ({trackedCodes, codePrefix}) => {
    const response = await fetch(`data/release/catalogo.json?publication=${Date.now()}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`Catálogo: HTTP ${response.status}`);
    const catalog = await response.json();
    const found = new Map(trackedCodes.map(code => [code, 0]));
    const prefixCodes = [];
    let targetMaterial = '';
    let targetMaterialQuestions = 0;

    for (const metadata of catalog.materials || []) {
      const file = String(metadata.file || '').replace(/^\.\//, '');
      const materialResponse = await fetch(`${file}?publication=${Date.now()}`, {cache: 'no-store'});
      if (!materialResponse.ok) throw new Error(`${file}: HTTP ${materialResponse.status}`);
      const material = await materialResponse.json();
      for (const question of material.questoes || []) {
        const code = String(question.codigo || '');
        if (code.startsWith(codePrefix)) prefixCodes.push(code);
        if (found.has(code)) {
          found.set(code, found.get(code) + 1);
          targetMaterial = material.nome;
          targetMaterialQuestions = Number(material.quantidade_questoes || material.questoes?.length || 0);
        }
      }
    }

    prefixCodes.sort((left, right) => left.localeCompare(right, 'pt-BR'));
    return {
      questions: Number(catalog.summary?.questoes),
      materials: Number(catalog.summary?.materiais),
      targetMaterial,
      targetMaterialQuestions,
      prefixCodes,
      occurrences: Object.fromEntries(found),
    };
  }, {trackedCodes: fullExamCodes, codePrefix: prefix});

  if (!packageAvailable) {
    expect([2535, 2801]).toContain(result.questions);
    for (const code of historicalCodes) expect(result.occurrences[code], code).toBe(1);
    expect(new Set(result.prefixCodes).size).toBe(result.prefixCodes.length);

    if (result.questions === 2535) {
      expect(result.prefixCodes.length).toBeGreaterThanOrEqual(30);
      expect(result.prefixCodes.length).toBeLessThanOrEqual(50);
      console.log(`Contador na base canônica: ${result.prefixCodes.join(', ')}`);
      return;
    }

    expect(result.prefixCodes).toHaveLength(50);
    const alreadyPublicAuthorized = authorizedCodes.filter(code => result.occurrences[code] === 1);
    expect(alreadyPublicAuthorized).toHaveLength(20);
    console.log(`Contador antes da reconciliação cumulativa: ${result.prefixCodes.join(', ')}`);
    return;
  }

  expect(result.questions).toBe(2851);
  expect(result.materials).toBeGreaterThanOrEqual(67);
  expect(result.targetMaterial).toContain('Contador');
  expect(result.targetMaterial).toContain('CRBM-6');
  expect(result.targetMaterialQuestions).toBe(100);
  expect(result.prefixCodes).toEqual(fullExamCodes);
  for (const code of fullExamCodes) expect(result.occurrences[code], code).toBe(1);
});
