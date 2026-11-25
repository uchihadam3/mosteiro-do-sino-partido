/**
 * The party in the world: one skinned rig per hero. The leader is driven by input (or scripted walks);
 * the others follow its footsteps in a loose line. Fallen heroes follow as pale ghosts until raised.
 */
import * as THREE from 'three';
import type { Rig } from '../three/characters';
import { buildHero } from '../three/characters';
import { buildHeroSkinned, buildEnemySkinned, clips, hasSkinnedEnemy, type AnimController, type AnimKey } from '../three/skinned';
import { buildEnemy } from '../three/characters';
import { collide, type Bounds, type Circle, BODY_R } from './layout';

export const WALK_SPEED = 3.3;
export const RUN_SPEED = 5.4;
/** Speed at which the walk clip plays at timeScale 1 without foot sliding (KayKit rig at 1.62 m). */
const WALK_CLIP_SPEED = 1.55;
const RUN_CLIP_SPEED = 3.9;

export type Loco = 'idle' | 'walk' | 'run';

export interface Member {
  id: string;
  classId: string;
  weapon?: string;
  rig: Rig;
  pos: THREE.Vector3;
  yaw: number;
  vel: THREE.Vector3;
  speed: number;
  loco: Loco | null;
  status: 'ok' | 'caido' | 'derrotado';
  ghost: number;
  ghostTarget: number;
  stride: number;
  phase: number;
  busyUntil: number;
  action: THREE.AnimationAction | null;
  /** positioned in the current room */
  placed: boolean;
}

/** The shared clip library (loaded once with the first skinned prefab). */
let CLIPS: Map<string, THREE.AnimationClip> | null = null;
function clipAction(anim: AnimController, name: string): THREE.AnimationAction | null {
  const c = CLIPS?.get(name);
  return c ? anim.mixer.existingAction(c) : null;
}

export async function buildHeroRig(classId: string, weaponIcon?: string): Promise<Rig> {
  if (!CLIPS) CLIPS = await clips().catch(() => null);
  try {
    return await buildHeroSkinned(classId, weaponIcon);
  } catch (e) {
    console.warn('world: skinned hero failed, using procedural', e);
    return buildHero({ classId, weaponIcon });
  }
}
export async function buildEnemyRig(type: string): Promise<Rig> {
  if (!CLIPS) CLIPS = await clips().catch(() => null);
  try {
    if (hasSkinnedEnemy(type)) return await buildEnemySkinned(type);
  } catch (e) {
    console.warn('world: skinned enemy failed, using procedural', e);
  }
  return buildEnemy(type);
}

export function animOf(rig: Rig): AnimController | null {
  return (rig.anim as unknown as AnimController | undefined) ?? null;
}

/** Switch the looping base clip (idle / walk / run) and keep its playback speed in step with the feet. */
export function locomote(m: { rig: Rig; loco: Loco | null; action: THREE.AnimationAction | null; busyUntil: number }, loco: Loco, speed: number, now: number) {
  const anim = animOf(m.rig);
  if (!anim) {
    m.loco = loco;
    return;
  }
  if (now < m.busyUntil) return;
  if (m.loco !== loco) {
    const name = loco === 'run' ? 'Running_A' : loco === 'walk' ? anim.map.walk ?? 'Walking_A' : anim.map.idle ?? 'Idle';
    anim.base = name;
    anim.holding = false;
    anim.loop(name, loco === 'idle' ? 0.25 : 0.16);
    let a = clipAction(anim, name);
    if (!a && loco === 'run') {
      const w = anim.map.walk ?? 'Walking_A';
      anim.base = w;
      anim.loop(w, 0.16);
      a = clipAction(anim, w);
    }
    m.action = a;
    m.loco = loco;
  }
  if (m.action) {
    if (loco === 'walk') m.action.timeScale = THREE.MathUtils.clamp(speed / WALK_CLIP_SPEED, 0.55, 2.4);
    else if (loco === 'run') m.action.timeScale = THREE.MathUtils.clamp(speed / RUN_CLIP_SPEED, 0.8, 1.6);
    else m.action.timeScale = 1;
  }
}

