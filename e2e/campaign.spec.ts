import { test, expect } from '@playwright/test';
import { prepare, expectNoPageScroll, expectNoSpoilers } from './helpers';

test('new game → preparation → exploration, autosave and continue', async ({ page }) => {
  const errors = await prepare(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Novo Jogo/ }).click();
  for (const name of ['Guerreiro', 'Clérigo', 'Arqueiro']) await page.locator('.class-card', { hasText: name }).click();
  await expect(page.locator('.party-slot.filled')).toHaveCount(3);
  await expectNoPageScroll(page);
  await page.getByRole('button', { name: /Preparar a expedição/ }).click();
  await expect(page.getByRole('heading', { name: 'Preparar a expedição' })).toBeVisible();
  await expectNoPageScroll(page);
  await page.getByRole('button', { name: /Partir para o Mosteiro/ }).click();
  // the arrival text opens as a story sheet first
  await page.getByRole('button', { name: /^Seguir$/ }).click({ timeout: 30_000 });
  await expect(page.locator('.x-choice').first()).toBeVisible({ timeout: 30_000 });
  await expectNoSpoilers(page);
  await expectNoPageScroll(page);

  const before = await page.evaluate(() => (window as any).__session.state.phase);
  expect(before).toBe('explore');
  // Autosave goes to IndexedDB; give it a moment, then reload and continue.
  await page.waitForTimeout(1500);
  await page.reload();
  await page.getByRole('button', { name: /Continuar/ }).click();
  await expect(page.locator('.x-choice').first()).toBeVisible({ timeout: 30_000 });
  const after = await page.evaluate(() => {
    const s = (window as any).__session.state;
    return { phase: s.phase, heroes: s.heroes.map((h: any) => h.classId) };
  });
  expect(after).toEqual({ phase: 'explore', heroes: ['guerreiro', 'clerigo', 'arqueiro'] });
  expect(errors).toEqual([]);
});
