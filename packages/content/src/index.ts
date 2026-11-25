import { UNIVERSAL_ACTIONS, registerDungeon, setLootPools, setRegistry, type DungeonDef, type EnemyDef, type Hooks, type ItemDef, type Registry } from '@mosteiro/core';
import { CLASSES, CLASS_HANDLERS } from './characters/classes';
import { TALENTS, TALENT_HANDLERS, maxTalentTier } from './characters/talents';
import { D1_ENEMIES, ENEMY_HANDLERS } from './enemies/d1';
import { ITEMS, ITEM_HANDLERS, LOOT_POOLS, applyPreRollConsumables, consumableActions } from './items/d1';
import { OBJECTIVE_ACTIONS } from './dungeons/d1/objectives';
import { D1, finishDungeon, D1_LOCATIONS } from './dungeons/d1';
import { TEST_DUNGEON } from './dungeons/test-fixture';

/**
 * One pack per dungeon. Dungeons 2–6 add an entry here with their definition (locations, encounters, story),
 * their new enemies (with handlers), their new items (equipment carries over between dungeons) and their loot
 * pools. Scenes live in apps/web/src/three/scenes.ts (THEMES + ROOMS) and cutscenes in apps/web/src/cinema
 * (registerCutscene with the dungeonId). See docs/NEW_DUNGEON.md.
 */
export interface DungeonPack {
  def: DungeonDef;
  enemies: EnemyDef[];
  enemyHandlers: Registry['handlers'];
  items: ItemDef[];
  itemHandlers: Registry['handlers'];
  loot: { comum: string[]; raro: string[]; consumivel: string[] };
}
export const DUNGEON_PACKS: DungeonPack[] = [{ def: D1, enemies: D1_ENEMIES, enemyHandlers: ENEMY_HANDLERS, items: ITEMS, itemHandlers: ITEM_HANDLERS, loot: LOOT_POOLS }];
const allEnemies = DUNGEON_PACKS.flatMap((p) => p.enemies);
const allItems = DUNGEON_PACKS.flatMap((p) => p.items);
const packHandlers = Object.assign({}, ...DUNGEON_PACKS.flatMap((p) => [p.enemyHandlers, p.itemHandlers])) as Registry['handlers'];

const preRoll: Hooks = {
  preAttack: (c, f, a) => applyPreRollConsumables(c, f, a),
};

export const REGISTRY: Registry = {
  classes: Object.fromEntries(CLASSES.map((x) => [x.id, x])),
  items: Object.fromEntries(allItems.map((x) => [x.id, x])),
  enemies: Object.fromEntries(allEnemies.map((x) => [x.id, x])),
  talents: Object.fromEntries(TALENTS.map((x) => [x.id, x])),
  handlers: { ...packHandlers, ...CLASS_HANDLERS, ...TALENT_HANDLERS },
  universalActions: [...UNIVERSAL_ACTIONS, ...consumableActions()],
  objectiveActions: OBJECTIVE_ACTIONS,
  globalHeroHooks: [preRoll],
};

let installed = false;
/** Install content into the engine (idempotent). */
export function installContent() {
  if (installed) return;
  installed = true;
  setRegistry(REGISTRY);
  setLootPools(LOOT_POOLS);
  for (const p of DUNGEON_PACKS) {
    setLootPools(p.loot, p.def.id);
    registerDungeon(p.def);
  }
  registerDungeon(TEST_DUNGEON);
}

export const CONTENT_VERSION = 'd1-basico-pass14-0.1.0';
export { CLASSES, TALENTS, D1_ENEMIES, ITEMS, LOOT_POOLS, D1, D1_LOCATIONS, finishDungeon, maxTalentTier, TEST_DUNGEON };
export * from './characters/common';
export * from './sim/autoplay';
