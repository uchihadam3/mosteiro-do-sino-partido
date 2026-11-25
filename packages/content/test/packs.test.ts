import { describe, expect, it } from 'vitest';
import { CLASS_HANDLERS } from '../src/characters/classes';
import { TALENT_HANDLERS } from '../src/characters/talents';
import { DUNGEON_PACKS } from '../src';

describe('dungeon packs', () => {
  it('pack handlers never collide with class or talent handlers', () => {
    const shared = new Set([...Object.keys(CLASS_HANDLERS), ...Object.keys(TALENT_HANDLERS)]);
    for (const p of DUNGEON_PACKS) for (const k of [...Object.keys(p.enemyHandlers), ...Object.keys(p.itemHandlers)]) expect(shared.has(k), k).toBe(false);
  });
  it('every dungeon has unique enemy and item ids and loot that exists', () => {
    const enemies = DUNGEON_PACKS.flatMap((p) => p.enemies.map((e) => e.id));
    const items = DUNGEON_PACKS.flatMap((p) => p.items.map((i) => i.id));
    expect(new Set(enemies).size).toBe(enemies.length);
    expect(new Set(items).size).toBe(items.length);
    for (const p of DUNGEON_PACKS) for (const id of [...p.loot.comum, ...p.loot.raro, ...p.loot.consumivel]) expect(items, id).toContain(id);
  });
  it('map links join real locations', () => {
    for (const p of DUNGEON_PACKS) for (const [a, b] of p.def.links ?? []) {
      expect(p.def.locations.some((l) => l.id === a), a).toBe(true);
      expect(p.def.locations.some((l) => l.id === b), b).toBe(true);
    }
  });
});
