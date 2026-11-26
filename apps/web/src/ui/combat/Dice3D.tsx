/**
 * The roll screen: a centred panel of dark glass and gold filigree. Each die sits in its own gold socket — a cut
 * gem (D4 jade, D6 amber, D8 garnet, D10 sapphire, D12 amethyst) with crisp gold numerals and gold edges — and
 * spins in place, slows, then SNAPS onto the rolled face, facing the player, with a flash. Under each socket: the
 * number, big and gold, the outcome word and the die's scale (1–2 erra · 3–5 acerto · 6–8 +impulso · 9–11 2
 * acertos · 12 crítico). Above: what the roll needs ("Precisa de 3+"). Below: what it means.
 *
 * Beats (nominal seconds at battle speed 1; faster speeds compress the clock, never reorder it):
 *   0.00  the panel opens, the dice appear spinning (motion smear + sparkles)
 *   0.95  die 1 snaps (each next die +0.16 s): flash, number, word, the scale lights its zone
 *   +0.20 the verdict ("CRÍTICO!" bursts in gold; a miss cracks and greys out)
 *   +0.45 the board is told (window event `mosteiro:dice`, phase 'shown') so the blow can land. The board answers
 *         `mosteiro:dice-release` when the strike starts: the panel closes and the successes fly to the target
 *         as sparks (the board draws those, from the positions sent with 'shown').
 * One small WebGL canvas, shared by every roll, drawn only while the panel is open.
 * Test hooks: `window.__diceSlow` (play N× slower), `window.__diceClock` (virtual ms clock for frame captures).
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { readDie, type DomainEvent } from '@mosteiro/core';
import { getSettings } from '../../state/settings';
import { audio } from '../../audio/AudioDirector';
import './dice.css';

/** The roll event as the board hands it over (`seq` identifies the roll in the dice ⇄ board handshake). */
export type RollEvent = Extract<DomainEvent, { type: 'roll' }> & { seq?: number };

/** dice → board: { seq, phase: 'shown', sparks: {x,y,kind}[] (viewport px), defense } */
export const DICE_SIGNAL = 'mosteiro:dice';
/** board → dice: { instant?: boolean } — the strike begins (or fast-forward) */
export const DICE_RELEASE = 'mosteiro:dice-release';

type Kind = 's0' | 's1' | 'imp' | 'two' | 'crit';
interface TestHooks {
  /** dev/test only: 4 plays the roll 4× slower so it can be inspected */
  __diceSlow?: number;
  /** dev/test only: a virtual clock (ms) that replaces performance.now() for frame-exact captures */
  __diceClock?: number;
}
const W = (typeof window !== 'undefined' ? window : {}) as unknown as TestHooks;
const now = () => (typeof W.__diceClock === 'number' ? W.__diceClock : performance.now());
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x: number) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);

function kindOf(v: number): Kind {
  const r = readDie(v);
  return r.critico ? 'crit' : r.successes >= 2 ? 'two' : r.impulso ? 'imp' : r.successes ? 's1' : 's0';
}

// ------------------------------------------------------------------ gems
interface Gem {
  name: string;
  light: string;
  base: string;
  deep: string;
  /** colour of the inner glow / motion smear */
  glow: number;
}
const GEMS: Record<number, Gem> = {
  4: { name: 'jade', light: '#5fe0a2', base: '#13824f', deep: '#052f1c', glow: 0x4fe0a0 },
  6: { name: 'âmbar', light: '#ffc65a', base: '#c46a0c', deep: '#4e2203', glow: 0xffa83a },
  8: { name: 'granada', light: '#ff6a7e', base: '#9a1830', deep: '#36040e', glow: 0xff4a64 },
  10: { name: 'safira', light: '#6f9cff', base: '#1c46b0', deep: '#071747', glow: 0x5a8cff },
  12: { name: 'ametista', light: '#c58cff', base: '#6a28a6', deep: '#250944', glow: 0xb070ff },
};
const gemOf = (g: number) => GEMS[g] ?? GEMS[12];

// ------------------------------------------------------------------ geometry: one face = one group of triangles
interface Face {
  normal: THREE.Vector3;
  center: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  tris: number[];
}
function d10Geometry(): THREE.BufferGeometry {
  // pentagonal trapezohedron: apex ±h, rings at ±a with a = h(1-cos36°)/(1+cos36°) so every kite is planar
  const h = 1;
  const c36 = Math.cos(Math.PI / 5);
  const a = (h * (1 - c36)) / (1 + c36);
  const T = new THREE.Vector3(0, h, 0);
  const B = new THREE.Vector3(0, -h, 0);
  const U = (k: number) => new THREE.Vector3(Math.cos((k * 2 * Math.PI) / 5), a, Math.sin((k * 2 * Math.PI) / 5));
  const L = (k: number) => new THREE.Vector3(Math.cos((k * 2 * Math.PI) / 5 + Math.PI / 5), -a, Math.sin((k * 2 * Math.PI) / 5 + Math.PI / 5));
  const pts: THREE.Vector3[] = [];
  const kite = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3) => pts.push(p0, p1, p2, p0, p2, p3);
  for (let k = 0; k < 5; k++) {
    kite(T, U(k), L(k), U(k + 1));
    kite(B, L(k + 1), U(k + 1), L(k));
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  g.scale(0.95, 1.05, 0.95);
  return g;
}
function baseGeometry(grade: number): THREE.BufferGeometry {
  switch (grade) {
    case 4:
      return new THREE.TetrahedronGeometry(1.2).toNonIndexed();
    case 6:
      return new THREE.BoxGeometry(1.25, 1.25, 1.25).toNonIndexed();
    case 8:
      return new THREE.OctahedronGeometry(1.12).toNonIndexed();
    case 10:
      return d10Geometry();
    default:
      return new THREE.DodecahedronGeometry(1.05).toNonIndexed();
  }
}
/** Group triangles by plane, make outward winding, build a per-face basis. */
function facesOf(g: THREE.BufferGeometry): Face[] {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const faces: Face[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < pos.count / 3; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const centroid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
    if (n.dot(centroid) < 0) {
      pos.setXYZ(t * 3 + 1, c.x, c.y, c.z);
      pos.setXYZ(t * 3 + 2, b.x, b.y, b.z);
      n.negate();
    }
    let f = faces.find((x) => x.normal.dot(n) > 0.995);
    if (!f) {
      f = { normal: n.clone(), center: new THREE.Vector3(), up: new THREE.Vector3(), right: new THREE.Vector3(), tris: [] };
      faces.push(f);
    }
    f.tris.push(t);
  }
  for (const f of faces) {
    const verts: THREE.Vector3[] = [];
    for (const t of f.tris) for (let k = 0; k < 3; k++) verts.push(new THREE.Vector3().fromBufferAttribute(pos, t * 3 + k));
    const uniq = verts.filter((v, i) => verts.findIndex((w) => w.distanceTo(v) < 1e-4) === i);
    f.center = uniq.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(uniq.length);
    const far = uniq.reduce((best, v) => (v.distanceTo(f.center) > best.distanceTo(f.center) ? v : best), uniq[0]);
    f.up = far.clone().sub(f.center).projectOnPlane(f.normal).normalize();
    if (f.up.lengthSq() < 0.5) f.up = new THREE.Vector3(0, 1, 0).projectOnPlane(f.normal).normalize();
    f.right = new THREE.Vector3().crossVectors(f.up, f.normal).normalize();
  }
  return faces;
}

