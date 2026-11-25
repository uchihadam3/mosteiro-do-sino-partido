/**
 * Real-time exploration ("world" mode) — owned by the World module.
 * App.tsx calls enterWorld() whenever the campaign is in the explore phase and leaveWorld() otherwise.
 * Both are idempotent: enterWorld() re-syncs the room/party with the latest state, leaveWorld() restores every
 * Diorama hook it took (camera controller, pointer override, frame hooks) and removes the world's objects.
 */
import type { CampaignState } from '@mosteiro/core';
import type { Diorama } from '../three/Diorama';
import { WorldController } from './World';

export const WORLD_ENABLED = true;

let world: WorldController | null = null;

/** Called on every relevant state change while the campaign is exploring (location, party, phase). */
export function enterWorld(d: Diorama, st: CampaignState): void {
  if (!world) world = new WorldController();
  try {
    world.enter(d, st);
  } catch (e) {
    console.error('world: enter failed', e);
  }
}

/** Called when the campaign leaves exploration (combat, base, title...). Must restore Diorama hooks it took. */
export function leaveWorld(_d: Diorama): void {
  try {
    world?.leave();
  } catch (e) {
    console.error('world: leave failed', e);
  }
}

export { worldUi, worldActions, useWorldUi } from './store';

/** Screen positions of the leader and of the doors/objects/enemies the player can use (tutorial pointers). */
export function worldScreenInfo() {
  return world?.screenInfo() ?? { leader: null, things: [] };
}

// dev: a hot reload of this module must not leave a second world attached to the renderer
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    world?.leave();
    world = null;
  });
}
