import { test, expect, devices } from '@playwright/test';

/**
 * A brand-new player on a phone held upright, tutorial ON: preparation → the world (walk lesson) → the door →
 * the first battle's coach. Every lesson must appear in order and the coach must never be skipped by accident.
 */
test.use({ ...devices['Pixel 7'], viewport: { width: 384, height: 832 }, deviceScaleFactor: 1 });

test('new player: the mentor teaches walking, the door and the first battle', async ({ page }) => {
  test.setTimeout(420_000);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mosteiro.settings.v1', JSON.stringify({ muted: true, quality: 'low', animSpeed: 3, reducedMotion: true }));
    } catch {
      /* ignore */
    }
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const coach = page.locator('.tut-bubble p');

  await page.goto('/?splash=0&cine=0');
  await page.getByRole('button', { name: /Novo Jogo/ }).tap();
  for (const name of ['Guerreiro', 'Clérigo']) await page.locator('.class-card', { hasText: name }).tap();
  await page.getByRole('button', { name: /Preparar a expedição/ }).tap();
  await expect(coach).toContainText('armas e armaduras', { timeout: 30_000 });
  await expect(coach).toContainText('Partir', { timeout: 30_000 });
  await page.getByRole('button', { name: /Partir para o Mosteiro/ }).tap();

  // arrival story, then the walk lesson
  const seguir = page.getByRole('button', { name: /^Seguir$/ });
  await seguir.tap({ timeout: 60_000 });
  await expect(coach).toContainText('Arraste o dedo', { timeout: 60_000 });

  // walk by dragging the thumb (raw touch events)
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 192, y: 600 }] });
  for (let i = 1; i <= 24; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 192, y: 600 - (90 * i) / 24 }] });
    await page.waitForTimeout(250);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(coach).not.toContainText('Arraste o dedo', { timeout: 60_000 });

  // the main path pill stays tappable under the coach and walks to the door, which starts the battle
  await page.locator('.x-track .x-choice').first().tap();
  await expect(coach).toContainText('Começar', { timeout: 120_000 });
  const tut = await page.evaluate(() => JSON.parse(localStorage.getItem('mosteiro.tutorial.v1') ?? '{}'));
  expect(tut.off).toBeFalsy();
  expect(tut.chapters).toContain('first-walk');
  expect(errors).toEqual([]);
});
