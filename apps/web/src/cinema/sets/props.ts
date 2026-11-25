/**
 * Procedural cinema props: glow sprites, the mentor's spectral lantern, rain, rising embers, drifting fog cards and a
 * cracked bronze bell whose crack glows like an ember. Everything is cheap (shader-driven particles, no per-frame
 * allocation) so it runs on phones.
 */
import * as THREE from 'three';
import { own } from '../engine/stage';

// ------------------------------------------------------------------ canvas textures (cached)
let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.2, 'rgba(255,255,255,0.65)');
  r.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

let cloudTex: THREE.Texture | null = null;
/** Soft tileable-ish cloud blob for fog cards. */
export function cloudTexture(): THREE.Texture {
  if (cloudTex) return cloudTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 256;
    const y = 30 + rnd() * 68;
    const rad = 14 + rnd() * 36;
    for (const dx of [-256, 0, 256]) {
      const r = g.createRadialGradient(x + dx, y, 0, x + dx, y, rad);
      const a = 0.05 + rnd() * 0.08;
      r.addColorStop(0, `rgba(255,255,255,${a})`);
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 256, 128);
    }
  }
  // fade top/bottom so the card has no hard edge
  const m = g.createLinearGradient(0, 0, 0, 128);
  m.addColorStop(0, 'rgba(0,0,0,1)');
  m.addColorStop(0.3, 'rgba(0,0,0,0)');
  m.addColorStop(0.7, 'rgba(0,0,0,0)');
  m.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = m;
  g.fillRect(0, 0, 256, 128);
  cloudTex = new THREE.CanvasTexture(c);
  cloudTex.wrapS = THREE.RepeatWrapping;
  return cloudTex;
}

export function glowSprite(color: THREE.ColorRepresentation, scale: number, opacity = 1): THREE.Sprite {
  const m = own(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  m.toneMapped = false;
  const s = new THREE.Sprite(m);
  s.scale.setScalar(scale);
  return s;
}

// ------------------------------------------------------------------ spectral lantern (the mentor's light)
export interface Lantern {
  group: THREE.Group;
  light: THREE.PointLight;
  /** 0..1 overall intensity (fade in/out, final farewell). */
  level: number;
  update(t: number): void;
}
export function spectralLantern(): Lantern {
  const group = new THREE.Group();
  group.name = 'spectral-lantern';
  const body = new THREE.Group();
  group.add(body);
  const metal = own(new THREE.MeshStandardMaterial({ color: 0x2a2018, metalness: 0.7, roughness: 0.5, emissive: 0x3a2410, emissiveIntensity: 0.6 }));
  const bar = own(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 5));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const m = new THREE.Mesh(bar, metal);
    m.position.set(Math.cos(a) * 0.085, 0, Math.sin(a) * 0.085);
    body.add(m);
  }
  const cap = new THREE.Mesh(own(new THREE.ConeGeometry(0.11, 0.09, 4)), metal);
  cap.position.y = 0.17;
  cap.rotation.y = Math.PI / 4;
  const base = new THREE.Mesh(own(new THREE.CylinderGeometry(0.1, 0.11, 0.035, 4)), metal);
  base.position.y = -0.14;
  base.rotation.y = Math.PI / 4;
  const ring = new THREE.Mesh(own(new THREE.TorusGeometry(0.035, 0.008, 5, 12)), metal);
  ring.position.y = 0.24;
  body.add(cap, base, ring);
  const coreMat = own(new THREE.MeshBasicMaterial({ color: 0xfff0c8, fog: false }));
  coreMat.toneMapped = false;
  const core = new THREE.Mesh(own(new THREE.SphereGeometry(0.05, 10, 8)), coreMat);
  body.add(core);
  const warm = glowSprite(0xffc478, 1.1, 0.9);
  const halo = glowSprite(0x9fc8ff, 2.6, 0.22);
  body.add(warm, halo);
  const light = new THREE.PointLight(0xffc27a, 10, 11, 1.5);
  light.position.y = 0.02;
  body.add(light);
  const L: Lantern = {
    group,
    light,
    level: 1,
    update(t: number) {
      const fl = 0.9 + Math.sin(t * 11) * 0.05 + Math.sin(t * 23.7) * 0.04;
      body.position.y = Math.sin(t * 1.6) * 0.07;
      body.rotation.z = Math.sin(t * 1.1) * 0.08;
      body.rotation.x = Math.sin(t * 0.9 + 1) * 0.06;
      const k = L.level;
      light.intensity = 10 * fl * k;
      (warm.material as THREE.SpriteMaterial).opacity = 0.9 * fl * k;
      (halo.material as THREE.SpriteMaterial).opacity = 0.22 * k;
      coreMat.color.setRGB(1 * k + 0.05, 0.94 * k + 0.04, 0.78 * k + 0.03);
      metal.opacity = k;
      metal.transparent = k < 0.999;
      body.visible = k > 0.01;
    },
  };
  return L;
}

