import { UNIVERSAL_ACTIONS, registerDungeon, setLootPools, setRegistry, type Hooks, type Registry } from '@mosteiro/core';
import { CLASSES, CLASS_HANDLERS } from './characters/classes';
import { TALENTS, TALENT_HANDLERS, maxTalentTier } from './characters/talents';
import { D1_ENEMIES, ENEMY_HANDLERS } from './enemies/d1';
import { ITEMS, ITEM_HANDLERS, LOOT_POOLS, applyPreRollConsumables, consumableActions } from './items/d1';
import { OBJECTIVE_ACTIONS } from './dungeons/d1/objectives';
import { D1, finishDungeon, D1_LOCATIONS } from './dungeons/d1';
import { TEST_DUNGEON } from './dungeons/test-fixture';

const preRoll: Hooks = {
  preAttack: (c, f, a) => applyPreRollConsumables(c, f, a),
};

export const REGISTRY: Registry = {
  classes: Object.fromEntries(CLASSES.map((x) => [x.id, x])),
  items: Object.fromEntries(ITEMS.map((x) => [x.id, x])),
  enemies: Object.fromEntries(D1_ENEMIES.map((x) => [x.id, x])),
  talents: Object.fromEntries(TALENTS.map((x) => [x.id, x])),
  handlers: { ...ENEMY_HANDLERS, ...CLASS_HANDLERS, ...TALENT_HANDLERS, ...ITEM_HANDLERS },
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
  registerDungeon(D1);
  registerDungeon(TEST_DUNGEON);
}

export const CONTENT_VERSION = 'd1-basico-pass14-0.1.0';
export { CLASSES, TALENTS, D1_ENEMIES, ITEMS, LOOT_POOLS, D1, D1_LOCATIONS, finishDungeon, maxTalentTier, TEST_DUNGEON };
export * from './characters/common';
export * from './sim/autoplay';
