import { beforeAll, describe, expect, it } from 'vitest';
import { newCampaign, type CampaignState } from '@mosteiro/core';
import { installContent } from '@mosteiro/content';
import { permission } from '../src/state/permissions';

beforeAll(() => installContent());

function party(): CampaignState {
  return newCampaign({
    seed: 'perm',
    dungeonId: 'd1',
    heroes: [
      { classId: 'guerreiro', name: 'A', seat: 'host' },
      { classId: 'arcanista', name: 'B', seat: 'host' },
      { classId: 'arqueiro', name: 'C', seat: 'p2' },
    ],
    seats: [
      { id: 'host', name: 'Ana' },
      { id: 'p2', name: 'Beto' },
    ],
  });
}
const DENY = expect.stringMatching(/.+/);

describe('online seat permissions', () => {
  it('a player cannot equip, rename or use items for another player’s hero', () => {
    const s = party();
    const [a, , c] = s.heroes;
    expect(permission(s, 'p2', { t: 'renameHero', heroId: a.id, name: 'x' })).toEqual(DENY);
    expect(permission(s, 'p2', { t: 'renameHero', heroId: c.id, name: 'x' })).toBeNull();
    expect(permission(s, 'p2', { t: 'useOutOfCombat', heroId: a.id, uid: 'u', targetId: a.id })).toEqual(DENY);
  });

  it('buying is for your own heroes or the shared Armazém', () => {
    const s = party();
    const [a, , c] = s.heroes;
    expect(permission(s, 'p2', { t: 'buy', itemId: 'x', kind: 'comum', heroId: a.id })).toEqual(DENY);
    expect(permission(s, 'p2', { t: 'buy', itemId: 'x', kind: 'comum', heroId: c.id })).toBeNull();
    expect(permission(s, 'p2', { t: 'buy', itemId: 'x', kind: 'comum', heroId: 'armazem' })).toBeNull();
  });

  it('selling or moving an item requires holding it (or it being in the Armazém)', () => {
    const s = party();
    const [a, , c] = s.heroes;
    const aItem = a.equipment.primary!.uid;
    const cItem = c.equipment.primary!.uid;
    expect(permission(s, 'p2', { t: 'sell', uid: aItem })).toEqual(DENY);
    expect(permission(s, 'p2', { t: 'sell', uid: cItem })).toBeNull();
    expect(permission(s, 'p2', { t: 'transfer', uid: aItem, to: c.id })).toEqual(DENY);
    expect(permission(s, 'p2', { t: 'transfer', uid: cItem, to: a.id })).toBeNull(); // giving to a teammate is fine
    const stored = s.armazem[0];
    if (stored) {
      expect(permission(s, 'p2', { t: 'transfer', uid: stored.uid, to: a.id })).toEqual(DENY);
      expect(permission(s, 'p2', { t: 'transfer', uid: stored.uid, to: c.id })).toBeNull();
    }
  });

  it('loot goes to your heroes or the Armazém; the host can hand it to anyone', () => {
    const s = party();
    const [a, , c] = s.heroes;
    expect(permission(s, 'p2', { t: 'assignLoot', uid: 'l', heroId: a.id })).toEqual(DENY);
    expect(permission(s, 'p2', { t: 'assignLoot', uid: 'l', heroId: c.id })).toBeNull();
    expect(permission(s, 'host', { t: 'assignLoot', uid: 'l', heroId: c.id })).toBeNull();
  });

  it('only the host reassigns heroes to players', () => {
    const s = party();
    expect(permission(s, 'p2', { t: 'assignSeat', heroId: s.heroes[0].id, seat: 'p2' } as never)).toEqual(DENY);
  });
});
