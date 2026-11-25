/**
 * Asset loading:
 *  - KayKit Dungeon Remastered kit (CC0, built by tools/python/kaykit) — the architecture and props of every room.
 *    One gradient atlas, one shared material per theme (swatch tints), quantized GLBs dequantized at load.
 *  - the monastery hero props (tools/python/models: bell, statue, altar...) — PBR texture sets, or a flat
 *    "kit" style so they sit naturally among the KayKit pieces.
 * Everything is cached and shared.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = import.meta.env.BASE_URL + 'assets/';
const texLoader = new THREE.TextureLoader();
const gltf = new GLTFLoader();
const texCache = new Map<string, THREE.Texture>();
const matCache = new Map<string, THREE.Material>();
const glbCache = new Map<string, Promise<THREE.Group>>();
export let anisotropy = 4;
export function setAnisotropy(n: number) {
  anisotropy = n;
}

export function tex(path: string, srgb = false, repeat = 1): THREE.Texture {
  const key = `${path}|${repeat}`;
  let t = texCache.get(key);
  if (!t) {
    t = texLoader.load(BASE + path);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = anisotropy;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, t);
  }
  return t;
}

const PBR_SETS = new Set(['stone_floor', 'stone_wall', 'stone_plate', 'wood_dark', 'bronze_aged', 'iron_rusted', 'cloth_wool', 'parchment', 'wax', 'leather']);
const METAL = new Set(['bronze_aged', 'iron_rusted']);

export interface MatOpts {
  color?: THREE.ColorRepresentation;
  repeat?: number;
  roughness?: number;
  metalness?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  normalScale?: number;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
  /** Use only normal/roughness detail (tint drives the color). */
  noAlbedo?: boolean;
}

/** Shared PBR material from a texture set, optionally tinted. */
export function pbr(set: string, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = `${set}|${JSON.stringify(o)}`;
  const c = matCache.get(key);
  if (c) return c as THREE.MeshStandardMaterial;
  const rep = o.repeat ?? 1;
  const m = new THREE.MeshStandardMaterial({
    color: o.color ?? 0xffffff,
    roughness: o.roughness ?? 1,
    metalness: o.metalness ?? (METAL.has(set) ? 1 : 0),
    side: o.side ?? THREE.FrontSide,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
  });
  if (PBR_SETS.has(set)) {
    if (!o.noAlbedo) m.map = tex(`textures/${set}_albedo.jpg`, true, rep);
    m.normalMap = tex(`textures/${set}_normal.jpg`, false, rep);
    m.normalScale.set(o.normalScale ?? 1, o.normalScale ?? 1);
    m.roughnessMap = tex(`textures/${set}_rough.jpg`, false, rep);
    m.aoMap = tex(`textures/${set}_ao.jpg`, false, rep);
    m.aoMapIntensity = 0.8;
    if (METAL.has(set)) m.metalnessMap = tex(`textures/${set}_metal.jpg`, false, rep);
  }
  if (o.emissive) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = o.emissiveIntensity ?? 1;
  }
  matCache.set(key, m);
  return m;
}

/** Flat colored standard material (shared). */
export function flat(color: THREE.ColorRepresentation, o: Omit<MatOpts, 'color'> = {}): THREE.MeshStandardMaterial {
  const key = `flat|${new THREE.Color(color).getHexString()}|${JSON.stringify(o)}`;
  const c = matCache.get(key);
  if (c) return c as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.roughness ?? 0.8, metalness: o.metalness ?? 0, side: o.side ?? THREE.FrontSide, transparent: !!o.transparent, opacity: o.opacity ?? 1 });
  if (o.emissive) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = o.emissiveIntensity ?? 1;
  }
  matCache.set(key, m);
  return m;
}

