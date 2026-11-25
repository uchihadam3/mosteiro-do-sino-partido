/** Helpers shared by cutscene scripts: staging the party / the board, room bounds, the location's bell. */
import * as THREE from 'three';
import { reg, type CampaignState, type Figure, type SectorKey } from '@mosteiro/core';
import { sectorCenter } from '../../three/Diorama';
import type { Ctx, Cue, V3 } from '../engine/types';
import { combatWeapons } from '../direction';

export const v3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];

export interface PartyMember {
  id: string;
  classId: string;
  weapon?: string;
  name: string;
}
export function partyOf(st: CampaignState): PartyMember[] {
  return st.heroes
    .filter((h) => h.status !== 'derrotado')
    .map((h) => ({ id: h.id, classId: h.classId, name: h.name, weapon: h.equipment.primary ? reg().items[h.equipment.primary.itemId]?.icon : undefined }));
}

/** Stage every hero of the party as an actor (parallel loads). */
export async function stageParty(c: Ctx, members = partyOf(c.st)) {
  await Promise.all(members.map((m) => c.stage.hero(m.id, m.classId, m.weapon)));
  if (members[0]) c.stage.alias('lead', members[0].id);
  return members;
}

/** Walking column offsets [side, back] for up to 5 heroes. */
export const COLUMN: [number, number][] = [
  [0, 0],
  [-0.78, -1.2],
  [0.82, -1.35],
  [-0.32, -2.55],
  [0.6, -2.75],
];

/** Same slot layout as the board (two figures per sector side by side). */
export function slotPositions(figures: Figure[]): Map<string, THREE.Vector3> {
  const bySector = new Map<SectorKey, Figure[]>();
  for (const f of figures) {
    if (f.status === 'dead' || f.status === 'reserve') continue;
    const l = bySector.get(f.sector) ?? [];
    l.push(f);
    bySector.set(f.sector, l);
  }
  const out = new Map<string, THREE.Vector3>();
  for (const [k, list] of bySector) {
    const c = sectorCenter(k);
    list.sort((a, b) => a.order - b.order);
    list.forEach((f, i) => {
      const off = list.length === 1 ? 0 : i === 0 ? -0.42 : 0.42;
      out.set(f.id, c.clone().add(new THREE.Vector3(off, 0.12, list.length === 1 ? 0 : i === 0 ? 0.12 : -0.12)));
    });
  }
  return out;
}

/** Stage the combat exactly as the board will show it (heroes facing −Z, enemies +Z). Aliases: boss, lead. */
export async function stageBoard(c: Ctx, bossType: string) {
  const S = c.st.combat;
  if (!S) return { boss: null as string | null };
  const slots = slotPositions(S.figures);
  const weapons = combatWeapons(c.st);
  const live = S.figures.filter((f) => f.status !== 'dead' && f.status !== 'reserve');
  await Promise.all(live.map((f) => (f.side === 'H' ? c.stage.hero(f.id, f.typeId, weapons[f.id]) : c.stage.enemy(f.id, f.typeId))));
  for (const f of live) {
    const p = slots.get(f.id);
    if (p) c.stage.place(f.id, p, f.side === 'H' ? 180 : 0);
    const a = c.stage.get(f.id);
    if (a && f.status !== 'active') {
      a.visible = f.side === 'H';
      if (f.side === 'H') c.stage.play(f.id, 'fall', { hold: true, speed: 4 });
    }
  }
  const boss = live.find((f) => f.side === 'E' && f.typeId === bossType) ?? live.find((f) => f.side === 'E');
  if (boss) c.stage.alias('boss', boss.id);
  const bx = boss ? slots.get(boss.id)?.x ?? 0 : 0;
  const front = live.filter((f) => f.side === 'H' && f.status === 'active');
  front.sort((a, b) => (a.sector[2] === 'F' ? 0 : 1) - (b.sector[2] === 'F' ? 0 : 1) || Math.abs((slots.get(a.id)?.x ?? 0) - bx) - Math.abs((slots.get(b.id)?.x ?? 0) - bx));
  if (front[0]) c.stage.alias('lead', front[0].id);
  return { boss: boss?.id ?? null };
}

/** Room bounds from the location backdrop (when the scene exposes them), else the classic diorama footprint. */
export function roomBounds(c: Ctx): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const env = c.d.environment as unknown as { walk?: { bounds?: { minX: number; maxX: number; minZ: number; maxZ: number } } } | null;
  return env?.walk?.bounds ?? { minX: -9, maxX: 9, minZ: -9.5, maxZ: 8 };
}

/** Centre of the location's great bell, if the backdrop has one. */
export function envBellCenter(c: Ctx): THREE.Vector3 | null {
  const bell = c.d.environment?.bell;
  if (!bell) return null;
  bell.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(bell);
  if (box.isEmpty()) return bell.getWorldPosition(new THREE.Vector3());
  return box.getCenter(new THREE.Vector3());
}

/** Swing the location's bell (the Diorama animates `userData.swing`). */
export function swingEnvBell(c: Ctx, amount: number) {
  const bell = c.d.environment?.bell;
  if (bell) bell.userData.swing = Math.max((bell.userData.swing as number) ?? 0, amount);
}

/** Footstep cues while a group walks. */
export function steps(from: number, to: number, every = 0.52, vol = 0.2): Cue[] {
  const out: Cue[] = [];
  let i = 0;
  for (let t = from; t < to; t += every) out.push({ at: t, sfx: `step_stone_${1 + (i++ % 3)}`, vol });
  return out;
}

/** Piecewise-linear sampling of a function of time into actor path keys. */
export function sampleKeys(dur: number, n: number, f: (k: number) => THREE.Vector3) {
  const keys: { t: number; pos: V3 }[] = [];
  for (let i = 0; i <= n; i++) keys.push({ t: (dur * i) / n, pos: v3(f(i / n)) });
  return keys;
}
