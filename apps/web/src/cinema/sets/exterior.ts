/**
 * The opening's night exterior: the monastery on its crag under a storm sky, the bell tower with the cracked bell
 * glowing in the belfry, the pilgrims' path climbing to the gate, rain, mist and embers. Built procedurally in the
 * low-poly style of the KayKit figures (flat-shaded stone, warm windows, cold moonlight).
 * Coordinates: the gate of the forecourt is at z≈+2, the church portal at z=−6; the path climbs from the valley (+z).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { own } from '../engine/stage';
import { crackedBell, embers, fogCard, glowSprite, rain, type Bell, type Embers, type Rain } from './props';

export interface Exterior {
  group: THREE.Group;
  bell: Bell;
  rain: Rain;
  bellEmbers: Embers;
  gateEmbers: Embers[];
  /** World position of the bell's pivot (top). */
  bellTop: THREE.Vector3;
  /** Church portal (door) centre on the ground. */
  portal: THREE.Vector3;
  /** Point on the pilgrims' path, u = 0 (valley) … 1 (portal porch). */
  path(u: number): THREE.Vector3;
  /** Unit tangent of the path at u (pointing up the path). */
  tangent(u: number): THREE.Vector3;
  /** Path length in world units. */
  length: number;
  /** Ground height. */
  heightAt(x: number, z: number): number;
  /** Lightning flash. */
  strike(strength?: number): void;
  /** The church door swings open: 0 = shut (dark), 1 = open (warm light pours out). */
  openDoor(k: number): void;
  update(dt: number, t: number, cam: THREE.Vector3, pixelH: number): void;
}

const TOWER = new THREE.Vector3(8.5, 0, -18);
const BELFRY_Y = 24;

