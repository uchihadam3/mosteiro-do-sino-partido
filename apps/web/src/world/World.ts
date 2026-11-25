/**
 * WorldController — real-time exploration of the monastery.
 *
 * Each campaign location is a room (the same backdrop used for its battles). The party walks in real time:
 * the leader follows the joystick / keys / taps, the others follow its footsteps. Every option the campaign
 * engine offers becomes a physical thing in the room — doors on the walls (towards the destination on the
 * dungeon map), glowing objects for lore, enemies standing in the room for fights here, the main gate to leave.
 * Using one sends exactly the same `explore` command as before (online votes included); battles start in the
 * same room after a short staged reveal of the enemies, and the board rises from the floor.
 */
import * as THREE from 'three';
import { campaignDispatch, dungeon, layoutEnemies, reg, type CampaignState, type DungeonDef, type EncounterDef, type ExploreOption, type Figure, type HeroRecord, type LocationDef, type SectorKey } from '@mosteiro/core';
import { sectorCenter, type CameraController, type Diorama } from '../three/Diorama';
import { kit, model } from '../three/assets';
import type { Rig } from '../three/characters';
import type { AnimKey } from '../three/skinned';
import { audio } from '../audio/AudioDirector';
import { session } from '../state/session';
import { getSettings } from '../state/settings';
import { run } from '../ui/Inventory';
import { FollowCam, type Pose } from './camera';
import { Particles, Trail, TEX } from './fx';
import { analyzeRoom, blockedAt, collide, inward, placeDoors, placeObject, sideToward, wallYaw, BODY_R, type Circle, type DoorSlot, type Room, type Side } from './layout';
import { Breadcrumbs, RUN_SPEED, WALK_SPEED, animOf, applyGhost, buildEnemyRig, buildHeroRig, follow, locomote, newMember, oneShot, proceduralMotion, turnTowards, type Member } from './party';
import { installWorldActions, worldUi, type WorldPrompt } from './store';
import './world.css';

const MAIN_KINDS = new Set<EncounterDef['kind']>(['obrigatorio', 'rota', 'miniboss', 'boss']);
const COLORS = { travel: 0xffc66e, fight: 0xff6a3c, secret: 0xb48cff, finish: 0xffe2a0, lore: 0x9fd8ff };
const HINT_KEY = 'mosteiro.world.v1';

type InterKind = 'door' | 'object' | 'enemies' | 'gate';
interface Meta {
  title: string;
  text: string;
  sub?: string;
  icon: string;
  fight: boolean;
  secret: boolean;
  main: boolean;
  here: boolean;
  enc?: EncounterDef;
  dest?: LocationDef;
}
interface Staged {
  id: string;
  type: string;
  rig: Rig;
  pos: THREE.Vector3;
  yaw: number;
  yawTarget: number;
  aware: boolean;
  phase: number;
  loco: Member['loco'];
  action: THREE.AnimationAction | null;
  busyUntil: number;
}
interface Inter {
  opt: ExploreOption;
  meta: Meta;
  kind: InterKind;
  slot: DoorSlot | null;
  /** where the leader stands to use it */
  at: THREE.Vector3;
  /** label anchor / tap target */
  center: THREE.Vector3;
  radius: number;
  color: THREE.Color;
  group: THREE.Group;
  pool: THREE.Mesh | null;
  beyond: THREE.Mesh | null;
  leaves: { o: THREE.Object3D; base: number; sign: number }[];
  open: number;
  openTarget: number;
  tag: HTMLDivElement;
  near: boolean;
  hover: boolean;
  enemies: Staged[];
  reveal: number; // secret passage rising (0..1), 1 = done
  prefetched: boolean;
}
type Arrive = { kind: 'south' } | { kind: 'from'; loc: string } | { kind: 'formation' };

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpC = new THREE.Color();
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** Free the GPU resources of the meshes this module generated (shared GLB clones are left alone). */
function disposeOwn(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.own) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
}
/** Free a rig's own (cloned) materials; geometry is shared with the prefab cache. */
function disposeRig(rig: Rig) {
  for (const m of rig.mats) m.dispose();
}
function easeOut(k: number) {
  return 1 - Math.pow(1 - k, 3);
}
function heroWeapon(h: HeroRecord): string | undefined {
  return h.equipment.primary ? reg().items[h.equipment.primary.itemId]?.icon : undefined;
}
/** Same slot layout as the combat board (two figures share a Sector side by side). */
function slotPositions(figs: Pick<Figure, 'id' | 'sector' | 'order' | 'status'>[]): Map<string, THREE.Vector3> {
  const by = new Map<SectorKey, typeof figs>();
  for (const f of figs) {
    if (f.status === 'dead' || f.status === 'reserve') continue;
    const l = by.get(f.sector) ?? [];
    l.push(f);
    by.set(f.sector, l);
  }
  const out = new Map<string, THREE.Vector3>();
  for (const [k, list] of by) {
    const c = sectorCenter(k);
    list.sort((a, b) => a.order - b.order);
    list.forEach((f, i) => {
      const off = list.length === 1 ? 0 : i === 0 ? -0.42 : 0.42;
      out.set(f.id, c.clone().add(new THREE.Vector3(off, 0, list.length === 1 ? 0 : i === 0 ? 0.12 : -0.12)));
    });
  }
  return out;
}

/** What an option is, in the words the player sees. */
function describeOption(o: ExploreOption, d: DungeonDef, st: CampaignState): Meta {
  const enc = o.encounterId ? d.encounters.find((e) => e.id === o.encounterId) : undefined;
  const destId = o.locationId ?? enc?.locationId;
  const dest = destId ? d.locations.find((l) => l.id === destId) : undefined;
  const here = o.kind === 'combat' && (!destId || destId === st.node);
  const secret = !!o.secret || enc?.kind === 'secreto' || (!!dest && !dest.public);
  const fight = o.kind === 'combat';
  const parts = o.label.split(/\s+[—–]\s+/);
  const short = parts[parts.length - 1];
  const verbFirst = parts.length === 1 && /^[A-ZÀ-Ý][a-zà-ÿ]*r$/.test(o.label.split(/\s+/)[0] ?? '');
  let text: string;
  let title: string;
  if (o.kind === 'narrative') {
    text = o.label;
    title = o.label;
  } else if (here) {
    title = enc?.name ?? o.label;
    text = `Lutar · ${title}`;
  } else if (verbFirst) {
    text = o.label;
    title = dest && dest.id !== st.node ? dest.name : o.label;
  } else {
    title = short;
    text = o.kind === 'finish' ? o.label : `Entrar · ${short}`;
  }
  const main = o.kind === 'travel' || o.kind === 'finish' ? true : o.kind === 'narrative' ? false : !secret && (!enc || MAIN_KINDS.has(enc.kind));
  return { title, text, sub: o.detail, icon: o.icon ?? (o.kind === 'narrative' ? 'sete_linhas' : fight ? 'act_attack_melee' : 'map_path'), fight, secret, main, here, enc, dest };
}

function objectModelFor(o: ExploreOption): { id: string; scale: number } {
  const s = `${o.label} ${o.icon ?? ''} ${o.detail ?? ''}`.toLowerCase();
  if (/estátua|estatua|statue|porteiro|monge/.test(s)) return { id: 'statue_blind_porter', scale: 1.05 };
  if (/altar|ofício|oficio|reza|oração/.test(s)) return { id: 'altar', scale: 0.7 };
  if (/baú|bau|relic|cofre|chest/.test(s)) return { id: 'reliquary_chest', scale: 1.2 };
  if (/túmulo|tumulo|sarc|jazigo/.test(s)) return { id: 'sarcophagus', scale: 0.9 };
  if (/poço|poco|well/.test(s)) return { id: 'well_dry', scale: 0.8 };
  if (/vela|candel|chama/.test(s)) return { id: 'candelabra', scale: 1.2 };
  return { id: 'lectern', scale: 1.35 };
}

function storageGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function storageSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
}

export class WorldController {
  d: Diorama | null = null;
  st: CampaignState | null = null;
  active = false;
  private group = new THREE.Group();
  private roomGroup = new THREE.Group();
  private members: Member[] = [];
  private leader: Member | null = null;
  private crumbs = new Breadcrumbs();
  private cam = new FollowCam();
  private prevCam: CameraController | null = null;
  private prevPointer: Diorama['pointerOverride'] = null;
  private prevTouch = '';
  private offHook: (() => void) | null = null;
  private offSession: (() => void) | null = null;
  private room: Room | null = null;
  private roomNode: string | null = null;
  private roomScene = '';
  private roomEnv: unknown = null;
  private roomSeq = 0;
  private partySeq = 0;
  private pending: { node: string; scene: string; t0: number; env0: unknown; arrive: Arrive; seq: number } | null = null;
  private inters: Inter[] = [];
  private optSig = '';
  private focus: Inter | null = null;
  private extraColliders: Circle[] = [];
  private hiddenEnv: THREE.Object3D[] = [];
  private touchedLeaves: { o: THREE.Object3D; y: number }[] = [];
  private now = 0;
  private waits: { t: number; resolve: () => void }[] = [];
  private seqId = 0;
  private busy = false;
  private cameFrom: string | null = null;
  private handoff: { ids: string[]; rigs: { id: string; rig: Rig }[] } | null = null;
  private handoffOff: (() => void) | null = null;
  private fogRef: THREE.FogExp2 | null = null;
  private fogBase = 0;
  private lantern = new THREE.PointLight(0xffb36b, 16, 11, 1.6);
  private leaderRing: THREE.Mesh;
  private dust = new Particles(96, false);
  private glints = new Particles(96, true);
  private trail = new Trail();
  private trailT = 0;
  private trailFrom = new THREE.Vector3(1e9, 0, 0);
  private trailSig = '';
  private camFixed: THREE.Vector3 | null = null;
  // DOM
  private layer: HTMLDivElement | null = null;
  private joyEl: HTMLDivElement | null = null;
  private knobEl: HTMLElement | null = null;
  private fadeEl: HTMLDivElement | null = null;
  private titleEl: HTMLDivElement | null = null;
  // input
  private keys = new Set<string>();
  private joy = { id: -1, active: false, pending: false, sx: 0, sy: 0, bx: 0, by: 0, x: 0, y: 0, t0: 0, mouse: false, hold: false };
  private joyVec = new THREE.Vector2();
  private uiOpen = false;
  private blockedCheckT = 0;
  private domBlocked = false;
  private path: THREE.Vector3[] | null = null;
  private pathSpeed = WALK_SPEED;
  private pathDone: ((ok: boolean) => void) | null = null;
  private pathDeadline = 0;
  private mouseAimT = 0;
  private hoverT = 0;
  private hintMoved = 0;
  private lastPointer: 'touch' | 'mouse' = 'mouse';
  private captionTimer: ReturnType<typeof setTimeout> | null = null;
  private secretQueue: Inter[] = [];
  private fightPrefetch = new Map<string, Promise<{ sim: CampaignState; rigs: Staged[] } | null>>();

  constructor() {
    this.group.name = 'world';
    this.group.add(this.roomGroup);
    this.lantern.castShadow = false;
    this.group.add(this.lantern);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: TEX.ring(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd27a, toneMapped: false, opacity: 0.55 }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 2;
    this.leaderRing = ring;
    this.group.add(ring, this.dust.points, this.glints.points, this.trail.mesh);
  }

  // =================================================================== lifecycle
  enter(d: Diorama, st: CampaignState) {
    if (this.d && this.d !== d) this.leave();
    this.d = d;
    this.st = st;
    if (!this.active) this.activate();
    if (d.mode !== 'world' && d.mode !== 'cinema') d.setMode('world');
    if (this.busy) return; // a scripted moment owns the room; it re-syncs when done
    if (this.pending && this.pending.node === st.node) return;
    if (this.roomNode !== st.node || !this.room) {
      this.startRoom(st, this.arrivalFor(st));
      return;
    }
    void this.syncParty(st);
    this.refreshOptions();
  }

  private activate() {
    const d = this.d!;
    this.active = true;
    d.scene.add(this.group);
    this.prevCam = d.cameraController;
    d.cameraController = this.cam;
    this.prevPointer = d.pointerOverride;
    d.pointerOverride = this.onPointer;
    const cv = d.renderer.domElement;
    this.prevTouch = cv.style.touchAction;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointercancel', this.onCancel);
    cv.addEventListener('contextmenu', this.onContext);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.offHook = d.addFrameHook(this.frame);
    this.offSession = session.subscribe(this.onSession);
    this.mountDom();
    installWorldActions({ request: (id, from) => this.request(id, from), go: (id) => this.go(id), setUiOpen: (v) => (this.uiOpen = v) });
    worldUi.set({ active: true, busy: false, prompt: null, confirm: null, waiting: null });
    this.hintMoved = storageGet(HINT_KEY) ? 99 : 0;
    this.setFade(1, 0);
    (window as unknown as { __world: unknown }).__world = this;
  }

