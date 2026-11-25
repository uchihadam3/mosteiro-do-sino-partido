/**
 * Small, allocation-free effects for the world: pooled dust/glint particles, generated glow textures and the
 * glowing floor trail that shows the way. One draw call per pool.
 */
import * as THREE from 'three';

// ------------------------------------------------------------------ generated textures (made once)
const texCache = new Map<string, THREE.Texture>();
function canvasTex(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, w = size, h = size): THREE.Texture {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g, size);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  texCache.set(key, t);
  return t;
}
export const TEX = {
  /** soft round dot */
  dot: () =>
    canvasTex('dot', 64, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, s, s);
    }),
  /** soft disc used for light pools on the floor */
  pool: () =>
    canvasTex('pool', 128, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(255,255,255,0.9)');
      r.addColorStop(0.3, 'rgba(255,255,255,0.45)');
      r.addColorStop(0.7, 'rgba(255,255,255,0.1)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, s, s);
    }),
  /** thin glowing ring (leader marker, tap marker) */
  ring: () =>
    canvasTex('ring', 128, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(255,255,255,0)');
      r.addColorStop(0.55, 'rgba(255,255,255,0.15)');
      r.addColorStop(0.78, 'rgba(255,255,255,1)');
      r.addColorStop(0.86, 'rgba(255,255,255,0.35)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, s, s);
    }),
  /** chevron pointing +Y in texture space (trail) */
  chevron: () =>
    canvasTex('chev', 64, (g, s) => {
      g.shadowColor = 'rgba(255,255,255,0.9)';
      g.shadowBlur = s * 0.12;
      g.strokeStyle = 'rgba(255,255,255,1)';
      g.lineWidth = s * 0.13;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(s * 0.22, s * 0.66);
      g.lineTo(s * 0.5, s * 0.36);
      g.lineTo(s * 0.78, s * 0.66);
      g.stroke();
    }),
  /** vertical glow seen through an open doorway (light from beyond) */
  portal: () =>
    canvasTex(
      'portal',
      64,
      (g) => {
        const w = 64;
        const h = 128;
        const lin = g.createLinearGradient(0, h, 0, 0);
        lin.addColorStop(0, 'rgba(255,255,255,0.95)');
        lin.addColorStop(0.45, 'rgba(255,255,255,0.55)');
        lin.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = lin;
        g.fillRect(0, 0, w, h);
        // soften the sides
        g.globalCompositeOperation = 'destination-in';
        const side = g.createLinearGradient(0, 0, w, 0);
        side.addColorStop(0, 'rgba(0,0,0,0)');
        side.addColorStop(0.25, 'rgba(0,0,0,1)');
        side.addColorStop(0.75, 'rgba(0,0,0,1)');
        side.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = side;
        g.fillRect(0, 0, w, h);
      },
      64,
      128,
    ),
  /** dark vertical gradient that reads as depth inside a passage */
  void: () =>
    canvasTex(
      'void',
      64,
      (g) => {
        const w = 64;
        const h = 128;
        const r = g.createRadialGradient(w / 2, h * 0.75, 4, w / 2, h * 0.6, h * 0.7);
        r.addColorStop(0, 'rgba(0,0,0,1)');
        r.addColorStop(0.7, 'rgba(0,0,0,0.92)');
        r.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, w, h);
      },
      64,
      128,
    ),
};