if (typeof document !== 'undefined') void document.fonts?.load?.('700 60px Cinzel').catch(() => undefined);

type Skin = 'gem' | 'dead' | 'gold';
/**
 * Face atlases, one number per cell: the gem (deep colour, lit from inside, a gold numeral with a dark keyline),
 * the dead stone a miss turns into, the gold a critical turns into; plus the glow map (only the numeral) so the
 * numbers stay readable in any light.
 */
function atlas(count: number, grade: number, skin: Skin | 'glow'): THREE.CanvasTexture {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cell = 160;
  const cv = document.createElement('canvas');
  cv.width = cols * cell;
  cv.height = rows * cell;
  const g = cv.getContext('2d')!;
  const gem = gemOf(grade);
  g.fillStyle = skin === 'glow' ? '#000' : skin === 'dead' ? '#3a3633' : skin === 'gold' ? '#8a5a12' : gem.deep;
  g.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < count; i++) {
    const x0 = (i % cols) * cell;
    const y0 = Math.floor(i / cols) * cell;
    const x = x0 + cell / 2;
    const y = y0 + cell / 2;
    if (skin !== 'glow') {
      // body: lit from within, brighter toward the upper-left, deep at the rim
      const rg = g.createRadialGradient(x - 16, y - 20, 4, x, y, cell * 0.74);
      const [l, b, d] = skin === 'dead' ? ['#8d8780', '#5c5752', '#2c2927'] : skin === 'gold' ? ['#fff1b0', '#e7aa34', '#6e4006'] : [gem.light, gem.base, gem.deep];
      rg.addColorStop(0, l);
      rg.addColorStop(0.28, b);
      rg.addColorStop(0.95, d);
      g.fillStyle = rg;
      g.fillRect(x0, y0, cell, cell);
      // a few inner flecks (the gem's depth)
      g.globalAlpha = skin === 'dead' ? 0.12 : 0.22;
      for (let k = 0; k < 7; k++) {
        const fx = x0 + 18 + ((k * 53 + i * 31) % (cell - 36));
        const fy = y0 + 18 + ((k * 37 + i * 59) % (cell - 36));
        const fg = g.createRadialGradient(fx, fy, 0, fx, fy, 10);
        fg.addColorStop(0, '#fff');
        fg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = fg;
        g.fillRect(fx - 10, fy - 10, 20, 20);
      }
      g.globalAlpha = 1;
    }
    const label = String(i + 1);
    const size = count >= 10 ? 74 : 88;
    g.font = `700 ${size}px Cinzel, Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const ty = y + 6;
    const under = label === '6' || label === '9';
    if (skin === 'glow') {
      g.fillStyle = '#fff';
      g.fillText(label, x, ty);
      if (under) g.fillRect(x - 20, y + 44, 40, 6);
      continue;
    }
    // keyline, then the numeral in gold (or ash, or dark on the gold critical)
    g.lineJoin = 'round';
    g.lineWidth = 9;
    g.strokeStyle = skin === 'gold' ? '#fff6d0' : '#120802';
    g.strokeText(label, x, ty);
    if (under) g.strokeRect(x - 20, y + 44, 40, 6);
    const fill = g.createLinearGradient(0, ty - size / 2, 0, ty + size / 2);
    if (skin === 'dead') {
      fill.addColorStop(0, '#d6cebf');
      fill.addColorStop(1, '#8e8678');
    } else if (skin === 'gold') {
      fill.addColorStop(0, '#5a1c06');
      fill.addColorStop(1, '#2a0a02');
    } else {
      fill.addColorStop(0, '#fff6cf');
      fill.addColorStop(0.45, '#f3c95e');
      fill.addColorStop(1, '#b07a1e');
    }
    g.fillStyle = fill;
    g.fillText(label, x, ty);
    if (under) g.fillRect(x - 20, y + 44, 40, 6);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

interface DieModel {
  geo: THREE.BufferGeometry;
  edges: THREE.BufferGeometry;
  faces: Face[];
  skins: Record<Skin, THREE.CanvasTexture>;
  glow: THREE.CanvasTexture;
}
const models = new Map<number, DieModel>();
function dieModel(grade: number): DieModel {
  const cached = models.get(grade);
  if (cached) return cached;
  const geo = baseGeometry(grade);
  const faces = facesOf(geo);
  const n = faces.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  // UVs: each face maps into its own atlas cell (face i shows number i+1)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  const v = new THREE.Vector3();
  faces.forEach((f, i) => {
    let R = 0;
    for (const t of f.tris) for (let k = 0; k < 3; k++) R = Math.max(R, v.fromBufferAttribute(pos, t * 3 + k).distanceTo(f.center));
    const cx = (i % cols) + 0.5;
    const cy = rows - Math.floor(i / cols) - 0.5;
    const s = grade === 4 ? 0.6 : grade === 12 ? 0.8 : grade === 10 ? 0.74 : 0.86;
    for (const t of f.tris)
      for (let k = 0; k < 3; k++) {
        const idx = t * 3 + k;
        v.fromBufferAttribute(pos, idx).sub(f.center);
        // d10 kites: the numeral sits a little toward the wide end
        const y = v.dot(f.up) / (2 * R) + (grade === 10 ? 0.12 : 0);
        uv[idx * 2] = (cx + (v.dot(f.right) / (2 * R)) * s) / cols;
        uv[idx * 2 + 1] = (cy + y * s) / rows;
      }
  });
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const m: DieModel = {
    geo,
    edges: new THREE.EdgesGeometry(geo, 12),
    faces,
    skins: { gem: atlas(n, grade, 'gem'), dead: atlas(n, grade, 'dead'), gold: atlas(n, grade, 'gold') },
    glow: atlas(n, grade, 'glow'),
  };
  models.set(grade, m);
  return m;
}

/** Orientation that turns face `f` toward the camera (+Z) with its number upright. */
function facingQuat(f: Face): THREE.Quaternion {
  const m = new THREE.Matrix4().makeBasis(f.right, f.up, f.normal);
  return new THREE.Quaternion().setFromRotationMatrix(m.transpose());
}

// ------------------------------------------------------------------ sprites drawn once
function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let texCache: { glow: THREE.CanvasTexture; rays: THREE.CanvasTexture; spark: THREE.CanvasTexture } | null = null;
function textures() {
  if (texCache) return texCache;
  const glow = canvasTex(128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    r.addColorStop(0.65, 'rgba(255,255,255,0.1)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });
  const rays = canvasTex(256, (g, s) => {
    g.translate(s / 2, s / 2);
    for (let i = 0; i < 20; i++) {
      g.rotate((Math.PI * 2) / 20);
      const w = i % 2 ? 0.035 : 0.075;
      const lg = g.createLinearGradient(0, 0, s / 2, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0.95)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(s / 2, -s * w);
      g.lineTo(s / 2, s * w);
      g.closePath();
      g.fill();
    }
  });
  const spark = canvasTex(64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.18, 'rgba(255,255,255,0.85)');
    r.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(s / 2 - 0.75, 4, 1.5, s - 8);
    g.fillRect(4, s / 2 - 0.75, s - 8, 1.5);
  });
  texCache = { glow, rays, spark };
  return texCache;
}

// ------------------------------------------------------------------ pooled sparkles (one Points draw call)
const PART_VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aCol;
varying vec4 vCol;
uniform float uPx;
void main() {
  vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPx / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const PART_FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec4 vCol;
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(vCol.rgb * t.rgb, t.a * vCol.a);
  if (gl_FragColor.a < 0.01) discard;
}`;
class Sparkles {
  readonly N = 240;
  readonly points: THREE.Points;
  private pos = new Float32Array(this.N * 3);
  private col = new Float32Array(this.N * 4);
  private size = new Float32Array(this.N);
  private vel = new Float32Array(this.N * 3);
  private life = new Float32Array(this.N);
  private max = new Float32Array(this.N);
  private s0 = new Float32Array(this.N);
  private rgb = new Float32Array(this.N * 3);
  private grav = new Float32Array(this.N);
  private next = 0;
  private c = new THREE.Color();
  readonly mat: THREE.ShaderMaterial;
  constructor(tex: THREE.Texture) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ vertexShader: PART_VERT, fragmentShader: PART_FRAG, uniforms: { uTex: { value: tex }, uPx: { value: 600 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }
  clear() {
    this.life.fill(0);
    this.col.fill(0);
  }
  emit(p: THREE.Vector3, v: THREE.Vector3, life: number, size: number, color: number, gravity = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.N;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = this.max[i] = life;
    this.s0[i] = size;
    this.c.setHex(color);
    this.rgb.set([this.c.r, this.c.g, this.c.b], i * 3);
    this.grav[i] = gravity;
  }
  /** a ring burst in the screen plane */
  burst(p: THREE.Vector3, n: number, speed: number, life: number, size: number, color: number, gravity = 0) {
    const v = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.4;
      v.set(Math.cos(a), Math.sin(a), (Math.random() - 0.3) * 0.6).multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      this.emit(p, v, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.7), color, gravity);
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) {
        this.col[i * 4 + 3] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const drag = Math.exp(-3 * dt);
      for (let a = 0; a < 3; a++) {
        this.vel[i * 3 + a] *= drag;
        this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      }
      this.size[i] = this.s0[i] * (0.3 + 0.7 * k);
      this.col[i * 4] = this.rgb[i * 3];
      this.col[i * 4 + 1] = this.rgb[i * 3 + 1];
      this.col[i * 4 + 2] = this.rgb[i * 3 + 2];
      this.col[i * 4 + 3] = Math.min(1, k * 1.8);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aCol.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ one shared little renderer
interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sparkles: Sparkles;
}
let stage: Stage | null = null;
let stageFailed = false;
function getStage(): Stage | null {
  if (stage || stageFailed) return stage;
  try {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    const scene = new THREE.Scene();
    // a studio environment: the facets catch sharp reflections like a cut stone
    try {
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.02).texture;
      scene.environmentIntensity = 0.45;
      pm.dispose();
    } catch {
      /* no env: still lit */
    }
    const camera = new THREE.PerspectiveCamera(18, 1, 1, 80);
    camera.position.set(0, 0, 30);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x1a1210, 0.7));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.7);
    key.position.set(-4, 6, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffc27a, 2.6);
    rim.position.set(5, 3, -6);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0x9fb8ff, 0.6);
    fill.position.set(6, -3, 6);
    scene.add(fill);
    const sparkles = new Sparkles(textures().spark);
    scene.add(sparkles.points);
    stage = { renderer, scene, camera, sparkles };
    return stage;
  } catch {
    stageFailed = true;
    return null;
  }
}