/** One-shot clip (use, cheer, taunt…); locomotion waits until it is done. */
export function oneShot(m: { rig: Rig; loco: Loco | null; busyUntil: number }, key: string, now: number, speed = 1) {
  const anim = animOf(m.rig);
  if (!anim) return 0;
  const d = anim.play(key as AnimKey, { speed });
  if (d > 0) {
    m.busyUntil = now + d * 0.92;
    m.loco = null;
  }
  return d;
}

/** Simple procedural motion for rigs without clips (fallback prefabs). */
export function proceduralMotion(rig: Rig, speed: number, t: number, phase: number) {
  if (rig.anim) return;
  const id = rig.idle;
  if (speed > 0.2) {
    const ph = t * (4 + speed * 1.6) + phase;
    rig.body.position.y = Math.abs(Math.sin(ph)) * 0.05;
    rig.body.rotation.z = Math.sin(ph) * 0.04;
    rig.armR.rotation.x = Math.sin(ph) * 0.55;
    rig.armL.rotation.x = -Math.sin(ph) * 0.55;
    rig.torso.rotation.x = id.hunch + 0.06;
  } else {
    const ph = phase + t * id.speed;
    rig.body.position.y = Math.sin(ph * 2) * id.bob;
    rig.body.rotation.z = Math.sin(ph) * id.sway;
    rig.torso.rotation.x = id.hunch + Math.sin(ph * 2) * 0.02;
    rig.armR.rotation.x *= 0.9;
    rig.armL.rotation.x *= 0.9;
  }
}

const GHOST = new THREE.Color(0x9fb8ff);
/** Fade a rig towards a translucent, cold ghost (k = 0..1). */
export function applyGhost(rig: Rig, k: number, dead: boolean) {
  for (const m of rig.mats) {
    const ud = m.userData as { gOpacity?: number; gTransparent?: boolean; gDepth?: boolean; gColor?: THREE.Color; baseEmissive?: THREE.Color; baseEmissiveIntensity?: number };
    if (ud.gOpacity === undefined) {
      ud.gOpacity = m.opacity;
      ud.gTransparent = m.transparent;
      ud.gDepth = m.depthWrite;
      ud.gColor = m.color.clone();
    }
    const target = dead ? 0.2 : 0.42;
    const op = THREE.MathUtils.lerp(ud.gOpacity!, target, k);
    const ghostly = k > 0.01;
    if (m.transparent !== (ghostly || ud.gTransparent)) {
      m.transparent = ghostly || !!ud.gTransparent;
      m.needsUpdate = true;
    }
    m.opacity = op;
    m.depthWrite = ghostly ? false : !!ud.gDepth;
    m.color.copy(ud.gColor!).lerp(GHOST, k * 0.65);
    if (ud.baseEmissive) {
      m.emissive.copy(ud.baseEmissive).lerp(GHOST, k * 0.5);
      m.emissiveIntensity = THREE.MathUtils.lerp(ud.baseEmissiveIntensity ?? 0, 0.6, k);
    }
  }
}

export function newMember(id: string, classId: string, weapon: string | undefined, rig: Rig, status: Member['status']): Member {
  return { id, classId, weapon, rig, pos: new THREE.Vector3(), yaw: Math.PI, vel: new THREE.Vector3(), speed: 0, loco: null, status, ghost: status === 'ok' ? 0 : 1, ghostTarget: status === 'ok' ? 0 : 1, stride: 0, phase: Math.random() * 10, busyUntil: 0, action: null, placed: false };
}

