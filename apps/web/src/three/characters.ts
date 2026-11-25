/**
 * Procedural character prefabs. Each class and enemy has its own silhouette, palette and motion language.
 * Built from lathe/extrude/capsule parts with PBR texture sets; rigs are rigid-part hierarchies animated in code.
 * (Hero weapons follow the equipped Primary, so loot changes the look.)
 */
import * as THREE from 'three';
import { flat, model, pbr } from './assets';

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armR: THREE.Group;
  armL: THREE.Group;
  weaponSlot: THREE.Group;
  offSlot: THREE.Group;
  kind: 'humanoid' | 'beast' | 'chest' | 'specter';
  height: number;
  scale: number;
  mats: THREE.MeshStandardMaterial[];
  accent: THREE.Color;
  extras: Record<string, THREE.Object3D>;
  /** Per-prefab idle personality. */
  idle: { speed: number; sway: number; bob: number; hunch: number };
  weaponType?: string;
  /** Fresnel rim light (set by the Diorama: team colour, pulses on the active figure). */
  rim?: { color: THREE.Color; strength: { value: number } };
  /** Death dissolve (0 = whole, 1 = gone) — skinned rigs burn away with glowing edges. */
  dissolve?: { value: number };
  /** Skinned prefab animation controller (KayKit rig). */
  anim?: { play(key: string, opts?: { hold?: boolean; speed?: number }): number; setBase(key: string): void; update(dt: number): void; holding: boolean; map: Record<string, string | undefined> };
}

// ------------------------------------------------------------------ geometry helpers (cached)
const geoCache = new Map<string, THREE.BufferGeometry>();
function g<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let x = geoCache.get(key);
  if (!x) {
    x = make();
    geoCache.set(key, x);
  }
  return x as T;
}
function lathe(key: string, pts: [number, number][], seg = 28) {
  return g(`lathe:${key}`, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg));
}
function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, pos?: [number, number, number], rot?: [number, number, number], scale?: [number, number, number] | number) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (typeof scale === 'number') m.scale.setScalar(scale);
  else if (scale !== undefined) m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const sphere = (r: number, w = 20, h = 14) => g(`sph:${r}:${w}`, () => new THREE.SphereGeometry(r, w, h));
const capsule = (r: number, l: number) => g(`cap:${r}:${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 14));
const cyl = (rt: number, rb: number, h: number, s = 16) => g(`cyl:${rt}:${rb}:${h}:${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const box = (x: number, y: number, z: number) => g(`box:${x}:${y}:${z}`, () => new THREE.BoxGeometry(x, y, z));
const cone = (r: number, h: number, s = 16) => g(`cone:${r}:${h}:${s}`, () => new THREE.ConeGeometry(r, h, s));
const torus = (r: number, t: number, arc = Math.PI * 2) => g(`tor:${r}:${t}:${arc}`, () => new THREE.TorusGeometry(r, t, 8, 28, arc));

function extrude(key: string, shape: THREE.Shape, depth: number, bevel = 0.01) {
  return g(`ext:${key}`, () => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 10 });
    geo.translate(0, 0, -depth / 2);
    return geo;
  });
}

// ------------------------------------------------------------------ weapon builders (z+ = forward, grip at origin, blade +Y)
function blade(len: number, w: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, len * 0.85);
  s.lineTo(0, len);
  s.lineTo(w / 2, len * 0.85);
  s.lineTo(w / 2, 0);
  s.lineTo(-w / 2, 0);
  return s;
}
export function buildWeapon(type: string, accent: THREE.Color): THREE.Group {
  const grp = new THREE.Group();
  const steel = pbr('iron_rusted', { color: 0xc8ccd2, roughness: 0.55, metalness: 0.9 });
  const wood = pbr('wood_dark');
  const leather = pbr('leather');
  const bronze = pbr('bronze_aged', { color: 0xe0c080 });
  const glow = flat(accent, { emissive: accent, emissiveIntensity: 2.2 });
  const add = (m: THREE.Object3D) => grp.add(m);
  switch (type) {
    case 'item_sword':
    case 'item_rapier': {
      const r = type === 'item_rapier';
      add(mesh(extrude(`blade${r}`, blade(r ? 0.95 : 0.85, r ? 0.035 : 0.075), 0.012), steel, [0, 0.12, 0]));
      add(mesh(box(r ? 0.16 : 0.24, 0.03, 0.05), bronze, [0, 0.12, 0]));
      add(mesh(cyl(0.02, 0.02, 0.18), leather, [0, 0.02, 0]));
      add(mesh(sphere(0.03), bronze, [0, -0.08, 0]));
      if (r) add(mesh(torus(0.06, 0.008, Math.PI), bronze, [0, 0.12, 0.02], [0, 0, Math.PI]));
      break;
    }
    case 'item_dagger': {
      add(mesh(extrude('dagger', blade(0.38, 0.06), 0.01), steel, [0, 0.08, 0]));
      add(mesh(box(0.14, 0.025, 0.04), bronze, [0, 0.08, 0]));
      add(mesh(cyl(0.018, 0.018, 0.12), leather, [0, 0.01, 0]));
      break;
    }
    case 'item_axe': {
      add(mesh(cyl(0.022, 0.022, 0.95), wood, [0, 0.38, 0]));
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.quadraticCurveTo(0.22, -0.08, 0.26, -0.16);
      s.lineTo(0.28, 0.22);
      s.quadraticCurveTo(0.2, 0.12, 0, 0.12);
      s.lineTo(0, 0);
      add(mesh(extrude('axehead', s, 0.025), steel, [0.01, 0.72, 0]));
      break;
    }
    case 'item_hammer': {
      add(mesh(cyl(0.024, 0.024, 0.85), wood, [0, 0.33, 0]));
      add(mesh(box(0.3, 0.14, 0.14), steel, [0, 0.78, 0]));
      add(mesh(box(0.32, 0.03, 0.16), bronze, [0, 0.78, 0]));
      break;
    }
    case 'item_spear': {
      add(mesh(cyl(0.02, 0.02, 1.9), wood, [0, 0.6, 0]));
      add(mesh(extrude('spearhead', blade(0.3, 0.07), 0.012), steel, [0, 1.52, 0]));
      add(mesh(box(0.1, 0.03, 0.03), bronze, [0, 1.52, 0]));
      break;
    }
    case 'item_bow': {
      const arc = mesh(torus(0.62, 0.018, Math.PI * 0.9), wood, [0, 0.3, 0], [0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.05]);
      add(arc);
      const string = new THREE.Mesh(cyl(0.004, 0.004, 1.18, 4), flat(0xd8ccb0));
      string.position.set(0, 0.3, -0.1);
      add(string);
      break;
    }
    case 'item_crossbow': {
      add(mesh(box(0.06, 0.06, 0.6), wood, [0, 0.05, 0.15]));
      add(mesh(torus(0.32, 0.016, Math.PI * 0.8), steel, [0, 0.07, 0.35], [Math.PI / 2, 0, Math.PI * 0.1 + Math.PI]));
      break;
    }
    case 'item_staff': {
      add(mesh(cyl(0.025, 0.03, 1.7), wood, [0, 0.55, 0]));
      add(mesh(torus(0.09, 0.012), bronze, [0, 1.42, 0]));
      add(mesh(g('crystal', () => new THREE.OctahedronGeometry(0.075, 0)), glow, [0, 1.45, 0]));
      break;
    }
    case 'item_wand': {
      add(mesh(cyl(0.012, 0.016, 0.4), wood, [0, 0.15, 0]));
      add(mesh(g('crystal2', () => new THREE.OctahedronGeometry(0.04, 0)), glow, [0, 0.37, 0]));
      break;
    }
    case 'item_orb': {
      add(mesh(sphere(0.1), flat(accent, { emissive: accent, emissiveIntensity: 1.4, roughness: 0.1, metalness: 0.2 }), [0, 0.15, 0]));
      add(mesh(torus(0.13, 0.008), bronze, [0, 0.15, 0], [Math.PI / 2.4, 0, 0]));
      break;
    }
    case 'item_bell': {
      add(mesh(lathe('handbell', [[0, 0.22], [0.05, 0.2], [0.07, 0.12], [0.1, 0.02], [0.11, 0]]), bronze, [0, 0.02, 0]));
      add(mesh(cyl(0.015, 0.015, 0.14), wood, [0, 0.29, 0]));
      break;
    }
    case 'item_censer': {
      add(mesh(cyl(0.004, 0.004, 0.5, 4), steel, [0, -0.2, 0]));
      const pot = mesh(lathe('censer', [[0, -0.12], [0.08, -0.08], [0.1, 0], [0.06, 0.08], [0, 0.12]]), bronze, [0, -0.5, 0]);
      add(pot);
      add(mesh(sphere(0.04), flat(0xff7a2a, { emissive: 0xff6010, emissiveIntensity: 2 }), [0, -0.5, 0]));
      break;
    }
    default: {
      add(mesh(extrude('blade-default', blade(0.8, 0.07), 0.012), steel, [0, 0.12, 0]));
    }
  }
  return grp;
}

