/**
 * Location rooms — handcrafted modular dioramas built from the KayKit Dungeon Remastered kit (CC0, the same studio
 * and style as the characters) plus the monastery hero props (bell, statue, altar...) restyled to match.
 *
 * DATA-DRIVEN PER DUNGEON: a dungeon adds one THEME (kit scale, gothic wall height, atlas swatch tints, heraldry,
 * default palette) and its ROOMS keyed by sceneId (wall modules per side, floor, props, torches, lights,
 * particles, palette overrides). The builder below never changes for a new dungeon.
 *
 * FRAME: the tactical board sits at the origin — enemy rows at −Z, heroes at +Z, sectors within x ≈ ±5,
 * z ≈ ±4.6 — and is kept clear (the builder refuses props inside it). The combat camera looks from +Z, so the
 * north wall (−Z) is the backdrop and carries each room's identity.
 *
 * WALK CONTRACT for the real-time World module — `BuiltScene.walk` (metres, world space, floor at y = 0):
 *   bounds:    { minX, maxX, minZ, maxZ }  the walkable rectangle inside the walls
 *   colliders: { x, z, r }[]               circles to keep out of (furniture, pillars, statues...); the walls
 *                                          themselves are the bounds
 *   exits:     { north, south, east, west } each { x, z }: a doorway threshold just inside the opening. Every
 *                                          room has all four (the north/east/west ones are real doorways in
 *                                          the wall, the south one is the gap in the low front wall), so any
 *                                          campaign path can be mapped onto a door.
 * `BuiltScene.doors[side]` is the hinged door leaf of that doorway, if any (rotate `.rotation.y` to open it).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { findAnchors, kit, kitMaterial, kitTime, model, sprite, type KitTints } from './assets';

export type SceneQuality = 'low' | 'medium' | 'high';
export type Side = 'north' | 'south' | 'east' | 'west';

/** Prop placement: [piece, x, z, rotY?, scale?, y?]. piece = KayKit id, or 'm:<id>' for a monastery hero prop;
 *  a leading '~' means "no collider" (hanging or flat things). Kit pieces scale with the theme. */
export type P = [piece: string, x: number, z: number, rotY?: number, scale?: number, y?: number];

export interface Grade {
  /** shadows tint (added) */
  lift: number;
  /** highlights tint (multiplied) */
  gain: number;
  sat: number;
  contrast: number;
  vignette: number;
}

export interface Palette {
  fog: number;
  fogDensity: number;
  /** hemisphere ambient: sky / ground colours and intensity */
  sky: number;
  ground: number;
  hemi: number;
  /** key light (casts the shadows) */
  key: number;
  keyIntensity: number;
  keyPos: [number, number, number];
  /** back light that draws bright rims on the figures */
  rim: number;
  rimIntensity: number;
  /** soft pool of light on the board */
  stage: number;
  stageIntensity: number;
  torch: number;
  torchIntensity: number;
  exposure: number;
  grade: Grade;
}

export interface Theme {
  id: string;
  /** KayKit native units → metres (walls are 4 × 4 × 1 native) */
  kitScale: number;
  /** wall height multiplier (gothic proportions) */
  wallH: number;
  tints: KitTints;
  heraldry: string;
  floor: string;
  palette: Palette;
}

export interface RoomDef {
  dungeon: string;
  theme: string;
  /** wall modules (KayKit ids). north/south west→east (7), east/west north→south (6). 'door' = doorway with a
   *  hinged leaf, 'open' = open doorway frame; the first of those on a side is its exit (else the middle). */
  north: string[];
  east: string[];
  west: string[];
  south: string[];
  floor?: { base?: string; mix?: [string, number][]; patches?: { piece: string; x0: number; z0: number; x1: number; z1: number; mix?: [string, number][] }[] };
  props: P[];
  /** wall torches: side + offset along that wall (metres; x for north/south, z for east/west) */
  torches?: [Side, number][];
  /** extra point lights (candles, braziers, magic); listed first = more important */
  lights?: { x: number; y: number; z: number; color?: number; intensity?: number; dist?: number }[];
  /** moonlight shafts falling from the north windows (x positions) */
  shafts?: number[];
  dust?: number;
  embers?: number;
  ash?: number;
  mist?: number;
  sky?: boolean;
  /** what shows through windows and gates: the night sky (default) or darkness (cells, crypts) */
  beyond?: 'sky' | 'dark';
  /** false for rooms without battles (no board area to keep clear) */
  combat?: boolean;
  /** carpets laid on the floor (procedural): centre, size, colours */
  rugs?: { x: number; z: number; w: number; d: number; color: number; border: number; rot?: number }[];
  /** carved/painted marks on walls (procedural) */
  decals?: { kind: 'sevenLines'; x: number; y: number; z: number; w: number; h: number; rot?: number }[];
  /** the inlaid floor medallion at the heart of the room (seen while exploring; the board covers it in battle) */
  medallion?: { emblem?: Emblem; ink?: number } | false;
  /** open fires (braziers, hearths): flame + glow + embers + light */
  fires?: { x: number; y: number; z: number; s?: number }[];
  look?: Partial<Omit<Palette, 'grade'>> & { grade?: Partial<Grade> };
  bell?: boolean;
  /** room half-width / north / south wall lines (defaults 10.5 / 9 / 9) */
  dims?: { x?: number; n?: number; s?: number };
  seed?: number;
}

export type Emblem = 'bell' | 'book' | 'key' | 'cross' | 'skull' | 'sword' | 'paw';

export interface WalkData {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  colliders: { x: number; z: number; r: number }[];
  exits: Partial<Record<Side, { x: number; z: number }>>;
}

export interface BuiltScene {
  id: string;
  dungeon: string;
  group: THREE.Group;
  lights: THREE.Light[];
  flicker: { light: THREE.PointLight; base: number; phase: number }[];
  emberSources: THREE.Vector3[];
  /** points where dust motes gather (light shafts, candle groups) */
  dustSources: THREE.Vector3[];
  /** ambience levels for the particle system */
  particles: { dust: number; ash: number; embers: number };
  bell?: THREE.Object3D;
  look: Palette;
  walk: WalkData;
  doors: Partial<Record<Side, THREE.Object3D>>;
  /** named dynamic objects (e.g. 'altar', 'statue', 'well') for scripted moments */
  named: Record<string, THREE.Object3D>;
  /** per-frame life of the room (flicker, bell, mist); the Diorama calls it */
  update(dt: number, t: number): void;
  /** device pixels per world unit at distance 1 (drawing-buffer height / (2·tan(fov/2))) for sprite glows */
  setPixelScale(px: number): void;
  dispose(): void;
}

// ====================================================================================== themes (one per dungeon)
const MONASTERY: Palette = {
  fog: 0x0d0c10,
  fogDensity: 0.024,
  sky: 0x8894b8,
  ground: 0x3a2c22,
  hemi: 0.55,
  key: 0xd0dcff,
  keyIntensity: 0.9,
  keyPos: [-6, 14, 7],
  rim: 0x9fb8ff,
  rimIntensity: 0.3,
  stage: 0xffe2c0,
  stageIntensity: 1.0,
  torch: 0xff9a48,
  torchIntensity: 1,
  exposure: 1.12,
  grade: { lift: 0x0a0812, gain: 0xfff2e0, sat: 1.08, contrast: 1.08, vignette: 0.5 },
};

export const THEMES: Record<string, Theme> = {
  /** Dungeon 1 — Mosteiro do Sino Partido: cold limestone, dark oak, ecclesiastic red and white. */
  monastery: {
    id: 'monastery',
    kitScale: 0.75,
    wallH: 1.32,
    tints: {
      0: [0x9a9690, 0.8], // wall caps: deeper slate
      1: [0xd8d2ca, 0.85], // limestone faces
      2: [0xa08070, 0.7], // warm wood → dark oak
      4: [0xa89080, 0.62], // main wood (doors, tables, planks): old oak, not orange
      5: [0xa49a8c, 0.7], // floor flags and dirt: worn, a step darker than the walls
      6: [0xc8a890, 0.8],
      7: [0xb8aea4, 0.85], // dark planks
    },
    heraldry: 'red',
    floor: 'floor_tile_large',
    palette: MONASTERY,
  },
};

// ====================================================================================== rooms (Dungeon 1)
const PI = Math.PI;
const H = PI / 2;
const W7 = (...m: string[]) => m; // documentation helper: 7 modules west→east
const LOW_FRONT = ['barrier_column', 'barrier', 'barrier', 'gap', 'barrier', 'barrier', 'barrier_column'];

