/**
 * Third-person high-angle follow camera for the world. Keeps the whole party in frame, leans a little towards
 * where the leader is heading, adapts its framing to the screen shape (phone upright = higher and steeper,
 * sideways/PC = wider) and can glide to a scripted pose (door push-in, hand-off to the combat camera).
 */
import * as THREE from 'three';
import type { CameraController } from '../three/Diorama';
import type { Bounds } from './layout';

export interface Framing {
  fov: number;
  /** elevation angle (radians) above the horizon */
  pitch: number;
  /** how many metres of floor should fit across the screen (at the focus) */
  span: number;
  /** focus offset towards the top of the screen (−z), metres */
  ahead: number;
}

export function framingFor(aspect: number): Framing {
  if (aspect < 0.62) return { fov: 50, pitch: THREE.MathUtils.degToRad(57), span: 9.6, ahead: 1.6 }; // phone upright
  if (aspect < 0.95) return { fov: 48, pitch: THREE.MathUtils.degToRad(55), span: 12, ahead: 1.3 };
  if (aspect < 1.5) return { fov: 44, pitch: THREE.MathUtils.degToRad(52), span: 15, ahead: 0.8 };
  if (aspect < 1.95) return { fov: 40, pitch: THREE.MathUtils.degToRad(51), span: 18.5, ahead: 0.9 }; // PC
  return { fov: 38, pitch: THREE.MathUtils.degToRad(47), span: 17.5, ahead: 0.5 }; // phone sideways
}

export interface Pose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
}

export class FollowCam implements CameraController {
  /** world point the camera frames (party centre + lead) */
  focus = new THREE.Vector3();
  /** party extent radius around the focus (m) */
  extent = 2;
  /** leader velocity (for look-ahead) */
  vel = new THREE.Vector3();
  bounds: Bounds | null = null;
  /** zoom multiplier (1 = default framing), smoothed */
  zoom = 1;
  zoomTarget = 1;
  /** scripted pose blend (0 = follow, 1 = pose) */
  private pose: Pose | null = null;
  private poseFrom: Pose | null = null;
  private poseT = 0;
  private poseDur = 0;
  private snap = true;
  private curPos = new THREE.Vector3();
  private curLook = new THREE.Vector3();
  private curFov = 45;
  private lead = new THREE.Vector3();
  private wantPos = new THREE.Vector3();
  private wantLook = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  shakeT = 0;

  snapNext() {
    this.snap = true;
  }
  /** Glide to a fixed pose over `dur` seconds (null = back to following). */
  glideTo(pose: Pose | null, dur = 0.6) {
    if (pose) {
      this.poseFrom = { pos: this.curPos.clone(), look: this.curLook.clone(), fov: this.curFov };
      this.pose = { pos: pose.pos.clone(), look: pose.look.clone(), fov: pose.fov };
      this.poseT = 0;
      this.poseDur = Math.max(0.01, dur);
    } else {
      this.pose = null;
      this.poseFrom = null;
    }
  }
  get gliding() {
    return !!this.pose && this.poseT < this.poseDur;
  }
  /** Where the follow framing wants the camera right now (used to compute establishing shots). */
  followPose(aspect: number, focus: THREE.Vector3, extent: number, out: Pose) {
    const f = framingFor(aspect);
    const vfov = THREE.MathUtils.degToRad(f.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const need = Math.max(f.span, extent * 2 + 4.5) * this.zoom;
    let dist = need / 2 / Math.tan(hfov / 2);
    // never so close that the vertical view loses the party, never absurdly far (fog)
    dist = THREE.MathUtils.clamp(dist, 9, 26);
    out.look.copy(focus);
    out.look.y = 0.7;
    out.pos.set(focus.x, out.look.y + Math.sin(f.pitch) * dist, focus.z + Math.cos(f.pitch) * dist);
    out.fov = f.fov;
    return out;
  }
  private fp: Pose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 45 };

  update(camera: THREE.PerspectiveCamera, dt: number): boolean {
    const aspect = camera.aspect || 1;
    const f = framingFor(aspect);
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 1.1);
    // look-ahead along movement, plus the "ahead" bias that keeps more room in front (north) of the party
    this.lead.lerp(this.tmp.copy(this.vel).multiplyScalar(0.45).clampLength(0, 2.2), Math.min(1, dt * 2.2));
    const focus = this.tmp.copy(this.focus).add(this.lead);
    focus.z -= f.ahead;
    if (this.bounds) {
      const b = this.bounds;
      const mx = Math.min(3.5, (b.maxX - b.minX) / 2 - 0.5);
      focus.x = THREE.MathUtils.clamp(focus.x, b.minX + mx, b.maxX - mx);
      focus.z = THREE.MathUtils.clamp(focus.z, b.minZ - 0.5, b.maxZ + 0.5);
    }
    if (this.zoom > 1.02 && this.bounds) {
      const k = Math.min(1, (this.zoom - 1) / 0.65);
      const b = this.bounds;
      focus.x += ((b.minX + b.maxX) / 2 - focus.x) * k * 0.6;
      focus.z += ((b.minZ + b.maxZ) / 2 - focus.z) * k * 0.6;
    }
    this.followPose(aspect, focus, this.extent, this.fp);
    this.wantPos.copy(this.fp.pos);
    this.wantLook.copy(this.fp.look);
    let fov = this.fp.fov;
    if (this.pose && this.poseFrom) {
      this.poseT = Math.min(this.poseDur, this.poseT + dt);
      const k = this.poseT / this.poseDur;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.wantPos.lerpVectors(this.poseFrom.pos, this.pose.pos, e);
      this.wantLook.lerpVectors(this.poseFrom.look, this.pose.look, e);
      fov = THREE.MathUtils.lerp(this.poseFrom.fov, this.pose.fov, e);
      this.curPos.copy(this.wantPos);
      this.curLook.copy(this.wantLook);
      this.curFov = fov;
    } else if (this.snap) {
      this.curPos.copy(this.wantPos);
      this.curLook.copy(this.wantLook);
      this.curFov = fov;
      this.snap = false;
    } else {
      const k = 1 - Math.exp(-dt * 3.2);
      this.curPos.lerp(this.wantPos, k);
      this.curLook.lerp(this.wantLook, k);
      this.curFov += (fov - this.curFov) * k;
    }
    camera.position.copy(this.curPos);
    camera.lookAt(this.curLook);
    if (Math.abs(camera.fov - this.curFov) > 0.01) {
      camera.fov = this.curFov;
      camera.updateProjectionMatrix();
    }
    return true;
  }
  /** Current pose (for gliding from / hand-off). */
  current(out: Pose) {
    out.pos.copy(this.curPos);
    out.look.copy(this.curLook);
    out.fov = this.curFov;
    return out;
  }
}
