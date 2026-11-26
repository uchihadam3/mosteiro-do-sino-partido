/**
 * Real 3D dice for every roll: true polyhedra (d4 tetrahedron, d6 cube, d8 octahedron, d10 pentagonal
 * trapezohedron, d12 dodecahedron) with engraved numbers, tossed onto an invisible table with real shadows,
 * tumbling and settling on the exact face the rules engine rolled. The result face then lights up by outcome.
 * A small dedicated WebGL canvas, rendered only while dice are moving.
 */
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { readDie, type DomainEvent } from '@mosteiro/core';
import { getSettings } from '../../state/settings';

type RollEvent = Extract<DomainEvent, { type: 'roll' }>;

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
      // make the winding face outward
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
    // "up" on the face: towards the face vertex farthest from the centre (gives a consistent, nice reading angle)
    const far = uniq.reduce((best, v) => (v.distanceTo(f.center) > best.distanceTo(f.center) ? v : best), uniq[0]);
    f.up = far.clone().sub(f.center).projectOnPlane(f.normal).normalize();
    if (f.up.lengthSq() < 0.5) f.up = new THREE.Vector3(0, 1, 0).projectOnPlane(f.normal).normalize();
    f.right = new THREE.Vector3().crossVectors(f.up, f.normal).normalize();
  }
  return faces;
}