function bindMaterials(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const bound = mats.map((m) => {
      const name = (m as THREE.Material).name;
      const src = m as THREE.MeshStandardMaterial;
      if (name === 'stained_glass') {
        return new THREE.MeshStandardMaterial({ map: tex('textures/stained_glass.png', true), transparent: true, side: THREE.DoubleSide, emissive: new THREE.Color(0xffb070), emissiveMap: tex('textures/stained_glass.png', true), emissiveIntensity: 0.9, roughness: 0.4, depthWrite: false });
      }
      if (name === 'flame') return flat(0xff9a3c, { emissive: 0xff7a20, emissiveIntensity: 3 });
      if (PBR_SETS.has(name)) {
        const repeat = name.startsWith('stone') ? 1 : 1;
        const base = pbr(name, { repeat, color: src.color?.getHex?.() ?? 0xffffff });
        if (src.vertexColors || mesh.geometry.getAttribute('color')) {
          const m2 = base.clone();
          m2.vertexColors = true;
          return m2;
        }
        if (name === 'cloth_wool') {
          const m2 = base.clone();
          m2.side = THREE.DoubleSide;
          return m2;
        }
        return base;
      }
      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? bound : bound[0];
    if (mesh.geometry.getAttribute('uv') && !mesh.geometry.getAttribute('uv1')) mesh.geometry.setAttribute('uv1', mesh.geometry.getAttribute('uv'));
  });
}

/**
 * Load (cached) a GLB from the monastery prop kit and return a fresh clone.
 * style 'kit' swaps the PBR texture sets for flat stylized materials that match the KayKit palette.
 */
export async function model(id: string, style: 'pbr' | 'kit' = 'pbr'): Promise<THREE.Group> {
  const key = style === 'kit' ? `${id}|kit` : id;
  let p = glbCache.get(key);
  if (!p) {
    p = gltf.loadAsync(`${BASE}models/${id}.glb`).then((g) => {
      if (style === 'kit') bindKitStyle(g.scene);
      else bindMaterials(g.scene);
      return g.scene;
    });
    glbCache.set(key, p);
  }
  const src = await p;
  return src.clone(true);
}

/** Flat colours for the procedural prop materials, picked from the KayKit atlas so both kits read as one world. */
const KIT_STYLE: Record<string, { color: number; roughness?: number; metalness?: number; emissive?: number; ei?: number }> = {
  stone_wall: { color: 0x9a978f },
  stone_plate: { color: 0xa8a49a },
  stone_floor: { color: 0x8e8a82 },
  wood_dark: { color: 0x5c4030 },
  bronze_aged: { color: 0xb08a4a, roughness: 0.42, metalness: 0.75 },
  iron_rusted: { color: 0x5a5a60, roughness: 0.55, metalness: 0.6 },
  cloth_wool: { color: 0x8c2a26 },
  parchment: { color: 0xe6d6b0 },
  wax: { color: 0xeee6d2, roughness: 0.6 },
  leather: { color: 0x6a3e26 },
  flame: { color: 0xffb050, emissive: 0xff8a2a, ei: 3 },
};
function bindKitStyle(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const bound = mats.map((m) => {
      const name = (m as THREE.Material).name;
      if (name === 'stained_glass') {
        return new THREE.MeshStandardMaterial({ map: tex('textures/stained_glass.png', true), transparent: true, side: THREE.DoubleSide, emissive: new THREE.Color(0xffc080), emissiveMap: tex('textures/stained_glass.png', true), emissiveIntensity: 1.6, roughness: 0.4, depthWrite: false });
      }
      const st = KIT_STYLE[name];
      if (!st) return m;
      const vc = !!mesh.geometry.getAttribute('color');
      const k = `kitstyle|${name}|${vc}`;
      let mm = matCache.get(k) as THREE.MeshStandardMaterial | undefined;
      if (!mm) {
        mm = new THREE.MeshStandardMaterial({ color: st.color, roughness: st.roughness ?? 0.88, metalness: st.metalness ?? 0, vertexColors: vc, side: name === 'cloth_wool' ? THREE.DoubleSide : THREE.FrontSide, flatShading: false });
        if (st.emissive) {
          mm.emissive = new THREE.Color(st.emissive);
          mm.emissiveIntensity = st.ei ?? 1;
        }
        matCache.set(k, mm);
      }
      return mm;
    });
    mesh.material = Array.isArray(mesh.material) ? bound : bound[0];
  });
}