// ------------------------------------------------------------------ particle pool
const VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(vColor.rgb * t.rgb, t.a * vColor.a);
  if (gl_FragColor.a < 0.01) discard;
}`;

export class Particles {
  points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private size0: Float32Array;
  private size1: Float32Array;
  private col: Float32Array;
  private alpha: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private cursor = 0;
  private aPos: THREE.BufferAttribute;
  private aSize: THREE.BufferAttribute;
  private aCol: THREE.BufferAttribute;
  private live = 0;
  constructor(cap: number, additive: boolean) {
    this.n = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.size0 = new Float32Array(cap);
    this.size1 = new Float32Array(cap);
    this.col = new Float32Array(cap * 4);
    this.alpha = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aColor', this.aCol);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTex: { value: TEX.dot() }, uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }
  setScale(pxHeight: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = pxHeight * 0.55;
  }
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, color: THREE.Color, alpha: number, grav = 0, drag = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = this.max[i] = life;
    this.size0[i] = s0;
    this.size1[i] = s1;
    this.col[i * 4] = color.r;
    this.col[i * 4 + 1] = color.g;
    this.col[i * 4 + 2] = color.b;
    this.alpha[i] = alpha;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.live = Math.max(this.live, 1);
  }
  update(dt: number) {
    if (!this.live) return;
    let alive = 0;
    const P = this.aPos.array as Float32Array;
    const S = this.aSize.array as Float32Array;
    const C = this.aCol.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        if (C[i * 4 + 3] !== 0) C[i * 4 + 3] = 0;
        continue;
      }
      alive++;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      P[i * 3] = this.pos[i * 3];
      P[i * 3 + 1] = this.pos[i * 3 + 1];
      P[i * 3 + 2] = this.pos[i * 3 + 2];
      S[i] = this.size1[i] + (this.size0[i] - this.size1[i]) * k;
      C[i * 4] = this.col[i * 4];
      C[i * 4 + 1] = this.col[i * 4 + 1];
      C[i * 4 + 2] = this.col[i * 4 + 2];
      C[i * 4 + 3] = this.alpha[i] * Math.min(1, k * 2.2) * Math.min(1, (1 - k) * 8 + 0.2);
    }
    this.live = alive;
    this.aPos.needsUpdate = this.aSize.needsUpdate = this.aCol.needsUpdate = true;
  }
  clear() {
    this.life.fill(0);
    (this.aCol.array as Float32Array).fill(0);
    this.aCol.needsUpdate = true;
    this.live = 0;
  }
  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

// ------------------------------------------------------------------ glowing trail of chevrons
const TRAIL_MAX = 48;
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();
export class Trail {
  mesh: THREE.InstancedMesh;
  private pts: { x: number; z: number; yaw: number; d: number }[] = [];
  private color = new THREE.Color(0xffd27a);
  opacity = 0;
  target = 0;
  constructor() {
    const geo = new THREE.PlaneGeometry(0.62, 0.62);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: TEX.chevron(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, TRAIL_MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    for (let i = 0; i < TRAIL_MAX; i++) this.mesh.setColorAt(i, tmpC.setRGB(0, 0, 0));
  }
  /** Set the polylines to follow (each from the leader towards a goal). */
  setPaths(paths: THREE.Vector3[][], color: THREE.ColorRepresentation) {
    this.color.set(color);
    this.pts.length = 0;
    for (const path of paths) {
      let d = 0;
      let carry = 1.0; // start a little ahead of the leader
      for (let i = 0; i + 1 < path.length && this.pts.length < TRAIL_MAX; i++) {
        const a = path[i];
        const b = path[i + 1];
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        if (L < 1e-3) continue;
        const yaw = Math.atan2(b.x - a.x, b.z - a.z);
        let s = carry;
        while (s < L && this.pts.length < TRAIL_MAX) {
          const k = s / L;
          this.pts.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw, d: d + s });
          s += 0.85;
        }
        carry = s - L;
        d += L;
      }
      // fade out the last chevrons near the goal
      const total = d;
      for (const p of this.pts) if (total - p.d < 1.2) p.d = -1;
    }
    this.mesh.count = this.pts.length;
  }
  update(t: number, dt: number) {
    this.opacity += (this.target - this.opacity) * Math.min(1, dt * 3);
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = this.opacity;
    this.mesh.visible = this.opacity > 0.02 && this.pts.length > 0;
    if (!this.mesh.visible) return;
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      const wave = Math.pow(Math.max(0, Math.sin(t * 3.2 - (p.d < 0 ? 0 : p.d) * 0.9)), 3);
      const b = p.d < 0 ? 0.08 : 0.22 + 0.78 * wave;
      tmpP.set(p.x, 0.04, p.z);
      tmpQ.setFromEuler(tmpE.set(0, p.yaw + Math.PI, 0));
      const sc = 0.8 + wave * 0.25;
      tmpS.set(sc, 1, sc);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(i, tmpM);
      this.mesh.setColorAt(i, tmpC.copy(this.color).multiplyScalar(b));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
