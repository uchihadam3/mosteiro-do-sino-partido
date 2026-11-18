/**
 * Skinned, animated characters (CC0 KayKit packs processed by tools/python/characters).
 * One shared animation library drives every prefab by bone name; weapons attach to hand slots.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Rig } from './characters';
import { buildWeapon, FIG_SCALE } from './characters';
import { flat } from './assets';

const BASE = import.meta.env.BASE_URL + 'assets/characters/';
const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();
let clipsP: Promise<Map<string, THREE.AnimationClip>> | null = null;

function load(path: string): Promise<THREE.Group> {
  let p = cache.get(path);
  if (!p) {
    p = loader.loadAsync(BASE + path).then((g) => g.scene);
    cache.set(path, p);
  }
  return p;
}
export function clips(): Promise<Map<string, THREE.AnimationClip>> {
  if (!clipsP)
    clipsP = loader.loadAsync(BASE + 'anims_rig_medium.glb').then((g) => {
      const m = new Map<string, THREE.AnimationClip>();
      for (const c of g.animations) {
        // drop root translation tracks so figures stay on their Sector
        c.tracks = c.tracks.filter((t) => !(t.name.startsWith('root.') && t.name.endsWith('.position')));
        m.set(c.name, c);
      }
      return m;
    });
  return clipsP;
}

export type AnimKey = 'idle' | 'attack' | 'shoot' | 'cast' | 'raise' | 'hit' | 'block' | 'death' | 'fall' | 'down' | 'rise' | 'spawn' | 'walk' | 'cheer' | 'taunt' | 'use' | 'dodge';

export class AnimController {
  mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  base: string;
  map: Partial<Record<AnimKey, string>>;
  holding = false;
  constructor(root: THREE.Object3D, private lib: Map<string, THREE.AnimationClip>, map: Partial<Record<AnimKey, string>>) {
    this.mixer = new THREE.AnimationMixer(root);
    this.map = map;
    this.base = map.idle ?? 'Idle';
    this.mixer.addEventListener('finished', (e) => {
      if (this.holding) return;
      if ((e.action as THREE.AnimationAction) === this.current) this.loop(this.base);
    });
    this.loop(this.base, 0);
    // desync idles between figures
    this.mixer.setTime(Math.random() * 3);
  }
  private action(name: string) {
    let a = this.actions.get(name);
    if (!a) {
      const c = this.lib.get(name);
      if (!c) return null;
      a = this.mixer.clipAction(c);
      this.actions.set(name, a);
    }
    return a;
  }
  loop(name: string, fade = 0.25) {
    const a = this.action(name);
    if (!a) return;
    a.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current && this.current !== a) this.current.fadeOut(fade);
    this.current = a;
  }
  /** One-shot; returns duration in seconds. hold = stay on last frame (death/fall). */
  play(key: AnimKey, opts: { hold?: boolean; speed?: number } = {}): number {
    const name = this.map[key];
    if (!name) return 0;
    const a = this.action(name);
    if (!a) return 0;
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = !!opts.hold;
    a.timeScale = opts.speed ?? 1;
    a.setEffectiveWeight(1).fadeIn(0.12).play();
    if (this.current && this.current !== a) this.current.fadeOut(0.12);
    this.current = a;
    this.holding = !!opts.hold;
    return a.getClip().duration / (opts.speed ?? 1);
  }
  setBase(key: AnimKey) {
    const name = this.map[key];
    if (!name) return;
    this.base = name;
    this.holding = false;
    this.loop(name, 0.3);
  }
  update(dt: number) {
    this.mixer.update(dt);
  }
}

const SKELETON_ANIMS: Partial<Record<AnimKey, string>> = {
  idle: 'Idle',
  attack: '1H_Melee_Attack_Chop',
  shoot: '1H_Ranged_Shoot',
  cast: 'Spellcast_Shoot',
  raise: 'Spellcast_Raise',
  hit: 'Hit_A',
  block: 'Block_Hit',
  death: 'Death_C_Skeletons',
  fall: 'Death_C_Skeletons',
  spawn: 'Spawn_Ground_Skeletons',
  walk: 'Walking_D_Skeletons',
  cheer: 'Cheer',
  taunt: 'Taunt',
  use: 'Use_Item',
  dodge: 'Dodge_Backward',
};
const HERO_ANIMS: Partial<Record<AnimKey, string>> = {
  idle: 'Idle',
  attack: '1H_Melee_Attack_Slice_Diagonal',
  shoot: '1H_Ranged_Shoot',
  cast: 'Spellcast_Shoot',
  raise: 'Spellcast_Raise',
  hit: 'Hit_A',
  block: 'Block_Hit',
  death: 'Death_A',
  fall: 'Lie_Down',
  down: 'Lie_Idle',
  rise: 'Lie_StandUp',
  walk: 'Walking_A',
  cheer: 'Cheer',
  taunt: 'Taunt',
  use: 'Use_Item',
  dodge: 'Dodge_Backward',
};