// ------------------------------------------------------------------ KayKit Dungeon Remastered kit
const KIT = BASE + 'kaykit-dungeon/';
export interface KitPieceMeta {
  file: string;
  bytes: number;
  triangles: number;
  vertices: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  nodes: string[];
}
let kitManifestP: Promise<Record<string, KitPieceMeta>> | null = null;
/** Piece metadata (bounds in native kit units: walls are 4 × 4 × 1). */
export function kitManifest(): Promise<Record<string, KitPieceMeta>> {
  if (!kitManifestP)
    kitManifestP = fetch(KIT + 'manifest.json')
      .then((r) => r.json())
      .then((m) => m.pieces as Record<string, KitPieceMeta>)
      .catch(() => ({}));
  return kitManifestP;
}

let atlasTex: THREE.Texture | null = null;
export function kitAtlas(): THREE.Texture {
  if (!atlasTex) {
    atlasTex = texLoader.load(KIT + 'dungeon_texture.png');
    atlasTex.colorSpace = THREE.SRGBColorSpace;
    atlasTex.flipY = false; // glTF UV convention
    atlasTex.anisotropy = anisotropy;
    atlasTex.wrapS = atlasTex.wrapT = THREE.ClampToEdgeWrapping;
  }
  return atlasTex;
}

/** Shared animation clock for kit shaders (banner sway, flame flicker). The Diorama advances it every frame. */
export const kitTime = { value: 0 };

/**
 * Atlas swatch tints: the KayKit atlas is a grid of 8 × 4 gradient swatches (row 0 = top of the image).
 * A theme multiplies any swatch by a colour (e.g. warmer limestone, darker oak) — how D2–D6 restyle the same kit.
 */
export type KitTints = Partial<Record<number, THREE.ColorRepresentation | [THREE.ColorRepresentation, number]>>;
export const KIT_SWATCH = {
  stoneDark: 0, // wall caps, dark stone
  stone: 1, // wall faces, pillars, metal bands
  wood: 2, // warm wood (doors, tables)
  iron: 3, // black iron (grates, bars)
  woodDark: 4, // brown wood (shelves, frames)
  stoneLight: 5, // floor tiles
  rust: 6,
  ash: 7, // wicks, rope
  wax: 24, // candles, parchment
} as const;

export interface KitMatOpts {
  tints?: KitTints;
  /** global multiply */
  color?: THREE.ColorRepresentation;
  roughness?: number;
  /** cloth sway (banners): needs the `aSway` attribute (0 at the rod, 1 at the hem) */
  sway?: boolean;
  /** flame flicker: needs the `aFlame` attribute (xyz = flame base, w = phase) */
  flame?: boolean;
  /** cheaper Lambert shading (quality 'low') */
  lambert?: boolean;
}

const kitMatCache = new Map<string, THREE.Material>();
/** Per swatch: rgb = multiply tint, w = saturation (1 = as painted). */
function tintArray(t?: KitTints, color?: THREE.ColorRepresentation) {
  const g = new THREE.Color(color ?? 0xffffff);
  const arr: THREE.Vector4[] = [];
  for (let i = 0; i < 32; i++) {
    const e = t?.[i];
    const [col, sat] = Array.isArray(e) ? e : [e ?? 0xffffff, 1];
    const c = new THREE.Color(col).multiply(g);
    arr.push(new THREE.Vector4(c.r, c.g, c.b, sat));
  }
  return arr;
}

