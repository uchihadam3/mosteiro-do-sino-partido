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

interface Fx {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  alive: boolean;
  s0: number;
  s1: number;
}

const SHIELD_VERT = /* glsl */ `varying vec3 vN; varying vec3 vV;
  void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const SHIELD_FRAG = /* glsl */ `uniform vec3 uColor; uniform float uAlpha; uniform float uTime; varying vec3 vN; varying vec3 vV;
  void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2);
    float hex = 0.5 + 0.5 * sin(vN.x * 40.0 + uTime * 3.0) * sin(vN.y * 40.0 - uTime * 2.0);
    gl_FragColor = vec4(uColor * (f * 1.6 + hex * 0.12), (f * 0.9 + 0.06) * uAlpha); }`;

export class VFX {
  group = new THREE.Group();
  private glow: ParticleLayer;
  private smoke: ParticleLayer;
  private ash: ParticleLayer;
  private rings: Ring[] = [];
  private ringMats: Record<string, THREE.MeshBasicMaterial> = {};
  private slashes: Fx[] = [];
  private shields: Fx[] = [];
  private time = 0;
  density = 1;
  private ambientAcc = 0;
  private dustAcc = 0;
  ambientBounds = new THREE.Box3(new THREE.Vector3(-9, 0, -8), new THREE.Vector3(9, 6, 7));
  emberSources: THREE.Vector3[] = [];
  /** points where lit dust motes hang (light shafts, candles) */
  dustSources: THREE.Vector3[] = [];
  /** room ambience levels (0..2): dust motes, falling ash, rising embers */
  private amb = { dust: 0.6, ash: 0.6, embers: 0.6 };
  setAmbience(a?: { dust?: number; ash?: number; embers?: number }) {
    this.amb = { dust: a?.dust ?? 0.6, ash: a?.ash ?? 0.4, embers: a?.embers ?? 0.5 };
  }

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
    // weapon-swing crescents
    const arc = new THREE.RingGeometry(0.42, 0.6, 28, 1, -Math.PI * 0.45, Math.PI * 0.9);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(arc, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0 }));
      m.visible = false;
      m.renderOrder = 6;
      this.group.add(m);
      this.slashes.push({ mesh: m, t: 0, dur: 0.2, alive: false, s0: 0.6, s1: 1.2 });
    }
    // guard bubbles
    const sph = new THREE.SphereGeometry(1, 28, 18);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.ShaderMaterial({ vertexShader: SHIELD_VERT, fragmentShader: SHIELD_FRAG, uniforms: { uColor: { value: new THREE.Color(0x9fd0ff) }, uAlpha: { value: 0 }, uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const m = new THREE.Mesh(sph, mat);
      m.visible = false;
      m.renderOrder = 6;
      this.group.add(m);
      this.shields.push({ mesh: m, t: 0, dur: 0.7, alive: false, s0: 0.5, s1: 1 });
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
        this.burst(this.glow, at, 30 * s, { speed: 5.5, up: 0.7, life: 0.5, size: 0.16, size1: 0.03, color: 0xffc070, gravity: 9, drag: 1.4 });
        this.burst(this.glow, at, 8, { speed: 1.2, life: 0.18, size: 0.5, size1: 0.1, color: 0xfff0d0, drag: 4 });
        this.burst(this.smoke, at, 5, { speed: 0.7, life: 0.8, size: 0.6, size1: 1.3, color: 0x6a625c, alpha: 0.35 });
        this.ring(at, 'glow', 0xffd8a0, 0.2, 1.6 * s, 0.25, true);
        break;
      case 'flesh':
      case 'blood':
        this.burst(this.smoke, at, 16 * s, { speed: 2.8, up: 0.5, life: 0.6, size: 0.2, size1: 0.08, color: 0x7e140f, gravity: 7, alpha: 0.95 });
        this.burst(this.glow, at, 6, { speed: 1.2, life: 0.16, size: 0.45, size1: 0.1, color: 0xffd0c0, drag: 4 });
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

  /** Ground puff where feet land, bodies fall, figures are shoved. */
  dust(at: THREE.Vector3, k = 1) {
    this.burst(this.smoke, at, 7 * k, { speed: 1.1 * k, up: 0.15, spread: 0.25, life: 0.8, size: 0.35, size1: 0.9 * k, color: 0x6a5e52, alpha: 0.32, drag: 3 });
  }
  /** A single ember rising (dissolving bodies). */
  ember(at: THREE.Vector3) {
    this.glow.spawn({ pos: at, vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.8 + Math.random() * 0.9, (Math.random() - 0.5) * 0.4), life: 1.1 + Math.random() * 0.6, size: 0.09, size1: 0.01, color: Math.random() < 0.5 ? 0xff9a40 : 0xffd080, drag: 0.6 });
    if (Math.random() < 0.3) this.ash.spawn({ pos: at.clone(), vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3), life: 1.6, size: 0.08, color: 0x3a3430, alpha: 0.8, drag: 0.5 });
  }
  /** Particles drawn into a point (a spell gathering). */
  charge(at: THREE.Vector3, color: THREE.ColorRepresentation) {
    const n = Math.round(18 * this.density);
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(0.7 + Math.random() * 0.4);
      this.glow.spawn({ pos: at.clone().add(d), vel: d.clone().multiplyScalar(-2.2), life: 0.36, size: 0.03, size1: 0.1, color, drag: 0 });
    }
    this.ring(at, 'rune', color, 0.9, 0.25, 0.4, true);
  }
  /** Glowing wake behind a projectile. */
  trail(p: THREE.Vector3, color: THREE.ColorRepresentation, k = 1) {
    if (Math.random() > 0.9 * this.density) return;
    this.glow.spawn({ pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06)), vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3), life: 0.32 * k + 0.1, size: 0.12 * k + 0.03, size1: 0.01, color, drag: 2 });
  }
  /** A bright crescent where the blade passes. */
  slash(at: THREE.Vector3, dir: THREE.Vector3, color: THREE.ColorRepresentation, scale = 1) {
    const f = this.slashes.find((x) => !x.alive) ?? this.slashes[0];
    f.alive = true;
    f.t = 0;
    f.dur = 0.2;
    f.s0 = 0.55 * scale;
    f.s1 = 1.25 * scale;
    f.mesh.visible = true;
    f.mesh.position.copy(at).addScaledVector(dir, -0.15);
    // stand the crescent across the strike direction, tilted
    f.mesh.lookAt(at.clone().add(dir));
    f.mesh.rotateZ((Math.random() - 0.5) * 1.6);
    (f.mesh.material as THREE.MeshBasicMaterial).color.set(color);
  }
  /** Shimmering guard bubble. */
  shield(at: THREE.Vector3, radius = 1) {
    const f = this.shields.find((x) => !x.alive) ?? this.shields[0];
    f.alive = true;
    f.t = 0;
    f.dur = 0.75;
    f.s0 = radius * 0.6;
    f.s1 = radius * 1.05;
    f.mesh.visible = true;
    f.mesh.position.copy(at);
  }

  update(dt: number) {
    this.time += dt;
    // ambient ash drifting through the scene
    this.ambientAcc += dt * 14 * this.density * this.amb.ash;
    while (this.ambientAcc > 1) {
      this.ambientAcc--;
      const b = this.ambientBounds;
      this.ash.spawn({
        pos: new THREE.Vector3(THREE.MathUtils.lerp(b.min.x, b.max.x, Math.random()), b.max.y * Math.random() + 0.5, THREE.MathUtils.lerp(b.min.z, b.max.z, Math.random())),
        vel: new THREE.Vector3(0.15 + Math.random() * 0.15, -0.12 - Math.random() * 0.1, (Math.random() - 0.5) * 0.1),
        life: 7 + Math.random() * 5,
        size: 0.04 + Math.random() * 0.05,
        color: 0x9a928a,
        alpha: 0.55,
      });
    }
    // lit dust motes hanging in the light shafts and around candles
    if (this.dustSources.length) {
      this.dustAcc += dt * 10 * this.density * this.amb.dust;
      while (this.dustAcc > 1) {
        this.dustAcc--;
        const s = this.dustSources[Math.floor(Math.random() * this.dustSources.length)];
        this.glow.spawn({
          pos: s.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.2, (Math.random() - 0.2) * 2.4, (Math.random() - 0.5) * 2.2)),
          vel: new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.02 + Math.random() * 0.05, (Math.random() - 0.5) * 0.08),
          life: 4 + Math.random() * 4,
          size: 0.025 + Math.random() * 0.03,
          color: 0xfff0d8,
          alpha: 0.55,
          drag: 0.1,
        });
      }
    }
    // embers rising from torches/braziers
    for (const s of this.emberSources) {
      if (Math.random() < dt * 4 * this.density * (0.4 + this.amb.embers))
        this.glow.spawn({ pos: s.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.5) * 0.15)), vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3), life: 1.6, size: 0.05, size1: 0.01, color: 0xff9a40, drag: 0.4 });
    }
    for (const f of this.slashes) {
      if (!f.alive) continue;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.mesh.scale.setScalar(f.s0 + (f.s1 - f.s0) * (1 - Math.pow(1 - k, 2)));
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.95;
      f.mesh.rotateZ(dt * 9);
      if (k >= 1) {
        f.alive = false;
        f.mesh.visible = false;
      }
    }
    for (const f of this.shields) {
      if (!f.alive) continue;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.mesh.scale.setScalar(f.s0 + (f.s1 - f.s0) * (1 - Math.pow(1 - Math.min(1, k * 2.5), 3)));
      const u = (f.mesh.material as THREE.ShaderMaterial).uniforms;
      u.uAlpha.value = Math.sin(Math.min(1, k) * Math.PI) * 0.9;
      u.uTime.value = this.time;
      if (k >= 1) {
        f.alive = false;
        f.mesh.visible = false;
      }
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

// ------------------------------------------------------------------ procedural decal textures (no image files)
const canvasCache = new Map<string, THREE.Texture>();
function canvasTex(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  let t = canvasCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  canvasCache.set(key, t);
  return t;
}

/** Soft contact shadow under a figure. */
export function blobTexture(): THREE.Texture {
  return canvasTex('blob', 128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(0,0,0,0.85)');
    r.addColorStop(0.45, 'rgba(0,0,0,0.55)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });
}

/** Premium selection ring: crisp outer line, soft inner glow, four notches. White — tinted by the material. */
export function ringTexture(): THREE.Texture {
  return canvasTex('ring', 256, (g, s) => {
    const c = s / 2;
    const glow = g.createRadialGradient(c, c, s * 0.2, c, c, s * 0.46);
    glow.addColorStop(0, 'rgba(255,255,255,0)');
    glow.addColorStop(0.75, 'rgba(255,255,255,0.18)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = s * 0.022;
    g.beginPath();
    g.arc(c, c, s * 0.405, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = s * 0.008;
    g.beginPath();
    g.arc(c, c, s * 0.355, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,1)';
    for (let i = 0; i < 4; i++) {
      g.save();
      g.translate(c, c);
      g.rotate((i * Math.PI) / 2 + Math.PI / 4);
      g.beginPath();
      g.moveTo(0, -s * 0.485);
      g.lineTo(s * 0.03, -s * 0.425);
      g.lineTo(0, -s * 0.395);
      g.lineTo(-s * 0.03, -s * 0.425);
      g.closePath();
      g.fill();
      g.restore();
    }
  });
}

/** Sector highlight: a rounded-square glow with a bright rim (tinted by the material). */
export function plateGlowTexture(): THREE.Texture {
  return canvasTex('plateglow', 256, (g, s) => {
    const pad = s * 0.06;
    const rr = s * 0.12;
    const path = (inset: number) => {
      const a = pad + inset;
      const b = s - pad - inset;
      g.beginPath();
      g.moveTo(a + rr, a);
      g.arcTo(b, a, b, b, rr);
      g.arcTo(b, b, a, b, rr);
      g.arcTo(a, b, a, a, rr);
      g.arcTo(a, a, b, a, rr);
      g.closePath();
    };
    const fill = g.createRadialGradient(s / 2, s / 2, s * 0.05, s / 2, s / 2, s * 0.62);
    fill.addColorStop(0, 'rgba(255,255,255,0.28)');
    fill.addColorStop(1, 'rgba(255,255,255,0.5)');
    path(0);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = s * 0.03;
    g.strokeStyle = 'rgba(255,255,255,1)';
    path(s * 0.015);
    g.stroke();
  });
}

/** Board sector top: worn limestone with a carved border and corner marks (white-ish; tinted per side). */
export function plateTopTexture(): THREE.Texture {
  return canvasTex('platetop', 256, (g, s) => {
    // stone body with soft mottling
    g.fillStyle = '#d9d4cc';
    g.fillRect(0, 0, s, s);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const r = 4 + rnd() * 26;
      const a = 0.025 + rnd() * 0.05;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = rnd() < 0.6;
      grd.addColorStop(0, dark ? `rgba(60,52,44,${a})` : `rgba(255,250,240,${a})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // bevel shading towards the edges
    const edge = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s * 0.75);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(30,24,20,0.28)');
    g.fillStyle = edge;
    g.fillRect(0, 0, s, s);
    // carved border: dark groove with a light lip below it
    const inset = s * 0.11;
    const rr = s * 0.06;
    const rect = (o: number) => {
      const a = inset + o;
      const b = s - inset - o;
      g.beginPath();
      g.moveTo(a + rr, a);
      g.arcTo(b, a, b, b, rr);
      g.arcTo(b, b, a, b, rr);
      g.arcTo(a, b, a, a, rr);
      g.arcTo(a, a, b, a, rr);
      g.closePath();
    };
    g.lineWidth = s * 0.016;
    g.strokeStyle = 'rgba(255,250,240,0.35)';
    rect(s * 0.008);
    g.stroke();
    g.strokeStyle = 'rgba(40,32,26,0.55)';
    rect(0);
    g.stroke();
    // corner marks
    g.fillStyle = 'rgba(40,32,26,0.45)';
    for (const [x, y] of [[inset, inset], [s - inset, inset], [inset, s - inset], [s - inset, s - inset]]) {
      g.save();
      g.translate(x, y);
      g.rotate(Math.PI / 4);
      g.fillRect(-s * 0.018, -s * 0.018, s * 0.036, s * 0.036);
      g.restore();
    }
  });
}