// ------------------------------------------------------------------ helpers
type Parts = Map<THREE.Material, THREE.BufferGeometry[]>;
function put(parts: Parts, mat: THREE.Material, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  const ng = g.index ? g.toNonIndexed() : g;
  if (!ng.getAttribute('uv')) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.getAttribute('position').count * 2), 2));
  for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
  let l = parts.get(mat);
  if (!l) parts.set(mat, (l = []));
  l.push(ng);
}
function box(parts: Parts, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
  put(parts, mat, new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, ry);
}
function pyramid(parts: Parts, mat: THREE.Material, base: number, h: number, x: number, y: number, z: number) {
  const g = new THREE.ConeGeometry(base * Math.SQRT1_2, h, 4, 1);
  g.rotateY(Math.PI / 4);
  put(parts, mat, g, x, y + h / 2, z);
}
/** Gable roof prism: width across (x), rise, length along z. */
function gable(parts: Parts, mat: THREE.Material, w: number, rise: number, len: number, x: number, y: number, z: number, ry = 0, over = 0.35) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 - over, 0);
  s.lineTo(w / 2 + over, 0);
  s.lineTo(0, rise);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  put(parts, mat, g, x, y, z, ry);
}
function lancetShape(w: number, h: number, cx = 0, cy = 0): THREE.Shape | THREE.Path {
  const s = new THREE.Shape();
  const r = w * 0.9;
  const spring = h - Math.sqrt(r * r - (r - w / 2) * (r - w / 2));
  s.moveTo(cx - w / 2, cy);
  s.lineTo(cx + w / 2, cy);
  s.lineTo(cx + w / 2, cy + spring);
  s.absarc(cx + w / 2 - r, cy + spring, r, 0, Math.acos((r - w / 2) / r), false);
  s.absarc(cx - w / 2 + r, cy + spring, r, Math.PI - Math.acos((r - w / 2) / r), Math.PI, false);
  s.lineTo(cx - w / 2, cy);
  return s;
}
function lancet(parts: Parts, mat: THREE.Material, w: number, h: number, x: number, y: number, z: number, ry = 0) {
  const g = new THREE.ShapeGeometry(lancetShape(w, h) as THREE.Shape, 6);
  put(parts, mat, g, x, y, z, ry);
}
/** A wall with a pointed-arch opening, extruded `t` thick, base at y. Faces +Z before rotation. */
function archWall(parts: Parts, mat: THREE.Material, w: number, h: number, t: number, ow: number, oh: number, x: number, y: number, z: number, ry = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.lineTo(-w / 2, h);
  s.closePath();
  const hole = new THREE.Path();
  const r = ow * 0.9;
  const spring = oh - Math.sqrt(r * r - (r - ow / 2) * (r - ow / 2));
  const a = Math.acos((r - ow / 2) / r);
  hole.moveTo(-ow / 2, 0.001);
  hole.lineTo(ow / 2, 0.001);
  hole.lineTo(ow / 2, spring);
  hole.absarc(ow / 2 - r, spring, r, 0, a, false);
  hole.absarc(-ow / 2 + r, spring, r, Math.PI - a, Math.PI, false);
  hole.lineTo(-ow / 2, 0.001);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -t / 2);
  put(parts, mat, g, x, y, z, ry);
}
function merge(parts: Parts, group: THREE.Group, shadows = false) {
  for (const [mat, list] of parts) {
    const g = mergeGeometries(list, false);
    if (!g) continue;
    own(g);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    group.add(m);
  }
}
const smooth = (a: number, b: number, x: number) => {
  const k = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ------------------------------------------------------------------ sky
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = /* glsl */ `
uniform float uTime; uniform float uFlash; uniform vec3 uMoon; uniform vec3 uEmber;
varying vec3 vDir;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zen = vec3(0.003, 0.005, 0.014);
  vec3 hor = vec3(0.03, 0.034, 0.052);
  vec3 col = mix(hor, zen, smoothstep(-0.02, 0.55, h));
  // distant glow of the valley on the horizon
  col += vec3(0.03, 0.018, 0.012) * (1.0 - smoothstep(-0.05, 0.18, h));
  // storm clouds
  vec2 uv = d.xz / max(0.08, h + 0.22) * 1.25 + vec2(uTime * 0.018, uTime * 0.006);
  float c = fbm(uv);
  float c2 = fbm(uv * 2.2 + 4.0 + uTime * 0.01);
  float cl = smoothstep(0.38, 0.78, c * 0.75 + c2 * 0.35);
  float m = max(0.0, dot(d, uMoon));
  float glowM = pow(m, 90.0) * 0.7 + pow(m, 12.0) * 0.14 + pow(m, 3.0) * 0.025;
  vec3 cloudDark = vec3(0.011, 0.012, 0.019);
  vec3 cloudLit = vec3(0.085, 0.11, 0.18);
  vec3 cloud = mix(cloudDark, cloudLit, clamp(glowM * 2.2 + c2 * 0.18, 0.0, 1.0));
  // silver lining at the cloud edges near the moon
  float edge = smoothstep(0.25, 0.55, cl) * (1.0 - smoothstep(0.55, 0.95, cl));
  cloud += vec3(0.5, 0.58, 0.8) * edge * pow(m, 18.0) * 0.8;
  col = mix(col, cloud, cl * smoothstep(-0.06, 0.1, h));
  float disc = smoothstep(0.99955, 0.99975, m);
  col += vec3(0.8, 0.86, 1.0) * (disc * (1.0 - cl * 0.92) * 1.6 + glowM * (1.0 - cl * 0.7));
  // lightning lights the clouds from inside
  col += vec3(0.55, 0.62, 0.85) * uFlash * (0.15 + cl * 1.3);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------------ build
export function buildExterior(quality: 'low' | 'medium' | 'high'): Exterior {
  const group = new THREE.Group();
  group.name = 'set:exterior';

  // ---- sky dome (follows the camera)
  const skyMat = own(
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFlash: { value: 0 }, uMoon: { value: new THREE.Vector3(-0.42, 0.42, -0.8).normalize() }, uEmber: { value: new THREE.Vector3(0.12, 0.3, -0.95).normalize() } },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  const sky = new THREE.Mesh(own(new THREE.SphereGeometry(80, 40, 20)), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  group.add(sky);

  // ---- pilgrims' path (valley → forecourt gate → portal porch)
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(19, 0, 74),
    new THREE.Vector3(14, 0, 56),
    new THREE.Vector3(9.5, 0, 40),
    new THREE.Vector3(6, 0, 27),
    new THREE.Vector3(2.4, 0, 15),
    new THREE.Vector3(0.4, 0, 6),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -3.6),
  ]);
  const samples = curve.getSpacedPoints(220);
  const rampY = (z: number) => (z < 3 ? 0 : -Math.pow((z - 3) / 70, 1.15) * 13);
  const nearestPath = (x: number, z: number) => {
    let best = 1e9;
    let bz = 0;
    for (const p of samples) {
      const dd = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (dd < best) {
        best = dd;
        bz = p.z;
      }
    }
    return { d: Math.sqrt(best), z: bz };
  };
  const heightAt = (x: number, z: number) => {
    const dz = z + 12;
    const r = Math.hypot(x * 0.82, dz * 0.95);
    let y = r < 22 ? 0 : -Math.pow(r - 22, 1.22) * 1.05;
    const np = nearestPath(x, z);
    const w = smooth(13, 3.5, np.d) * smooth(-4, 6, z);
    y = y + (rampY(np.z) - y) * w;
    y = Math.max(y, -16 - vnoise(x * 0.05, z * 0.05) * 4);
    const far = smooth(4, 30, np.d) * smooth(18, 26, r);
    y += (vnoise(x * 0.22, z * 0.22) - 0.5) * (0.5 + far * 3.2) + (vnoise(x * 0.6, z * 0.6) - 0.5) * 0.35;
    // a crag that rises under the monastery's north side
    y += smooth(26, 14, Math.hypot(x + 4, z + 30)) * 2;
    return y;
  };
  const pathY = (p: THREE.Vector3) => {
    const np = nearestPath(p.x, p.z);
    return rampY(np.z) + 0.02;
  };

  // ---- terrain
  {
    const seg = quality === 'low' ? 80 : 120;
    const g = own(new THREE.PlaneGeometry(220, 220, seg, seg));
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, 20);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const rock = new THREE.Color(0x2b2a30);
    const moss = new THREE.Color(0x24291f);
    const mud = new THREE.Color(0x4a4036);
    const plateau = new THREE.Color(0x3b3833);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = heightAt(x, z);
      pos.setY(i, y);
      const np = nearestPath(x, z);
      c.copy(rock).lerp(moss, vnoise(x * 0.15, z * 0.15) * 0.7);
      if (Math.hypot(x * 0.82, (z + 12) * 0.95) < 22) c.lerp(plateau, 0.6);
      c.lerp(mud, smooth(2.2, 0.6, np.d) * 0.85);
      c.multiplyScalar(0.8 + hash(x, z) * 0.35);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const flatG = own(g.toNonIndexed());
    flatG.computeVertexNormals();
    const m = new THREE.Mesh(flatG, own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02, flatShading: true })));
    m.receiveShadow = true;
    group.add(m);
    // wet path sheen: a slightly glossy ribbon on the trail
    const ribbon: number[] = [];
    const idx: number[] = [];
    const pts = curve.getSpacedPoints(120);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const tan = curve.getTangentAt(Math.min(1, i / (pts.length - 1)));
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      for (const s of [-1, 1]) {
        const q = p.clone().addScaledVector(side, s * (1.05 + hash(i, s) * 0.3));
        ribbon.push(q.x, heightAt(q.x, q.z) + 0.035, q.z);
      }
      if (i < pts.length - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const rg = own(new THREE.BufferGeometry());
    rg.setAttribute('position', new THREE.Float32BufferAttribute(ribbon, 3));
    rg.setIndex(idx);
    rg.computeVertexNormals();
    const wet = new THREE.Mesh(rg, own(new THREE.MeshStandardMaterial({ color: 0x221e1b, roughness: 0.62, metalness: 0.05 })));
    wet.receiveShadow = true;
    group.add(wet);
  }

  // ---- materials
  const stone = own(new THREE.MeshStandardMaterial({ color: 0x5b5864, roughness: 0.88, metalness: 0.02, flatShading: true }));
  const stoneDark = own(new THREE.MeshStandardMaterial({ color: 0x3d3b44, roughness: 0.9, flatShading: true }));
  const roof = own(new THREE.MeshStandardMaterial({ color: 0x2a2731, roughness: 0.5, metalness: 0.25, flatShading: true }));
  const wood = own(new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.8, flatShading: true }));
  const voidMat = own(new THREE.MeshBasicMaterial({ color: 0x050407 }));
  voidMat.toneMapped = false;
  const win = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.72, 0.26), fog: false, side: THREE.DoubleSide }));
  win.toneMapped = false;
  const winDim = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.24, 0.08), fog: true, side: THREE.DoubleSide }));
  winDim.toneMapped = false;

  const parts: Parts = new Map();
  // ---- forecourt wall + gate (z = +2)
  for (const sx of [-1, 1]) {
    box(parts, stone, 7.4, 3.4, 0.9, sx * 6.3, 0, 2);
    box(parts, stone, 0.9, 3.4, 8.4, sx * 10, 0, -2.2);
    box(parts, stoneDark, 7.6, 0.35, 1.1, sx * 6.3, 3.4, 2);
    box(parts, stone, 1.3, 4.6, 1.3, sx * 2.45, 0, 2);
    pyramid(parts, roof, 1.5, 1.1, sx * 2.45, 4.6, 2);
    for (let i = 0; i < 3; i++) box(parts, stoneDark, 0.6, 0.45, 1, sx * (3.6 + i * 2.2), 3.75, 2);
  }
  // ---- nave
  box(parts, stone, 9.2, 10, 20, 0, 0, -16);
  gable(parts, roof, 9.2, 5.5, 20.6, 0, 10, -16);
  // aisles with lean-to roofs
  for (const sx of [-1, 1]) {
    box(parts, stone, 2.6, 6, 18, sx * 5.9, 0, -16.5);
    const lean = new THREE.BoxGeometry(3.4, 0.3, 18.6);
    lean.rotateZ(-sx * 0.55);
    put(parts, roof, lean, sx * 5.9, 7.0, -16.5);
    for (let i = 0; i < 5; i++) {
      box(parts, stoneDark, 0.8, 7.5, 1.4, sx * 7.4, 0, -8.5 - i * 4);
      pyramid(parts, stoneDark, 0.8, 1.4, sx * 7.4, 7.5, -8.5 - i * 4);
    }
  }
  // facade gable + flanking turrets
  {
    const s = new THREE.Shape();
    s.moveTo(-4.6, 0);
    s.lineTo(4.6, 0);
    s.lineTo(0, 5.8);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false });
    put(parts, stone, g, 0, 10, -6.8);
  }
  for (const sx of [-1, 1]) {
    box(parts, stone, 2.4, 15, 2.4, sx * 5.4, 0, -6.6);
    box(parts, stoneDark, 2.8, 0.4, 2.8, sx * 5.4, 15, -6.6);
    pyramid(parts, roof, 2.6, 5.2, sx * 5.4, 15.4, -6.6);
  }
  // portal: deep pointed door + porch
  archWall(parts, stone, 5.6, 6.2, 1.2, 2.6, 4.6, 0, 0, -5.9);
  lancet(parts, voidMat, 2.62, 4.62, 0, 0, -6.45);
  for (const sx of [-1, 1]) {
    box(parts, stone, 0.7, 4.4, 0.7, sx * 1.9, 0, -3.9);
    box(parts, stoneDark, 0.9, 0.3, 0.9, sx * 1.9, 4.4, -3.9);
  }
  gable(parts, roof, 4.6, 1.9, 2.8, 0, 4.7, -4.8, 0, 0.2);
  // rose window
  {
    const ring = new THREE.RingGeometry(0.2, 1.7, 24, 1);
    put(parts, win, ring, 0, 11.3, -5.55);
    const frame = new THREE.TorusGeometry(1.75, 0.18, 6, 24);
    put(parts, stoneDark, frame, 0, 11.3, -5.5);
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.BoxGeometry(0.12, 3.3, 0.12);
      sp.rotateZ((i / 6) * Math.PI);
      put(parts, stoneDark, sp, 0, 11.3, -5.48);
    }
  }
  // windows: facade, nave sides, turrets
  for (const sx of [-1, 1]) {
    lancet(parts, win, 0.9, 2.6, sx * 3.1, 5.2, -5.55);
    for (let i = 0; i < 4; i++) lancet(parts, i % 3 === 1 ? winDim : win, 0.9, 2.8, sx * 4.62, 6.2, -9.6 - i * 4.2, sx * Math.PI / 2);
    for (let i = 0; i < 4; i++) lancet(parts, i === 2 ? winDim : win, 0.7, 1.6, sx * 7.22, 2.4, -10 - i * 4.2, sx * Math.PI / 2);
    lancet(parts, win, 0.5, 1.4, sx * 5.4, 9.5, -5.38);
  }
  // apse
  {
    const g = new THREE.CylinderGeometry(4.6, 4.6, 9, 10, 1, false, Math.PI / 2, Math.PI);
    put(parts, stone, g, 0, 4.5, -26);
    const c = new THREE.ConeGeometry(4.9, 4.4, 10, 1, false, Math.PI / 2, Math.PI);
    put(parts, roof, c, 0, 11.2, -26);
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + ((i + 1) / 4) * Math.PI;
      lancet(parts, win, 0.8, 2.6, Math.sin(a) * 4.62, 4.5, -26 + Math.cos(a) * 4.62, a);
    }
  }
  // bell tower shaft + belfry + spire
  {
    const tx = TOWER.x;
    const tz = TOWER.z;
    box(parts, stone, 5.4, BELFRY_Y, 5.4, tx, 0, tz);
    for (let i = 0; i < 4; i++) box(parts, stoneDark, 5.8, 0.35, 5.8, tx, 6 + i * 6, tz);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(parts, stoneDark, 0.9, BELFRY_Y + 6, 0.9, tx + sx * 2.9, 0, tz + sz * 2.9);
    lancet(parts, win, 0.6, 1.8, tx, 12, tz + 2.72);
    lancet(parts, winDim, 0.6, 1.8, tx - 2.72, 16, tz, -Math.PI / 2);
    box(parts, stoneDark, 5.8, 0.5, 5.8, tx, BELFRY_Y, tz);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      archWall(parts, stone, 5.4, 6.2, 0.8, 3.3, 5.1, tx + Math.sin(a) * 2.3, BELFRY_Y + 0.5, tz + Math.cos(a) * 2.3, a);
    }
    box(parts, stoneDark, 6.2, 0.7, 6.2, tx, BELFRY_Y + 6.7, tz);
    pyramid(parts, roof, 5.6, 13, tx, BELFRY_Y + 7.4, tz);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pyramid(parts, roof, 0.9, 2.6, tx + sx * 2.9, BELFRY_Y + 7.4, tz + sz * 2.9);
    // finial cross
    box(parts, stoneDark, 0.18, 1.6, 0.18, tx, BELFRY_Y + 20.3, tz);
    box(parts, stoneDark, 0.9, 0.16, 0.18, tx, BELFRY_Y + 21.2, tz);
    // the bell's yoke and wheel
    box(parts, wood, 5.0, 0.5, 0.55, tx, BELFRY_Y + 5.25, tz);
    box(parts, wood, 0.4, 5.2, 0.5, tx - 2.2, BELFRY_Y + 0.5, tz);
    box(parts, wood, 0.4, 5.2, 0.5, tx + 2.2, BELFRY_Y + 0.5, tz);
    const wheel = new THREE.TorusGeometry(1.1, 0.07, 5, 18);
    wheel.rotateY(Math.PI / 2);
    put(parts, wood, wheel, tx + 1.7, BELFRY_Y + 5.0, tz);
  }
  // stone dressing: rocks + broken stones near the path, a wayside cross
  {
    let s = 3;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const u = rnd();
      const p = curve.getPointAt(Math.min(0.97, u * 0.95));
      const tan = curve.getTangentAt(Math.min(0.97, u * 0.95));
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar((rnd() > 0.5 ? 1 : -1) * (2.2 + rnd() * 9));
      const x = p.x + side.x;
      const z = p.z + side.z;
      const sc = 0.35 + rnd() * 1.5 * (1 + Math.abs(side.length()) / 10);
      const g = new THREE.DodecahedronGeometry(sc, 0);
      g.scale(1, 0.55 + rnd() * 0.5, 1);
      put(parts, stoneDark, g, x, heightAt(x, z) + sc * 0.2, z, rnd() * 6, rnd() * 0.4);
    }
    // wayside cross for pilgrims
    const wx = 7.9;
    const wz = 27;
    const wy = heightAt(wx, wz);
    box(parts, stone, 0.5, 2.4, 0.5, wx, wy - 0.1, wz, 0.3);
    box(parts, stone, 1.3, 0.3, 0.35, wx, wy + 1.75, wz, 0.3);
    box(parts, stoneDark, 0.9, 0.35, 0.9, wx, wy - 0.15, wz, 0.3);
  }
  // dead trees
  for (const [x, z, h, r] of [
    [13.5, 31, 5.5, 0.2],
    [-5.8, 19, 4.6, -0.3],
    [17, 47, 6, 0.4],
    [-8, 36, 5, 0.1],
  ] as const) {
    const y = heightAt(x, z);
    const trunk = new THREE.CylinderGeometry(0.08, 0.28, h, 5);
    trunk.rotateZ(r * 0.25);
    put(parts, wood, trunk, x, y + h / 2 - 0.2, z);
    for (let i = 0; i < 4; i++) {
      const bl = h * (0.3 + (i % 2) * 0.15);
      const b = new THREE.CylinderGeometry(0.03, 0.08, bl, 4);
      b.translate(0, bl / 2, 0);
      b.rotateZ((i % 2 ? 1 : -1) * (0.7 + i * 0.12));
      b.rotateY(i * 1.7 + r);
      put(parts, wood, b, x + Math.sin(r) * 0.3, y + h * (0.5 + i * 0.1), z);
    }
  }
  merge(parts, group, quality === 'high');

  // ---- the bell
  const bell = crackedBell(3.1);
  bell.pivot.position.set(TOWER.x, BELFRY_Y + 5.05, TOWER.z);
  group.add(bell.pivot);
  // the rope nobody pulls, swaying from the wheel down through the floor
  const ropePivot = new THREE.Group();
  ropePivot.position.set(TOWER.x + 1.7, BELFRY_Y + 3.95, TOWER.z + 0.9);
  const rope = new THREE.Mesh(own(new THREE.CylinderGeometry(0.045, 0.045, 6.4, 6)), own(new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 })));
  rope.position.y = -3.2;
  ropePivot.add(rope);
  group.add(ropePivot);

  // ember halo around the belfry (seen from afar) and a cold moon bounce on the bronze (close-up)
  const halo = glowSprite(0xff6a24, 9, 0.32);
  halo.position.set(TOWER.x, BELFRY_Y + 3.2, TOWER.z);
  group.add(halo);
  const kicker = new THREE.PointLight(0x8ea4d8, 30, 14, 1.5);
  kicker.position.set(TOWER.x - 1.2, BELFRY_Y + 5.6, TOWER.z + 5.5);
  group.add(kicker);

  // ---- lights
  const hemi = new THREE.HemisphereLight(0x46557c, 0x0b0908, 0.85);
  const moon = new THREE.DirectionalLight(0xa9bdf0, 1.8);
  moon.position.set(-38, 46, -70);
  moon.target.position.set(0, 0, -10);
  const fill = new THREE.DirectionalLight(0x5f6f9a, 0.55);
  fill.position.set(30, 14, 60);
  const bolt = new THREE.DirectionalLight(0xdfe8ff, 0);
  bolt.position.set(-30, 60, 30);
  group.add(hemi, moon, moon.target, fill, bolt);
  const fires: { l: THREE.PointLight; base: number; ph: number }[] = [];
  const gateEmbers: Embers[] = [];
  for (const sx of [-1, 1]) {
    // gate braziers
    const at = new THREE.Vector3(sx * 2.45, 5.25, 2);
    const l = new THREE.PointLight(0xff9440, 22, 16, 1.8);
    l.position.copy(at).add(new THREE.Vector3(0, 0.5, 0.6));
    group.add(l);
    fires.push({ l, base: 22, ph: sx * 2 });
    const flame = glowSprite(0xff8a30, 1.6, 0.95);
    flame.position.copy(at).add(new THREE.Vector3(0, 0.35, 0));
    group.add(flame);
    const core = glowSprite(0xffe0a0, 0.6, 1);
    core.position.copy(at).add(new THREE.Vector3(0, 0.2, 0));
    group.add(core);
    const e = embers(quality === 'low' ? 14 : 26, at.clone().add(new THREE.Vector3(0, 0.2, 0)), { spread: 0.25, height: 3.2, size: 0.07, speed: 0.35 });
    group.add(e.obj);
    gateEmbers.push(e);
    // porch torches
    const pt = new THREE.PointLight(0xffa050, 10, 9, 1.8);
    pt.position.set(sx * 1.9, 3.7, -3.2);
    group.add(pt);
    fires.push({ l: pt, base: 10, ph: sx * 5 });
    const tf = glowSprite(0xff9a40, 0.9, 0.9);
    tf.position.set(sx * 1.9, 3.9, -3.5);
    group.add(tf);
  }
  // the Refúgio dos Peregrinos: a few warm lights far down the valley
  for (const [x, y, z, sc] of [
    [34, -13.5, 104, 1.1],
    [38.5, -13.8, 108, 0.8],
    [31, -13.2, 111, 0.9],
    [42, -14, 101, 0.6],
    [27, -12.8, 106, 0.55],
  ] as const) {
    const g = glowSprite(0xffa24a, sc * 2.2, 0.9);
    g.position.set(x, y, z);
    group.add(g);
    const core = glowSprite(0xffe2a8, sc * 0.5, 1);
    core.position.set(x, y, z);
    group.add(core);
  }
  // light from the church door when it opens
  const doorLight = new THREE.PointLight(0xffa860, 0, 13, 1.5);
  doorLight.position.set(0, 2.2, -4.6);
  group.add(doorLight);
  const doorGlow = glowSprite(0xffc27a, 5.5, 0);
  doorGlow.position.set(0, 2.1, -5.6);
  const doorCore = glowSprite(0xfff0d0, 2.4, 0);
  doorCore.position.set(0, 1.9, -5.7);
  group.add(doorGlow, doorCore);
  // warm spill from the windows onto the forecourt
  const spill = new THREE.PointLight(0xff9a50, 8, 14, 1.6);
  spill.position.set(0, 6, -3);
  group.add(spill);

  // ---- embers from the cracked bell, drifting out of the belfry
  const crack = new THREE.Vector3(TOWER.x, BELFRY_Y + 3.2, TOWER.z + 1.2);
  const bellEmbers = embers(quality === 'low' ? 40 : 90, crack, { spread: 1.4, height: 14, size: 0.12, speed: 0.07, wind: [-1.4, 0.8] });
  group.add(bellEmbers.obj);

  // ---- mist banks
  const fogs: THREE.Mesh[] = [];
  for (const [x, y, z, w, h, op, sp, ry] of [
    [0, -9, 46, 120, 14, 0.5, 0.004, 0],
    [-30, -6, 14, 70, 12, 0.45, -0.003, 1.1],
    [34, -7, 10, 70, 12, 0.45, 0.003, -1.1],
    [8, -12, 70, 110, 12, 0.55, 0.002, 0],
    [0, 2.2, -38, 90, 22, 0.35, 0.0025, 0],
    [0, -2, 22, 60, 6, 0.28, -0.005, 0],
  ] as const) {
    const f = fogCard(w, h, 0x8a92a8, op, sp);
    f.position.set(x, y, z);
    f.rotation.y = ry;
    group.add(f);
    fogs.push(f);
  }

  // ---- rain
  const R = rain(quality === 'low' ? 1200 : quality === 'medium' ? 2200 : 3200);
  R.set({ alpha: 0.3 });
  group.add(R.obj);

  let flash = 0;
  const ext: Exterior = {
    group,
    bell,
    rain: R,
    bellEmbers,
    gateEmbers,
    bellTop: bell.pivot.position.clone(),
    portal: new THREE.Vector3(0, 0, -6),
    path(u: number) {
      const p = curve.getPointAt(THREE.MathUtils.clamp(u, 0, 1));
      p.y = pathY(p);
      return p;
    },
    tangent(u: number) {
      return curve.getTangentAt(THREE.MathUtils.clamp(u, 0, 1)).setY(0).normalize();
    },
    length: curve.getLength(),
    heightAt,
    strike(strength = 1) {
      flash = Math.max(flash, strength);
    },
    openDoor(k: number) {
      const c0 = new THREE.Color(0x050407);
      voidMat.color.copy(c0).lerp(new THREE.Color(1.0, 0.52, 0.22), THREE.MathUtils.clamp(k, 0, 1));
      doorLight.intensity = 26 * k;
      (doorGlow.material as THREE.SpriteMaterial).opacity = 0.85 * k;
      (doorCore.material as THREE.SpriteMaterial).opacity = 0.9 * k;
    },
    update(dt, t, cam, pixelH) {
      sky.position.copy(cam);
      skyMat.uniforms.uTime.value = t;
      // lightning: a double flicker
      flash = Math.max(0, flash - dt * 2.4);
      const f = flash > 0 ? flash * (0.6 + 0.4 * Math.abs(Math.sin(t * 38))) : 0;
      skyMat.uniforms.uFlash.value = f;
      bolt.intensity = f * 3.2;
      for (const fl of fires) fl.l.intensity = fl.base * (0.82 + Math.sin(t * 9 + fl.ph) * 0.07 + Math.sin(t * 23 + fl.ph * 3) * 0.06 + Math.random() * 0.05);
      const wf = 0.9 + Math.sin(t * 3.1) * 0.05 + Math.sin(t * 7.7) * 0.04;
      win.color.setRGB(1.5 * wf, 0.72 * wf, 0.26 * wf);
      bell.update(dt, t);
      ropePivot.rotation.z = Math.sin(t * 1.3) * 0.05 + bell.swing * 0.35 * Math.sin(t * 1.9 + 0.4);
      ropePivot.rotation.x = Math.sin(t * 0.9 + 1) * 0.04;
      R.update(t, cam);
      bellEmbers.update(t);
      bellEmbers.setPixelScale(pixelH);
      for (const e of gateEmbers) {
        e.update(t);
        e.setPixelScale(pixelH);
      }
      for (const fg of fogs) {
        const m = fg.material as THREE.MeshBasicMaterial;
        if (m.map) m.map.offset.x += dt * (fg.userData.speed as number);
      }
    },
  };
  return ext;
}
