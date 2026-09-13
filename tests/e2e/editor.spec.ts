import { expect, test } from '@playwright/test';

test('inserisce, modifica, duplica, annulla e conserva la formazione', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('player-count')).toContainText('0 giocatori');

  await page.getByTestId('asset-viola-00-nord').click();
  await expect(page.getByTestId('player-count')).toContainText('1 giocatore');

  await page.getByLabel('Nome').fill('Capitano');
  await page.getByRole('button', { name: 'Mostra nome e numero' }).click();
  await page.locator('.tl-inspector').getByRole('button', { name: 'Duplica', exact: true }).click();
  await expect(page.getByTestId('player-count')).toContainText('2 giocatori');

  await page.locator('.tl-canvas-toolbar').getByLabel('Annulla').click();
  await expect(page.getByTestId('player-count')).toContainText('1 giocatore');
  await page.locator('.tl-canvas-toolbar').getByLabel('Ripristina').click();
  await expect(page.getByTestId('player-count')).toContainText('2 giocatori');

  await expect(page.getByText('Salvato', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('player-count')).toContainText('2 giocatori');
});

test('esporta una PNG senza interfaccia', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('asset-bianchi-00-nord').click();
  await page.getByRole('button', { name: 'Esporta', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Esporta composizione' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('download-image').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  expect((await download.createReadStream())?.readable).toBe(true);
});