// ------------------------------------------------------------------ rain (GPU, wraps around the camera)
export interface Rain {
  obj: THREE.LineSegments;
  update(t: number, cam: THREE.Vector3): void;
  set(opts: { alpha?: number; speed?: number }): void;
}
export function rain(count = 2400, box: [number, number, number] = [34, 22, 34]): Rain {
  const geo = own(new THREE.BufferGeometry());
  const seeds = new Float32Array(count * 2 * 3);
  const ends = new Float32Array(count * 2);
  const pos = new Float32Array(count * 2 * 3);
  for (let i = 0; i < count; i++) {
    const s = [Math.random(), Math.random(), Math.random()];
    for (let e = 0; e < 2; e++) {
      seeds.set(s, (i * 2 + e) * 3);
      ends[i * 2 + e] = e;
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
  const mat = own(
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...box) }, uWind: { value: new THREE.Vector2(-2.6, 1.2) }, uSpeed: { value: 17 }, uLen: { value: 0.62 }, uAlpha: { value: 0.38 } },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed; attribute float aEnd;
        uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform vec2 uWind; uniform float uSpeed; uniform float uLen;
        varying float vA;
        void main() {
          float sp = uSpeed * (0.85 + aSeed.y * 0.3);
          vec3 p = aSeed * uBox;
          float k = uTime * sp;
          p += vec3(uWind.x, -uSpeed, uWind.y) * (k / uSpeed);
          vec3 origin = uCam - uBox * 0.5;
          p = origin + mod(p - origin, uBox);
          vec3 dir = normalize(vec3(uWind.x, -uSpeed, uWind.y));
          p -= dir * uLen * aEnd * (0.7 + aSeed.z * 0.6);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vA = (1.0 - aEnd) * smoothstep(0.4, 2.2, d) * (1.0 - smoothstep(14.0, 24.0, d));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha; varying float vA;
        void main() { gl_FragColor = vec4(vec3(0.72, 0.8, 0.95) * vA * uAlpha, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const obj = new THREE.LineSegments(geo, mat);
  obj.frustumCulled = false;
  obj.renderOrder = 8;
  return {
    obj,
    update(t, cam) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uCam.value.copy(cam);
    },
    set(o) {
      if (o.alpha !== undefined) mat.uniforms.uAlpha.value = o.alpha;
      if (o.speed !== undefined) mat.uniforms.uSpeed.value = o.speed;
    },
  };
}

// ------------------------------------------------------------------ rising embers (GPU)
export interface Embers {
  obj: THREE.Points;
  update(t: number): void;
  /** Brief surge (bell toll). */
  surge(k?: number): void;
  setPixelScale(h: number): void;
}
export function embers(count: number, origin: THREE.Vector3, o: { spread?: number; height?: number; size?: number; color?: number; speed?: number; wind?: [number, number] } = {}): Embers {
  const geo = own(new THREE.BufferGeometry());
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seeds[i] = Math.random();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const col = new THREE.Color(o.color ?? 0xff8a30);
  const mat = own(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOrigin: { value: origin.clone() },
        uSpread: { value: o.spread ?? 1.2 },
        uHeight: { value: o.height ?? 6 },
        uSize: { value: o.size ?? 0.09 },
        uSpeed: { value: o.speed ?? 0.12 },
        uWind: { value: new THREE.Vector2(...(o.wind ?? [-0.8, 0.3])) },
        uColor: { value: new THREE.Vector3(col.r, col.g, col.b) },
        uSurge: { value: 0 },
        uScale: { value: 400 },
        uTex: { value: glowTexture() },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime; uniform vec3 uOrigin; uniform float uSpread; uniform float uHeight; uniform float uSize; uniform float uSpeed; uniform vec2 uWind; uniform float uSurge; uniform float uScale;
        varying float vA; varying float vHot;
        void main() {
          float life = fract(uTime * uSpeed * (0.6 + aSeed.w * 0.8) + aSeed.x);
          float ang = aSeed.y * 6.2831 + life * (2.0 + aSeed.z * 3.0);
          float r = uSpread * (0.15 + aSeed.z) * (0.4 + life);
          vec3 p = uOrigin + vec3(cos(ang) * r, life * uHeight, sin(ang) * r * 0.6);
          p.xz += uWind * life * life * uHeight * 0.5;
          vA = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.55, 1.0, life)) * (0.55 + 0.45 * sin(uTime * 9.0 + aSeed.x * 40.0));
          vA *= 1.0 + uSurge * 1.5;
          vHot = 1.0 - life;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * (1.0 + uSurge * 0.6) * (0.6 + aSeed.w) * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; uniform vec3 uColor; varying float vA; varying float vHot;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          vec3 c = mix(uColor * 0.6, vec3(1.0, 0.9, 0.7), vHot * 0.5);
          gl_FragColor = vec4(c * t.a * vA * 2.0, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  mat.toneMapped = false;
  const obj = new THREE.Points(geo, mat);
  obj.frustumCulled = false;
  obj.renderOrder = 9;
  let surge = 0;
  let last = 0;
  return {
    obj,
    update(t) {
      const dt = Math.max(0, Math.min(0.1, t - last));
      last = t;
      surge = Math.max(0, surge - dt * 0.8);
      mat.uniforms.uTime.value = t;
      mat.uniforms.uSurge.value = surge;
    },
    surge(k = 1) {
      surge = Math.max(surge, k);
    },
    setPixelScale(h) {
      mat.uniforms.uScale.value = h * 0.55;
    },
  };
}

// ------------------------------------------------------------------ fog cards
export function fogCard(w: number, h: number, color: number, opacity: number, speed: number): THREE.Mesh {
  const tex = cloudTexture().clone();
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  const mat = own(new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, fog: true }));
  mat.addEventListener('dispose', () => tex.dispose());
  const m = new THREE.Mesh(own(new THREE.PlaneGeometry(w, h)), mat);
  m.userData.speed = speed;
  m.renderOrder = 4;
  return m;
}

// ------------------------------------------------------------------ the cracked bell (procedural, lathe)
/** Outer profile (radius, height) from crown to lip, then the inner wall back up. Height 1 = crown. */
const BELL_PROFILE: [number, number][] = (
  [
    [0.0, 1.0],
    [0.2, 1.0],
    [0.36, 0.975],
    [0.47, 0.9],
    [0.52, 0.72],
    [0.54, 0.5],
    [0.6, 0.27],
    [0.7, 0.1],
    [0.78, 0.025],
    [0.8, 0.0],
    [0.73, 0.0],
    [0.66, 0.06],
    [0.52, 0.3],
    [0.46, 0.62],
    [0.36, 0.86],
    [0.0, 0.9],
  ] as [number, number][]
).map(([r, y]) => [r * 0.64, y]);
function outerRadius(y: number) {
  for (let i = 0; i < 9; i++) {
    const [r0, y0] = BELL_PROFILE[i];
    const [r1, y1] = BELL_PROFILE[i + 1];
    if (y <= y0 && y >= y1) return r0 + ((r1 - r0) * (y0 - y)) / Math.max(1e-5, y0 - y1);
  }
  return 0.5;
}

export interface Bell {
  /** Pivot at the top of the bell (rotate .rotation.x/z to swing). */
  pivot: THREE.Group;
  crackMat: THREE.MeshBasicMaterial;
  glow: THREE.PointLight;
  /** Crack heat 0..1 (drives emissive + light). */
  heat: number;
  /** Swing amplitude (radians), decays. */
  swing: number;
  /** World position of the crack centre. */
  crackPoint(): THREE.Vector3;
  update(dt: number, t: number): void;
  toll(strength?: number): void;
}

export function crackedBell(height = 3, bronze?: THREE.Material): Bell {
  const pivot = new THREE.Group();
  pivot.name = 'cinema-bell';
  const holder = new THREE.Group();
  holder.position.y = -height; // hang below the pivot
  holder.scale.setScalar(height);
  pivot.add(holder);
  const pts = BELL_PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = own(new THREE.LatheGeometry(pts, 56));
  geo.computeVertexNormals();
  const mat = bronze ?? own(new THREE.MeshStandardMaterial({ color: 0xbd8a4e, metalness: 0.35, roughness: 0.42, emissive: 0x2a1406, emissiveIntensity: 0.7 }));
  const bell = new THREE.Mesh(geo, mat);
  bell.castShadow = true;
  holder.add(bell);
  // decorative raised bands
  const bandMat = own(new THREE.MeshStandardMaterial({ color: 0xb98a4a, metalness: 0.85, roughness: 0.3 }));
  for (const [y, w] of [
    [0.88, 0.012],
    [0.82, 0.009],
    [0.16, 0.014],
    [0.1, 0.01],
  ] as const) {
    const r = outerRadius(y);
    const band = new THREE.Mesh(own(new THREE.TorusGeometry(r, w, 6, 56)), bandMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    holder.add(band);
  }
  // crown + canons
  const crown = new THREE.Mesh(own(new THREE.TorusGeometry(0.09, 0.03, 8, 20)), bandMat);
  crown.position.y = 1.06;
  holder.add(crown);
  // the crack: a jagged ribbon on the surface facing +Z, from the lip up to the shoulder (random walk)
  const crackPts: THREE.Vector3[] = [];
  const N = 26;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  let th = 0.14;
  for (let i = 0; i <= N; i++) {
    const y = 0.015 + (i / N) * 0.86;
    th = THREE.MathUtils.clamp(th + rnd() * 0.11, 0.02, 0.3);
    crackPts.push(new THREE.Vector3(th, y, 0.012 + Math.abs(rnd()) * 0.016 * (1 - (i / N) * 0.6)));
  }
  const ribbon = (pts: THREE.Vector3[], widen: number, lift: number) => {
    const pos: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const r = outerRadius(p.y) + lift;
      const w = p.z * widen;
      for (const sgn of [-1, 1]) {
        const a = p.x + (sgn * w) / Math.max(0.15, r);
        pos.push(Math.sin(a) * r, p.y, Math.cos(a) * r);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const g = own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  };
  // two short branches
  const branch = (from: number, dir: number) => {
    const out: THREE.Vector3[] = [];
    const p0 = crackPts[from];
    let a = p0.x;
    for (let i = 0; i < 6; i++) {
      a += dir * (0.025 + Math.abs(rnd()) * 0.03);
      out.push(new THREE.Vector3(a, p0.y + i * 0.018 * (dir > 0 ? 1 : 0.6) + rnd() * 0.01, 0.008 * (1 - i / 6) + 0.002));
    }
    return out;
  };
  const burnMat = own(new THREE.MeshBasicMaterial({ color: 0x050200, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  const crackMat = own(new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }));
  crackMat.toneMapped = false;
  for (const pts of [crackPts, branch(7, 1), branch(16, -1)]) {
    const burn = new THREE.Mesh(ribbon(pts, 2.6, 0.003), burnMat);
    burn.renderOrder = 5;
    const crack = new THREE.Mesh(ribbon(pts, 1, 0.005), crackMat);
    crack.renderOrder = 6;
    holder.add(burn, crack);
  }
  const mid = crackPts[Math.floor(N * 0.45)];
  const midR = outerRadius(mid.y);
  const crackLocal = new THREE.Vector3(Math.sin(mid.x) * midR, mid.y, Math.cos(mid.x) * midR);
  const glowSpr = glowSprite(0xff7a2a, 0.9, 0.7);
  glowSpr.position.copy(crackLocal).multiplyScalar(1.04);
  glowSpr.scale.setScalar(0.5);
  holder.add(glowSpr);
  const glow = new THREE.PointLight(0xff7a2a, 6, height * 2.6, 1.8);
  glow.position.copy(crackLocal).multiplyScalar(1.25);
  holder.add(glow);
  const mouth = new THREE.PointLight(0xff6a1a, 4, height * 1.6, 2);
  mouth.position.set(0, 0.18, 0);
  holder.add(mouth);
  const B: Bell = {
    pivot,
    crackMat,
    glow,
    heat: 0.55,
    swing: 0,
    crackPoint() {
      holder.updateWorldMatrix(true, false);
      return crackLocal.clone().applyMatrix4(holder.matrixWorld);
    },
    update(dt, t) {
      B.swing = Math.max(0, B.swing - dt * 0.09);
      pivot.rotation.x = Math.sin(t * 1.9) * B.swing;
      pivot.rotation.z = Math.sin(t * 1.9 + 0.6) * B.swing * 0.25;
      const h = B.heat * (0.85 + Math.sin(t * 5.3) * 0.08 + Math.sin(t * 13.1) * 0.06);
      crackMat.color.setRGB(1.0 * Math.min(1.6, 0.4 + h * 1.6), 0.55 * Math.min(1.6, 0.3 + h * 1.3), 0.2 * h);
      crackMat.opacity = Math.min(1, 0.25 + h);
      glow.intensity = 9 * h;
      mouth.intensity = 5 * h;
      (glowSpr.material as THREE.SpriteMaterial).opacity = Math.min(1, h);
      glowSpr.scale.setScalar(0.4 + h * 0.6);
      B.heat = Math.max(0.5, B.heat - dt * 0.35);
    },
    toll(strength = 1) {
      B.swing = Math.min(0.28, B.swing + 0.14 * strength);
      B.heat = Math.min(1.4, 0.9 + strength * 0.5);
    },
  };
  return B;
}
