/**
 * Room layout for the real-time world: where the party may walk, what blocks it, and where each campaign
 * option physically lives (doors on the walls, objects on the floor).
 *
 * Walk data comes from the built location scene when it provides it (`diorama.environment.walk`, built by the
 * art pipeline); otherwise it is estimated from the scene's props (tall things on the floor block, walls bound).
 */
import * as THREE from 'three';

export type Side = 'north' | 'south' | 'east' | 'west';
export interface Circle {
  x: number;
  z: number;
  r: number;
}
export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export interface WalkData {
  bounds: Bounds;
  colliders: Circle[];
  exits: Partial<Record<Side, { x: number; z: number }>>;
}
/** An existing passage in the backdrop (arch, doorway) that a door option can reuse instead of adding a model. */
export interface Portal {
  obj: THREE.Object3D;
  x: number;
  z: number;
  side: Side;
  /** Door leaves (hinged nodes) that can swing open. */
  leaves: THREE.Object3D[];
  kind: 'door' | 'arch' | 'gap';
  /** footprint along the wall (m) */
  width: number;
}
export interface Room {
  walk: WalkData;
  portals: Portal[];
  /** Big wall-like backdrop pieces (candidates to hide behind a new doorway). */
  walls: { obj: THREE.Object3D; box: THREE.Box3 }[];
  grid: NavGrid;
  /** True when the walk data came from the scene itself (authoritative). */
  authored: boolean;
  /** Authored rooms: a mesh of the backdrop's own door, to borrow its material and scale for extra doors. */
  doorLook: { material: THREE.Material | null; scale: THREE.Vector3 } | null;
}

export const BODY_R = 0.34;
const DEFAULT_BOUNDS: Bounds = { minX: -8.6, maxX: 8.6, minZ: -9.4, maxZ: 7.4 };

const tmpBox = new THREE.Box3();

/** Read authored walk data from the environment when present (tolerant of partial data). */
function authoredWalk(env: unknown): WalkData | null {
  const w = (env as { walk?: Partial<WalkData> } | null)?.walk;
  if (!w || !w.bounds) return null;
  const b = w.bounds;
  if (![b.minX, b.maxX, b.minZ, b.maxZ].every((v) => typeof v === 'number' && isFinite(v))) return null;
  return {
    bounds: { ...b },
    colliders: Array.isArray(w.colliders) ? w.colliders.filter((c) => c && isFinite(c.x) && isFinite(c.z) && isFinite(c.r)).map((c) => ({ ...c })) : [],
    exits: { ...(w.exits ?? {}) },
  };
}

const SIDES: Side[] = ['north', 'east', 'west', 'south'];
/** Authored rooms (walk contract): one real doorway per side, at the exit threshold, 1.1 m inside the wall. */
function authoredPortals(env: unknown, walk: WalkData): { portals: Portal[]; doorLook: Room['doorLook'] } {
  const doors = ((env as { doors?: Partial<Record<Side, THREE.Object3D>> } | null)?.doors ?? {}) as Partial<Record<Side, THREE.Object3D>>;
  const portals: Portal[] = [];
  let doorLook: Room['doorLook'] = null;
  for (const side of SIDES) {
    const e = walk.exits[side];
    if (!e) continue;
    const n = inward(side);
    const leaf = doors[side] ?? null;
    const x = e.x - n.x * 1.1;
    const z = e.z - n.z * 1.1;
    portals.push({ obj: leaf ?? new THREE.Object3D(), x, z, side, leaves: leaf ? [leaf] : [], kind: side === 'south' ? 'gap' : leaf ? 'door' : 'arch', width: 3 });
    if (leaf && !doorLook) {
      let material: THREE.Material | null = null;
      leaf.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!material && m.isMesh) material = Array.isArray(m.material) ? m.material[0] : m.material;
      });
      // the leaf hangs off the placed piece; its parent chain carries the wall scale
      const scale = new THREE.Vector3(1, 1, 1);
      (leaf.parent && leaf.parent.type !== 'Scene' && !leaf.parent.name.startsWith('scene:') ? leaf.parent : leaf).getWorldScale(scale);
      doorLook = { material, scale };
    }
  }
  return { portals, doorLook };
}

