/**
 * Pooled GPU particles + ring/shockwave decals. One Points mesh per blend mode, fixed capacity, no per-frame allocation.
 * Each damage school has its own signature (metal sparks, blood, arcane runes, holy rays, profane smoke, fire, bell shockwave).
 */
import * as THREE from 'three';
import { sprite } from './assets';

const VERT = /* glsl */ `
attribute float aSize;
attribute float aLife;
attribute vec4 aColor;
attribute float aFrame;
varying float vLife;
varying vec4 vColor;
varying float vFrame;
uniform float uScale;
void main() {
  vLife = aLife;
  vColor = aColor;
  vFrame = aFrame;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform float uCols;
varying float vLife;
varying vec4 vColor;
varying float vFrame;
void main() {
  if (vLife <= 0.0) discard;
  vec2 uv = gl_PointCoord;
  uv.y = 1.0 - uv.y;
  float f = floor(vFrame);
  vec2 cell = vec2(mod(f, uCols), floor(f / uCols));
  vec2 tuv = (uv + cell) / uCols;
  vec4 t = texture2D(uTex, tuv);
  float fade = smoothstep(0.0, 0.15, vLife) ;
  gl_FragColor = vec4(vColor.rgb * t.rgb, t.a * vColor.a * fade);
  if (gl_FragColor.a < 0.01) discard;
}`;

interface Particle {
  alive: boolean;
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  size: number;
  size1: number;
  color: THREE.Color;
  alpha: number;
  gravity: number;
  drag: number;
  frame: number;
  spin: number;
}

class ParticleLayer {
  points: THREE.Points;
  private ps: Particle[] = [];
  private geo: THREE.BufferGeometry;
  private cursor = 0;
  constructor(
    public cap: number,
    texPath: string,
    cols: number,
    additive: boolean,
  ) {
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aFrame', new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTex: { value: sprite(texPath) }, uCols: { value: cols }, uScale: { value: 300 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    for (let i = 0; i < cap; i++) this.ps.push({ alive: false, life: 0, maxLife: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 1, size1: 1, color: new THREE.Color(), alpha: 1, gravity: 0, drag: 0, frame: 0, spin: 0 });
  }
  setScale(s: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = s;
  }
  spawn(o: { pos: THREE.Vector3; vel: THREE.Vector3; life: number; size: number; size1?: number; color: THREE.ColorRepresentation; alpha?: number; gravity?: number; drag?: number; frame?: number }) {
    const p = this.ps[this.cursor];
    this.cursor = (this.cursor + 1) % this.cap;
    p.alive = true;
    p.life = p.maxLife = o.life;
    p.pos.copy(o.pos);
    p.vel.copy(o.vel);
    p.size = o.size;
    p.size1 = o.size1 ?? o.size;
    p.color.set(o.color);
    p.alpha = o.alpha ?? 1;
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
    p.frame = o.frame ?? Math.floor(Math.random() * 16);
  }
  update(dt: number) {
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const size = this.geo.getAttribute('aSize') as THREE.BufferAttribute;
    const life = this.geo.getAttribute('aLife') as THREE.BufferAttribute;
    const col = this.geo.getAttribute('aColor') as THREE.BufferAttribute;
    const fr = this.geo.getAttribute('aFrame') as THREE.BufferAttribute;
    for (let i = 0; i < this.cap; i++) {
      const p = this.ps[i];
      if (!p.alive) {
        life.setX(i, 0);
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        life.setX(i, 0);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      const k = p.life / p.maxLife;
      pos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
      size.setX(i, p.size1 + (p.size - p.size1) * k);
      life.setX(i, k);
      col.setXYZW(i, p.color.r, p.color.g, p.color.b, p.alpha * Math.min(1, k * 1.6));
      fr.setX(i, p.frame);
    }
    pos.needsUpdate = size.needsUpdate = life.needsUpdate = col.needsUpdate = fr.needsUpdate = true;
  }
}

interface Ring {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  from: number;
  to: number;
  alive: boolean;
}

export class VFX {
  group = new THREE.Group();
  private glow: ParticleLayer;
  private smoke: ParticleLayer;
  private ash: ParticleLayer;
  private rings: Ring[] = [];
  private ringMats: Record<string, THREE.MeshBasicMaterial> = {};
  density = 1;
  private ambientAcc = 0;
  ambientBounds = new THREE.Box3(new THREE.Vector3(-9, 0, -8), new THREE.Vector3(9, 6, 7));
  emberSources: THREE.Vector3[] = [];

