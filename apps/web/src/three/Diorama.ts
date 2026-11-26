/**
 * Diorama — Three.js renderer for exploration and combat.
 * It OBSERVES game state and domain events and schedules animations; it never decides tactical math.
 * Animation queue is skippable (speed multiplier / fast-forward) and never blocks the rules engine.
 *
 * Look: quality presets (low = direct render, no shadows; medium = shadows + bloom + grade; high = + GTAO,
 * bigger shadow maps), a capped render pixel ratio, per-location palette (fog, exposure, colour grade).
 * Juice: anticipation → lunge → impact (hit-stop, flash, recoil, shake) → recovery; critical hits get a
 * slow-motion punch-in; deaths collapse then dissolve with glowing edges; the camera leans into each action.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { intentFor, type CombatState, type DomainEvent, type Figure, type SectorKey } from '@mosteiro/core';
import { buildEnemy, buildHero, CLASS_ACCENT, type Rig } from './characters';
import { buildEnemySkinned, buildHeroSkinned, hasSkinnedEnemy, projectileModel } from './skinned';
import { buildScene, roomPalette, type BuiltScene } from './scenes';
import { VFX, blobTexture, ringTexture, plateGlowTexture, plateTopTexture } from './vfx';
import { model, setAnisotropy, flat, sprite, kitTime } from './assets';

export type Quality = 'low' | 'medium' | 'high';

/** Per-quality render settings. dpr = cap on the device pixel ratio; px = cap on drawing-buffer pixels. */
const PRESETS: Record<Quality, { dpr: number; minDpr: number; px: number; shadows: boolean; post: boolean; ao: boolean; samples: number; vfx: number }> = {
  low: { dpr: 1.25, minDpr: 0.75, px: 0.75e6, shadows: false, post: false, ao: false, samples: 0, vfx: 0.5 },
  medium: { dpr: 1.75, minDpr: 1, px: 1.6e6, shadows: true, post: true, ao: false, samples: 4, vfx: 0.8 },
  high: { dpr: 2.25, minDpr: 1, px: 2.6e6, shadows: true, post: true, ao: true, samples: 4, vfx: 1 },
};

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.012 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uLift: { value: new THREE.Color(0x0a0812) },
    uGain: { value: new THREE.Color(0xfff2e0) },
    uSat: { value: 1.05 },
    uContrast: { value: 1.06 },
    uAberration: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uGrain; uniform float uFlash; uniform vec3 uFlashColor;
    uniform vec3 uLift; uniform vec3 uGain; uniform float uSat; uniform float uContrast; uniform float uAberration;
    varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      vec4 c = texture2D(tDiffuse, vUv);
      if (uAberration > 0.0) {
        vec2 o = d * uAberration;
        c.r = texture2D(tDiffuse, vUv + o).r;
        c.b = texture2D(tDiffuse, vUv - o).b;
      }
      // display-space grade: lift the shadows toward the location's tint, tint the highlights
      c.rgb = c.rgb * uGain + uLift * (1.0 - c.rgb);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
      // vignette (soft, oval)
      vec2 dv = d; dv.x *= 1.15;
      float v = smoothstep(0.92, 0.28, length(dv));
      c.rgb *= mix(1.0 - uVignette * 0.6, 1.0, v);
      // fine grain, stronger in the shadows
      c.rgb += (rand(vUv * 731.0 + fract(uTime)) - 0.5) * uGrain * (1.2 - l);
      c.rgb = mix(c.rgb, uFlashColor, uFlash);
      gl_FragColor = vec4(max(c.rgb, 0.0), 1.0);
    }`,
};

// ------------------------------------------------------------------ board geometry
const COL_X = (col: number) => (col - 3) * 2.0;
const ROW_Z: Record<string, number> = { 'E:R': -3.55, 'E:F': -1.45, 'H:F': 1.45, 'H:R': 3.55 };
export function sectorCenter(k: SectorKey): THREE.Vector3 {
  return new THREE.Vector3(COL_X(Number(k[3])), 0, ROW_Z[k.slice(0, 3)]);
}

const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);
const easeInCubic = (k: number) => k * k * k;
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const UP = new THREE.Vector3(0, 1, 0);

interface FigView {
  id: string;
  rig: Rig;
  sector: SectorKey;
  slot: number;
  side: 'H' | 'E';
  pos: THREE.Vector3;
  status: Figure['status'];
  typeId: string;
  tween: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; hop: number } | null;
  anim: { kind: string; t: number; dur: number; dir?: THREE.Vector3 } | null;
  fallen: number; // 0..1
  dead: boolean;
  deathT: number;
  flash: number;
  plate?: HTMLElement;
  hidden: boolean;
  phase: number;
  weaponIcon?: string;
  /** soft contact shadow + selection ring (scene-level decals that follow the figure) */
  blob: THREE.Mesh;
  ring: THREE.Mesh;
  /** choreography offset on top of the slot position (lunges, recoils, dodges) */
  off: THREE.Vector3;
  offTween: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; ease: (k: number) => number; then?: () => void } | null;
  /** explicit facing (yaw) while acting; null = face the other side */
  faceYaw: number | null;
  /** forward lean (anticipation / recoil) */
  lean: number;
  leanTarget: number;
  /** coloured rim pulse (heal, guard, buff) */
  glow: { color: THREE.Color; t: number; dur: number } | null;
  /** seconds until the next idle variation */
  idleT: number;
}

interface Task {
  dur: number;
  t: number;
  /** id of the attacker whose strike this task belongs to (area attacks chain several) */
  strikeOf?: string;
  start?: () => void;
  tick?: (k: number, dt: number) => void;
  end?: () => void;
  started?: boolean;
  /**
   * A gate: once `dur` has run, the task stays at the head of the queue until `done()` (e.g. the dice overlay
   * reported that the result has been shown), or until a safety limit passes — `maxQ` queue-seconds or
   * `maxWallMs` of wall-clock time, whichever comes first — so a lost signal can never stall the board.
   */
  hold?: { done: () => boolean; maxQ: number; maxWallMs: number; wall0?: number };
  /** this task starts a blow: the dice on screen burst into sparks that reach `targetId` in `arrive` queue-seconds */
  releaseDice?: { targetId: string; arrive: number };
}

/** Dice ⇄ board handshake (window events; see ui/combat/Dice3D.tsx). */
const DICE_SIGNAL = 'mosteiro:dice';
const DICE_RELEASE = 'mosteiro:dice-release';
type DiceSpark = { x: number; y: number; kind: string };
/** wall clock for the dice gate (tests can drive it with `window.__diceClock`, like the dice overlay) */
const diceNow = () => {
  const c = (window as unknown as { __diceClock?: number }).__diceClock;
  return typeof c === 'number' ? c : performance.now();
};
const reducedMotion = () => typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduced';

export interface Highlight {
  figures: Map<string, 'attack' | 'ally' | 'active' | 'hover' | 'intent'>;
  sectors: Map<SectorKey, 'move' | 'attack' | 'ally' | 'area' | 'deploy' | 'objective'>;
}

export interface DioramaCallbacks {
  onSectorClick?(k: SectorKey): void;
  onFigureClick?(id: string): void;
  onHover?(info: { figureId?: string; sector?: SectorKey; x: number; y: number } | null): void;
  onRoll?(ev: Extract<DomainEvent, { type: 'roll' }>): void;
  onSound?(id: string, opts?: { volume?: number; delay?: number }): void;
  onQueueIdle?(): void;
}

/** world = real-time exploration (apps/web/src/world), cinema = cutscenes (apps/web/src/cinema). */
export type DioramaMode = 'title' | 'explore' | 'combat' | 'world' | 'cinema';

/** A camera driver plugged in by the world or cinema modules; return true when it set the camera this frame. */
export interface CameraController {
  update(camera: THREE.PerspectiveCamera, dt: number, t: number): boolean;
}

export class Diorama {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 160);
  composer!: EffectComposer;
  bloom!: UnrealBloomPass;
  grade!: ShaderPass;
  private gtao: GTAOPass | null = null;
  vfx = new VFX();
  quality: Quality = 'medium';
  private clock = new THREE.Clock();
  private envScene: BuiltScene | null = null;
  private sceneId = '';
  private boardGroup = new THREE.Group();
  private plates = new Map<SectorKey, { mesh: THREE.Object3D; hl: THREE.Mesh; cover?: THREE.Object3D }>();
  private markers = new THREE.Group();
  figs = new Map<string, FigView>();
  private queue: Task[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hoverSector: SectorKey | null = null;
  private hoverFig: string | null = null;
  private highlight: Highlight = { figures: new Map(), sectors: new Map() };
  private engageLines = new THREE.Group();
  speed = 1;
  mode: DioramaMode = 'title';
  private camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private shake = 0;
  private flash = 0;
  private aberration = 0;
  /** hit-stop (real seconds of near-freeze) and slow motion (real seconds, time scale) */
  private hitStop = 0;
  private slowMo = 0;
  private slowMoScale = 1;
  /** camera lean into the action */
  private punch = { at: new THREE.Vector3(), amt: 0, want: 0, hold: 0 };
  private running = true;
  private raf = 0;
  private lastState: CombatState | null = null;
  private exploreParty: { id: string; classId: string; weaponIcon?: string }[] = [];
  stats = { fps: 0, frameMs: 0, calls: 0, tris: 0, geos: 0, texs: 0, sceneLoadMs: 0, dpr: 1 };
  private fpsAcc = 0;
  private fpsN = 0;
  private dpr = 1;
  private autoQuality = true;
  /** no auto-downgrade while a scene is still compiling/loading */
  private qualityGrace = 0;
  private slowFrames = 0;
  /** fallback light used only while no location backdrop is visible */
  private stage: THREE.SpotLight;

  constructor(
    private container: HTMLElement,
    private labels: HTMLElement,
    public cb: DioramaCallbacks = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.domElement.className = 'three';
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    setAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x0e0c0c);
    this.scene.add(this.boardGroup, this.vfx.group, this.markers, this.engageLines);
    this.stage = new THREE.SpotLight(0xfff0dc, 70, 30, 0.75, 0.6, 1.4);
    this.stage.position.set(0, 13, 6);
    this.stage.target.position.set(0, 0, -0.5);
    this.scene.add(this.stage, this.stage.target);
    this.camera.position.set(0, 9, 12);
    this.camPos.copy(this.camera.position);
    this.setupComposer();
    this.buildBoard();
    this.resize();
    // the phone can be played upright or sideways: follow every rotation (some Android browsers report the
    // old size right after turning, so re-measure again a moment later)
    window.addEventListener('resize', this.onViewportChange);
    window.addEventListener('orientationchange', this.onViewportChange);
    screen.orientation?.addEventListener?.('change', this.onViewportChange);
    window.visualViewport?.addEventListener('resize', this.onViewportChange);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerleave', () => this.setHover(null, null, 0, 0));
    this.renderer.domElement.addEventListener('pointerup', (e) => void this.pointerOverride?.(e, 'up'));
    window.addEventListener(DICE_SIGNAL, this.onDiceSignal);
    this.loop();
  }

  // ------------------------------------------------------------------ setup
  private setupComposer() {
    const P = PRESETS[this.quality];
    this.composer?.dispose();
    this.gtao?.dispose();
    this.gtao = null;
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: P.samples });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (P.ao) {
      this.gtao = new GTAOPass(this.scene, this.camera, 2, 2);
      this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12, distanceFallOff: 1 });
      // glows, light shafts, decals and particles must not occlude anything: keep them out of the AO normal pass
      const pass = this.gtao as unknown as { overrideVisibility(): void };
      const base = pass.overrideVisibility.bind(pass);
      pass.overrideVisibility = () => {
        base();
        this.scene.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (m && !Array.isArray(m) && (m.transparent || m.blending === THREE.AdditiveBlending)) o.visible = false;
        });
      };
      this.gtao.blendIntensity = 0.85;
      this.composer.addPass(this.gtao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.62, 0.55, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    const prev = this.grade?.uniforms;
    this.grade = new ShaderPass(GRADE_SHADER);
    if (prev) for (const k of Object.keys(prev)) if (k !== 'tDiffuse') this.grade.uniforms[k].value = prev[k].value;
    this.composer.addPass(this.grade);
  }

  setQuality(q: Quality | 'auto') {
    this.autoQuality = q === 'auto';
    const qq: Quality = q === 'auto' ? (this.isMobile() ? 'medium' : 'high') : q;
    const changed = qq !== this.quality || !this.composer;
    this.applyQuality(qq);
    if (changed && this.envScene) {
      const id = this.sceneId;
      this.sceneId = '';
      void this.loadScene(id);
    }
  }
  private applyQuality(qq: Quality) {
    const rebuild = qq !== this.quality;
    this.quality = qq;
    const P = PRESETS[qq];
    this.renderer.shadowMap.enabled = P.shadows;
    this.vfx.density = P.vfx;
    if (rebuild) this.setupComposer();
    this.resize();
  }
  private isMobile() {
    return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || Math.min(window.innerWidth, window.innerHeight) < 560;
  }

  /** Portrait combat framing (tunable at runtime for device checks). */
  camTune = { y: 19, z: 16, lz: 0.6, fov: 40 };
  camTuneL = { y: 13.3, z: 12.1, lz: 2.25 };
  camTuneW = { x: 4.6, y: 13.4, z: 10.4, lz: -0.2 };
  camTuneWE = { x: 3.4, y: 4.8, z: 12.5, ly: 1.6, lz: -2.5 };
  camTuneE = { y: 5.6, z: 15.5, ly: 1.1, lz: 5.6 };

  private lastAspectWide: boolean | null = null;
  private snapCamera = false;
  private onViewportChange = () => {
    this.resize();
    setTimeout(this.resize, 120);
    setTimeout(this.resize, 400);
  };

  resize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const P = PRESETS[this.quality];
    // cap the pixel ratio and the total pixel count (a 2.8-dpr phone renders ~1–1.6 MP, not 2.5 MP)
    const dev = window.devicePixelRatio || 1;
    this.dpr = Math.max(Math.min(dev, P.minDpr), Math.min(dev, P.dpr, Math.sqrt(P.px / Math.max(1, w * h))));
    this.stats.dpr = +this.dpr.toFixed(2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    const wide = w >= h;
    if (this.lastAspectWide !== null && this.lastAspectWide !== wide) this.snapCamera = true;
    this.lastAspectWide = wide;
    // framing per aspect: upright phones, tablets, laptops, phones held sideways
    this.camera.fov = this.modeFov();
    this.camera.updateProjectionMatrix();
    this.vfx.setPixelScale(h * this.dpr);
    this.envScene?.setPixelScale(this.glowScale());
  };
  /** Vertical field of view for the built-in framing of the current mode and aspect. */
  private modeFov() {
    const a = this.camera.aspect;
    if (this.mode === 'title' || this.mode === 'explore') return a < 0.9 ? 52 : a < 1.2 ? 50 : a < 1.6 ? 44 : 40;
    return a < 0.9 ? this.camTune.fov : a < 1.2 ? 46 : a < 1.6 ? 40 : a > 1.9 ? 36 : 37;
  }
  /** Device pixels per world unit at distance 1 for the current projection. */
  private glowScale() {
    const h = (this.container.clientHeight || window.innerHeight) * this.dpr;
    return h / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
  }

  /** Board sectors: raised limestone slabs with a carved border (warm on the heroes' side, cold on the enemies'). */
  private buildBoard() {
    const W = 1.84;
    const D = 1.86;
    const r = 0.16;
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2 + r, -D / 2);
    shape.lineTo(W / 2 - r, -D / 2);
    shape.quadraticCurveTo(W / 2, -D / 2, W / 2, -D / 2 + r);
    shape.lineTo(W / 2, D / 2 - r);
    shape.quadraticCurveTo(W / 2, D / 2, W / 2 - r, D / 2);
    shape.lineTo(-W / 2 + r, D / 2);
    shape.quadraticCurveTo(-W / 2, D / 2, -W / 2, D / 2 - r);
    shape.lineTo(-W / 2, -D / 2 + r);
    shape.quadraticCurveTo(-W / 2, -D / 2, -W / 2 + r, -D / 2);
    const uvGen = {
      generateTopUV: (_g: THREE.ExtrudeGeometry, v: number[], a: number, b: number, c: number) => [a, b, c].map((i) => new THREE.Vector2((v[i * 3] + W / 2) / W, (v[i * 3 + 1] + D / 2) / D)),
      generateSideWallUV: () => [new THREE.Vector2(0.02, 0.5), new THREE.Vector2(0.02, 0.5), new THREE.Vector2(0.02, 0.5), new THREE.Vector2(0.02, 0.5)],
    };
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.03, bevelSegments: 2, curveSegments: 4, UVGenerator: uvGen as unknown as THREE.UVGenerator });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -0.035, 0);
    const top = plateTopTexture();
    const mats = {
      H: new THREE.MeshStandardMaterial({ map: top, color: 0xcfc2ae, roughness: 0.86 }),
      E: new THREE.MeshStandardMaterial({ map: top, color: 0x9a98a2, roughness: 0.86 }),
    };
    const hlGeo = new THREE.PlaneGeometry(W + 0.16, D + 0.16);
    for (const side of ['E', 'H'] as const)
      for (const row of ['F', 'R'] as const)
        for (let col = 1; col <= 5; col++) {
          const k = `${side}:${row}${col}` as SectorKey;
          const p = new THREE.Mesh(geo, mats[side]);
          p.position.copy(sectorCenter(k));
          p.castShadow = false;
          p.receiveShadow = true;
          p.userData.sector = k;
          const hl = new THREE.Mesh(hlGeo, new THREE.MeshBasicMaterial({ map: plateGlowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
          hl.rotation.x = -Math.PI / 2;
          hl.position.copy(sectorCenter(k)).setY(0.115);
          hl.userData.sector = k;
          hl.renderOrder = 3;
          this.boardGroup.add(p, hl);
          this.plates.set(k, { mesh: p, hl });
        }
  }

  // ------------------------------------------------------------------ scenes
  async loadScene(sceneId: string) {
    if (sceneId === this.sceneId) return;
    const t0 = performance.now();
    this.sceneId = sceneId;
    const built = await buildScene(sceneId, this.quality);
    if (this.sceneId !== sceneId) {
      built.dispose();
      return;
    }
    if (this.envScene) {
      this.scene.remove(this.envScene.group);
      this.envScene.dispose();
    }
    this.envScene = built;
    built.group.visible = !this.envHidden;
    this.scene.add(built.group);
    this.applyLook(sceneId);
    built.setPixelScale(this.glowScale());
    this.vfx.emberSources = built.emberSources;
    this.vfx.dustSources = built.dustSources;
    this.vfx.setAmbience(built.particles);
    this.stats.sceneLoadMs = Math.round(performance.now() - t0);
    this.qualityGrace = performance.now() + 6000;
    this.flash = 0.6; // soft fade-in from dark
    this.grade.uniforms.uFlashColor.value.set(0x0b0909);
  }

  /** Location palette: fog, exposure and the colour grade. */
  private applyLook(sceneId: string) {
    const look = this.envScene?.look ?? roomPalette(sceneId);
    this.scene.fog = new THREE.FogExp2(look.fog, look.fogDensity);
    this.scene.background = new THREE.Color(look.fog);
    this.renderer.toneMappingExposure = look.exposure;
    const u = this.grade.uniforms;
    u.uLift.value.set(look.grade.lift);
    u.uGain.value.set(look.grade.gain);
    u.uSat.value = look.grade.sat;
    u.uContrast.value = look.grade.contrast;
    u.uVignette.value = look.grade.vignette;
  }

  setMode(mode: DioramaMode) {
    this.mode = mode;
    this.boardGroup.visible = mode === 'combat';
    if (mode !== 'combat') {
      for (const [id, f] of this.figs) if (f.side === 'E') this.removeFig(id);
      for (const f of this.figs.values()) if (f.plate) f.plate.style.display = 'none';
      this.punch.want = 0;
    }
    // the world and cinema modules stage their own figures
    const own = mode === 'world' || mode === 'cinema';
    for (const f of this.figs.values()) f.rig.root.visible = !own || this.figuresForced;
    this.markers.visible = mode === 'combat';
    this.engageLines.visible = mode === 'combat';
  }

  // ------------------------------------------------------------------ extension points (world / cinema)
  private frameHooks = new Set<(dt: number, t: number) => void>();
  private figuresForced = false;
  /** Runs fn every frame (after the camera update, before rendering). Returns an unsubscribe function. */
  addFrameHook(fn: (dt: number, t: number) => void): () => void {
    this.frameHooks.add(fn);
    return () => this.frameHooks.delete(fn);
  }
  /** When set, drives the camera instead of the built-in per-mode framing (shake still applies). */
  cameraController: CameraController | null = null;
  /** Takes pointer input before board picking (tap-to-move in the world). Return true to consume the event. */
  pointerOverride: ((e: PointerEvent, kind: 'down' | 'move' | 'up') => boolean) | null = null;
  /** Show/hide the location backdrop built by loadScene. */
  setEnvironmentVisible(v: boolean) {
    this.envHidden = !v;
    if (this.envScene) this.envScene.group.visible = v;
  }
  private envHidden = false;
  /** Keep the board figures visible even in world/cinema modes (e.g. a cutscene staged on the board). */
  setFiguresVisible(v: boolean) {
    this.figuresForced = v;
    for (const f of this.figs.values()) f.rig.root.visible = v || (this.mode !== 'world' && this.mode !== 'cinema');
  }
  /** Feedback burst used by gameplay outside combat (hits in the world, cutscene beats). */
  impulse(o: { shake?: number; flash?: number; flashColor?: THREE.ColorRepresentation; hitStop?: number }) {
    if (o.shake) this.shake = Math.max(this.shake, o.shake);
    if (o.flash) {
      this.flash = Math.max(this.flash, o.flash);
      this.grade.uniforms.uFlashColor.value.set(o.flashColor ?? 0xffffff);
    }
    if (o.hitStop) this.hitStop = Math.max(this.hitStop, o.hitStop);
  }
  /** The currently loaded location backdrop (lights, props, bell, ember sources, walk data). */
  get environment() {
    return this.envScene;
  }
  /** The tactical board group (plates, dividers). */
  get board() {
    return this.boardGroup;
  }

  // ------------------------------------------------------------------ figures
  private building = new Map<string, Promise<FigView>>();
  private ensureFig(f: Figure, weaponIcon?: string): Promise<FigView> {
    const key = `${f.id}|${weaponIcon ?? ''}`;
    const cur = this.figs.get(f.id);
    if (cur && (f.side === 'E' || cur.weaponIcon === weaponIcon)) return Promise.resolve(cur);
    let p = this.building.get(key);
    if (!p) {
      p = this.buildFig(f, weaponIcon).finally(() => this.building.delete(key));
      this.building.set(key, p);
    }
    return p;
  }
  private async buildFig(f: Figure, weaponIcon?: string): Promise<FigView> {
    let v = this.figs.get(f.id);
    if (v && (f.side === 'E' || v.weaponIcon === weaponIcon)) return v;
    if (v) this.removeFig(f.id);
    let rig: Rig;
    try {
      rig = f.side === 'H' ? await buildHeroSkinned(f.typeId, weaponIcon) : hasSkinnedEnemy(f.typeId) ? await buildEnemySkinned(f.typeId) : await buildEnemy(f.typeId);
    } catch (e) {
      console.warn('skinned prefab failed, using procedural', e);
      rig = f.side === 'H' ? buildHero({ classId: f.typeId, weaponIcon }) : await buildEnemy(f.typeId);
    }
    if (this.figs.has(f.id) && this.figs.get(f.id)!.rig !== rig) {
      // another sync built it meanwhile
      const other = this.figs.get(f.id)!;
      if (other.weaponIcon === weaponIcon) return other;
    }
    if (f.side === 'E') rig.root.rotation.y = 0;
    else rig.root.rotation.y = Math.PI;
    this.scene.add(rig.root);
    const foot = Math.max(0.9, Math.min(2.2, rig.height * 0.62));
    const blob = new THREE.Mesh(Diorama.decalGeo, new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.62, color: 0x000000 }));
    blob.rotation.x = -Math.PI / 2;
    blob.scale.setScalar(foot);
    blob.renderOrder = 1;
    const ring = new THREE.Mesh(Diorama.decalGeo, new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(foot * 1.12);
    ring.renderOrder = 2;
    ring.visible = false;
    this.scene.add(blob, ring);
    if (rig.rim) {
      rig.rim.color.set(f.side === 'H' ? HERO_RIM : ENEMY_RIM);
      rig.rim.strength.value = f.side === 'H' ? 0.34 : 0.3;
    }
    v = {
      id: f.id,
      rig,
      sector: f.sector,
      slot: 0,
      side: f.side,
      pos: new THREE.Vector3(),
      status: f.status,
      typeId: f.typeId,
      tween: null,
      anim: null,
      fallen: f.status === 'caido' || f.status === 'derrotado' ? 1 : 0,
      dead: false,
      deathT: 0,
      flash: 0,
      hidden: false,
      phase: Math.random() * 10,
      weaponIcon,
      blob,
      ring,
      off: new THREE.Vector3(),
      offTween: null,
      faceYaw: null,
      lean: 0,
      leanTarget: 0,
      glow: null,
      idleT: 5 + Math.random() * 7,
    };
    if (this.mode === 'world' || this.mode === 'cinema') rig.root.visible = this.figuresForced;
    // nameplate
    const plate = document.createElement('div');
    plate.className = `nameplate ${f.side === 'E' ? 'enemy' : 'hero'}`;
    this.labels.appendChild(plate);
    v.plate = plate;
    this.figs.set(f.id, v);
    return v;
  }
  private static decalGeo = new THREE.PlaneGeometry(1, 1);
  private removeFig(id: string) {
    const v = this.figs.get(id);
    if (!v) return;
    this.scene.remove(v.rig.root, v.blob, v.ring);
    (v.blob.material as THREE.Material).dispose();
    (v.ring.material as THREE.Material).dispose();
    v.plate?.remove();
    this.figs.delete(id);
  }

  private slotPositions(state: { figures: Figure[] }) {
    const bySector = new Map<SectorKey, Figure[]>();
    for (const f of state.figures) {
      if (f.status === 'dead' || f.status === 'reserve') continue;
      const l = bySector.get(f.sector) ?? [];
      l.push(f);
      bySector.set(f.sector, l);
    }
    const out = new Map<string, THREE.Vector3>();
    for (const [k, list] of bySector) {
      const c = sectorCenter(k);
      list.sort((a, b) => a.order - b.order);
      list.forEach((f, i) => {
        const off = list.length === 1 ? 0 : i === 0 ? -0.42 : 0.42;
        out.set(f.id, c.clone().add(new THREE.Vector3(off, 0.12, list.length === 1 ? 0 : i === 0 ? 0.12 : -0.12)));
      });
    }
    return out;
  }

  /** Reconcile figures with combat state (positions are authoritative once the animation queue is idle). */
  async syncCombat(S: CombatState, weapons: Record<string, string | undefined>) {
    this.lastState = S;
    const slots = this.slotPositions(S);
    const present = new Set<string>();
    // build all prefabs in parallel (first sync of an encounter)
    await Promise.all(S.figures.filter((f) => f.status !== 'reserve' && f.status !== 'dead').map((f) => this.ensureFig(f, weapons[f.id] ?? this.figs.get(f.id)?.weaponIcon)));
    for (const f of S.figures) {
      if (f.status === 'reserve') continue;
      if (f.status === 'dead') {
        const v = this.figs.get(f.id);
        if (v && !v.dead && !this.queue.length) this.removeFig(f.id);
        continue;
      }
      present.add(f.id);
      const v = await this.ensureFig(f, weapons[f.id] ?? this.figs.get(f.id)?.weaponIcon);
      v.status = f.status;
      const p = slots.get(f.id)!;
      if (!this.queue.length && !v.tween) {
        v.pos.copy(p);
        v.sector = f.sector;
      }
      if (!v.tween && !this.queue.length) v.fallen = f.status === 'active' ? 0 : 1;
      this.updatePlate(v, f, S);
    }
    for (const id of [...this.figs.keys()]) if (!present.has(id) && !this.figs.get(id)!.dead && !this.queue.length) this.removeFig(id);
    this.updateMarkers(S);
    this.updateEngagement(S);
  }

  /** Exploration: show the party standing in formation, enemies removed. */
  async syncParty(party: { id: string; classId: string; name: string; weaponIcon?: string; sector: SectorKey; down: boolean }[]) {
    const present = new Set(party.map((p) => p.id));
    for (const id of [...this.figs.keys()]) if (!present.has(id)) this.removeFig(id);
    const fake = { figures: party.map((p, i) => ({ id: p.id, sector: p.sector, status: 'active', order: i }) as Figure) };
    const slots = this.slotPositions(fake);
    for (const p of party) {
      const v = await this.ensureFig({ id: p.id, side: 'H', typeId: p.classId, name: p.name, sector: p.sector, status: p.down ? 'caido' : 'active' } as Figure, p.weaponIcon);
      v.pos.copy(slots.get(p.id)!);
      v.fallen = p.down ? 1 : 0;
      if (v.plate) v.plate.style.display = 'none';
    }
    this.exploreParty = party;
    this.engageLines.clear();
    this.markers.clear();
  }

  private updatePlate(v: FigView, f: Figure, S?: CombatState) {
    if (!v.plate) return;
    const pct = Math.max(0, f.hp / f.maxHp) * 100;
    if (f.side === 'H') {
      // heroes: a slim life bar only (details live in the portrait dock)
      if (f.status !== 'active') {
        v.plate.style.display = 'none';
        return;
      }
      v.plate.style.display = '';
      v.plate.innerHTML = `<div class="np-bar"><i style="width:${pct}%"></i></div>`;
      return;
    }
    const conds: string[] = [];
    const C = f.conditions;
    if (C.guardado) conds.push('guardado');
    if (C.exposto) conds.push('exposto');
    if (C.quebrado) conds.push('quebrado');
    if (C.imobilizado) conds.push('imobilizado');
    if (C.queimando) conds.push('queimando');
    if (C.sangramento) conds.push('sangramento');
    if (C.veneno) conds.push('veneno');
    if (C.julgadoPor) conds.push('julgado');
    const br = C.brechas ? `<span class="np-brecha">${'◆'.repeat(C.brechas)}</span>` : '';
    // the Intention this enemy will carry out, right above its head
    const it = S && f.status === 'active' ? intentFor(S, f.typeId) : null;
    const bandTempo: Record<string, string> = { ER: 'rapido', ET: 'tatico', EP: 'pesado' };
    const now = it && S && S.phase === 'enemyBand' && bandTempo[S.band] === it.tempo;
    const intent = it ? `<div class="np-intent ${now ? 'now' : ''}" title="${it.name}"><svg><use href="#tempo_${it.tempo}"/></svg>${it.dano !== undefined ? it.dano : ''}</div>` : '';
    v.plate.innerHTML = `${intent}<div class="np-bar"><i style="width:${pct}%"></i></div><div class="np-row"><span class="np-hp">${f.hp}</span>${f.armor ? `<span class="np-arm">${f.armor}</span>` : ''}${conds.map((c) => `<svg class="np-c c-${c}"><use href="#cond_${c}"/></svg>`).join('')}${br}</div>`;
  }

  private updateMarkers(S: CombatState) {
    this.markers.clear();
    const bf = S.battlefield;
    for (const k of bf.cover) {
      const c = sectorCenter(k);
      void model('formation_divider', 'kit').then((m) => {
        m.position.copy(c).add(new THREE.Vector3(0, 0, k[0] === 'E' ? 0.86 : -0.86));
        m.scale.set(1.2, 0.8, 0.8);
        this.markers.add(m);
      });
    }
    for (const s of bf.smoke) {
      const c = sectorCenter(s.sector);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: sprite('textures/smoke_puff.png'), transparent: true, opacity: 0.55, depthWrite: false, color: 0xa8a29a }));
      m.rotation.x = -Math.PI / 2;
      m.position.copy(c).setY(0.6);
      m.userData.spin = 0.2;
      this.markers.add(m);
    }
    for (const s of bf.sigils) {
      const c = sectorCenter(s.sector);
      const color = s.kind === 'detonacao' ? 0xff7a50 : s.kind === 'estase' ? 0x8fb7ff : 0xb59cff;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: sprite('textures/rune_ring.png'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color }));
      m.rotation.x = -Math.PI / 2;
      m.position.copy(c).setY(0.13);
      m.userData.spin = 0.4;
      this.markers.add(m);
    }
    for (const a of bf.consecrated)
      for (const k of a.sectors) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: sprite('textures/holy_ring.png'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe0a0, opacity: 0.6 }));
        m.rotation.x = -Math.PI / 2;
        m.position.copy(sectorCenter(k)).setY(0.12);
        this.markers.add(m);
      }
  }

  private updateEngagement(S: CombatState) {
    this.engageLines.clear();
    for (let col = 1; col <= 5; col++) {
      const hf = S.figures.some((f) => f.side === 'H' && f.status === 'active' && f.sector === `H:F${col}`);
      const ef = S.figures.some((f) => f.side === 'E' && f.status === 'active' && f.sector === `E:F${col}`);
      if (!hf || !ef) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 1.0), new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(COL_X(col), 0.05, 0);
      this.engageLines.add(m);
      const x = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: sprite('textures/glow_radial.png'), color: 0xff5a3a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      x.rotation.x = -Math.PI / 2;
      x.position.set(COL_X(col), 0.06, 0);
      this.engageLines.add(x);
    }
  }

  setHighlight(h: Highlight) {
    this.highlight = h;
  }

  // ------------------------------------------------------------------ input
  private onPointerMove = (e: PointerEvent) => {
    if (this.pointerOverride?.(e, 'move')) return;
    const hit = this.pick(e);
    this.setHover(hit.figureId ?? null, hit.sector ?? null, e.clientX, e.clientY);
  };
  private onPointerDown = (e: PointerEvent) => {
    if (this.pointerOverride?.(e, 'down')) return;
    const hit = this.pick(e);
    if (e.pointerType !== 'mouse') this.setHover(hit.figureId ?? null, hit.sector ?? null, e.clientX, e.clientY);
    if (hit.figureId) this.cb.onFigureClick?.(hit.figureId);
    else if (hit.sector) this.cb.onSectorClick?.(hit.sector);
  };
  private setHover(fig: string | null, sector: SectorKey | null, x: number, y: number) {
    if (fig === this.hoverFig && sector === this.hoverSector) return;
    this.hoverFig = fig;
    this.hoverSector = sector;
    this.renderer.domElement.style.cursor = fig || sector ? 'pointer' : 'default';
    this.cb.onHover?.(fig || sector ? { figureId: fig ?? undefined, sector: sector ?? undefined, x, y } : null);
  }
  private pick(e: PointerEvent): { figureId?: string; sector?: SectorKey } {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.mode === 'combat') {
      // figures: test against simple proxy cylinders (screen-friendly hit area)
      let best: { id: string; d: number } | null = null;
      for (const [id, v] of this.figs) {
        if (v.dead || v.hidden) continue;
        const center = v.pos.clone().setY(v.rig.height * 0.5);
        const d = this.raycaster.ray.distanceToPoint(center);
        const rad = 0.42 * Math.max(1, v.rig.scale * 0.85);
        if (d < rad && (!best || d < best.d)) best = { id, d };
      }
      if (best) return { figureId: best.id, sector: this.figs.get(best.id)!.sector };
      const hits = this.raycaster.intersectObjects(this.boardGroup.children, true);
      for (const h of hits) {
        let o: THREE.Object3D | null = h.object;
        while (o && !o.userData.sector) o = o.parent;
        if (o?.userData.sector) return { sector: o.userData.sector };
      }
    }
    return {};
  }

  // ------------------------------------------------------------------ events → animation tasks
  get busy() {
    return this.queue.length > 0;
  }
  skip() {
    // fast-forward: every queued task runs to its end at once (gates included: nothing waits for the dice)
    this.skipping = true;
    try {
      while (this.queue.length) {
        const t = this.queue.shift()!;
        if (!t.started) t.start?.();
        t.tick?.(1, 0);
        t.end?.();
      }
    } finally {
      this.skipping = false;
    }
    this.rollGate = null;
    this.diceUp = null;
    this.clearSparks();
    window.dispatchEvent(new CustomEvent(DICE_RELEASE, { detail: { instant: true } }));
    for (const v of [...this.figs.values()]) {
      v.tween = null;
      v.anim = null;
      v.offTween = null;
      v.off.set(0, 0, 0);
      v.faceYaw = null;
      v.leanTarget = 0;
      if (v.dead) this.removeFig(v.id);
    }
    this.hitStop = 0;
    this.slowMo = 0;
    this.punch.want = 0;
    this.punch.hold = 0;
    for (const o of this.projectiles) this.scene.remove(o);
    this.projectiles.clear();
    if (this.lastState) void this.syncCombat(this.lastState, {});
  }

  play(events: DomainEvent[]) {
    this.batch = events;
    try {
      for (const ev of events) this.enqueueEvent(ev);
    } finally {
      this.batch = [];
    }
  }
  /** the events of the play() call being enqueued (lets a blow know it is lethal) */
  private batch: DomainEvent[] = [];
  private skipping = false;

  // ---------------------------------------------------------------- dice gate
  private rollSeq = 0;
  /** the roll whose dice are on screen right now and whether the overlay has shown its result */
  private rollGate: { seq: number; open: boolean; sparks: DiceSpark[]; defense: boolean } | null = null;
  /** a shown roll waiting for its blow (its sparks fly to the target when the strike starts) */
  private diceUp: { sparks: DiceSpark[]; defense: boolean } | null = null;
  private onDiceSignal = (e: Event) => {
    const d = (e as CustomEvent<{ seq?: number; phase?: string; sparks?: DiceSpark[]; defense?: boolean }>).detail;
    const g = this.rollGate;
    if (!g || !d || d.seq !== g.seq || d.phase !== 'shown') return;
    g.open = true;
    g.sparks = Array.isArray(d.sparks) ? d.sparks.slice(0, 9) : [];
    g.defense = !!d.defense;
  };
  /** Same time scale as the dice overlay (Dice3D diceTimeScale): battle speed and the test slow-down. */
  private diceScale() {
    const slow = (window as unknown as { __diceSlow?: number }).__diceSlow ?? 1;
    return Math.pow(Math.max(1, this.speed), -0.72) * Math.max(0.05, slow);
  }
  /**
   * The roll: the HUD shows the 3D dice (cb.onRoll) and the queue WAITS on this task until the overlay says the
   * result has landed and glowed (DICE_SIGNAL 'shown'); only then does the blow play. Safety: ~2.7 s of dice
   * (speed-scaled) + 2.5 s, in queue time or wall time, whichever ends first.
   */
  private enqueueRoll(ev: Extract<DomainEvent, { type: 'roll' }>) {
    const seq = ++this.rollSeq;
    let gated = false;
    const expected = 2.75 * this.diceScale();
    this.task({
      dur: 0.04,
      start: () => {
        // a new roll replaces dice still waiting for their blow
        if (this.diceUp) this.releaseDice(null);
        if (this.skipping || !this.cb.onRoll) return;
        gated = true;
        this.rollGate = { seq, open: false, sparks: [], defense: false };
        this.cb.onRoll({ ...ev, seq } as typeof ev);
      },
      hold: {
        done: () => !gated || !this.rollGate || this.rollGate.seq !== seq || this.rollGate.open,
        maxQ: (expected + 2.5) * Math.max(1, this.speed),
        maxWallMs: (expected + 2.5) * 1000,
      },
      end: () => {
        const g = this.rollGate;
        if (!g || g.seq !== seq) return;
        this.rollGate = null;
        if (!this.skipping) this.diceUp = { sparks: g.sparks, defense: g.defense };
      },
    });
  }
  /** The blow starts: the dice leave the screen; their successes fly to the target as sparks. */
  private releaseDice(to: { targetId: string; arrive: number } | null) {
    const up = this.diceUp;
    this.diceUp = null;
    window.dispatchEvent(new CustomEvent(DICE_RELEASE, { detail: { instant: false } }));
    if (!up || !to || !up.sparks.length) return;
    const tgt = this.figs.get(to.targetId);
    if (!tgt) return;
    this.launchSparks(up.sparks, tgt.id, Math.max(0.12, to.arrive), up.defense);
  }

  // ---------------------------------------------------------------- dice sparks (screen space, queue time)
  private sparkLayer: HTMLDivElement | null = null;
  private sparks: { els: HTMLDivElement[]; from: { x: number; y: number }; bend: number; targetId: string; t: number; dur: number; delay: number; color: string; last: { x: number; y: number } }[] = [];
  private launchSparks(src: DiceSpark[], targetId: string, arrive: number, defense: boolean) {
    if (!this.sparkLayer) {
      const L = document.createElement('div');
      L.setAttribute('aria-hidden', 'true');
      L.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:32;overflow:hidden;';
      document.body.appendChild(L);
      this.sparkLayer = L;
    }
    const colorOf = (k: string) => (defense ? '#9fd8ff' : k === 'crit' ? '#ffd760' : k === 'imp' ? '#ffbf48' : '#fff0c8');
    src.forEach((p, i) => {
      const color = colorOf(p.kind);
      const els: HTMLDivElement[] = [];
      for (let g = 0; g < 3; g++) {
        const el = document.createElement('div');
        const sz = g === 0 ? (p.kind === 'crit' ? 34 : 26) : g === 1 ? 17 : 11;
        el.style.cssText = `position:absolute;left:0;top:0;width:${sz}px;height:${sz}px;margin:${-sz / 2}px 0 0 ${-sz / 2}px;border-radius:50%;` + `background:radial-gradient(circle,#fff 0 22%,${color} 48%,rgba(0,0,0,0) 72%);box-shadow:0 0 ${g === 0 ? 18 : 10}px ${g === 0 ? 6 : 3}px ${color};` + `opacity:${g === 0 ? 1 : g === 1 ? 0.7 : 0.45};will-change:transform;transform:translate(${p.x}px,${p.y}px);`;
        this.sparkLayer!.appendChild(el);
        els.push(el);
      }
      // each spark leaves a little after the previous one; they all arrive together with the blow
      const delay = Math.min(0.08, arrive * 0.25) * (i / Math.max(1, src.length - 1 || 1));
      this.sparks.push({ els, from: { x: p.x, y: p.y }, bend: (i % 2 ? 1 : -1) * (40 + 25 * Math.random()), targetId, t: 0, dur: Math.max(0.08, arrive - delay), delay, color, last: { x: p.x, y: p.y } });
    });
  }
  private updateSparks(dt: number) {
    if (!this.sparks.length) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    for (const s of [...this.sparks]) {
      s.t += dt;
      const tgt = this.figs.get(s.targetId);
      const at = tgt ? this.chestPos(s.targetId).project(this.camera) : null;
      const to = at ? { x: rect.left + ((at.x + 1) / 2) * rect.width, y: rect.top + ((1 - at.y) / 2) * rect.height } : s.last;
      const pos = (k: number) => {
        // quadratic arc: up and out, then accelerating into the target
        const e = k * k * (1.6 - 0.6 * k);
        const cx = (s.from.x + to.x) / 2 + s.bend;
        const cy = Math.min(s.from.y, to.y) - 70;
        const u = 1 - e;
        return { x: u * u * s.from.x + 2 * u * e * cx + e * e * to.x, y: u * u * s.from.y + 2 * u * e * cy + e * e * to.y };
      };
      const k = Math.max(0, Math.min(1, (s.t - s.delay) / s.dur));
      s.els.forEach((el, g) => {
        const kk = Math.max(0, k - g * 0.07);
        const p = pos(kk);
        const q = pos(Math.min(1, kk + 0.03));
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        const stretch = 1 + Math.min(3, Math.hypot(q.x - p.x, q.y - p.y) / 9);
        el.style.transform = `translate(${p.x}px,${p.y}px) rotate(${ang}rad) scale(${stretch.toFixed(2)},${(1 / Math.sqrt(stretch)).toFixed(2)})`;
      });
      s.last = to;
      if (k >= 1) {
        for (const el of s.els) el.remove();
        this.sparks.splice(this.sparks.indexOf(s), 1);
      }
    }
  }
  private clearSparks() {
    for (const s of this.sparks) for (const el of s.els) el.remove();
    this.sparks = [];
  }

  private task(t: Omit<Task, 't'>) {
    this.queue.push({ ...t, t: 0 });
  }
  private headPos(id: string) {
    const v = this.figs.get(id);
    if (!v) return new THREE.Vector3();
    return this.figPos(v).setY(v.rig.height * 0.78);
  }
  private chestPos(id: string) {
    const v = this.figs.get(id);
    if (!v) return new THREE.Vector3();
    return this.figPos(v).setY(v.rig.height * 0.55);
  }
  /** where the figure is drawn right now (slot + choreography offset) */
  private figPos(v: FigView) {
    return v.pos.clone().add(v.off);
  }

  private pendingAttack: { sourceId: string; cat: string; school: string; targetId?: string; struck?: number } | null = null;

  /** Ease the figure's choreography offset to `to` (world vector) over `dur` game-seconds. */
  private offsetTo(v: FigView, to: THREE.Vector3, dur: number, ease: (k: number) => number = easeOutCubic, then?: () => void) {
    v.offTween = { from: v.off.clone(), to: to.clone(), t: 0, dur: Math.max(0.01, dur), ease, then };
  }
  private faceToward(v: FigView, target: THREE.Vector3) {
    const d = target.clone().sub(v.pos);
    v.faceYaw = Math.atan2(d.x, d.z);
  }
  /** Lean the camera toward a point (0..1) and hold for `hold` real seconds. */
  private punchTo(at: THREE.Vector3, amount: number, hold = 0.6) {
    this.punch.at.copy(at);
    this.punch.want = Math.max(this.punch.want, amount);
    this.punch.hold = Math.max(this.punch.hold, hold);
  }
  private isRanged(cat?: string) {
    return cat === 'distancia' || cat === 'global';
  }
  private isSpell(school?: string) {
    return school === 'arcane' || school === 'holy' || school === 'profane' || school === 'shadow' || school === 'bell' || school === 'fire';
  }

  private enqueueEvent(ev: DomainEvent) {
    const snd = (id: string, o?: { volume?: number; delay?: number }) => this.cb.onSound?.(id, o);
    switch (ev.type) {
      case 'cycleStart':
        this.task({ dur: 0.35, start: () => snd('cycle_start', { volume: 0.7 }) });
        break;
      case 'intentRevealed':
        this.task({
          dur: 0.18,
          start: () => {
            snd('intent_reveal', { volume: 0.6 });
            for (const v of this.figs.values()) if (v.typeId === ev.enemyType && !v.dead) v.anim = { kind: 'intent', t: 0, dur: 0.6 };
          },
        });
        break;
      case 'activationStart': {
        const v = this.figs.get(ev.figureId);
        if (v?.side === 'H') this.task({ dur: 0.05, start: () => snd('turn_start', { volume: 0.5 }) });
        break;
      }
      case 'attackDeclared': {
        this.pendingAttack = { sourceId: ev.sourceId, cat: ev.cat, school: ev.school, targetId: ev.targetIds[0] };
        const v = this.figs.get(ev.sourceId);
        if (!v) break;
        const tgt = ev.targetIds[0] ? this.figs.get(ev.targetIds[0]) : undefined;
        const spell = this.isSpell(ev.school);
        const ranged = this.isRanged(ev.cat);
        // ANTICIPATION: turn to the target, gather (lean back / raise the weapon), the camera leans in and
        // holds there while the dice roll (the blow itself waits for the dice — see enqueueRoll)
        this.task({
          dur: 0.22,
          start: () => {
            if (tgt) this.faceToward(v, tgt.pos);
            v.leanTarget = spell ? 0 : -0.14;
            if (spell) {
              v.anim = { kind: 'cast', t: 0, dur: 0.34 };
              this.vfx.charge(this.chestPos(v.id).add(new THREE.Vector3(0, 0.25, 0)), schoolColor(ev.school));
            } else if (ranged) v.anim = { kind: 'aim', t: 0, dur: 0.34 };
            const mid = tgt ? v.pos.clone().lerp(tgt.pos, 0.5) : v.pos.clone();
            this.punchTo(mid.setY(0.8), reducedMotion() ? 0.15 : ranged || spell ? 0.3 : 0.36, 3.2 * this.diceScale() + 0.4);
            snd(ev.school === 'arcane' ? 'spell_arcane_cast' : ev.school === 'holy' ? 'holy_cast' : ev.school === 'arrow' ? 'bow_draw' : ev.school === 'bolt' ? 'crossbow_shot' : ev.school === 'bell' ? 'bell_toll_short' : ev.cat === 'cac' ? 'swing_light' : 'swing_heavy', { volume: 0.8 });
          },
        });
        break;
      }
      case 'roll':
        this.enqueueRoll(ev);
        break;
      case 'hit':
      case 'miss':
        this.enqueueStrike(ev);
        break;
      case 'damage': {
        if (!ev.direct) break; // attack damage is already shown by the 'hit' event
        this.task({
          dur: 0.4,
          start: () => {
            const v = this.figs.get(ev.targetId);
            if (!v) return;
            const at = this.chestPos(ev.targetId);
            this.vfx.impact(at, ev.school, 0.6);
            v.flash = 1;
            v.anim = { kind: 'hurt', t: 0, dur: 0.35, dir: new THREE.Vector3() };
            this.floatText(at, `${ev.amount}`, ev.school === 'fire' ? 'burn' : ev.school === 'poison' ? 'poison' : ev.school === 'blood' ? 'bleed' : 'direct');
            snd(ev.school === 'fire' ? 'cond_burn' : ev.school === 'poison' ? 'cond_poison' : ev.school === 'blood' ? 'cond_bleed' : 'profane_hit', { volume: 0.7 });
          },
        });
        break;
      }
      case 'heal':
        this.task({
          dur: 0.5,
          start: () => {
            const v = this.figs.get(ev.targetId);
            const at = this.chestPos(ev.targetId);
            this.vfx.heal(v ? this.figPos(v) : at);
            if (v) v.glow = { color: new THREE.Color(0xb8ff9a), t: 0, dur: 0.9 };
            this.floatText(at, `+${ev.amount}`, 'heal');
            snd('heal', { volume: 0.8 });
          },
        });
        break;
      case 'condition':
        if (ev.condition === 'furtivo' && !ev.added) break;
        this.task({
          dur: ev.added ? 0.28 : 0.08,
          start: () => {
            if (!ev.added) return;
            const at = this.headPos(ev.targetId);
            this.vfx.condition(at, ev.condition);
            const v = this.figs.get(ev.targetId);
            if (v && ev.condition === 'guardado') {
              v.glow = { color: new THREE.Color(0x9fd0ff), t: 0, dur: 0.8 };
              this.vfx.shield(this.chestPos(ev.targetId), v.rig.height * 0.62);
            }
            if (v && (ev.condition === 'bencao' || ev.condition === 'julgado')) v.glow = { color: new THREE.Color(0xffe2a0), t: 0, dur: 0.8 };
            this.floatText(at.clone().add(new THREE.Vector3(0, 0.25, 0)), CONDITION_LABEL[ev.condition] ?? ev.condition, 'cond');
            const s: Record<string, string> = { guardado: 'guard_gain', veneno: 'cond_poison', sangramento: 'cond_bleed', queimando: 'cond_burn', atordoado: 'cond_stun', imobilizado: 'cond_immobilize', exposto: 'cond_exposed', quebrado: 'cond_broken', bencao: 'bless', julgado: 'holy_impact', furtivo: 'dash' };
            snd(s[ev.condition] ?? 'ui_click', { volume: 0.55 });
          },
        });
        break;
      case 'guardUsed':
        this.task({
          dur: 0.12,
          start: () => {
            const v = this.figs.get(ev.targetId);
            this.vfx.guard(this.chestPos(ev.targetId));
            if (v) this.vfx.shield(this.chestPos(ev.targetId), v.rig.height * 0.62);
          },
        });
        break;
      case 'move': {
        const v = this.figs.get(ev.figureId);
        if (!v) break;
        const to = this.lastState ? this.slotPositions({ figures: this.lastState.figures.map((f) => (f.id === ev.figureId ? { ...f, sector: ev.to } : f)) }).get(ev.figureId) ?? sectorCenter(ev.to) : sectorCenter(ev.to);
        const dur = ev.teleport ? 0.35 : ev.forced ? 0.32 : 0.5;
        this.task({
          dur,
          start: () => {
            v.tween = { from: v.pos.clone(), to: to.clone(), t: 0, dur, hop: ev.forced ? 0.05 : ev.teleport ? 0 : 0.18 };
            v.sector = ev.to;
            if (!ev.forced && !ev.teleport) this.faceToward(v, to);
            if (ev.teleport) {
              this.vfx.impact(v.pos.clone().setY(0.8), 'arcane', 0.6);
              snd('teleport', { volume: 0.7 });
            } else if (ev.forced) {
              this.vfx.dust(v.pos.clone().setY(0.15), 0.8);
              this.shake = Math.max(this.shake, 0.12);
              snd('push_impact', { volume: 0.55 });
            } else snd(`step_stone_${1 + Math.floor(Math.random() * 3)}`, { volume: 0.55 });
          },
          end: () => {
            v.pos.copy(to);
            v.tween = null;
            v.faceYaw = null;
            this.vfx.dust(to.clone().setY(0.15), ev.forced ? 0.8 : 0.4);
            if (ev.teleport) this.vfx.impact(to.clone().setY(0.8), 'arcane', 0.6);
          },
        });
        break;
      }
      case 'fall':
        this.task({
          dur: 0.6,
          start: () => {
            const v = this.figs.get(ev.figureId);
            if (v) v.anim = { kind: 'fall', t: 0, dur: 0.6 };
            if (v) this.vfx.dust(v.pos.clone().setY(0.15), 1);
            snd('body_fall', { volume: 0.9 });
          },
          end: () => {
            const v = this.figs.get(ev.figureId);
            if (v) v.fallen = 1;
          },
        });
        break;
      case 'rise':
        this.task({
          dur: 0.6,
          start: () => {
            const v = this.figs.get(ev.figureId);
            if (v) v.anim = { kind: 'rise', t: 0, dur: 0.6 };
            if (v) v.glow = { color: new THREE.Color(0xfff0b0), t: 0, dur: 1 };
            this.vfx.heal(v?.pos.clone() ?? new THREE.Vector3());
            snd('rise_up', { volume: 0.8 });
          },
          end: () => {
            const v = this.figs.get(ev.figureId);
            if (v) v.fallen = 0;
          },
        });
        break;
      case 'death':
        // DEATH: a heavy collapse, a beat of stillness, then the body burns away into embers (non-blocking tail)
        this.task({
          dur: 0.85,
          start: () => {
            const v = this.figs.get(ev.figureId);
            if (!v) return;
            v.dead = true;
            v.deathT = 0;
            v.faceYaw = null;
            v.rig.anim?.play('death', { hold: true, speed: 1.05 });
            if (!v.rig.anim) v.anim = { kind: 'fall', t: 0, dur: 0.6 };
            if (v.plate) v.plate.style.display = 'none';
            this.shake = Math.max(this.shake, v.typeId === 'severin' || v.typeId === 'cavaleiro' || v.typeId === 'cantor' || v.typeId === 'vigia' ? 0.5 : 0.18);
            if (v.rig.height > 2.2) {
              this.slowMo = 0.6;
              this.slowMoScale = 0.35;
              this.punchTo(this.chestPos(v.id), 0.5, 1.2);
            }
            snd('death_enemy', { volume: 0.85 });
          },
          end: () => {
            const v = this.figs.get(ev.figureId);
            if (!v) return;
            this.vfx.dust(v.pos.clone().setY(0.12), 1.2);
            if (!v.rig.anim) this.removeFig(ev.figureId);
          },
        });
        break;
      case 'spawn':
        this.task({
          dur: 0.6,
          start: () => {
            const S = this.lastState;
            const f = S?.figures.find((x) => x.id === ev.figureId);
            const at = f ? sectorCenter(f.sector) : new THREE.Vector3();
            this.vfx.spawn(at);
            this.figs.get(ev.figureId)?.rig.anim?.play('spawn');
            snd('enemy_spawn', { volume: 0.8 });
          },
        });
        break;
      case 'smoke':
        if (ev.added)
          this.task({
            dur: 0.3,
            start: () => {
              for (const k of ev.sectors) this.vfx.smokeCloud(sectorCenter(k).setY(0.5));
              snd('whoosh_transition', { volume: 0.4 });
            },
          });
        break;
      case 'sigil':
        if (ev.added) this.task({ dur: 0.35, start: () => (this.vfx.ring(sectorCenter(ev.sector).setY(0.15), 'rune', 0xb59cff, 0.3, 1.6, 0.6), snd('rune_place', { volume: 0.7 })) });
        break;
      case 'boss':
        this.task({
          dur: ev.what === 'terceira' ? 1.1 : 0.45,
          start: () => {
            const v = this.figs.get(ev.figureId);
            const at = v ? this.chestPos(ev.figureId) : new THREE.Vector3(0, 2, -4);
            if (ev.what === 'terceira' || ev.what === 'ressonancia') {
              this.vfx.impact(at, 'bell', ev.what === 'terceira' ? 2 : 0.8);
              this.shake = ev.what === 'terceira' ? 0.6 : 0.2;
              if (this.envScene?.bell) this.envScene.bell.userData.swing = ev.what === 'terceira' ? 1 : 0.35;
              snd(ev.what === 'terceira' ? 'bell_great_cracked' : 'resonance_up', { volume: 1 });
              if (ev.what === 'terceira') {
                this.flash = 0.5;
                this.grade.uniforms.uFlashColor.value.set(0xffd9a0);
                this.aberration = 1;
                this.punchTo(at, 0.45, 1);
              }
            } else if (ev.what === 'phase2') {
              this.vfx.impact(at, 'profane', 2);
              this.shake = 0.4;
              this.punchTo(at, 0.5, 1.2);
              snd('bell_toll_long', { volume: 0.9 });
            } else if (ev.what === 'canto') {
              this.vfx.ring(at, 'holy', 0xff7a5a, 0.3, 2, 0.6, true);
              snd('chant_note', { volume: 0.7 });
            } else if (ev.what === 'contrapeso') {
              snd('counterweight_drop', { volume: 1 });
              this.shake = 0.3;
            } else if (ev.what === 'guarda') {
              snd(ev.value ? 'block_shield' : 'guard_break', { volume: 0.7 });
            } else if (ev.what === 'vigiaMarca') {
              this.vfx.ring(at, 'rune', 0xa8d8ff, 0.4, 2.4, 0.7, true);
              snd('bell_toll_short', { volume: 0.6 });
            } else if (ev.what === 'silencio') {
              this.vfx.ring(at, 'holy', 0xffffff, 0.4, 3, 0.9, true);
              snd('cond_cleanse', { volume: 0.9 });
            }
          },
        });
        break;
      case 'objective':
        this.task({ dur: 0.4, start: () => snd(ev.success ? 'ui_unlock' : 'dice_fail', { volume: 0.8 }) });
        break;
      case 'secret':
        this.task({ dur: 0.6, start: () => snd('sting_secret', { volume: 0.9 }) });
        break;
      case 'resource':
        if (ev.resource === 'amem') this.task({ dur: 0.5, start: () => (this.vfx.ring(this.figs.get(ev.figureId)?.pos.clone().setY(0.1) ?? new THREE.Vector3(), 'holy', 0xfff0c0, 0.4, 4, 1), snd('bless', { volume: 0.9 })) });
        break;
      case 'victory':
        this.task({
          dur: 0.4,
          start: () => {
            for (const v of this.figs.values()) if (v.side === 'H' && !v.dead && v.fallen < 0.5) v.rig.anim?.play('cheer', { speed: 1 });
            this.punch.want = 0;
          },
        });
        break;
      case 'defeat':
        this.task({ dur: 0.2 });
        break;
      default:
        break;
    }
    if (ev.type === 'activationEnd') {
      this.pendingAttack = null;
      this.task({ dur: 0, start: () => this.diceUp && this.releaseDice(null) });
      const v = this.figs.get(ev.figureId);
      if (v)
        this.task({
          dur: 0.01,
          start: () => {
            v.faceYaw = null;
            v.leanTarget = 0;
          },
        });
    }
  }

  /**
   * One strike, played only after the dice have shown their result:
   * WIND-UP (the attacker gathers, the camera leans in, the dice burst into sparks that fly to the target) →
   * LUNGE (melee closes the gap, the swing timed to land) or RELEASE (shot / spell travels) → IMPACT, its weight
   * scaled by the damage (hit-stop, shake, flash, knockback, number size); a critical adds slow motion, a deep
   * punch-in, a gold burst and chromatic flash; a lethal blow is the heaviest → RECOVERY (back to the slot).
   * A miss: the target sidesteps, the attacker over-reaches, "Errou".
   */
  private enqueueStrike(ev: Extract<DomainEvent, { type: 'hit' | 'miss' }>) {
    const snd = (id: string, o?: { volume?: number; delay?: number }) => this.cb.onSound?.(id, o);
    const src = this.figs.get(ev.sourceId);
    const tgt = this.figs.get(ev.targetId);
    if (!tgt) return;
    const pa = this.pendingAttack;
    const ranged = this.isRanged(pa?.cat) && !!src;
    const school = ev.type === 'hit' ? ev.school : pa?.school ?? 'metal';
    const spell = this.isSpell(school) && ranged;
    const crit = ev.type === 'hit' && ev.critical;
    const dmg = ev.type === 'hit' ? ev.damage : 0;
    const lethal = ev.type === 'hit' && dmg > 0 && this.batch.some((e) => e.type === 'death' && e.figureId === ev.targetId);
    const calm = reducedMotion();
    const dist = src ? tgt.pos.distanceTo(src.pos) : 0;
    const dir = src ? tgt.pos.clone().sub(src.pos).setY(0).normalize() : new THREE.Vector3(0, 0, tgt.side === 'E' ? -1 : 1);
    // area attacks: one lunge for the whole sweep, then each further target just takes the blow
    const follow = !!pa && (pa.struck ?? 0) > 0 && !ranged;
    if (pa) pa.struck = (pa.struck ?? 0) + 1;
    const windup = crit || lethal ? 0.16 : 0.12;
    if (src && !follow) {
      // WIND-UP: gather the blow while the dice's sparks leave for the target
      const lunge = 0.2;
      const proj = spell ? 0.42 : 0.32;
      this.task({
        dur: windup,
        releaseDice: { targetId: tgt.id, arrive: windup + (ranged ? 0.12 + proj : lunge) },
        start: () => {
          this.faceToward(src, tgt.pos);
          src.leanTarget = ranged ? -0.08 : -0.3;
          if (ranged) src.anim = { kind: spell ? 'cast' : 'aim', t: 0, dur: windup + 0.1 };
          this.punchTo(tgt.pos.clone().lerp(src.pos, 0.35).setY(0.9), calm ? 0.2 : crit ? 0.55 : 0.46, 1.1);
        },
      });
      if (!ranged) {
        // melee: close in; the attack clip starts with the dash so its swing lands on arrival
        const reach = pa?.cat === 'alcance' ? Math.max(0.2, dist - 2.4) : Math.max(0.25, dist - 1.4);
        this.task({
          dur: lunge,
          start: () => {
            src.leanTarget = 0.24;
            src.anim = { kind: 'strike', t: 0, dur: 0.5 };
            this.offsetTo(src, dir.clone().multiplyScalar(reach), lunge, easeInCubic);
            this.vfx.dust(src.pos.clone().setY(0.15), 0.6);
            snd(crit || dmg >= 3 ? 'swing_heavy' : 'swing_light', { volume: 0.75 });
          },
        });
      } else {
        this.task({
          dur: 0.12,
          start: () => {
            src.anim = { kind: 'release', t: 0, dur: 0.38, dir };
            src.leanTarget = -0.1;
            this.offsetTo(src, dir.clone().multiplyScalar(-0.18), 0.12, easeOutCubic);
          },
        });
        this.projectile(src, tgt, school, proj);
      }
    } else if (!src) {
      // no visible attacker (traps, the bell): the sparks still find the target
      this.task({ dur: 0.18, releaseDice: { targetId: tgt.id, arrive: 0.18 } });
    }
    // IMPACT
    this.task({
      dur: follow ? 0.1 : 0.06,
      strikeOf: src?.id,
      start: () => {
        const at = this.chestPos(tgt.id);
        const hs = (x: number) => (this.hitStop = Math.max(this.hitStop, x / Math.sqrt(this.speed)));
        if (ev.type === 'miss') {
          // the target sidesteps the blow, the attacker over-reaches into empty air
          const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(Math.random() < 0.5 ? 0.55 : -0.55);
          tgt.rig.anim?.play('dodge', { speed: 1.6 });
          this.offsetTo(tgt, side, 0.12, easeOutCubic, () => this.offsetTo(tgt, new THREE.Vector3(), 0.4, easeInOut));
          if (src && !ranged) this.offsetTo(src, src.off.clone().addScaledVector(dir, 0.3), 0.12, easeOutCubic);
          this.vfx.slash(at.clone().addScaledVector(side, -0.4), dir, 0x9a948c, 0.8);
          this.floatText(at, 'Errou', 'miss');
          snd('miss_whoosh', { volume: 0.8 });
          this.vfx.dust(tgt.pos.clone().setY(0.15), 0.6);
          return;
        }
        if (dmg > 0) {
          // weight: everything scales with the damage; criticals and killing blows on top
          const d = Math.min(5, dmg);
          const heavy = dmg >= 3 || crit || lethal;
          this.vfx.impact(at, school, d / 2 + (crit ? 0.9 : 0) + (lethal ? 0.4 : 0));
          if (heavy) this.vfx.impact(at, 'metal', 0.5 + d * 0.15);
          this.vfx.slash(at, dir, crit ? 0xfff0c0 : schoolColor(school), (crit ? 1.6 : 1) + d * 0.08);
          this.vfx.ring(tgt.pos.clone().setY(0.06), 'glow', crit ? 0xffd27a : 0xffb880, 0.3, 1.4 + d * 0.35, 0.4);
          tgt.anim = { kind: 'hurt', t: 0, dur: 0.45 + d * 0.03, dir };
          tgt.flash = 1;
          tgt.leanTarget = -0.25 - d * 0.03;
          const knock = dir.clone().multiplyScalar(Math.min(0.75, (crit ? 0.5 : 0.18) + d * 0.08 + (lethal ? 0.12 : 0)));
          this.offsetTo(tgt, knock, 0.07, easeOutCubic, () => this.offsetTo(tgt, new THREE.Vector3(), 0.45, easeInOut, () => (tgt.leanTarget = 0)));
          this.vfx.dust(tgt.pos.clone().add(knock).setY(0.12), 0.5 + d * 0.15);
          this.floatText(at, `${dmg}`, crit ? 'crit' : 'dmg', 1 + d * 0.1 + (lethal ? 0.15 : 0));
          // hit-stop: the world freezes for a few frames (shorter at higher animation speed)
          hs(0.075 + d * 0.016 + (crit ? 0.06 : 0) + (lethal ? 0.05 : 0));
          this.shake = Math.max(this.shake, (calm ? 0.3 : 1) * Math.min(0.8, 0.14 + d * 0.07 + (crit ? 0.22 : 0) + (lethal ? 0.14 : 0)));
          if (heavy && !calm) {
            this.flash = Math.max(this.flash, 0.12 + d * 0.04);
            this.grade.uniforms.uFlashColor.value.set(0xfff4e6);
          }
          if (!calm) this.punchTo(at, crit ? 0.8 : lethal ? 0.65 : 0.42 + d * 0.04, crit ? 0.95 : 0.45);
          if (crit && !calm) {
            this.slowMo = 0.6 / Math.sqrt(this.speed);
            this.slowMoScale = 0.26;
            this.flash = Math.max(this.flash, 0.55);
            this.grade.uniforms.uFlashColor.value.set(0xffe6a8);
            this.aberration = 1;
            this.vfx.ring(at, 'glow', 0xffe0a0, 0.3, 3.4, 0.5, true);
            this.vfx.ring(at, 'holy', 0xffd060, 0.2, 2.2, 0.7, true);
            this.vfx.impact(at, 'holy', 1.4);
          } else if (lethal && !calm) {
            this.slowMo = 0.38 / Math.sqrt(this.speed);
            this.slowMoScale = 0.4;
            this.aberration = Math.max(this.aberration, 0.5);
          }
          if (crit) snd('dice_critical', { volume: 0.45 });
          snd(impactSound(school, dmg), { volume: Math.min(1, 0.6 + dmg * 0.12) });
          if (heavy) snd('hit_metal_heavy', { volume: Math.min(0.9, 0.4 + d * 0.1) });
          if (ev.blocked > 0) {
            // part of the blow was stopped (defence dice / armour)
            this.vfx.shield(at, tgt.rig.height * 0.55);
            this.floatText(at.clone().add(new THREE.Vector3(0.5, 0.35, 0)), `bloqueou ${ev.blocked}`, 'block', 0.7);
          }
        } else {
          tgt.anim = { kind: 'block', t: 0, dur: 0.4 };
          this.vfx.guard(at);
          this.vfx.shield(at, tgt.rig.height * 0.62);
          this.vfx.impact(at, 'metal', 0.7);
          this.offsetTo(tgt, dir.clone().multiplyScalar(0.14), 0.06, easeOutCubic, () => this.offsetTo(tgt, new THREE.Vector3(), 0.3, easeInOut));
          hs(0.07);
          this.shake = Math.max(this.shake, calm ? 0.05 : 0.14);
          this.floatText(at, 'Bloqueado', 'block');
          snd(ev.blocked > 0 ? 'block_shield' : 'armor_absorb', { volume: 0.85 });
        }
      },
    });
    // RECOVERY (only after the last target of a sweep)
    this.task({
      dur: follow ? 0.12 : ranged ? 0.22 : 0.3,
      strikeOf: src?.id,
      start: () => {
        if (!src) return;
        const more = this.queue.some((t, i) => i > 0 && t.strikeOf === src.id);
        if (more) return;
        src.leanTarget = 0;
        this.offsetTo(src, new THREE.Vector3(), ranged ? 0.25 : 0.38, easeInOut);
      },
    });
  }

  private projectiles = new Set<THREE.Object3D>();
  private projectile(src: FigView, tgt: FigView, school: string, dur: number) {
    const from = src.pos.clone().setY(src.rig.height * 0.62);
    const to = tgt.pos.clone().setY(tgt.rig.height * 0.55);
    const arrow = school === 'arrow' || school === 'bolt';
    const color = schoolColor(school);
    const holder = new THREE.Group();
    if (arrow) {
      void projectileModel('arrow').then((m) => {
        if (m) {
          holder.add(m);
          return;
        }
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 5), flat(0x5a4632)));
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 6), flat(0x9aa0a8, { metalness: 0.8 }));
        tip.position.y = 0.38;
        g.add(tip);
        g.rotation.x = Math.PI / 2;
        holder.add(g);
      });
    } else {
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3) }));
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: sprite('textures/glow_radial.png'), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.userData.billboard = true;
      holder.add(core, halo);
    }
    holder.visible = false;
    this.scene.add(holder);
    this.projectiles.add(holder);
    const arc = arrow ? 0.7 : 0.35;
    const pt = (k: number) => {
      const p = from.clone().lerp(to, k);
      p.y += Math.sin(k * Math.PI) * arc;
      return p;
    };
    const task: Task = {
      dur,
      t: 0,
      start: () => {
        holder.visible = true;
        if (arrow) this.cb.onSound?.('bow_release', { volume: 0.8 });
      },
      tick: (k) => {
        const p = pt(k);
        holder.position.copy(p);
        holder.lookAt(pt(Math.min(1, k + 0.04)));
        for (const c of holder.children) if (c.userData.billboard) c.quaternion.copy(this.camera.quaternion).premultiply(holder.quaternion.clone().invert());
        this.vfx.trail(p, color, arrow ? 0.4 : 1);
      },
      end: () => {
        this.scene.remove(holder);
        this.projectiles.delete(holder);
      },
    };
    this.queue.push(task);
  }

  private floatText(at: THREE.Vector3, text: string, kind: string, scale = 1) {
    const el = document.createElement('div');
    el.className = `float-text ft-${kind}`;
    el.textContent = text;
    this.labels.appendChild(el);
    const p = at.clone().project(this.camera);
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    el.style.left = `${((p.x + 1) / 2) * w}px`;
    el.style.top = `${((1 - p.y) / 2) * h}px`;
    // juicy pop: overshoot, settle, drift up and fade (crits shake and stay longer)
    const big = kind === 'crit';
    const dmg = kind === 'dmg' || big || kind === 'direct' || kind === 'burn' || kind === 'bleed' || kind === 'poison';
    const dx = (Math.random() - 0.5) * (dmg ? 46 : 16);
    const life = big ? 1500 : dmg ? 1150 : 1250;
    el.style.animation = 'none';
    el.style.willChange = 'transform, opacity';
    if (big) {
      el.style.textShadow = '0 2px 0 rgba(0,0,0,0.85), 0 0 18px rgba(255,190,90,0.85), 0 0 4px rgba(255,240,200,0.9)';
      el.style.zIndex = '3';
    }
    const tr = (x: number, y: number, s: number, r = 0) => `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${s * scale}) rotate(${r}deg)`;
    const anim = el.animate(
      big
        ? [
            { transform: tr(0, 10, 0.2), opacity: 0 },
            { transform: tr(dx * 0.2, -8, 1.9, -4), opacity: 1, offset: 0.1 },
            { transform: tr(dx * 0.3, -14, 1.25, 3), opacity: 1, offset: 0.2 },
            { transform: tr(dx * 0.35, -16, 1.35, -2), opacity: 1, offset: 0.3 },
            { transform: tr(dx * 0.5, -24, 1.2, 0), opacity: 1, offset: 0.72 },
            { transform: tr(dx * 0.7, -62, 1.05, 0), opacity: 0 },
          ]
        : dmg
          ? [
              { transform: tr(0, 6, 0.3), opacity: 0 },
              { transform: tr(dx * 0.3, -14, 1.45), opacity: 1, offset: 0.12 },
              { transform: tr(dx * 0.5, -20, 1.0), opacity: 1, offset: 0.26 },
              { transform: tr(dx * 0.8, -34, 1.0), opacity: 1, offset: 0.7 },
              { transform: tr(dx, -58, 0.92), opacity: 0 },
            ]
          : [
              { transform: tr(0, 4, 0.7), opacity: 0 },
              { transform: tr(dx * 0.4, -10, 1.08), opacity: 1, offset: 0.15 },
              { transform: tr(dx * 0.6, -16, 1), opacity: 1, offset: 0.65 },
              { transform: tr(dx, -40, 0.96), opacity: 0 },
            ],
      { duration: life / Math.sqrt(this.speed), easing: 'cubic-bezier(0.2, 0.8, 0.25, 1)', fill: 'forwards' },
    );
    anim.onfinish = () => el.remove();
    anim.oncancel = () => el.remove();
  }

  // ------------------------------------------------------------------ loop
  private frozen = false;
  private lastRealDt = 0.016;
  private vtime = 0;
  private lastNow = performance.now();
  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const realMs = now - this.lastNow;
    this.lastNow = now;
    if (this.frozen) return;
    const rawDt = Math.min(0.05, this.clock.getDelta());
    this.frame(rawDt, this.clock.elapsedTime, realMs);
  };
  /**
   * Testing/capture aid: freeze real time and advance the scene by exact steps (deterministic frames for
   * screenshots of a strike mid-impact). Call debugResume() to go back to real time.
   */
  debugAdvance(seconds: number, step = 1 / 30) {
    if (!this.frozen) this.vtime = this.clock.elapsedTime;
    this.frozen = true;
    const n = Math.max(1, Math.round(seconds / step));
    for (let i = 0; i < n; i++) {
      this.vtime += step;
      this.frame(step, this.vtime, step * 1000, i === n - 1);
    }
  }
  debugResume() {
    this.frozen = false;
    this.clock.getDelta();
  }

  private frame(rawDt: number, t: number, realMs: number, render = true) {
    // game time: hit-stop nearly freezes the world, slow motion stretches a critical blow
    let k = 1;
    if (this.hitStop > 0) {
      this.hitStop -= rawDt;
      k = 0.04;
    }
    if (this.slowMo > 0) {
      this.slowMo -= rawDt;
      // hold the slow motion, then ease back to full speed over the last 0.2 s
      const ramp = this.slowMo < 0.2 ? 1 - Math.max(0, this.slowMo) / 0.2 : 0;
      k *= this.slowMoScale + (1 - this.slowMoScale) * ramp * ramp;
    }
    const gdt = rawDt * k;
    this.lastRealDt = rawDt;
    this.processQueue(gdt * this.speed);
    this.updateSparks(gdt * this.speed);
    this.updateFigures(gdt, t);
    this.updateCamera(rawDt, t);
    for (const h of this.frameHooks) h(rawDt, t);
    this.vfx.update(gdt);
    // highlights
    for (const [key, p] of this.plates) {
      const kind = this.highlight.sectors.get(key);
      const mat = p.hl.material as THREE.MeshBasicMaterial;
      const hover = this.hoverSector === key && !this.hoverFig;
      const target = kind ? (hover ? 0.95 : 0.5 + Math.sin(t * 3) * 0.12) : hover && this.mode === 'combat' ? 0.2 : 0;
      mat.opacity += (target - mat.opacity) * Math.min(1, rawDt * 12);
      mat.color.set(kind === 'attack' ? 0xff5a40 : kind === 'ally' ? 0x8fe07a : kind === 'area' ? 0xff8a40 : kind === 'objective' ? 0xb59cff : kind === 'deploy' ? 0x9fd0ff : 0xffd27a);
      p.hl.visible = mat.opacity > 0.01;
    }
    for (const m of this.markers.children) if (m.userData.spin) m.rotation.z += rawDt * m.userData.spin;
    kitTime.value = t;
    this.stage.visible = !this.envScene || this.envHidden;
    if (this.envScene) {
      this.envScene.update(gdt, t);
      const bell = this.envScene.bell;
      if (bell) {
        const sw = (bell.userData.swing ?? 0) as number;
        bell.rotation.z = Math.sin(t * 2.2) * 0.04 * sw + Math.sin(t * 0.5) * 0.008;
        bell.userData.swing = Math.max(0, sw - rawDt * 0.25);
      }
    }
    this.flash = Math.max(0, this.flash - rawDt * 1.6);
    this.aberration = Math.max(0, this.aberration - rawDt * 2.2);
    this.grade.uniforms.uFlash.value = this.flash * 0.6;
    this.grade.uniforms.uAberration.value = this.aberration * 0.012;
    this.grade.uniforms.uTime.value = t;
    if (!render) return;
    this.renderer.info.reset();
    if (!PRESETS[this.quality].post) this.renderer.render(this.scene, this.camera);
    else this.composer.render(rawDt);
    this.updateLabels();
    const info = this.renderer.info;
    this.stats.calls = info.render.calls;
    this.stats.tris = info.render.triangles;
    this.stats.geos = info.memory.geometries;
    this.stats.texs = info.memory.textures;
    // fps from real wall-clock time (dt is clamped for the simulation, not for the measurement)
    this.fpsAcc += Math.min(realMs, 2000) / 1000;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.stats.fps = Math.round(this.fpsN / this.fpsAcc);
      this.stats.frameMs = +((this.fpsAcc / this.fpsN) * 1000).toFixed(1);
      // adaptive quality: degrade when sustained low FPS
      if (this.autoQuality && this.stats.fps < 40 && this.quality !== 'low' && performance.now() > this.qualityGrace) {
        if (++this.slowFrames > 6) {
          this.slowFrames = 0;
          const next: Quality = this.quality === 'high' ? 'medium' : 'low';
          this.applyQuality(next);
          if (this.envScene) {
            const id = this.sceneId;
            this.sceneId = '';
            void this.loadScene(id);
          }
        }
      } else this.slowFrames = 0;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
  }

  private processQueue(dt: number) {
    let budget = dt;
    let guard = 0;
    while (this.queue.length && guard++ < 50) {
      const t = this.queue[0];
      if (!t.started) {
        t.started = true;
        if (t.hold) t.hold.wall0 = diceNow();
        if (t.releaseDice && this.diceUp) this.releaseDice(t.releaseDice);
        t.start?.();
      }
      const remaining = t.dur - t.t;
      const step = Math.min(Math.max(0, remaining), budget);
      t.t += step;
      budget -= step;
      t.tick?.(t.dur > 0 ? Math.min(1, t.t / t.dur) : 1, step);
      if (t.hold && t.t >= t.dur - 1e-6) {
        // gated: wait for the signal (or the safety limit), spending this frame's time on the wait
        const h = t.hold;
        const waited = h.done() || t.t >= h.maxQ || diceNow() - (h.wall0 ?? 0) >= h.maxWallMs;
        if (!waited) {
          t.t += budget;
          break;
        }
      }
      if (t.t >= t.dur - 1e-6) {
        this.queue.shift();
        t.end?.();
        if (!this.queue.length) {
          this.cb.onQueueIdle?.();
          this.punch.hold = Math.min(this.punch.hold, 0.25);
          if (this.lastState) void this.syncCombat(this.lastState, {});
        }
      } else break;
      if (budget <= 0) break;
    }
  }

  private updateFigures(dt: number, t: number) {
    const sdt = dt * this.speed;
    for (const v of [...this.figs.values()]) {
      const r = v.rig;
      // tween between sectors
      if (v.tween) {
        if (r.anim && v.tween.t === 0 && v.tween.hop > 0.1) r.anim.play('walk', { speed: 1.7 });
        v.tween.t = Math.min(v.tween.dur, v.tween.t + sdt);
        const k = v.tween.t / v.tween.dur;
        const e = easeInOut(k);
        v.pos.lerpVectors(v.tween.from, v.tween.to, e);
        v.pos.y = 0.12 + Math.sin(k * Math.PI) * v.tween.hop;
      }
      // choreography offset (lunge / recoil / dodge)
      if (v.offTween) {
        const o = v.offTween;
        o.t = Math.min(o.dur, o.t + sdt);
        v.off.lerpVectors(o.from, o.to, o.ease(o.t / o.dur));
        if (o.t >= o.dur) {
          v.offTween = null;
          o.then?.();
        }
      }
      r.root.position.copy(v.pos).add(v.off);
      // facing: toward the action while acting, else the other side; the active hero glances at the hovered target
      const baseYaw = v.side === 'H' ? Math.PI : 0;
      let yaw = v.faceYaw ?? baseYaw;
      if (v.faceYaw === null && this.mode === 'combat' && this.highlight.figures.get(v.id) === 'active' && this.hoverFig && this.highlight.figures.get(this.hoverFig) === 'attack') {
        const h = this.figs.get(this.hoverFig);
        if (h) yaw = Math.atan2(h.pos.x - v.pos.x, h.pos.z - v.pos.z);
      }
      let dy = yaw - r.root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      r.root.rotation.y += dy * Math.min(1, dt * (v.faceYaw !== null ? 14 : 6));
      // lean (anticipation / follow-through / recoil)
      v.lean += (v.leanTarget - v.lean) * Math.min(1, sdt * 12);
      r.body.rotation.x = v.lean;
      // idle
      const id = r.idle;
      const ph = v.phase + t * id.speed;
      r.body.position.y = Math.sin(ph * 2) * id.bob;
      r.body.rotation.z = Math.sin(ph) * id.sway;
      r.torso.rotation.x = id.hunch + Math.sin(ph * 2) * 0.02;
      r.armR.rotation.z = -0.08 + Math.sin(ph * 2.1) * 0.03;
      r.armL.rotation.z = 0.08 - Math.sin(ph * 1.9) * 0.03;
      // signature idles
      if (r.extras.runeRing) r.extras.runeRing.rotation.z = t * 0.6;
      for (let i = 0; i < 3; i++) {
        const gl = r.extras[`glyph${i}`];
        if (gl) gl.position.set(Math.cos(t * 0.7 + (i * Math.PI * 2) / 3) * 0.45, 1.25 + Math.sin(t * 2 + i) * 0.06, Math.sin(t * 0.7 + (i * Math.PI * 2) / 3) * 0.45);
        const ln = r.extras[`lantern${i}`];
        if (ln) ln.position.set(Math.cos(t * 0.5 + (i * Math.PI * 2) / 3) * 0.7, 1.4 + Math.sin(t * 1.3 + i) * 0.12, Math.sin(t * 0.5 + (i * Math.PI * 2) / 3) * 0.7);
      }
      if (r.extras.censer) r.extras.censer.rotation.z = Math.sin(t * 2.2) * 0.5;
      if (r.extras.tail) r.extras.tail.rotation.y = Math.sin(t * 8) * 0.4;
      if (r.extras.lid) r.extras.lid.rotation.x = -Math.max(0, Math.sin(t * 3)) * 0.35;
      if (r.extras.cape) {
        const cape = r.extras.cape as THREE.Mesh;
        cape.rotation.x = 0.08 + Math.sin(t * 1.4 + v.phase) * 0.05;
      }
      if (r.extras.halo) r.extras.halo.rotation.z = t * 0.5;
      if (r.extras.mouth) r.extras.mouth.scale.y = 1.4 + Math.sin(t * 6) * 0.4;
      if (r.anim) {
        r.anim.update(sdt);
        if (v.anim && !v.anim.t) {
          const k = v.anim.kind;
          const school = this.pendingAttack?.school;
          const ranged = this.isRanged(this.pendingAttack?.cat);
          if (k === 'strike') r.anim.play(r.anim.map.attack ? 'attack' : 'cast', { speed: 1.65 });
          else if (k === 'release') r.anim.play(r.anim.map.shoot && (school === 'arrow' || school === 'bolt') ? 'shoot' : this.isSpell(school) ? 'cast' : 'attack', { speed: 1.45 });
          else if (k === 'aim') r.anim.play(r.anim.map.shoot && (school === 'arrow' || school === 'bolt') ? 'shoot' : 'attack', { speed: 0.6 });
          else if (k === 'windup') r.anim.play(ranged && r.anim.map.shoot && (school === 'arrow' || school === 'bolt') ? 'shoot' : 'attack', { speed: 1.25 });
          else if (k === 'cast') r.anim.play(school === 'holy' || school === 'bell' ? 'raise' : 'cast', { speed: 1.2 });
          else if (k === 'hurt') r.anim.play('hit', { speed: 1.3 });
          else if (k === 'block') r.anim.play('block', { speed: 1.3 });
          else if (k === 'fall') {
            r.anim.play('fall', { hold: true });
          } else if (k === 'rise') {
            r.anim.holding = false;
            r.anim.play('rise');
          } else if (k === 'intent') r.anim.play('taunt', { speed: 1.4 });
        }
        // idle life: now and then a figure shifts its weight, looks around, readies its weapon
        if (!v.dead && !v.anim && !v.tween && !v.offTween && v.fallen < 0.5 && !this.queue.length && this.mode === 'combat') {
          v.idleT -= sdt;
          if (v.idleT <= 0) {
            v.idleT = 6 + Math.random() * 8;
            if (r.anim.map.idle2) r.anim.play('idle2', { speed: 0.9 + Math.random() * 0.2 });
          }
        }
      }
      // one-shot animations
      if (v.anim) {
        v.anim.t += sdt;
        const k = Math.min(1, v.anim.t / v.anim.dur);
        const dir = v.anim.dir ?? new THREE.Vector3();
        const local = dir.clone().applyAxisAngle(UP, -r.root.rotation.y);
        if (!r.anim)
          switch (v.anim.kind) {
            case 'windup':
            case 'aim':
              r.armR.rotation.x = -k * 1.8;
              r.body.position.z = -local.z * 0.08 * k;
              break;
            case 'cast':
              r.armR.rotation.x = -k * 2.4;
              r.armL.rotation.x = -k * 2.2;
              r.body.position.y += k * 0.06;
              break;
            case 'strike': {
              const s = Math.sin(k * Math.PI);
              r.armR.rotation.x = -1.8 + k * 2.6;
              r.torso.rotation.x = id.hunch + s * 0.25;
              break;
            }
            case 'release':
              r.armR.rotation.x = -1.4 + k * 0.8;
              r.body.position.z = Math.sin(k * Math.PI) * -0.05;
              break;
            case 'hurt': {
              const s = Math.sin(k * Math.PI);
              r.torso.rotation.x = id.hunch - s * 0.3;
              break;
            }
            case 'block':
              r.armL.rotation.x = -Math.sin(k * Math.PI) * 1.3;
              break;
            case 'intent':
              r.body.position.y += Math.sin(k * Math.PI) * 0.12;
              break;
            case 'fall':
              v.fallen = k;
              break;
            case 'rise':
              v.fallen = 1 - k;
              break;
          }
        if (k >= 1) v.anim = null;
      }
      // fallen pose (procedural rigs only; skinned rigs use Lie_Down/Death clips)
      if (!r.anim) {
        r.root.rotation.x = -v.fallen * (Math.PI / 2.2) * (v.side === 'H' ? -1 : 1);
        r.root.position.y = v.pos.y + v.fallen * 0.1;
      } else if (v.fallen >= 1 && !r.anim.holding && !v.anim && !v.dead) {
        r.anim.play('fall', { hold: true, speed: 4 });
      }
      // hit flash (decays in real time so slow motion does not keep a figure white)
      if (v.flash > 0) {
        v.flash = Math.max(0, v.flash - Math.max(dt, this.lastRealDt) * 6);
        const f = v.flash * v.flash;
        for (const m of r.mats) {
          m.emissive.copy(m.userData.baseEmissive).lerp(FLASH, f);
          m.emissiveIntensity = Math.max(m.userData.baseEmissiveIntensity, f * 0.9);
        }
      }
      // death: hold the collapse, then burn away into embers (dissolve shader with glowing edges)
      if (v.dead) {
        v.deathT += sdt;
        const d = Math.max(0, (v.deathT - 1.0) / 0.9);
        if (r.dissolve) {
          r.dissolve.value = Math.min(1.05, d);
          if (d > 0 && d < 1 && Math.random() < sdt * 30) this.vfx.ember(this.figPos(v).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * r.height * (1 - d), (Math.random() - 0.5) * 0.6)));
        } else {
          const s = Math.max(0, 1 - d);
          r.root.scale.setScalar(r.scale * (0.6 + 0.4 * s));
          for (const m of r.mats) {
            m.transparent = true;
            m.opacity = s;
          }
        }
        if (d >= 1.05) {
          this.removeFig(v.id);
          continue;
        }
      }
      // contact shadow + selection ring follow the figure on the floor
      const visible = r.root.visible;
      const groundY = v.pos.y + 0.012;
      v.blob.visible = visible;
      v.blob.position.set(r.root.position.x, groundY, r.root.position.z);
      const bm = v.blob.material as THREE.MeshBasicMaterial;
      bm.opacity = (v.dead ? Math.max(0, 1 - Math.max(0, v.deathT - 1) / 0.6) : 1) * 0.62;
      const hl = this.highlight.figures.get(v.id);
      const rm = v.ring.material as THREE.MeshBasicMaterial;
      const want = visible && !v.dead && this.mode === 'combat' && (hl || this.hoverFig === v.id) ? 1 : 0;
      rm.opacity += ((want ? (hl === 'active' ? 0.95 : 0.8) + Math.sin(t * 5 + v.phase) * 0.15 : 0) - rm.opacity) * Math.min(1, Math.max(dt, 0.016) * 10);
      v.ring.visible = rm.opacity > 0.01;
      if (v.ring.visible) {
        rm.color.set(hl === 'attack' ? 0xff4a32 : hl === 'ally' ? 0x8fe07a : hl === 'active' ? 0xffcf6a : hl === 'intent' ? 0xb59cff : 0xffffff);
        v.ring.position.set(r.root.position.x, groundY + 0.01, r.root.position.z);
        v.ring.rotation.z = t * (hl === 'active' ? 0.6 : 0.25) + v.phase;
        const base = Math.max(0.9, Math.min(2.2, r.height * 0.62)) * 1.12;
        v.ring.scale.setScalar(base * (hl === 'attack' ? 1 + Math.sin(t * 6) * 0.04 : 1));
      }
      // rim: team colour; the figure whose turn it is glows a little brighter; heals/guards pulse their colour
      if (r.rim) {
        const baseRim = v.side === 'H' ? 0.34 : 0.3;
        let s = baseRim + (hl === 'active' ? 0.3 + Math.sin(t * 4) * 0.12 : hl === 'attack' && this.hoverFig === v.id ? 0.35 : 0);
        r.rim.color.set(v.side === 'H' ? HERO_RIM : ENEMY_RIM);
        // the hero whose turn it is wears its class colour on the rim
        if (hl === 'active' && v.side === 'H' && CLASS_ACCENT[v.typeId]) r.rim.color.lerp(TMP_COLOR.set(CLASS_ACCENT[v.typeId]), 0.55);
        if (v.glow) {
          v.glow.t += sdt;
          const g = Math.sin(Math.min(1, v.glow.t / v.glow.dur) * Math.PI);
          r.rim.color.lerp(v.glow.color, g);
          s += g * 1.6;
          if (v.glow.t >= v.glow.dur) v.glow = null;
        }
        r.rim.strength.value = s;
      }
    }
  }

  private updateCamera(dt: number, t: number) {
    const aspect = this.camera.aspect;
    if (this.cameraController && this.cameraController.update(this.camera, dt, t)) {
      // a plugged-in driver (world follow-cam, cutscene) owns the camera; keep shake and remember where it is
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt * 1.5);
        this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.25;
        this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.25;
      }
      this.camPos.copy(this.camera.position);
      return;
    }
    if (this.mode === 'title') {
      const a = t * 0.05;
      this.camTarget.set(Math.sin(a) * 3.5, 3.2, 9 + Math.cos(a) * 1.5);
      this.camLook.set(0, 2.2, -6);
    } else if (this.mode === 'explore' && aspect < 0.9) {
      // phone upright: close behind the party, the place rising above them
      const a = Math.sin(t * 0.07) * 0.25;
      const E = this.camTuneE;
      this.camTarget.set(Math.sin(a) * 1.2, E.y, E.z);
      this.camLook.set(Math.sin(a) * 0.4, E.ly, E.lz);
    } else if (this.mode === 'explore' && aspect > 1.9) {
      // phone held sideways: the place and the party on the left, the path cards in the right-hand column
      const a = Math.sin(t * 0.07) * 0.4;
      const W = this.camTuneWE;
      this.camTarget.set(W.x + Math.sin(a) * 1.5, W.y, W.z);
      this.camLook.set(W.x + Math.sin(a) * 0.5, W.ly, W.lz);
    } else if (this.mode === 'explore') {
      const a = Math.sin(t * 0.07) * 0.6;
      this.camTarget.set(Math.sin(a) * 6, 5.2, 11.5);
      this.camLook.set(Math.sin(a) * 1.5, 1.4, -3.5);
    } else if (aspect < 0.9) {
      // phones held upright: a 3/4 view — all 5 columns across, the room's back wall above the board
      const T = this.camTune;
      this.camTarget.set(Math.sin(t * 0.15) * 0.12, T.y, T.z);
      this.camLook.set(0, 0, T.lz);
    } else {
      const narrow = aspect < 1.45;
      // phones in landscape: the HUD eats the bottom of a short screen, so frame the board higher and a bit tighter
      const wide = aspect > 1.9;
      // the board sits in the upper part of the screen so the action row and hero portraits never cover it
      const L = this.camTuneL;
      // phones held sideways (wide): board on the left, controls in a right-hand column under the thumb
      const W = this.camTuneW;
      const x = wide ? W.x : 0;
      this.camTarget.set(x + Math.sin(t * 0.15) * 0.2, narrow ? 15.5 : wide ? W.y : L.y, narrow ? 14.5 : wide ? W.z : L.z);
      this.camLook.set(x, 0.2, narrow ? 0.4 : wide ? W.lz : L.lz);
    }
    const fov = this.modeFov();
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * (this.snapCamera ? 1 : Math.min(1, dt * 3));
      this.camera.updateProjectionMatrix();
    }
    if (this.snapCamera) {
      this.camPos.copy(this.camTarget);
      this.snapCamera = false;
    } else this.camPos.lerp(this.camTarget, Math.min(1, dt * 1.8));
    this.camera.position.copy(this.camPos);
    // punch-in: dolly toward the action and turn the gaze onto it, then ease back to the board view
    const P = this.punch;
    if (P.hold > 0) P.hold -= dt;
    else P.want = 0;
    P.amt += (P.want - P.amt) * Math.min(1, dt * (P.want > P.amt ? 6 : 2.2));
    const look = this.camLook.clone();
    if (P.amt > 0.001 && this.mode === 'combat') {
      const k = easeInOut(Math.min(1, P.amt));
      this.camera.position.lerp(P.at.clone().add(this.camPos.clone().sub(P.at).multiplyScalar(0.7)), k * 0.6);
      look.lerp(P.at, k * 0.45);
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.5);
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.25;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.25;
    }
    this.camera.lookAt(look);
  }

  private updateLabels() {
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    for (const v of this.figs.values()) {
      if (!v.plate || v.plate.style.display === 'none' || this.mode !== 'combat') continue;
      const p = v.rig.root.position.clone().setY(v.rig.height + 0.25).project(this.camera);
      v.plate.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }

  // ---------------------------------------------------------------- equipment showcase
  private showcaseId: string | null = null;
  private showcaseRect: { x: number; y: number; w: number; h: number } | null = null;
  private showcaseFov = 0;
  /**
   * Equipment screen: one hero, facing the camera, framed inside `rect` (CSS px of the canvas) while the camera
   * sways slowly around them; the rest of the party steps out of the frame. `showcase(null)` gives the camera back.
   */
  showcase(id: string | null, rect?: { x: number; y: number; w: number; h: number }) {
    const prev = this.showcaseId ? this.figs.get(this.showcaseId) : null;
    if (prev) prev.faceYaw = null;
    this.showcaseId = id;
    this.showcaseRect = rect ?? null;
    if (!id) {
      for (const v of this.figs.values()) v.rig.root.visible = true;
      if (this.cameraController === this.showcaseCam) {
        this.cameraController = null;
        this.camera.clearViewOffset();
        if (this.showcaseFov) this.camera.fov = this.showcaseFov;
        this.camera.updateProjectionMatrix();
        this.snapCamera = true;
      }
      return;
    }
    if (this.cameraController !== this.showcaseCam) {
      this.showcaseFov = this.camera.fov;
      this.cameraController = this.showcaseCam;
    }
  }
  private showcaseCam: CameraController = {
    update: (cam, _dt, t) => {
      const v = this.showcaseId ? this.figs.get(this.showcaseId) : null;
      if (!v) return false;
      for (const [fid, o] of this.figs) o.rig.root.visible = fid === this.showcaseId;
      v.faceYaw = 0;
      const W = this.renderer.domElement.clientWidth || 1;
      const H = this.renderer.domElement.clientHeight || 1;
      const r = this.showcaseRect ?? { x: 0, y: 0, w: W, h: H };
      const h = Math.max(0.8, v.rig.height);
      cam.fov = 30;
      // distance so the hero fills ~88% of the stage height
      const frac = Math.min(0.95, (r.h * 0.92) / H);
      const d = (h * 1.0) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * frac);
      const a = Math.sin(t * 0.22) * 0.38;
      const c = v.rig.root.position;
      cam.position.set(c.x + Math.sin(a) * d, h * 0.62 + d * 0.12, c.z + Math.cos(a) * d);
      cam.lookAt(c.x, h * 0.5, c.z);
      // move the picture so the hero sits in the middle of the stage, not of the screen
      cam.setViewOffset(W, H, W / 2 - (r.x + r.w / 2), H / 2 - (r.y + r.h / 2), W, H);
      cam.updateProjectionMatrix();
      return true;
    },
  };

  /** Screen-space box of a figure from its feet to the top of its head (for rings and spotlights). */
  screenBoxOf(id: string): { x: number; top: number; bottom: number } | null {
    const v = this.figs.get(id);
    if (!v) return null;
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    const head = v.rig.root.position.clone().setY(v.rig.height).project(this.camera);
    const feet = v.rig.root.position.clone().setY(0).project(this.camera);
    return { x: ((head.x + 1) / 2) * w, top: ((1 - head.y) / 2) * h, bottom: ((1 - feet.y) / 2) * h };
  }

  /** Screen position of a figure (for HUD anchoring). */
  screenOf(id: string): { x: number; y: number } | null {
    const v = this.figs.get(id);
    if (!v) return null;
    const p = v.rig.root.position.clone().setY(v.rig.height).project(this.camera);
    return { x: ((p.x + 1) / 2) * this.renderer.domElement.clientWidth, y: ((1 - p.y) / 2) * this.renderer.domElement.clientHeight };
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onViewportChange);
    window.removeEventListener('orientationchange', this.onViewportChange);
    screen.orientation?.removeEventListener?.('change', this.onViewportChange);
    window.visualViewport?.removeEventListener('resize', this.onViewportChange);
    window.removeEventListener(DICE_SIGNAL, this.onDiceSignal);
    this.clearSparks();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