// ------------------------------------------------------------------ timeline
/**
 * The roll's timeline in nominal seconds (battle speed 1). The clock runs `1 / timeScale()` faster at higher
 * battle speeds, so every beat keeps its place.
 */
export function dicePlan(n: number, crit: boolean, bonus: boolean, reduced: boolean) {
  const open = reduced ? 0.12 : 0.2;
  const first = reduced ? 0.4 : 0.95;
  const stagger = reduced ? 0.1 : 0.16;
  const snap = Array.from({ length: n }, (_, i) => first + i * stagger);
  const last = snap[n - 1];
  const bonusAt = last + 0.14;
  const verdict = (bonus ? bonusAt : last) + 0.2;
  const shown = verdict + (crit ? 0.55 : 0.45);
  return { open, snap, bonusAt, verdict, shown, hold: 2.4, leave: 0.32 };
}
/** Real seconds per nominal second (battle speed and the test slow-down). */
export function diceTimeScale(): number {
  const speed = Math.max(1, getSettings().animSpeed || 1);
  return Math.pow(speed, -0.72) * Math.max(0.05, W.__diceSlow ?? 1);
}

type Mode = 'up' | 'side' | 'wide';
function modeOf(w: number, h: number): Mode {
  if (h <= 520 && w / h >= 1.4) return 'side';
  if (w / h < 0.9) return 'up';
  return 'wide';
}
/** socket size (CSS px) per screen and dice count */
function socketSize(mode: Mode, w: number, n: number) {
  const base = mode === 'side' ? 60 : mode === 'up' ? (n >= 3 ? 80 : 90) : 104;
  const room = mode === 'up' ? Math.min(w * 0.94, 380) - 40 : 9999;
  return Math.floor(Math.min(base, (room - (n - 1) * 14) / n));
}

