import {test, expect} from '@playwright/test';

const materials = [
  {
    name: 'Analista I — Atendimento e Cobrança — CRA-SP — Quadrix 2025',
    theme: 'A importância da correta atuação dos servidores em suas atividades',
  },
  {
    name: 'Assistente Administrativo — CREMAM — Quadrix 2025',
    theme: 'A importância política e social das redes de atenção à saúde',
  },
];

test('exibe as discursivas somente para consulta e mantém 50 objetivas por prova', async ({page}) => {
  await page.goto('/#/estudar', {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.locator('[data-study-view="provas"]').click();

  for (const material of materials) {
    const search = page.locator('#study-search');
    await search.fill(material.name);
    const card = page.locator('.material-card', {hasText: material.name});
    await expect(card).toBeVisible({timeout: 30000});
    await expect(card.locator('.material-stats')).toContainText('50 questões');
    await card.locator('[data-open-material]').click();

    const display = page.locator('[data-discursive-display]');
    await expect(display).toBeVisible({timeout: 30000});
    await expect(display.locator('.discursive-display-card')).toHaveCount(1);
    await expect(display).toContainText('Somente leitura · não pontuada');
    await expect(display).toContainText(material.theme);
    await expect(display).toContainText('Não entra no cronômetro, no gabarito nem nas estatísticas.');
    await expect(display.locator('input[type="radio"]')).toHaveCount(0);
    await expect(page.locator('[data-discursive-summary]')).toContainText('1');
    await expect(page.locator('.detail-summary')).toContainText('50');

    await page.locator('[data-route="estudar"]').first().click();
    await page.locator('[data-study-view="provas"]').click();
  }
});
