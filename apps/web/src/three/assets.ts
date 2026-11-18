/**
 * Asset loading: GLB environment kit (built by tools/python/models) + PBR texture sets (tools/python/textures).
 * Materials are bound by the shared material ids embedded in the GLBs. Everything is cached and shared.
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

/** Load (cached) a GLB from the environment kit and return a fresh clone. */
export async function model(id: string): Promise<THREE.Group> {
  let p = glbCache.get(id);
  if (!p) {
    p = gltf.loadAsync(`${BASE}models/${id}.glb`).then((g) => {
      bindMaterials(g.scene);
      return g.scene;
    });
    glbCache.set(id, p);
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
