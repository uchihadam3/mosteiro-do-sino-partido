import { test, expect, type Page } from '@playwright/test';
import { prepare, probe, chooseTempos, expectNoSpoilers } from './helpers';

/** Drives the encounter through the real UI (clicks only, no engine shortcuts) until `untilCycle` starts or it resolves. */
async function playEncounter(page: Page, untilCycle: number) {
  const seen = new Set<string>();
  for (let step = 0; step < 200; step++) {
    const st = await probe(page);
    if (!st || st.result || (st.cycle >= untilCycle && st.phase === 'tempo')) return { st, seen };
    if (st.pending) {
      seen.add(st.pending);
      const prim = page.locator('.prompt .btn.primary').first();
      const btn = (await prim.count()) ? prim : page.locator('.prompt .opt, .hint-chip .g-pill').first();
      if (!(await btn.count())) {
        await page.waitForTimeout(400);
        continue;
      }
      await btn.click();
      await page.waitForTimeout(500);
      continue;
    }
    if (st.phase === 'tempo') {
      if (await page.locator('.g-tempo-btn, .g-tempo-sum').count()) await chooseTempos(page);
      await page.waitForTimeout(500);
      continue;
    }
    if (st.phase === 'heroBand') {
      const card = page.locator('.g-port.can').first();
      if (await card.count()) await card.click();
      await page.waitForTimeout(400);
      continue;
    }
    if (st.phase === 'heroActing') {
      seen.add('heroActing');
      let acted = false;
      // new flow: tap a glowing enemy → forecast card → "Atacar"
      const enemyIds: string[] = await page.evaluate(() => (window as any).__session.state.combat.figures.filter((f: any) => f.side === 'E' && f.status === 'active').map((f: any) => f.id));
      for (const id of enemyIds) {
        const p = await page.evaluate((i) => (window as any).__diorama.screenOf(i), id);
        if (!p) continue;
        await page.mouse.click(p.x, p.y + 25);
        await page.waitForTimeout(500);
        if (await page.locator('.g-forecast').count()) {
          seen.add('forecast');
          await page.locator('.g-fc-go').click();
          await page.waitForTimeout(500);
          acted = true;
          break;
        }
      }
      const atk = page.locator('.g-act.k-attack:not(.off)').first();
      if (!acted && (await atk.count())) {
        await atk.click();
        const ids: string[] = await page.evaluate(() => (window as any).__session.state.combat.figures.filter((f: any) => f.side === 'E' && f.status === 'active').map((f: any) => f.id));
        for (const id of ids) {
          const p = await page.evaluate((i) => (window as any).__diorama.screenOf(i), id);
          if (!p) continue;
          await page.mouse.click(p.x, p.y + 40);
          await page.waitForTimeout(400);
          const st2 = await probe(page);
          if (st2?.pending || (await page.locator('.g-target').count()) === 0) {
            acted = true;
            break;
          }
        }
        if (!acted) await page.locator('.g-target .g-x').click().catch(() => {});
      }
      if (!acted) await page.locator('.g-act.end').click();
      await page.waitForTimeout(500);
      continue;
    }
    await page.waitForTimeout(400);
  }
  return { st: await probe(page), seen };
}

// A full encounter to victory is covered headlessly (packages/content/test). Here we prove every UI stage of a Cycle works:
// Tempo → hero activation → attack → post-roll decision → enemy band → defense prompt → next Cycle.
test('Galeria encounter: a full Cycle is playable through the UI', async ({ page }) => {
  const errors = await prepare(page);
  await page.goto('/?debug=combat&enc=GAL-E01&party=guerreiro,clerigo&seed=e2e-gal');
  await page.getByRole('button', { name: /Começar combate/ }).click({ timeout: 60_000 });
  const { st, seen } = await playEncounter(page, 2);
  expect(seen.has('heroActing')).toBe(true);
  expect(seen.has('attackPost')).toBe(true);
  expect(seen.has('defense')).toBe(true);
  expect(st?.result ?? st?.cycle).toBeTruthy();
  if (st && !st.result) {
    expect(st.cycle).toBe(2);
    await expect(page.locator('.g-tempo-btn, .g-tempo-sum').first()).toBeVisible();
  }
  await expectNoSpoilers(page);
  expect(errors).toEqual([]);
});
