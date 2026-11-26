/**
 * Real 3D dice for every roll: true polyhedra (d4 tetrahedron, d6 cube, d8 octahedron, d10 pentagonal
 * trapezohedron, d12 dodecahedron) with engraved numbers, tossed onto an invisible table with real shadows,
 * tumbling and settling on the exact face the rules engine rolled.
 *
 * The roll is a short show in four beats (speed 1; faster battle speeds compress it, never reorder it):
 *   1. GATHER  the dice materialise above the table and rattle in the hand (cup-shake sound)
 *   2. TOSS    thrown onto the table: sparkle trail, three bounces, the spin dies on the rolled face
 *   3. REVEAL  one by one each die lifts and turns its face to the camera and glows by outcome
 *              (✗ grey, ✓ ivory, ✦ gold, ✹ critical gold burst); the count climbs with each die
 *   4. VERDICT the total pops ("2 sucessos", "CRÍTICO!"), a beat to read it, then the board is told
 *              (window event `mosteiro:dice`, phase 'shown') so the blow can land. The board answers with
 *              `mosteiro:dice-release` when the strike starts: the successful dice burst into sparks that the
 *              board flies to the target.
 * A small dedicated WebGL canvas, rendered only while the dice are on screen.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { readDie, type DomainEvent } from "@mosteiro/core";
import { getSettings } from "../../state/settings";
import { audio } from "../../audio/AudioDirector";
import "./dice.css";

/** The roll event as the board hands it over (`seq` identifies the roll in the dice ⇄ board handshake). */
export type RollEvent = Extract<DomainEvent, { type: "roll" }> & {
  seq?: number;
};

/** dice → board: { seq, phase: 'shown', sparks: {x,y,kind}[] (viewport px), defense } */
export const DICE_SIGNAL = "mosteiro:dice";
/** board → dice: { instant?: boolean } — the strike begins (or fast-forward) */
export const DICE_RELEASE = "mosteiro:dice-release";

type Kind = "s0" | "s1" | "imp" | "crit";
interface TestHooks {
  /** dev/test only: 4 plays the roll 4× slower so it can be inspected */
  __diceSlow?: number;
  /** dev/test only: a virtual clock (ms) that replaces performance.now() for frame-exact captures */
  __diceClock?: number;
}
const W = (typeof window !== "undefined" ? window : {}) as unknown as TestHooks;
const now = () =>
  typeof W.__diceClock === "number" ? W.__diceClock : performance.now();

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
  const U = (k: number) =>
    new THREE.Vector3(
      Math.cos((k * 2 * Math.PI) / 5),
      a,
      Math.sin((k * 2 * Math.PI) / 5),
    );
  const L = (k: number) =>
    new THREE.Vector3(
      Math.cos((k * 2 * Math.PI) / 5 + Math.PI / 5),
      -a,
      Math.sin((k * 2 * Math.PI) / 5 + Math.PI / 5),
    );
  const pts: THREE.Vector3[] = [];
  const kite = (
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3,
  ) => pts.push(p0, p1, p2, p0, p2, p3);
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
      return new THREE.TetrahedronGeometry(1.15).toNonIndexed();
    case 6:
      return new THREE.BoxGeometry(1.3, 1.3, 1.3).toNonIndexed();
    case 8:
      return new THREE.OctahedronGeometry(1.1).toNonIndexed();
    case 10:
      return d10Geometry();
    default:
      return new THREE.DodecahedronGeometry(1.05).toNonIndexed();
  }
}

/** Group triangles by plane, make outward winding, build a per-face basis. */
function facesOf(g: THREE.BufferGeometry): Face[] {
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const faces: Face[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < pos.count / 3; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    const n = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();
    const centroid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
    if (n.dot(centroid) < 0) {
      // make the winding face outward
      pos.setXYZ(t * 3 + 1, c.x, c.y, c.z);
      pos.setXYZ(t * 3 + 2, b.x, b.y, b.z);
      n.negate();
    }
    let f = faces.find((x) => x.normal.dot(n) > 0.995);
    if (!f) {
      f = {
        normal: n.clone(),
        center: new THREE.Vector3(),
        up: new THREE.Vector3(),
        right: new THREE.Vector3(),
        tris: [],
      };
      faces.push(f);
    }
    f.tris.push(t);
  }
  for (const f of faces) {
    const verts: THREE.Vector3[] = [];
    for (const t of f.tris)
      for (let k = 0; k < 3; k++)
        verts.push(new THREE.Vector3().fromBufferAttribute(pos, t * 3 + k));
    const uniq = verts.filter(
      (v, i) => verts.findIndex((w) => w.distanceTo(v) < 1e-4) === i,
    );
    f.center = uniq
      .reduce((s, v) => s.add(v), new THREE.Vector3())
      .divideScalar(uniq.length);
    // "up" on the face: towards the face vertex farthest from the centre (gives a consistent, nice reading angle)
    const far = uniq.reduce(
      (best, v) =>
        v.distanceTo(f.center) > best.distanceTo(f.center) ? v : best,
      uniq[0],
    );
    f.up = far.clone().sub(f.center).projectOnPlane(f.normal).normalize();
    if (f.up.lengthSq() < 0.5)
      f.up = new THREE.Vector3(0, 1, 0).projectOnPlane(f.normal).normalize();
    f.right = new THREE.Vector3().crossVectors(f.up, f.normal).normalize();
  }
  return faces;
}

if (typeof document !== "undefined")
  void document.fonts?.load?.("700 60px Cinzel").catch(() => undefined);

