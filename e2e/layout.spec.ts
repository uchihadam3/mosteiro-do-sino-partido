import { test, expect } from '@playwright/test';
import { prepare, expectNoPageScroll, expectNoSpoilers, reachTempoPanel } from './helpers';

const VIEWPORTS = [
  { name: 'desktop-1080p', width: 1920, height: 1080 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'tablet', width: 1024, height: 768 },
];

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('title screen fits without page scroll', async ({ page }) => {
      const errors = await prepare(page);
      await page.goto('/');
      await expect(page.getByRole('button', { name: /Novo Jogo/ })).toBeVisible();
      await expectNoPageScroll(page);
      await expectNoSpoilers(page);
      expect(errors).toEqual([]);
    });

    test('combat HUD with 5 heroes fits without page scroll', async ({ page }) => {
      const errors = await prepare(page);
      await page.goto('/?debug=combat&enc=GAL-E01&party=guerreiro,paladino,arcanista,clerigo,arqueiro&seed=layout');
      await expect(page.getByRole('button', { name: /Iniciar combate/ })).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: /Iniciar combate/ }).click();
      await expectNoPageScroll(page);
      await reachTempoPanel(page);
      await expectNoPageScroll(page);
      // Every hero card stays inside the viewport.
      const cards = page.locator('.hero-card');
      const n = await cards.count();
      expect(n).toBe(5);
      for (let i = 0; i < n; i++) {
        const b = await cards.nth(i).boundingBox();
        expect(b, `hero card ${i}`).not.toBeNull();
        expect(b!.x).toBeGreaterThanOrEqual(-1);
        expect(b!.x + b!.width).toBeLessThanOrEqual(vp.width + 1);
        expect(b!.y + b!.height).toBeLessThanOrEqual(vp.height + 1);
      }
      await expectNoSpoilers(page);
      expect(errors).toEqual([]);
    });
  });
}
