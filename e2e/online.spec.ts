import { test, expect, type Browser, type Page } from '@playwright/test';
import { prepare } from './helpers';

const RELAY = 'ws://127.0.0.1:8790';

async function openLobby(browser: Browser, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errors = await prepare(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Jogar Online/ }).click();
  const nameInput = page.locator('.panel', { hasText: 'Seu nome' }).locator('input');
  await nameInput.fill(name);
  await page.locator('details summary').click();
  await page.getByPlaceholder('ws://192.168.0.10:8787').fill(RELAY);
  return { ctx, page, errors };
}

const phase = (p: Page) => p.evaluate(() => (window as any).__session.state?.phase ?? null);

test('online co-op: two players split a 3-hero party, seats are enforced, decisions need both players', async ({ browser }) => {
  const host = await openLobby(browser, 'Ana');
  await host.page.getByRole('button', { name: 'Criar sala' }).click();
  await expect(host.page.locator('.room-code')).toHaveText(/^[A-Z0-9]{6}$/, { timeout: 30_000 });
  const code = (await host.page.locator('.room-code').innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  const guest = await openLobby(browser, 'Beto');
  await guest.page.getByPlaceholder('CÓDIGO').fill(code);
  await guest.page.getByRole('button', { name: 'Entrar' }).click();
  await expect(host.page.getByText('Beto')).toBeVisible();
  await expect(guest.page.getByText('Ana')).toBeVisible();

  // Host recruits two heroes, guest recruits one for themself (2 + 1 split).
  await host.page.locator('.btn.sm', { hasText: 'Guerreiro' }).click();
  await host.page.locator('.btn.sm', { hasText: 'Clérigo' }).click();
  await guest.page.locator('.btn.sm', { hasText: 'Arqueiro' }).click();
  await expect(host.page.getByText('Party (3/5)')).toBeVisible();
  await expect(guest.page.getByText('Party (3/5)')).toBeVisible();

  await host.page.getByRole('button', { name: 'Iniciar campanha' }).click();
  await expect.poll(() => phase(host.page)).toBe('prep');
  await expect.poll(() => phase(guest.page)).toBe('prep');

  const seats = await host.page.evaluate(() => (window as any).__session.state.heroes.map((h: any) => [h.classId, h.seat]));
  expect(seats.filter(([, s]: string[]) => s === 'host').length).toBe(2);
  const guestSeat = seats.find(([c]: string[]) => c === 'arqueiro')[1];
  expect(guestSeat).not.toBe('host');

  // The guest cannot act for a hero owned by the host.
  const denied = await guest.page.evaluate(() => {
    const s = (window as any).__session;
    const hostHero = s.state.heroes.find((h: any) => h.seat === 'host');
    return s.dispatch({ t: 'renameHero', heroId: hostHero.id, name: 'Intruso' });
  });
  expect(denied).toBe('Este herói pertence a outro jogador.');

  // "Partir" is a party decision: one vote is not enough, both are.
  await host.page.getByRole('button', { name: /Partir para o Mosteiro/ }).click();
  await host.page.waitForTimeout(800);
  expect(await phase(host.page)).toBe('prep');
  await guest.page.getByRole('button', { name: /Partir para o Mosteiro/ }).click();
  await expect.poll(() => phase(host.page)).toBe('explore');
  await expect.poll(() => phase(guest.page)).toBe('explore');

  // Both devices hold the same authoritative state.
  const a = await host.page.evaluate(() => JSON.stringify((window as any).__session.state.heroes.map((h: any) => h.id + h.name)));
  const b = await guest.page.evaluate(() => JSON.stringify((window as any).__session.state.heroes.map((h: any) => h.id + h.name)));
  expect(a).toBe(b);

  expect(host.errors).toEqual([]);
  expect(guest.errors).toEqual([]);
  await host.ctx.close();
  await guest.ctx.close();
});