  leave() {
    if (!this.active) return;
    const d = this.d!;
    this.active = false;
    this.seqId++;
    for (const w of this.waits) w.resolve();
    this.waits.length = 0;
    this.pathDone?.(false);
    this.pathDone = null;
    this.path = null;
    this.pending = null;
    this.offHook?.();
    this.offHook = null;
    this.offSession?.();
    this.offSession = null;
    if (d.cameraController === this.cam) d.cameraController = this.prevCam;
    if (d.pointerOverride === this.onPointer) d.pointerOverride = this.prevPointer;
    const cv = d.renderer.domElement;
    cv.style.touchAction = this.prevTouch;
    cv.removeEventListener('pointercancel', this.onCancel);
    cv.removeEventListener('contextmenu', this.onContext);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.keys.clear();
    this.endJoy();
    installWorldActions(null);
    if (this.captionTimer) clearTimeout(this.captionTimer);
    worldUi.set({ active: false, busy: false, prompt: null, confirm: null, caption: null, hint: null, waiting: null, main: [] });
    // fog back to the location's own density
    if (this.fogRef) this.fogRef.density = this.fogBase;
    this.fogRef = null;
    // the battle starts in this very room: keep our figures until the board's own ones exist
    const handing = this.handoff && session.state?.phase === 'combat';
    const keep: { id: string; rig: Rig; foe?: boolean }[] = [];
    if (handing) {
      for (const m of this.members) keep.push({ id: m.id, rig: m.rig });
      for (const i of this.inters) for (const e of i.enemies) keep.push({ id: e.id, rig: e.rig, foe: true });
    }
    this.clearRoom(!!handing);
    this.restoreEnv();
    d.scene.remove(this.group);
    if (handing) this.startHandoff(keep);
    else {
      for (const m of this.members) m.rig.root.removeFromParent();
      // a battle that started without our staging (online party vote): at least mark the moment
      if (session.state?.phase === 'combat') d.impulse({ flash: 0.45, flashColor: 0xffe2b0 });
    }
    this.members = [];
    this.leader = null;
    this.roomNode = null;
    this.room = null;
    this.handoff = null;
    this.scriptTargets.clear();
    this.scripted = false;
    this.camFixed = null;
    this.cam.glideTo(null);
    this.busy = false;
    this.laidOut = false;
    this.lastT = -1;
    this.fightPrefetch.clear();
    d.resize(); // camera FOV back to the board framing
    this.setFade(0, handing ? 0.05 : 0.35);
    this.unmountDomSoon();
  }

