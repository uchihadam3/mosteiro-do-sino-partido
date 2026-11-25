/**
 * Cutscene registry, keyed by dungeon: scripts register themselves (d1.ts …) and the layer asks which one the
 * current campaign state calls for. "Seen" flags live in localStorage per campaign id, so each plays once.
 *
 * URL flags: ?cine=0 never plays cutscenes · ?cine=1 plays them even under automation and even if already seen.
 * Under automation (navigator.webdriver, i.e. the E2E suite) cutscenes do not auto-play unless ?cine=1.
 */
import { dungeon, type CampaignState } from '@mosteiro/core';
import type { Cutscene } from './engine/types';

const REG = new Map<string, Cutscene[]>();

export function registerCutscene(c: Cutscene) {
  const list = REG.get(c.dungeonId) ?? [];
  const i = list.findIndex((x) => x.id === c.id);
  if (i >= 0) list[i] = c;
  else list.push(c);
  REG.set(c.dungeonId, list);
}
export function cutscenesFor(dungeonId: string): Cutscene[] {
  return REG.get(dungeonId) ?? [];
}
export function findCutscene(id: string, dungeonId?: string): Cutscene | undefined {
  for (const [dId, list] of REG) {
    if (dungeonId && dId !== dungeonId) continue;
    const c = list.find((x) => x.id === id);
    if (c) return c;
  }
  return undefined;
}

// ------------------------------------------------------------------ seen flags
const KEY = 'mosteiro.cinema.seen.v1';
type Seen = Record<string, Record<string, number>>;
function readSeen(): Seen {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Seen;
  } catch {
    return {};
  }
}
export function wasSeen(campaignId: string, cutsceneId: string): boolean {
  return !!readSeen()[campaignId]?.[cutsceneId];
}
export function markSeen(campaignId: string, cutsceneId: string) {
  try {
    const s = readSeen();
    s[campaignId] = { ...(s[campaignId] ?? {}), [cutsceneId]: Date.now() };
    // keep the 40 most recent campaigns
    const ids = Object.keys(s).sort((a, b) => Math.max(...Object.values(s[b])) - Math.max(...Object.values(s[a])));
    for (const id of ids.slice(40)) delete s[id];
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: it may replay, that is fine */
  }
}

// ------------------------------------------------------------------ policy
export function cinePolicy(): 'off' | 'force' | 'auto' {
  const v = new URLSearchParams(location.search).get('cine');
  if (v === '0' || v === 'off') return 'off';
  if (v === '1' || v === 'on' || v === 'force') return 'force';
  if (typeof navigator !== 'undefined' && navigator.webdriver) return 'off';
  return 'auto';
}

/** Which cutscene (if any) the state calls for right now. */
export function cutsceneFor(st: CampaignState): Cutscene | null {
  const policy = cinePolicy();
  if (policy === 'off') return null;
  let startNode = '';
  try {
    startNode = dungeon(st.dungeonId).startNode;
  } catch {
    return null;
  }
  for (const c of cutscenesFor(st.dungeonId)) {
    const tr = c.trigger;
    let hit = false;
    if (tr.on === 'dungeonStart') hit = st.phase === 'explore' && st.node === startNode && st.completed.length === 0 && !st.combat;
    else if (tr.on === 'combatStart') hit = st.phase === 'combat' && st.combatEncounterId === tr.encounterId && st.combat?.phase === 'deploy';
    else if (tr.on === 'dungeonEnd') hit = st.phase === 'epilogue' && !!st.epilogue;
    if (!hit) continue;
    if (policy === 'force' ? sessionPlayed.has(`${st.id}|${c.id}`) : wasSeen(st.id, c.id)) continue;
    return c;
  }
  return null;
}
/** With ?cine=1 a cutscene replays once per page load (not on every state change). */
export const sessionPlayed = new Set<string>();