const ATTACK_BY_WEAPON: Record<string, string> = {
  item_sword: '1H_Melee_Attack_Slice_Diagonal',
  item_rapier: '1H_Melee_Attack_Stab',
  item_axe: '1H_Melee_Attack_Chop',
  item_hammer: '2H_Melee_Attack_Chop',
  item_spear: '1H_Melee_Attack_Stab',
  item_dagger: 'Dualwield_Melee_Attack_Slice',
  item_bow: '1H_Ranged_Shoot',
  item_crossbow: '1H_Ranged_Shoot',
  item_staff: 'Spellcast_Shoot',
  item_wand: 'Spellcast_Shoot',
  item_orb: 'Spellcast_Shoot',
  item_bell: 'Spellcast_Raise',
  item_censer: 'Spellcast_Raise',
};

async function accessory(name: string): Promise<THREE.Object3D | null> {
  try {
    const g = await load(`acc/${name}.glb`);
    return g.clone(true);
  } catch {
    return null;
  }
}

const HERO_WEAPON_ACC: Record<string, string | null> = {
  item_sword: 'sword_1handed',
  item_rapier: 'sword_1handed',
  item_axe: 'axe_1handed',
  item_hammer: null,
  item_spear: null,
  item_dagger: 'dagger',
  item_bow: null,
  item_crossbow: 'crossbow_1handed',
  item_staff: 'staff',
  item_wand: 'wand',
  item_orb: null,
  item_bell: null,
  item_censer: null,
};

function socket(root: THREE.Object3D, name: string) {
  return root.getObjectByName(name) ?? null;
}

interface SkinnedSpec {
  prefab: string;
  scale: number;
  accent: number;
  right?: string | null; // accessory id or `proc:<weaponIcon>`
  left?: string | null;
  anims: Partial<Record<AnimKey, string>>;
  kind?: Rig['kind'];
  eyes?: number;
  extras?: (rig: Rig, model: THREE.Object3D) => void;
  idle?: Rig['idle'];
}

export async function buildSkinned(spec: SkinnedSpec): Promise<Rig> {
  const [src, lib] = await Promise.all([load(`${spec.prefab}.glb`), clips()]);
  const model = SkeletonUtils.clone(src) as THREE.Group;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(model);
  model.rotation.y = 0;
  // normalize by the bind-pose bounding box: a human-sized figure is ~1.75 m before FIG_SCALE
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const rawH = Math.max(0.01, box.max.y - box.min.y);
  const s = (spec.scale * 1.62) / rawH;
  root.scale.setScalar(s);
  (root.userData as { rawH: number }).rawH = rawH;
  const mats: THREE.MeshStandardMaterial[] = [];
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    mat.roughness = 0.82;
    mat.metalness = 0.05;
    if (/Eyes/i.test(m.name) && spec.eyes !== undefined) {
      mat.emissive = new THREE.Color(spec.eyes);
      mat.emissiveIntensity = 3.2;
    }
    mat.userData.baseEmissive = mat.emissive.clone();
    mat.userData.baseEmissiveIntensity = mat.emissiveIntensity;
    m.material = mat;
    mats.push(mat);
  });
  const accent = new THREE.Color(spec.accent);
  const attach = async (slotName: string, id: string | null | undefined) => {
    if (!id) return;
    const slot = socket(model, slotName);
    if (!slot) return;
    let obj: THREE.Object3D | null = null;
    if (id.startsWith('proc:')) {
      obj = buildWeapon(id.slice(5), accent);
      obj.scale.setScalar(0.95 / s);
      obj.rotation.set(0, 0, 0);
    } else obj = await accessory(id);
    if (obj) {
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          const mat = (m.material as THREE.MeshStandardMaterial).clone();
          mat.userData.baseEmissive = mat.emissive.clone();
          mat.userData.baseEmissiveIntensity = mat.emissiveIntensity;
          m.material = mat;
          mats.push(mat);
        }
      });
      slot.add(obj);
    }
  };
  await attach('handslot.r', spec.right);
  await attach('handslot.l', spec.left);
  const rig: Rig = {
    root,
    body,
    torso: new THREE.Group(),
    head: new THREE.Group(),
    armR: new THREE.Group(),
    armL: new THREE.Group(),
    weaponSlot: new THREE.Group(),
    offSlot: new THREE.Group(),
    kind: spec.kind ?? 'humanoid',
    height: rawH * s,
    scale: s,
    mats,
    accent,
    extras: {},
    idle: spec.idle ?? { speed: 1, sway: 0, bob: 0, hunch: 0 },
    anim: new AnimController(model, lib, spec.anims),
  };
  spec.extras?.(rig, model);
  return rig;
}