/** The kit material for a theme (cached by key). */
export function kitMaterial(key: string, o: KitMatOpts = {}): THREE.Material {
  const ck = `${key}|${o.sway ? 's' : ''}${o.flame ? 'f' : ''}${o.lambert ? 'l' : ''}`;
  const hit = kitMatCache.get(ck);
  if (hit) return hit;
  const tints = { value: tintArray(o.tints, o.color) };
  let m: THREE.Material;
  if (o.flame) {
    m = new THREE.MeshBasicMaterial({ map: kitAtlas(), color: new THREE.Color(2.6, 1.9, 1.25), toneMapped: true, fog: true });
  } else if (o.lambert) {
    m = new THREE.MeshLambertMaterial({ map: kitAtlas(), side: o.sway ? THREE.DoubleSide : THREE.FrontSide });
  } else {
    m = new THREE.MeshStandardMaterial({ map: kitAtlas(), roughness: o.roughness ?? 0.92, metalness: 0, side: o.sway ? THREE.DoubleSide : THREE.FrontSide });
  }
  m.name = `kit:${key}`;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uKitTint = tints;
    sh.uniforms.uKitTime = kitTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec4 uKitTint[32];\nvoid main() {')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        { vec2 kc = floor(clamp(vMapUv, 0.0, 0.9999) * vec2(8.0, 4.0)); vec4 kt = uKitTint[int(kc.y) * 8 + int(kc.x)];
          float kl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(vec3(kl), diffuseColor.rgb, kt.w) * kt.rgb; }`,
      );
    if (o.sway) {
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aSway;\nuniform float uKitTime;\nvoid main() {').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        { float sw = aSway * aSway;
          float ph = position.x * 0.7 + position.z * 0.9;
          transformed.x += sin(uKitTime * 1.7 + ph) * 0.05 * sw;
          transformed.z += (sin(uKitTime * 1.1 + ph * 1.3) * 0.5 + 0.5) * 0.12 * sw; }`,
      );
    }
    if (o.flame) {
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute vec4 aFlame;\nuniform float uKitTime;\nvoid main() {').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        { vec3 rel = transformed - aFlame.xyz;
          float s = 1.0 + 0.16 * sin(uKitTime * 13.0 + aFlame.w) + 0.08 * sin(uKitTime * 31.0 + aFlame.w * 2.3);
          float lean = sin(uKitTime * 3.1 + aFlame.w) * 0.25;
          transformed = aFlame.xyz + vec3(rel.x / sqrt(s) + rel.y * lean * 0.3, rel.y * s, rel.z / sqrt(s)); }`,
      );
    }
  };
  m.customProgramCacheKey = () => `kit2${o.sway ? 's' : ''}${o.flame ? 'f' : ''}${o.lambert ? 'l' : ''}`;
  kitMatCache.set(ck, m);
  return m;
}

/** Dequantize an attribute to Float32 (KHR_mesh_quantization stores int16/int8/uint16). */
function toFloat(attr: THREE.BufferAttribute): THREE.BufferAttribute {
  if (attr.array instanceof Float32Array && !attr.normalized) return attr;
  const n = attr.count * attr.itemSize;
  const out = new Float32Array(n);
  for (let i = 0; i < attr.count; i++)
    for (let c = 0; c < attr.itemSize; c++) out[i * attr.itemSize + c] = attr.getComponent(i, c);
  return new THREE.BufferAttribute(out, attr.itemSize);
}

const kitCache = new Map<string, Promise<THREE.Group>>();
/**
 * A KayKit piece (native units, origin at the floor). Meshes carry `userData.kit = true` and the default kit
 * material; scenes.ts merges static pieces per material. Nodes keep their names (`flame`, `wall_doorway_door`...).
 */
export async function kit(id: string): Promise<THREE.Group> {
  let p = kitCache.get(id);
  if (!p) {
    p = gltf.loadAsync(`${KIT}${id}.glb`).then((g) => {
      const root = g.scene;
      root.name = id;
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const geo = mesh.geometry;
        for (const name of Object.keys(geo.attributes)) geo.setAttribute(name, toFloat(geo.getAttribute(name) as THREE.BufferAttribute));
        geo.deleteAttribute('tangent');
        // bake the dequantization node into the vertices so every mesh sits at identity in its parent
        mesh.updateMatrix();
        geo.applyMatrix4(mesh.matrix);
        mesh.position.set(0, 0, 0);
        mesh.quaternion.identity();
        mesh.scale.set(1, 1, 1);
        geo.computeBoundingBox();
        geo.computeBoundingSphere();
        mesh.material = kitMaterial('default');
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.kit = true;
        let q: THREE.Object3D | null = mesh.parent;
        while (q && q !== root && !q.name) q = q.parent;
        mesh.userData.part = q && q !== root ? q.name : id;
      });
      return root;
    });
    kitCache.set(id, p);
  }
  const src = await p;
  return src.clone(true);
}

export function findAnchors(root: THREE.Object3D, suffix: string): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.name.endsWith(suffix)) out.push(o);
  });
  return out;
}

export function sprite(path: string): THREE.Texture {
  const t = tex(path, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