export const ROOMS: Record<string, RoomDef> = {
  // L01 — the entrance: a monumental gothic portal, a blind monk statue holding a carved key, a basin of old ash
  portico: {
    dungeon: 'd1',
    theme: 'monastery',
    combat: false,
    north: W7('wall_broken', 'wall_arched', 'wall', 'm:doorway_gothic', 'wall', 'wall_arched', 'wall_cracked'),
    west: ['wall_window_closed', 'wall', 'door', 'wall_cracked', 'wall', 'wall'],
    east: ['wall_window_closed', 'wall_cracked', 'door', 'wall', 'wall_broken', 'wall'],
    south: W7('barrier', 'barrier_column', 'barrier', 'gap', 'barrier', 'barrier_half', 'barrier_column'),
    floor: { mix: [['floor_tile_large_rocks', 0.25]], patches: [{ piece: 'floor_dirt_large', x0: -10.5, z0: 3, x1: -4.5, z1: 9, mix: [['floor_dirt_large_rocky', 0.5]] }, { piece: 'floor_dirt_large_rocky', x0: 7.5, z0: 6, x1: 10.5, z1: 9 }] },
    props: [
      ['m:statue_blind_porter', -3.9, -7.1, 0.25, 1.35],
      ['m:brazier', 3.9, -7.0, 0, 1.2],
      ['column', -2.3, -7.9, 0, 1.25],
      ['column', 2.3, -7.9, 0, 1.25],
      ['pillar', -7.6, -7.6, 0, 0.9],
      ['pillar', 7.6, -7.6, 0, 0.9],
      ['rubble_large', 8.6, 6.2, 0.4, 0.7],
      ['rubble_half', -10.1, 0.6, 0, 0.75],
      ['~floor_tile_small_weeds_A', -6.9, -4.6],
      ['~floor_tile_small_weeds_B', 7.6, 2.4, 1.1],
      ['~floor_tile_small_broken_A', 6.4, -5.0, 0.4],
      ['~floor_dirt_small_weeds', -4.2, 4.6, 0.6],
      ['barrel_large', -9.2, 7.0, 0.3, 0.8],
      ['box_small', -8.2, 7.8, 0.6, 0.9],
      ['trunk_large_B', 9.1, -6.6, -H, 0.75],
      ['~floor_dirt_small_weeds', 6.2, 6.4, 2.2],
      ['candle_melted', -2.8, -7.4, 0, 1.1],
      ['~sword_shield_broken', 10.1, -4.6, -H, 1, 2.0],
      ['~banner_patternC_white', -6, -9, 0, 1, 1.05],
      ['~banner_patternC_white', 6, -9, 0, 1, 1.05],
    ],
    torches: [['north', -2.6], ['north', 2.6], ['west', 4.5], ['east', 4.5]],
    lights: [{ x: 3.9, y: 1.3, z: -6.6, color: 0xff6a2a, intensity: 0.25, dist: 4 }],
    ash: 1.6,
    embers: 0.4,
    dust: 0.5,
    sky: true,
    look: { fog: 0x0c0d12, fogDensity: 0.02, key: 0xc8d4f0, keyIntensity: 1.1, grade: { lift: 0x08091a, gain: 0xf4f0ff, sat: 1.02 } },
  },

  // L02 — the pilgrims' gallery: a long nave of arched windows, pews where the hollow pilgrims knelt
  galeria: {
    dungeon: 'd1',
    theme: 'monastery',
    north: W7('wall', 'wall_archedwindow_gated', 'wall_archedwindow_open', 'door', 'wall_archedwindow_open', 'wall_archedwindow_gated', 'wall'),
    west: ['wall_archedwindow_open', 'wall', 'door', 'wall_archedwindow_open', 'wall', 'wall_archedwindow_gated'],
    east: ['wall_archedwindow_open', 'wall', 'door', 'wall_archedwindow_open', 'wall', 'wall_archedwindow_gated'],
    south: LOW_FRONT,
    floor: { mix: [['floor_tile_large_rocks', 0.1]] },
    rugs: [{ x: 0, z: -6.7, w: 1.7, d: 3.6, color: 0x4a1612, border: 0xa88a48 }],
    props: [
      ['m:pew', -3.3, -6.9, 0, 1],
      ['m:pew', 3.3, -6.9, 0, 1],
      ['m:pew', -7.9, -6.4, 0, 1],
      ['m:pew', -7.9, -3.4, 0, 1],
      ['m:pew', -7.9, -0.4, 0, 1],
      ['m:pew', 7.9, -6.4, 0, 1],
      ['m:pew', 7.9, -3.4, 0, 1],
      ['m:pew', 7.9, -0.4, 0, 1],
      ['candle_triple', -5.3, -7.8, 0.3, 1.2],
      ['candle_lit', -5.0, -7.2, 0, 1],
      ['candle_lit', -1.4, -7.9, 0, 1.05],
      ['candle_thin_lit', -1.8, -7.6, 0, 1],
      ['candle_lit', 1.4, -7.9, 0, 1.05],
      ['candle_thin_lit', 1.8, -7.6, 0, 1],
      ['candle_triple', 5.3, -7.8, -0.4, 1.2],
      ['candle_melted', 5.0, -7.2, 0, 1.2],
      ['pillar_decorated', -9.3, 2.6, H, 0.9],
      ['pillar_decorated', 9.3, 2.6, -H, 0.9],
      ['pillar', -9.4, 6.4, 0, 1],
      ['pillar', 9.4, 6.4, 0, 1],
      ['m:bone_pile', 7.4, 5.4, 0.5, 1],
      ['trunk_small_A', -9.1, 7.7, 0.4, 1],
      ['box_small', 8.9, 7.8, -0.3, 0.9],
      ['candle_triple', -6.7, 6.4, 0, 1.1],
      ['candle_lit', 6.9, 6.1, 0, 1],
      ['~floor_tile_small_broken_A', -7.2, 4.2, 0.3],
      ['~banner_red', -9, -9, 0, 1, 1.05],
      ['~banner_red', 9, -9, 0, 1, 1.05],
      ['~banner_thin_red', -10.5, 4.5, H, 1, 1.05],
      ['~banner_thin_red', 10.5, 4.5, -H, 1, 1.05],
    ],
    torches: [['north', -1.75], ['north', 1.75], ['west', -4.5], ['east', -4.5], ['west', 4.5], ['east', 4.5]],
    lights: [{ x: 0, y: 1.2, z: -7.3, color: 0xffb060, intensity: 0.6, dist: 7 }],
    shafts: [-3, 3],
    dust: 1.2,
    embers: 0.4,
    sky: true,
    look: { fogDensity: 0.02 },
  },

  // L03 — the broken cloister: a dead garden open to the night, an arcade of columns, a dry well, four paths
  claustro: {
    dungeon: 'd1',
    theme: 'monastery',
    combat: false,
    north: W7('wall_cracked', 'wall_arched', 'wall_arched', 'door', 'wall_arched', 'wall_arched', 'wall_broken'),
    west: ['wall_arched', 'wall_arched', 'door', 'wall_arched', 'wall_cracked', 'wall_arched'],
    east: ['wall_arched', 'wall_broken', 'door', 'wall_arched', 'wall_arched', 'wall_arched'],
    south: W7('barrier_column', 'barrier', 'barrier_half', 'gap', 'barrier', 'barrier', 'barrier_column'),
    floor: {
      mix: [['floor_tile_large_rocks', 0.15]],
      patches: [{ piece: 'floor_dirt_large', x0: -6, z0: -6, x1: 6, z1: 6, mix: [['floor_dirt_large_rocky', 0.35]] }],
    },
    props: [
      ['m:well_dry', 0, -3.4, 0.35, 0.95],
      ['pillar', -6.2, -6.2, 0, 0.85],
      ['pillar', 6.2, -6.2, 0, 0.85],
      ['pillar', -6.2, 6.2, 0, 0.85],
      ['pillar', 6.2, 6.2, 0, 0.85],
      ['m:pillar_gothic', -6.2, -3.1, 0, 0.46],
      ['m:pillar_gothic', -6.2, 0, 0, 0.46],
      ['m:pillar_gothic', -6.2, 3.1, 0, 0.46],
      ['m:pillar_gothic', 6.2, -3.1, 0, 0.46],
      ['m:pillar_gothic', 6.2, 0, 0, 0.46],
      ['m:pillar_gothic', 6.2, 3.1, 0, 0.46],
      ['m:pillar_gothic', -3.1, -6.2, 0, 0.46],
      ['m:pillar_gothic', 3.1, -6.2, 0, 0.46],
      ['rubble_large', -8.6, 5.6, 0.7, 0.62],
      ['rubble_half', 10.1, 3.6, PI, 0.6],
      ['m:pillar_broken', 8.6, -4.8, 1.4, 0.9],
      ['~floor_dirt_small_weeds', -3.4, -4.6, 0.4],
      ['~floor_dirt_small_weeds', 3.4, 2.6, 1.6],
      ['~floor_dirt_small_weeds', -2.6, 3.8, 2.6],
      ['~floor_tile_small_weeds_A', -8.4, -1.2],
      ['~floor_tile_small_weeds_B', 8.6, 1.2],
      ['m:bone_pile', -5.2, -7.6, 0.4, 1],
      ['~banner_patternC_white', -3, -9, 0, 1, 1.05],
      ['~banner_patternC_white', 3, -9, 0, 1, 1.05],
    ],
    torches: [['west', -4.5], ['east', -4.5], ['north', -6], ['north', 6]],
    ash: 1,
    dust: 0.6,
    sky: true,
    look: { key: 0xb8c8f0, keyIntensity: 1.25, fogDensity: 0.018, hemi: 0.42, grade: { lift: 0x070a18, gain: 0xeef2ff, sat: 1.0 } },
  },

  // L04 — the scriptorium: shelves of rotting codices, scribes' desks under candlelight, seven carved lines
  scriptorium: {
    medallion: { emblem: 'book' },
    dungeon: 'd1',
    theme: 'monastery',
    north: W7('wall_shelves', 'wall_shelves', 'wall', 'door', 'wall_window_closed', 'wall_shelves', 'wall_shelves'),
    west: ['wall_shelves', 'wall_shelves', 'door', 'wall_shelves', 'wall', 'wall_shelves'],
    east: ['wall_shelves', 'wall_shelves', 'door', 'wall_shelves', 'wall_shelves', 'wall'],
    south: LOW_FRONT,
    beyond: 'dark',
    floor: { base: 'floor_wood_large_dark', mix: [['floor_wood_large', 0.3]] },
    decals: [{ kind: 'sevenLines', x: -3, y: 2.3, z: -8.58, w: 2.4, h: 2.4 }],
    rugs: [{ x: 3.1, z: -6.8, w: 2.6, d: 1.8, color: 0x3a2a4a, border: 0x9a7a40 }],
    props: [
      ['m:lectern', -3, -7.3, 0, 1.2],
      ['m:desk_scribe', 3.1, -7.1, 0, 1.15],
      ['candle_lit', 2.5, -7.2, 0, 0.85, 0.9],
      ['candle_triple', -5.2, -7.8, 0.4, 1.1],
      ['candle_lit', -4.8, -7.3, 0, 1],
      ['candle_thin_lit', 5.3, -7.7, 0, 1.1],
      ['m:bookshelf', -7.7, -6.4, H, 1],
      ['m:bookshelf', -7.7, -3.6, H, 1],
      ['m:bookshelf', 7.7, -6.4, -H, 1],
      ['m:bookshelf', 7.7, -3.6, -H, 1],
      ['table_medium', -7.7, 1.4, H, 0.95],
      ['candle_lit', -7.5, 0.8, 0, 0.9, 0.75],
      ['bottle_A_brown', -7.9, 1.8, 0, 0.8, 0.75],
      ['table_small_decorated_A', 7.8, 1.4, -H, 1],
      ['m:desk_scribe', 8.4, 5.4, -1.2, 1.1],
      ['table_long', -8.4, 5.6, H, 0.9],
      ['candle_triple', -8.3, 5.1, 0.2, 1, 0.75],
      ['bottle_B_green', -8.5, 6.2, 0, 0.8, 0.75],
      ['box_small', 9.2, -0.9, 0.3, 0.8],
      ['trunk_medium_A', -9.2, -0.4, H, 0.85],
      ['box_stacked', 9.0, 7.6, -0.3, 0.6],
      ['candle_triple', 6.6, 7.6, 0, 1.1],
      ['bottle_C_brown', -6.9, 7.7, 0, 0.9],
    ],
    torches: [['west', 0.2], ['east', 0.2]],
    lights: [
      { x: -3, y: 2.0, z: -6.6, color: 0xffb060, intensity: 0.9, dist: 7 },
      { x: 3.0, y: 1.6, z: -6.6, color: 0xffa050, intensity: 0.7, dist: 6 },
      { x: -5.0, y: 1.0, z: -7.0, color: 0xffa050, intensity: 0.4, dist: 4 },
    ],
    dust: 1.5,
    embers: 0.2,
    look: { torch: 0xffa858, key: 0xffdcb0, keyIntensity: 0.6, fog: 0x100c08, hemi: 0.45, grade: { lift: 0x0c0804, gain: 0xffeed8, sat: 1.12 } },
  },

  // L05 — the kennel of the Vigil: cages, chains, straw and bones; something breathes behind the bars
  canil: {
    medallion: { emblem: 'paw' },
    dungeon: 'd1',
    theme: 'monastery',
    north: W7('wall_gated', 'wall_gated', 'wall', 'door', 'wall', 'wall_gated', 'wall_gated'),
    west: ['wall_gated', 'wall', 'door', 'wall_gated', 'wall', 'wall_cracked'],
    east: ['wall_gated', 'wall_cracked', 'door', 'wall_gated', 'wall', 'wall'],
    south: W7('barrier_column', 'barrier', 'barrier_half', 'gap', 'barrier', 'barrier', 'barrier_column'),
    beyond: 'dark',
    floor: { base: 'floor_dirt_large', mix: [['floor_dirt_large_rocky', 0.4]], patches: [{ piece: 'floor_tile_large', x0: -10.5, z0: -9, x1: 10.5, z1: -6, mix: [['floor_tile_large_rocks', 0.4]] }] },
    props: [
      ['~bed_floor', -3.5, -7.4, 0.15, 1],
      ['~bed_floor', 3.6, -7.5, -0.25, 1],
      ['~bed_floor', -9, -7.6, 0, 1],
      ['~bed_floor', 9.3, -4.6, -H, 0.9],
      ['plate', -2.1, -6.6, 0, 1.1],
      ['plate', 2.2, -6.8, 0, 1.1],
      ['m:bone_pile', -5.2, -6.6, 0.4, 1],
      ['m:bone_pile', 5.4, -6.2, 2.2, 1],
      ['m:bone_pile', 7.3, 5.6, 1.4, 1],
      ['m:bone_pile', -8.8, 2.4, 2.1, 1],
      ['column', -5.0, -8.0, 0, 1.2],
      ['column', 5.0, -8.0, 0, 1.2],
      ['~m:chain_hanging', -5.0, -7.7, 0, 1, 1.05],
      ['~m:chain_hanging', 5.0, -7.7, 0, 1, 1.05],
      ['barrel_large', -9.2, 6.4, 0.4, 0.8],
      ['barrel_small', -8.1, 7.6, 0, 0.9],
      ['barrel_small', 4.6, -8.0, 0.3, 0.8],
      ['box_large', 9.1, 7.4, 0.3, 0.75],
      ['m:cart_wood', 8.4, 1.6, -1.2, 0.9],
      ['~keyring_hanging', -1.9, -8.55, 0, 1, 2.3],
      ['~floor_dirt_small_weeds', -6.3, 5.9],
      ['rubble_half', 10.1, -1.6, PI, 0.55],
      ['barrel_small', 9.1, -2.2, 0, 0.9],
      ['~bed_floor', -9.3, -2.4, H, 0.9],
      ['m:cage_grate', -9.4, 4.6, H, 1.1],
      ['m:cage_grate', 9.4, 2.2, -H, 1.1],
      ['plate', -8.2, -3.6, 0, 1],
      ['~floor_dirt_small_weeds', 6.8, -3.8, 1.2],
    ],
    torches: [['north', -1.75], ['north', 1.75], ['west', 4.5], ['east', 4.5]],
    dust: 0.9,
    embers: 0.5,
    look: { torch: 0xff8a3a, fog: 0x0e0b0a, fogDensity: 0.026, key: 0xffd8b0, keyIntensity: 0.7, grade: { lift: 0x0d0806, gain: 0xffe8d0, sat: 1.05 } },
  },

  // L06 — the prisons of the counterweight: cells on both sides, the great mechanism, chains to the ceiling
  carceres: {
    medallion: { emblem: 'key' },
    dungeon: 'd1',
    theme: 'monastery',
    north: W7('wall_gated', 'wall_scaffold', 'wall', 'door', 'wall', 'wall_scaffold', 'wall_gated'),
    west: ['wall_gated', 'wall_gated', 'door', 'wall_gated', 'wall_gated', 'wall'],
    east: ['wall_gated', 'wall_gated', 'door', 'wall_gated', 'wall_gated', 'wall'],
    south: LOW_FRONT,
    beyond: 'dark',
    floor: { mix: [['floor_tile_large_rocks', 0.2]], patches: [{ piece: 'floor_tile_big_grate', x0: -1.5, z0: 6, x1: 1.5, z1: 9 }] },
    props: [
      ['m:crank_wheel', -3.6, -7.3, 0.12, 1.5],
      ['m:counterweight', 3.5, -7.5, 0, 1.3],
      ['~m:chain_hanging', 2.8, -7.4, 0, 1.4, 2.0],
      ['~m:chain_hanging', 4.2, -7.4, 0, 1.4, 2.0],
      ['~m:chain_hanging', -7.6, -6, 0, 1.3, 2.2],
      ['~m:chain_hanging', 7.6, -6, 0, 1.3, 2.2],
      ['~floor_tile_grate', -7.6, -1.5, 0, 1],
      ['~floor_tile_grate', 7.6, 1.5, 0, 1],
      ['bed_frame', -9.3, -6.6, 0, 0.8],
      ['bed_frame', 9.3, 4.2, 0, 0.8],
      ['~keyring_hanging', 1.25, -8.55, 0, 1, 2.3],
      ['barrel_small_stack', 8.6, -6.6, -0.4, 0.8],
      ['box_stacked', -8.9, 6.6, 0.5, 0.65],
      ['m:bone_pile', -7.6, 3.4, 0.3, 1],
      ['m:cage_grate', 6.4, 6.6, -0.3, 1],
      ['m:bone_pile', -5.6, -7.6, 1.2, 1],
      ['barrel_small', -9.2, 1.4, 0, 0.8],
      ['box_small', 9.2, -2.2, 0.4, 0.8],
      ['bed_frame', -9.3, 4.4, 0, 0.8],
      ['~keyring_hanging', -10.1, -4.2, H, 1, 2.3],
      ['candle_melted', -5.4, -8.1, 0, 1.2],
      ['candle_melted', 5.6, -8.2, 0, 1.1],
    ],
    torches: [['north', -1.75], ['north', 1.75], ['west', 0], ['east', 0]],
    lights: [{ x: 0, y: 2.5, z: 7.5, color: 0x88a8d8, intensity: 0.5, dist: 7 }],
    dust: 0.7,
    embers: 0.5,
    look: { fog: 0x0b0c0f, fogDensity: 0.024, key: 0xd8e0f0, keyIntensity: 0.8, torch: 0xff8a40, grade: { lift: 0x070a10, gain: 0xf6f0ea, sat: 0.98 } },
  },

  // L07 — the chapel of the last office: altar under a stained window, pews, a hundred candles, a censer swinging
  capela: {
    medallion: { emblem: 'cross' },
    dungeon: 'd1',
    theme: 'monastery',
    north: W7('wall_window_closed', 'wall_pillar', 'door', 'm:wall_window_lancet', 'wall', 'wall_pillar', 'wall_window_closed'),
    west: ['wall_archedwindow_gated', 'wall', 'door', 'wall_archedwindow_gated', 'wall', 'wall'],
    east: ['wall_archedwindow_gated', 'wall', 'door', 'wall_archedwindow_gated', 'wall', 'wall'],
    south: LOW_FRONT,
    floor: { mix: [['floor_tile_large_rocks', 0.06]] },
    rugs: [{ x: 0, z: -5.6, w: 1.8, d: 1.4, color: 0x4a1612, border: 0xb89450 }],
    props: [
      ['m:altar', 0, -7.5, 0, 1.05],
      ['m:candelabra', -2.5, -7.6, 0, 1.2],
      ['m:candelabra', 2.5, -7.6, 0, 1.2],
      ['candle_triple', -1.2, -7.35, 0, 0.9, 1.33],
      ['candle_triple', 1.2, -7.35, PI, 0.9, 1.33],
      ['candle_lit', -4.6, -8.1, 0, 1.1],
      ['candle_thin_lit', -4.1, -7.8, 0, 1],
      ['candle_melted', -5.1, -7.7, 0, 1.2],
      ['candle_lit', 4.6, -8.1, 0, 1.1],
      ['candle_thin_lit', 4.1, -7.8, 0, 1],
      ['candle_melted', 5.1, -7.7, 0, 1.2],
      ['m:pew', -7.9, -6.4, 0, 1],
      ['m:pew', -7.9, -3.4, 0, 1],
      ['m:pew', -7.9, -0.4, 0, 1],
      ['m:pew', 7.9, -6.4, 0, 1],
      ['m:pew', 7.9, -3.4, 0, 1],
      ['m:pew', 7.9, -0.4, 0, 1],
      ['m:pillar_candle_stand', -6.2, 3.2, 0, 1.2],
      ['m:pillar_candle_stand', 6.2, 3.2, 0, 1.2],
      ['~m:censer', 3.6, -5.6, 0, 1.4, 2.6],
      ['m:well_dry', -8.6, 6.4, 0.3, 0.55],
      ['candle_triple', 7.2, 6.6, 0, 1.1],
      ['candle_lit', 6.6, 7.2, 0, 1],
      ['trunk_large_A', 9.0, 5.0, -H, 0.8],
      ['~banner_patternC_white', 3, -9, 0, 1, 1.05],
      ['~banner_thin_red', -10.5, 4.5, H, 1, 1.05],
      ['~banner_thin_red', 10.5, 4.5, -H, 1, 1.05],
    ],
    torches: [['west', 1.5], ['east', 1.5]],
    lights: [
      { x: 0, y: 2.4, z: -6.2, color: 0xffb468, intensity: 0.7, dist: 8 },
      { x: 0, y: 4.4, z: -8.0, color: 0xc070ff, intensity: 0.7, dist: 9 },
      { x: -4.6, y: 1.2, z: -7.5, color: 0xffa860, intensity: 0.35, dist: 4 },
      { x: 4.6, y: 1.2, z: -7.5, color: 0xffa860, intensity: 0.35, dist: 4 },
    ],
    dust: 1.3,
    embers: 0.3,
    look: { torch: 0xffa860, key: 0xffd6b0, keyIntensity: 0.6, hemi: 0.45, fog: 0x100a10, grade: { lift: 0x0c0610, gain: 0xffeedd, sat: 1.12 } },
  },

  // L08 (secret) — the reliquary: a room too small for its architecture, gold in the dark, one chest that waits
  relicario: {
    dungeon: 'd1',
    theme: 'monastery',
    dims: { x: 7.5, n: 7.5, s: 7.5 },
    north: ['wall_pillar', 'wall_arched', 'door', 'wall_arched', 'wall_pillar'],
    west: ['wall', 'door', 'wall_arched', 'wall', 'wall'],
    east: ['wall', 'door', 'wall_arched', 'wall', 'wall'],
    south: ['barrier_column', 'barrier', 'gap', 'barrier', 'barrier_column'],
    beyond: 'dark',
    floor: { base: 'floor_tile_large' },
    rugs: [{ x: 0, z: -6.0, w: 2.2, d: 1.4, color: 0x5a1612, border: 0xe0b860 }],
    props: [
      ['m:statue_blind_porter', -5.8, -6.0, 0.5, 1.1],
      ['m:statue_blind_porter', 5.8, -6.0, -0.5, 1.1],
      ['pillar_decorated', -6.3, 5.4, 0, 0.85],
      ['pillar_decorated', 6.3, 5.4, 0, 0.85],
      ['coin_stack_large', -3.4, -6.4, 0.4, 1],
      ['coin_stack_medium', 3.6, -6.5, -0.3, 1],
      ['coin_stack_small', -6.4, -1.0, 0, 1],
      ['coin_stack_small', 6.5, 1.8, 0, 1],
      ['chest_gold', 6.3, -3.4, -H, 0.75],
      ['~sword_shield_gold', -7.1, -0.2, H, 1, 2.0],
      ['m:pillar_candle_stand', -1.9, -6.6, 0, 1.1],
      ['m:pillar_candle_stand', 1.9, -6.6, 0, 1.1],
      ['candle_lit', -6.5, 3.2, 0, 1],
      ['candle_triple', 6.5, -0.6, 0, 1],
      ['~banner_shield_red', -3, -7.5, 0, 1, 0.9],
      ['~banner_shield_red', 3, -7.5, 0, 1, 0.9],
    ],
    torches: [['west', 2], ['east', 2]],
    lights: [
      { x: 0, y: 1.6, z: -6.0, color: 0xffc070, intensity: 1.0, dist: 8 },
      { x: -3.4, y: 0.8, z: -6.0, color: 0xffcc60, intensity: 0.5, dist: 4 },
      { x: 3.6, y: 0.8, z: -6.0, color: 0xffcc60, intensity: 0.5, dist: 4 },
    ],
    dust: 1.6,
    look: { torch: 0xffb050, key: 0xffd8a0, keyIntensity: 0.6, hemi: 0.45, fog: 0x0f0b06, fogDensity: 0.03, grade: { lift: 0x0c0804, gain: 0xfff0cc, sat: 1.12 } },
  },

  // secret — the crypt of the three vigils: sarcophagi in rows, cold blue air, three candles around a watcher
  cripta: {
    medallion: { emblem: 'skull' },
    dungeon: 'd1',
    theme: 'monastery',
    north: W7('wall_cracked', 'wall_arched', 'wall', 'door', 'wall', 'wall_arched', 'wall_cracked'),
    west: ['wall_arched', 'wall', 'door', 'wall_arched', 'wall', 'wall'],
    east: ['wall_arched', 'wall_cracked', 'door', 'wall_arched', 'wall', 'wall'],
    south: LOW_FRONT,
    beyond: 'dark',
    floor: { mix: [['floor_tile_large_rocks', 0.3]] },
    props: [
      ['m:sarcophagus', -8.2, -6.6, H, 1],
      ['m:sarcophagus', -8.2, -2.4, H, 1],
      ['m:sarcophagus', 8.2, -6.6, -H, 1],
      ['m:sarcophagus', 8.2, -2.4, -H, 1],
      ['m:sarcophagus', -8.2, 2.6, H, 1],
      ['m:sarcophagus', -3.6, -7.4, 0, 0.9],
      ['m:sarcophagus', 3.6, -7.4, 0, 0.9],
      ['m:vault_rib_segment', 0, -7.9, 0, 0.85],
      ['m:pillar_candle_stand', -1.9, -5.8, 0, 1.1],
      ['m:pillar_candle_stand', 1.9, -5.8, 0, 1.1],
      ['m:pillar_candle_stand', 0, -5.4, 0, 1.1],
      ['pillar', -6.4, 5.8, 0, 0.9],
      ['pillar', 6.4, 5.8, 0, 0.9],
      ['m:bone_pile', 7.6, 2.6, 0.8, 1],
      ['m:bone_pile', -5.8, -8.2, 2.2, 1],
      ['rubble_half', 10.1, 6.6, PI, 0.6],
      ['candle_melted', -8.0, 4.6, 0, 1.1],
      ['candle_melted', 8.1, 4.4, 0, 1.1],
      ['m:sarcophagus', 8.2, 2.6, -H, 1],
      ['m:bone_pile', -4.8, 6.8, 1.1, 1],
      ['rubble_half', -10.1, -4.2, 0, 0.5],
    ],
    torches: [['west', -6], ['east', -6]],
    lights: [
      { x: 0, y: 2.2, z: -5.0, color: 0x8ab8ff, intensity: 0.7, dist: 8 },
      { x: -3.6, y: 2.4, z: -6.4, color: 0x9fd0ff, intensity: 0.14, dist: 4 },
      { x: 3.6, y: 2.4, z: -6.4, color: 0x9fd0ff, intensity: 0.14, dist: 4 },
    ],
    mist: 1,
    dust: 0.8,
    look: { torch: 0x8fc0ff, fog: 0x080c12, fogDensity: 0.028, sky: 0x6080b0, ground: 0x182030, key: 0xb8cfff, keyIntensity: 0.7, stage: 0xd8e4ff, grade: { lift: 0x050a16, gain: 0xe8f0ff, sat: 0.95 } },
  },

  // L09 — the hall of the broken vigil: a knight's hall of banners, pillars and burning braziers
  salao: {
    medallion: { emblem: 'sword' },
    dungeon: 'd1',
    theme: 'monastery',
    north: W7('wall_window_closed', 'wall_pillar', 'wall_arched', 'door', 'wall_arched', 'wall_pillar', 'wall_window_closed'),
    west: ['wall', 'wall_pillar', 'door', 'wall', 'wall_pillar', 'wall'],
    east: ['wall', 'wall_pillar', 'door', 'wall', 'wall_pillar', 'wall'],
    south: LOW_FRONT,
    floor: { mix: [['floor_tile_large_rocks', 0.08]] },
    rugs: [{ x: 0, z: -6.8, w: 2.0, d: 3.4, color: 0x2a2a52, border: 0xc8a050 }],
    props: [
      ['pillar_decorated', -6.6, -6.4, 0, 1],
      ['pillar_decorated', 6.6, -6.4, 0, 1],
      ['pillar_decorated', -6.6, 0, 0, 1],
      ['pillar_decorated', 6.6, 0, 0, 1],
      ['pillar_decorated', -6.6, 6.2, 0, 1],
      ['pillar_decorated', 6.6, 6.2, 0, 1],
      ['m:brazier', -2.6, -7.4, 0, 1.15],
      ['m:brazier', 2.6, -7.4, 0, 1.15],
      ['~sword_shield', -10.1, -3.2, H, 1, 2.1],
      ['~sword_shield', 10.1, -3.2, -H, 1, 2.1],
      ['~sword_shield_broken', -10.1, 3.6, H, 1, 2.1],
      ['table_long_broken', 8.8, 3.4, 0.2, 0.9],
      ['table_long', -8.8, 3.2, 0, 0.9],
      ['chair', -8.8, 1.4, 0, 0.9],
      ['barrel_large_decorated', 9.0, -7.4, 0, 0.8],
      ['barrel_small_stack', -9.0, -7.2, 0.6, 0.8],
      ['chair', 8.8, 1.6, PI, 0.9],
      ['keg', 9.0, 7.4, -H, 0.8],
      ['box_stacked', -9.1, 7.3, 0.3, 0.6],
      ['~banner_shield_red', -3, -9, 0, 1, 1.05],
      ['~banner_shield_red', 3, -9, 0, 1, 1.05],
      ['~banner_triple_red', -10.5, 0, H, 0.9, 1.0],
      ['~banner_triple_red', 10.5, 0, -H, 0.9, 1.0],
    ],
    fires: [
      { x: -2.6, y: 1.05, z: -7.4, s: 1.3 },
      { x: 2.6, y: 1.05, z: -7.4, s: 1.3 },
    ],
    torches: [['west', -4.5], ['east', -4.5], ['west', 4.5], ['east', 4.5]],
    lights: [
      { x: -2.6, y: 1.8, z: -7.0, color: 0xff8a3a, intensity: 0.9, dist: 7 },
      { x: 2.6, y: 1.8, z: -7.0, color: 0xff8a3a, intensity: 0.9, dist: 7 },
    ],
    embers: 1,
    dust: 0.8,
    sky: true,
    look: { key: 0xe8ecff, keyIntensity: 0.95 },
  },

  // L10 — the broken belfry: the great cracked bell in its timber frame, scaffolds, open arches to the night
  campanario: {
    dungeon: 'd1',
    theme: 'monastery',
    north: W7('wall_archedwindow_open', 'wall_scaffold', 'wall_archedwindow_open', 'open', 'wall_archedwindow_open', 'wall_scaffold', 'wall_archedwindow_open'),
    west: ['wall_archedwindow_open', 'wall_scaffold', 'door', 'wall_archedwindow_open', 'wall_broken', 'wall'],
    east: ['wall_archedwindow_open', 'wall_scaffold', 'door', 'wall_archedwindow_open', 'wall', 'wall_cracked'],
    south: W7('barrier_column', 'barrier', 'barrier', 'gap', 'barrier', 'barrier_half', 'barrier_column'),
    floor: { base: 'floor_wood_large_dark', mix: [['floor_wood_large', 0.35]], patches: [{ piece: 'floor_tile_large', x0: -10.5, z0: 3, x1: 10.5, z1: 9, mix: [['floor_tile_large_rocks', 0.3]] }] },
    props: [
      ['m:counterweight', -7.8, -5.2, 0.4, 1.2],
      ['m:counterweight', 7.8, -5.2, -0.4, 1.2],
      ['~m:chain_hanging', -7.8, -5.2, 0, 1.3, 2.6],
      ['~m:chain_hanging', 7.8, -5.2, 0, 1.3, 2.6],
      ['m:crank_wheel', -8.6, 1.2, H, 1.2],
      ['stairs_wood', 8.4, 6.6, PI, 0.65],
      ['box_stacked', -8.8, 6.6, 0.4, 0.6],
      ['rubble_half', 10.1, -0.8, PI, 0.6],
      ['m:bell_small', -4.6, -7.9, 0.3, 1.6],
      ['m:bell_small', 4.8, -8.0, -0.6, 1.4],
      ['crates_stacked', -9.0, -1.8, H, 0.7],
      ['barrel_small', 9.2, 2.6, 0, 0.8],
      ['m:chain_hanging', -6.6, 3.6, 0, 1.3, 2.4],
    ],
    torches: [['west', -4.5], ['east', -4.5]],
    lights: [{ x: 0, y: 2.4, z: -6.2, color: 0xffa050, intensity: 0.7, dist: 8 }],
    ash: 1.4,
    dust: 0.6,
    embers: 0.4,
    sky: true,
    bell: true,
    look: { key: 0xb4c8f4, keyIntensity: 1.1, fog: 0x0a0c14, fogDensity: 0.016, grade: { lift: 0x060a1c, gain: 0xeef0ff, sat: 1.0 } },
  },
};

