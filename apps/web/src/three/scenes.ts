/**
 * Location dioramas built from the GLB kit. The tactical board sits at the origin (enemy side −Z, heroes +Z);
 * set dressing frames it without hiding any Sector. Lights are few and purposeful (key + rim + torches).
 */
import * as THREE from 'three';
import { findAnchors, model, pbr } from './assets';

type P = [id: string, x: number, z: number, rotY?: number, scale?: number, y?: number];

export interface SceneLook {
  fog: number;
  fogDensity: number;
  key: number;
  keyIntensity: number;
  fill: number;
  ambient: number;
  torch: number;
  props: P[];
  torches: [number, number, number][];
  windows?: boolean;
  bellOverhead?: boolean;
}

const WALL_BACK: P[] = [-12, -8, -4, 0, 4, 8, 12].map((x, i) => [i % 2 ? 'wall_window_lancet' : 'wall_segment_4m', x, -10.5, 0, 1] as P);
const SIDE_PILLARS: P[] = [
  ['pillar_gothic', -9.2, -6.5],
  ['pillar_gothic', 9.2, -6.5],
  ['pillar_gothic', -9.2, -1.5],
  ['pillar_gothic', 9.2, -1.5],
  ['pillar_broken', -9.2, 3.5],
  ['pillar_gothic', 9.2, 3.5],
];