function shield(kind: 'kite' | 'round' | 'tower' | 'broken', face: THREE.Material, rim: THREE.Material) {
  const s = new THREE.Shape();
  if (kind === 'round') s.absarc(0, 0, 0.32, 0, Math.PI * 2, false);
  else if (kind === 'tower') {
    s.moveTo(-0.33, 0.45);
    s.lineTo(0.33, 0.45);
    s.lineTo(0.33, -0.45);
    s.quadraticCurveTo(0, -0.62, -0.33, -0.45);
    s.lineTo(-0.33, 0.45);
  } else {
    s.moveTo(-0.3, 0.36);
    s.quadraticCurveTo(0, 0.42, 0.3, 0.36);
    s.quadraticCurveTo(0.3, -0.1, 0, -0.5);
    s.quadraticCurveTo(-0.3, -0.1, -0.3, 0.36);
    if (kind === 'broken') {
      const h = new THREE.Path();
      h.moveTo(0.3, 0.36);
      h.lineTo(0.12, 0.05);
      h.lineTo(0.22, -0.05);
      h.lineTo(0.3, -0.02);
      s.holes.push(h);
    }
  }
  const grp = new THREE.Group();
  grp.add(mesh(extrude(`shield-${kind}`, s, 0.05, 0.02), face));
  const r = mesh(extrude(`shieldrim-${kind}`, s, 0.02, 0.0), rim, [0, 0, -0.035], undefined, [1.05, 1.05, 1]);
  grp.add(r);
  return grp;
}

/** Figures read larger than life on the board for legibility. */
export const FIG_SCALE = 1.32;

// ------------------------------------------------------------------ rig skeleton
function baseRig(kind: Rig['kind'], height: number, scale: number, accent: THREE.ColorRepresentation): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const torso = new THREE.Group();
  const head = new THREE.Group();
  const armR = new THREE.Group();
  const armL = new THREE.Group();
  const weaponSlot = new THREE.Group();
  const offSlot = new THREE.Group();
  root.add(body);
  body.add(torso);
  torso.add(head);
  torso.add(armR);
  torso.add(armL);
  armR.add(weaponSlot);
  armL.add(offSlot);
  root.scale.setScalar(scale * FIG_SCALE);
  return { root, body, torso, head, armR, armL, weaponSlot, offSlot, kind, height: height * scale * FIG_SCALE, scale: scale * FIG_SCALE, mats: [], accent: new THREE.Color(accent), extras: {}, idle: { speed: 1, sway: 0.02, bob: 0.015, hunch: 0 } };
}

function arm(rig: Rig, side: 1 | -1, mat: THREE.Material, shoulderY: number, shoulderX: number, len = 0.55, thick = 0.07, hand?: THREE.Material) {
  const a = side === 1 ? rig.armR : rig.armL;
  a.position.set(shoulderX * side, shoulderY, 0);
  a.add(mesh(capsule(thick, len * 0.7), mat, [0, -len / 2, 0]));
  a.add(mesh(sphere(thick * 1.15), hand ?? mat, [0, -len, 0.02]));
  const slot = side === 1 ? rig.weaponSlot : rig.offSlot;
  slot.position.set(0, -len, 0.04);
  slot.rotation.set(Math.PI / 2.6, 0, 0);
}

function legs(rig: Rig, mat: THREE.Material, hip: number, spread = 0.11, thick = 0.08, boot?: THREE.Material) {
  for (const s of [1, -1]) {
    rig.body.add(mesh(capsule(thick, hip * 0.62), mat, [spread * s, hip / 2, 0]));
    rig.body.add(mesh(box(thick * 2.1, 0.08, thick * 3), boot ?? mat, [spread * s, 0.04, 0.04]));
  }
}