// ------------------------------------------------------------------ prefab table
export async function buildHeroSkinned(classId: string, weaponIcon?: string): Promise<Rig> {
  const w = weaponIcon ?? { guerreiro: 'item_sword', paladino: 'item_sword', arcanista: 'item_staff', clerigo: 'item_staff', arqueiro: 'item_bow', ladino: 'item_dagger' }[classId]!;
  const accRight = HERO_WEAPON_ACC[w] === undefined ? null : HERO_WEAPON_ACC[w] ?? `proc:${w}`;
  const anims = { ...HERO_ANIMS, attack: ATTACK_BY_WEAPON[w] ?? HERO_ANIMS.attack };
  const accent = { guerreiro: 0xc0473e, paladino: 0xe0b85a, arcanista: 0x8b86ef, clerigo: 0xf2e6c4, arqueiro: 0x78a85d, ladino: 0x4fb0a8 }[classId] ?? 0xc8a75e;
  let left: string | null = null;
  let right: string | null = accRight;
  if (classId === 'paladino') left = 'shield_badge';
  if (classId === 'guerreiro' && (w === 'item_sword' || w === 'item_axe')) left = 'shield_round';
  if (classId === 'ladino') left = 'dagger';
  if (w === 'item_bow') {
    left = 'proc:item_bow';
    right = null;
  }
  if (w === 'item_hammer' || w === 'item_spear') anims.idle = '2H_Melee_Idle';
  return buildSkinned({
    prefab: `hero_${classId}`,
    scale: 1,
    accent,
    right,
    left,
    anims,
    extras: (rig, model) => {
      if (classId === 'arcanista') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.012, 6, 64), flat(accent, { emissive: accent, emissiveIntensity: 2.4, transparent: true, opacity: 0.8 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.08;
        rig.body.add(ring);
        rig.extras.runeRing = ring;
      }
      if (classId === 'clerigo') {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.012, 6, 48), flat(0xfff2c0, { emissive: 0xffe08a, emissiveIntensity: 1.1, transparent: true, opacity: 0.6 }));
        const head = model.getObjectByName('head');
        if (head) {
          halo.position.set(0, 0.95, -0.22);
          halo.rotation.x = Math.PI / 2.4;
          head.add(halo);
          rig.extras.halo = halo;
        }
      }
    },
  });
}