/** Estimate walk data, portals and walls from a built backdrop group. */
export function analyzeRoom(env: { group: THREE.Object3D } | null): Room {
  const authored = authoredWalk(env);
  if (authored) {
    const { portals, doorLook } = authoredPortals(env, authored);
    return { walk: authored, portals, walls: [], grid: new NavGrid(authored.bounds, authored.colliders), authored: true, doorLook };
  }
  const portals: Portal[] = [];
  const walls: Room['walls'] = [];
  const colliders: Circle[] = [];
  let backWall = -Infinity;
  if (env?.group) {
    env.group.updateMatrixWorld(true);
    for (const child of env.group.children) {
      if (!(child as THREE.Object3D).visible) continue;
      if ((child as THREE.Light).isLight) continue;
      const name = describe(child);
      tmpBox.setFromObject(child);
      if (tmpBox.isEmpty()) continue;
      const sx = tmpBox.max.x - tmpBox.min.x;
      const sy = tmpBox.max.y - tmpBox.min.y;
      const sz = tmpBox.max.z - tmpBox.min.z;
      if (sx > 20 || sz > 20) continue; // floor
      const cx = (tmpBox.min.x + tmpBox.max.x) / 2;
      const cz = (tmpBox.min.z + tmpBox.max.z) / 2;
      const portalLike = /door|arch|portal|gate/i.test(name) && !/cage|grate|candelab/i.test(name);
      if (portalLike && sy > 2.5) {
        const leaves: THREE.Object3D[] = [];
        child.traverse((o) => {
          if (/door_?[lr]\b|door_?(left|right)|leaf/i.test(o.name)) leaves.push(o);
        });
        const side: Side = Math.abs(cx) > Math.abs(cz) * 1.1 && Math.abs(cx) > 6 ? (cx > 0 ? 'east' : 'west') : cz < 0 ? 'north' : 'south';
        portals.push({ obj: child, x: cx, z: cz, side, leaves, kind: /door/i.test(name) || leaves.length ? 'door' : 'arch', width: side === 'north' || side === 'south' ? sx : sz });
        if (side === 'north') backWall = Math.max(backWall, tmpBox.max.z);
        // arch piers block, the opening does not
        if (/arch/i.test(name) && sx > 3) {
          colliders.push({ x: cx - sx / 2 + 0.45, z: cz, r: 0.55 }, { x: cx + sx / 2 - 0.45, z: cz, r: 0.55 });
        }
        continue;
      }
      if (tmpBox.min.y > 1.2) continue; // hanging / wall-mounted (torches, banners, chains, vaults)
      if (sy < 0.35) continue; // flat dressing (bones, cracks)
      const wallLike = sy > 3.2 && Math.max(sx, sz) > 3.2 && Math.min(sx, sz) < 1.6;
      if (wallLike) {
        walls.push({ obj: child, box: tmpBox.clone() });
        if (cz < -5 && sx >= sz) backWall = Math.max(backWall, tmpBox.max.z);
      }
      // footprint → 1..4 circles along the long axis
      const long = Math.max(sx, sz);
      const short = Math.min(sx, sz);
      const r = Math.max(0.22, short / 2);
      const n = Math.max(1, Math.min(6, Math.round(long / Math.max(0.6, short))));
      for (let i = 0; i < n; i++) {
        const k = n === 1 ? 0.5 : i / (n - 1);
        const x = sx >= sz ? THREE.MathUtils.lerp(tmpBox.min.x + r, tmpBox.max.x - r, k) : cx;
        const z = sx >= sz ? cz : THREE.MathUtils.lerp(tmpBox.min.z + r, tmpBox.max.z - r, k);
        colliders.push({ x, z, r: Math.min(1.6, r * 0.92) });
      }
    }
  }
  const b = { ...DEFAULT_BOUNDS };
  if (isFinite(backWall) && backWall > -12 && backWall < -4) b.minZ = backWall + 0.55;
  const walk: WalkData = { bounds: b, colliders, exits: {} };
  const grid = new NavGrid(walk.bounds, walk.colliders);
  return { walk, portals, walls, grid, authored: false, doorLook: null };
}

function describe(o: THREE.Object3D): string {
  // GLB roots are often unnamed groups; the asset id lives on the first named descendant
  let s = o.name || '';
  let n = 0;
  o.traverse((c) => {
    if (n < 4 && c.name && c !== o) {
      s += ' ' + c.name;
      n++;
    }
  });
  return s;
}

/** Resolve a circle overlap and the room bounds for a body at p (mutates p). */
export function collide(p: THREE.Vector3, colliders: readonly Circle[], b: Bounds, r = BODY_R, extra?: readonly Circle[]) {
  for (let pass = 0; pass < 2; pass++) {
    for (const list of extra ? [colliders, extra] : [colliders]) {
      for (const c of list) {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const R = c.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1e-4;
          p.x = c.x + (dx / d) * R;
          p.z = c.z + (dz / d) * R;
        }
      }
    }
  }
  p.x = Math.max(b.minX, Math.min(b.maxX, p.x));
  p.z = Math.max(b.minZ, Math.min(b.maxZ, p.z));
}