/** Canvas atlas with one engraved number per cell. */
function atlas(count: number, ink: string, paper: string): THREE.CanvasTexture {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cell = 128;
  const cv = document.createElement('canvas');
  cv.width = cols * cell;
  cv.height = rows * cell;
  const g = cv.getContext('2d')!;
  g.fillStyle = paper;
  g.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < count; i++) {
    const x = (i % cols) * cell + cell / 2;
    const y = Math.floor(i / cols) * cell + cell / 2;
    const label = String(i + 1);
    g.font = `700 ${count >= 10 ? 52 : 62}px Cinzel, Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // engraving: dark groove + light lip
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillText(label, x + 1.5, y + 3.5);
    g.fillStyle = ink;
    g.fillText(label, x, y + 2);
    if (label === '6' || label === '9') {
      g.fillRect(x - 16, y + 30, 32, 5);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

interface DieModel {
  geo: THREE.BufferGeometry;
  faces: Face[];
  tex: THREE.CanvasTexture;
  cols: number;
  rows: number;
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
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const m: DieModel = { geo, faces, tex: atlas(n, '#3a2410', '#efe3c6'), cols, rows };
  models.set(grade, m);
  return m;
}

/** Orientation that puts face `i` up (+Y) with its number reading upright from the camera (number-up → −Z). */
function restingQuat(face: Face, roll: number): THREE.Quaternion {
  const m = new THREE.Matrix4().makeBasis(face.right, face.up, face.normal); // face basis → columns
  const target = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0));
  const rot = target.multiply(m.clone().transpose());
  const q = new THREE.Quaternion().setFromRotationMatrix(rot);
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll).multiply(q);
}

// ------------------------------------------------------------------ one shared little renderer
interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  ground: THREE.Mesh;
}
let stage: Stage | null = null;
function getStage(): Stage | null {
  if (stage) return stage;
  try {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    camera.position.set(0, 9.5, 7.2);
    camera.lookAt(0, 0, 0.4);
    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a2018, 1.25));
    const key = new THREE.DirectionalLight(0xffe2b8, 2.6);
    key.position.set(-3, 9, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 0.8);
    rim.position.set(4, 3, -5);
    scene.add(rim);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.45 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    stage = { renderer, scene, camera, ground };
    return stage;
  } catch {
    return null;
  }
}

const OUTCOME_GLOW: Record<string, number> = { s0: 0x000000, s1: 0xfff2d0, imp: 0xffc048, crit: 0xffe070 };
const easeOutBounce = (x: number) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};

/** The dice roll overlay. Calls onSettled when every die has landed. */
export function Dice3D({ ev, onSettled }: { ev: RollEvent; onSettled?(): void }) {
  const host = useRef<HTMLDivElement>(null);
  const [ok, setOk] = useState(true);
  useEffect(() => {
    const st = getStage();
    if (!st || !host.current) {
      setOk(false);
      onSettled?.();
      return;
    }
    const { renderer, scene, camera } = st;
    const el = renderer.domElement;
    el.className = 'g-dice3d-canvas';
    host.current.appendChild(el);
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the dice a similar size on phones held upright and on wide screens
    camera.fov = w / h < 0.8 ? 44 : 30;
    camera.updateProjectionMatrix();

    const speed = Math.max(1, getSettings().animSpeed || 1);
    // dev/test only: window.__diceSlow = 4 plays the roll 4× slower so it can be inspected
    const slow = (window as unknown as { __diceSlow?: number }).__diceSlow ?? 1;
    const dur = (1.15 / Math.min(speed, 2)) * slow;
    const dice = ev.roll.dice.slice(0, 3);
    const n = dice.length;
    const spacing = n > 1 ? 1.45 : 0;
    const group = new THREE.Group();
    scene.add(group);
    const items = dice.map((d, i) => {
      const m = dieModel(d.grade);
      const face = m.faces[Math.max(0, Math.min(m.faces.length - 1, d.value - 1))];
      const read = readDie(d.value);
      const kind = d.value <= 2 ? 's0' : read.critico ? 'crit' : read.impulso ? 'imp' : 's1';
      const mat = new THREE.MeshStandardMaterial({ map: m.tex, roughness: 0.38, metalness: 0.05, emissive: new THREE.Color(0x000000), emissiveIntensity: 0 });
      const mesh = new THREE.Mesh(m.geo, mat);
      mesh.castShadow = true;
      const scale = (d.grade === 4 ? 0.95 : d.grade === 12 ? 0.92 : 0.88) * 0.6;
      mesh.scale.setScalar(scale);
      group.add(mesh);
      const endX = (i - (n - 1) / 2) * spacing + (Math.random() - 0.5) * 0.3;
      const endZ = 0.6 + (Math.random() - 0.5) * 0.4;
      // tossed from the far side of the table toward the player
      const startX = endX + (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.2);
      const startZ = endZ - 5.2;
      const restY = scale * (d.grade === 4 ? 0.38 : d.grade === 6 ? 0.65 : d.grade === 8 ? 0.62 : d.grade === 10 ? 0.6 : 0.82);
      const final = restingQuat(face, (Math.random() - 0.5) * 0.5);
      const spinAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const spinTurns = 2.2 + Math.random() * 1.4;
      const start = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      return { mesh, mat, kind, endX, endZ, startX, startZ, restY, final, spinAxis, spinTurns, start, delay: i * 0.07 };
    });

    let t0 = performance.now();
    let raf = 0;
    let settled = false;
    const tmpQ = new THREE.Quaternion();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const t = (performance.now() - t0) / 1000;
      let allDone = true;
      for (const it of items) {
        const k = Math.min(1, Math.max(0, (t - it.delay) / dur));
        if (k < 1) allDone = false;
        const kx = 1 - Math.pow(1 - k, 3);
        it.mesh.position.x = it.startX + (it.endX - it.startX) * kx;
        it.mesh.position.z = it.startZ + (it.endZ - it.startZ) * kx;
        // drop from above and bounce on the table
        it.mesh.position.y = it.restY + (1 - easeOutBounce(k)) * 1.8;
        // tumble, then settle onto the rolled face
        const spin = it.spinTurns * Math.PI * 2 * (1 - Math.pow(1 - k, 2));
        tmpQ.setFromAxisAngle(it.spinAxis, spin).multiply(it.start);
        const settle = THREE.MathUtils.smoothstep(k, 0.55, 0.98);
        it.mesh.quaternion.copy(tmpQ).slerp(it.final, settle);
        if (k >= 1) {
          const glow = Math.min(1, (t - it.delay - dur) / 0.25);
          it.mat.emissive.setHex(OUTCOME_GLOW[it.kind]);
          it.mat.emissiveIntensity = it.kind === 's0' ? 0 : (it.kind === 'crit' ? 0.85 : it.kind === 'imp' ? 0.55 : 0.28) * glow;
          if (it.kind === 's0') it.mat.color.setHex(0x8a8580);
        }
      }
      renderer.render(scene, camera);
      if (allDone && !settled) {
        settled = true;
        onSettled?.();
      }
      // keep the settled dice on screen a moment, then stop rendering
      if (allDone && t > dur + 1.4 * slow) cancelAnimationFrame(raf);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      scene.remove(group);
      for (const it of items) it.mat.dispose();
      renderer.clear();
      if (el.parentElement === host.current) host.current?.removeChild(el);
      t0 = 0;
    };
  }, [ev]);
  if (!ok) return null;
  return <div ref={host} className="g-dice3d" aria-hidden />;
}

// ------------------------------------------------------------------ the roll as the HUD shows it: 3D dice, then the verdict
export function DiceBurst({ ev }: { ev: Extract<DomainEvent, { type: 'roll' }> }) {
  const [settled, setSettled] = useState(false);
  const [gone, setGone] = useState(false);
  const [legend] = useState(legendLeft);
  const slow = (window as unknown as { __diceSlow?: number }).__diceSlow ?? 1;
  useEffect(() => {
    if (!settled) return;
    const t = setTimeout(() => setGone(true), 1600 * slow);
    return () => clearTimeout(t);
  }, [settled]);
  useEffect(() => {
    // safety: never keep the dice up for long
    const t = setTimeout(() => setGone(true), 4000 * slow);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  const r = ev.roll;
  // honest dice: an unlikely miss says how unlikely it was
  const pMiss = r.dice.reduce((p, d) => p * Math.min(1, 2 / d.grade), 1);
  const unlucky = !r.successes && pMiss <= 0.26 ? Math.round(1 / pMiss) : 0;
  return (
    <>
      <Dice3D ev={ev} onSettled={() => setSettled(true)} />
      {settled && (
        <div className="g-dice" aria-live="polite" style={slow !== 1 ? { animationDuration: `${1.6 * slow}s` } : undefined}>
          <div className={`verdict ${r.critico ? 'crit' : r.successes ? 'ok' : 'no'}`}>
            {r.critico ? 'CRÍTICO!' : r.successes ? `${r.successes} sucesso${r.successes > 1 ? 's' : ''}` : 'Falhou'}
            {r.impulsos > 0 && <span className="imp">+{r.impulsos} impulso{r.impulsos > 1 ? 's' : ''}</span>}
          </div>
          <div className="faces">
            {r.dice.map((d, i) => {
              const f = readFace(d.value);
              return (
                <span key={i} className={`face ${f.cls}`}>
                  <small>D{d.grade}</small>
                  <b>{d.value}</b>
                  <i>{f.sym}</i>
                </span>
              );
            })}
          </div>
          {unlucky > 0 && <div className="luck">Azar: só 1 em {unlucky} erraria</div>}
          {legend && <div className="legend">1–2 erra · 3–5 ✓ · 6–8 ✓✦ · 9–11 ✓✓✦ · 12 ✹</div>}
        </div>
      )}
    </>
  );
}

/** What a die face means (the universal table): ✗ nothing, ✓ success, ✦ impulse, ✹ critical. */
function readFace(v: number): { sym: string; cls: string } {
  if (v <= 2) return { sym: '✗', cls: 'f0' };
  if (v <= 5) return { sym: '✓', cls: 'f1' };
  if (v <= 8) return { sym: '✓✦', cls: 'f2' };
  if (v <= 11) return { sym: '✓✓✦', cls: 'f3' };
  return { sym: '✹', cls: 'f4' };
}
/** The face legend shows on the first rolls only (it teaches, then gets out of the way). */
let legendShown = -1;
function legendLeft(): boolean {
  try {
    if (legendShown < 0) legendShown = Number(localStorage.getItem('mosteiro.diceLegend') ?? 0);
    if (legendShown >= 6) return false;
    legendShown++;
    localStorage.setItem('mosteiro.diceLegend', String(legendShown));
    return true;
  } catch {
    return false;
  }
}