// ------------------------------------------------------------------ heroes
export interface HeroLook {
  classId: string;
  weaponIcon?: string;
  offIcon?: string;
  armorWeight?: string;
}
export const CLASS_ACCENT: Record<string, number> = { guerreiro: 0xc0473e, paladino: 0xe0b85a, arcanista: 0x8b86ef, clerigo: 0xf2e6c4, arqueiro: 0x78a85d, ladino: 0x4fb0a8 };

export function buildHero(look: HeroLook): Rig {
  const accentHex = CLASS_ACCENT[look.classId] ?? 0xc8a75e;
  const rig = baseRig('humanoid', 1.75, 1, accentHex);
  const accent = rig.accent;
  const skin = flat(0x9c7660, { roughness: 0.75 });
  const iron = pbr('iron_rusted', { color: 0xb7bcc4, roughness: 0.5, metalness: 0.9 });
  const darkIron = pbr('iron_rusted', { color: 0x6a6e76, roughness: 0.55 });
  const leather = pbr('leather');
  const bronze = pbr('bronze_aged', { color: 0xe7c47a });
  const cloth = (c: number) => pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: c });
  const T = rig.torso;
  T.position.y = 0.92;
  switch (look.classId) {
    case 'guerreiro': {
      legs(rig, darkIron, 0.92, 0.12, 0.085, leather);
      T.add(mesh(lathe('g-chest', [[0.16, -0.05], [0.25, 0.05], [0.28, 0.3], [0.24, 0.48], [0.12, 0.56]]), iron));
      T.add(mesh(lathe('g-skirt', [[0.25, 0.02], [0.3, -0.12], [0.33, -0.32]]), cloth(0x7a1e1a), [0, -0.02, 0]));
      T.add(mesh(box(0.22, 0.42, 0.03), cloth(0x8c231d), [0, 0.2, 0.27]));
      for (const s of [1, -1]) T.add(mesh(sphere(0.12, 16, 10), iron, [0.27 * s, 0.47, 0], undefined, [1, 0.75, 1]));
      rig.head.position.y = 0.66;
      rig.head.add(mesh(sphere(0.12), skin));
      rig.head.add(mesh(lathe('g-helm', [[0, 0.17], [0.11, 0.14], [0.135, 0.03], [0.14, -0.06]]), iron, [0, 0, 0]));
      rig.head.add(mesh(box(0.2, 0.03, 0.04), iron, [0, -0.02, 0.12]));
      arm(rig, 1, iron, 0.42, 0.3, 0.56, 0.075, leather);
      arm(rig, -1, iron, 0.42, 0.3, 0.56, 0.075, leather);
      break;
    }
    case 'paladino': {
      legs(rig, iron, 0.92, 0.12, 0.085, iron);
      T.add(mesh(lathe('p-chest', [[0.17, -0.05], [0.26, 0.05], [0.29, 0.3], [0.25, 0.5], [0.12, 0.58]]), iron));
      T.add(mesh(lathe('p-tabard', [[0.26, 0.42], [0.29, 0.1], [0.31, -0.2], [0.33, -0.42]], 24), cloth(0xe9e0c8), [0, -0.02, 0]));
      T.add(mesh(box(0.08, 0.36, 0.02), flat(0xc9a24a, { metalness: 0.6, roughness: 0.4 }), [0, 0.08, 0.3]));
      T.add(mesh(box(0.22, 0.06, 0.02), flat(0xc9a24a, { metalness: 0.6, roughness: 0.4 }), [0, 0.14, 0.305]));
      for (const s of [1, -1]) T.add(mesh(sphere(0.13, 16, 10), bronze, [0.28 * s, 0.48, 0], undefined, [1, 0.7, 1]));
      rig.head.position.y = 0.68;
      rig.head.add(mesh(lathe('p-helm', [[0, 0.2], [0.13, 0.17], [0.15, 0.0], [0.14, -0.12], [0.12, -0.14]]), iron));
      rig.head.add(mesh(box(0.2, 0.02, 0.01), flat(0x111111), [0, 0.0, 0.145]));
      rig.head.add(mesh(box(0.025, 0.12, 0.2), bronze, [0, 0.23, 0]));
      arm(rig, 1, iron, 0.43, 0.31, 0.56, 0.078, iron);
      arm(rig, -1, iron, 0.43, 0.31, 0.56, 0.078, iron);
      const cape = mesh(g('cape', () => new THREE.PlaneGeometry(0.55, 1.05, 4, 8)), cloth(0x8f7a3e), [0, -0.05, -0.24], [0.08, 0, 0]);
      (cape.material as THREE.Material).side = THREE.DoubleSide;
      T.add(cape);
      rig.extras.cape = cape;
      break;
    }
    case 'arcanista': {
      T.position.y = 0.88;
      rig.body.add(mesh(lathe('a-robe', [[0.34, 0], [0.3, 0.3], [0.22, 0.75], [0.18, 0.95]]), cloth(0x2b2a5a)));
      T.add(mesh(lathe('a-chest', [[0.18, 0], [0.22, 0.25], [0.2, 0.45], [0.1, 0.55]]), cloth(0x343370)));
      T.add(mesh(lathe('a-collar', [[0.14, 0.42], [0.22, 0.62], [0.24, 0.7]], 20), cloth(0x1d1c3e), [0, 0, -0.03]));
      rig.head.position.y = 0.66;
      rig.head.add(mesh(sphere(0.115), skin));
      rig.head.add(mesh(lathe('a-hat', [[0.2, -0.02], [0.13, 0.02], [0.08, 0.18], [0.0, 0.42]]), cloth(0x22214a), [0, 0.04, -0.02], [-0.2, 0, 0]));
      arm(rig, 1, cloth(0x343370), 0.42, 0.24, 0.52, 0.06, skin);
      arm(rig, -1, cloth(0x343370), 0.42, 0.24, 0.52, 0.06, skin);
      const ring = mesh(g('runering', () => new THREE.TorusGeometry(0.42, 0.008, 6, 64)), flat(accent, { emissive: accent, emissiveIntensity: 2.4, transparent: true, opacity: 0.85 }), [0, 0.08, 0], [Math.PI / 2, 0, 0]);
      rig.body.add(ring);
      rig.extras.runeRing = ring;
      for (let i = 0; i < 3; i++) {
        const r = mesh(g('runeglyph', () => new THREE.OctahedronGeometry(0.035, 0)), flat(accent, { emissive: accent, emissiveIntensity: 2.6 }), [Math.cos((i * Math.PI * 2) / 3) * 0.42, 1.3, Math.sin((i * Math.PI * 2) / 3) * 0.42]);
        rig.body.add(r);
        rig.extras[`glyph${i}`] = r;
      }
      rig.idle = { speed: 0.8, sway: 0.015, bob: 0.02, hunch: 0 };
      break;
    }
    case 'clerigo': {
      T.position.y = 0.88;
      rig.body.add(mesh(lathe('c-robe', [[0.33, 0], [0.31, 0.35], [0.24, 0.75], [0.19, 0.95]]), cloth(0xe6dcc0)));
      rig.body.add(mesh(lathe('c-under', [[0.3, 0.0], [0.29, 0.2]]), cloth(0x6d5c3a), [0, 0, 0]));
      T.add(mesh(lathe('c-chest', [[0.19, 0], [0.23, 0.25], [0.21, 0.45], [0.1, 0.55]]), cloth(0xefe6cd)));
      T.add(mesh(box(0.08, 0.5, 0.02), cloth(0xb08a3a), [0, 0.12, 0.215]));
      T.add(mesh(lathe('c-hood', [[0.13, 0.5], [0.24, 0.55], [0.2, 0.62]], 20), cloth(0xd8cdb0), [0, 0, -0.05]));
      rig.head.position.y = 0.66;
      rig.head.add(mesh(sphere(0.115), skin));
      const halo = mesh(g('halo', () => new THREE.TorusGeometry(0.15, 0.006, 6, 48)), flat(0xfff2c0, { emissive: 0xffe08a, emissiveIntensity: 0.9, transparent: true, opacity: 0.55 }), [0, 0.18, -0.08], [Math.PI / 2.2, 0, 0]);
      rig.head.add(halo);
      rig.extras.halo = halo;
      arm(rig, 1, cloth(0xefe6cd), 0.42, 0.25, 0.52, 0.065, skin);
      arm(rig, -1, cloth(0xefe6cd), 0.42, 0.25, 0.52, 0.065, skin);
      rig.idle = { speed: 0.7, sway: 0.012, bob: 0.012, hunch: 0 };
      break;
    }
    case 'arqueiro': {
      legs(rig, leather, 0.9, 0.11, 0.075, leather);
      T.add(mesh(lathe('ar-chest', [[0.15, -0.05], [0.22, 0.08], [0.23, 0.3], [0.2, 0.48], [0.1, 0.55]]), leather));
      T.add(mesh(lathe('ar-cloak', [[0.22, 0.5], [0.3, 0.2], [0.34, -0.2], [0.36, -0.42]], 24), cloth(0x2f4a2a), [0, 0, -0.04]));
      T.add(mesh(cyl(0.06, 0.06, 0.55), leather, [-0.1, 0.25, -0.22], [0.35, 0, 0.3]));
      for (let i = 0; i < 4; i++) T.add(mesh(cyl(0.006, 0.006, 0.3, 4), flat(0xd8c9a0), [-0.12 + i * 0.015, 0.6, -0.3], [0.35, 0, 0.3]));
      rig.head.position.y = 0.64;
      rig.head.add(mesh(sphere(0.11), skin));
      rig.head.add(mesh(lathe('ar-hood', [[0.0, 0.2], [0.13, 0.13], [0.15, -0.02], [0.13, -0.12]], 20), cloth(0x35552f), [0, 0, -0.03]));
      arm(rig, 1, leather, 0.42, 0.25, 0.54, 0.06, skin);
      arm(rig, -1, leather, 0.42, 0.25, 0.54, 0.06, skin);
      rig.idle = { speed: 1.1, sway: 0.02, bob: 0.012, hunch: 0 };
      break;
    }
    case 'ladino':
    default: {
      legs(rig, cloth(0x1d2a2b), 0.86, 0.11, 0.07, leather);
      T.position.y = 0.86;
      T.add(mesh(lathe('l-chest', [[0.14, -0.05], [0.2, 0.08], [0.21, 0.3], [0.18, 0.46], [0.09, 0.53]]), leather));
      T.add(mesh(lathe('l-scarf', [[0.12, 0.42], [0.2, 0.5], [0.15, 0.58]], 18), cloth(0x1f5c58)));
      T.add(mesh(box(0.42, 0.06, 0.26), leather, [0, -0.02, 0]));
      rig.head.position.y = 0.62;
      rig.head.add(mesh(sphere(0.105), skin));
      rig.head.add(mesh(lathe('l-hood', [[0.0, 0.22], [0.12, 0.14], [0.14, -0.02], [0.12, -0.12]], 20), cloth(0x15312f), [0, 0, -0.03]));
      rig.head.add(mesh(box(0.2, 0.07, 0.04), cloth(0x0f1f1e), [0, -0.04, 0.09]));
      arm(rig, 1, leather, 0.4, 0.23, 0.52, 0.058, skin);
      arm(rig, -1, leather, 0.4, 0.23, 0.52, 0.058, skin);
      rig.idle = { speed: 1.3, sway: 0.03, bob: 0.01, hunch: 0.12 };
      break;
    }
  }
  // weapons
  const w = look.weaponIcon ?? defaultWeapon(look.classId);
  rig.weaponType = w;
  const weapon = buildWeapon(w, accent);
  if (w === 'item_bow') {
    rig.offSlot.add(weapon);
    weapon.rotation.set(-Math.PI / 2.6, 0, 0);
  } else rig.weaponSlot.add(weapon);
  if (look.classId === 'paladino') {
    const sh = shield('kite', pbr('bronze_aged', { color: 0xe9e0c8 }), bronze);
    sh.add(mesh(g('sunemblem', () => new THREE.CircleGeometry(0.1, 12)), flat(0xe0b85a, { metalness: 0.7, roughness: 0.3 }), [0, 0.04, 0.05]));
    sh.position.set(0, 0.0, 0.12);
    sh.rotation.set(-Math.PI / 2.6, 0, 0);
    rig.offSlot.add(sh);
  }
  if (look.classId === 'ladino') rig.offSlot.add(buildWeapon('item_dagger', accent));
  if (look.classId === 'guerreiro' && (w === 'item_sword' || w === 'item_axe')) {
    const sh = shield('round', pbr('wood_dark'), iron);
    sh.position.set(0, 0, 0.1);
    sh.rotation.set(-Math.PI / 2.6, 0, 0);
    sh.scale.setScalar(0.85);
    rig.offSlot.add(sh);
  }
  void darkIron;
  return finalize(rig);
}
function defaultWeapon(c: string) {
  return { guerreiro: 'item_sword', paladino: 'item_sword', arcanista: 'item_staff', clerigo: 'item_staff', arqueiro: 'item_bow', ladino: 'item_dagger' }[c] ?? 'item_sword';
}