export const LOOKS: Record<string, SceneLook> = {
  portico: {
    fog: 0x16151a, fogDensity: 0.045, key: 0x9fb2d0, keyIntensity: 1.5, fill: 0x2a2630, ambient: 0.35, torch: 0xffa050,
    props: [['doorway_gothic', 0, -10.4, 0, 1.15], ['wall_segment_4m', -4.4, -10.5], ['wall_segment_4m', 4.4, -10.5], ['statue_blind_porter', -6.5, -7.5, 0.4, 1.2], ['brazier', 6.2, -7.2, 0, 1], ['rubble_pile', 7, 4, 0.3], ['pillar_broken', -9, -3], ['pillar_gothic', 9, -3]],
    torches: [[-2.6, 3.2, -9.9], [2.6, 3.2, -9.9]],
  },
  galeria: {
    fog: 0x141216, fogDensity: 0.04, key: 0xb6c4dc, keyIntensity: 1.2, fill: 0x2c2420, ambient: 0.3, torch: 0xffa050, windows: true,
    props: [...WALL_BACK, ...SIDE_PILLARS, ['pew', -7.2, -5, Math.PI / 2], ['pew', -7.2, -2.2, Math.PI / 2], ['pew', 7.2, -5, -Math.PI / 2], ['pew', 7.2, -2.2, -Math.PI / 2], ['candle_cluster', -6.4, 6.3], ['candle_cluster', 6.6, 6.1], ['banner_torn', -4, -10, 0, 1, 3.2], ['banner_torn', 4, -10, 0, 1, 3.2], ['bone_pile', 6.5, 2]],
    torches: [[-9.0, 3, -4], [9.0, 3, -4], [-9, 3, 2.5]],
  },
  claustro: {
    fog: 0x15171a, fogDensity: 0.035, key: 0xa8bcd8, keyIntensity: 1.7, fill: 0x262a2e, ambient: 0.38, torch: 0xffa050,
    props: [['arch_gothic', -8, -9.5], ['arch_gothic', -3.2, -9.5], ['arch_gothic', 1.6, -9.5], ['arch_gothic', 6.4, -9.5], ['well_dry', 0, -7.3, 0.4, 0.9], ['pillar_broken', -9.2, -2.5], ['pillar_gothic', 9.2, -2.5], ['pillar_gothic', -9.2, 3], ['pillar_broken', 9.2, 3, 2], ['rubble_pile', -7, 6, 0.5], ['floor_crack_slab', 7, -5.2, 0.6], ['bone_pile', -6.5, -5.5]],
    torches: [[-9.0, 3, 0.2], [9.0, 3, 0.2]],
  },
  scriptorium: {
    fog: 0x15130f, fogDensity: 0.045, key: 0xc8b89a, keyIntensity: 1.0, fill: 0x2e261c, ambient: 0.32, torch: 0xffb060,
    props: [...[-10, -6.6, -3.3, 3.3, 6.6, 10].map((x) => ['bookshelf', x, -9.6, 0, 1.15] as P), ['bookshelf', -9.5, -4.5, Math.PI / 2, 1.1], ['bookshelf', 9.5, -4.5, -Math.PI / 2, 1.1], ['bookshelf', -9.5, 0.5, Math.PI / 2, 1.1], ['bookshelf', 9.5, 0.5, -Math.PI / 2, 1.1], ['desk_scribe', -7, 5.2, 0.4], ['lectern', 7.2, 5.5, -0.5], ['candle_cluster', -6.2, 5.6], ['candle_cluster', 0, -8.5], ['cart_wood', 7.3, -6.8, -0.4, 0.9]],
    torches: [[0, 2.4, -8.6], [-8.6, 2.6, -2], [8.6, 2.6, -2]],
  },
  canil: {
    fog: 0x121110, fogDensity: 0.05, key: 0x9aa8b8, keyIntensity: 1.0, fill: 0x2a1e18, ambient: 0.28, torch: 0xff9040,
    props: [...[-9, -5.4, -1.8, 1.8, 5.4, 9].map((x) => ['cage_grate', x, -9.7, 0, 1.3] as P), ['wall_segment_4m', -6, -10.6], ['wall_segment_4m', -2, -10.6], ['wall_segment_4m', 2, -10.6], ['wall_segment_4m', 6, -10.6], ['bone_pile', -6, -6.5], ['bone_pile', 6.8, 5.5], ['chain_hanging', -8.6, -4, 0, 1, 2.8], ['chain_hanging', 8.6, -4, 0, 1, 2.8], ['pillar_gothic', -9.2, 1], ['pillar_gothic', 9.2, 1], ['cart_wood', -7.5, 5.5, 0.6]],
    torches: [[-9, 2.6, -2], [9, 2.6, -2]],
  },
  carceres: {
    fog: 0x111214, fogDensity: 0.05, key: 0x8fa0b8, keyIntensity: 1.0, fill: 0x261a14, ambient: 0.28, torch: 0xff8840,
    props: [...WALL_BACK.map((p) => ['wall_segment_4m', p[1], p[2]] as P), ['crank_wheel', 0, -8.4, 0, 1.4], ['counterweight', -6, -8.2, 0.2, 1.2], ['counterweight', 6, -8.2, -0.2, 1.2], ...[-8, -4.5, 4.5, 8].map((x) => ['chain_hanging', x, -6, 0, 1.2, 3.4] as P), ['cage_grate', -9.4, -2, Math.PI / 2, 1.2], ['cage_grate', 9.4, -2, -Math.PI / 2, 1.2], ['cage_grate', -9.4, 2.5, Math.PI / 2, 1.2], ['brazier', 7.2, 5.8], ['bone_pile', -7, 5.8]],
    torches: [[-3, 2.8, -9.8], [3, 2.8, -9.8]],
  },
  capela: {
    fog: 0x14100f, fogDensity: 0.04, key: 0xd0a080, keyIntensity: 0.9, fill: 0x30201a, ambient: 0.3, torch: 0xffa060, windows: true,
    props: [...WALL_BACK, ['altar', 0, -8.4, 0, 1.2], ['candelabra', -3.2, -8.2], ['candelabra', 3.2, -8.2], ['candle_cluster', -1.6, -7.2], ['candle_cluster', 1.7, -7.1], ['banner_torn', -6, -10, 0, 1.1, 3.4], ['banner_torn', 6, -10, 0, 1.1, 3.4], ['pew', -7.4, -3.6, Math.PI / 2], ['pew', 7.4, -3.6, -Math.PI / 2], ['pew', -7.4, 0.2, Math.PI / 2], ['pew', 7.4, 0.2, -Math.PI / 2], ['pillar_candle_stand', -8.2, 5.5], ['pillar_candle_stand', 8.2, 5.5], ['censer', 5.2, -6, 0, 1.4, 2.4]],
    torches: [[-8.8, 2.8, -6], [8.8, 2.8, -6]],
  },
  relicario: {
    fog: 0x120f0c, fogDensity: 0.06, key: 0xe0b070, keyIntensity: 0.8, fill: 0x2c1e12, ambient: 0.25, torch: 0xffb050,
    props: [['wall_segment_4m', -6, -8], ['wall_segment_4m', -2, -8], ['wall_segment_4m', 2, -8], ['wall_segment_4m', 6, -8], ['pillar_candle_stand', -7.5, -6.2], ['pillar_candle_stand', 7.5, -6.2], ['pillar_candle_stand', -7.5, 4.5], ['pillar_candle_stand', 7.5, 4.5], ['statue_blind_porter', -8.5, -1, 1.2, 1.1], ['statue_blind_porter', 8.5, -1, -1.2, 1.1], ['candle_cluster', 0, -7]],
    torches: [[-3, 2.5, -7.4], [3, 2.5, -7.4]],
  },
  cripta: {
    fog: 0x0d1014, fogDensity: 0.055, key: 0x8aa8d8, keyIntensity: 0.9, fill: 0x1a2028, ambient: 0.26, torch: 0x9fc8ff,
    props: [['vault_rib_segment', 0, -10, 0, 1.2, 5], ['sarcophagus', -7.2, -6, Math.PI / 2], ['sarcophagus', 7.2, -6, -Math.PI / 2], ['sarcophagus', -7.2, 0, Math.PI / 2], ['sarcophagus', 7.2, 0, -Math.PI / 2], ['pillar_gothic', -9.5, -8.5], ['pillar_gothic', 9.5, -8.5], ['pillar_gothic', -9.5, 4], ['pillar_gothic', 9.5, 4], ['candle_cluster', -7.2, 4.8], ['candle_cluster', 7.2, 4.8], ['wall_segment_4m', -4, -11], ['wall_segment_4m', 0, -11], ['wall_segment_4m', 4, -11]],
    torches: [[0, 2.6, -9.5]],
  },
  salao: {
    fog: 0x121316, fogDensity: 0.035, key: 0xb0c0dc, keyIntensity: 1.3, fill: 0x2a2420, ambient: 0.32, torch: 0xffa050, windows: true,
    props: [...WALL_BACK, ...SIDE_PILLARS, ['banner_torn', -9.2, -4, Math.PI / 2, 1.2, 3.6], ['banner_torn', 9.2, -4, -Math.PI / 2, 1.2, 3.6], ['brazier', -6.5, 5.6], ['brazier', 6.5, 5.6], ['stairs_stone', 0, -9.2, Math.PI, 1.2], ['rubble_pile', -7, -7]],
    torches: [[-9, 3, -1.5], [9, 3, -1.5]],
  },
  campanario: {
    fog: 0x16171c, fogDensity: 0.03, key: 0xa0b4d8, keyIntensity: 1.6, fill: 0x2a2018, ambient: 0.34, torch: 0xffa050, bellOverhead: true,
    props: [['bell_frame', 0, -8.6, 0, 1.25], ['counterweight', -8.2, 1.6, 0.4, 1.3], ['counterweight', 0, 7.8, 0, 1.2], ['counterweight', 8.2, 1.6, -0.4, 1.3], ['chain_hanging', -8.2, 1.6, 0, 1.3, 4.3], ['chain_hanging', 8.2, 1.6, 0, 1.3, 4.3], ['pillar_broken', -9.5, -7], ['pillar_broken', 9.5, -7, 1.4], ['rubble_pile', 6.5, -6.5], ['crank_wheel', -7.5, -6, 0.6]],
    torches: [[-6, 2.8, -8.5], [6, 2.8, -8.5]],
  },
};