  constructor() {
    this.glow = new ParticleLayer(900, 'textures/ember_particle.png', 4, true);
    this.smoke = new ParticleLayer(420, 'textures/smoke_puff.png', 4, false);
    this.ash = new ParticleLayer(500, 'textures/ash_particle.png', 4, false);
    this.group.add(this.ash.points, this.smoke.points, this.glow.points);
    const ringGeo = new THREE.PlaneGeometry(1, 1);
    for (const [k, path] of [['rune', 'textures/rune_ring.png'], ['holy', 'textures/holy_ring.png'], ['glow', 'textures/glow_radial.png']] as const) {
      this.ringMats[k] = new THREE.MeshBasicMaterial({ map: sprite(path), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    }
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(ringGeo, this.ringMats.glow);
      m.visible = false;
      m.renderOrder = 5;
      this.group.add(m);
      this.rings.push({ mesh: m, t: 0, dur: 1, from: 0.2, to: 2, alive: false });
    }
  }
  setPixelScale(h: number) {
    const s = h * 0.55;
    this.glow.setScale(s);
    this.smoke.setScale(s);
    this.ash.setScale(s);
  }

  ring(at: THREE.Vector3, kind: 'rune' | 'holy' | 'glow', color: THREE.ColorRepresentation, from: number, to: number, dur: number, vertical = false) {
    const r = this.rings.find((x) => !x.alive) ?? this.rings[0];
    r.alive = true;
    r.t = 0;
    r.dur = dur;
    r.from = from;
    r.to = to;
    const mat = this.ringMats[kind].clone();
    mat.color.set(color);
    (r.mesh.material as THREE.Material).dispose?.();
    r.mesh.material = mat;
    r.mesh.position.copy(at);
    r.mesh.rotation.set(vertical ? 0 : -Math.PI / 2, 0, 0);
    r.mesh.visible = true;
  }

  private burst(layer: ParticleLayer, at: THREE.Vector3, n: number, o: { speed: number; up?: number; life: number; size: number; size1?: number; color: THREE.ColorRepresentation; gravity?: number; drag?: number; spread?: number; alpha?: number }) {
    const count = Math.max(1, Math.round(n * this.density));
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * (o.spread ?? 1) - (o.spread ?? 1) / 2 + (o.up ?? 0), Math.random() - 0.5).normalize();
      layer.spawn({
        pos: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15)),
        vel: dir.multiplyScalar(o.speed * (0.4 + Math.random() * 0.8)),
        life: o.life * (0.6 + Math.random() * 0.6),
        size: o.size,
        size1: o.size1,
        color: o.color,
        gravity: o.gravity,
        drag: o.drag,
        alpha: o.alpha,
      });
    }
  }

  /** Impact signature per school. */
  impact(at: THREE.Vector3, school: string, strength = 1) {
    const s = Math.min(2, strength);
    switch (school) {
      case 'metal':
      case 'blunt':
        this.burst(this.glow, at, 26 * s, { speed: 4.5, up: 0.6, life: 0.45, size: 0.09, size1: 0.02, color: 0xffc070, gravity: 9, drag: 1.5 });
        this.burst(this.smoke, at, 4, { speed: 0.6, life: 0.8, size: 0.6, size1: 1.2, color: 0x6a625c, alpha: 0.35 });
        this.ring(at, 'glow', 0xffd8a0, 0.2, 1.4 * s, 0.25, true);
        break;
      case 'flesh':
      case 'blood':
        this.burst(this.smoke, at, 14 * s, { speed: 2.4, up: 0.4, life: 0.6, size: 0.18, size1: 0.08, color: 0x6e0f0c, gravity: 7, alpha: 0.95 });
        break;
      case 'arrow':
      case 'bolt':
        this.burst(this.glow, at, 10 * s, { speed: 2.6, life: 0.35, size: 0.06, size1: 0.01, color: 0xffd090, gravity: 6 });
        this.burst(this.smoke, at, 6, { speed: 1.6, life: 0.5, size: 0.14, color: 0x5a0d0a, gravity: 6 });
        break;
      case 'arcane':
        this.burst(this.glow, at, 34 * s, { speed: 3.2, life: 0.7, size: 0.12, size1: 0.02, color: 0x9a8cff, drag: 2 });
        this.ring(at, 'rune', 0xa59cff, 0.3, 2.2 * s, 0.55, true);
        break;
      case 'holy':
        this.burst(this.glow, at, 30 * s, { speed: 2.4, up: 1.2, life: 0.9, size: 0.12, size1: 0.02, color: 0xffe2a0, drag: 1.2 });
        this.ring(at, 'holy', 0xffe9b0, 0.3, 2.4 * s, 0.6, true);
        break;
      case 'profane':
      case 'shadow':
        this.burst(this.smoke, at, 16 * s, { speed: 1.5, up: 0.5, life: 0.9, size: 0.4, size1: 0.9, color: 0x2a1438, alpha: 0.7 });
        this.burst(this.glow, at, 12 * s, { speed: 2, life: 0.6, size: 0.08, color: 0xb070ff });
        break;
      case 'fire':
        this.burst(this.glow, at, 30 * s, { speed: 1.6, up: 1.6, life: 0.8, size: 0.16, size1: 0.03, color: 0xff7a2a, gravity: -1.5 });
        this.burst(this.smoke, at, 8, { speed: 0.8, up: 1, life: 1.2, size: 0.4, size1: 1.0, color: 0x2a2220, alpha: 0.5 });
        break;
      case 'bell':
        this.ring(at.clone().setY(0.05), 'glow', 0xffc070, 0.5, 6, 0.9);
        this.ring(at, 'rune', 0xffb050, 0.4, 3.2, 0.8, true);
        this.burst(this.ash, at, 30, { speed: 2.4, up: 0.8, life: 1.2, size: 0.12, color: 0xa09890 });
        break;
      case 'poison':
        this.burst(this.smoke, at, 10, { speed: 0.8, up: 1, life: 1, size: 0.25, size1: 0.6, color: 0x5d8a3a, alpha: 0.6 });
        break;
      default:
        this.burst(this.glow, at, 10, { speed: 2, life: 0.4, size: 0.08, color: 0xffffff });
    }
  }
  heal(at: THREE.Vector3) {
    this.burst(this.glow, at, 26, { speed: 0.8, up: 2.2, life: 1.3, size: 0.12, size1: 0.02, color: 0xbfe89a, drag: 0.6, spread: 0.3 });
    this.ring(at.clone().setY(0.04), 'holy', 0xc8f0a0, 0.3, 1.6, 0.8);
  }
  guard(at: THREE.Vector3) {
    this.ring(at, 'rune', 0x9fd0ff, 0.6, 1.4, 0.6, true);
    this.burst(this.glow, at, 14, { speed: 1.2, life: 0.6, size: 0.08, color: 0xb8e0ff, drag: 2 });
  }
  dissolve(at: THREE.Vector3, h: number) {
    for (let i = 0; i < 4; i++) this.burst(this.ash, at.clone().add(new THREE.Vector3(0, (h * i) / 4, 0)), 18, { speed: 0.7, up: 1.5, life: 2.2, size: 0.12, color: 0x8a837c, drag: 0.4, spread: 0.6 });
    this.burst(this.glow, at.clone().setY(h * 0.5), 20, { speed: 1, up: 1.4, life: 1.4, size: 0.08, color: 0xff8a40, drag: 0.8 });
  }
  spawn(at: THREE.Vector3) {
    this.burst(this.ash, at, 50, { speed: 2.2, up: 1.6, life: 1.4, size: 0.14, color: 0x7d7670, drag: 1.2 });
    this.ring(at.clone().setY(0.04), 'glow', 0xb070ff, 0.2, 2.2, 0.7);
  }
  smokeCloud(at: THREE.Vector3) {
    this.burst(this.smoke, at, 10, { speed: 0.4, up: 0.4, life: 2.5, size: 0.9, size1: 1.6, color: 0x8a8580, alpha: 0.35 });
  }
  condition(at: THREE.Vector3, cond: string) {
    const c: Record<string, number> = { veneno: 0x7fae58, sangramento: 0x9b1a14, queimando: 0xff7a2a, quebrado: 0xc0a080, exposto: 0xffd070, imobilizado: 0x8aa0b0, atordoado: 0xfff0a0, guardado: 0x9fd0ff, furtivo: 0x4fb0a8, julgado: 0xffd27a };
    this.burst(this.glow, at, 12, { speed: 1, up: 1, life: 0.8, size: 0.09, color: c[cond] ?? 0xffffff, drag: 1.5 });
  }

  update(dt: number) {
    // ambient ash drifting through the scene
    this.ambientAcc += dt * 18 * this.density;
    while (this.ambientAcc > 1) {
      this.ambientAcc--;
      const b = this.ambientBounds;
      this.ash.spawn({
        pos: new THREE.Vector3(THREE.MathUtils.lerp(b.min.x, b.max.x, Math.random()), b.max.y * Math.random() + 0.5, THREE.MathUtils.lerp(b.min.z, b.max.z, Math.random())),
        vel: new THREE.Vector3(0.15 + Math.random() * 0.15, -0.12 - Math.random() * 0.1, (Math.random() - 0.5) * 0.1),
        life: 7 + Math.random() * 5,
        size: 0.05 + Math.random() * 0.05,
        color: 0x9a928a,
        alpha: 0.65,
      });
    }
    // embers rising from torches/braziers
    for (const s of this.emberSources) {
      if (Math.random() < dt * 4 * this.density)
        this.glow.spawn({ pos: s.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.5) * 0.15)), vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3), life: 1.6, size: 0.05, size1: 0.01, color: 0xff9a40, drag: 0.4 });
    }
    this.glow.update(dt);
    this.smoke.update(dt);
    this.ash.update(dt);
    for (const r of this.rings) {
      if (!r.alive) continue;
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      const e = 1 - Math.pow(1 - k, 3);
      const sc = r.from + (r.to - r.from) * e;
      r.mesh.scale.set(sc, sc, sc);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      if (k >= 1) {
        r.alive = false;
        r.mesh.visible = false;
      }
    }
  }
}