/**
 * Two atlases with one number per cell: the bone face (engraved ink, a soft bevel darkening toward the edges)
 * and the glow map (the bone lit, the engraving left dark), so on the reveal the die glows by outcome while
 * the number stays dark and readable.
 */
function atlases(count: number): {
  map: THREE.CanvasTexture;
  glow: THREE.CanvasTexture;
} {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cell = 128;
  const mk = () => {
    const cv = document.createElement("canvas");
    cv.width = cols * cell;
    cv.height = rows * cell;
    return cv;
  };
  const cv = mk();
  const gv = mk();
  const g = cv.getContext("2d")!;
  const e = gv.getContext("2d")!;
  e.fillStyle = "#fff";
  e.fillRect(0, 0, gv.width, gv.height);
  for (let i = 0; i < count; i++) {
    const x0 = (i % cols) * cell;
    const y0 = Math.floor(i / cols) * cell;
    const x = x0 + cell / 2;
    const y = y0 + cell / 2;
    // bone: warm ivory, lighter in the middle of the face, darker toward the edges (reads as a bevel)
    const rg = g.createRadialGradient(x - 8, y - 10, 6, x, y, cell * 0.72);
    rg.addColorStop(0, "#fbf3df");
    rg.addColorStop(0.55, "#efe2c2");
    rg.addColorStop(1, "#b49b70");
    g.fillStyle = rg;
    g.fillRect(x0, y0, cell, cell);
    const label = String(i + 1);
    const font = `700 ${count >= 10 ? 56 : 66}px Cinzel, Georgia, serif`;
    for (const ctx of [g, e]) {
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
    }
    // engraving: light lip below, dark groove, ink
    g.fillStyle = "rgba(255,250,235,0.7)";
    g.fillText(label, x + 1, y + 4.5);
    g.fillStyle = "#1c0f06";
    g.fillText(label, x, y + 2);
    g.fillStyle = "rgba(70,36,14,0.9)";
    g.fillText(label, x, y + 1);
    e.shadowColor = "#000";
    e.shadowBlur = 10;
    e.fillStyle = "#000";
    e.fillText(label, x, y + 2);
    e.fillText(label, x, y + 2);
    if (label === "6" || label === "9") {
      g.fillStyle = "#2a170a";
      g.fillRect(x - 17, y + 33, 34, 5);
      e.fillStyle = "#000";
      e.fillRect(x - 17, y + 33, 34, 5);
    }
  }
  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(cv), glow: tex(gv) };
}

interface DieModel {
  geo: THREE.BufferGeometry;
  faces: Face[];
  map: THREE.CanvasTexture;
  glow: THREE.CanvasTexture;
  /** distance from the centre to a face plane (the die rests at this height, before scaling) */
  inradius: number;
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
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  const v = new THREE.Vector3();
  faces.forEach((f, i) => {
    let R = 0;
    for (const t of f.tris)
      for (let k = 0; k < 3; k++)
        R = Math.max(
          R,
          v.fromBufferAttribute(pos, t * 3 + k).distanceTo(f.center),
        );
    const cx = (i % cols) + 0.5;
    const cy = rows - Math.floor(i / cols) - 0.5;
    const s = grade === 4 ? 0.62 : grade === 12 ? 0.78 : 0.86;
    for (const t of f.tris)
      for (let k = 0; k < 3; k++) {
        const idx = t * 3 + k;
        v.fromBufferAttribute(pos, idx).sub(f.center);
        const x = v.dot(f.right) / (2 * R);
        const y = v.dot(f.up) / (2 * R);
        uv[idx * 2] = (cx + x * s) / cols;
        uv[idx * 2 + 1] = (cy + y * s) / rows;
      }
  });
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const { map, glow } = atlases(n);
  const m: DieModel = {
    geo,
    faces,
    map,
    glow,
    inradius: faces.reduce((s, f) => s + f.center.length(), 0) / faces.length,
  };
  models.set(grade, m);
  return m;
}

/** Orientation that puts face `i` up (+Y) with its number reading upright from the camera (number-up → −Z). */
function restingQuat(face: Face, roll: number): THREE.Quaternion {
  const m = new THREE.Matrix4().makeBasis(face.right, face.up, face.normal); // face basis → columns
  const target = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 1, 0),
  );
  const rot = target.multiply(m.clone().transpose());
  const q = new THREE.Quaternion().setFromRotationMatrix(rot);
  return new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll)
    .multiply(q);
}