const HERO_RIM = 0xffd2a0;
const ENEMY_RIM = 0xa8b8ff;
const FLASH = new THREE.Color(0xffe0c8);
const TMP_COLOR = new THREE.Color();

const CONDITION_LABEL: Record<string, string> = {
  veneno: 'Veneno',
  sangramento: 'Sangramento',
  queimando: 'Queimando',
  quebrado: 'Quebrado',
  exposto: 'Exposto',
  imobilizado: 'Imobilizado',
  atordoado: 'Atordoado',
  guardado: 'Guardado',
  furtivo: 'Furtivo',
  julgado: 'Julgado',
  bencao: 'Bênção',
  semReacoes: 'Sem Reações',
};

function schoolColor(school: string): number {
  switch (school) {
    case 'holy':
      return 0xffe2a0;
    case 'fire':
      return 0xff7a2a;
    case 'profane':
    case 'shadow':
      return 0xb070ff;
    case 'bell':
      return 0xffb060;
    case 'arcane':
      return 0x9a8cff;
    case 'poison':
      return 0x8fd060;
    case 'flesh':
    case 'blood':
      return 0xff5040;
    case 'arrow':
    case 'bolt':
      return 0xffe0b0;
    default:
      return 0xffd8a0;
  }
}

function impactSound(school: string, dmg: number) {
  switch (school) {
    case 'arcane':
      return 'spell_arcane_impact';
    case 'holy':
      return 'holy_impact';
    case 'profane':
    case 'shadow':
      return 'profane_hit';
    case 'arrow':
      return 'arrow_impact';
    case 'bolt':
      return 'bolt_impact';
    case 'flesh':
    case 'blood':
      return Math.random() < 0.5 ? 'hit_flesh' : 'hit_flesh_2';
    case 'blunt':
      return 'hit_blunt';
    case 'bell':
      return 'bell_toll_short';
    case 'fire':
      return 'cond_burn';
    default:
      return dmg >= 3 ? 'hit_metal_heavy' : ['hit_metal', 'hit_metal_2', 'hit_metal_3'][Math.floor(Math.random() * 3)];
  }
}

export { CLASS_ACCENT };