export function blockedAt(x: number, z: number, colliders: readonly Circle[], b: Bounds, r = BODY_R): boolean {
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return true;
  for (const c of colliders) {
    const dx = x - c.x;
    const dz = z - c.z;
    if (dx * dx + dz * dz < (c.r + r) * (c.r + r)) return true;
  }
  return false;
}

// ------------------------------------------------------------------ navigation grid (A*)
const CELL = 0.5;
export class NavGrid {
  w: number;
  h: number;
  x0: number;
  z0: number;
  free: Uint8Array;
  private g: Float32Array;
  private f: Float32Array;
  private from: Int32Array;
  private state: Uint8Array;
  constructor(
    public b: Bounds,
    public colliders: Circle[],
  ) {
    this.x0 = b.minX;
    this.z0 = b.minZ;
    this.w = Math.max(2, Math.ceil((b.maxX - b.minX) / CELL) + 1);
    this.h = Math.max(2, Math.ceil((b.maxZ - b.minZ) / CELL) + 1);
    const n = this.w * this.h;
    this.free = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.from = new Int32Array(n);
    this.state = new Uint8Array(n);
    this.rebuild(colliders);
  }
  rebuild(colliders: Circle[]) {
    this.colliders = colliders;
    for (let j = 0; j < this.h; j++)
      for (let i = 0; i < this.w; i++) this.free[j * this.w + i] = blockedAt(this.x0 + i * CELL, this.z0 + j * CELL, colliders, this.b, BODY_R + 0.06) ? 0 : 1;
  }
  private idx(x: number, z: number) {
    const i = Math.max(0, Math.min(this.w - 1, Math.round((x - this.x0) / CELL)));
    const j = Math.max(0, Math.min(this.h - 1, Math.round((z - this.z0) / CELL)));
    return j * this.w + i;
  }
  /** Nearest free cell centre to (x,z). */
  nearestFree(x: number, z: number, out: THREE.Vector3): boolean {
    const s = this.idx(x, z);
    if (this.free[s]) {
      out.set(this.x0 + (s % this.w) * CELL, 0, this.z0 + Math.floor(s / this.w) * CELL);
      if (!blockedAt(x, z, this.colliders, this.b)) out.set(x, 0, z);
      return true;
    }
    let best = -1;
    let bd = Infinity;
    for (let k = 0; k < this.free.length; k++) {
      if (!this.free[k]) continue;
      const dx = this.x0 + (k % this.w) * CELL - x;
      const dz = this.z0 + Math.floor(k / this.w) * CELL - z;
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    if (best < 0) return false;
    out.set(this.x0 + (best % this.w) * CELL, 0, this.z0 + Math.floor(best / this.w) * CELL);
    return true;
  }
  /** Straight segment clear of colliders? */
  clear(ax: number, az: number, bx: number, bz: number, r = BODY_R): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const L = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(L / 0.25));
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      if (blockedAt(ax + dx * k, az + dz * k, this.colliders, this.b, r)) return false;
    }
    return true;
  }
  /** A* from a to b; returns smoothed waypoints (excluding a), or null. */
  path(ax: number, az: number, bx: number, bz: number): THREE.Vector3[] | null {
    if (this.clear(ax, az, bx, bz)) return [new THREE.Vector3(bx, 0, bz)];
    const goal = new THREE.Vector3();
    if (!this.nearestFree(bx, bz, goal)) return null;
    const start = this.idx(ax, az);
    const end = this.idx(goal.x, goal.z);
    const W = this.w;
    this.state.fill(0);
    this.g.fill(Infinity);
    const open: number[] = [start];
    this.g[start] = 0;
    const hx = (k: number) => Math.hypot((k % W) - (end % W), Math.floor(k / W) - Math.floor(end / W));
    this.f[start] = hx(start);
    this.state[start] = 1;
    let found = false;
    let guard = 0;
    while (open.length && guard++ < 6000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (this.f[open[i]] < this.f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === end) {
        found = true;
        break;
      }
      this.state[cur] = 2;
      const ci = cur % W;
      const cj = Math.floor(cur / W);
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= W || nj >= this.h) continue;
          const nk = nj * W + ni;
          if (!this.free[nk] && nk !== end) continue;
          if (di && dj && (!this.free[cj * W + ni] || !this.free[nj * W + ci])) continue; // no corner cutting
          if (this.state[nk] === 2) continue;
          const ng = this.g[cur] + (di && dj ? 1.4142 : 1);
          if (ng < this.g[nk]) {
            this.g[nk] = ng;
            this.f[nk] = ng + hx(nk);
            this.from[nk] = cur;
            if (this.state[nk] !== 1) {
              this.state[nk] = 1;
              open.push(nk);
            }
          }
        }
    }
    if (!found) return null;
    const cells: THREE.Vector3[] = [];
    for (let k = end; k !== start; k = this.from[k]) cells.push(new THREE.Vector3(this.x0 + (k % W) * CELL, 0, this.z0 + Math.floor(k / W) * CELL));
    cells.reverse();
    cells[cells.length - 1] = goal.clone();
    // string pulling
    const out: THREE.Vector3[] = [];
    let ax2 = ax;
    let az2 = az;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.clear(ax2, az2, cells[j].x, cells[j].z)) j--;
      out.push(cells[j]);
      ax2 = cells[j].x;
      az2 = cells[j].z;
      i = j + 1;
    }
    return out;
  }
}