  /** Hand the scene over to the board: our rigs stay until the combat figures are in place, the board rises. */
  private startHandoff(keep: { id: string; rig: Rig; foe?: boolean }[]) {
    const d = this.d!;
    this.handoffOff?.();
    const holder = new THREE.Group();
    holder.name = 'world-handoff';
    d.scene.add(holder);
    for (const k of keep) holder.add(k.rig.root);
    const board = d.board;
    const t0 = performance.now();
    board.position.y = -0.32;
    board.scale.setScalar(0.88);
    d.vfx.ring(new THREE.Vector3(0, 0.06, 0), 'glow', 0xffd9a0, 0.6, 11, 0.9);
    d.vfx.ring(new THREE.Vector3(0, 0.08, 0), 'rune', 0xffc070, 0.4, 7, 1.1);
    const done = () => {
      board.position.y = 0;
      board.scale.setScalar(1);
      for (const k of keep) if (k.foe && k.rig.root.parent === holder) disposeRig(k.rig);
      holder.clear(); // detach every rig (hero rigs go back to the cache for the next visit)
      holder.removeFromParent();
      off();
      this.handoffOff = null;
    };
    const off = d.addFrameHook((dt) => {
      const el = (performance.now() - t0) / 1000;
      const k = Math.min(1, el / 0.55);
      const e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); // ease-out-back
      board.position.y = -0.32 * (1 - Math.min(1, e));
      board.scale.setScalar(0.88 + 0.12 * e);
      for (let i = holder.children.length - 1; i >= 0; i--) {
        const root = holder.children[i];
        const k2 = keep.find((x) => x.rig.root === root);
        if (!k2) continue;
        k2.rig.anim?.update(dt);
        const fig = d.figs.get(k2.id);
        if (fig && fig.rig.root.parent && fig.rig.root.visible && el > 0.12) {
          holder.remove(root);
          if (k2.foe) disposeRig(k2.rig);
        }
      }
      if ((el > 0.6 && !holder.children.length) || el > 2.6 || d.mode === 'cinema') done();
    });
    this.handoffOff = () => {
      done();
    };
  }

  // =================================================================== rooms
  private arrivalFor(st: CampaignState): Arrive {
    const d = dungeon(st.dungeonId);
    if (this.cameFrom && this.cameFrom !== st.node) {
      const from = this.cameFrom;
      this.cameFrom = null;
      return { kind: 'from', loc: from };
    }
    this.cameFrom = null;
    const last = st.completed[st.completed.length - 1];
    const enc = last ? d.encounters.find((e) => e.id === last) : undefined;
    if (enc && enc.locationId === st.node) return { kind: 'formation' };
    if (enc) return { kind: 'from', loc: enc.locationId };
    return { kind: 'south' };
  }

  private startRoom(st: CampaignState, arrive: Arrive) {
    const d = this.d!;
    const loc = dungeon(st.dungeonId).locations.find((l) => l.id === st.node);
    const scene = loc?.scene ?? 'galeria';
    const seq = ++this.roomSeq;
    this.setFade(1, 0);
    this.setBusy(false);
    this.clearRoom(false);
    this.roomNode = null;
    this.room = null;
    this.scriptTargets.clear();
    this.scriptSpeed = WALK_SPEED * 1.15;
    this.scripted = false;
    this.camFixed = null;
    this.cam.glideTo(null);
    this.fightPrefetch.clear();
    for (const m of this.members) m.placed = false;
    this.laidOut = false;
    this.graceFrom = null;
    this.pending = { node: st.node, scene, t0: this.now, env0: d.environment, arrive, seq };
    void d.loadScene(scene);
    void this.syncParty(st);
  }

  private envReady(scene: string, env0: unknown, t0: number): boolean {
    const env = this.d!.environment as { group?: THREE.Object3D } | null;
    if (!env?.group) return false;
    const name = env.group.name ?? '';
    if (name.startsWith('scene:')) return name === `scene:${scene}`;
    return env !== env0 || this.now - t0 > 1.5;
  }

  private async buildRoom() {
    const p = this.pending!;
    const d = this.d!;
    const st = this.st!;
    this.pending = null;
    const seq = p.seq;
    const env = d.environment;
    this.roomEnv = env;
    this.roomScene = p.scene;
    this.restoreEnv();
    this.room = analyzeRoom(env);
    this.roomNode = p.node;
    this.cam.bounds = this.room.walk.bounds;
    this.optSig = '';
    await this.refreshOptions(true);
    if (seq !== this.roomSeq || !this.active) return;
    // wait (briefly) for the party rigs so the fade-in shows everyone
    const t0 = this.now;
    while ((this.members.length < (this.st?.heroes.length ?? 0) || !this.leader) && this.now - t0 < 10 && seq === this.roomSeq && this.active) await this.wait(0.05);
    if (seq !== this.roomSeq || !this.active) return;
    if (p.arrive.kind === 'formation') this.addRemains(st);
    this.arrival = p.arrive;
    this.laidOut = true;
    this.placeParty(p.arrive);
    // reveal the room first (wide), then settle on the party
    this.cam.zoom = p.arrive.kind === 'formation' ? 1.15 : 1.65;
    this.cam.zoomTarget = 1;
    this.cam.snapNext();
    this.frameCamera(0);
    await this.wait(0.06);
    if (seq !== this.roomSeq || !this.active) return;
    this.setFade(0, 0.45);
    this.arrivalCaption(st);
    if (this.hintMoved < 3) worldUi.set({ hint: this.lastPointer === 'touch' || matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'mouse' });
    // a short walk in through the door they came by
    if (p.arrive.kind !== 'formation' && this.leader) {
      const L = this.leader;
      const n = this.arriveDir ?? { x: 0, z: -1 };
      void this.walkLeaderTo(L.pos.x + n.x * 3.4, L.pos.z + n.z * 3.4, WALK_SPEED * 0.9);
    }
  }
  private arriveDir: { x: number; z: number } | null = null;
  private arrival: Arrive = { kind: 'south' };
  /** the party has been placed in this room at least once (late rigs join behind the leader) */
  private laidOut = false;

  /** Rigs that finished loading after the room was laid out join the line behind the leader. */
  private placeLate() {
    if (!this.room || this.pending || !this.leader || !this.laidOut) return;
    const late = this.members.filter((m) => !m.placed);
    if (!late.length) return;
    if (!this.leader.placed) {
      this.placeParty(this.arrival);
      if (this.arrival.kind !== 'formation' && !this.busy) {
        const n = this.arriveDir ?? { x: 0, z: -1 };
        void this.walkLeaderTo(this.leader.pos.x + n.x * 3.4, this.leader.pos.z + n.z * 3.4, WALK_SPEED * 0.9);
      }
      return;
    }
    const dir = new THREE.Vector3();
    for (const m of late) {
      const i = this.members.indexOf(m);
      this.crumbs.sample(Math.max(1, i) * 1.25, m.pos, dir);
      m.yaw = this.leader.yaw;
      m.rig.root.position.copy(m.pos);
      m.placed = true;
    }
  }

  /** Remove everything that belongs to the current room (props, labels, staged enemies). */
  private clearRoom(keepRigs: boolean) {
    for (const i of this.inters) {
      i.tag.remove();
      for (const e of i.enemies) if (!keepRigs) e.rig.root.removeFromParent();
    }
    this.inters = [];
    this.focus = null;
    this.extraColliders = [];
    this.secretQueue = [];
    for (const c of [...this.roomGroup.children]) {
      this.roomGroup.remove(c);
      disposeOwn(c);
    }
    worldUi.set({ prompt: null, main: [] });
    this.trail.setPaths([], 0xffd27a);
    this.trailSig = '';
  }

  private restoreEnv() {
    for (const o of this.hiddenEnv) o.visible = true;
    this.hiddenEnv = [];
    for (const l of this.touchedLeaves) l.o.rotation.y = l.y;
    this.touchedLeaves = [];
  }

  // =================================================================== options → things in the room
  private async refreshOptions(force = false) {
    const st = this.st;
    if (!st || !this.room || !this.d) return;
    const d = dungeon(st.dungeonId);
    const opts = st.phase === 'explore' ? d.options(st) : [];
    const sig = opts.map((o) => `${o.id}|${o.label}|${o.warning ?? ''}`).join(';');
    if (!force && sig === this.optSig) return;
    this.optSig = sig;
    const seq = this.roomSeq;
    const room = this.room;
    const loc = d.locations.find((l) => l.id === st.node);
    const old = new Map(this.inters.map((i) => [i.opt.id, i]));
    const keep = new Set<string>();
    const metas = opts.map((o) => ({ o, m: describeOption(o, d, st) }));
    // doors: destination direction on the dungeon map
    const wants: { key: string; side: Side; pref: number; main?: boolean }[] = [];
    for (const { o, m } of metas) {
      if (old.has(o.id)) {
        keep.add(o.id);
        continue;
      }
      if (o.kind === 'narrative' || m.here) continue;
      const side: Side = o.kind === 'finish' ? 'south' : sideToward(loc?.map, m.dest?.map);
      const pref = m.dest && loc ? (side === 'north' || side === 'south' ? m.dest.map.x - loc.map.x : m.dest.map.y - loc.map.y) : 0;
      wants.push({ key: o.id, side, pref, main: m.main });
    }
    // keep doors that still exist; drop the rest
    for (const [id, i] of old) {
      if (keep.has(id)) {
        i.opt = metas.find((x) => x.o.id === id)!.o;
        i.meta = metas.find((x) => x.o.id === id)!.m;
        continue;
      }
      this.removeInter(i);
    }
    this.inters = this.inters.filter((i) => keep.has(i.opt.id));
    // doors that stay keep their place in the wall
    const reserved = this.inters.filter((i) => i.slot).map((i) => ({ side: i.slot!.side, at: i.slot!.side === 'north' || i.slot!.side === 'south' ? i.slot!.x : i.slot!.z }));
    const slots = placeDoors(room, wants, reserved);
    const built: Promise<void>[] = [];
    for (const { o, m } of metas) {
      if (keep.has(o.id)) continue;
      if (o.kind === 'narrative') built.push(this.addObject(o, m, seq));
      else if (m.here) built.push(this.addEnemies(o, m, seq));
      else {
        const slot = slots.get(o.id);
        if (slot) built.push(this.addDoor(o, m, slot, seq));
      }
    }
    await Promise.all(built);
    if (seq !== this.roomSeq) return;
    this.inters.sort((a, b) => opts.findIndex((o) => o.id === a.opt.id) - opts.findIndex((o) => o.id === b.opt.id));
    const mains = this.inters.filter((i) => i.meta.main).map((i) => i.opt.id);
    worldUi.set({ main: mains.length ? mains : this.inters.map((i) => i.opt.id) });
    this.trailSig = '';
    this.updateVotes();
  }

  private removeInter(i: Inter) {
    i.tag.remove();
    for (const e of i.enemies) e.rig.root.removeFromParent();
    i.group.removeFromParent();
    disposeOwn(i.group);
    for (const l of i.leaves) l.o.rotation.y = l.base;
    if (this.focus === i) {
      this.focus = null;
      worldUi.set({ prompt: null });
    }
    this.extraColliders = this.inters.filter((x) => x !== i).flatMap((x) => x.enemies.map((e) => ({ x: e.pos.x, z: e.pos.z, r: 0.5 })));
  }

  private baseInter(o: ExploreOption, m: Meta, kind: InterKind, color: number): Inter {
    const group = new THREE.Group();
    group.name = `inter:${o.id}`;
    this.roomGroup.add(group);
    const tag = document.createElement('div');
    tag.className = `w-tag ${kind} ${m.fight ? 'fight' : ''} ${m.secret ? 'secret' : ''} ${m.main ? 'main' : ''}`;
    tag.innerHTML = `<div class="w-tag-b"><span class="w-tag-ic"><svg class="ico" viewBox="0 0 48 48"><use href="#${kind === 'enemies' ? 'act_attack_melee' : m.icon}"></use></svg></span><span class="w-tag-t"></span>${m.fight && kind !== 'enemies' ? '<span class="w-tag-x"><svg class="ico" viewBox="0 0 48 48"><use href="#act_attack_melee"></use></svg></span>' : ''}</div><i class="w-tag-arrow"></i>`;
    (tag.querySelector('.w-tag-t') as HTMLElement).textContent = m.title;
    tag.style.visibility = 'hidden';
    this.layer?.appendChild(tag);
    return { opt: o, meta: m, kind, slot: null, at: new THREE.Vector3(), center: new THREE.Vector3(), radius: 2.1, color: new THREE.Color(color), group, pool: null, beyond: null, leaves: [], open: 0, openTarget: 0.18, tag, near: false, hover: false, enemies: [], reveal: 1, prefetched: false };
  }

  private glowPlane(w: number, h: number, map: THREE.Texture, color: THREE.Color, opacity: number, additive = true) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false, side: THREE.DoubleSide }));
    m.userData.own = true;
    return m;
  }

  private async addDoor(o: ExploreOption, m: Meta, slot: DoorSlot, seq: number) {
    const kind: InterKind = o.kind === 'finish' ? 'gate' : 'door';
    const color = m.secret ? COLORS.secret : o.kind === 'finish' ? COLORS.finish : m.fight ? COLORS.fight : COLORS.travel;
    const it = this.baseInter(o, m, kind, color);
    it.slot = slot;
    const n = inward(slot.side);
    const yaw = wallYaw(slot.side);
    const south = slot.side === 'south';
    it.at.set(slot.ax, 0, slot.az);
    it.center.set(slot.x + n.x * 0.6, south ? 1.6 : 3.4, slot.z + n.z * 0.6);
    it.radius = 2.3;
    this.inters.push(it);
    const g = it.group;
    if (slot.portal) {
      for (const leaf of slot.portal.leaves) {
        const sign = /_?r\b|right/i.test(leaf.name) ? -1 : 1;
        it.leaves.push({ o: leaf, base: leaf.rotation.y, sign });
        this.touchedLeaves.push({ o: leaf, y: leaf.rotation.y });
      }
    } else if (!south) {
      const door = this.room?.authored ? await this.kitDoorway(slot) : await model('doorway_gothic').catch(() => null);
      if (seq !== this.roomSeq) return;
      if (door) {
        if (!door.userData.placed) {
          door.position.set(slot.x, 0, slot.z);
          door.rotation.y = yaw;
        }
        door.traverse((x) => {
          if (/^door_?[lr]$|door_?(left|right)|leaf/i.test(x.name)) it.leaves.push({ o: x, base: x.rotation.y, sign: /_?r$|right/i.test(x.name) ? -1 : 1 });
        });
        for (const l of (door.userData.leaves as THREE.Object3D[] | undefined) ?? []) it.leaves.push({ o: l, base: l.rotation.y, sign: 1 });
        g.add(door);
        if (!this.room?.authored) this.hideWallsAround(slot);
      }
    } else if (!this.room?.authored) {
      // the way out towards the camera: a lit threshold between two candle stands
      try {
        for (const s2 of [-1.7, 1.7]) {
          const c = await model('pillar_candle_stand');
          if (seq !== this.roomSeq) return;
          c.position.set(slot.x + s2, 0, Math.min(slot.z, this.room!.walk.bounds.maxZ + 0.2));
          g.add(c);
        }
      } catch {
        /* ignore */
      }
    }
    if (!south) {
      const voidM = this.glowPlane(2.5, 4.4, TEX.void(), new THREE.Color(0x000000), 0.96, false);
      voidM.position.set(slot.x - n.x * 0.75, 2.2, slot.z - n.z * 0.75);
      voidM.rotation.y = yaw;
      voidM.renderOrder = 1;
      g.add(voidM);
      const beyond = this.glowPlane(2.3, 4.0, TEX.portal(), it.color, 0.55);
      beyond.position.set(slot.x - n.x * 0.45, 2.0, slot.z - n.z * 0.45);
      beyond.rotation.y = yaw;
      beyond.renderOrder = 2;
      g.add(beyond);
      it.beyond = beyond;
    }
    const pool = this.glowPlane(south ? 4.6 : 3.8, south ? 3.2 : 3.8, TEX.pool(), it.color, 0.45);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(slot.x + n.x * (south ? -0.2 : 1.25), 0.025, slot.z + n.z * (south ? -0.2 : 1.25));
    g.add(pool);
    it.pool = pool;
    // secrets: the passage rises out of the floor the first time it is seen
    if (m.secret && !this.secretSeen(o.id)) {
      it.reveal = 0;
      g.position.y = -7.5;
      it.tag.classList.add('hidden-tag');
      this.secretQueue.push(it);
    }
  }

  /** An extra doorway for a busy wall, from the same KayKit piece, material and scale as the room's own doors. */
  private async kitDoorway(slot: DoorSlot): Promise<THREE.Object3D | null> {
    const look = this.room?.doorLook;
    let root: THREE.Group;
    try {
      root = (await kit('wall_doorway')).clone(true);
    } catch {
      return model('doorway_gothic').catch(() => null);
    }
    const n = inward(slot.side);
    root.position.set(slot.x + n.x * 0.16, 0, slot.z + n.z * 0.16); // just proud of the wall behind it
    root.rotation.y = wallYaw(slot.side);
    if (look) root.scale.copy(look.scale);
    else root.scale.set(0.75, 0.99, 0.75);
    const leaves: THREE.Object3D[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (look?.material) m.material = look.material;
      if (String(m.userData.part ?? '').endsWith('_door')) leaves.push(m.parent && m.parent !== root ? m.parent : m);
    });
    root.userData.placed = true;
    root.userData.leaves = [...new Set(leaves)];
    return root;
  }

  private hideWallsAround(slot: DoorSlot) {
    if (!this.room) return;
    const horizontal = slot.side === 'north' || slot.side === 'south';
    for (const w of this.room.walls) {
      const b = w.box;
      const cx = (b.min.x + b.max.x) / 2;
      const cz = (b.min.z + b.max.z) / 2;
      const lateral = horizontal ? Math.abs(cx - slot.x) : Math.abs(cz - slot.z);
      const depth = horizontal ? Math.abs(cz - slot.z) : Math.abs(cx - slot.x);
      if (lateral < 2.6 && depth < 1.7 && w.obj.visible) {
        w.obj.visible = false;
        this.hiddenEnv.push(w.obj);
      }
    }
  }

  private async addObject(o: ExploreOption, m: Meta, seq: number) {
    const room = this.room!;
    const it = this.baseInter(o, m, 'object', COLORS.lore);
    this.inters.push(it);
    const avoid = [{ x: 0, z: 0.5, r: 3.2 }, ...this.inters.filter((x) => x.slot).map((x) => ({ x: x.at.x, z: x.at.z, r: 3 })), ...this.inters.filter((x) => x.kind === 'object' && x !== it).map((x) => ({ x: x.center.x, z: x.center.z, r: 3.2 }))];
    const n = this.inters.filter((x) => x.kind === 'object').length - 1;
    const prefer = [
      { x: -5.2, z: -4.5 },
      { x: 5.2, z: -4.5 },
      { x: -5.5, z: 2.5 },
      { x: 5.5, z: 2.5 },
    ][n % 4];
    const p = placeObject(room, avoid, prefer);
    const spec = objectModelFor(o);
    try {
      const obj = await model(spec.id);
      if (seq !== this.roomSeq) return;
      obj.scale.setScalar(spec.scale);
      obj.position.set(p.x, 0, p.z);
      obj.rotation.y = Math.atan2(-p.x, 3 - p.z); // face the room centre
      it.group.add(obj);
    } catch {
      /* the glow still marks it */
    }
    const r = spec.id === 'altar' ? 1.3 : 0.55;
    this.extraColliders.push({ x: p.x, z: p.z, r });
    const toC = tmpV.set(-p.x, 0, 2 - p.z).normalize();
    it.at.set(p.x + toC.x * (r + 0.9), 0, p.z + toC.z * (r + 0.9));
    it.center.set(p.x, spec.id === 'altar' ? 2.2 : 2.0, p.z);
    it.radius = 1.9;
    const pool = this.glowPlane(2.8, 2.8, TEX.pool(), it.color, 0.5);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(p.x, 0.025, p.z);
    it.group.add(pool);
    it.pool = pool;
    const halo = this.glowPlane(1.6, 1.6, TEX.ring(), it.color, 0.5);
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(p.x, 0.04, p.z);
    halo.userData.spin = 0.6;
    it.group.add(halo);
    it.beyond = halo;
  }

  /** Enemies standing in this very room: visible before the fight, they notice the party when it comes close. */
  private async addEnemies(o: ExploreOption, m: Meta, seq: number) {
    const it = this.baseInter(o, m, 'enemies', COLORS.fight);
    this.inters.push(it);
    const res = await this.prefetchFight(o.id);
    if (seq !== this.roomSeq || !res) return;
    it.enemies = res.rigs;
    const c = new THREE.Vector3();
    for (const e of res.rigs) {
      e.rig.root.position.copy(e.pos);
      e.rig.root.rotation.y = e.yaw;
      this.roomGroup.add(e.rig.root);
      c.add(e.pos);
      this.extraColliders.push({ x: e.pos.x, z: e.pos.z, r: 0.5 });
    }
    c.multiplyScalar(1 / Math.max(1, res.rigs.length));
    it.center.set(c.x, 2.4, c.z);
    it.at.set(c.x, 0, c.z + 3.2);
    it.radius = 4.1;
    const pool = this.glowPlane(7.5, 5.5, TEX.pool(), it.color, 0.28);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(c.x, 0.02, c.z);
    it.group.add(pool);
    it.pool = pool;
    this.room?.grid.rebuild([...(this.room?.walk.colliders ?? []), ...this.extraColliders]);
  }

  /** Simulate the option on a copy of the state to know the exact enemies (types and Sectors) — no real state changes. */
  private prefetchFight(optionId: string) {
    let p = this.fightPrefetch.get(optionId);
    if (p) return p;
    const st = this.st!;
    p = (async () => {
      const r = campaignDispatch(st, { t: 'explore', optionId });
      const combat = r.state.combat;
      if (r.error || !combat) return null;
      const foes = combat.figures.filter((f) => f.side === 'E' && f.status === 'active');
      const slots = slotPositions(foes);
      const rigs = await Promise.all(
        foes.map(async (f, i): Promise<Staged> => {
          const rig = await buildEnemyRig(f.typeId);
          const pos = (slots.get(f.id) ?? sectorCenter(f.sector)).clone();
          pos.y = 0;
          // unaware: mostly turned away, each its own way
          const yaw = Math.PI + Math.sin(i * 2.3 + f.id.length) * 0.9;
          rig.root.position.copy(pos);
          rig.root.rotation.y = yaw;
          return { id: f.id, type: f.typeId, rig, pos, yaw, yawTarget: yaw, aware: false, phase: Math.random() * 10, loco: null, action: null, busyUntil: 0 };
        }),
      );
      return { sim: r.state, rigs };
    })().catch((e) => {
      console.warn('world: encounter preview failed', e);
      return null;
    });
    this.fightPrefetch.set(optionId, p);
    return p;
  }

  private addRemains(st: CampaignState) {
    const d = dungeon(st.dungeonId);
    const enc = d.encounters.find((e) => e.id === st.completed[st.completed.length - 1]);
    if (!enc) return;
    let spots: { typeId: string; sector: SectorKey }[] = [];
    try {
      spots = layoutEnemies(enc, st.partySizeOriginal);
    } catch {
      return;
    }
    const pos = slotPositions(spots.map((s, i) => ({ id: `r${i}`, sector: s.sector, order: i, status: 'active' as const })));
    void (async () => {
      const seq = this.roomSeq;
      for (const [i, s] of spots.entries()) {
        const p = pos.get(`r${i}`);
        if (!p) continue;
        try {
          const b = await model('bone_pile');
          if (seq !== this.roomSeq) return;
          b.position.set(p.x, 0.01, p.z);
          b.rotation.y = i * 2.1;
          b.scale.setScalar(s.typeId === 'cao' ? 0.75 : 1);
          this.roomGroup.add(b);
        } catch {
          /* ignore */
        }
        const ash = this.glowPlane(1.6, 1.6, TEX.pool(), new THREE.Color(0x0b0908), 0.75, false);
        ash.rotation.x = -Math.PI / 2;
        ash.position.set(p.x, 0.015, p.z);
        this.roomGroup.add(ash);
      }
    })();
  }

  // =================================================================== party
  private async syncParty(st: CampaignState) {
    const seq = ++this.partySeq;
    const want = st.heroes.map((h) => ({ h, weapon: heroWeapon(h) }));
    // remove heroes no longer in the party
    for (const m of [...this.members]) if (!st.heroes.some((h) => h.id === m.id)) this.dropMember(m);
    await Promise.all(
      want.map(async ({ h, weapon }) => {
        const cur = this.members.find((m) => m.id === h.id);
        if (cur && cur.classId === h.classId && cur.weapon === weapon) {
          if (cur.status !== h.status) this.setStatus(cur, h.status);
          return;
        }
        const key = `${h.id}|${h.classId}|${weapon ?? ''}`;
        const cached = this.rigCache.get(key);
        const rig = cached && !cached.root.parent ? cached : await buildHeroRig(h.classId, weapon);
        if (seq !== this.partySeq || !this.active) {
          if (!cached) this.cacheRig(key, rig);
          return;
        }
        this.cacheRig(key, rig);
        const mem = newMember(h.id, h.classId, weapon, rig, h.status);
        if (cur) {
          mem.pos.copy(cur.pos);
          mem.yaw = cur.yaw;
          this.dropMember(cur);
        }
        rig.root.position.copy(mem.pos);
        this.group.add(rig.root);
        applyGhost(rig, mem.ghost, h.status === 'derrotado');
        this.members.push(mem);
      }),
    );
    if (seq !== this.partySeq) return;
    this.orderParty(st);
    this.placeLate();
  }
  private dropMember(m: Member) {
    m.rig.root.removeFromParent();
    this.members = this.members.filter((x) => x !== m);
  }
  /** Hero rigs survive between visits (one per hero: a new weapon replaces the old rig). */
  private rigCache = new Map<string, Rig>();
  private cacheRig(key: string, rig: Rig) {
    const hero = key.split('|')[0];
    for (const [k, r] of this.rigCache)
      if (k !== key && k.split('|')[0] === hero) {
        this.rigCache.delete(k);
        if (!r.root.parent) disposeRig(r);
      }
    this.rigCache.set(key, rig);
  }
  private setStatus(m: Member, s: Member['status']) {
    const was = m.status;
    m.status = s;
    m.ghostTarget = s === 'ok' ? 0 : 1;
    if (was !== 'ok' && s === 'ok') {
      oneShot(m, 'rise', this.now);
      this.d?.vfx.heal(m.pos.clone());
    }
  }
  /** Leader = first able hero this device controls; then the others; ghosts at the back. */
  private orderParty(st: CampaignState) {
    const order = (m: Member) => {
      const i = st.heroes.findIndex((h) => h.id === m.id);
      const h = st.heroes[i];
      const mine = session.controls(m.id) ? 0 : 1;
      const able = h?.status === 'ok' ? 0 : h?.status === 'caido' ? 1 : 2;
      return able * 100 + mine * 10 + i;
    };
    this.members.sort((a, b) => order(a) - order(b));
    const lead = this.members[0] ?? null;
    if (lead !== this.leader) {
      const old = this.leader;
      this.leader = lead;
      if (old && lead && old !== lead) {
        // the new leader takes the head of the line
        const p = lead.pos.clone();
        lead.pos.copy(old.pos);
        old.pos.copy(p);
      }
    }
  }

  private placeParty(arrive: Arrive) {
    const st = this.st!;
    const room = this.room!;
    const b = room.walk.bounds;
    const d = dungeon(st.dungeonId);
    let spawn = new THREE.Vector3(0, 0, b.maxZ - 0.6);
    let back = { x: 0, z: 1 };
    this.arriveDir = { x: 0, z: -1 };
    if (arrive.kind === 'formation') {
      const figs = st.heroes.map((h, i) => ({ id: h.id, sector: (st.formation[h.id] ?? 'H:F3') as SectorKey, order: i, status: 'active' as const }));
      const slots = slotPositions(figs);
      for (const m of this.members) {
        const p = slots.get(m.id);
        if (p) m.pos.set(p.x, 0, p.z);
        m.yaw = Math.PI;
        m.rig.root.position.copy(m.pos);
        m.rig.root.rotation.y = m.yaw;
        m.placed = true;
      }
      if (this.leader) this.crumbs.reset(this.leader.pos, { x: 0, z: 1 });
      this.arriveDir = null;
      return;
    }
    if (arrive.kind === 'from') {
      const here = d.locations.find((l) => l.id === st.node);
      const from = d.locations.find((l) => l.id === arrive.loc);
      const side = sideToward(here?.map, from?.map);
      const door = this.inters.find((i) => i.slot && i.slot.side === side && i.meta.dest?.id === arrive.loc) ?? this.inters.find((i) => i.slot && i.slot.side === side);
      if (side !== 'south') {
        let slot = door?.slot ?? null;
        if (!slot) {
          // no option leads back there: a closed door marks where the party came in
          slot = placeDoors(room, [{ key: '_back', side, pref: 0 }]).get('_back') ?? null;
          if (slot) void this.decorDoor(slot);
        }
        if (slot) {
          const n = inward(side);
          spawn = new THREE.Vector3(slot.ax - n.x * 0.6, 0, slot.az - n.z * 0.6);
          collide(spawn, room.walk.colliders, b);
          back = { x: -n.x, z: -n.z };
          this.arriveDir = n;
        }
      }
    }
    const yaw = Math.atan2(-back.x, -back.z);
    this.members.forEach((m, i) => {
      m.pos.set(spawn.x + back.x * i * 1.1 + (i % 2 ? 0.35 : -0.35) * (i ? 1 : 0) * Math.abs(back.z), 0, spawn.z + back.z * i * 1.1 + (i % 2 ? 0.35 : -0.35) * (i ? 1 : 0) * Math.abs(back.x));
      m.pos.x = THREE.MathUtils.clamp(m.pos.x, b.minX, b.maxX);
      m.pos.z = THREE.MathUtils.clamp(m.pos.z, b.minZ, b.maxZ);
      // never start inside furniture (the push-out could throw a hero across the room)
      if (blockedAt(m.pos.x, m.pos.z, room.walk.colliders, b)) room.grid.nearestFree(m.pos.x, m.pos.z, m.pos);
      m.yaw = yaw;
      m.vel.set(0, 0, 0);
      m.rig.root.position.copy(m.pos);
      m.rig.root.rotation.y = yaw;
      m.placed = true;
    });
    if (this.leader) {
      this.crumbs.reset(this.leader.pos, back);
      this.graceFrom = this.leader.pos.clone();
    }
  }
  /** Where the party came in: things right at the entrance stay quiet until the party has walked away. */
  private graceFrom: THREE.Vector3 | null = null;

  private async decorDoor(slot: DoorSlot) {
    if (slot.portal) return; // the backdrop already has a passage there
    const seq = this.roomSeq;
    try {
      const door = await model('doorway_gothic');
      if (seq !== this.roomSeq) return;
      door.position.set(slot.x, 0, slot.z);
      door.rotation.y = wallYaw(slot.side);
      this.roomGroup.add(door);
      this.hideWallsAround(slot);
    } catch {
      /* ignore */
    }
  }

  // =================================================================== frame
  private lastT = -1;
  /** Longest simulation step (s). Debug/E2E on software WebGL can raise it to keep real-time pace. */
  dtCap = 0.1;
  private frame = (_dt: number, t: number) => {
    // real elapsed time (the renderer caps its own step at 50 ms; walking must keep pace on slow devices)
    const dt = this.lastT < 0 ? 1 / 60 : Math.min(this.dtCap, Math.max(0, t - this.lastT));
    this.lastT = t;
    this.now = t;
    if (this.waits.length) {
      for (let i = this.waits.length - 1; i >= 0; i--)
        if (this.waits[i].t <= t) {
          const w = this.waits[i];
          this.waits.splice(i, 1);
          w.resolve();
        }
    }
    if (!this.active || !this.d) return;
    const d = this.d;
    // fog: lighter in the world so the high camera sees the room
    const fog = d.scene.fog as THREE.FogExp2 | null;
    if (fog && fog !== this.fogRef && (fog as THREE.FogExp2).isFogExp2) {
      if (this.fogRef) this.fogRef.density = this.fogBase;
      this.fogRef = fog;
      this.fogBase = fog.density;
      fog.density = this.fogBase * 0.55;
    }
    if (this.pending) {
      const named = ((d.environment as { group?: THREE.Object3D } | null)?.group?.name ?? '').startsWith('scene:');
      if (this.envReady(this.pending.scene, this.pending.env0, this.pending.t0) || (!named && this.now - this.pending.t0 > 6) || this.now - this.pending.t0 > 25)
        this.buildRoom().catch((e) => {
          // never leave the player in the dark: show whatever we have
          console.error('world: room build failed', e);
          this.setFade(0, 0.3);
        });
      return;
    }
    if (!this.room) return;
    // the backdrop was rebuilt (quality change, art update): re-read walls and colliders
    if (d.environment !== this.roomEnv && !this.busy && d.environment) {
      const name = (d.environment as { group?: THREE.Object3D }).group?.name ?? '';
      if (!name.startsWith('scene:') || name === `scene:${this.roomScene}`) this.reanalyze();
    }
    const worldMode = d.mode === 'world';
    if (!worldMode) {
      // a cutscene owns the screen: step aside completely until it hands the room back
      if (this.layer) this.layer.style.display = 'none';
      if (this.fadeEl) this.fadeEl.style.display = 'none';
      this.group.visible = false;
      return;
    }
    if (!this.group.visible) this.group.visible = true;
    if (this.layer && this.layer.style.display === 'none') this.layer.style.display = '';
    if (this.fadeEl && this.fadeEl.style.display === 'none') this.fadeEl.style.display = '';
    if (!d.cameraController) d.cameraController = this.cam;
    if (t > this.blockedCheckT) {
      this.blockedCheckT = t + 0.25;
      this.domBlocked = !!document.querySelector('.k-sheet-back, .pt-modal-back, .story-back');
      // keep floating tags between the HUD's top band (place, tracker) and its bottom band (party, action)
      let top = 0;
      for (const el of document.querySelectorAll('.x-top, .x-track')) top = Math.max(top, el.getBoundingClientRect().bottom);
      const bot = document.querySelector('.x-bar')?.getBoundingClientRect().top;
      this.hudTop = top;
      this.hudBottom = bot ? window.innerHeight - bot : 0;
    }
    this.updateLeader(dt);
    this.updateFollowers(dt);
    this.updateStaged(dt);
    this.updateInters(dt, t);
    this.updateTrail(dt, t);
    this.updateCameraFocus();
    this.updateTags();
    this.dust.update(dt);
    this.glints.update(dt);
    const h = d.renderer.domElement.clientHeight || window.innerHeight;
    this.dust.setScale(h);
    this.glints.setScale(h);
    if (this.leader) {
      const L = this.leader;
      this.leaderRing.visible = !this.busy;
      this.leaderRing.position.set(L.pos.x, 0.035, L.pos.z);
      (this.leaderRing.material as THREE.MeshBasicMaterial).opacity = 0.38 + Math.sin(t * 3) * 0.1;
      // the party carries its own warm light
      this.lantern.position.set(L.pos.x, 3.1, L.pos.z + 0.8);
      this.lantern.intensity = 15 + Math.sin(t * 7.3) * 0.8 + Math.sin(t * 17) * 0.5;
    }
    if (this.secretQueue.length && !this.busy && !this.isBlocked()) {
      const it = this.secretQueue.shift()!;
      this.revealSecret(it);
    }
  };

  private reanalyze() {
    const d = this.d!;
    this.roomEnv = d.environment;
    this.restoreEnv();
    if (!this.room) return;
    // new walls and passages: lay the doors out again on them (party and staged enemies stay)
    for (const i of [...this.inters]) if (i.kind === 'door' || i.kind === 'gate') this.removeInter(i);
    this.inters = this.inters.filter((i) => i.kind !== 'door' && i.kind !== 'gate');
    this.room = analyzeRoom(d.environment);
    this.cam.bounds = this.room.walk.bounds;
    this.room.grid.rebuild([...this.room.walk.colliders, ...this.extraColliders]);
    this.optSig = '';
    void this.refreshOptions();
  }

  private isBlocked() {
    const st = this.st;
    return this.uiOpen || this.domBlocked || !!st?.narrative || !!st?.pendingArchive;
  }

  // ------------------------------------------------------------------ leader movement
  private inputVec = new THREE.Vector3();
  private updateLeader(dt: number) {
    const L = this.leader;
    const room = this.room!;
    if (!L || !L.placed) return;
    const blocked = this.isBlocked();
    const iv = this.inputVec.set(0, 0, 0);
    let speed = 0;
    if (!this.busy && !blocked) {
      const k = this.keys;
      const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const kz = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
      if (kx || kz) {
        iv.set(kx, 0, kz).normalize();
        speed = k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_SPEED : WALK_SPEED;
      } else if (this.joy.active && !this.joy.mouse) {
        const m = Math.min(1, this.joyVec.length());
        if (m > 0.12) {
          iv.set(this.joyVec.x, 0, this.joyVec.y).normalize();
          speed = THREE.MathUtils.lerp(1.2, RUN_SPEED * 0.86, (m - 0.12) / 0.88);
        }
      }
      if (speed > 0 && this.path) this.stopPath(false);
    }
    const desired = tmpV.copy(iv).multiplyScalar(speed);
    // scripted / tap-to-walk path
    if (!speed && this.path && this.path.length) {
      const wp = this.path[0];
      const dx = wp.x - L.pos.x;
      const dz = wp.z - L.pos.z;
      const dist = Math.hypot(dx, dz);
      const last = this.path.length === 1;
      if (dist < (last ? 0.18 : 0.45)) {
        this.path.shift();
        if (!this.path.length) this.stopPath(true);
      } else {
        const sp = last ? Math.min(this.pathSpeed, Math.max(1.2, dist * 3)) : this.pathSpeed;
        desired.set(dx / dist, 0, dz / dist).multiplyScalar(sp);
      }
      if (this.path && this.now > this.pathDeadline) this.stopPath(false);
    }
    L.vel.lerp(desired, 1 - Math.exp(-dt * (desired.lengthSq() > L.vel.lengthSq() ? 12 : 16)));
    const px = L.pos.x;
    const pz = L.pos.z;
    let stepX = L.vel.x * dt;
    let stepZ = L.vel.z * dt;
    if (!speed && this.path && this.path.length) {
      // never overshoot the waypoint (long frames on slow devices)
      const wp = this.path[0];
      const rem = Math.hypot(wp.x - px, wp.z - pz);
      const len = Math.hypot(stepX, stepZ);
      if (len > rem && len > 1e-6) {
        stepX *= rem / len;
        stepZ *= rem / len;
      }
    }
    L.pos.x += stepX;
    L.pos.z += stepZ;
    if (!this.scripted) collide(L.pos, room.walk.colliders, room.walk.bounds, BODY_R, this.extraColliders);
    L.speed = Math.hypot(L.pos.x - px, L.pos.z - pz) / Math.max(dt, 1e-4);
    if (L.speed > 0.25) turnTowards(L, Math.atan2(L.pos.x - px, L.pos.z - pz), dt, 12);
    this.crumbs.push(L.pos);
    this.animateMember(L, dt, true);
    // first-time hint: gone once the player has walked a bit
    if (this.hintMoved < 3 && !this.busy && (speed > 0 || this.joy.hold)) {
      this.hintMoved += L.speed * dt;
      if (this.hintMoved >= 3) {
        storageSet(HINT_KEY, '1');
        worldUi.set({ hint: null });
      }
    }
  }
  private scripted = false;

  private animateMember(m: Member, dt: number, isLeader: boolean) {
    const loco = m.speed < 0.25 ? 'idle' : m.speed > 3.7 ? 'run' : 'walk';
    locomote(m, loco, m.speed, this.now);
    m.rig.anim?.update(dt);
    proceduralMotion(m.rig, m.speed, this.now, m.phase);
    m.rig.root.position.set(m.pos.x, 0, m.pos.z);
    m.rig.root.rotation.y = m.yaw;
    if (m.ghost !== m.ghostTarget) {
      m.ghost += Math.sign(m.ghostTarget - m.ghost) * Math.min(Math.abs(m.ghostTarget - m.ghost), dt * 1.5);
      applyGhost(m.rig, m.ghost, m.status === 'derrotado');
    }
    // footsteps + dust
    if (m.speed > 0.6) {
      m.stride += m.speed * dt;
      const stepLen = loco === 'run' ? 1.05 : 0.72;
      if (m.stride > stepLen) {
        m.stride = 0;
        if (isLeader) {
          audio.play(`step_stone_${1 + Math.floor(Math.random() * 3)}`, { volume: loco === 'run' ? 0.28 : 0.2 });
          this.puff(m.pos.x, m.pos.z, loco === 'run' ? 3 : 2);
        } else if (Math.random() < 0.35) this.puff(m.pos.x, m.pos.z, 1);
      }
    }
  }
  private dustColor = new THREE.Color(0x8a8278);
  private puff(x: number, z: number, n: number) {
    for (let i = 0; i < n; i++) this.dust.spawn(x + (Math.random() - 0.5) * 0.3, 0.08, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.25, (Math.random() - 0.5) * 0.5, 0.7 + Math.random() * 0.4, 0.18, 0.55, this.dustColor, 0.34, -0.05, 1.4);
  }

  private updateFollowers(dt: number) {
    const L = this.leader;
    const room = this.room!;
    if (!L) return;
    this.members.forEach((m, i) => {
      m.rig.root.visible = m.placed;
      if (m === L || !m.placed) return;
      if (this.scriptTargets.has(m.id)) {
        this.scriptStep(m, dt);
      } else {
        follow(m, i, this.crumbs, L.speed, dt, room.walk.colliders, room.walk.bounds, this.members, this.extraColliders);
        if (m.speed > 0.25) turnTowards(m, Math.atan2(m.vel.x, m.vel.z), dt, 9);
        else turnTowards(m, L.yaw, dt, 3);
      }
      this.animateMember(m, dt, false);
    });
  }

  /** Scripted positions for followers (formation before a battle). */
  private scriptTargets = new Map<string, THREE.Vector3>();
  private scriptSpeed = WALK_SPEED * 1.15;
  private scriptStep(m: Member, dt: number) {
    const tgt = this.scriptTargets.get(m.id)!;
    const dx = tgt.x - m.pos.x;
    const dz = tgt.z - m.pos.z;
    const dist = Math.hypot(dx, dz);
    const sp = dist < 0.05 ? 0 : Math.min(this.scriptSpeed, dist * 3.5);
    const px = m.pos.x;
    const pz = m.pos.z;
    if (dist > 1e-3) {
      const step = Math.min(dist, sp * dt);
      m.pos.x += (dx / dist) * step;
      m.pos.z += (dz / dist) * step;
    }
    m.speed = Math.hypot(m.pos.x - px, m.pos.z - pz) / Math.max(dt, 1e-4);
    if (m.speed > 0.25) turnTowards(m, Math.atan2(dx, dz), dt, 10);
    else turnTowards(m, Math.PI, dt, 6);
  }

  // ------------------------------------------------------------------ staged enemies
  private updateStaged(dt: number) {
    for (const it of this.inters)
      for (const e of it.enemies) {
        let dy = e.yawTarget - e.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        e.yaw += dy * Math.min(1, dt * 7);
        e.rig.root.rotation.y = e.yaw;
        e.rig.root.position.set(e.pos.x, 0, e.pos.z);
        e.rig.anim?.update(dt);
        proceduralMotion(e.rig, 0, this.now, e.phase);
      }
  }

  private notice(it: Inter, loud = true) {
    if (!it.enemies.length || it.enemies.every((e) => e.aware)) return;
    const L = this.leader;
    const tx = L ? L.pos.x : 0;
    const tz = L ? L.pos.z : 6;
    it.enemies.forEach((e, i) => {
      if (e.aware) return;
      e.aware = true;
      e.yawTarget = Math.atan2(tx - e.pos.x, tz - e.pos.z);
      setTimeout(() => {
        if (!this.active) return;
        const anim = animOf(e.rig);
        if (anim) {
          const dur = anim.play('taunt' as AnimKey, { speed: 1.25 });
          if (dur) e.busyUntil = this.now + dur;
        }
        this.alert(e);
      }, i * 90);
    });
    if (loud) {
      audio.play('intent_reveal', { volume: 0.85 });
      if (it.enemies.some((e) => e.type === 'cao')) audio.play('dog_snarl', { volume: 0.7, delay: 0.15 });
      audio.duck(0.4, 1.6);
    }
  }
  private alert(e: Staged) {
    if (!this.layer || !this.d) return;
    const el = document.createElement('div');
    el.className = 'w-alert';
    el.textContent = '!';
    this.layer.appendChild(el);
    const place = () => {
      if (!this.d) return;
      tmpV2.set(e.pos.x, e.rig.height + 0.45, e.pos.z).project(this.d.camera);
      const w = this.d.renderer.domElement.clientWidth;
      const h = this.d.renderer.domElement.clientHeight;
      el.style.transform = `translate3d(${((tmpV2.x + 1) / 2) * w}px, ${((1 - tmpV2.y) / 2) * h}px, 0)`;
    };
    place();
    const off = this.d.addFrameHook(place);
    el.style.animationDuration = `${1.3 * this.debugSlow}s`;
    setTimeout(() => {
      off();
      el.remove();
    }, 1300 * this.debugSlow);
  }

  // ------------------------------------------------------------------ interactables (proximity, glow)
  private updateInters(dt: number, t: number) {
    const L = this.leader;
    if (L && this.graceFrom && Math.hypot(L.pos.x - this.graceFrom.x, L.pos.z - this.graceFrom.z) > 2.6) this.graceFrom = null;
    let best: Inter | null = null;
    let bestD = Infinity;
    for (const it of this.inters) {
      // glow pulse
      const near = it.near || it.hover;
      const pulse = 0.5 + Math.sin(t * 2.4 + it.at.x) * 0.5;
      if (it.pool) (it.pool.material as THREE.MeshBasicMaterial).opacity = (it.kind === 'enemies' ? 0.18 : 0.32) + pulse * 0.16 + (near ? 0.3 : 0);
      if (it.beyond) {
        const mat = it.beyond.material as THREE.MeshBasicMaterial;
        mat.opacity = (it.kind === 'object' ? 0.35 : 0.35 + it.open * 0.55) + pulse * 0.12 + (near ? 0.2 : 0);
        if (it.beyond.userData.spin) it.beyond.rotation.z += dt * it.beyond.userData.spin;
      }
      // door leaves: ajar, wider when near
      const target = it.openTarget > 0.5 ? it.openTarget : near ? 0.42 : 0.16;
      it.open += (target - it.open) * Math.min(1, dt * (it.openTarget > 0.5 ? 2.2 : 3));
      for (const l of it.leaves) l.o.rotation.y = l.base + l.sign * it.open * 1.45;
      // sparkles over lore objects and the focused door
      if ((it.kind === 'object' || near) && Math.random() < dt * (near ? 9 : 3) && it.reveal >= 1) {
        const a = Math.random() * Math.PI * 2;
        const r = it.kind === 'object' ? 0.7 : 1.2;
        const y0 = it.kind === 'object' ? 0.4 : 0.3;
        this.glints.spawn(it.center.x + Math.cos(a) * r - (it.kind === 'door' ? 0 : 0), y0, (it.kind === 'object' ? it.center.z : it.at.z) + Math.sin(a) * r * 0.6, (Math.random() - 0.5) * 0.2, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.2, 1.4, 0.16, 0.04, it.color, 0.9, -0.1, 0.4);
      }
      if (!L || this.busy || it.reveal < 1) {
        it.near = false;
        continue;
      }
      let dist: number;
      if (it.kind === 'enemies' && it.enemies.length) {
        dist = Infinity;
        for (const e of it.enemies) dist = Math.min(dist, Math.hypot(e.pos.x - L.pos.x, e.pos.z - L.pos.z));
        if (dist < 5.4 && !it.enemies[0].aware) this.notice(it);
      } else dist = Math.hypot(it.at.x - L.pos.x, it.at.z - L.pos.z);
      it.near = dist < it.radius;
      if (it.near && this.graceFrom && Math.hypot(it.at.x - this.graceFrom.x, it.at.z - this.graceFrom.z) < it.radius + 1.2) it.near = false;
      if (it.near && dist < bestD) {
        bestD = dist;
        best = it;
      }
      // prefetch the enemies behind a door the leader walks up to
      if (it.meta.fight && !it.prefetched && dist < 6.5) {
        it.prefetched = true;
        void this.prefetchFight(it.opt.id);
      }
    }
    if (best !== this.focus) {
      this.focus = best;
      if (best) audio.play('ui_hover', { volume: 0.45 });
      worldUi.set({ prompt: best ? this.promptFor(best) : null });
      if (best) worldUi.set({ caption: null });
    }
  }

  private promptFor(it: Inter): WorldPrompt {
    return { optionId: it.opt.id, text: it.meta.text, sub: it.meta.sub, kind: it.opt.kind, fight: it.meta.fight, secret: it.meta.secret, icon: it.meta.icon };
  }

  // ------------------------------------------------------------------ the glowing trail towards the main way
  private updateTrail(dt: number, t: number) {
    const L = this.leader;
    const room = this.room;
    const mains = this.inters.filter((i) => i.meta.main && i.reveal >= 1);
    const show = !!L && !!room && !this.busy && !this.isBlocked() && mains.length > 0 && !mains.some((i) => i.near);
    this.trail.target = show ? 0.85 : 0;
    if (show && L && room) {
      const sig = mains.map((i) => i.opt.id).join();
      if (sig !== this.trailSig || (t > this.trailT && L.pos.distanceTo(this.trailFrom) > 0.6)) {
        this.trailSig = sig;
        this.trailT = t + 0.45;
        this.trailFrom.copy(L.pos);
        const paths: THREE.Vector3[][] = [];
        for (const m of mains.slice(0, 3)) {
          const p = room.grid.path(L.pos.x, L.pos.z, m.at.x, m.at.z);
          if (p) paths.push([L.pos.clone(), ...p]);
        }
        this.trail.setPaths(paths, mains.some((m) => m.meta.fight) ? 0xffc27a : 0xffd27a);
      }
    }
    this.trail.update(t, dt);
  }

  private updateCameraFocus() {
    const L = this.leader;
    if (!L) return;
    if (this.camFixed) {
      this.cam.focus.copy(this.camFixed);
      this.cam.vel.set(0, 0, 0);
      return;
    }
    // weighted centre: the leader counts double
    let x = L.pos.x * 2;
    let z = L.pos.z * 2;
    let n = 2;
    for (const m of this.members) {
      if (m === L) continue;
      x += m.pos.x;
      z += m.pos.z;
      n++;
    }
    this.cam.focus.set(x / n, 0, z / n);
    let ext = 0;
    for (const m of this.members) ext = Math.max(ext, Math.hypot(m.pos.x - this.cam.focus.x, m.pos.z - this.cam.focus.z));
    this.cam.extent += (ext - this.cam.extent) * 0.05;
    this.cam.vel.copy(L.vel);
  }
  private frameCamera(dt: number) {
    this.updateCameraFocus();
    if (this.d) this.cam.update(this.d.camera, dt);
  }

  // ------------------------------------------------------------------ floating tags (DOM)
  private updateTags() {
    const d = this.d!;
    const cv = d.renderer.domElement;
    const w = cv.clientWidth || window.innerWidth;
    const h = cv.clientHeight || window.innerHeight;
    const upright = w / h < 0.9;
    const top = Math.max(upright ? 90 : 56, this.hudTop + 6);
    const bottom = Math.max(upright ? 150 : 90, this.hudBottom + (upright ? 76 : 10));
    const margin = 14;
    const placed: { it: Inter; x: number; y: number; w: number; h: number }[] = [];
    for (const it of this.inters) {
      const el = it.tag;
      // the thing you stand next to is named by the big action button: its floating tag steps aside
      if (it.reveal < 1 || this.busy || (it === this.focus && !it.hover)) {
        if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
        continue;
      }
      tmpV.copy(it.center).project(d.camera);
      const behind = tmpV.z > 1;
      let x = ((tmpV.x + 1) / 2) * w;
      let y = ((1 - tmpV.y) / 2) * h;
      if (behind) {
        x = w - x;
        y = h - y;
      }
      let onScreen = !behind && x > -20 && x < w + 20 && y > -20 && y < h + 20;
      if (!onScreen && !behind && it.kind !== 'enemies') {
        // the top of a door may be off the screen while the door itself is plainly visible
        tmpV2.set(it.center.x, 0.6, it.center.z).project(d.camera);
        const by = ((1 - tmpV2.y) / 2) * h;
        const bx = ((tmpV2.x + 1) / 2) * w;
        if (tmpV2.z < 1 && bx > 0 && bx < w && by > 0 && by < h - bottom) {
          onScreen = true;
          x = bx;
          y = Math.min(y, by);
        }
      }
      if (onScreen) {
        const half = Math.min(w / 2 - margin, this.tagWidth(it) / 2 + 4);
        x = THREE.MathUtils.clamp(x, margin + half, w - margin - half);
        y = THREE.MathUtils.clamp(y, top + 36, h - bottom);
      }
      const inside = onScreen;
      if (!inside) {
        const cx = w / 2;
        const cy = (top + h - bottom) / 2;
        const dx = x - cx;
        const dy = y - cy;
        const sx = (w / 2 - margin - 40) / Math.max(1e-3, Math.abs(dx));
        const sy = ((h - bottom - top) / 2 - 10) / Math.max(1e-3, Math.abs(dy));
        const s = Math.min(sx, sy, 1);
        x = cx + dx * s;
        y = cy + dy * s;
        const ang = Math.atan2(dy, dx);
        el.style.setProperty('--ang', `${ang}rad`);
      }
      el.classList.toggle('edge', !inside);
      el.classList.toggle('near', it.near || it.hover);
      if (el.style.visibility !== 'visible') el.style.visibility = 'visible';
      placed.push({ it, x, y, w: inside ? this.tagWidth(it) : 40, h: 40 });
    }
    // the party must stay visible: tags over the leader fade back
    let lx0 = -1e9;
    let lx1 = -1e9;
    let ly0 = 0;
    let ly1 = 0;
    const L = this.leader;
    if (L) {
      tmpV.set(L.pos.x, 0, L.pos.z).project(d.camera);
      tmpV2.set(L.pos.x, 1.8, L.pos.z).project(d.camera);
      const fx = ((tmpV.x + 1) / 2) * w;
      lx0 = fx - 34;
      lx1 = fx + 34;
      ly0 = ((1 - tmpV2.y) / 2) * h - 8;
      ly1 = ((1 - tmpV.y) / 2) * h + 6;
    }
    // keep tags from piling on top of each other: the lower one steps down (the top band belongs to the HUD)
    placed.sort((a, b) => a.y - b.y);
    for (let i = 0; i < placed.length; i++) {
      const a = placed[i];
      for (let j = 0; j < i; j++) {
        const b = placed[j];
        if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 6 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 2) a.y = b.y + (a.h + b.h) / 2 + 4;
      }
      a.it.tag.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0)`;
      const top2 = a.it.tag.classList.contains('edge') ? a.y - a.h / 2 : a.y - a.h;
      const over = a.x + a.w / 2 > lx0 && a.x - a.w / 2 < lx1 && a.y > ly0 && top2 < ly1;
      a.it.tag.classList.toggle('dim', over && !a.it.hover);
    }
  }
  private tagW = new WeakMap<HTMLElement, number>();
  private hudTop = 0;
  private hudBottom = 0;
  /** Width of the full pill (measured once while it shows its title, not as an edge bubble). */
  private tagWidth(it: Inter) {
    const v = this.tagW.get(it.tag);
    if (v) return v;
    if (it.tag.classList.contains('edge')) return Math.min(300, 60 + it.meta.title.length * 9);
    const m = (it.tag.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
    if (m > 60) this.tagW.set(it.tag, m);
    return m > 60 ? m : Math.min(300, 60 + it.meta.title.length * 9);
  }

  // =================================================================== DOM layers
  private mountDom() {
    if (this.unmountTimer) {
      clearTimeout(this.unmountTimer);
      this.unmountTimer = null;
    }
    if (!this.layer) {
      const layer = document.createElement('div');
      layer.className = 'w-layer';
      const joy = document.createElement('div');
      joy.className = 'w-joy';
      joy.innerHTML = '<i class="w-joy-knob"></i>';
      layer.appendChild(joy);
      document.body.appendChild(layer);
      this.layer = layer;
      this.joyEl = joy;
      this.knobEl = joy.querySelector('.w-joy-knob');
    }
    if (!this.fadeEl) {
      const f = document.createElement('div');
      f.className = 'w-fade';
      document.body.appendChild(f);
      this.fadeEl = f;
      const t = document.createElement('div');
      t.className = 'w-title';
      t.innerHTML = '<small></small><b></b>';
      document.body.appendChild(t);
      this.titleEl = t;
    }
  }
  private unmountTimer: ReturnType<typeof setTimeout> | null = null;
  private unmountDomSoon() {
    if (this.layer) {
      for (const el of [...this.layer.querySelectorAll('.w-tag, .w-alert')]) el.remove();
    }
    this.unmountTimer = setTimeout(() => {
      this.unmountTimer = null;
      if (this.active) return;
      this.layer?.remove();
      this.layer = null;
      this.fadeEl?.remove();
      this.fadeEl = null;
      this.titleEl?.remove();
      this.titleEl = null;
    }, 700);
  }
  private setFade(v: number, dur: number) {
    const f = this.fadeEl;
    if (!f) return;
    f.style.transition = dur > 0 ? `opacity ${dur}s ease` : 'none';
    f.style.opacity = String(v);
    f.style.pointerEvents = v > 0.5 ? 'auto' : 'none';
    if (!dur) void f.offsetWidth;
  }
  private fade(v: number, dur: number) {
    this.setFade(v, dur * this.debugSlow);
    return this.wait(dur);
  }
  private showTitle(kicker: string, name: string) {
    const el = this.titleEl;
    if (!el) return;
    (el.querySelector('small') as HTMLElement).textContent = kicker;
    (el.querySelector('b') as HTMLElement).textContent = name;
    el.classList.remove('show');
    void el.offsetWidth;
    el.style.animationDuration = `${2.1 * this.debugSlow}s`;
    el.classList.add('show');
  }

  private arrivalCaption(st: CampaignState) {
    const loc = dungeon(st.dungeonId).locations.find((l) => l.id === st.node);
    if (!loc) return;
    const key = `mosteiro.world.arrival.${st.id}`;
    let seen: string[] = [];
    try {
      seen = JSON.parse(sessionStorage.getItem(key) ?? '[]');
    } catch {
      /* ignore */
    }
    if (seen.includes(loc.id)) return;
    seen.push(loc.id);
    try {
      sessionStorage.setItem(key, JSON.stringify(seen));
    } catch {
      /* ignore */
    }
    // the story sheet already tells it
    if (st.narrative || st.pendingArchive) return;
    worldUi.set({ caption: { text: loc.arrival, key: Date.now() } });
    if (this.captionTimer) clearTimeout(this.captionTimer);
    this.captionTimer = setTimeout(() => worldUi.set({ caption: null }), Math.min(11000, 3500 + loc.arrival.length * 45));
  }

  private secretSeen(id: string) {
    const st = this.st!;
    try {
      return (JSON.parse(sessionStorage.getItem(`mosteiro.world.secrets.${st.id}`) ?? '[]') as string[]).includes(id);
    } catch {
      return false;
    }
  }
  private markSecret(id: string) {
    const st = this.st!;
    try {
      const k = `mosteiro.world.secrets.${st.id}`;
      const l = JSON.parse(sessionStorage.getItem(k) ?? '[]') as string[];
      if (!l.includes(id)) l.push(id);
      sessionStorage.setItem(k, JSON.stringify(l));
    } catch {
      /* ignore */
    }
  }
  /** A hidden passage grinds up out of the floor, purple light and a discovery sting. */
  private revealSecret(it: Inter) {
    const d = this.d!;
    this.markSecret(it.opt.id);
    const reduced = getSettings().reducedMotion;
    audio.play('sting_secret', { volume: 0.9 });
    audio.play('door_stone', { volume: 0.5, delay: 0.2 });
    audio.duck(0.3, 3);
    d.impulse({ shake: reduced ? 0 : 0.3, flash: 0.25, flashColor: 0xb48cff });
    const t0 = performance.now();
    const base = it.slot ? new THREE.Vector3(it.slot.x, 0.1, it.slot.z) : it.center.clone().setY(0.1);
    d.vfx.ring(base.clone().setY(0.06), 'glow', 0xb48cff, 0.5, 7, 1.2);
    const off = d.addFrameHook(() => {
      const k = Math.min(1, (performance.now() - t0) / 1600);
      it.group.position.y = -7.5 * (1 - easeOut(k));
      if (Math.random() < 0.6) this.puff(base.x + (Math.random() - 0.5) * 3, base.z + (Math.random() - 0.5) * 0.8, 1);
      if (k >= 1) {
        it.reveal = 1;
        it.tag.classList.remove('hidden-tag');
        off();
      }
    });
  }

  // =================================================================== input
  private onKey = (e: KeyboardEvent) => {
    const tg = e.target as HTMLElement | null;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const code = e.code;
    if (/^(Key[WASD]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(code)) {
      this.keys.add(code);
      this.lastPointer = 'mouse';
      if (code.startsWith('Arrow')) e.preventDefault();
    }
    if ((code === 'KeyE' || ((code === 'Enter' || code === 'Space') && (document.activeElement === document.body || document.activeElement === this.d?.renderer.domElement))) && !e.repeat) {
      const f = this.focus;
      if (f && !this.busy && !this.isBlocked()) {
        e.preventDefault();
        this.request(f.opt.id, 'prompt');
      }
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onBlur = () => {
    this.keys.clear();
    this.endJoy();
  };
  private onContext = (e: Event) => e.preventDefault();
  private onCancel = (e: PointerEvent) => {
    if (e.pointerId === this.joy.id) this.endJoy();
  };

  private onPointer = (e: PointerEvent, kind: 'down' | 'move' | 'up'): boolean => {
    if (!this.active || !this.d) return false;
    if (this.d.mode !== 'world') return false;
    const J = this.joy;
    const touch = e.pointerType !== 'mouse';
    if (kind === 'down') {
      if (J.id !== -1 && J.id !== e.pointerId) return true; // second finger: ignore
      if (!touch && e.button !== 0) return true;
      this.lastPointer = touch ? 'touch' : 'mouse';
      if (this.busy || this.isBlocked() || this.pending) return true;
      J.id = e.pointerId;
      J.pending = true;
      J.active = false;
      J.hold = false;
      J.mouse = !touch;
      J.sx = J.bx = J.x = e.clientX;
      J.sy = J.by = J.y = e.clientY;
      J.t0 = performance.now();
      try {
        (e.target as Element).setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      return true;
    }
    if (kind === 'move') {
      if (e.pointerId !== J.id) {
        if (!touch && J.id === -1 && performance.now() > this.hoverT) {
          this.hoverT = performance.now() + 60;
          this.hoverAt(e.clientX, e.clientY);
        }
        return true;
      }
      J.x = e.clientX;
      J.y = e.clientY;
      const dx = J.x - J.sx;
      const dy = J.y - J.sy;
      if (J.pending && Math.hypot(dx, dy) > (touch ? 12 : 8)) {
        J.pending = false;
        J.active = true;
        J.hold = true;
        if (touch) this.showJoy();
        this.stopPath(false);
      }
      if (J.active && touch) this.updateJoy();
      if (J.active && !touch && performance.now() > this.mouseAimT) {
        // PC: hold the button and steer towards the cursor
        this.mouseAimT = performance.now() + 110;
        this.walkToScreen(J.x, J.y, true);
      }
      return true;
    }
    // up
    if (e.pointerId !== J.id) return true;
    const wasTap = J.pending && performance.now() - J.t0 < 450;
    if (wasTap && !this.busy && !this.isBlocked()) this.tapAt(e.clientX, e.clientY);
    this.endJoy();
    return true;
  };

  private showJoy() {
    const el = this.joyEl;
    if (!el) return;
    el.classList.add('on');
    this.updateJoy();
  }
  private updateJoy() {
    const J = this.joy;
    const R = 58;
    let dx = J.x - J.bx;
    let dy = J.y - J.by;
    const len = Math.hypot(dx, dy);
    if (len > R * 1.25) {
      // the base drifts after the thumb so turning around is easy
      const k = (len - R * 1.25) / len;
      J.bx += dx * k;
      J.by += dy * k;
      dx = J.x - J.bx;
      dy = J.y - J.by;
    }
    const l2 = Math.hypot(dx, dy);
    const cl = Math.min(1, R / Math.max(1e-3, l2));
    this.joyVec.set((dx * cl) / R, (dy * cl) / R);
    if (this.joyEl) this.joyEl.style.transform = `translate3d(${J.bx}px, ${J.by}px, 0)`;
    if (this.knobEl) this.knobEl.style.transform = `translate3d(${dx * cl}px, ${dy * cl}px, 0)`;
  }
  private endJoy() {
    const J = this.joy;
    J.id = -1;
    J.active = false;
    J.pending = false;
    J.hold = false;
    this.joyVec.set(0, 0);
    this.joyEl?.classList.remove('on');
  }

  /** Screen point → floor point. */
  private groundAt(x: number, y: number, out: THREE.Vector3): boolean {
    const d = this.d!;
    const r = d.renderer.domElement.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, d.camera);
    return !!ray.ray.intersectPlane(ground, out);
  }
  /** Interactable under a screen point (generous, finger-sized). */
  private pickInter(x: number, y: number): Inter | null {
    const d = this.d!;
    const cv = d.renderer.domElement;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    let best: Inter | null = null;
    let bd = Infinity;
    for (const it of this.inters) {
      if (it.reveal < 1) continue;
      // the floating tag
      const r = (it.tag.firstElementChild ?? it.tag).getBoundingClientRect();
      if (r.width && x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8) return it;
      const pts: THREE.Vector3[] = it.kind === 'enemies' ? it.enemies.map((e) => tmpV2.set(e.pos.x, e.rig.height * 0.55, e.pos.z).clone()) : [it.center.clone().setY(it.kind === 'door' ? 1.8 : it.center.y * 0.6), it.at.clone()];
      for (const p of pts) {
        p.project(d.camera);
        if (p.z > 1) continue;
        const sx = ((p.x + 1) / 2) * w;
        const sy = ((1 - p.y) / 2) * h;
        const dd = Math.hypot(sx - x, sy - y);
        const rad = it.kind === 'door' ? 70 : 52;
        if (dd < rad && dd < bd) {
          bd = dd;
          best = it;
        }
      }
    }
    return best;
  }
  private hoverAt(x: number, y: number) {
    const it = this.busy ? null : this.pickInter(x, y);
    for (const i of this.inters) i.hover = i === it;
    if (this.d) this.d.renderer.domElement.style.cursor = it ? 'pointer' : 'default';
  }
  private tapAt(x: number, y: number) {
    const it = this.pickInter(x, y);
    if (it) {
      this.request(it.opt.id, 'prompt');
      return;
    }
    this.walkToScreen(x, y, false);
  }
  private walkToScreen(x: number, y: number, quiet: boolean) {
    const p = tmpV.set(0, 0, 0);
    if (!this.groundAt(x, y, p) || !this.room || !this.leader) return;
    const b = this.room.walk.bounds;
    p.x = THREE.MathUtils.clamp(p.x, b.minX, b.maxX);
    p.z = THREE.MathUtils.clamp(p.z, b.minZ, b.maxZ);
    const target = p.clone();
    void this.walkLeaderTo(target.x, target.z, WALK_SPEED * 1.08);
    if (!quiet) {
      this.d!.vfx.ring(new THREE.Vector3(target.x, 0.05, target.z), 'glow', 0xffe2a0, 0.15, 1.1, 0.45);
      audio.play('ui_click', { volume: 0.25 });
    }
  }

  // ------------------------------------------------------------------ paths
  private walkLeaderTo(x: number, z: number, speed: number): Promise<boolean> {
    const L = this.leader;
    const room = this.room;
    if (!L || !room) return Promise.resolve(false);
    this.stopPath(false);
    const p = room.grid.path(L.pos.x, L.pos.z, x, z) ?? [new THREE.Vector3(x, 0, z)];
    this.path = p;
    this.pathSpeed = speed;
    let len = 0;
    let px = L.pos.x;
    let pz = L.pos.z;
    for (const w of p) {
      len += Math.hypot(w.x - px, w.z - pz);
      px = w.x;
      pz = w.z;
    }
    this.pathDeadline = this.now + len / Math.max(0.5, speed) + 2.5;
    return new Promise((res) => (this.pathDone = res));
  }
  private stopPath(ok: boolean) {
    this.path = null;
    const f = this.pathDone;
    this.pathDone = null;
    f?.(ok);
  }

  /** Debug: stretch scripted moments (screenshots on slow software rendering). */
  debugSlow = 1;
  private wait(sec: number): Promise<void> {
    return new Promise((res) => {
      if (!this.active) return res();
      this.waits.push({ t: this.now + sec * this.debugSlow, resolve: res });
    });
  }

  private setBusy(v: boolean) {
    this.busy = v;
    worldUi.set({ busy: v, ...(v ? { prompt: null, caption: null } : {}) });
    if (v) {
      this.endJoy();
      this.keys.clear();
    } else this.focus = null;
  }

  // =================================================================== using options
  private voting() {
    return session.role !== 'local' && session.onlineSeats().length > 1;
  }

  /** From the HUD button, the floating tag, a tap on the thing, the paths list, or the E key. */
  request(optionId: string, from: 'prompt' | 'list') {
    const it = this.inters.find((i) => i.opt.id === optionId);
    const st = this.st;
    if (!st || this.busy) return;
    const opt = it?.opt ?? dungeon(st.dungeonId).options(st).find((o) => o.id === optionId);
    if (!opt) return;
    if (opt.warning) {
      worldUi.set({ confirm: { optionId: opt.id, label: opt.label, warning: opt.warning } });
      return;
    }
    this.go(optionId, from);
  }

  go(optionId: string, _from: 'prompt' | 'list' = 'prompt') {
    worldUi.set({ confirm: null });
    const st = this.st;
    if (!st || !this.active) {
      void run({ t: 'explore', optionId }, 'door_stone');
      return;
    }
    if (this.busy) return;
    const it = this.inters.find((i) => i.opt.id === optionId);
    if (!it) {
      void run({ t: 'explore', optionId }, 'door_stone');
      return;
    }
    if (this.voting()) {
      void this.voteAt(it);
      return;
    }
    if (it.opt.kind === 'narrative') void this.useObject(it);
    else if (it.kind === 'enemies') void this.fightHere(it);
    else if (it.meta.fight) void this.fightThroughDoor(it);
    else void this.passDoor(it);
  }

  private updateVotes() {
    const v = Object.entries(session.votes).find(([k, x]) => k.startsWith('explore:') && x.seats.includes(session.localSeat));
    worldUi.set({ waiting: v ? v[0].slice(8) : null });
  }
  private onSession = () => {
    const st = session.state;
    if (!st || !this.active) return;
    this.updateVotes();
    if (st.phase !== 'explore') return;
    this.st = st;
    if (this.busy || this.pending || st.node !== this.roomNode) return;
    void this.refreshOptions();
  };

  /** Online with friends: walk there and cast the vote; the room changes when everybody agrees. */
  private async voteAt(it: Inter) {
    const L = this.leader;
    if (L && Math.hypot(it.at.x - L.pos.x, it.at.z - L.pos.z) > 0.8) await this.walkLeaderTo(it.at.x, it.at.z, RUN_SPEED * 0.8);
    if (!this.active) return;
    if (it.meta.fight || it.opt.kind !== 'narrative') this.cameFrom = this.roomNode;
    it.openTarget = it.kind === 'door' ? 1 : 0;
    await run({ t: 'explore', optionId: it.opt.id }, it.kind === 'door' || it.kind === 'gate' ? 'door_stone' : 'ui_confirm');
    this.updateVotes();
  }

  private async approach(it: Inter, alive: () => boolean, run2 = true) {
    const L = this.leader;
    if (!L) return;
    const dist = Math.hypot(it.at.x - L.pos.x, it.at.z - L.pos.z);
    if (dist > 0.5) {
      const ok = await this.walkLeaderTo(it.at.x, it.at.z, run2 && dist > 4 ? RUN_SPEED * 0.9 : WALK_SPEED * 1.1);
      if (!ok && alive() && L) {
        // could not get there (blocked): glide the last bit
        L.pos.set(it.at.x, 0, it.at.z);
      }
    }
  }

  private faceTo(m: Member, x: number, z: number) {
    m.yaw = Math.atan2(x - m.pos.x, z - m.pos.z);
  }

  /** Walk into a doorway (past the wall line), with the party close behind. */
  private async stepThrough(it: Inter, alive: () => boolean, secs: number) {
    const L = this.leader;
    if (!L || !it.slot) return;
    const n = inward(it.slot.side);
    this.scripted = true;
    this.path = [new THREE.Vector3(it.slot.x - n.x * 1.2, 0, it.slot.z - n.z * 1.2)];
    this.pathSpeed = WALK_SPEED;
    this.pathDeadline = this.now + secs + 1;
    await this.wait(secs);
    if (!alive()) return;
  }

  private async passDoor(it: Inter) {
    const id = ++this.seqId;
    const alive = () => this.active && id === this.seqId;
    this.setBusy(true);
    await this.approach(it, alive);
    if (!alive()) return;
    it.openTarget = 1;
    audio.play('door_stone', { volume: 0.7 });
    if (this.leader && it.slot) this.faceTo(this.leader, it.slot.x, it.slot.z);
    await this.wait(0.25);
    if (!alive()) return;
    void this.stepThrough(it, alive, 0.6);
    this.pushInCamera(it, 0.8);
    await this.wait(0.35);
    audio.play('whoosh_transition', { volume: 0.35 });
    await this.fade(1, 0.3);
    if (!alive()) return;
    this.scripted = false;
    this.cameFrom = this.roomNode;
    const err = await run({ t: 'explore', optionId: it.opt.id }, 'ui_confirm');
    if (!alive()) return; // left the world (finish → epilogue) — leave() fades out
    if (err) {
      this.cameFrom = null;
      this.cam.glideTo(null);
      this.stopPath(false);
      if (this.leader) this.leader.pos.set(it.at.x, 0, it.at.z);
      this.cam.snapNext();
      await this.fade(0, 0.3);
      it.openTarget = 0.18;
      this.setBusy(false);
      return;
    }
    this.setBusy(false);
    const st = session.state;
    if (st && st.phase === 'explore' && st.node === this.roomNode) {
      // same node (rare): just come back in
      this.cam.glideTo(null);
      this.cam.snapNext();
      void this.fade(0, 0.35);
    } else if (st && st.phase === 'explore' && this.d) this.enter(this.d, st); // new room (idempotent if App already asked)
  }

  private pushInCamera(it: Inter, dur: number) {
    if (!this.d || !it.slot) return;
    const cur = this.cam.current({ pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 45 });
    const n = inward(it.slot.side);
    const look = new THREE.Vector3(it.slot.x, 1.6, it.slot.z);
    const pos = cur.pos.clone().lerp(new THREE.Vector3(it.slot.x + n.x * 6, 5.5, it.slot.z + n.z * 6), 0.45);
    this.cam.glideTo({ pos, look: cur.look.clone().lerp(look, 0.6), fov: cur.fov - 3 }, dur);
  }

  private async useObject(it: Inter) {
    const id = ++this.seqId;
    const alive = () => this.active && id === this.seqId;
    this.setBusy(true);
    await this.approach(it, alive, false);
    if (!alive()) return;
    const L = this.leader;
    if (L) {
      this.faceTo(L, it.center.x, it.center.z);
      oneShot(L, 'use', this.now, 1.2);
    }
    audio.play('rune_place', { volume: 0.5 });
    this.d?.vfx.ring(new THREE.Vector3(it.center.x, 0.06, it.center.z), 'holy', it.color.getHex(), 0.4, 3.2, 0.9);
    await this.wait(0.55);
    if (!alive()) return;
    await run({ t: 'explore', optionId: it.opt.id }, 'ui_open');
    if (!alive()) return;
    this.setBusy(false);
    void this.refreshOptions();
  }

  /** The battle pose of the board camera (mirrors Diorama's combat framing) for a seamless hand-off. */
  private combatPose(): Pose {
    const d = this.d!;
    const aspect = d.camera.aspect || 1;
    const dd = d as unknown as { camTune?: { y: number; z: number; lz: number; fov: number }; camTuneL?: { y: number; z: number; lz: number }; camTuneW?: { x: number; y: number; z: number; lz: number } };
    const T = dd.camTune ?? { y: 15.5, z: 10.5, lz: 1.4, fov: 52 };
    const Lt = dd.camTuneL ?? { y: 13, z: 10.2, lz: 1.9 };
    const W = dd.camTuneW ?? { x: 4.6, y: 13.4, z: 10.4, lz: -0.2 };
    if (aspect < 0.9) return { pos: new THREE.Vector3(0, T.y, T.z), look: new THREE.Vector3(0, 0, T.lz), fov: T.fov };
    const narrow = aspect < 1.45;
    const wide = aspect > 1.9;
    const x = wide ? W.x : 0;
    return {
      pos: new THREE.Vector3(x, narrow ? 13.2 : wide ? W.y : Lt.y, narrow ? 11.2 : wide ? W.z : Lt.z),
      look: new THREE.Vector3(x, 0.2, narrow ? 0.6 : wide ? W.lz : Lt.lz),
      fov: aspect < 1.2 ? 52 : aspect < 1.6 ? 42 : 36,
    };
  }

  /** Party to its battle Sectors (from the simulated encounter), then swoop + flash + the real command. */
  private async formUpAndFight(it: Inter, sim: CampaignState, alive: () => boolean, speed: number) {
    const heroes = sim.combat!.figures.filter((f) => f.side === 'H');
    const slots = slotPositions(heroes.map((f) => ({ ...f, status: 'active' as const })));
    let far = 0;
    for (const m of this.members) {
      const p = slots.get(m.id);
      if (!p) continue;
      this.scriptTargets.set(m.id, new THREE.Vector3(p.x, 0, p.z));
      far = Math.max(far, Math.hypot(p.x - m.pos.x, p.z - m.pos.z));
    }
    const walkSecs = THREE.MathUtils.clamp(far / speed + 0.15, 0.6, 1.8);
    this.scriptSpeed = speed;
    const L = this.leader;
    const lp = L ? slots.get(L.id) : undefined;
    if (L && lp) {
      this.scriptTargets.delete(L.id);
      this.scripted = true;
      this.path = [new THREE.Vector3(lp.x, 0, lp.z)];
      this.pathSpeed = speed;
      this.pathDeadline = this.now + walkSecs + 3;
    }
    await this.wait(walkSecs * 0.4);
    if (!alive()) return false;
    this.notice(it);
    await this.wait(walkSecs * 0.6);
    if (!alive()) return false;
    // everyone squares up to the enemy line
    for (const m of this.members) {
      const p = slots.get(m.id);
      if (p) {
        m.pos.set(p.x, 0, p.z);
        this.scriptTargets.set(m.id, m.pos.clone());
      }
    }
    if (L) {
      this.path = null;
      L.vel.set(0, 0, 0);
      L.yaw = Math.PI;
    }
    this.cam.glideTo(this.combatPose(), 0.5);
    await this.wait(0.36);
    if (!alive()) return false;
    const reduced = getSettings().reducedMotion;
    this.d!.impulse({ flash: 0.5, flashColor: 0xffe2b0, shake: reduced ? 0 : 0.22 });
    await this.wait(0.14);
    if (!alive()) return false;
    this.handoff = { ids: [], rigs: [] };
    const err = await run({ t: 'explore', optionId: it.opt.id }, 'bell_toll_short');
    if (!alive()) return true; // the battle took over (leave() ran)
    if (err) {
      this.handoff = null;
      return false;
    }
    return true;
  }

  private async fightHere(it: Inter) {
    const id = ++this.seqId;
    const alive = () => this.active && id === this.seqId;
    this.setBusy(true);
    const res = await this.prefetchFight(it.opt.id);
    if (!alive()) return;
    if (!res) {
      this.setBusy(false);
      void run({ t: 'explore', optionId: it.opt.id }, 'door_stone');
      return;
    }
    this.camFixed = new THREE.Vector3(0, 0, 0.8);
    const ok = await this.formUpAndFight(it, res.sim, alive, RUN_SPEED * 0.85);
    if (!alive()) return;
    if (!ok) this.recover();
  }

  private async fightThroughDoor(it: Inter) {
    const id = ++this.seqId;
    const alive = () => this.active && id === this.seqId;
    const st = this.st!;
    const d = this.d!;
    this.setBusy(true);
    const pre = this.prefetchFight(it.opt.id);
    await this.approach(it, alive);
    if (!alive()) return;
    // 1) the door opens, the party steps in
    it.openTarget = 1;
    audio.play('door_stone', { volume: 0.75 });
    if (this.leader && it.slot) this.faceTo(this.leader, it.slot.x, it.slot.z);
    await this.wait(0.2);
    if (!alive()) return;
    void this.stepThrough(it, alive, 0.55);
    this.pushInCamera(it, 0.7);
    await this.wait(0.3);
    if (!alive()) return;
    audio.play('whoosh_transition', { volume: 0.4 });
    await this.fade(1, 0.26);
    if (!alive()) return;
    this.scripted = false;
    // 2) under black: the destination room with its enemies
    const res = await pre;
    if (!alive()) return;
    if (!res) {
      this.recover();
      return;
    }
    const dd = dungeon(st.dungeonId);
    const encLoc = res.sim.combatEncounterId ? dd.encounters.find((e) => e.id === res.sim.combatEncounterId)?.locationId : it.meta.dest?.id;
    const dest = dd.locations.find((l) => l.id === encLoc) ?? it.meta.dest;
    const scene = dest?.scene ?? this.roomScene;
    const env0 = d.environment;
    const t0 = this.now;
    void d.loadScene(scene);
    while (!this.envReady(scene, env0, t0) && this.now - t0 < 5 && alive()) await this.wait(0.05);
    if (!alive()) return;
    if (dest) audio.setAmbience(dest.ambience);
    this.stageArena(it, res, scene);
    // 3) fade in on the room, the party walks in from the near side
    this.showTitle(dest ? 'Entrando em' : '', dest?.name ?? '');
    await this.fade(0, 0.3);
    if (!alive()) return;
    const ok = await this.formUpAndFight(it, res.sim, alive, RUN_SPEED * 0.92);
    if (!alive()) return;
    if (!ok) this.recover();
  }

  /** Swap the current room for the battle room: keep only the fight's enemies, party at the entrance. */
  private stageArena(it: Inter, res: { sim: CampaignState; rigs: Staged[] }, scene: string) {
    const d = this.d!;
    // drop every other interactable of the old room
    for (const other of [...this.inters]) if (other !== it) this.removeInter(other);
    this.inters = [it];
    it.tag.style.visibility = 'hidden';
    for (const c of [...it.group.children]) {
      it.group.remove(c);
      disposeOwn(c);
    }
    for (const l of it.leaves) l.o.rotation.y = l.base;
    it.leaves = [];
    it.slot = null;
    it.kind = 'enemies';
    this.restoreEnv();
    for (const c of [...this.roomGroup.children])
      if (c !== it.group) {
        this.roomGroup.remove(c);
        disposeOwn(c);
      }
    this.roomEnv = d.environment;
    this.roomScene = scene;
    this.room = analyzeRoom(d.environment);
    this.cam.bounds = null;
    it.enemies = res.rigs;
    this.extraColliders = [];
    for (const e of res.rigs) {
      e.rig.root.position.copy(e.pos);
      this.roomGroup.add(e.rig.root);
      this.extraColliders.push({ x: e.pos.x, z: e.pos.z, r: 0.5 });
    }
    // the party comes in from the camera side
    const b = this.room.walk.bounds;
    const z0 = THREE.MathUtils.clamp(b.maxZ - 0.6, 5.4, 6.4);
    this.members.forEach((m, i) => {
      m.pos.set(i === 0 ? 0 : i % 2 ? 0.75 : -0.75, 0, z0 + Math.ceil(i / 2) * 0.95);
      m.vel.set(0, 0, 0);
      m.yaw = Math.PI;
      m.rig.root.position.copy(m.pos);
    });
    if (this.leader) this.crumbs.reset(this.leader.pos, { x: 0, z: 1 });
    this.camFixed = new THREE.Vector3(0, 0, 1.6);
    const aspect = d.camera.aspect || 1;
    const upright = aspect < 0.9;
    const shot: Pose = upright ? { pos: new THREE.Vector3(0, 14.6, 10.8), look: new THREE.Vector3(0, 0.2, -1.6), fov: 54 } : { pos: new THREE.Vector3(0, 7.4, 13.2), look: new THREE.Vector3(0, 0.6, -2.6), fov: aspect > 1.9 ? 40 : 42 };
    this.cam.glideTo(shot, 0.01);
    this.frameCamera(0.02);
  }

  /** Screen positions of the leader and of every usable thing (for tutorials / hints). */
  screenInfo(): { leader: { x: number; y: number } | null; things: { optionId: string; x: number; y: number; near: boolean; main: boolean }[] } {
    const d = this.d;
    if (!this.active || !d || !this.room) return { leader: null, things: [] };
    const w = d.renderer.domElement.clientWidth;
    const h = d.renderer.domElement.clientHeight;
    const toScreen = (v: THREE.Vector3) => {
      const p = v.clone().project(d.camera);
      return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
    };
    const L = this.leader;
    return {
      leader: L ? toScreen(new THREE.Vector3(L.pos.x, 1.2, L.pos.z)) : null,
      things: this.inters.filter((i) => i.reveal >= 1).map((i) => ({ optionId: i.opt.id, ...toScreen(i.kind === 'door' ? i.center.clone().setY(1.6) : i.center), near: i.near, main: i.meta.main })),
    };
  }

  /** Debug / tests: put the party at (x, z) (followers in a short line behind). */
  debugTeleport(x: number, z: number) {
    this.stopPath(false);
    this.members.forEach((m, i) => {
      m.pos.set(x + (i % 2 ? 0.5 : -0.5) * (i ? 1 : 0), 0, z + i * 0.9);
      m.vel.set(0, 0, 0);
      m.placed = true;
    });
    if (this.leader) this.crumbs.reset(this.leader.pos, { x: 0, z: 1 });
  }

  /** Something failed mid-way: rebuild the room we are really in. */
  private recover() {
    this.handoff = null;
    this.scripted = false;
    this.camFixed = null;
    this.scriptTargets.clear();
    this.cam.glideTo(null);
    this.setBusy(false);
    const st = session.state ?? this.st;
    if (st && st.phase === 'explore') {
      this.st = st;
      this.startRoom(st, { kind: 'south' });
    }
  }
}