// ------------------------------------------------------------------ enemies
export async function buildEnemy(type: string): Promise<Rig> {
  const ash = pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x5b5652 });
  const ashDark = pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x2d2a29 });
  const ember = (c = 0xff7a2a, i = 3) => flat(c, { emissive: c, emissiveIntensity: i });
  const iron = pbr('iron_rusted', { color: 0x8a8d94, roughness: 0.6, metalness: 0.85 });
  const leather = pbr('leather');
  const bronze = pbr('bronze_aged', { color: 0xd8b070 });
  const bone = flat(0x8f877a, { roughness: 0.9 });
  switch (type) {
    case 'penitente': {
      const r = baseRig('humanoid', 1.55, 1, 0x9a6bd0);
      r.body.add(mesh(lathe('pen-robe', [[0.3, 0], [0.32, 0.12], [0.27, 0.45], [0.2, 0.8], [0.16, 0.95]]), ash));
      r.torso.position.set(0, 0.86, 0.06);
      r.torso.rotation.x = 0.38;
      r.torso.add(mesh(lathe('pen-chest', [[0.17, 0], [0.2, 0.2], [0.16, 0.4], [0.08, 0.48]]), ash));
      r.head.position.set(0, 0.52, 0.06);
      r.head.add(mesh(lathe('pen-hood', [[0, 0.2], [0.14, 0.14], [0.16, -0.04], [0.13, -0.12]], 20), ashDark));
      r.head.add(mesh(sphere(0.1), flat(0x050404), [0, -0.02, 0.06], undefined, [1, 1, 0.6]));
      for (const s of [1, -1]) r.head.add(mesh(sphere(0.015, 8, 6), ember(0xb07bff, 4), [0.035 * s, 0, 0.12]));
      arm(r, 1, ash, 0.36, 0.2, 0.62, 0.045, bone);
      arm(r, -1, ash, 0.36, 0.2, 0.62, 0.045, bone);
      r.armR.rotation.x = -0.6;
      r.armL.rotation.x = -0.5;
      r.idle = { speed: 0.6, sway: 0.05, bob: 0.02, hunch: 0.15 };
      return finalize(r);
    }
    case 'cao': {
      const r = baseRig('beast', 0.85, 1, 0xff7a2a);
      const fur = pbr('cloth_wool', { noAlbedo: true, color: 0x4a4542, roughness: 1 });
      r.torso.position.set(0, 0.5, 0);
      r.torso.add(mesh(capsule(0.17, 0.55), fur, [0, 0, 0], [Math.PI / 2, 0, 0]));
      r.torso.add(mesh(sphere(0.2, 14, 10), fur, [0, 0.05, 0.25], undefined, [1, 0.95, 1.1]));
      r.head.position.set(0, 0.12, 0.48);
      r.head.add(mesh(sphere(0.13, 16, 12), fur, [0, 0, 0], undefined, [1, 0.9, 1.1]));
      r.head.add(mesh(cone(0.08, 0.22, 10), fur, [0, -0.03, 0.17], [Math.PI / 2, 0, 0]));
      for (const s of [1, -1]) {
        r.head.add(mesh(cone(0.04, 0.11, 6), fur, [0.07 * s, 0.13, -0.02], [-0.2, 0, 0.2 * s]));
        r.head.add(mesh(sphere(0.018, 8, 6), ember(), [0.055 * s, 0.03, 0.11]));
      }
      for (const [x, z] of [[0.11, 0.27], [-0.11, 0.27], [0.11, -0.25], [-0.11, -0.25]]) r.body.add(mesh(capsule(0.045, 0.32), fur, [x, 0.22, z]));
      const tail = mesh(cone(0.04, 0.4, 8), fur, [0, 0.55, -0.45], [-2.2, 0, 0]);
      r.body.add(tail);
      r.extras.tail = tail;
      // embers in the ash fur
      for (let i = 0; i < 6; i++) r.torso.add(mesh(sphere(0.012, 6, 4), ember(), [Math.sin(i * 2.1) * 0.15, 0.12, -0.25 + i * 0.09]));
      r.armR.visible = r.armL.visible = false;
      r.idle = { speed: 1.6, sway: 0.03, bob: 0.02, hunch: 0 };
      return finalize(r);
    }
    case 'besteiro': {
      const r = baseRig('humanoid', 1.7, 1, 0xd88a3a);
      legs(r, leather, 0.88, 0.11, 0.07, leather);
      r.torso.position.y = 0.88;
      r.torso.add(mesh(lathe('bes-chest', [[0.15, -0.05], [0.22, 0.08], [0.23, 0.3], [0.2, 0.46], [0.1, 0.53]]), pbr('leather', { color: 0x8a6a4a })));
      r.torso.add(mesh(lathe('bes-tabard', [[0.22, 0.4], [0.25, 0.1], [0.27, -0.3]], 20), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x4d4b3e })));
      r.head.position.y = 0.62;
      r.head.add(mesh(sphere(0.105), flat(0xa98a74)));
      r.head.add(mesh(lathe('kettlehat', [[0.26, 0.0], [0.24, 0.02], [0.13, 0.05], [0.12, 0.14], [0, 0.17]]), iron));
      arm(r, 1, leather, 0.4, 0.24, 0.52, 0.06);
      arm(r, -1, leather, 0.4, 0.24, 0.52, 0.06);
      r.weaponSlot.add(buildWeapon('item_crossbow', r.accent));
      r.armR.rotation.x = -1.1;
      r.armL.rotation.x = -1.1;
      r.weaponType = 'item_crossbow';
      return finalize(r);
    }
    case 'escudeiro': {
      const r = baseRig('humanoid', 1.75, 1.05, 0x9aa4ad);
      legs(r, iron, 0.9, 0.12, 0.085, iron);
      r.torso.position.y = 0.9;
      r.torso.add(mesh(lathe('esc-chest', [[0.17, -0.05], [0.27, 0.05], [0.3, 0.3], [0.25, 0.5], [0.12, 0.56]]), iron));
      r.torso.add(mesh(lathe('esc-skirt', [[0.27, 0.02], [0.31, -0.3]], 20), ashDark));
      r.head.position.y = 0.66;
      r.head.add(mesh(lathe('esc-helm', [[0, 0.17], [0.13, 0.12], [0.14, -0.1], [0.12, -0.13]]), iron));
      r.head.add(mesh(box(0.18, 0.02, 0.02), ember(0xff6a2a, 1.5), [0, 0.0, 0.135]));
      arm(r, 1, iron, 0.42, 0.3, 0.55, 0.075);
      arm(r, -1, iron, 0.42, 0.3, 0.55, 0.075);
      const sh = shield('tower', pbr('wood_dark', { color: 0x6d6a66 }), iron);
      sh.position.set(0, 0.0, 0.15);
      sh.rotation.set(-Math.PI / 2.6, 0, 0);
      r.offSlot.add(sh);
      r.weaponSlot.add(buildWeapon('item_sword', r.accent));
      r.armL.rotation.set(-0.7, 0, 0.3);
      r.weaponType = 'item_sword';
      return finalize(r);
    }
    case 'acolito': {
      const r = baseRig('humanoid', 1.45, 1, 0xb07bff);
      r.body.add(mesh(lathe('aco-robe', [[0.27, 0], [0.26, 0.3], [0.2, 0.7], [0.16, 0.85]]), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x2c2626 })));
      r.body.add(mesh(lathe('aco-surplice', [[0.27, 0.35], [0.25, 0.55], [0.18, 0.82]]), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0xbab0a0 })));
      r.torso.position.y = 0.78;
      r.torso.add(mesh(lathe('aco-chest', [[0.16, 0], [0.19, 0.2], [0.16, 0.38], [0.08, 0.44]]), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0xbab0a0 })));
      r.head.position.y = 0.55;
      r.head.add(mesh(sphere(0.1), flat(0x8e8a84)));
      r.head.add(mesh(lathe('aco-hood', [[0, 0.17], [0.12, 0.12], [0.13, -0.03], [0.11, -0.1]], 20), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x2c2626 }), [0, 0, -0.02]));
      for (const s of [1, -1]) r.head.add(mesh(sphere(0.012, 8, 6), ember(0xb07bff, 4), [0.03 * s, 0, 0.095]));
      arm(r, 1, pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0xbab0a0 }), 0.36, 0.21, 0.46, 0.05);
      arm(r, -1, pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0xbab0a0 }), 0.36, 0.21, 0.46, 0.05);
      r.weaponSlot.add(buildWeapon('item_bell', r.accent));
      r.armR.rotation.x = -0.9;
      r.weaponType = 'item_bell';
      r.idle = { speed: 0.9, sway: 0.03, bob: 0.015, hunch: 0.05 };
      return finalize(r);
    }
    case 'turiferario': {
      const r = baseRig('humanoid', 1.7, 1, 0xff8a3a);
      r.body.add(mesh(lathe('tur-robe', [[0.3, 0], [0.29, 0.3], [0.22, 0.75], [0.17, 0.92]]), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x3b2e28 })));
      r.torso.position.y = 0.88;
      r.torso.add(mesh(lathe('tur-chest', [[0.17, 0], [0.21, 0.24], [0.18, 0.44], [0.09, 0.52]]), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x4a3a30 })));
      r.head.position.y = 0.64;
      r.head.add(mesh(sphere(0.11), flat(0x9c8a7c)));
      r.head.add(mesh(cyl(0.118, 0.118, 0.05, 20), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x7a1e1a }), [0, 0.02, 0]));
      r.head.add(mesh(lathe('tur-hood', [[0, 0.2], [0.13, 0.14], [0.14, -0.03]], 20), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x3b2e28 }), [0, 0, -0.04]));
      arm(r, 1, pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x4a3a30 }), 0.4, 0.23, 0.5, 0.055);
      arm(r, -1, pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x4a3a30 }), 0.4, 0.23, 0.5, 0.055);
      const censer = buildWeapon('item_censer', r.accent);
      r.weaponSlot.add(censer);
      r.weaponSlot.rotation.set(0, 0, 0);
      r.extras.censer = censer;
      r.armR.rotation.x = -0.9;
      r.weaponType = 'item_censer';
      r.idle = { speed: 0.7, sway: 0.03, bob: 0.01, hunch: 0.05 };
      return finalize(r);
    }
    case 'carcereiro': {
      const r = baseRig('humanoid', 1.9, 1.12, 0xc0a070);
      legs(r, leather, 0.88, 0.14, 0.1, leather);
      r.torso.position.y = 0.9;
      r.torso.add(mesh(lathe('car-chest', [[0.2, -0.05], [0.33, 0.1], [0.36, 0.32], [0.3, 0.5], [0.14, 0.58]]), pbr('leather', { color: 0x5a4636 })));
      r.torso.add(mesh(lathe('car-apron', [[0.33, 0.25], [0.36, -0.1], [0.38, -0.4]], 18), leather, [0, 0, 0.02]));
      r.torso.add(mesh(torus(0.22, 0.03), iron, [0, 0.35, 0.02], [Math.PI / 2.2, 0, 0.3]));
      r.head.position.y = 0.66;
      r.head.add(mesh(sphere(0.13), flat(0x8c7462)));
      r.head.add(mesh(lathe('car-hood', [[0, 0.2], [0.15, 0.14], [0.17, -0.05], [0.15, -0.14]], 20), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x2a2523 })));
      arm(r, 1, pbr('leather', { color: 0x5a4636 }), 0.45, 0.36, 0.6, 0.09);
      arm(r, -1, pbr('leather', { color: 0x5a4636 }), 0.45, 0.36, 0.6, 0.09);
      const hook = new THREE.Group();
      hook.add(mesh(torus(0.12, 0.018, Math.PI * 1.3), iron, [0, 0.12, 0], [0, 0, -0.6]));
      for (let i = 0; i < 6; i++) hook.add(mesh(torus(0.035, 0.009), iron, [0, -0.04 - i * 0.06, 0], [i % 2 ? Math.PI / 2 : 0, 0, 0]));
      r.weaponSlot.add(hook);
      r.offSlot.add(mesh(torus(0.06, 0.008), bronze));
      r.weaponType = 'item_hammer';
      r.idle = { speed: 0.7, sway: 0.025, bob: 0.012, hunch: 0.08 };
      return finalize(r);
    }
    case 'carrasco': {
      const r = baseRig('humanoid', 1.95, 1.15, 0xc2463a);
      legs(r, pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x221d1c }), 0.9, 0.14, 0.1, leather);
      r.torso.position.y = 0.92;
      r.torso.add(mesh(lathe('crr-chest', [[0.2, -0.05], [0.32, 0.1], [0.35, 0.33], [0.28, 0.5], [0.13, 0.58]]), flat(0x8c6c5a, { roughness: 0.75 })));
      r.torso.add(mesh(box(0.42, 0.12, 0.38), leather, [0, -0.02, 0]));
      r.head.position.y = 0.68;
      r.head.add(mesh(lathe('crr-hood', [[0, 0.32], [0.08, 0.26], [0.14, 0.1], [0.15, -0.08], [0.14, -0.14]], 20), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x161212 })));
      for (const s of [1, -1]) r.head.add(mesh(box(0.05, 0.022, 0.02), ember(0xff4a2a, 2.5), [0.05 * s, 0.02, 0.14]));
      arm(r, 1, flat(0x8c6c5a), 0.45, 0.36, 0.6, 0.09);
      arm(r, -1, flat(0x8c6c5a), 0.45, 0.36, 0.6, 0.09);
      const cleaver = new THREE.Group();
      cleaver.add(mesh(cyl(0.025, 0.025, 0.5), pbr('wood_dark'), [0, 0.05, 0]));
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(0.34, 0.02);
      s.lineTo(0.38, 0.62);
      s.lineTo(0, 0.55);
      s.lineTo(0, 0);
      cleaver.add(mesh(extrude('cleaver', s, 0.02), iron, [0.0, 0.28, 0]));
      r.weaponSlot.add(cleaver);
      const cw = await model('counterweight').catch(() => null);
      if (cw) {
        const piece = cw.getObjectByName('counterweight_a') ?? cw;
        piece.position.set(0, -0.35, 0);
        piece.scale.setScalar(0.35);
        r.offSlot.add(piece);
      }
      r.weaponType = 'item_axe';
      r.idle = { speed: 0.6, sway: 0.02, bob: 0.012, hunch: 0.06 };
      return finalize(r);
    }
    case 'relicario': {
      const r = baseRig('chest', 0.9, 1, 0xe6c060);
      const chest = await model('reliquary_chest').catch(() => null);
      if (chest) {
        chest.scale.setScalar(0.9);
        r.body.add(chest);
        const lid = chest.getObjectByName('chest_lid');
        if (lid) r.extras.lid = lid;
      } else r.body.add(mesh(box(0.8, 0.6, 0.5), pbr('wood_dark'), [0, 0.3, 0]));
      const eye = mesh(sphere(0.04, 10, 8), ember(0xffd070, 5), [0, 0.42, 0.3]);
      r.body.add(eye);
      r.extras.eye = eye;
      r.armR.visible = r.armL.visible = false;
      r.idle = { speed: 1.4, sway: 0.0, bob: 0.03, hunch: 0 };
      return finalize(r);
    }
    case 'cantor': {
      const r = baseRig('specter', 2.05, 1.15, 0xff5a4a);
      r.body.add(mesh(lathe('can-robe', [[0.32, 0], [0.3, 0.4], [0.2, 1.0], [0.16, 1.15]]), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x4a1414 })));
      r.body.add(mesh(lathe('can-mantle', [[0.36, 0.75], [0.3, 1.0], [0.18, 1.18]]), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x1b1414 })));
      r.torso.position.y = 1.12;
      r.head.position.y = 0.22;
      r.head.add(mesh(g('canhead', () => new THREE.SphereGeometry(0.11, 18, 14)), flat(0xbdb3a6), [0, 0, 0], undefined, [0.9, 1.25, 0.9]));
      const mouth = mesh(sphere(0.035, 10, 8), ember(0xff5a3a, 5), [0, -0.04, 0.09], undefined, [1, 1.6, 0.5]);
      r.head.add(mouth);
      r.extras.mouth = mouth;
      arm(r, 1, pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x4a1414 }), 0.0, 0.22, 0.62, 0.05);
      arm(r, -1, pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x4a1414 }), 0.0, 0.22, 0.62, 0.05);
      r.armR.rotation.set(-0.4, 0, -0.3);
      r.armL.rotation.set(-0.4, 0, 0.3);
      const halo = mesh(g('cantorhalo', () => new THREE.TorusGeometry(0.28, 0.01, 6, 48)), ember(0xff7a4a, 2), [0, 0.15, -0.12], [Math.PI / 2.4, 0, 0]);
      r.head.add(halo);
      r.extras.halo = halo;
      r.idle = { speed: 0.5, sway: 0.04, bob: 0.04, hunch: 0 };
      return finalize(r);
    }
    case 'cavaleiro': {
      const r = baseRig('humanoid', 1.9, 1.32, 0x9fb4c8);
      const plate = pbr('iron_rusted', { color: 0x9aa0a8, roughness: 0.45, metalness: 0.95 });
      legs(r, plate, 0.94, 0.13, 0.09, plate);
      r.torso.position.y = 0.94;
      r.torso.add(mesh(lathe('cav-chest', [[0.18, -0.05], [0.28, 0.05], [0.32, 0.3], [0.27, 0.52], [0.13, 0.6]]), plate));
      r.torso.add(mesh(lathe('cav-tabard', [[0.28, 0.45], [0.3, 0.1], [0.32, -0.25], [0.3, -0.5]], 16), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x2a3340 }), [0, 0, 0.01]));
      for (const s of [1, -1]) r.torso.add(mesh(sphere(0.15, 16, 10), plate, [0.31 * s, 0.5, 0], undefined, [1, 0.7, 1.1]));
      r.head.position.y = 0.72;
      r.head.add(mesh(lathe('cav-helm', [[0, 0.22], [0.12, 0.2], [0.15, 0.02], [0.15, -0.14], [0.12, -0.16]]), plate));
      r.head.add(mesh(box(0.2, 0.025, 0.02), ember(0x9fd4ff, 2.5), [0, 0.02, 0.15]));
      const plume = mesh(cone(0.05, 0.42, 8), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x6e1c18 }), [0, 0.35, -0.08], [-0.6, 0, 0]);
      r.head.add(plume);
      arm(r, 1, plate, 0.45, 0.33, 0.58, 0.08, plate);
      arm(r, -1, plate, 0.45, 0.33, 0.58, 0.08, plate);
      const sh = shield('broken', pbr('iron_rusted', { color: 0x6f747c }), plate);
      sh.position.set(0, 0.02, 0.14);
      sh.rotation.set(-Math.PI / 2.6, 0, 0);
      sh.scale.setScalar(1.2);
      r.offSlot.add(sh);
      r.extras.shield = sh;
      const sw = buildWeapon('item_sword', r.accent);
      sw.scale.setScalar(1.25);
      r.weaponSlot.add(sw);
      const cape = mesh(g('cavcape', () => new THREE.PlaneGeometry(0.62, 1.25, 4, 10)), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x1d2530, side: THREE.DoubleSide }), [0, -0.1, -0.26], [0.1, 0, 0]);
      r.torso.add(cape);
      r.extras.cape = cape;
      r.weaponType = 'item_sword';
      r.idle = { speed: 0.55, sway: 0.012, bob: 0.01, hunch: 0 };
      return finalize(r);
    }
    case 'vigia': {
      const r = baseRig('specter', 2.3, 1.35, 0xa8d8ff);
      r.body.add(mesh(lathe('vig-robe', [[0.36, 0], [0.33, 0.4], [0.24, 1.1], [0.17, 1.35]]), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x2b3038 })));
      r.body.add(mesh(lathe('vig-veil', [[0.4, 0.55], [0.32, 1.0], [0.2, 1.4], [0.06, 1.62]]), flat(0x8a94a0, { transparent: true, opacity: 0.55, roughness: 0.9 })));
      r.torso.position.y = 1.32;
      r.head.position.y = 0.2;
      r.head.add(mesh(sphere(0.12), flat(0x0a0c10), [0, 0, 0.03]));
      r.head.add(mesh(sphere(0.03, 10, 8), ember(0xa8d8ff, 5), [0, 0.0, 0.13]));
      arm(r, 1, pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x2b3038 }), 0.0, 0.26, 0.7, 0.05);
      arm(r, -1, pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x2b3038 }), 0.0, 0.26, 0.7, 0.05);
      // hourglass on the chest
      r.torso.add(mesh(lathe('hourglass', [[0.07, -0.1], [0.01, 0], [0.07, 0.1]], 16), flat(0xd8e8ff, { emissive: 0x6aa0ff, emissiveIntensity: 1.2, transparent: true, opacity: 0.8 }), [0, -0.25, 0.18]));
      // three lanterns = three Vigílias (Rápido, Tático, Pesado)
      const colors = [0xffd27a, 0x9fd4ff, 0xff7a5a];
      for (let i = 0; i < 3; i++) {
        const l = new THREE.Group();
        l.add(mesh(cyl(0.05, 0.06, 0.14, 6), bronze));
        l.add(mesh(sphere(0.045, 10, 8), ember(colors[i], 4)));
        r.body.add(l);
        r.extras[`lantern${i}`] = l;
      }
      r.idle = { speed: 0.4, sway: 0.02, bob: 0.05, hunch: 0 };
      return finalize(r);
    }
    case 'severin':
    default: {
      const r = baseRig('humanoid', 2.2, 1.32, 0xffa04a);
      // bell-shaped cope
      r.body.add(mesh(lathe('sev-cope', [[0.5, 0], [0.48, 0.08], [0.36, 0.45], [0.26, 0.9], [0.2, 1.05]]), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x3a2412 })));
      r.body.add(mesh(lathe('sev-trim', [[0.505, 0.0], [0.5, 0.06]]), bronze));
      r.body.add(mesh(box(0.14, 0.8, 0.02), bronze, [0, 0.55, 0.36], [-0.25, 0, 0]));
      r.torso.position.y = 1.0;
      r.torso.add(mesh(lathe('sev-chest', [[0.22, 0], [0.27, 0.22], [0.24, 0.42], [0.12, 0.52]]), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x4d2f17 })));
      r.torso.add(mesh(lathe('sev-mozzetta', [[0.12, 0.5], [0.34, 0.38], [0.36, 0.28]], 20), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x5e1714 })));
      r.head.position.y = 0.62;
      r.head.add(mesh(sphere(0.13), flat(0x8a7a6e)));
      r.head.add(mesh(sphere(0.135, 18, 10, ), flat(0x050404), [0, -0.01, 0.03], undefined, [0.85, 0.75, 0.6]));
      for (const s of [1, -1]) r.head.add(mesh(sphere(0.018, 8, 6), ember(0xffa04a, 5), [0.04 * s, 0.0, 0.11]));
      // mitre
      const mitre = new THREE.Shape();
      mitre.moveTo(-0.13, 0);
      mitre.lineTo(-0.1, 0.25);
      mitre.lineTo(0, 0.36);
      mitre.lineTo(0.1, 0.25);
      mitre.lineTo(0.13, 0);
      mitre.lineTo(-0.13, 0);
      r.head.add(mesh(extrude('mitre', mitre, 0.16, 0.02), pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0xd8cfb8 }), [0, 0.08, -0.01]));
      r.head.add(mesh(box(0.03, 0.3, 0.17), bronze, [0, 0.22, 0]));
      arm(r, 1, pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x4d2f17 }), 0.4, 0.33, 0.62, 0.08, flat(0x8a7a6e));
      arm(r, -1, pbr('cloth_wool', { noAlbedo: true, roughness: 0.95, color: 0x4d2f17 }), 0.4, 0.33, 0.62, 0.08, flat(0x8a7a6e));
      // liturgical hammer: bell head
      const ham = new THREE.Group();
      ham.add(mesh(cyl(0.03, 0.03, 1.1), pbr('wood_dark'), [0, 0.35, 0]));
      ham.add(mesh(lathe('sev-hammerbell', [[0, 0.2], [0.1, 0.17], [0.13, 0.05], [0.16, -0.04]]), bronze, [0, 0.95, 0], [Math.PI / 2, 0, 0]));
      r.weaponSlot.add(ham);
      // chain of small bells
      for (let i = 0; i < 5; i++) r.torso.add(mesh(lathe('tinybell', [[0, 0.05], [0.025, 0.04], [0.035, 0]]), bronze, [-0.3 + i * 0.15, 0.05 - Math.abs(i - 2) * 0.04, 0.27]));
      r.weaponType = 'item_hammer';
      r.idle = { speed: 0.45, sway: 0.015, bob: 0.012, hunch: 0.05 };
      return finalize(r);
    }
  }
}

function finalize(r: Rig): Rig {
  // clone materials so each figure can flash/fade independently (textures stay shared)
  const seen = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  r.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.MeshStandardMaterial;
    let c = seen.get(src);
    if (!c) {
      c = src.clone();
      c.side = THREE.DoubleSide;
      if (!c.emissiveIntensity || c.emissive.getHex() === 0) c.color.multiplyScalar(1.35);
      c.userData.baseEmissive = c.emissive.clone();
      c.userData.baseEmissiveIntensity = c.emissiveIntensity;
      seen.set(src, c);
      r.mats.push(c);
    }
    m.material = c;
  });
  return r;
}