// ------------------------------------------------------------------ doors on walls
export function sideToward(from: { x: number; y: number } | undefined, to: { x: number; y: number } | undefined): Side {
  if (!from || !to) return 'north';
  const dx = to.x - from.x;
  const dz = to.y - from.y; // map y grows southwards (towards the camera)
  if (Math.abs(dx) > Math.abs(dz) * 1.15) return dx > 0 ? 'east' : 'west';
  return dz <= 0 ? 'north' : 'south';
}

/** Inward unit normal of a wall (pointing into the room). */
export function inward(side: Side): { x: number; z: number } {
  return side === 'north' ? { x: 0, z: 1 } : side === 'south' ? { x: 0, z: -1 } : side === 'east' ? { x: -1, z: 0 } : { x: 1, z: 0 };
}
/** Yaw that makes a +Z-facing model face into the room from a wall. */
export function wallYaw(side: Side): number {
  return side === 'north' ? 0 : side === 'south' ? Math.PI : side === 'east' ? -Math.PI / 2 : Math.PI / 2;
}

export interface DoorSlot {
  side: Side;
  /** Door position in the wall line. */
  x: number;
  z: number;
  /** Where the leader stands to use it. */
  ax: number;
  az: number;
  portal: Portal | null;
}

/**
 * Pick wall slots for a set of doors (grouped by side, each with a lateral preference).
 * Prefers authored exit anchors and existing passages, keeps doors apart and their approach clear.
 */