// ------------------------------------------------------------------ sprites drawn once
function canvasTex(
  size: number,
  draw: (g: CanvasRenderingContext2D, s: number) => void,
): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  draw(cv.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let texCache: {
  glow: THREE.CanvasTexture;
  ring: THREE.CanvasTexture;
  rays: THREE.CanvasTexture;
  spark: THREE.CanvasTexture;
} | null = null;
function textures() {
  if (texCache) return texCache;
  const glow = canvasTex(128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.25, "rgba(255,255,255,0.55)");
    r.addColorStop(0.6, "rgba(255,255,255,0.12)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });
  const ring = canvasTex(128, (g, s) => {
    const r = g.createRadialGradient(
      s / 2,
      s / 2,
      s * 0.3,
      s / 2,
      s / 2,
      s / 2,
    );
    r.addColorStop(0, "rgba(255,255,255,0)");
    r.addColorStop(0.7, "rgba(255,255,255,0.9)");
    r.addColorStop(0.82, "rgba(255,255,255,0.35)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });
  const rays = canvasTex(256, (g, s) => {
    g.translate(s / 2, s / 2);
    for (let i = 0; i < 18; i++) {
      g.rotate((Math.PI * 2) / 18);
      const w = i % 2 ? 0.05 : 0.09;
      const lg = g.createLinearGradient(0, 0, s / 2, 0);
      lg.addColorStop(0, "rgba(255,255,255,0.95)");
      lg.addColorStop(1, "rgba(255,255,255,0)");
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
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.18, "rgba(255,255,255,0.85)");
    r.addColorStop(0.45, "rgba(255,255,255,0.18)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.fillRect(s / 2 - 0.75, 4, 1.5, s - 8);
    g.fillRect(4, s / 2 - 0.75, s - 8, 1.5);
  });
  texCache = { glow, ring, rays, spark };
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
  readonly N = 260;
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
  readonly mat: THREE.ShaderMaterial;
  constructor(tex: THREE.Texture) {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage),
    );
    g.setAttribute(
      "aCol",
      new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage),
    );
    g.setAttribute(
      "aSize",
      new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PART_VERT,
      fragmentShader: PART_FRAG,
      uniforms: { uTex: { value: tex }, uPx: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  clear() {
    this.life.fill(0);
    this.col.fill(0);
  }
  emit(
    p: THREE.Vector3,
    v: THREE.Vector3,
    life: number,
    size: number,
    color: number,
    gravity = 0,
  ) {
    const i = this.next;
    this.next = (this.next + 1) % this.N;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = this.max[i] = life;
    this.s0[i] = size;
    const c = new THREE.Color(color);
    this.rgb.set([c.r, c.g, c.b], i * 3);
    this.grav[i] = gravity;
  }
  burst(
    p: THREE.Vector3,
    n: number,
    speed: number,
    life: number,
    size: number,
    color: number,
    up = 0.6,
    gravity = 4,
  ) {
    const v = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      v.set(
        Math.random() - 0.5,
        Math.random() * 0.8 - 0.2 + up,
        Math.random() - 0.5,
      )
        .normalize()
        .multiplyScalar(speed * (0.45 + Math.random() * 0.8));
      this.emit(
        p,
        v,
        life * (0.6 + Math.random() * 0.6),
        size * (0.6 + Math.random() * 0.7),
        color,
        gravity,
      );
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
      const drag = Math.exp(-2.2 * dt);
      for (let a = 0; a < 3; a++) {
        this.vel[i * 3 + a] *= drag;
        this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      }
      this.size[i] = this.s0[i] * (0.35 + 0.65 * k);
      this.col[i * 4] = this.rgb[i * 3];
      this.col[i * 4 + 1] = this.rgb[i * 3 + 1];
      this.col[i * 4 + 2] = this.rgb[i * 3 + 2];
      this.col[i * 4 + 3] = Math.min(1, k * 1.6);
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
  rim: THREE.DirectionalLight;
}
let stage: Stage | null = null;
let stageFailed = false;
function getStage(): Stage | null {
  if (stage || stageFailed) return stage;
  try {
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    // a soft studio environment so the lacquered bone has real reflections
    try {
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.55;
      pm.dispose();
    } catch {
      /* no env: still lit */
    }
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a2018, 0.9));
    const key = new THREE.DirectionalLight(0xffe2b8, 2.4);
    key.position.set(-3, 9, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.radius = 5;
    key.shadow.bias = -0.002;
    scene.add(key);
    // rim from behind: a warm edge that separates the dice from the board
    const rim = new THREE.DirectionalLight(0xffc27a, 2.2);
    rim.position.set(3, 4, -7);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0x9fb8ff, 0.5);
    fill.position.set(5, 2, 6);
    scene.add(fill);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShadowMaterial({ opacity: 0.5 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const sparkles = new Sparkles(textures().spark);
    scene.add(sparkles.points);
    stage = { renderer, scene, camera, sparkles, rim };
    return stage;
  } catch {
    stageFailed = true;
    return null;
  }
}

// ------------------------------------------------------------------ outcome look
const KIND_GLOW: Record<Kind, number> = {
  s0: 0x000000,
  s1: 0xfff0c8,
  imp: 0xffb836,
  crit: 0xffd760,
};
const KIND_SPARK: Record<Kind, number> = {
  s0: 0x8a8580,
  s1: 0xfff2d6,
  imp: 0xffc048,
  crit: 0xffe27a,
};
function kindOf(v: number): Kind {
  const r = readDie(v);
  return r.successes === 0
    ? "s0"
    : r.critico
      ? "crit"
      : r.impulso
        ? "imp"
        : "s1";
}
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const sstep = (x: number, a: number, b: number) =>
  THREE.MathUtils.smoothstep(x, a, b);
const easeOutBounce = (x: number) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};
const easeOutBack = (x: number) => {
  const c1 = 2.2;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

/**
 * The roll's timeline in nominal seconds (battle speed 1). The clock runs `1 / timeScale()` faster at higher
 * battle speeds, so every beat keeps its place.
 */
export function dicePlan(
  n: number,
  crit: boolean,
  bonus: boolean,
  reduced: boolean,
) {
  const gather = reduced ? 0.12 : 0.3;
  const toss = reduced ? 0.5 : 1.05;
  const land = gather + toss;
  const stagger = 0.16;
  const reveal = Array.from({ length: n }, (_, i) => land + 0.04 + i * stagger);
  const bonusAt = reveal[n - 1] + 0.2;
  const verdict = (bonus ? bonusAt : reveal[n - 1]) + 0.2;
  const shown = verdict + (crit ? 0.62 : 0.42);
  return {
    gather,
    toss,
    land,
    reveal,
    bonusAt,
    verdict,
    shown,
    hold: 2.4,
    leave: 0.42,
  };
}
/** Real seconds per nominal second (battle speed and the test slow-down). */
export function diceTimeScale(): number {
  const speed = Math.max(1, getSettings().animSpeed || 1);
  return Math.pow(speed, -0.72) * Math.max(0.05, W.__diceSlow ?? 1);
}

interface Layout {
  w: number;
  h: number;
  /** anchor of the dice row (fraction of the viewport) */
  ax: number;
  ay: number;
  /** on-screen size of one die (CSS px) */
  px: number;
}
const SPACING = 1.78;
function layoutFor(w: number, h: number, n: number): Layout {
  const portrait = w / h < 0.8;
  const shortLand = h <= 500 && w / h >= 1.6;
  const ax = shortLand ? 0.4 : 0.5;
  // above the result sheet that covers the bottom of an upright phone; centred higher on wide screens
  const ay = portrait ? 0.3 : shortLand ? 0.42 : 0.36;
  const base = clamp(Math.min(w, h) * (shortLand ? 0.17 : 0.2), 62, 124);
  const px = Math.min(base, (0.84 * w) / (n * SPACING + 0.3));
  return { w, h, ax, ay, px };
}

interface UiState {
  revealed: number;
  bonus: boolean;
  verdict: boolean;
  leaving: boolean;
  crit: boolean;
}

// ------------------------------------------------------------------ the roll as the HUD shows it
export function DiceBurst({ ev }: { ev: RollEvent }) {
  const host = useRef<HTMLDivElement>(null);
  const [ui, setUi] = useState<UiState>({
    revealed: 0,
    bonus: false,
    verdict: false,
    leaving: false,
    crit: false,
  });
  const [gone, setGone] = useState(false);
  const [legend] = useState(legendLeft);
  const r = ev.roll;
  const dice = r.dice.slice(0, 3);
  const n = Math.max(1, dice.length);
  const L = useMemo(
    () => layoutFor(window.innerWidth, window.innerHeight, n),
    [ev, n],
  );
  const diceSucc = dice.reduce((s, d) => s + readDie(d.value).successes, 0);
  const extra = Math.max(0, r.successes - diceSucc);
  const defense = /^Defesa/.test(ev.purpose);

  useEffect(() => {
    const reduced = getSettings().reducedMotion;
    const plan = dicePlan(n, r.critico, extra > 0, reduced);
    const f = diceTimeScale();
    const st = getStage();
    let alive = true;
    let raf = 0;
    let t0 = -1;
    let lastT = 0;
    let shownSent = false;
    let leaveAt = Infinity;
    let landed = false;
    let revealSound = false;
    let kick = 0;
    const flags: UiState = {
      revealed: 0,
      bonus: false,
      verdict: false,
      leaving: false,
      crit: false,
    };
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

    // ---------- 3D set-up
    let group: THREE.Group | null = null;
    const disposables: { dispose(): void }[] = [];
    type Item = {
      mesh: THREE.Mesh;
      mat: THREE.MeshPhysicalMaterial;
      shell: THREE.Mesh;
      shellMat: THREE.ShaderMaterial;
      halo: THREE.Sprite;
      ring: THREE.Mesh;
      kind: Kind;
      succ: number;
      scale: number;
      restY: number;
      end: THREE.Vector3;
      hover: THREE.Vector3;
      final: THREE.Quaternion;
      start: THREE.Quaternion;
      spinAxis: THREE.Vector3;
      spinTurns: number;
      delay: number;
      reveal: number;
      bounces: number;
      screen: { x: number; y: number };
    };
    let items: Item[] = [];
    let rays: THREE.Sprite | null = null;
    const el = st?.renderer.domElement;
    const tilt = new THREE.Quaternion();
    const el0 = THREE.MathUtils.degToRad(56);
    if (st && host.current && el) {
      const { renderer, scene, camera, sparkles } = st;
      el.className = "g-dice3d-canvas";
      host.current.appendChild(el);
      const { w, h } = L;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = 26;
      const D =
        h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * L.px);
      camera.position.set(0, D * Math.sin(el0), D * Math.cos(el0));
      camera.lookAt(0, 0.35, 0);
      // put the table centre at the layout anchor (not the canvas centre)
      camera.setViewOffset(w, h, (0.5 - L.ax) * w, (0.5 - L.ay) * h, w, h);
      camera.updateProjectionMatrix();
      sparkles.mat.uniforms.uPx.value =
        (h * renderer.getPixelRatio()) /
        (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      sparkles.clear();
      // the face turns toward the camera on the reveal
      tilt.setFromAxisAngle(new THREE.Vector3(1, 0, 0), el0 * 0.62);
      // how much room there is above the row for the "in hand" gather (short landscape screens have little)
      const upUnits = (L.ay * h) / L.px;
      const hk = clamp((upUnits * 0.5) / 2.4, 0.3, 0.85);
      group = new THREE.Group();
      scene.add(group);
      const T = textures();
      const spacing = SPACING;
      items = dice.map((d, i) => {
        const m = dieModel(d.grade);
        const face = m.faces[clamp(d.value - 1, 0, m.faces.length - 1)];
        const kind = kindOf(d.value);
        const mat = new THREE.MeshPhysicalMaterial({
          map: m.map,
          emissiveMap: m.glow,
          emissive: new THREE.Color(0x000000),
          emissiveIntensity: 0,
          roughness: 0.34,
          metalness: 0.02,
          clearcoat: 1,
          clearcoatRoughness: 0.18,
          sheen: 0.4,
          sheenColor: new THREE.Color(0xfff0d0),
        });
        const mesh = new THREE.Mesh(m.geo, mat);
        mesh.castShadow = true;
        const scale =
          (
            { 4: 0.8, 6: 0.74, 8: 0.8, 10: 0.86, 12: 0.82 } as Record<
              number,
              number
            >
          )[d.grade] ?? 0.8;
        mesh.scale.setScalar(scale);
        const shellMat = new THREE.ShaderMaterial({
          uniforms: {
            uColor: { value: new THREE.Color(0xffffff) },
            uI: { value: 0 },
          },
          vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
          fragmentShader: `uniform vec3 uColor; uniform float uI; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6); gl_FragColor = vec4(uColor * uI * (0.18 + f * 1.4), 1.0); }`,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
          side: THREE.BackSide,
        });
        const shell = new THREE.Mesh(m.geo, shellMat);
        shell.scale.setScalar(1.07);
        shell.visible = false;
        mesh.add(shell);
        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: T.glow,
            color: KIND_GLOW[kind] || 0x777777,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        halo.renderOrder = -1;
        halo.scale.setScalar(2.6);
        group!.add(halo);
        const ring = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({
            map: T.ring,
            color: KIND_GLOW[kind] || 0x777777,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        group!.add(ring);
        group!.add(mesh);
        disposables.push(
          mat,
          shellMat,
          halo.material,
          ring.material as THREE.Material,
          ring.geometry,
        );
        const end = new THREE.Vector3(
          (i - (n - 1) / 2) * spacing + (Math.random() - 0.5) * 0.18,
          0,
          (Math.random() - 0.5) * 0.3,
        );
        const hover = new THREE.Vector3(
          end.x * 0.45 + (Math.random() - 0.5) * 0.3,
          2.2 * hk,
          -1.3 * hk,
        );
        const restY = m.inradius * scale;
        const final = restingQuat(face, (Math.random() - 0.5) * 0.45);
        const spinAxis = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() * 0.4,
          Math.random() - 0.5,
        ).normalize();
        const start = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            Math.random() * 6,
            Math.random() * 6,
            Math.random() * 6,
          ),
        );
        return {
          mesh,
          mat,
          shell,
          shellMat,
          halo,
          ring,
          kind,
          succ: readDie(d.value).successes,
          scale,
          restY,
          end,
          hover,
          final,
          start,
          spinAxis,
          spinTurns: (reduced ? 0.6 : 2.4) + Math.random() * 1.2,
          delay: i * 0.06,
          reveal: plan.reveal[i],
          bounces: 0,
          screen: { x: 0, y: 0 },
        };
      });
      if (r.critico) {
        rays = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: T.rays,
            color: 0xffd36a,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        rays.position.set(0, 0.4, -2.6);
        rays.renderOrder = -2;
        group.add(rays);
        disposables.push(rays.material);
      }
      // compile first so the clock starts on a drawn frame (shader compiles can take a while on weak GPUs)
      try {
        renderer.compile(scene, camera);
      } catch {
        /* ignore */
      }
    }

    const tmpQ = new THREE.Quaternion();
    const tmpV = new THREE.Vector3();
    const proj = new THREE.Vector3();
    const sendShown = () => {
      if (shownSent) return;
      shownSent = true;
      const sparks: { x: number; y: number; kind: Kind }[] = [];
      if (st && items.length) {
        for (const it of items) {
          proj.copy(it.mesh.position).project(st.camera);
          it.screen = {
            x: ((proj.x + 1) / 2) * L.w,
            y: ((1 - proj.y) / 2) * L.h,
          };
          for (let k = 0; k < Math.min(3, it.succ); k++)
            sparks.push({ ...it.screen, kind: it.kind });
        }
      } else {
        // no 3D: the sparks leave from the verdict
        const x = L.ax * L.w;
        const y = L.ay * L.h;
        dice.forEach((d, i) => {
          const s = readDie(d.value).successes;
          for (let k = 0; k < Math.min(3, s); k++)
            sparks.push({
              x: x + (i - (n - 1) / 2) * 60,
              y,
              kind: kindOf(d.value),
            });
        });
      }
      window.dispatchEvent(
        new CustomEvent(DICE_SIGNAL, {
          detail: { seq: ev.seq, phase: "shown", sparks, defense },
        }),
      );
    };

    const frame = () => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const real = now();
      if (t0 < 0) t0 = real;
      const t = (real - t0) / 1000 / f; // nominal seconds
      const dt = clamp(t - lastT, 0, 0.1);
      lastT = t;

      // ---- the beats that drive the DOM verdict
      let rev = 0;
      for (let i = 0; i < n; i++) if (t >= plan.reveal[i]) rev = i + 1;
      push({
        revealed: rev,
        bonus: extra > 0 && t >= plan.bonusAt,
        verdict: t >= plan.verdict,
        crit: r.critico && t >= plan.verdict,
      });
      if (!revealSound && t >= plan.reveal[0]) {
        revealSound = true;
        audio.play(
          r.critico
            ? "dice_critical"
            : r.impulsos
              ? "dice_impulse"
              : r.successes
                ? "dice_success"
                : "dice_fail",
          { volume: r.critico ? 0.85 : 0.65 },
        );
      }
      if (!landed && t >= plan.gather + plan.toss * 0.36) {
        landed = true;
        audio.play("dice_land", { volume: 0.75 });
      }
      if (t >= plan.shown) sendShown();
      if (leaveAt === Infinity && t >= plan.shown + plan.hold) leaveAt = t;
      if (t >= leaveAt && !flags.leaving) push({ leaving: true });
      const lk =
        leaveAt === Infinity ? 0 : clamp((t - leaveAt) / plan.leave, 0, 1);
      if (lk >= 1) {
        finish();
        return;
      }

      // ---- 3D
      if (!st || !group) return;
      const { renderer, scene, camera, sparkles } = st;
      for (const it of items) {
        const tl = t - it.delay;
        const m = it.mesh;
        if (tl < plan.gather) {
          // GATHER: materialise in the hand and rattle
          const g = clamp(tl / plan.gather, 0, 1);
          m.visible = tl >= 0;
          m.scale.setScalar(it.scale * (0.2 + 0.8 * easeOutBack(g)));
          m.position
            .copy(it.hover)
            .add(
              tmpV.set(Math.sin(tl * 60) * 0.05, Math.cos(tl * 47) * 0.05, 0),
            );
          tmpQ.setFromAxisAngle(it.spinAxis, tl * 14).multiply(it.start);
          m.quaternion.copy(tmpQ);
          if (!reduced && Math.random() < 0.6)
            sparkles.emit(
              m.position,
              tmpV.set(
                (Math.random() - 0.5) * 0.6,
                Math.random() * 0.6,
                (Math.random() - 0.5) * 0.6,
              ),
              0.4,
              0.22,
              0xffe3a0,
            );
          continue;
        }
        m.visible = true;
        const k = clamp((tl - plan.gather) / plan.toss, 0, 1);
        if (k < 1) {
          // TOSS: arc onto the table, three bounces, the spin decays onto the rolled face
          m.scale.setScalar(it.scale);
          const kx = easeOutCubic(k);
          m.position.x = it.hover.x + (it.end.x - it.hover.x) * kx;
          m.position.z = it.hover.z + (it.end.z - it.hover.z) * kx;
          const b = easeOutBounce(k);
          m.position.y = it.restY + (1 - b) * (it.hover.y - it.restY) * 1.0;
          const spin = it.spinTurns * Math.PI * 2 * (1 - Math.pow(1 - k, 2.2));
          tmpQ.setFromAxisAngle(it.spinAxis, spin).multiply(it.start);
          m.quaternion.copy(tmpQ).slerp(it.final, sstep(k, 0.5, 0.97));
          // contacts: a puff of dust and a little camera kick
          const contacts = [1 / 2.75, 2 / 2.75 - 0.0, 2.5 / 2.75];
          if (
            it.bounces < contacts.length &&
            k >= contacts[it.bounces] * 0.98
          ) {
            const power = [1, 0.55, 0.3][it.bounces];
            it.bounces++;
            if (!reduced) {
              sparkles.burst(
                tmpV.copy(m.position).setY(0.05),
                Math.round(10 * power),
                1.6 * power,
                0.45,
                0.2,
                0xd9c39a,
                0.15,
                2,
              );
              kick = Math.max(kick, 0.05 * power);
            }
          }
          if (!reduced && k < 0.8) {
            sparkles.emit(
              m.position,
              tmpV.set(
                (Math.random() - 0.5) * 0.3,
                Math.random() * 0.4,
                (Math.random() - 0.5) * 0.3,
              ),
              0.5,
              0.26 * (1 - k),
              it.kind === "crit" ? 0xffd970 : 0xffe9bf,
              -0.2,
            );
          }
          continue;
        }
        // REVEAL: lift, face the camera, glow by outcome
        const rk = clamp((t - it.reveal) / 0.34, 0, 1);
        const on = t >= it.reveal;
        const ok = it.kind !== "s0";
        if (on && !it.shell.visible && ok) {
          it.shell.visible = true;
          const c = KIND_SPARK[it.kind];
          sparkles.burst(
            tmpV.copy(it.end).setY(it.restY + 0.4),
            it.kind === "crit" ? 46 : it.kind === "imp" ? 26 : 16,
            it.kind === "crit" ? 4 : 2.6,
            0.8,
            it.kind === "crit" ? 0.4 : 0.28,
            c,
            0.9,
            1.5,
          );
          if (it.kind === "crit")
            sparkles.burst(
              tmpV.copy(it.end).setY(it.restY + 0.4),
              24,
              6,
              0.6,
              0.2,
              0xffffff,
              0.5,
              3,
            );
        } else if (on && !ok && it.bounces < 9) {
          it.bounces = 9;
          sparkles.burst(
            tmpV.copy(it.end).setY(0.2),
            10,
            0.7,
            0.9,
            0.5,
            0x5e5853,
            0.4,
            -0.3,
          );
        }
        const lift = ok ? 0.48 * easeOutBack(rk) : -0.04 * rk;
        const pop = ok
          ? 1 + 0.16 * easeOutBack(rk) - 0.04 * sstep(rk, 0.6, 1)
          : 1 - 0.06 * rk;
        m.position.set(it.end.x, it.restY + lift, it.end.z);
        m.scale.setScalar(
          it.scale * pop * (1 - 0.85 * easeOutCubic(lk) * (ok ? 1 : 0.4)),
        );
        m.quaternion.copy(it.final);
        if (ok) {
          // turn the face toward the camera; a critical die also spins once on its axis
          tmpQ.identity().slerp(tilt, easeOutCubic(rk));
          m.quaternion.premultiply(tmpQ);
          if (it.kind === "crit")
            m.quaternion.premultiply(
              new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                Math.PI * 2 * easeOutCubic(rk),
              ),
            );
          const pulse = 0.82 + 0.18 * Math.sin(t * 7 + it.delay * 9);
          const gi =
            (it.kind === "crit" ? 0.75 : it.kind === "imp" ? 0.55 : 0.32) *
            sstep(rk, 0, 0.5) *
            pulse *
            (1 + 3 * lk);
          it.mat.emissive.setHex(KIND_GLOW[it.kind]);
          it.mat.emissiveIntensity = gi;
          // facing the camera, a mirror-like coat would reflect the light straight back over the ink: matte it
          it.mat.clearcoat = 1 - 0.8 * sstep(rk, 0, 0.6);
          it.mat.roughness = 0.34 + 0.2 * sstep(rk, 0, 0.6);
          if (it.kind === "crit" || it.kind === "imp") {
            it.mat.color.lerpColors(
              new THREE.Color(0xffffff),
              new THREE.Color(it.kind === "crit" ? 0xf2b640 : 0xffd27a),
              sstep(rk, 0, 0.6),
            );
            it.mat.metalness =
              it.kind === "crit" ? 0.45 * sstep(rk, 0, 0.6) : 0.02;
          }
          it.shellMat.uniforms.uColor.value.setHex(KIND_GLOW[it.kind]);
          it.shellMat.uniforms.uI.value =
            (it.kind === "crit" ? 0.85 : it.kind === "imp" ? 0.6 : 0.42) *
            sstep(rk, 0, 0.4) *
            pulse *
            (1 - lk);
          it.halo.position.set(it.end.x, it.restY + lift, it.end.z - 0.3);
          it.halo.material.opacity =
            (it.kind === "crit" ? 0.95 : it.kind === "imp" ? 0.7 : 0.45) *
            sstep(rk, 0, 0.35) *
            pulse *
            (1 - lk);
          it.halo.scale.setScalar(
            (it.kind === "crit" ? 3.6 : 2.6) * (0.7 + 0.3 * easeOutBack(rk)),
          );
          const rr = clamp((t - it.reveal) / 0.55, 0, 1);
          it.ring.position.set(it.end.x, 0.02, it.end.z);
          it.ring.scale.setScalar(0.6 + 3.2 * easeOutCubic(rr));
          (it.ring.material as THREE.MeshBasicMaterial).opacity =
            0.9 * (1 - rr) * (on ? 1 : 0);
          if (!reduced && Math.random() < (it.kind === "crit" ? 0.9 : 0.35)) {
            tmpV.set(
              it.end.x + (Math.random() - 0.5) * 0.9,
              it.restY + lift + (Math.random() - 0.3) * 0.9,
              it.end.z + (Math.random() - 0.5) * 0.5,
            );
            sparkles.emit(
              tmpV,
              new THREE.Vector3(0, 0.5 + Math.random() * 0.5, 0),
              0.6,
              0.16,
              KIND_SPARK[it.kind],
              -0.2,
            );
          }
        } else {
          // a miss: the die goes cold — grey, a shudder, a puff of ash
          it.mat.color.lerpColors(
            new THREE.Color(0xffffff),
            new THREE.Color(0x4a4542),
            sstep(rk, 0, 0.6),
          );
          it.mat.roughness = 0.34 + 0.4 * rk;
          it.mat.clearcoat = 1 - 0.8 * rk;
          it.mat.emissiveIntensity = 0;
          m.quaternion.premultiply(
            tmpQ.setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              Math.sin(rk * Math.PI * 5) * 0.09 * (1 - rk),
            ),
          );
          it.halo.material.opacity = 0;
          m.scale.multiplyScalar(1 - lk * 0.4);
        }
        // release: the successful dice flare white and collapse into the sparks the board flies to the target
        if (lk > 0 && ok) {
          it.mat.emissiveIntensity +=
            3 * Math.sin(Math.min(1, lk * 1.6) * Math.PI);
          if (!reduced && lk < 0.5 && Math.random() < 0.8)
            sparkles.burst(
              m.position,
              2,
              2,
              0.35,
              0.2,
              KIND_SPARK[it.kind],
              0.3,
              0,
            );
        }
      }
      if (rays) {
        const rk = clamp((t - plan.verdict + 0.1) / 0.5, 0, 1);
        rays.material.opacity =
          0.7 * sstep(rk, 0, 0.3) * (1 - lk) * (0.85 + 0.15 * Math.sin(t * 5));
        rays.material.rotation = t * 0.6;
        rays.scale.setScalar((n * 1.6 + 2.4) * (0.5 + 0.5 * easeOutBack(rk)));
      }
      st.rim.intensity = 2.2 + (r.critico && flags.verdict ? 1.4 : 0);
      sparkles.update(dt);
      // a tiny camera kick when the dice hit the table
      if (kick > 0 && !reduced) {
        kick = Math.max(0, kick - dt * 0.4);
        camera.setViewOffset(
          L.w,
          L.h,
          (0.5 - L.ax) * L.w + (Math.random() - 0.5) * kick * 60,
          (0.5 - L.ay) * L.h + (Math.random() - 0.5) * kick * 60,
          L.w,
          L.h,
        );
        camera.updateProjectionMatrix();
      }
      renderer.render(scene, camera);
    };

    // the board says the blow starts (or the player fast-forwards)
    const onRelease = (e: Event) => {
      const d = (e as CustomEvent<{ instant?: boolean }>).detail;
      if (d?.instant) {
        finish();
        return;
      }
      if (leaveAt === Infinity) leaveAt = Math.max(lastT, 0);
    };
    window.addEventListener(DICE_RELEASE, onRelease);
    raf = requestAnimationFrame(frame);
    // safety: whatever happens to the frames (hidden tab, lost GPU), the dice report and leave
    // (not while a test drives the virtual clock frame by frame)
    const virtual = typeof W.__diceClock === "number";
    const total = (plan.shown + plan.hold + plan.leave + 1.5) * f * 1000;
    const safety = virtual ? 0 : setTimeout(finish, total);
    const early = virtual
      ? 0
      : setTimeout(sendShown, (plan.shown + 1.2) * f * 1000);
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
        st.camera.clearViewOffset();
        for (const d of disposables) d.dispose();
        st.renderer.clear();
      }
      if (el && el.parentElement === host.current)
        host.current?.removeChild(el);
    };
  }, [ev]);

  if (gone) return null;
  const shownDice = dice.slice(0, ui.revealed);
  const count =
    shownDice.reduce((s, d) => s + readDie(d.value).successes, 0) +
    (ui.bonus ? extra : 0);
  const imp = shownDice.reduce((s, d) => s + readDie(d.value).impulso, 0);
  // honest dice: an unlikely miss says how unlikely it was
  const pMiss = r.dice.reduce((p, d) => p * Math.min(1, 2 / d.grade), 1);
  const unlucky = !r.successes && pMiss <= 0.26 ? Math.round(1 / pMiss) : 0;
  const final = ui.verdict;
  const cls = r.critico ? "crit" : r.successes ? "ok" : "no";
  const f = diceTimeScale();
  const style = {
    left: `${L.ax * 100}%`,
    top: `${L.ay * L.h + L.px * 0.82}px`,
    ["--dpx" as string]: `${L.px}px`,
    ["--f" as string]: String(f),
  } as React.CSSProperties;
  return (
    <>
      <div
        className={`g-dice-back ${ui.leaving ? "out" : ""} ${ui.crit ? "crit" : ""}`}
        style={
          {
            left: `${L.ax * 100}%`,
            top: `${L.ay * L.h}px`,
            ["--dpx" as string]: `${L.px}px`,
          } as React.CSSProperties
        }
        aria-hidden
      />
      <div
        ref={host}
        className={`g-dice3d ${ui.leaving ? "out" : ""}`}
        style={{ ["--f" as string]: String(f) } as React.CSSProperties}
        aria-hidden
      />
      {ui.crit && (
        <div
          className="g-dice-flash"
          style={
            {
              ["--x" as string]: `${L.ax * 100}%`,
              ["--y" as string]: `${L.ay * 100}%`,
            } as React.CSSProperties
          }
          aria-hidden
        />
      )}
      <div
        className={`g-dice ${cls} ${final ? "final" : ""} ${ui.leaving ? "out" : ""} ${defense ? "def" : ""}`}
        aria-live="polite"
        style={style}
      >
        <div className="cap">{ev.purpose}</div>
        <div className={`verdict ${final ? cls : ""}`}>
          {final && r.critico ? (
            <span key="crit" className="crit-word">
              CRÍTICO!
            </span>
          ) : null}
          {final && !r.successes ? (
            <span key="fail" className="fail-word">
              Falhou
            </span>
          ) : count > 0 ? (
            <span className="tally">
              <b key={count}>{count}</b>
              <span>
                {defense
                  ? `bloqueio${count > 1 ? "s" : ""}`
                  : `sucesso${count > 1 ? "s" : ""}`}
              </span>
            </span>
          ) : (
            <span className="rolling">{ui.revealed ? "…" : "rolando…"}</span>
          )}
          {imp > 0 && (
            <span key={`i${imp}`} className="imp">
              +{imp} impulso{imp > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="faces">
          {dice.map((d, i) => {
            const fc = readFace(d.value);
            return (
              <span
                key={i}
                className={`face ${fc.cls} ${i < ui.revealed ? "on" : ""}`}
              >
                <small>D{d.grade}</small>
                <b>{i < ui.revealed ? d.value : "?"}</b>
                <i>{i < ui.revealed ? fc.sym : " "}</i>
              </span>
            );
          })}
          {extra > 0 && (
            <span className={`face bonus ${ui.bonus ? "on" : ""}`}>
              <small>bônus</small>
              <b>+{extra}</b>
              <i>✓</i>
            </span>
          )}
        </div>
        {final && unlucky > 0 && (
          <div className="luck">Azar: só 1 em {unlucky} erraria</div>
        )}
        {final && legend && (
          <div className="legend">
            1–2 erra · 3–5 ✓ · 6–8 ✓✦ · 9–11 ✓✓✦ · 12 ✹
          </div>
        )}
      </div>
    </>
  );
}

/** What a die face means (the universal table): ✗ nothing, ✓ success, ✦ impulse, ✹ critical. */
function readFace(v: number): { sym: string; cls: string } {
  if (v <= 2) return { sym: "✗", cls: "f0" };
  if (v <= 5) return { sym: "✓", cls: "f1" };
  if (v <= 8) return { sym: "✓✦", cls: "f2" };
  if (v <= 11) return { sym: "✓✓✦", cls: "f3" };
  return { sym: "✹", cls: "f4" };
}
/** The face legend shows on the first rolls only (it teaches, then gets out of the way). */
let legendShown = -1;
function legendLeft(): boolean {
  try {
    if (legendShown < 0)
      legendShown = Number(localStorage.getItem("mosteiro.diceLegend") ?? 0);
    if (legendShown >= 6) return false;
    legendShown++;
    localStorage.setItem("mosteiro.diceLegend", String(legendShown));
    return true;
  } catch {
    return false;
  }
}
