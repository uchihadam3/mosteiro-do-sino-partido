/**
 * Stage — everything a cutscene adds to the Diorama scene: named set pieces and actors (skinned rigs built with the
 * same builders as the board). Owns per-frame rig updates (the Diorama only animates its own figures).
 */
import * as THREE from 'three';
import type { Diorama } from '../../three/Diorama';
import { AnimController, buildEnemySkinned, buildHeroSkinned, clips, hasSkinnedEnemy } from '../../three/skinned';
import { buildEnemy, buildHero, type Rig } from '../../three/characters';
import type { Point, V3 } from './types';

export interface Actor {
  id: string;
  rig: Rig;
  kind: 'hero' | 'enemy' | 'prop';
  pos: THREE.Vector3;
  yaw: number;
  yawTarget: number;
  base: string | null;
  baseSpeed: number;
  visible: boolean;
  phase: number;
}

export class Stage {
  readonly root = new THREE.Group();
  readonly sets = new Map<string, THREE.Object3D>();
  readonly actors = new Map<string, Actor>();
  private aliases = new Map<string, string>();
  private updaters = new Set<(dt: number, t: number) => void>();
  private disposers: (() => void)[] = [];

  constructor(public d: Diorama) {
    this.root.name = 'cinema-stage';
  }

  addSet(name: string, obj: THREE.Object3D) {
    obj.name = obj.name || `set:${name}`;
    this.root.add(obj);
    this.sets.set(name, obj);
    return obj;
  }
  onUpdate(fn: (dt: number, t: number) => void) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }
  onDispose(fn: () => void) {
    this.disposers.push(fn);
  }

  async hero(id: string, classId: string, weaponIcon?: string): Promise<Actor> {
    let rig: Rig;
    try {
      rig = await buildHeroSkinned(classId, weaponIcon);
    } catch {
      rig = buildHero({ classId, weaponIcon });
    }
    return this.addActor(id, rig, 'hero');
  }
  async enemy(id: string, type: string): Promise<Actor> {
    let rig: Rig;
    try {
      rig = hasSkinnedEnemy(type) ? await buildEnemySkinned(type) : await buildEnemy(type);
    } catch {
      rig = await buildEnemy(type);
    }
    return this.addActor(id, rig, 'enemy');
  }
  addActor(id: string, rig: Rig, kind: Actor['kind']): Actor {
    const a: Actor = { id, rig, kind, pos: new THREE.Vector3(), yaw: 0, yawTarget: 0, base: null, baseSpeed: 1, visible: true, phase: Math.random() * 10 };
    rig.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.frustumCulled = false;
    });
    this.root.add(rig.root);
    this.actors.set(id, a);
    return a;
  }

  /** Give an actor a script-friendly name ('boss', 'lead'…). */
  alias(name: string, id: string) {
    this.aliases.set(name, id);
  }
  get(id: string): Actor | undefined {
    return this.actors.get(this.aliases.get(id) ?? id);
  }

  place(id: string, pos: V3 | THREE.Vector3, yawDeg?: number) {
    const a = this.get(id);
    if (!a) return;
    a.pos.set(...(Array.isArray(pos) ? pos : (pos.toArray() as V3)));
    if (yawDeg !== undefined) a.yaw = a.yawTarget = (yawDeg * Math.PI) / 180;
  }

  /** Looping animation (anim key like 'idle'/'walk', or a raw clip name). */
  setBase(id: string, key: string, speed = 1) {
    const a = this.get(id);
    const anim = a?.rig.anim;
    if (!a || !anim) return;
    if (a.base === key && a.baseSpeed === speed) return;
    if (!anim.map[key]) anim.map[key] = key;
    anim.setBase(key);
    a.base = key;
    a.baseSpeed = speed;
  }
  /** One-shot animation; returns its duration. */
  play(id: string, key: string, opts: { speed?: number; hold?: boolean } = {}): number {
    const anim = this.get(id)?.rig.anim;
    if (!anim) return 0;
    if (!anim.map[key]) anim.map[key] = key;
    return anim.play(key, opts);
  }

  /** Freeze an actor on one frame of a clip (e.g. kneeling = a moment of a fall). */
  async pose(id: string, clip: string, time: number) {
    const a = this.get(id);
    const anim = a?.rig.anim as unknown as AnimController | undefined;
    if (!a || !anim?.mixer) return;
    const lib = await clips();
    const c = lib.get(clip);
    if (!c) return;
    anim.mixer.stopAllAction();
    const act = anim.mixer.clipAction(c);
    act.reset();
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
    act.setEffectiveWeight(1);
    act.play();
    act.time = Math.min(time, c.duration - 0.01);
    act.paused = true;
    anim.holding = true;
    a.base = `pose:${clip}`;
    anim.mixer.update(0);
  }

  /** Resolve a script point (world coords or a point on an actor). */
  point(p: Point): THREE.Vector3 {
    if (Array.isArray(p)) return new THREE.Vector3(p[0], p[1], p[2]);
    const a = this.get(p.actor);
    const v = a ? a.pos.clone() : new THREE.Vector3();
    const h = a?.rig.height ?? 1.6;
    const part = p.part ?? 'chest';
    v.y += part === 'head' ? h * 0.82 : part === 'chest' ? h * 0.58 : part === 'top' ? h : 0;
    if (p.off) v.add(new THREE.Vector3(p.off[0], p.off[1], p.off[2]));
    return v;
  }

  update(dt: number, t: number) {
    for (const a of this.actors.values()) {
      const r = a.rig;
      r.root.visible = a.visible;
      if (!a.visible) continue;
      // smooth turning
      let dy = a.yawTarget - a.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      a.yaw += dy * Math.min(1, dt * 5);
      r.root.position.copy(a.pos);
      r.root.rotation.y = a.yaw;
      r.anim?.update(dt * a.baseSpeed);
      animateExtras(r, t, a.phase);
    }
    for (const fn of this.updaters) fn(dt, t);
  }

  dispose() {
    for (const fn of this.disposers) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
    this.root.parent?.remove(this.root);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(o as THREE.Points).isPoints && !(o as THREE.LineSegments).isLineSegments) return;
      // rigs share cached GLB geometry; only free what the cinema built itself
      if (m.geometry?.userData?.cinema) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) if (mat?.userData?.cinema) mat.dispose();
    });
    this.actors.clear();
    this.aliases.clear();
    this.sets.clear();
    this.updaters.clear();
  }
}