export function placeDoors(room: Room, wants: { key: string; side: Side; pref: number; main?: boolean }[], reserved: { side: Side; at: number }[] = []): Map<string, DoorSlot> {
  const out = new Map<string, DoorSlot>();
  const b = room.walk.bounds;
  const bySide = new Map<Side, { key: string; pref: number; main?: boolean }[]>();
  for (const w of wants) {
    const l = bySide.get(w.side) ?? [];
    l.push(w);
    bySide.set(w.side, l);
  }
  for (const [side, list] of bySide) {
    const horizontal = side === 'north' || side === 'south';
    const nrm = inward(side);
    const lo = horizontal ? b.minX + 2.2 : b.minZ + 1.8;
    const hi = horizontal ? b.maxX - 2.2 : b.maxZ - 1.6;
    const anchor = room.walk.exits[side];
    const center = anchor ? (horizontal ? anchor.x : anchor.z) : horizontal ? 0 : -1.5;
    const lineDefault = side === 'north' ? b.minZ - 0.7 : side === 'south' ? b.maxZ + 0.5 : side === 'east' ? b.maxX + 0.6 : b.minX - 0.6;
    let line = anchor ? (horizontal ? anchor.z - nrm.z * 1.1 : anchor.x - nrm.x * 1.1) : lineDefault;
    const spacing = horizontal ? 5 : 4.6;
    const lat = (p: Portal) => (horizontal ? p.x : p.z);
    // new doorways sit in the real wall line: existing passages or wall modules on this side win over the anchor
    const perp = (x: number, z: number) => (horizontal ? z : x);
    const inLine = [
      ...room.portals.filter((p) => p.side === side).map((p) => perp(p.x, p.z)),
      ...room.walls.map((w) => perp((w.box.min.x + w.box.max.x) / 2, (w.box.min.z + w.box.max.z) / 2)).filter((v) => Math.abs(v - line) < 2.5),
    ].sort((a, c) => a - c);
    if (inLine.length) line = inLine[Math.floor(inLine.length / 2)];
    /** where the leader stands to use a door at (x, z): in front of it, on free floor */
    const approach = (x: number, z: number) => {
      const v = new THREE.Vector3(THREE.MathUtils.clamp(x + nrm.x * 1.8, b.minX + 0.4, b.maxX - 0.4), 0, THREE.MathUtils.clamp(z + nrm.z * 1.8, b.minZ + 0.4, b.maxZ - 0.4));
      if (blockedAt(v.x, v.z, room.walk.colliders, b, BODY_R + 0.1)) room.grid.nearestFree(v.x, v.z, v);
      return v;
    };
    // existing passages on this wall, most central first; the main way gets the grandest (central) one
    const free = room.portals.filter((p) => p.side === side).sort((a, c) => Math.abs(lat(a) - center) - Math.abs(lat(c) - center));
    const allPortals = [...free];
    const taken: number[] = reserved.filter((r) => r.side === side).map((r) => r.at);
    const order = [...list].sort((a, c) => Number(!!c.main) - Number(!!a.main) || a.pref - c.pref);
    const pending: typeof list = [];
    for (const w of order) {
      const p = free.find((q) => !taken.some((t) => Math.abs(t - lat(q)) < spacing * 0.8));
      if (!p) {
        pending.push(w);
        continue;
      }
      free.splice(free.indexOf(p), 1);
      taken.push(lat(p));
      const a = approach(p.x, p.z);
      out.set(w.key, { side, x: p.x, z: p.z, ax: a.x, az: a.z, portal: p });
    }
    // new doorways: spread by map direction, clear of every passage already in the wall
    pending.sort((a, c) => a.pref - c.pref);
    pending.forEach((w, i) => {
      const n = pending.length;
      const ideal = THREE.MathUtils.clamp(center + (i - (n - 1) / 2) * spacing + Math.sign(w.pref) * (taken.length ? spacing * 0.5 : 0), lo, hi);
      let best = ideal;
      let bestScore = Infinity;
      for (let c = lo; c <= hi + 1e-6; c += 0.25) {
        if (taken.some((t) => Math.abs(t - c) < spacing * 0.86)) continue;
        if (allPortals.some((q) => Math.abs(lat(q) - c) < 4.3)) continue;
        const px = horizontal ? c : line;
        const pz = horizontal ? line : c;
        const ax = px + nrm.x * 1.7;
        const az = pz + nrm.z * 1.7;
        let score = Math.abs(c - ideal);
        if (blockedAt(ax, az, room.walk.colliders, b, BODY_R + 0.35)) score += 40;
        if (!room.grid.clear(ax, az, ax + nrm.x * 2.2, az + nrm.z * 2.2, BODY_R)) score += 8;
        // line up with the wall modules so a doorway replaces one cleanly
        for (const wl of room.walls) {
          const wc = horizontal ? (wl.box.min.x + wl.box.max.x) / 2 : (wl.box.min.z + wl.box.max.z) / 2;
          const wd = horizontal ? Math.abs((wl.box.min.z + wl.box.max.z) / 2 - line) : Math.abs((wl.box.min.x + wl.box.max.x) / 2 - line);
          if (wd > 1.8) continue;
          const off = Math.abs(wc - c);
          if (off < 0.2) score -= 1.2;
          else if (off < 3.6) score += 1.5;
        }
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      }
      taken.push(best);
      const x = horizontal ? best : line;
      const z = horizontal ? line : best;
      const a = approach(x, z);
      out.set(w.key, { side, x, z, ax: a.x, az: a.z, portal: null });
    });
  }
  return out;
}

/** A free spot on the floor for an object (lectern, statue…), away from doors and the board centre. */
export function placeObject(room: Room, avoid: { x: number; z: number; r: number }[], prefer: { x: number; z: number }): { x: number; z: number } {
  const b = room.walk.bounds;
  let best = { x: prefer.x, z: prefer.z };
  let bestScore = Infinity;
  for (let x = b.minX + 1.6; x <= b.maxX - 1.6; x += 0.5)
    for (let z = b.minZ + 1.4; z <= b.maxZ - 1.4; z += 0.5) {
      if (blockedAt(x, z, room.walk.colliders, b, 1.0)) continue;
      if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < a.r)) continue;
      const s = Math.hypot(x - prefer.x, z - prefer.z);
      if (s < bestScore) {
        bestScore = s;
        best = { x, z };
      }
    }
  return best;
}