// ------------------------------------------------------------------ the leader's breadcrumb trail and followers
const SPACING = 1.25;
export class Breadcrumbs {
  pts: THREE.Vector3[] = [];
  private pool: THREE.Vector3[] = [];
  reset(head: THREE.Vector3, back: { x: number; z: number }, n = 12) {
    this.pool.push(...this.pts);
    this.pts.length = 0;
    // a straight line behind the leader (e.g. back through the door it came in by)
    for (let i = 0; i < n; i++) this.pts.push(this.v().set(head.x + back.x * i * 0.5, 0, head.z + back.z * i * 0.5));
  }
  private v() {
    return this.pool.pop() ?? new THREE.Vector3();
  }
  push(p: THREE.Vector3) {
    const h = this.pts[0];
    if (h && h.distanceToSquared(p) < 0.18 * 0.18) {
      h.copy(p);
      return;
    }
    this.pts.unshift(this.v().copy(p));
    if (this.pts.length > 160) this.pool.push(this.pts.pop()!);
  }
  /** Point at arc length `dist` behind the head; also returns the local path direction. */
  sample(dist: number, out: THREE.Vector3, dir: THREE.Vector3): boolean {
    let acc = 0;
    for (let i = 0; i + 1 < this.pts.length; i++) {
      const a = this.pts[i];
      const b = this.pts[i + 1];
      const L = a.distanceTo(b);
      if (acc + L >= dist) {
        const k = L > 1e-5 ? (dist - acc) / L : 0;
        out.lerpVectors(a, b, k);
        dir.subVectors(a, b).setY(0);
        if (dir.lengthSq() > 1e-6) dir.normalize();
        return true;
      }
      acc += L;
    }
    const last = this.pts[this.pts.length - 1];
    if (last) out.copy(last);
    return false;
  }
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

/** Move a follower towards its slot on the trail (arrive behaviour + collisions). */
export function follow(m: Member, index: number, crumbs: Breadcrumbs, leaderSpeed: number, dt: number, colliders: readonly Circle[], bounds: Bounds, others: Member[], extra?: readonly Circle[]) {
  const ok = crumbs.sample(index * SPACING, tmpA, tmpDir);
  if (!ok && crumbs.pts.length === 0) return;
  // loose formation: alternate a little to each side of the path
  const side = index % 2 ? 0.42 : -0.42;
  tmpA.x += -tmpDir.z * side * (index > 0 ? 1 : 0);
  tmpA.z += tmpDir.x * side * (index > 0 ? 1 : 0);
  tmpB.subVectors(tmpA, m.pos).setY(0);
  const d = tmpB.length();
  const maxV = Math.max(WALK_SPEED * 0.9, leaderSpeed + 1.4);
  const want = d < 0.12 ? 0 : Math.min(maxV, d * 3.2);
  if (d > 1e-4) tmpB.multiplyScalar(want / d);
  else tmpB.set(0, 0, 0);
  m.vel.lerp(tmpB, 1 - Math.exp(-dt * 10));
  const px = m.pos.x;
  const pz = m.pos.z;
  // step towards the slot without ever passing it (long frames)
  const sx = m.vel.x * dt;
  const sz = m.vel.z * dt;
  const sl = Math.hypot(sx, sz);
  const k = sl > d && sl > 1e-6 ? d / sl : 1;
  m.pos.x += sx * k;
  m.pos.z += sz * k;
  // keep a little personal space
  for (const o of others) {
    if (o === m) continue;
    const dx = m.pos.x - o.pos.x;
    const dz = m.pos.z - o.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 0.62 * 0.62 && d2 > 1e-6) {
      const dd = Math.sqrt(d2);
      const push = (0.62 - dd) * 0.5;
      m.pos.x += (dx / dd) * push;
      m.pos.z += (dz / dd) * push;
    }
  }
  collide(m.pos, colliders, bounds, BODY_R, extra);
  m.speed = Math.hypot(m.pos.x - px, m.pos.z - pz) / Math.max(dt, 1e-4);
}

/** Turn smoothly towards a yaw. */
export function turnTowards(m: { yaw: number }, target: number, dt: number, rate = 12) {
  let d = target - m.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  m.yaw += d * Math.min(1, dt * rate);
}