/** Signature idles of some prefabs (mirrors the board figures). */
function animateExtras(r: Rig, t: number, phase: number) {
  const x = r.extras;
  if (x.runeRing) x.runeRing.rotation.z = t * 0.6;
  if (x.halo) x.halo.rotation.z = t * 0.5;
  if (x.censer) x.censer.rotation.z = Math.sin(t * 2.2) * 0.5;
  for (let i = 0; i < 3; i++) {
    const ln = x[`lantern${i}`];
    if (ln) ln.position.set(Math.cos(t * 0.5 + (i * Math.PI * 2) / 3) * 0.7, 1.4 + Math.sin(t * 1.3 + i) * 0.12, Math.sin(t * 0.5 + (i * Math.PI * 2) / 3) * 0.7);
    const gl = x[`glyph${i}`];
    if (gl) gl.position.set(Math.cos(t * 0.7 + (i * Math.PI * 2) / 3) * 0.45, 1.25 + Math.sin(t * 2 + i) * 0.06, Math.sin(t * 0.7 + (i * Math.PI * 2) / 3) * 0.45);
  }
  if (x.cape) x.cape.rotation.x = 0.08 + Math.sin(t * 1.4 + phase) * 0.05;
}

/** Mark geometry/materials as owned by the cinema (freed on dispose). */
export function own<T extends THREE.BufferGeometry | THREE.Material>(x: T): T {
  x.userData.cinema = true;
  return x;
}