/** The universal table as zones on a die's scale (cut at the die's size). */
const ZONES = [
  { from: 1, to: 2, cls: 'z0' },
  { from: 3, to: 5, cls: 'z1' },
  { from: 6, to: 8, cls: 'z2' },
  { from: 9, to: 11, cls: 'z3' },
  { from: 12, to: 12, cls: 'z4' },
];
function wordOf(v: number, defense: boolean): string {
  const k = kindOf(v);
  if (k === 'crit') return 'CRÍTICO!';
  if (defense) return k === 's0' ? 'Falha' : k === 'two' ? '2 Bloqueios' : 'Bloqueia';
  return k === 's0' ? 'Erro' : k === 's1' ? 'Acerto' : k === 'imp' ? 'Acerto + Impulso' : '2 Acertos';
}

interface UiState {
  snapped: number;
  bonus: boolean;
  verdict: boolean;
  leaving: boolean;
}

// ------------------------------------------------------------------ the roll as the HUD shows it
export function DiceBurst({ ev }: { ev: RollEvent }) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const sockets = useRef<(HTMLDivElement | null)[]>([]);
  const [ui, setUi] = useState<UiState>({ snapped: 0, bonus: false, verdict: false, leaving: false });
  const [gone, setGone] = useState(false);
  const [flat, setFlat] = useState(false);
  const r = ev.roll;
  const dice = r.dice.slice(0, 3);
  const n = Math.max(1, dice.length);
  const defense = /^(Defesa|Égide)/.test(ev.purpose);
  const purpose = ev.purpose.replace(/^Defesa\s*[—-]\s*/, '');
  const diceSucc = dice.reduce((s, d) => s + readDie(d.value).successes, 0);
  const extra = Math.max(0, r.successes - diceSucc);
  const mode = useMemo(() => modeOf(window.innerWidth, window.innerHeight), [ev]);
  const S = useMemo(() => socketSize(mode, window.innerWidth, n), [mode, n]);

  useEffect(() => {
    const reduced = getSettings().reducedMotion;
    const plan = dicePlan(n, r.critico, extra > 0, reduced);
    const f = diceTimeScale();
    const st = getStage();
    if (!st) setFlat(true);
    let alive = true;
    let raf = 0;
    let t0 = -1;
    let lastT = 0;
    let shownSent = false;
    let leaveAt = Infinity;
    const flags: UiState = { snapped: 0, bonus: false, verdict: false, leaving: false };
    const push = (p: Partial<UiState>) => {
      let changed = false;
      for (const k of Object.keys(p) as (keyof UiState)[])
        if (flags[k] !== p[k]) {
          (flags as unknown as Record<string, unknown>)[k] = p[k];
          changed = true;
        }
      if (changed && alive) setUi({ ...flags });
    };
    const finish = () => {
      if (!alive) return;
      alive = false;
      cancelAnimationFrame(raf);
      sendShown();
      setGone(true);
    };

    // ---------- 3D set-up: the canvas covers the panel (plus a margin for the bursts)
    const el = st?.renderer.domElement;
    let group: THREE.Group | null = null;
    const disposables: { dispose(): void }[] = [];
    type Item = {
      mesh: THREE.Mesh;
      mat: THREE.MeshPhysicalMaterial;
      edges: THREE.LineSegments;
      edgeMat: THREE.LineBasicMaterial;
      ghosts: THREE.Mesh[];
      shell: THREE.Mesh;
      shellMat: THREE.ShaderMaterial;
      halo: THREE.Sprite;
      model: DieModel;
      grade: number;
      kind: Kind;
      succ: number;
      at: THREE.Vector3;
      size: number;
      final: THREE.Quaternion;
      axis: THREE.Vector3;
      th0: number;
      appear: number;
      snap: number;
      snapped: boolean;
    };
    let items: Item[] = [];
    let rays: THREE.Sprite | null = null;
    let cw = 1;
    let ch = 1;
    let k = 1; // world units per CSS px at z = 0
    const M = 40;
    if (st && el && host.current && panel.current) {
      const { renderer, scene, camera, sparkles } = st;
      el.className = 'dz-gl';
      host.current.appendChild(el);
      cw = panel.current.offsetWidth + M * 2;
      ch = panel.current.offsetHeight + M * 2;
      el.style.width = `${cw}px`;
      el.style.height = `${ch}px`;
      el.style.left = `${-M}px`;
      el.style.top = `${-M}px`;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      k = (2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / ch;
      sparkles.mat.uniforms.uPx.value = (ch * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      sparkles.clear();
      group = new THREE.Group();
      scene.add(group);
      const T = textures();
      const pr = panel.current.getBoundingClientRect();
      items = dice.map((d, i) => {
        const m = dieModel(d.grade);
        const gem = gemOf(d.grade);
        const kind = kindOf(d.value);
        // die centre = its socket's centre (measured; ratios are immune to the panel's opening scale)
        const sr = sockets.current[i]?.getBoundingClientRect();
        const u = sr && pr.width ? (sr.left + sr.width / 2 - pr.left) / pr.width : 0.5;
        const v = sr && pr.height ? (sr.top + sr.height / 2 - pr.top) / pr.height : 0.4;
        const px = M + u * (cw - 2 * M);
        const py = M + v * (ch - 2 * M);
        const at = new THREE.Vector3((px - cw / 2) * k, (ch / 2 - py) * k, 0);
        const size = S * 0.3 * k;
        const mat = new THREE.MeshPhysicalMaterial({
          map: m.skins.gem,
          emissiveMap: m.glow,
          emissive: new THREE.Color(0xffc860),
          emissiveIntensity: 0.32,
          color: new THREE.Color(0.86, 0.86, 0.86),
          roughness: 0.2,
          metalness: 0.05,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
          iridescence: 0.25,
          iridescenceIOR: 1.6,
          specularIntensity: 1,
        });
        const mesh = new THREE.Mesh(m.geo, mat);
        mesh.scale.setScalar(size);
        mesh.position.copy(at);
        const edgeMat = new THREE.LineBasicMaterial({ color: 0xf6d27a, transparent: true, opacity: 0.85 });
        const edges = new THREE.LineSegments(m.edges, edgeMat);
        mesh.add(edges);
        // an inner glow at the rim (fresnel), in the gem's colour
        const shellMat = new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(gem.glow) }, uI: { value: 0.35 } },
          vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
          fragmentShader: `uniform vec3 uColor; uniform float uI; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.8); gl_FragColor = vec4(uColor * uI * (0.1 + f * 1.6), 1.0); }`,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
          side: THREE.BackSide,
        });
        const shell = new THREE.Mesh(m.geo, shellMat);
        shell.scale.setScalar(1.09);
        mesh.add(shell);
        // motion smear: the die's last positions, faint and additive
        const ghosts = [0, 1, 2].map(() => {
          const gm = new THREE.Mesh(m.geo, new THREE.MeshBasicMaterial({ color: gem.glow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
          gm.scale.setScalar(size * 0.98);
          gm.position.copy(at);
          group!.add(gm);
          disposables.push(gm.material as THREE.Material);
          return gm;
        });
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: gem.glow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        halo.position.copy(at).setZ(-size * 1.5);
        halo.scale.setScalar(size * 4);
        halo.renderOrder = -1;
        group!.add(halo, mesh);
        disposables.push(mat, edgeMat, shellMat, halo.material);
        const face = m.faces[clamp(d.value - 1, 0, m.faces.length - 1)];
        // presented slightly turned, so the facets read as a solid stone
        const final = new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(0.26, (i % 2 ? -1 : 1) * 0.2, 0))
          .multiply(facingQuat(face));
        const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, (Math.random() - 0.5) * 0.4).normalize();
        return {
          mesh,
          mat,
          edges,
          edgeMat,
          ghosts,
          shell,
          shellMat,
          halo,
          model: m,
          grade: d.grade,
          kind,
          succ: readDie(d.value).successes,
          at,
          size,
          final,
          axis,
          th0: reduced ? 0.9 : (3.1 + Math.random() * 0.8) * Math.PI * 2,
          appear: i * 0.05,
          snap: plan.snap[i],
          snapped: false,
        };
      });
      if (r.critico) {
        rays = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.rays, color: 0xffd36a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        const c = items.reduce((s, it) => s.add(it.at), new THREE.Vector3()).divideScalar(Math.max(1, items.length));
        rays.position.copy(c).setZ(-3);
        rays.renderOrder = -2;
        group.add(rays);
        disposables.push(rays.material);
      }
      // compile first so the clock starts on a drawn frame (shader compiles take a while on weak GPUs)
      try {
        renderer.compile(scene, camera);
      } catch {
        /* ignore */
      }
    }

    const proj = new THREE.Vector3();
    const sendShown = () => {
      if (shownSent) return;
      shownSent = true;
      const sparks: { x: number; y: number; kind: Kind }[] = [];
      const cr = el?.getBoundingClientRect();
      if (st && items.length && cr && cr.width) {
        for (const it of items) {
          proj.copy(it.at).project(st.camera);
          const x = cr.left + ((proj.x + 1) / 2) * cr.width;
          const y = cr.top + ((1 - proj.y) / 2) * cr.height;
          for (let q = 0; q < Math.min(3, it.succ); q++) sparks.push({ x, y, kind: it.kind });
        }
      } else {
        dice.forEach((d, i) => {
          const sr = sockets.current[i]?.getBoundingClientRect();
          const s = readDie(d.value).successes;
          if (sr) for (let q = 0; q < Math.min(3, s); q++) sparks.push({ x: sr.left + sr.width / 2, y: sr.top + sr.height / 2, kind: kindOf(d.value) });
        });
      }
      window.dispatchEvent(new CustomEvent(DICE_SIGNAL, { detail: { seq: ev.seq, phase: 'shown', sparks, defense } }));
    };

    const tmpQ = new THREE.Quaternion();
    const tmpV = new THREE.Vector3();
    const X = new THREE.Vector3(1, 0, 0);
    const SNAP = 0.11;
    const TH_S = 0.75;
    /** angle still to turn before the die rests on its face (spin, slow down, then snap into place) */
    const angleAt = (it: Item, t: number) => {
      const a = t - it.appear;
      const T = it.snap - it.appear;
      if (a >= T) return 0;
      if (reduced) return it.th0 * (1 - easeOutCubic(clamp(a / T, 0, 1)));
      const tA = T - SNAP;
      if (a < tA) return it.th0 - (it.th0 - TH_S) * easeOutCubic(clamp(a / tA, 0, 1));
      const q = (a - tA) / SNAP;
      return TH_S * (1 - q * q);
    };
    const orient = (it: Item, t: number, out: THREE.Quaternion) => out.setFromAxisAngle(it.axis, angleAt(it, t)).multiply(it.final);

    const frame = () => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const real = now();
      if (t0 < 0) t0 = real;
      const t = (real - t0) / 1000 / f; // nominal seconds
      const dt = clamp(t - lastT, 0, 0.1);
      lastT = t;

      // ---- beats that drive the DOM
      let sn = 0;
      for (let i = 0; i < n; i++) if (t >= plan.snap[i]) sn = i + 1;
      if (sn > flags.snapped) audio.play(sn === n && r.critico ? 'dice_critical' : 'dice_land', { volume: sn === n && r.critico ? 0.8 : 0.55 });
      push({ snapped: sn, bonus: extra > 0 && t >= plan.bonusAt });
      if (!flags.verdict && t >= plan.verdict) {
        push({ verdict: true });
        if (!r.critico) audio.play(r.impulsos ? 'dice_impulse' : r.successes ? 'dice_success' : 'dice_fail', { volume: 0.65 });
      }
      if (t >= plan.shown) sendShown();
      if (leaveAt === Infinity && t >= plan.shown + plan.hold) leaveAt = t;
      if (t >= leaveAt && !flags.leaving) push({ leaving: true });
      const lk = leaveAt === Infinity ? 0 : clamp((t - leaveAt) / plan.leave, 0, 1);
      if (lk >= 1) {
        finish();
        return;
      }

      // ---- 3D
      if (!st || !group) return;
      const { renderer, scene, camera, sparkles } = st;
      for (const it of items) {
        const m = it.mesh;
        const a = t - it.appear;
        const gem = gemOf(it.grade);
        if (a < 0) {
          m.visible = false;
          continue;
        }
        m.visible = true;
        const ok = it.kind !== 's0';
        const after = t - it.snap;
        // appear: grow out of the socket
        const grow = reduced ? 1 : easeOutBack(clamp(a / 0.22, 0, 1));
        // snap: a punch of scale and a damped wobble around the face
        const punch = after >= 0 && !reduced ? Math.sin(clamp(after / 0.22, 0, 1) * Math.PI) * (it.kind === 'crit' ? 0.24 : ok ? 0.15 : 0.06) : 0;
        const leaveS = ok ? 1 - 0.7 * easeOutCubic(lk) : 1 - 0.3 * lk;
        m.scale.setScalar(it.size * Math.max(0.01, grow) * (1 + punch) * leaveS);
        // while spinning the die floats a little toward the player, and drops into the socket on the snap
        const lift = after < 0 ? 0.35 * it.size * clamp(a / 0.2, 0, 1) : 0.35 * it.size * Math.max(0, 1 - after / 0.08);
        m.position.copy(it.at).setZ(lift);
        orient(it, t, m.quaternion);
        if (after >= 0 && !reduced) {
          const wob = Math.sin(after * 34) * Math.exp(-after * 11) * 0.16;
          m.quaternion.premultiply(tmpQ.setFromAxisAngle(X, wob));
        }
        // motion smear while it spins fast
        const speed = Math.abs(angleAt(it, t - 0.016) - angleAt(it, t)) / 0.016;
        it.ghosts.forEach((g, j) => {
          const op = after < 0 && !reduced ? clamp((speed - 6) / 40, 0, 1) * (0.26 - j * 0.07) : 0;
          (g.material as THREE.MeshBasicMaterial).opacity = op;
          g.visible = op > 0.005;
          if (!g.visible) return;
          orient(it, t - (j + 1) * 0.022, g.quaternion);
          g.position.copy(m.position);
          g.scale.copy(m.scale).multiplyScalar(0.99);
        });
        // spinning sparkles
        if (after < 0 && !reduced && Math.random() < 0.5) {
          const ang = Math.random() * Math.PI * 2;
          tmpV.set(Math.cos(ang), Math.sin(ang), 0).multiplyScalar(it.size * 1.25).add(m.position);
          sparkles.emit(tmpV, new THREE.Vector3(-Math.sin(ang), Math.cos(ang), 0).multiplyScalar(it.size * 3), 0.35, it.size * 0.5, gem.glow);
        }
        // the snap: flash, burst, the stone shows what it rolled
        if (after >= 0 && !it.snapped) {
          it.snapped = true;
          if (!ok) {
            it.mat.map = it.model.skins.dead;
            it.mat.emissiveIntensity = 0.06;
            it.mat.iridescence = 0;
            it.edgeMat.color.setHex(0x8a8276);
            it.shellMat.uniforms.uI.value = 0;
            it.mat.needsUpdate = true;
            if (!reduced) sparkles.burst(tmpV.copy(it.at).setZ(-it.size * 0.9), 10, it.size * 2, 0.6, it.size * 0.6, 0x6e665e, it.size * 3);
          } else {
            if (it.kind === 'crit') {
              it.mat.map = it.model.skins.gold;
              it.mat.metalness = 0.55;
              // dark numerals on bright gold: no numeral glow (it would wash them out)
              it.mat.emissive.setHex(0x000000);
              it.edgeMat.color.setHex(0xfff4d0);
              it.mat.needsUpdate = true;
            }
            const col = it.kind === 'crit' ? 0xffe27a : it.kind === 'two' ? 0xffd060 : it.kind === 'imp' ? 0xffb848 : 0xfff0c8;
            if (!reduced) {
              sparkles.burst(tmpV.copy(it.at).setZ(-it.size * 0.9), it.kind === 'crit' ? 44 : it.kind === 'two' ? 26 : 18, it.size * (it.kind === 'crit' ? 7 : 4.5), 0.75, it.size * 0.7, col);
              if (it.kind === 'crit') sparkles.burst(tmpV.copy(it.at).setZ(-it.size * 0.9), 24, it.size * 11, 0.6, it.size * 0.45, 0xffffff);
            }
          }
        }
        // halo + rim glow by outcome
        const hk = after >= 0 ? clamp(after / 0.12, 0, 1) : 0;
        const flash = after >= 0 ? Math.exp(-after * 7) : 0;
        const pulse = 0.85 + 0.15 * Math.sin(t * 6 + it.at.x);
        const hb = ok ? (it.kind === 'crit' ? 1 : it.kind === 'two' ? 0.8 : it.kind === 'imp' ? 0.7 : 0.55) : 0;
        it.halo.material.color.setHex(after < 0 ? gem.glow : it.kind === 'crit' ? 0xffd060 : ok ? 0xffe0a0 : 0x000000);
        it.halo.material.opacity = (after < 0 ? 0.35 * clamp(a / 0.25, 0, 1) : 0.7 * hb * hk * pulse + flash * (ok ? 0.8 : 0.25)) * (1 - lk);
        it.halo.scale.setScalar(it.size * (after < 0 ? 3.6 : 4 + flash * 3 + (it.kind === 'crit' ? 1.5 : 0)));
        if (ok) {
          it.shellMat.uniforms.uI.value = (0.35 + flash * 1.2 + (it.kind === 'crit' ? 0.4 : 0)) * (1 - lk);
          if (after >= 0) {
            it.shellMat.uniforms.uColor.value.setHex(it.kind === 'crit' ? 0xffd060 : it.kind === 's1' ? gem.glow : 0xffc048);
            it.mat.emissiveIntensity = 0.32 + flash * 0.9 + (it.kind === 'crit' ? 0.25 : 0) + 2.5 * Math.sin(Math.min(1, lk * 1.6) * Math.PI);
          }
          if (lk > 0 && lk < 0.6 && !reduced && Math.random() < 0.8) sparkles.burst(m.position, 2, it.size * 3, 0.35, it.size * 0.4, 0xffe0a0);
        }
      }
      if (rays) {
        const rk = clamp((t - plan.snap[n - 1]) / 0.4, 0, 1);
        rays.material.opacity = 0.6 * rk * (1 - lk) * (0.85 + 0.15 * Math.sin(t * 5));
        rays.material.rotation = t * 0.5;
        rays.scale.setScalar(S * k * (n * 1.4 + 2.4) * (0.5 + 0.5 * easeOutBack(rk)));
      }
      sparkles.update(dt);
      renderer.render(scene, camera);
    };

    // the board says the blow starts (or the player fast-forwards)
    const onRelease = (e: Event) => {
      const d = (e as CustomEvent<{ instant?: boolean }>).detail;
      if (d?.instant) {
        finish();
        return;
      }
      if (leaveAt === Infinity) leaveAt = Math.max(lastT, plan.shown);
    };
    window.addEventListener(DICE_RELEASE, onRelease);
    raf = requestAnimationFrame(frame);
    // safety: whatever happens to the frames (hidden tab, lost GPU), the dice report and leave
    // (not while a test drives the virtual clock frame by frame)
    const virtual = typeof W.__diceClock === 'number';
    const total = (plan.shown + plan.hold + plan.leave + 1.5) * f * 1000;
    const safety = virtual ? 0 : setTimeout(finish, total);
    const early = virtual ? 0 : setTimeout(sendShown, (plan.shown + 1.2) * f * 1000);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(safety);
      clearTimeout(early);
      window.removeEventListener(DICE_RELEASE, onRelease);
      sendShown();
      if (st && group) {
        st.scene.remove(group);
        st.sparkles.clear();
        for (const d of disposables) d.dispose();
        st.renderer.clear();
      }
      if (el && el.parentElement === host.current) host.current?.removeChild(el);
    };
  }, [ev]);

  if (gone) return null;
  const snappedDice = dice.slice(0, ui.snapped);
  const count = snappedDice.reduce((s, d) => s + readDie(d.value).successes, 0) + (ui.bonus ? extra : 0);
  const imp = dice.reduce((s, d) => s + readDie(d.value).impulso, 0);
  const cls = r.critico ? 'crit' : r.successes ? 'ok' : 'no';
  const f = diceTimeScale();
  const style = { ['--S' as string]: `${S}px`, ['--f' as string]: String(f) } as React.CSSProperties;
  return (
    <div ref={root} className={`dz g-dice m-${mode} ${defense ? 'def' : ''} ${ui.verdict ? `v-${cls}` : ''} ${ui.leaving ? 'out' : ''} ${flat ? 'flat' : ''}`} style={style} aria-live="polite">
      {ui.verdict && r.critico && <div className="dz-flash" aria-hidden />}
      <div ref={panel} className="dz-panel">
        <Filigree />
        <div ref={host} className="dz-host" aria-hidden />
        <div className="dz-cap">
          {defense && <span className="dz-tag">Defesa</span>}
          <span>{purpose}</span>
        </div>
        <div className="dz-need">
          {defense ? (
            <>
              <b>3+</b> bloqueia
            </>
          ) : (
            <>
              Precisa de <b>3+</b>
            </>
          )}
        </div>
        <div className="dz-row">
          {dice.map((d, i) => {
            const on = i < ui.snapped;
            const kind = kindOf(d.value);
            const zones = ZONES.filter((z) => z.from <= d.grade).map((z) => ({ ...z, to: Math.min(z.to, d.grade) }));
            const hit = zones.find((z) => d.value >= z.from && d.value <= z.to);
            return (
              <div key={i} className={`dz-die g${d.grade} ${on ? `on k-${kind}` : 'spin'}`}>
                <div className="dz-socket" ref={(e) => (sockets.current[i] = e)}>
                  <Socket />
                  {flat && on && <b className="dz-flatnum">{d.value}</b>}
                  {on && kind === 's0' && <Crack />}
                </div>
                <div className="dz-res">
                  <b key={on ? 'v' : 'q'}>{on ? d.value : `D${d.grade}`}</b>
                  <span>{on ? wordOf(d.value, defense) : ' '}</span>
                </div>
                <div className="dz-scale" aria-hidden>
                  {zones.map((z) => (
                    <i key={z.from} className={`${z.cls} ${on && hit === z ? 'hit' : ''}`} style={{ flexGrow: z.to - z.from + 1 }}>
                      {z.from === z.to ? z.from : `${z.from}-${z.to}`}
                    </i>
                  ))}
                  {on && <em className={`mk ${hit?.cls ?? ''}`} style={{ left: `${((d.value - 0.5) / d.grade) * 100}%` }} />}
                </div>
              </div>
            );
          })}
          {extra > 0 && (
            <div className={`dz-bonus ${ui.bonus ? 'on' : ''}`}>
              <b>+{extra}</b>
              <span>bônus</span>
            </div>
          )}
        </div>
        <div className="dz-verdict">
          {ui.verdict ? (
            <>
              {r.critico && <div className="dz-crit">CRÍTICO!</div>}
              <div className="dz-mean">
                {defense
                  ? r.successes
                    ? `${r.successes} bloqueio${r.successes > 1 ? 's' : ''}: −${r.successes} de dano recebido`
                    : 'Nenhum bloqueio: o golpe entra inteiro'
                  : r.critico
                    ? '+1 de dano e ignora 1 de armadura'
                    : r.successes
                      ? r.successes > 1
                        ? `Acertou! ${r.successes - 1} acerto${r.successes > 2 ? 's' : ''} a mais = +${r.successes - 1} de dano`
                        : 'Acertou! Dano normal da arma'
                      : 'Errou: nenhum dado chegou a 3'}
              </div>
              {!defense && imp > 0 && r.successes > 0 && <div className="dz-imp">✦ {imp > 1 ? `${imp} Impulsos` : 'Impulso'}: efeito extra</div>}
            </>
          ) : (
            <div className="dz-count">{count > 0 ? `${count} ${defense ? 'bloqueio' : 'acerto'}${count > 1 ? 's' : ''}…` : ' '}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Gold filigree: corner scrolls and a crest on the top edge. */
function Filigree() {
  const corner = (
    <svg viewBox="0 0 40 40" aria-hidden>
      <path d="M2 38 V14 Q2 2 14 2 H38" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 38 V17 Q7 7 17 7 H38" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
      <path d="M13 13 q5 -7 11 -3 q-6 1 -6 7 q-6 -1 -5 -4z" fill="currentColor" opacity="0.9" />
      <circle cx="14" cy="14" r="2" fill="currentColor" />
    </svg>
  );
  return (
    <div className="dz-fili" aria-hidden>
      <i className="tl">{corner}</i>
      <i className="tr">{corner}</i>
      <i className="bl">{corner}</i>
      <i className="br">{corner}</i>
      <svg className="crest" viewBox="0 0 120 22">
        <path d="M2 11 H44 M76 11 H118" stroke="currentColor" strokeWidth="1.2" />
        <path d="M44 11 q8 -9 16 0 q8 9 16 0" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M60 2 L66 11 L60 20 L54 11 Z" fill="currentColor" />
        <circle cx="40" cy="11" r="1.8" fill="currentColor" />
        <circle cx="80" cy="11" r="1.8" fill="currentColor" />
      </svg>
    </div>
  );
}

/** One die's gold socket: a dark well inside a ringed, notched gold bezel. */
function Socket() {
  const id = useId().replace(/:/g, '');
  const ticks = Array.from({ length: 24 }, (_, i) => i);
  return (
    <svg className="dz-ring" viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id={`w${id}`} cx="50%" cy="45%" r="55%">
          <stop offset="0" style={{ stopColor: 'var(--gem-l, #3a2a20)' }} stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#0b0807" stopOpacity="0.92" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff0b8" />
          <stop offset="0.35" stopColor="#e2b04e" />
          <stop offset="0.7" stopColor="#8a5a18" />
          <stop offset="1" stopColor="#e9c56a" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="44" fill={`url(#w${id})`} />
      <circle className="rg" cx="50" cy="50" r="45.5" fill="none" stroke={`url(#g${id})`} strokeWidth="4.5" />
      <circle cx="50" cy="50" r="40.5" fill="none" stroke={`url(#g${id})`} strokeWidth="1" opacity="0.8" />
      {ticks.map((i) => {
        const a = (i / ticks.length) * Math.PI * 2;
        const big = i % 6 === 0;
        const r0 = big ? 47.5 : 48.5;
        const r1 = big ? 53 : 51;
        return <line key={i} x1={50 + Math.cos(a) * r0} y1={50 + Math.sin(a) * r0} x2={50 + Math.cos(a) * r1} y2={50 + Math.sin(a) * r1} stroke={`url(#g${id})`} strokeWidth={big ? 2.6 : 1.2} strokeLinecap="round" />;
      })}
    </svg>
  );
}

/** A miss: the stone cracks. */
function Crack() {
  return (
    <svg className="dz-crack" viewBox="0 0 100 100" aria-hidden>
      <path d="M30 22 L44 40 L38 50 L52 62 L47 78 M44 40 L58 36 L66 26 M52 62 L66 66 L72 76" fill="none" stroke="#0c0a09" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M30 22 L44 40 L38 50 L52 62 L47 78 M44 40 L58 36 L66 26 M52 62 L66 66 L72 76" fill="none" stroke="#d8d0c4" strokeWidth="0.9" strokeLinejoin="round" strokeLinecap="round" opacity="0.7" transform="translate(0.8 0.8)" />
    </svg>
  );
}
