import { expect, type Page } from '@playwright/test';

/** Names that must never appear in the DOM before the matching discovery (§61 / anti-spoiler). */
export const SECRET_NAMES = ['Relicário do Primeiro Caminho', 'Cripta das Três Vigílias', 'Relicário Faminto', 'Vigia das Três Vigílias', 'B-SCR-01', 'B-VIG-01'];

/** Fast, silent, low-cost settings so the suite is deterministic on software WebGL. */
export async function prepare(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mosteiro.settings.v1', JSON.stringify({ muted: true, quality: 'low', animSpeed: 3, reducedMotion: true, autoTieBreak: true }));
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

export async function chooseTempos(page: Page) {
  const rows = page.locator('.tp-row');
  const n = await rows.count();
  for (let i = 0; i < n; i++) await rows.nth(i).locator('.tp-btn').nth(1).click();
  await page.getByRole('button', { name: /Confirmar Tempos/ }).click();
}

/** Answer start-of-cycle prompts (e.g. Paladino's free Julgar) until the Tempo panel shows. */
export async function reachTempoPanel(page: Page) {
  for (let i = 0; i < 20; i++) {
    if (await page.locator('.tp-row').count()) return;
    const st = await probe(page);
    if (st?.pending) {
      const prim = page.locator('.prompt .btn.primary').first();
      const btn = (await prim.count()) ? prim : page.locator('.prompt .opt').first();
      if (await btn.count()) await btn.click();
    }
    await page.waitForTimeout(500);
  }
  await expect(page.locator('.tp-row').first()).toBeVisible();
}
