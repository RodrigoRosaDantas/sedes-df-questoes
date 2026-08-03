import fs from 'node:fs';
import {test, expect} from '@playwright/test';

const plan = JSON.parse(fs.readFileSync('data/notion/publication-additions/crefito17-agentefiscal-62-plan.json', 'utf8'));
const expectedCodes = plan.lots?.[0]?.codes || [];
const blockedCode = 'PROVA-QDX-CREFITO17-2026-AGENTE-FISCAL-401-046';

test('publica somente as 62 questões inéditas do Agente Fiscal e preserva o item 46 bloqueado', async ({page}) => {
  expect(expectedCodes).toHaveLength(62);
  expect(expectedCodes).not.toContain(blockedCode);

  await page.goto('/#/inicio', {waitUntil: 'domcontentloaded'});
  await expect(page.locator('[data-release-health]')).toBeVisible({timeout: 30000});

  const result = await page.evaluate(async ({codes, blocked}) => {
    const response = await fetch(`data/release/catalogo.json?publication=${Date.now()}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`Catálogo: HTTP ${response.status}`);
    const catalog = await response.json();
    const found = new Map(codes.map(code => [code, 0]));
    let blockedOccurrences = 0;
    let targetMaterial = '';
    let targetMaterialQuestions = 0;

    for (const metadata of catalog.materials || []) {
      const file = String(metadata.file || '').replace(/^\.\//, '');
      const materialResponse = await fetch(`${file}?publication=${Date.now()}`, {cache: 'no-store'});
      if (!materialResponse.ok) throw new Error(`${file}: HTTP ${materialResponse.status}`);
      const material = await materialResponse.json();
      for (const question of material.questoes || []) {
        if (found.has(question.codigo)) {
          found.set(question.codigo, found.get(question.codigo) + 1);
          targetMaterial = material.nome;
          targetMaterialQuestions = Number(material.quantidade_questoes || material.questoes?.length || 0);
        }
        if (question.codigo === blocked) blockedOccurrences += 1;
      }
    }

    return {
      questions: Number(catalog.summary?.questoes),
      materials: Number(catalog.summary?.materiais),
      targetMaterial,
      targetMaterialQuestions,
      occurrences: Object.fromEntries(found),
      blockedOccurrences,
    };
  }, {codes: expectedCodes, blocked: blockedCode});

  expect(result.questions).toBe(2801);
  expect(result.materials).toBeGreaterThanOrEqual(67);
  expect(result.targetMaterial).toContain('Agente Fiscal');
  expect(result.targetMaterial).toContain('CREFITO-17');
  expect(result.targetMaterialQuestions).toBe(119);
  for (const code of expectedCodes) expect(result.occurrences[code], code).toBe(1);
  expect(result.blockedOccurrences).toBe(0);
});