const ENEMY_SPECS: Record<string, Omit<SkinnedSpec, 'anims'> & { anims?: Partial<Record<AnimKey, string>> }> = {
  penitente: { prefab: 'enemy_penitente', scale: 0.95, accent: 0xb07bff, eyes: 0xb07bff, idle: { speed: 0.6, sway: 0.03, bob: 0, hunch: 0 }, anims: { attack: 'Unarmed_Melee_Attack_Punch_A', idle: 'Idle_B' } },
  besteiro: { prefab: 'enemy_besteiro', scale: 1, accent: 0xd88a3a, eyes: 0xffa040, right: 'Skeleton_Crossbow', anims: { attack: '1H_Ranged_Shoot' } },
  escudeiro: { prefab: 'enemy_escudeiro', scale: 1.05, accent: 0x9aa4ad, eyes: 0xff6a2a, right: 'Skeleton_Blade', left: 'Skeleton_Shield_Large_A', anims: { idle: 'Idle_Combat', attack: '1H_Melee_Attack_Chop' } },
  acolito: { prefab: 'enemy_acolito', scale: 0.9, accent: 0xb07bff, eyes: 0xb07bff, right: 'proc:item_bell', anims: { attack: 'Spellcast_Raise' } },
  turiferario: { prefab: 'enemy_turiferario', scale: 1, accent: 0xff8a3a, eyes: 0xff7a2a, right: 'proc:item_censer', anims: { attack: 'Spellcast_Shoot' } },
  carcereiro: { prefab: 'enemy_carcereiro', scale: 1.15, accent: 0xc0a070, right: 'axe_1handed', anims: { ...HERO_ANIMS, attack: '1H_Melee_Attack_Chop', idle: 'Idle_Combat' } },
  carrasco: { prefab: 'enemy_carrasco', scale: 1.2, accent: 0xc2463a, anims: { ...HERO_ANIMS, attack: '2H_Melee_Attack_Chop', idle: '2H_Melee_Idle' } },
  cantor: { prefab: 'enemy_cantor', scale: 1.15, accent: 0xff5a4a, eyes: 0xff5a3a, anims: { attack: 'Spellcast_Long', idle: 'Idle' } },
  cavaleiro: { prefab: 'enemy_cavaleiro', scale: 1.3, accent: 0x9fb4c8, anims: { ...HERO_ANIMS, attack: '2H_Melee_Attack_Slice', idle: '2H_Melee_Idle' } },
  vigia: { prefab: 'enemy_vigia', scale: 1.45, accent: 0xa8d8ff, eyes: 0xa8d8ff, right: 'Skeleton_Staff', anims: { attack: 'Spellcast_Shoot', idle: 'Idle' } },
  severin: { prefab: 'enemy_severin', scale: 1.6, accent: 0xffa04a, right: 'proc:item_hammer', anims: { ...HERO_ANIMS, attack: '2H_Melee_Attack_Chop', idle: '2H_Melee_Idle', cast: 'Spellcast_Summon' } },
};

export function hasSkinnedEnemy(type: string) {
  return !!ENEMY_SPECS[type];
}
export async function buildEnemySkinned(type: string): Promise<Rig> {
  const sp = ENEMY_SPECS[type];
  const skeleton = sp.prefab.includes('penitente') || ['besteiro', 'escudeiro', 'acolito', 'turiferario', 'cantor', 'vigia'].includes(type);
  const base = skeleton ? SKELETON_ANIMS : HERO_ANIMS;
  return buildSkinned({
    ...sp,
    anims: { ...base, ...(sp.anims ?? {}) },
    kind: type === 'vigia' || type === 'cantor' ? 'specter' : 'humanoid',
    extras: (rig, model) => {
      if (type === 'vigia') {
        const colors = [0xffd27a, 0x9fd4ff, 0xff7a5a];
        for (let i = 0; i < 3; i++) {
          const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), flat(colors[i], { emissive: colors[i], emissiveIntensity: 4 }));
          rig.body.add(l);
          rig.extras[`lantern${i}`] = l;
        }
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && !/Eyes/i.test(m.name)) {
            const mat = m.material as THREE.MeshStandardMaterial;
            mat.transparent = true;
            mat.opacity = 0.85;
            mat.emissive = new THREE.Color(0x203048);
            mat.emissiveIntensity = 0.6;
            mat.userData.baseEmissive = mat.emissive.clone();
            mat.userData.baseEmissiveIntensity = 0.6;
          }
        });
      }
      if (type === 'severin') {
        // chain of small bells across the chest
        const chest = model.getObjectByName('chest');
        if (chest) {
          for (let i = 0; i < 5; i++) {
            const b = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 10), flat(0xd8b070, { metalness: 0.8, roughness: 0.35 }));
            b.position.set(-0.36 + i * 0.18, 0.15 - Math.abs(i - 2) * 0.05, 0.38);
            chest.add(b);
          }
        }
      }
      if (type === 'cantor') {
        const head = model.getObjectByName('head');
        if (head) {
          const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.015, 6, 48), flat(0xff7a4a, { emissive: 0xff7a4a, emissiveIntensity: 2 }));
          halo.position.set(0, 0.9, -0.25);
          halo.rotation.x = Math.PI / 2.4;
          head.add(halo);
          rig.extras.halo = halo;
        }
      }
    },
  });
}