export interface BuiltScene {
  group: THREE.Group;
  lights: THREE.Light[];
  flicker: { light: THREE.PointLight; base: number; phase: number }[];
  emberSources: THREE.Vector3[];
  bell?: THREE.Object3D;
  dispose(): void;
}

export async function buildScene(sceneId: string, quality: 'low' | 'medium' | 'high'): Promise<BuiltScene> {
  const look = LOOKS[sceneId] ?? LOOKS.galeria;
  const group = new THREE.Group();
  group.name = `scene:${sceneId}`;
  const lights: THREE.Light[] = [];
  const flicker: BuiltScene['flicker'] = [];
  const embers: THREE.Vector3[] = [];

  // floor: large tiled ground with stone texture
  const floorMat = pbr('stone_floor', { repeat: 6, color: 0x7c7a78 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 30), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -2);
  floor.receiveShadow = true;
  floor.geometry.setAttribute('uv1', floor.geometry.getAttribute('uv'));
  group.add(floor);

  // the confronto line: a subtle carved channel between the two Frentes
  const channel = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 0.16), new THREE.MeshStandardMaterial({ color: 0x0a0909, roughness: 1 }));
  channel.rotation.x = -Math.PI / 2;
  channel.position.set(0, 0.011, 0);
  group.add(channel);

  const loads = look.props.map(async ([id, x, z, ry = 0, sc = 1, y = 0]) => {
    try {
      const m = await model(id);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.scale.setScalar(sc);
      group.add(m);
      for (const a of findAnchors(m, '_flame_anchor')) {
        a.updateWorldMatrix(true, false);
        embers.push(new THREE.Vector3().setFromMatrixPosition(a.matrixWorld));
      }
      return m;
    } catch {
      return null;
    }
  });
  await Promise.all(loads);

  // lights
  const hemi = new THREE.HemisphereLight(look.key, look.fill, look.ambient * 3.2);
  group.add(hemi);
  lights.push(hemi);
  const key = new THREE.DirectionalLight(look.key, look.keyIntensity * 2.2);
  key.position.set(-6, 14, 6);
  key.target.position.set(0, 0, -1);
  key.castShadow = quality !== 'low';
  const sm = quality === 'high' ? 2048 : 1024;
  key.shadow.mapSize.set(sm, sm);
  key.shadow.camera.left = -12;
  key.shadow.camera.right = 12;
  key.shadow.camera.top = 12;
  key.shadow.camera.bottom = -12;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 40;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.03;
  group.add(key, key.target);
  lights.push(key);
  const rim = new THREE.DirectionalLight(0xffc28a, 1.1);
  rim.position.set(5, 6, -12);
  group.add(rim);
  lights.push(rim);

  const front = new THREE.DirectionalLight(0xffe2c0, 0.9);
  front.position.set(2, 8, 14);
  group.add(front);
  lights.push(front);
  const maxTorches = quality === 'low' ? 1 : quality === 'medium' ? 3 : 4;
  look.torches.slice(0, maxTorches).forEach(([x, y, z], i) => {
    const l = new THREE.PointLight(look.torch, 30, 15, 2);
    l.position.set(x, y, z);
    group.add(l);
    lights.push(l);
    flicker.push({ light: l, base: 30, phase: i * 1.7 });
    embers.push(new THREE.Vector3(x, y, z));
  });
  // torch props at light positions (wall sconces)
  for (const [x, y, z] of look.torches) {
    try {
      const t = await model('torch_sconce');
      t.position.set(x, y - 0.6, z + (z < -9 ? 0.2 : 0));
      if (Math.abs(x) > 8) t.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
      group.add(t);
    } catch {
      /* ignore */
    }
  }
  // god rays through windows (fake volumetric, cheap)
  if (look.windows && quality !== 'low') {
    const shaftTex = new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'assets/textures/light_shaft.png');
    shaftTex.colorSpace = THREE.SRGBColorSpace;
    for (const x of [-8, 0, 8]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 9), new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xc8d8ff, side: THREE.DoubleSide }));
      m.position.set(x + 1.2, 3.6, -7.6);
      m.rotation.set(-0.5, 0, 0.25);
      group.add(m);
    }
  }
  let bell: THREE.Object3D | undefined;
  if (look.bellOverhead) {
    try {
      const b = await model('bell_great_cracked');
      b.scale.setScalar(1.6);
      b.position.set(0, 4.1, -8.6);
      group.add(b);
      bell = b;
      const glow = new THREE.PointLight(0xffa050, 6, 8, 2);
      glow.position.set(0, 3.2, -7.4);
      group.add(glow);
      flicker.push({ light: glow, base: 6, phase: 3 });
    } catch {
      /* ignore */
    }
  }
  return {
    group,
    lights,
    flicker,
    emberSources: embers,
    bell,
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.geometry && !m.geometry.userData.shared) {
          /* geometries from GLB cache are shared clones; keep them */
        }
      });
    },
  };
}