/** Compatibility view (older code read LOOKS[sceneId].fog/fogDensity). */
export const LOOKS: Record<string, { fog: number; fogDensity: number }> = Object.fromEntries(
  Object.entries(ROOMS).map(([id, r]) => [id, { fog: r.look?.fog ?? THEMES[r.theme].palette.fog, fogDensity: r.look?.fogDensity ?? THEMES[r.theme].palette.fogDensity }]),
);

export function roomPalette(sceneId: string): Palette {
  const r = ROOMS[sceneId] ?? ROOMS.galeria;
  const base = THEMES[r.theme]?.palette ?? MONASTERY;
  return { ...base, ...(r.look ?? {}), grade: { ...base.grade, ...(r.look?.grade ?? {}) } } as Palette;
}

// ====================================================================================== builder
/** Board area that must stay clear for readability. */
const CLEAR = { x: 5.6, z: 5.0 };
const POINT_LIGHTS: Record<SceneQuality, number> = { low: 2, medium: 5, high: 7 };

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const isLit = (id: string) => id === 'torch_lit' || id === 'candle_lit' || id === 'candle_thin_lit';

export async function buildScene(sceneId: string, quality: SceneQuality): Promise<BuiltScene> {
  const room = ROOMS[sceneId] ?? ROOMS.galeria;
  const theme = THEMES[room.theme] ?? THEMES.monastery;
  const look = roomPalette(sceneId);
  const S = theme.kitScale;
  const M = 4 * S; // wall module width
  const WH = theme.wallH;
  const D = { x: room.dims?.x ?? 10.5, n: room.dims?.n ?? 9, s: room.dims?.s ?? 9 };
  const rand = rng(room.seed ?? hashStr(sceneId));
  const lambert = quality === 'low';
  const matKey = `${theme.id}`;
  const mat = kitMaterial(matKey, { tints: theme.tints, lambert });
  const swayMat = kitMaterial(matKey, { tints: theme.tints, sway: true, lambert });
  const flameMat = kitMaterial(`${matKey}:flame`, { flame: true });

  const group = new THREE.Group();
  group.name = `scene:${sceneId}`;
  const lights: THREE.Light[] = [];
  const flicker: BuiltScene['flicker'] = [];
  const embers: THREE.Vector3[] = [];
  const dustSources: THREE.Vector3[] = [];
  const colliders: WalkData['colliders'] = [];
  const doors: BuiltScene['doors'] = {};
  const named: Record<string, THREE.Object3D> = {};
  const exits: WalkData['exits'] = {};
  const flames: { pos: THREE.Vector3; size: number }[] = [];
  const lightWants: { pos: THREE.Vector3; color: number; intensity: number; dist: number; prio: number }[] = [];
  const updaters: ((dt: number, t: number) => void)[] = [];
  const poolSpots: { wall: THREE.Vector3; rot: number; floor: THREE.Vector3 }[] = [];

  // static kit meshes are collected here and merged per material at the end (a whole room in a few draw calls)
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  const addToBucket = (key: string, m: THREE.Material, cast: boolean, g: THREE.BufferGeometry) => {
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: m, cast, geos: [] }));
    b.geos.push(g);
  };
  const tmpM = new THREE.Matrix4();

  /** Place a KayKit piece; static meshes go to merge buckets, dynamic parts (doors, lids) stay as objects. */
  async function placeKit(id: string, pos: THREE.Vector3, rotY: number, scale: THREE.Vector3, opts: { floor?: boolean; sway?: boolean; dynamic?: (part: string) => boolean } = {}) {
    let root: THREE.Group;
    try {
      root = await kit(id);
    } catch {
      return null;
    }
    root.position.copy(pos);
    root.rotation.y = rotY;
    root.scale.copy(scale);
    root.updateMatrixWorld(true);
    const keep: THREE.Object3D[] = [];
    let swayTop = 0;
    let swayBottom = 0;
    if (opts.sway) {
      const bb = new THREE.Box3().setFromObject(root);
      swayTop = bb.max.y;
      swayBottom = bb.min.y;
    }
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const part = mesh.userData.part as string;
      if (opts.dynamic?.(part)) {
        keep.push(mesh);
        return;
      }
      const g = mesh.geometry.clone();
      g.applyMatrix4(tmpM.copy(mesh.matrixWorld));
      if (part === 'flame') {
        // flicker pivots around the flame base
        g.computeBoundingBox();
        const bb = g.boundingBox!;
        const base = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2);
        const ph = rand() * 10;
        const arr = new Float32Array(g.getAttribute('position').count * 4);
        for (let i = 0; i < arr.length; i += 4) arr.set([base.x, base.y, base.z, ph], i);
        g.setAttribute('aFlame', new THREE.BufferAttribute(arr, 4));
        addToBucket('flame', flameMat, false, g);
        flames.push({ pos: base.clone().add(new THREE.Vector3(0, (bb.max.y - bb.min.y) * 0.45, 0)), size: Math.max(0.25, (bb.max.y - bb.min.y) * 2.2) });
        return;
      }
      if (opts.sway) {
        const p = g.getAttribute('position');
        const arr = new Float32Array(p.count);
        for (let i = 0; i < p.count; i++) arr[i] = THREE.MathUtils.clamp((swayTop - p.getY(i)) / Math.max(0.01, swayTop - swayBottom), 0, 1);
        g.setAttribute('aSway', new THREE.BufferAttribute(arr, 1));
        addToBucket('sway', swayMat, true, g);
        return;
      }
      addToBucket(opts.floor ? 'floor' : 'static', mat, !opts.floor, g);
    });
    // dynamic parts: re-parent under the room with their world transform
    for (const o of keep) {
      const holder = (o.parent && o.parent !== root ? o.parent : o) as THREE.Object3D;
      const wm = holder.matrixWorld.clone();
      holder.removeFromParent();
      wm.decompose(holder.position, holder.quaternion, holder.scale);
      holder.traverse((x) => {
        const mm = x as THREE.Mesh;
        if (mm.isMesh) {
          mm.material = mat;
          mm.castShadow = true;
          mm.receiveShadow = true;
        }
      });
      group.add(holder);
    }
    return { root, keep };
  }

  const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const wallScale = v3(S, S * WH, S);
  const uni = (s: number) => v3(S * s, S * s, S * s);

  // -------------------------------------------------------------- floor
  const jobs: Promise<unknown>[] = [];
  const fl = room.floor ?? {};
  const baseFloor = fl.base ?? theme.floor;
  const tileAt = (x: number, z: number): { piece: string; mix?: [string, number][] } => {
    for (const p of fl.patches ?? []) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return { piece: p.piece, mix: p.mix };
    return { piece: baseFloor, mix: fl.mix };
  };
  const nx = Math.round((2 * D.x) / M);
  const zStart = -D.n;
  const zEnd = D.s + M * 2; // one porch row beyond the low south wall (the explore camera sees it)
  for (let ix = 0; ix < nx; ix++)
    for (let z = zStart + M / 2; z < zEnd; z += M) {
      const x = -D.x + M / 2 + ix * M;
      const t = tileAt(x, z);
      let piece = t.piece;
      // keep the board surroundings and the central aisle to the north door clean (no rock heaps)
      const underBoard = (Math.abs(x) < CLEAR.x + 2 && Math.abs(z) < CLEAR.z + 1.5) || Math.abs(x) < 4.5;
      if (!underBoard) for (const [alt, p] of t.mix ?? []) if (rand() < p) piece = alt;
      const rot = (Math.floor(rand() * 4) * PI) / 2;
      jobs.push(placeKit(piece, v3(x, 0, z), piece.startsWith('floor_wood') ? 0 : rot, uni(1), { floor: true }));
    }

  // -------------------------------------------------------------- walls
  const sides: Side[] = ['north', 'east', 'west', 'south'];
  const sideFrame = (side: Side, i: number, n: number) => {
    if (side === 'north') return { x: -D.x + M / 2 + i * M, z: -D.n, rot: 0, inward: v3(0, 0, 1) };
    if (side === 'south') return { x: -D.x + M / 2 + i * M, z: D.s, rot: PI, inward: v3(0, 0, -1) };
    const z = -D.n + M / 2 + i * M;
    if (side === 'west') return { x: -D.x, z, rot: H, inward: v3(1, 0, 0) };
    void n;
    return { x: D.x, z, rot: -H, inward: v3(-1, 0, 0) };
  };
  for (const side of sides) {
    const mods = room[side];
    const n = mods.length;
    let exitIdx = mods.findIndex((m) => m === 'door' || m === 'open' || m === 'gap' || m === 'm:doorway_gothic');
    if (exitIdx < 0) exitIdx = Math.floor(n / 2);
    mods.forEach((m, i) => {
      const f = sideFrame(side, i, n);
      if (m === 'gap' || m === '') return;
      if (m.startsWith('m:')) {
        // a monastery hero module (gothic portal, lancet window) scaled to the module width
        jobs.push(
          model(m.slice(2), 'kit').then((o) => {
            o.position.set(f.x, 0, f.z);
            o.rotation.y = f.rot;
            o.scale.setScalar(M / 4);
            group.add(o);
            named[m.slice(2)] = o;
          }).catch(() => undefined),
        );
        return;
      }
      if (side === 'south') {
        // low front wall (the camera looks over it)
        jobs.push(placeKit(m, v3(f.x, 0, f.z), f.rot, uni(1)));
        return;
      }
      if (m === 'door') {
        jobs.push(
          placeKit('wall_doorway', v3(f.x, 0, f.z), f.rot, wallScale, { dynamic: (p) => p.endsWith('_door') }).then((r) => {
            const leaf = r?.keep[0]?.parent ?? r?.keep[0];
            if (leaf) {
              leaf.name = `door:${side}`;
              doors[side] = leaf;
            }
          }),
        );
        return;
      }
      if (m === 'open') {
        jobs.push(placeKit('wall_open_scaffold', v3(f.x, 0, f.z), f.rot, wallScale));
        return;
      }
      jobs.push(placeKit(m, v3(f.x, 0, f.z), f.rot, wallScale));
    });
    // exit threshold just inside the opening
    const f = sideFrame(side, exitIdx, n);
    const inset = side === 'south' ? 1.0 : 1.1;
    exits[side] = { x: +(f.x + f.inward.x * inset).toFixed(2), z: +(f.z + f.inward.z * inset).toFixed(2) };
  }
  // corner pillars
  for (const [x, z] of [[-D.x, -D.n], [D.x, -D.n]] as const) jobs.push(placeKit('pillar', v3(x, 0, z), 0, v3(S, S * WH, S)));
  for (const [x, z] of [[-D.x, D.s], [D.x, D.s]] as const) jobs.push(placeKit('column', v3(x, 0, z), 0, uni(1.15)));

  // -------------------------------------------------------------- wall torches
  const torchSpots = room.torches ?? [];
  for (const [side, off] of torchSpots) {
    const base = side === 'north' ? v3(off, 0, -D.n) : side === 'south' ? v3(off, 0, D.s) : v3(side === 'west' ? -D.x : D.x, 0, off);
    const f = sideFrame(side, 0, 1);
    const at = base.clone().addScaledVector(f.inward, 0.5 * S);
    at.y = 2.15 * WH;
    jobs.push(placeKit('torch_mounted', at, f.rot, uni(1)));
    // the flame of a lit torch, set into the mounted cup
    const flameAt = at.clone().addScaledVector(f.inward, 0.36 * S).add(v3(0, 0.07 * S, 0));
    jobs.push(
      kit('torch_lit').then((tl) => {
        tl.position.copy(flameAt).add(v3(0, -0.4 * S, 0));
        tl.scale.copy(uni(1));
        tl.updateMatrixWorld(true);
        tl.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh || mesh.userData.part !== 'flame') return;
          const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
          g.computeBoundingBox();
          const bb = g.boundingBox!;
          const b = v3((bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2);
          const arr = new Float32Array(g.getAttribute('position').count * 4);
          const ph = rand() * 10;
          for (let i = 0; i < arr.length; i += 4) arr.set([b.x, b.y, b.z, ph], i);
          g.setAttribute('aFlame', new THREE.BufferAttribute(arr, 4));
          addToBucket('flame', flameMat, false, g);
          flames.push({ pos: b.clone().add(v3(0, 0.15, 0)), size: 0.9 });
        });
      }),
    );
    const lp = flameAt.clone().addScaledVector(f.inward, 0.35).add(v3(0, 0.25, 0));
    lightWants.push({ pos: lp, color: look.torch, intensity: 26 * look.torchIntensity, dist: 11, prio: 2 });
    embers.push(flameAt.clone().add(v3(0, 0.25, 0)));
    poolSpots.push({ wall: base.clone().addScaledVector(f.inward, 0.5 * S + 0.03).setY(flameAt.y), rot: f.rot, floor: base.clone().addScaledVector(f.inward, 1.0) });
  }

  // -------------------------------------------------------------- props
  for (const [raw, x, z, rotY = 0, sc = 1, y = 0] of room.props) {
    const noCollide = raw.startsWith('~');
    const id = noCollide ? raw.slice(1) : raw;
    const hero = id.startsWith('m:');
    const pid = hero ? id.slice(2) : id;
    if (room.combat !== false && Math.abs(x) < CLEAR.x && Math.abs(z) < CLEAR.z && y < 1.5) {
      console.warn(`scene ${sceneId}: prop ${pid} at (${x}, ${z}) is inside the board area — skipped`);
      continue;
    }
    const pos = v3(x, y, z);
    if (hero) {
      jobs.push(
        model(pid, 'kit').then((m) => {
          m.position.copy(pos);
          m.rotation.y = rotY;
          m.scale.setScalar(sc);
          m.userData.propId = pid;
          group.add(m);
          named[pid] ??= m;
          m.updateMatrixWorld(true);
          if (!noCollide) addCollider(m);
          if (pid === 'brazier') {
            const top = new THREE.Box3().setFromObject(m).max.y;
            embers.push(v3(x, top, z));
          }
          if (pid === 'pillar_candle_stand' || pid === 'candelabra') {
            const bb = new THREE.Box3().setFromObject(m);
            flames.push({ pos: v3(x, bb.max.y + 0.05, z), size: 0.5 });
          }
          if (pid === 'censer') updaters.push((_dt, t) => (m.rotation.z = Math.sin(t * 1.3) * 0.12));
          if (pid === 'chain_hanging') {
            const ph = rand() * 6;
            updaters.push((_dt, t) => (m.rotation.z = Math.sin(t * 0.7 + ph) * 0.03));
          }
        }).catch(() => undefined),
      );
      continue;
    }
    const banner = pid.startsWith('banner');
    // banners and wall-hung pieces sit on the wall face; offsets are in the wall's local frame
    jobs.push(
      placeKit(pid, pos, rotY, uni(sc), { sway: banner }).then((r) => {
        if (!r) return;
        if (!noCollide) addCollider(r.root);
        if (isLit(pid)) {
          /* flames are collected while merging */
        }
      }),
    );
  }

  function addCollider(o: THREE.Object3D) {
    const bb = new THREE.Box3().setFromObject(o);
    if (bb.isEmpty()) return;
    const h = bb.max.y - bb.min.y;
    if (h < 0.25 || bb.min.y > 1.6) return;
    const ex = bb.max.x - bb.min.x;
    const ez = bb.max.z - bb.min.z;
    const cx = (bb.min.x + bb.max.x) / 2;
    const cz = (bb.min.z + bb.max.z) / 2;
    const long = Math.max(ex, ez);
    const short = Math.max(0.3, Math.min(ex, ez));
    if (long / short > 1.6) {
      const k = Math.min(6, Math.round(long / short));
      for (let i = 0; i < k; i++) {
        const f = (i + 0.5) / k - 0.5;
        colliders.push({ x: +(cx + (ex > ez ? f * long : 0)).toFixed(2), z: +(cz + (ez >= ex ? f * long : 0)).toFixed(2), r: +(short / 2 + 0.08).toFixed(2) });
      }
    } else colliders.push({ x: +cx.toFixed(2), z: +cz.toFixed(2), r: +((long / 2) * 0.85 + 0.05).toFixed(2) });
  }

  // great bell (campanário)
  let bell: THREE.Object3D | undefined;
  if (room.bell) {
    // the great cracked bell hangs from its timber frame: crown anchor on the frame's mount anchor
    jobs.push(
      Promise.all([model('bell_frame', 'kit'), model('bell_great_cracked', 'kit')])
        .then(([frame, b]) => {
          frame.position.set(0, 0, -7.4);
          frame.scale.setScalar(1.05);
          group.add(frame);
          frame.updateMatrixWorld(true);
          colliders.push({ x: -1.9, z: -7.4, r: 0.6 }, { x: 1.9, z: -7.4, r: 0.6 });
          const mount = findAnchors(frame, 'bell_mount_anchor')[0];
          const mp = mount ? new THREE.Vector3().setFromMatrixPosition(mount.matrixWorld) : v3(0, 4.3, -7.4);
          const pivot = new THREE.Group();
          pivot.position.copy(mp);
          b.scale.setScalar(1.25);
          b.updateMatrixWorld(true);
          const crown = findAnchors(b, 'bell_crown_anchor')[0];
          const cy = crown ? new THREE.Vector3().setFromMatrixPosition(crown.matrixWorld).y : 2.2 * 1.25;
          b.position.set(0, -cy, 0);
          pivot.add(b);
          group.add(pivot);
          bell = pivot;
          named.bell = pivot;
          named.bell_frame = frame;
          lightWants.push({ pos: v3(0, mp.y - 1.0, -4.4), color: 0xffa050, intensity: 2.2, dist: 7, prio: 1 });
        })
        .catch(() => undefined),
    );
  }

  await Promise.all(jobs);

  // torch light pools (cheap: every torch warms its wall and the floor below, real lights or not)
  if (poolSpots.length) {
    const glowTex = sprite('textures/glow_radial.png');
    const wallMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(look.torch).multiplyScalar(0.55), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const floorMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(look.torch).multiplyScalar(0.16), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const wallGeos: THREE.BufferGeometry[] = [];
    const floorGeos: THREE.BufferGeometry[] = [];
    const tm = new THREE.Matrix4();
    for (const sp of poolSpots) {
      wallGeos.push(new THREE.PlaneGeometry(3.4, 3.4).applyMatrix4(tm.makeRotationY(sp.rot).setPosition(sp.wall)));
      floorGeos.push(new THREE.PlaneGeometry(3.4, 3.4).rotateX(-PI / 2).translate(sp.floor.x, 0.06, sp.floor.z));
    }
    for (const [geos, m] of [[wallGeos, wallMat], [floorGeos, floorMat]] as const) {
      const merged = mergeGeometries(geos as THREE.BufferGeometry[], false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.name = 'room:pools';
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    updaters.push((_dt, t) => {
      wallMat.opacity = 0.9 + Math.sin(t * 9.3) * 0.05 + Math.sin(t * 21.7) * 0.04;
      floorMat.opacity = wallMat.opacity;
    });
  }

  // inlaid floor medallion
  if (room.medallion !== false) {
    const md = room.medallion ?? {};
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(9.6, 9.6),
      new THREE.MeshStandardMaterial({ map: medallionTexture(md.emblem ?? 'bell', md.ink ?? 0x2a221c), transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    m.rotation.x = -PI / 2;
    m.position.set(0, 0.044, 0);
    m.receiveShadow = true;
    m.renderOrder = 1;
    m.name = 'room:medallion';
    group.add(m);
  }

  // carpets
  for (const rg of room.rugs ?? []) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(rg.w, rg.d), new THREE.MeshStandardMaterial({ map: rugTexture(rg.color, rg.border, rg.w / rg.d), roughness: 1, metalness: 0 }));
    m.rotation.x = -PI / 2;
    m.rotation.z = rg.rot ?? 0;
    m.position.set(rg.x, 0.05, rg.z);
    m.receiveShadow = true;
    m.name = 'room:rug';
    group.add(m);
  }
  // carved marks
  for (const dc of room.decals ?? []) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(dc.w, dc.h), new THREE.MeshBasicMaterial({ map: sevenLinesTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffc070, fog: false }));
    m.position.set(dc.x, dc.y, dc.z);
    m.rotation.y = dc.rot ?? 0;
    m.name = 'room:decal';
    m.renderOrder = 3;
    group.add(m);
    const ph = rand() * 6;
    updaters.push((_dt, t) => ((m.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 1.3 + ph) * 0.15));
    dustSources.push(v3(dc.x, dc.y - 0.6, dc.z + 1));
  }

  // candle flames found among the props
  for (const f of flames) if (f.size < 0.6) dustSources.push(f.pos.clone());

  // -------------------------------------------------------------- merge the static monastery props per material
  {
    const keepIds = new Set(['statue_blind_porter', 'altar', 'well_dry', 'reliquary_chest', 'bell_great_cracked', 'censer', 'chain_hanging', 'doorway_gothic', 'wall_window_lancet']);
    const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
    const drop: THREE.Object3D[] = [];
    group.updateMatrixWorld(true);
    for (const child of group.children) {
      const pid = child.userData.propId as string | undefined;
      if (!pid || keepIds.has(pid)) continue;
      let ok = true;
      child.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && (Array.isArray(m.material) || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh)) ok = false;
      });
      if (!ok) continue;
      child.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
        if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
        const mat = m.material as THREE.Material;
        const key = byMat.get(mat) ?? { geos: [], cast: m.castShadow };
        key.geos.push(g.index ? g : g);
        byMat.set(mat, key);
      });
      drop.push(child);
    }
    for (const [mat, b] of byMat) {
      // indexed and non-indexed geometries cannot be merged together
      const idx = b.geos.filter((g) => g.index);
      const non = b.geos.filter((g) => !g.index);
      for (const list of [idx, non]) {
        if (!list.length) continue;
        const sameAttrs = list.filter((g) => !!g.getAttribute('color') === !!list[0].getAttribute('color'));
        const merged = mergeGeometries(sameAttrs, false);
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, mat);
        mesh.name = 'room:props';
        mesh.castShadow = b.cast && quality !== 'low';
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      }
    }
    for (const d of drop) {
      group.remove(d);
      for (const k of Object.keys(named)) if (named[k] === d) delete named[k];
    }
  }

  // -------------------------------------------------------------- merge static geometry per material
  for (const [key, b] of buckets) {
    if (!b.geos.length) continue;
    const geos = b.geos.map((g) => {
      // keep only the attributes every piece has (merge requires identical sets)
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'aSway', 'aFlame'].includes(name)) g.deleteAttribute(name);
      return g.index ? g : g;
    });
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.name = `room:${key}`;
    mesh.castShadow = b.cast && quality !== 'low';
    mesh.receiveShadow = key !== 'flame';
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    for (const g of geos) g.dispose();
  }

  // -------------------------------------------------------------- flame glows (one instanced draw call for all)
  if (flames.length) {
    const n = flames.length;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('uv', quad.getAttribute('uv'));
    const centers = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const phases = new Float32Array(n);
    flames.forEach((f, i) => {
      centers.set([f.pos.x, f.pos.y, f.pos.z], i * 3);
      sizes[i] = f.size;
      phases[i] = rand() * 10;
    });
    g.setAttribute('aCenter', new THREE.InstancedBufferAttribute(centers, 3));
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizes, 1));
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    g.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: sprite('textures/glow_radial.png') }, uTime: kitTime, uColor: { value: new THREE.Color(look.torch).multiplyScalar(1.5) } },
      vertexShader: /* glsl */ `
        attribute vec3 aCenter; attribute float aSize; attribute float aPhase; uniform float uTime; varying vec2 vUv; varying float vA;
        void main(){ vUv = uv;
          float f = 0.85 + 0.1 * sin(uTime * 11.0 + aPhase) + 0.05 * sin(uTime * 27.0 + aPhase * 3.0);
          vA = f;
          vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
          mv.xy += position.xy * aSize * f;
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; uniform vec3 uColor; varying vec2 vUv; varying float vA;
        void main(){ vec4 t = texture2D(uTex, vUv); gl_FragColor = vec4(uColor * t.rgb * vA, t.a * 0.5 * vA); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glows = new THREE.Mesh(g, m);
    glows.name = 'room:glows';
    glows.frustumCulled = false;
    glows.renderOrder = 4;
    group.add(glows);
  }

  // -------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(look.sky, look.ground, look.hemi);
  group.add(hemi);
  lights.push(hemi);
  const key = new THREE.DirectionalLight(look.key, look.keyIntensity);
  key.position.set(...look.keyPos);
  key.target.position.set(0, 0, -0.5);
  key.castShadow = quality !== 'low';
  const sm = quality === 'high' ? 2048 : 1024;
  key.shadow.mapSize.set(sm, sm);
  const sc = key.shadow.camera;
  sc.left = -11;
  sc.right = 11;
  sc.top = 10;
  sc.bottom = -10;
  sc.near = 1;
  sc.far = 40;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 3;
  group.add(key, key.target);
  lights.push(key);
  key.name = 'key';
  // rim: a cool back light from behind the enemy rows towards the camera
  if (quality !== 'low') {
    const rim = new THREE.DirectionalLight(look.rim, look.rimIntensity);
    rim.position.set(2.5, 7, -12);
    rim.target.position.set(0, 0.8, 2);
    group.add(rim, rim.target);
    lights.push(rim);
    rim.name = 'rim';
  }
  // stage: a soft warm pool on the board so the fight reads first
  const stage = new THREE.SpotLight(look.stage, look.stageIntensity * 70, 34, 0.6, 0.85, 1.2);
  stage.position.set(0, 14, 4.5);
  stage.target.position.set(0, 0, -0.3);
  group.add(stage, stage.target);
  lights.push(stage);
  stage.name = 'stage';
  // point lights from a fixed-size pool (constant light count per quality: no shader recompiles between rooms)
  for (const l of room.lights ?? []) lightWants.push({ pos: v3(l.x, l.y, l.z), color: l.color ?? look.torch, intensity: 24 * (l.intensity ?? 1), dist: l.dist ?? 8, prio: 3 });
  lightWants.sort((a, b) => b.prio - a.prio);
  {
    // within a priority, interleave west/east/north so a small pool still lights the whole room
    const byPrio = new Map<number, typeof lightWants>();
    for (const w of lightWants) byPrio.set(w.prio, [...(byPrio.get(w.prio) ?? []), w]);
    const out: typeof lightWants = [];
    for (const [, list] of [...byPrio].sort((a, b) => b[0] - a[0])) {
      const zone = (w: (typeof lightWants)[number]) => (w.pos.x < -4 ? 0 : w.pos.x > 4 ? 1 : 2);
      const qs = [0, 1, 2].map((z) => list.filter((w) => zone(w) === z));
      while (qs.some((q) => q.length)) for (const q of [qs[2], qs[0], qs[1]]) if (q.length) out.push(q.shift()!);
    }
    lightWants.splice(0, lightWants.length, ...out);
  }
  const poolN = POINT_LIGHTS[quality];
  for (let i = 0; i < poolN; i++) {
    const w = lightWants[i];
    const l = new THREE.PointLight(w?.color ?? 0xffffff, w ? w.intensity : 0, w?.dist ?? 1, 2);
    if (w) l.position.copy(w.pos);
    else l.position.set(0, -50, 0);
    group.add(l);
    lights.push(l);
    if (w) flicker.push({ light: l, base: w.intensity, phase: rand() * 10 });
  }
  if (quality === 'low') {
    // no point lights to spare on low: let the hemisphere carry a little of the torch warmth
    hemi.groundColor.lerp(new THREE.Color(look.torch), 0.25);
  }

  // -------------------------------------------------------------- moonlight shafts
  if (room.shafts?.length && quality !== 'low') {
    const shaftTex = sprite('textures/light_shaft.png');
    for (const x of room.shafts) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 9),
        new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xb8ccff, side: THREE.DoubleSide, fog: false }),
      );
      m.position.set(x + 0.9, 3.4, -D.n + 2.2);
      m.rotation.set(-0.42, 0, 0.18);
      m.renderOrder = 2;
      group.add(m);
      dustSources.push(v3(x + 0.6, 1.5, -D.n + 3));
    }
  }

  // -------------------------------------------------------------- floor mist
  if (room.mist && quality !== 'low') {
    const smoke = sprite('textures/smoke_puff.png');
    const mistMat = new THREE.MeshBasicMaterial({ map: smoke, transparent: true, opacity: 0.16 * room.mist, depthWrite: false, color: 0x9ab8e0 });
    const puffs: THREE.Mesh[] = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), mistMat);
      m.rotation.x = -PI / 2;
      const a = rand() * PI * 2;
      const r = 6 + rand() * 4;
      m.position.set(Math.cos(a) * r, 0.25 + rand() * 0.3, Math.sin(a) * r * 0.8);
      m.userData.ph = rand() * 10;
      m.renderOrder = 1;
      group.add(m);
      puffs.push(m);
    }
    updaters.push((_dt, t) => {
      for (const m of puffs) {
        m.rotation.z = t * 0.03 + m.userData.ph;
        m.position.x += Math.sin(t * 0.1 + m.userData.ph) * 0.002;
      }
    });
  }

  // -------------------------------------------------------------- night beyond the windows
  {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const g2 = c.getContext('2d')!;
    const grd = g2.createLinearGradient(0, 0, 0, 128);
    if (room.beyond === 'dark') {
      grd.addColorStop(0, '#030304');
      grd.addColorStop(1, '#0a0908');
    } else {
      grd.addColorStop(0, '#05070f');
      grd.addColorStop(0.55, '#0c1428');
      grd.addColorStop(1, '#1a2640');
    }
    g2.fillStyle = grd;
    g2.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(2 * D.x + 30, 26), new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false }));
    card.position.set(0, 9, -D.n - 3.5);
    card.renderOrder = -2;
    group.add(card);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(2 * (D.n + D.s) + 20, 26), card.material);
      side.position.set(sx * (D.x + 3.5), 9, (D.s - D.n) / 2);
      side.rotation.y = -sx * H;
      side.renderOrder = -2;
      group.add(side);
    }
  }

  // -------------------------------------------------------------- night sky (open rooms)
  if (room.sky) {
    const n = quality === 'low' ? 250 : 600;
    const pos = new Float32Array(n * 3);
    const sz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (rand() - 0.5) * PI * 1.4;
      const e = 0.12 + rand() * 0.9;
      const r = 60;
      pos.set([Math.sin(a) * Math.cos(e) * r, Math.sin(e) * r * 0.8 + 6, -Math.cos(a) * Math.cos(e) * r - 10], i * 3);
      sz[i] = 0.6 + rand() * rand() * 2.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: kitTime },
      vertexShader: /* glsl */ `attribute float aSize; uniform float uTime; varying float vT;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vT = 0.65 + 0.35 * sin(uTime * (1.0 + aSize) + position.x);
          gl_PointSize = aSize * 1.6; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `varying float vT; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d));
          gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * vT, a * vT); }`,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const stars = new THREE.Points(g, m);
    stars.name = 'room:stars';
    stars.frustumCulled = false;
    stars.renderOrder = -1;
    group.add(stars);
    // the moon behind the north wall
    const moon = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: sprite('textures/glow_radial.png'), color: 0xbfd0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    moon.position.set(-14, 22, -45);
    moon.lookAt(0, 4, 8);
    group.add(moon);
  }

  // -------------------------------------------------------------- outer ground (no hard void edge)
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshBasicMaterial({ color: look.fog }));
  outer.rotation.x = -PI / 2;
  outer.position.y = -0.12;
  group.add(outer);

  // -------------------------------------------------------------- walk data
  const walk: WalkData = {
    bounds: { minX: -D.x + 0.85, maxX: D.x - 0.85, minZ: -D.n + 0.85, maxZ: D.s - 0.7 },
    colliders,
    exits,
  };

  return {
    id: sceneId,
    dungeon: room.dungeon,
    group,
    lights,
    flicker,
    emberSources: embers,
    dustSources,
    particles: { dust: room.dust ?? 0.5, ash: room.ash ?? 0.3, embers: room.embers ?? 0.4 },
    bell,
    look,
    walk,
    doors,
    named,
    setPixelScale(px: number) {
      void px; // glows are world-sized billboards; kept for API stability
    },
    update(dt, t) {
      for (const f of flicker) f.light.intensity = f.base * (0.86 + Math.sin(t * 9 + f.phase) * 0.06 + Math.sin(t * 23 + f.phase * 3) * 0.04 + Math.random() * 0.04);
      for (const u of updaters) u(dt, t);
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if ((m.isMesh || (o as THREE.Points).isPoints) && m.name.startsWith('room:')) m.geometry.dispose();
      });
    },
  };
}

