/**
 * Cutscene player. Takes the Diorama through its extension points only:
 *   setMode('cinema') · cameraController · addFrameHook · impulse · loadScene
 * and stages its own set pieces and rigs. While playing, everything else in the scene (board figures, the world
 * module's party, markers) is hidden for the duration of each render only (scene.onBeforeRender/onAfterRender),
 * so no other module's state is touched. On finish/skip the previous controller is restored and the game's
 * direction for the CURRENT state is re-applied (scene, mode, music, figures). Cutscenes are local only: they never
 * dispatch game commands, so online play continues underneath.
 */
import * as THREE from 'three';
import type { CampaignState } from '@mosteiro/core';
import type { CameraController, Diorama } from '../three/Diorama';
import { audio } from '../audio/AudioDirector';
import { getSettings } from '../state/settings';
import { EASE, evalCamera, sway, type Frame } from './engine/camera';
import { Stage } from './engine/stage';
import type { Ctx, Cue, Cutscene, Shot } from './engine/types';
import { markSeen, sessionPlayed } from './registry';
import { pauseWorld, restoreDirection, worldActive } from './direction';

// ------------------------------------------------------------------ view store (for the React overlay)
export interface CineLine {
  id: number;
  name?: string;
  kind?: 'mentor' | 'villain' | 'other' | 'narration';
  text: string;
  more: boolean;
}
export interface CineView {
  active: boolean;
  bars: boolean;
  fade: number;
  fadeDur: number;
  line: CineLine | null;
  lineOut: boolean;
  card: { id: number; kick?: string; name: string; epi?: string } | null;
  cardOut: boolean;
  chapter: { id: number; num: string; title: string } | null;
  chapterOut: boolean;
  canSkip: boolean;
  title: string;
}
const EMPTY: CineView = { active: false, bars: false, fade: 0, fadeDur: 0.6, line: null, lineOut: false, card: null, cardOut: false, chapter: null, chapterOut: false, canSkip: false, title: '' };
let view: CineView = EMPTY;
const listeners = new Set<() => void>();
function setView(p: Partial<CineView>) {
  view = { ...view, ...p };
  listeners.forEach((l) => l());
}
export function getCineView() {
  return view;
}
export function subscribeCinema(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function isCinemaPlaying() {
  return view.active;
}

// ------------------------------------------------------------------ letterbox geometry (shared with the overlay)
export function barsFor(w: number, h: number): number {
  const a = w / h;
  if (a < 0.95) return Math.round(h * 0.105);
  if (h < 520) return Math.round(h * 0.11);
  return Math.round(Math.max(h * 0.08, Math.min(h * 0.14, (h - w / 2.35) / 2)));
}

const SKIP_LEAD = 0.18;
let lineSeq = 0;

interface Saved {
  controller: CameraController | null;
  fov: number;
  aspect: number;
}

class CinemaPlayer {
  private cs: Cutscene | null = null;
  private c: Ctx | null = null;
  private shots: Shot[] = [];
  private starts: number[] = [];
  private total = 0;
  private time = 0;
  private shotIdx = -1;
  private fired = new Set<Cue>();
  private unhook: (() => void) | null = null;
  private saved: Saved | null = null;
  private phase: 'idle' | 'loading' | 'playing' | 'ending' = 'idle';
  private hidden: THREE.Object3D[] = [];
  private savedFog: THREE.Fog | THREE.FogExp2 | null = null;
  private savedBg: THREE.Color | THREE.Texture | null = null;
  private fog = new THREE.FogExp2(0x000000, 0.01);
  private bg = new THREE.Color();
  private prevBefore: THREE.Scene['onBeforeRender'] | null = null;
  private prevAfter: THREE.Scene['onAfterRender'] | null = null;
  private lineEnd = 0;
  private cardEnd = 0;
  private chapterEnd = 0;
  private lastTap = 0;
  private getState: () => { st: CampaignState | null; inGame: boolean } = () => ({ st: null, inGame: false });
  private onKey = (e: KeyboardEvent) => {
    if (this.phase === 'idle' || e.ctrlKey || e.metaKey || e.altKey) return;
    e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.skip();
    } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      this.advance();
    }
  };
  private controller: CameraController = {
    update: (cam) => {
      const shot = this.shots[this.shotIdx];
      if (!shot || !this.c) return false;
      const local = this.time - this.starts[this.shotIdx];
      const pose = evalCamera(shot.cam, local, this.frame(), (p) => this.c!.stage.point(p));
      cam.position.copy(pose.pos).add(sway(this.time, this.c.reduced ? 0 : shot.sway ?? 0.035));
      const minY = shot.minY ?? (shot.env ? 0.3 : -Infinity);
      if (cam.position.y < minY) cam.position.y = minY;
      if (shot.env) {
        // safety net: aspect adaptation must never carry the camera through the room's walls
        const b = (this.c.d.environment as unknown as { walk?: { bounds?: { minX: number; maxX: number; minZ: number; maxZ: number } } } | null)?.walk?.bounds;
        if (b) {
          cam.position.x = THREE.MathUtils.clamp(cam.position.x, b.minX - 0.4, b.maxX + 0.4);
          cam.position.z = THREE.MathUtils.clamp(cam.position.z, b.minZ - 0.2, b.maxZ + 3);
        }
      }
      if (Math.abs(cam.fov - pose.fov) > 1e-3) {
        cam.fov = pose.fov;
        cam.updateProjectionMatrix();
      }
      cam.up.set(0, 1, 0);
      cam.lookAt(pose.look);
      if (pose.roll) cam.rotateZ((pose.roll * Math.PI) / 180);
      return true;
    },
  };

  get playing() {
    return this.phase !== 'idle';
  }
  get id() {
    return this.cs?.id ?? null;
  }
  get currentTime() {
    return this.time;
  }
  get duration() {
    return this.total;
  }
  /** Debug: the running cutscene context. */
  get context() {
    return this.c;
  }

  private frame(): Frame {
    const w = innerWidth;
    const h = innerHeight;
    const b = barsFor(w, h);
    return { aspect: w / h, visible: Math.max(0.5, (h - 2 * b) / h) };
  }

  /** Start a cutscene (no-op if one is already playing). */
  async play(cs: Cutscene, d: Diorama, st: CampaignState, getState: () => { st: CampaignState | null; inGame: boolean }) {
    if (this.phase !== 'idle') return;
    this.phase = 'loading';
    this.cs = cs;
    this.getState = getState;
    markSeen(st.id, cs.id);
    sessionPlayed.add(`${st.id}|${cs.id}`);
    setView({ ...EMPTY, active: true, bars: false, fade: 1, fadeDur: 0.01, title: cs.title, canSkip: true });
    document.documentElement.classList.add('cine-on');
    window.addEventListener('keydown', this.onKey, true);
    // let App.tsx finish applying its own direction for this state change first
    await new Promise((r) => setTimeout(r, 60));
    if (this.phase !== 'loading') return;
    const reduced = getSettings().reducedMotion;
    const stage = new Stage(d);
    const c: Ctx = { d, st, stage, three: THREE, aspect: innerWidth / innerHeight, portrait: innerHeight > innerWidth, reduced, time: 0, data: {} };
    this.c = c;
    // take the stage
    if (worldActive(getState().st, getState().inGame)) pauseWorld(d);
    this.saved = { controller: d.cameraController, fov: d.camera.fov, aspect: d.camera.aspect };
    d.setMode('cinema');
    d.cameraController = this.controller;
    d.scene.add(stage.root);
    stage.root.visible = false;
    this.installIsolation(d);
    try {
      const scene = typeof cs.scene === 'function' ? cs.scene(st) : cs.scene;
      if (scene) await this.loadScene(d, scene);
      await cs.setup(c);
    } catch (e) {
      console.warn('[cinema] setup failed, skipping cutscene', e);
      void this.finish(true);
      return;
    }
    if (this.phase !== 'loading') return;
    this.shots = typeof cs.shots === 'function' ? cs.shots(c) : cs.shots;
    this.starts = [];
    let acc = 0;
    for (const s of this.shots) {
      this.starts.push(acc);
      acc += s.dur;
    }
    this.total = acc;
    this.time = 0;
    this.shotIdx = -1;
    this.fired.clear();
    if (cs.music !== undefined) audio.setMusic(cs.music);
    if (cs.amb !== undefined) audio.setAmbience(cs.amb);
    stage.root.visible = true;
    this.unhook = d.addFrameHook((dt, t) => this.tick(dt, t));
    this.phase = 'playing';
    this.enterShot(0, false);
    this.stage.update(0, 0);
    setView({ bars: true, fade: 0, fadeDur: 0.9 });
  }

  private get stage() {
    return this.c!.stage;
  }

  private async loadScene(d: Diorama, id: string) {
    const before = d.environment;
    const p = d.loadScene(id);
    const t0 = performance.now();
    await p;
    // the scene may already be building (App asked for it): wait until the backdrop with this id is in place
    while (performance.now() - t0 < 6000) {
      const env = d.environment;
      if (env && (env.group.name.includes(id) || (env !== before && !env.group.name.startsWith('scene:')))) break;
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  // ---------------------------------------------------------------- isolation (render-time only)
  private myBefore: THREE.Scene['onBeforeRender'] | null = null;
  private myAfter: THREE.Scene['onAfterRender'] | null = null;
  private installIsolation(d: Diorama) {
    const scene = d.scene;
    this.prevBefore = scene.onBeforeRender;
    this.prevAfter = scene.onAfterRender;
    const before = scene.onBeforeRender;
    const after = scene.onAfterRender;
    this.myBefore = (...args: Parameters<THREE.Scene['onBeforeRender']>) => {
      before.apply(scene, args);
      this.isolate(d);
    };
    this.myAfter = (...args: Parameters<THREE.Scene['onAfterRender']>) => {
      this.unisolate(d);
      after.apply(scene, args);
    };
    scene.onBeforeRender = this.myBefore;
    scene.onAfterRender = this.myAfter;
  }
  private removeIsolation(d: Diorama) {
    // only undo our own hooks (someone may have chained theirs on top meanwhile)
    if (this.prevBefore && d.scene.onBeforeRender === this.myBefore) d.scene.onBeforeRender = this.prevBefore;
    if (this.prevAfter && d.scene.onAfterRender === this.myAfter) d.scene.onAfterRender = this.prevAfter;
    this.prevBefore = this.prevAfter = this.myBefore = this.myAfter = null;
    this.unisolate(d);
  }
  private isolate(d: Diorama) {
    const shot = this.shots[this.shotIdx];
    if (!this.c) return;
    const scene = d.scene;
    const env = d.environment?.group;
    const showEnv = !!shot?.env;
    const showVfx = !!shot?.vfx;
    this.hidden.length = 0;
    for (const o of scene.children) {
      if (!o.visible) continue;
      if (o === this.stage.root) continue;
      if (o === env) {
        if (showEnv) continue;
      } else if (o === d.vfx.group) {
        if (showVfx) continue;
      } else if ((o as THREE.Light).isLight && showEnv) continue;
      else if (!(o as THREE.Light).isLight && (o as THREE.Object3D).type === 'Object3D' && o.children.length === 0) continue;
      o.visible = false;
      this.hidden.push(o);
    }
    this.savedFog = scene.fog;
    this.savedBg = scene.background as THREE.Color | THREE.Texture | null;
    if (shot?.fog === null) scene.fog = null;
    else if (shot?.fog) {
      this.fog.color.set(shot.fog.color);
      this.fog.density = shot.fog.density;
      scene.fog = this.fog;
    }
    if (shot?.bg !== undefined) {
      this.bg.set(shot.bg);
      scene.background = this.bg;
    }
  }
  private unisolate(d: Diorama) {
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
    if (this.savedFog !== null || this.savedBg !== null) {
      d.scene.fog = this.savedFog;
      d.scene.background = this.savedBg;
      this.savedFog = null;
      this.savedBg = null;
    }
  }

  // ---------------------------------------------------------------- timeline
  private tick(dt: number, t: number) {
    if (this.phase !== 'playing' || !this.c) return;
    const d = this.c.d;
    // another module grabbed the camera (e.g. App re-entered the world on a state change): pause it, take it back
    if (d.cameraController !== this.controller) {
      pauseWorld(d);
      d.cameraController = this.controller;
    }
    if (d.mode !== 'cinema') d.setMode('cinema');
    this.time += dt;
    this.c.time = this.time;
    let idx = this.shotIdx;
    while (idx < this.shots.length - 1 && this.time >= this.starts[idx + 1]) idx++;
    if (idx !== this.shotIdx) this.enterShot(idx, false);
    this.runCues(false);
    this.applyTracks(false);
    this.stage.update(dt, this.time);
    // timed overlay elements
    if (view.line && !view.lineOut && this.time >= this.lineEnd) setView({ lineOut: true });
    if (view.card && !view.cardOut && this.time >= this.cardEnd) setView({ cardOut: true });
    if (view.chapter && !view.chapterOut && this.time >= this.chapterEnd) setView({ chapterOut: true });
    if (this.time >= this.total) void this.finish(false);
    void t;
  }

  private enterShot(idx: number, seeking: boolean) {
    this.shotIdx = idx;
    const shot = this.shots[idx];
    if (!shot || !this.c) return;
    if (shot.sets) for (const [name, obj] of this.stage.sets) obj.visible = shot.sets.includes(name);
    for (const tr of shot.actors ?? []) {
      const a = this.stage.get(tr.actor);
      if (!a) continue;
      if (tr.visible !== undefined) a.visible = tr.visible;
      if (tr.base) this.stage.setBase(tr.actor, tr.base, tr.speed ?? 1);
    }
    this.applyTracks(true);
    void seeking;
  }

  private applyTracks(snap: boolean) {
    const shot = this.shots[this.shotIdx];
    if (!shot || !this.c) return;
    const local = this.time - this.starts[this.shotIdx];
    for (const tr of shot.actors ?? []) {
      const a = this.stage.get(tr.actor);
      if (!a) continue;
      let moving = false;
      if (tr.path?.length) {
        const ks = tr.path;
        let i = 0;
        while (i < ks.length - 1 && ks[i + 1].t <= local) i++;
        const k0 = ks[i];
        const k1 = ks[Math.min(i + 1, ks.length - 1)];
        let p: THREE.Vector3;
        if (k1 === k0 || local <= k0.t) p = new THREE.Vector3(...k0.pos);
        else {
          const u = THREE.MathUtils.clamp((local - k0.t) / Math.max(1e-4, k1.t - k0.t), 0, 1);
          const e = k1.ease ? EASE[k1.ease](u) : u; // default linear: walking at constant speed reads best
          p = new THREE.Vector3(...k0.pos).lerp(new THREE.Vector3(...k1.pos), e);
          moving = local < k1.t;
          if (moving) {
            const dir = new THREE.Vector3(...k1.pos).sub(new THREE.Vector3(...k0.pos));
            if (tr.face === undefined && dir.lengthSq() > 1e-6) a.yawTarget = Math.atan2(dir.x, dir.z);
          }
        }
        a.pos.copy(p);
      }
      if (tr.face !== undefined) {
        if (typeof tr.face === 'number') a.yawTarget = (tr.face * Math.PI) / 180;
        else {
          const q = this.stage.point(tr.face);
          a.yawTarget = Math.atan2(q.x - a.pos.x, q.z - a.pos.z);
        }
      }
      if (snap) a.yaw = a.yawTarget;
    }
  }

  private runCues(seeking: boolean) {
    for (let si = 0; si <= this.shotIdx; si++) {
      const shot = this.shots[si];
      for (const cue of shot.cues ?? []) {
        if (this.fired.has(cue)) continue;
        const at = this.starts[si] + cue.at;
        if (at > this.time) continue;
        this.fired.add(cue);
        // when tapping ahead, one-shot effects in the past are skipped; lasting changes still apply
        const late = seeking && this.time - at > 0.25;
        this.fire(cue, at, late);
      }
    }
  }

  private fire(cue: Cue, at: number, late: boolean) {
    const c = this.c!;
    const vol = (v?: number) => v ?? 1;
    if (cue.state) cue.state(c);
    if (cue.music !== undefined) audio.setMusic(cue.music);
    if (cue.amb !== undefined) audio.setAmbience(cue.amb);
    if (cue.fade !== undefined) setView({ fade: cue.fade, fadeDur: late ? 0.15 : cue.dur ?? 0.6 });
    if (late) return;
    if (cue.fx) cue.fx(c);
    if (cue.sfx) audio.play(cue.sfx, { volume: vol(cue.vol), rate: cue.rate });
    if (cue.duck) audio.duck(cue.duck, cue.dur ?? 2.5);
    if (!c.reduced && (cue.flash || cue.shake)) c.d.impulse({ flash: cue.flash, flashColor: cue.color, shake: cue.shake });
    if (cue.play) this.stage.play(cue.play.actor, cue.play.anim, { speed: cue.play.speed, hold: cue.play.hold });
    if (cue.line) {
      const sp = cue.who ? this.cs?.speakers?.[cue.who] : undefined;
      const dur = cue.dur ?? Math.max(2.4, 1.1 + cue.line.length * 0.058);
      this.lineEnd = at + dur;
      setView({ line: { id: ++lineSeq, name: sp?.name, kind: sp?.kind ?? (cue.who ? 'other' : 'narration'), text: cue.line, more: this.nextLineAfter(at + 0.01) !== null }, lineOut: false });
    }
    if (cue.card) {
      this.cardEnd = at + (cue.dur ?? 3.4);
      setView({ card: { id: ++lineSeq, ...cue.card }, cardOut: false });
    }
    if (cue.chapter) {
      this.chapterEnd = at + (cue.dur ?? 4);
      setView({ chapter: { id: ++lineSeq, ...cue.chapter }, chapterOut: false });
    }
  }

  private nextLineAfter(t: number): number | null {
    let best: number | null = null;
    this.shots.forEach((s, si) => {
      for (const cue of s.cues ?? []) {
        if (!cue.line) continue;
        const at = this.starts[si] + cue.at;
        if (at > t && (best === null || at < best)) best = at;
      }
    });
    return best;
  }

  /** Jump forward (tap-to-advance). Lasting cues in between are applied, one-shots skipped. */
  seek(to: number) {
    if (this.phase !== 'playing' || !this.c) return;
    to = Math.min(this.total - 0.05, Math.max(this.time, to));
    this.time = to;
    this.c.time = to;
    let idx = this.shotIdx;
    while (idx < this.shots.length - 1 && to >= this.starts[idx + 1]) idx++;
    // enter every shot we pass so their actor setups apply in order
    for (let i = this.shotIdx + 1; i <= idx; i++) this.enterShot(i, true);
    this.runCues(true);
    this.applyTracks(true);
    // hide timed overlays that are over by now
    if (view.line && this.time >= this.lineEnd) setView({ lineOut: true });
    if (view.card && this.time >= this.cardEnd) setView({ cardOut: true });
    if (view.chapter && this.time >= this.chapterEnd) setView({ chapterOut: true });
  }

  /** Tap: show the next subtitle now (or move to the next shot when no line is left). */
  advance() {
    if (this.phase !== 'playing') return;
    const now = performance.now();
    if (now - this.lastTap < 320) return;
    this.lastTap = now;
    const next = this.nextLineAfter(this.time + 0.05);
    if (next !== null) {
      this.seek(next - SKIP_LEAD);
      return;
    }
    // no more lines: finish the current line, then fast-forward to the closing shot
    if (view.line && !view.lineOut) {
      this.lineEnd = this.time;
      setView({ lineOut: true });
      return;
    }
    const lastStart = this.starts[this.starts.length - 1] ?? 0;
    if (this.time < lastStart - 0.5) this.seek(lastStart);
  }

  /** Pular: end now (quick fade). */
  skip() {
    if (this.phase === 'playing' || this.phase === 'loading') void this.finish(true);
  }

  private async finish(skipped: boolean) {
    if (this.phase === 'ending' || this.phase === 'idle') return;
    const wasLoading = this.phase === 'loading';
    this.phase = 'ending';
    setView({ canSkip: false, fade: 1, fadeDur: skipped ? 0.35 : 0.5, lineOut: true, cardOut: true, chapterOut: true });
    if (!wasLoading || skipped) await new Promise((r) => setTimeout(r, skipped ? 380 : view.fade >= 1 ? 120 : 520));
    const c = this.c;
    if (c) await this.teardown(c.d);
    else {
      document.documentElement.classList.remove('cine-on');
      window.removeEventListener('keydown', this.onKey, true);
    }
    setView({ fade: 0, fadeDur: 0.7, bars: false });
    await new Promise((r) => setTimeout(r, 750));
    setView({ ...EMPTY });
    this.phase = 'idle';
    this.cs = null;
    this.c = null;
  }

  private async teardown(d: Diorama) {
    this.unhook?.();
    this.unhook = null;
    this.removeIsolation(d);
    this.c?.stage.dispose();
    const saved = this.saved;
    this.saved = null;
    if (d.cameraController === this.controller) d.cameraController = saved?.controller ?? null;
    if (saved) {
      d.camera.fov = saved.fov;
      d.camera.updateProjectionMatrix();
    }
    d.resize();
    document.documentElement.classList.remove('cine-on');
    window.removeEventListener('keydown', this.onKey, true);
    const { st, inGame } = this.getState();
    try {
      await Promise.race([restoreDirection(d, st, inGame), new Promise((r) => setTimeout(r, 2500))]);
    } catch (e) {
      console.warn('[cinema] restore failed', e);
    }
  }
}

export const cinema = new CinemaPlayer();
