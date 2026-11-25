import { expect, type Page } from '@playwright/test';

/** Names that must never appear in the DOM before the matching discovery (§61 / anti-spoiler). */
export const SECRET_NAMES = ['Relicário do Primeiro Caminho', 'Cripta das Três Vigílias', 'Relicário Faminto', 'Vigia das Três Vigílias', 'B-SCR-01', 'B-VIG-01'];

/** Fast, silent, low-cost settings so the suite is deterministic on software WebGL. */
export async function prepare(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mosteiro.settings.v1', JSON.stringify({ muted: true, quality: 'low', animSpeed: 3, reducedMotion: true, autoTieBreak: true }));
      // the interactive tutorial blocks taps outside its spotlight: tests drive the game directly
      localStorage.setItem('mosteiro.tutorial.v1', JSON.stringify({ off: true, chapters: [], tips: [] }));
    } catch {
      /* ignore */
    }
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function expectNoPageScroll(page: Page) {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    sh: document.documentElement.scrollHeight,
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  expect(m.sw, 'horizontal page overflow').toBeLessThanOrEqual(m.w + 1);
  expect(m.sh, 'vertical page overflow').toBeLessThanOrEqual(m.h + 1);
}

export async function expectNoSpoilers(page: Page) {
  const text = await page.evaluate(() => document.body.innerText);
  expect(text).not.toContain('???');
  for (const n of SECRET_NAMES) expect(text, `spoiler: ${n}`).not.toContain(n);
}

export type CombatProbe = { phase: string; pending: string | null; result: string | null; cycle: number } | null;
export const probe = (page: Page): Promise<CombatProbe> =>
  page.evaluate(() => {
    const s = (window as any).__session?.state?.combat;
    return s ? { phase: s.phase, pending: s.pending?.kind ?? null, result: s.result ?? null, cycle: s.cycle } : null;
  });

/** Tempo: the HUD walks through the player's heroes one at a time (three big buttons), then "Lutar!". */
export async function chooseTempos(page: Page) {
  for (let i = 0; i < 6; i++) {
    const lutar = page.getByRole('button', { name: /Lutar/ });
    if (await lutar.count()) break;
    await page.locator('.g-tempo-btn.t-tatico').click();
    await page.waitForTimeout(300);
  }
  await page.getByRole('button', { name: /Lutar/ }).click();
}

/** Answer start-of-cycle prompts (e.g. Paladino's free Julgar) until the Tempo choice shows. */
export async function reachTempoPanel(page: Page) {
  for (let i = 0; i < 20; i++) {
    if (await page.locator('.g-tempo-btn, .g-tempo-sum').count()) return;
    const st = await probe(page);
    if (st?.pending) {
      const prim = page.locator('.prompt .btn.primary').first();
      const btn = (await prim.count()) ? prim : page.locator('.prompt .opt').first();
      if (await btn.count()) await btn.click();
    }
    await page.waitForTimeout(500);
  }
  await expect(page.locator('.g-tempo-btn, .g-tempo-sum').first()).toBeVisible();
}
