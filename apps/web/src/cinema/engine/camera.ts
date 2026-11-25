/**
 * Camera keyframes → pose, adapted to the screen: shots are authored for a 16:9 picture; portrait phones get a wider
 * vertical FOV (and, if needed, a dolly back) so the subject keeps a sensible share of the width; orbit keys with
 * `fit` compute their own distance so a [w, h] box always fits whatever the aspect.
 */
import * as THREE from 'three';
import type { CamKey, EaseName, OrbitKey, Point, V3 } from './types';

export const EASE: Record<EaseName, (k: number) => number> = {
  linear: (k) => k,
  in: (k) => k * k * k,
  out: (k) => 1 - Math.pow(1 - k, 3),
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  inOutSine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
  outQuart: (k) => 1 - Math.pow(1 - k, 4),
  outBack: (k) => {
    const c1 = 1.4;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  },
};

export interface Pose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  roll: number;
}

export interface Frame {
  /** Canvas aspect (width / height). */
  aspect: number;
  /** Fraction of the canvas height that is visible between the letterbox bars. */
  visible: number;
}

const REF = 16 / 9;
const MAX_FOV = 66;
const MAX_DOLLY = 1.22;
const D2R = Math.PI / 180;

export type PointResolver = (p: Point) => THREE.Vector3;

function withPortrait(k: CamKey, portrait: boolean): CamKey {
  return portrait && k.p ? { ...k, ...k.p } : k;
}

/** Resolve an orbit key into a camera position + look point. */
function orbitPose(o: OrbitKey, fov: number, f: Frame, at: PointResolver): { pos: THREE.Vector3; look: THREE.Vector3 } {
  const target = at(o.target);
  let dist = o.dist ?? 6;
  if (o.fit) {
    const t = Math.tan((fov * D2R) / 2);
    const dh = o.fit[1] / 2 / (t * f.visible);
    const dw = o.fit[0] / 2 / (t * f.aspect);
    dist = Math.max(dh, dw);
  }
  const yaw = o.yaw * D2R;
  const pitch = o.pitch * D2R;
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const pos = target.clone().addScaledVector(dir, dist);
  const look = target.clone();
  if (o.shift) {
    // move the aim so the subject sits off-centre (rule of thirds) — offset perpendicular to the view
    const fwd = dir.clone().negate();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const tv = Math.tan((fov * D2R) / 2) * dist;
    look.addScaledVector(right, -o.shift[0] * tv * f.aspect).addScaledVector(up, -o.shift[1] * tv * f.visible);
  }
  return { pos, look };
}

/** Pose of one key for the current frame. */
export function resolveKey(k0: CamKey, f: Frame, at: PointResolver): Pose & { orbit?: OrbitKey } {
  const portrait = f.aspect < 0.95;
  const k = withPortrait(k0, portrait);
  const baseFov = k.fov ?? 40;
  if (k.orbit) {
    // portrait: open the vertical FOV a little so close-ups are not too tight
    const fov = f.aspect < REF ? Math.min(MAX_FOV, baseFov * (1 + (REF - f.aspect) * 0.16)) : baseFov;
    const { pos, look } = orbitPose(k.orbit, fov, f, at);
    return { pos, look, fov, roll: k.roll ?? 0, orbit: k.orbit };
  }
  const pos = at(k.pos ?? [0, 3, 10]);
  const look = at(k.look ?? [0, 1, 0]);
  let fov = baseFov;
  if (f.aspect < REF) {
    // keep `pk` of the 16:9 horizontal coverage, opening the FOV first and then dollying back
    const pk = k.pk ?? (f.aspect < 0.95 ? 0.55 : 0.85);
    const tanH = Math.tan((baseFov * D2R) / 2) * REF * pk;
    const want = (Math.atan(tanH / f.aspect) * 2) / D2R;
    fov = Math.min(MAX_FOV, Math.max(baseFov, want));
    const tanV = Math.tan((fov * D2R) / 2) * f.aspect;
    // dolly back only a little (rooms have walls): beyond that, crop the sides instead
    if (tanV < tanH) pos.sub(look).multiplyScalar(Math.min(MAX_DOLLY, tanH / tanV)).add(look);
  }
  return { pos, look, fov, roll: k.roll ?? 0 };
}

/** Camera pose at shot-local time t. */
export function evalCamera(keys: CamKey[], t: number, f: Frame, at: PointResolver): Pose {
  if (!keys.length) return { pos: new THREE.Vector3(0, 4, 12), look: new THREE.Vector3(), fov: 40, roll: 0 };
  if (keys.length === 1 || t <= keys[0].t) {
    const r = resolveKey(keys[0], f, at);
    return r;
  }
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t < t) i++;
  if (i >= keys.length - 1) return resolveKey(keys[keys.length - 1], f, at);
  const a = keys[i];
  const b = keys[i + 1];
  const u = THREE.MathUtils.clamp((t - a.t) / Math.max(1e-4, b.t - a.t), 0, 1);
  const e = EASE[b.ease ?? 'inOut'](u);
  const ra = resolveKey(a, f, at);
  const rb = resolveKey(b, f, at);
  let pos: THREE.Vector3;
  let look: THREE.Vector3;
  if (ra.orbit && rb.orbit) {
    // arc between orbit keys: interpolate the orbit parameters, not the positions
    const oa = ra.orbit;
    const ob = rb.orbit;
    const fovI = ra.fov + (rb.fov - ra.fov) * e;
    const ta = at(oa.target);
    const tb = at(ob.target);
    const target = ta.clone().lerp(tb, e);
    const da = ra.pos.distanceTo(ta);
    const db = rb.pos.distanceTo(tb);
    const dist = da + (db - da) * e;
    let dy = ob.yaw - oa.yaw;
    if (dy > 180) dy -= 360;
    if (dy < -180) dy += 360;
    const mid: OrbitKey = {
      target: [target.x, target.y, target.z] as V3,
      yaw: oa.yaw + dy * e,
      pitch: oa.pitch + (ob.pitch - oa.pitch) * e,
      dist,
      shift: oa.shift || ob.shift ? [((oa.shift?.[0] ?? 0) * (1 - e) + (ob.shift?.[0] ?? 0) * e), ((oa.shift?.[1] ?? 0) * (1 - e) + (ob.shift?.[1] ?? 0) * e)] : undefined,
    };
    const p = orbitPose(mid, fovI, f, at);
    pos = p.pos;
    look = p.look;
    return { pos, look, fov: fovI, roll: ra.roll + (rb.roll - ra.roll) * e };
  }
  pos = ra.pos.clone().lerp(rb.pos, e);
  look = ra.look.clone().lerp(rb.look, e);
  return { pos, look, fov: ra.fov + (rb.fov - ra.fov) * e, roll: ra.roll + (rb.roll - ra.roll) * e };
}

/** Low-frequency handheld sway (deterministic in t). */
export function sway(t: number, amp: number): THREE.Vector3 {
  if (!amp) return new THREE.Vector3();
  return new THREE.Vector3(Math.sin(t * 0.71) * 0.6 + Math.sin(t * 1.37 + 1.2) * 0.4, Math.sin(t * 0.53 + 0.4) * 0.5 + Math.sin(t * 1.11 + 2.1) * 0.3, Math.sin(t * 0.43 + 2.4) * 0.4).multiplyScalar(amp);
}