// ====================================================================================== procedural textures
const texCache = new Map<string, THREE.Texture>();
function canvasTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/** Woven carpet: worn field, gold border, a row of diamonds down the middle. */
function rugTexture(color: number, border: number, aspect: number) {
  const W = 256;
  const Hh = Math.round(Math.max(64, Math.min(1024, W / Math.max(0.25, aspect))));
  return canvasTexture(`rug|${color}|${border}|${Hh}`, W, Hh, (g) => {
    g.fillStyle = css(color);
    g.fillRect(0, 0, W, Hh);
    // weave + wear
    let seed = color % 9973;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < Hh; y += 2) {
      g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.06})`;
      g.fillRect(0, y, W, 1);
    }
    for (let i = 0; i < 90; i++) {
      const x = rnd() * W;
      const y = rnd() * Hh;
      const r = 6 + rnd() * 30;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(0,0,0,${0.08 + rnd() * 0.12})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // border bands
    const b = W * 0.09;
    g.strokeStyle = css(border, 0.9);
    g.lineWidth = W * 0.035;
    g.strokeRect(b, b, W - 2 * b, Hh - 2 * b);
    g.strokeStyle = css(border, 0.55);
    g.lineWidth = W * 0.012;
    g.strokeRect(b * 1.7, b * 1.7, W - 3.4 * b, Hh - 3.4 * b);
    // fringe
    g.fillStyle = css(border, 0.5);
    for (let x = 4; x < W; x += 8) {
      g.fillRect(x, 0, 3, b * 0.45);
      g.fillRect(x, Hh - b * 0.45, 3, b * 0.45);
    }
    // diamonds
    g.fillStyle = css(border, 0.7);
    const n = Math.max(1, Math.round((Hh - 4 * b) / (W * 0.42)));
    for (let i = 0; i < n; i++) {
      const cy = 2 * b + ((i + 0.5) * (Hh - 4 * b)) / n;
      const r = W * 0.14;
      g.beginPath();
      g.moveTo(W / 2, cy - r);
      g.lineTo(W / 2 + r * 0.7, cy);
      g.lineTo(W / 2, cy + r);
      g.lineTo(W / 2 - r * 0.7, cy);
      g.closePath();
      g.fill();
      g.fillStyle = css(color);
      g.beginPath();
      g.arc(W / 2, cy, r * 0.22, 0, PI * 2);
      g.fill();
      g.fillStyle = css(border, 0.7);
    }
  });
}

/** The Scriptorium's seven carved lines converging into one vertical stroke (glowing faintly). */
function sevenLinesTexture() {
  return canvasTexture('sevenLines', 256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.lineCap = 'round';
    const draw = (w: number, a: number) => {
      g.strokeStyle = `rgba(255,220,160,${a})`;
      g.lineWidth = w;
      for (let i = 0; i < 7; i++) {
        const x0 = 28 + i * 33.3;
        g.beginPath();
        g.moveTo(x0, 30);
        g.quadraticCurveTo(x0 + (128 - x0) * 0.3, 120, 128, 168);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(128, 168);
      g.lineTo(128, 236);
      g.stroke();
    };
    draw(14, 0.12);
    draw(7, 0.3);
    draw(3, 0.95);
  });
}

/** The inlaid stone medallion: rings, a band of ticks, an eight-point star and the room's emblem. */
function medallionTexture(emblem: Emblem, ink: number) {
  return canvasTexture(`medal|${emblem}|${ink}`, 1024, 1024, (g) => {
    const c = 512;
    g.clearRect(0, 0, 1024, 1024);
    const pass = (dx: number, dy: number, color: string, scale: number) => {
      g.save();
      g.translate(dx, dy);
      g.strokeStyle = color;
      g.fillStyle = color;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const ring = (r: number, w: number) => {
        g.lineWidth = w * scale;
        g.beginPath();
        g.arc(c, c, r, 0, PI * 2);
        g.stroke();
      };
      ring(486, 12);
      ring(456, 4);
      ring(318, 9);
      ring(296, 3);
      // tick band
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * PI * 2;
        const r0 = i % 8 === 0 ? 330 : 400;
        g.lineWidth = (i % 8 === 0 ? 6 : 3) * scale;
        g.beginPath();
        g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
        g.lineTo(c + Math.cos(a) * 446, c + Math.sin(a) * 446);
        g.stroke();
      }
      // eight-point star
      g.lineWidth = 5 * scale;
      for (const rot of [0, PI / 4]) {
        g.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = rot + (i / 4) * PI * 2;
          const x = c + Math.cos(a) * 286;
          const y = c + Math.sin(a) * 286;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.stroke();
      }
      ring(170, 6);
      // emblem
      g.lineWidth = 9 * scale;
      g.beginPath();
      switch (emblem) {
        case 'book':
          g.moveTo(c - 110, c - 70);
          g.quadraticCurveTo(c - 55, c - 95, c, c - 65);
          g.quadraticCurveTo(c + 55, c - 95, c + 110, c - 70);
          g.lineTo(c + 110, c + 75);
          g.quadraticCurveTo(c + 55, c + 50, c, c + 80);
          g.quadraticCurveTo(c - 55, c + 50, c - 110, c + 75);
          g.closePath();
          g.moveTo(c, c - 65);
          g.lineTo(c, c + 80);
          break;
        case 'key':
          g.arc(c - 60, c, 42, 0, PI * 2);
          g.moveTo(c - 18, c);
          g.lineTo(c + 110, c);
          g.moveTo(c + 70, c);
          g.lineTo(c + 70, c + 36);
          g.moveTo(c + 100, c);
          g.lineTo(c + 100, c + 30);
          break;
        case 'cross':
          g.moveTo(c, c - 115);
          g.lineTo(c, c + 115);
          g.moveTo(c - 70, c - 40);
          g.lineTo(c + 70, c - 40);
          break;
        case 'skull':
          g.arc(c, c - 20, 72, PI * 0.85, PI * 2.15);
          g.lineTo(c + 40, c + 70);
          g.lineTo(c - 40, c + 70);
          g.closePath();
          g.moveTo(c - 22, c - 10);
          g.arc(c - 30, c - 10, 14, 0, PI * 2);
          g.moveTo(c + 44, c - 10);
          g.arc(c + 30, c - 10, 14, 0, PI * 2);
          break;
        case 'sword':
          g.moveTo(c, c - 120);
          g.lineTo(c, c + 70);
          g.moveTo(c - 55, c + 40);
          g.lineTo(c + 55, c + 40);
          g.moveTo(c, c + 70);
          g.lineTo(c, c + 110);
          break;
        case 'paw':
          g.arc(c, c + 30, 48, 0, PI * 2);
          for (const [dx, dy] of [[-62, -42], [-22, -78], [22, -78], [62, -42]]) {
            g.moveTo(c + dx + 20, c + dy);
            g.arc(c + dx, c + dy, 20, 0, PI * 2);
          }
          break;
        default: {
          // bell: crown, waist, flared lip, a crack down one side
          g.moveTo(c - 30, c - 95);
          g.quadraticCurveTo(c, c - 115, c + 30, c - 95);
          g.quadraticCurveTo(c + 55, c - 20, c + 95, c + 60);
          g.lineTo(c - 95, c + 60);
          g.quadraticCurveTo(c - 55, c - 20, c - 30, c - 95);
          g.moveTo(c - 20, c + 88);
          g.arc(c, c + 88, 20, PI, PI * 2, true);
          g.moveTo(c + 18, c - 60);
          g.lineTo(c + 5, c - 20);
          g.lineTo(c + 24, c + 10);
          g.lineTo(c + 10, c + 55);
        }
      }
      g.stroke();
      g.restore();
    };
    // a light lip under a dark groove reads as carved stone
    pass(3, 4, 'rgba(255,245,230,0.10)', 1.15);
    pass(0, 0, css(ink, 0.55), 1);
  });
}
