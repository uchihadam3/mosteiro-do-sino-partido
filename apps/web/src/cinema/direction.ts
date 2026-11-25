/**
 * Hand the Diorama back to the game after a cutscene. App.tsx only re-applies its scene direction when the phase /
 * location / encounter changes, so a cutscene re-applies the same direction for the CURRENT state (mirrors App.tsx).
 */
import { dungeon, reg, type CampaignState } from '@mosteiro/core';
import type { Diorama } from '../three/Diorama';
import { audio } from '../audio/AudioDirector';
import { WORLD_ENABLED, enterWorld, leaveWorld } from '../world';
import { partyView } from '../app/App';

export function combatWeapons(st: CampaignState): Record<string, string | undefined> {
  const weapons: Record<string, string | undefined> = {};
  for (const h of st.heroes) weapons[h.id] = h.equipment.primary ? reg().items[h.equipment.primary.itemId]?.icon : undefined;
  for (const f of st.combat?.figures ?? []) if (f.side === 'H' && f.equipment?.primary) weapons[f.id] = reg().items[f.equipment.primary.itemId]?.icon;
  return weapons;
}

/** The location scene the game shows for this state. */
export function expectedScene(st: CampaignState | null, inGame: boolean): string {
  if (!inGame || !st) return 'campanario';
  if (st.phase === 'base' || st.phase === 'prep' || st.phase === 'complete') return 'claustro';
  try {
    const d = dungeon(st.dungeonId);
    const encId = st.combatEncounterId;
    const enc = encId ? d.encounters.find((e) => e.id === encId) : undefined;
    const locId = st.phase === 'combat' && enc ? enc.locationId : st.node;
    return (d.locations.find((l) => l.id === locId) ?? d.locations[0]).scene;
  } catch {
    return 'campanario';
  }
}

/** Is the world module (real-time exploration) driving the Diorama for this state? */
export function worldActive(st: CampaignState | null, inGame: boolean) {
  return inGame && !!st && st.phase === 'explore' && WORLD_ENABLED;
}
export function pauseWorld(d: Diorama) {
  if (WORLD_ENABLED) leaveWorld(d);
}

/** Re-apply the game's scene, mode, music and figures for the current state. Resolves when figures are rebuilt. */
export async function restoreDirection(d: Diorama, st: CampaignState | null, inGame: boolean): Promise<void> {
  if (!inGame || !st) {
    void d.loadScene('campanario');
    d.setMode('title');
    audio.setMusic('music_title');
    audio.setAmbience('amb_belltower');
    return;
  }
  const dd = dungeon(st.dungeonId);
  if (st.phase === 'base' || st.phase === 'prep' || st.phase === 'complete') {
    void d.loadScene('claustro');
    d.setMode('explore');
    audio.setMusic('music_base');
    audio.setAmbience('amb_torches_fire');
    await d.syncParty(partyView(st));
    return;
  }
  const encId = st.combatEncounterId;
  const enc = encId ? dd.encounters.find((e) => e.id === encId) : undefined;
  const locId = st.phase === 'combat' && enc ? enc.locationId : st.node;
  const loc = dd.locations.find((l) => l.id === locId) ?? dd.locations[0];
  void d.loadScene(loc.scene);
  audio.setAmbience(loc.ambience);
  if (st.phase === 'combat' && st.combat && enc) {
    d.setMode('combat');
    audio.setMusic(enc.music);
    await d.syncCombat(st.combat, combatWeapons(st));
  } else if (worldActive(st, inGame)) {
    audio.setMusic('music_explore');
    // the world module leaves 'cinema' alone on purpose (a cutscene owns the screen) — hand the mode back first
    d.setMode('world');
    enterWorld(d, st);
  } else {
    d.setMode('explore');
    audio.setMusic(st.phase === 'gameover' ? null : 'music_explore');
    await d.syncParty(partyView(st));
  }
}
