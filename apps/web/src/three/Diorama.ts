/**
 * Diorama — Three.js renderer for exploration and combat.
 * It OBSERVES game state and domain events and schedules animations; it never decides tactical math.
 * Animation queue is skippable (speed multiplier / fast-forward) and never blocks the rules engine.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { CombatState, DomainEvent, Figure, SectorKey } from '@mosteiro/core';
import { buildEnemy, buildHero, CLASS_ACCENT, type Rig } from './characters';
import { buildEnemySkinned, buildHeroSkinned, hasSkinnedEnemy } from './skinned';
import { buildScene, type BuiltScene } from './scenes';
import { VFX } from './vfx';
import { model, pbr, setAnisotropy, flat, sprite } from './assets';

export type Quality = 'low' | 'medium' | 'high';

const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.85 }, uGrain: { value: 0.016 }, uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uGrain; uniform float uFlash; uniform vec3 uFlashColor;
    varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // warm highlights, cool shadows (split tone)
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      vec3 shadow = vec3(0.92,0.96,1.06);
      vec3 high = vec3(1.06,1.0,0.9);
      c.rgb *= mix(shadow, high, smoothstep(0.15, 0.75, l));
      // gentle contrast
      c.rgb = (c.rgb - 0.5) * 1.06 + 0.5;
      // vignette
      vec2 d = vUv - 0.5; d.x *= 1.3;
      float v = smoothstep(0.85, 0.25, length(d));
      c.rgb *= mix(1.0 - uVignette * 0.55, 1.0, v);
      // grain
      c.rgb += (rand(vUv * 900.0 + uTime) - 0.5) * uGrain;
      c.rgb = mix(c.rgb, uFlashColor, uFlash);
      gl_FragColor = c;
    }`,
};

// ------------------------------------------------------------------ board geometry
const COL_X = (col: number) => (col - 3) * 2.0;
const ROW_Z: Record<string, number> = { 'E:R': -3.55, 'E:F': -1.45, 'H:F': 1.45, 'H:R': 3.55 };
export function sectorCenter(k: SectorKey): THREE.Vector3 {
  return new THREE.Vector3(COL_X(Number(k[3])), 0, ROW_Z[k.slice(0, 3)]);
}

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
}

interface Task {
  dur: number;
  t: number;
  start?: () => void;
  tick?: (k: number, dt: number) => void;
  end?: () => void;
  started?: boolean;
}

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

export class Diorama {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  composer!: EffectComposer;
  bloom!: UnrealBloomPass;
  grade!: ShaderPass;
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
  mode: 'title' | 'explore' | 'combat' = 'title';
  private camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private shake = 0;
  private flash = 0;
  private running = true;
  private raf = 0;
  private lastState: CombatState | null = null;
  private exploreParty: { id: string; classId: string; weaponIcon?: string }[] = [];
  stats = { fps: 0, frameMs: 0, calls: 0, tris: 0, geos: 0, texs: 0, sceneLoadMs: 0 };
  private fpsAcc = 0;
  private fpsN = 0;
  private dpr = 1;
  private autoQuality = true;
  private slowFrames = 0;

  constructor(
    private container: HTMLElement,
    private labels: HTMLElement,
    public cb: DioramaCallbacks = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.domElement.className = 'three';
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    setAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x0e0c0c);
    this.scene.add(this.boardGroup, this.vfx.group, this.markers, this.engageLines);
    const stage = new THREE.SpotLight(0xfff0dc, 70, 30, 0.75, 0.6, 1.4);
    stage.position.set(0, 13, 6);
    stage.target.position.set(0, 0, -0.5);
    this.scene.add(stage, stage.target);
    this.camera.position.set(0, 9, 12);
    this.camPos.copy(this.camera.position);
    this.setupComposer();
    this.buildBoard();
    this.resize();
    window.addEventListener('resize', this.resize);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerleave', () => this.setHover(null, null, 0, 0));
    this.loop();
  }

  // ------------------------------------------------------------------ setup
  private setupComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.6, 0.82);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GRADE_SHADER);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  setQuality(q: Quality | 'auto') {
    this.autoQuality = q === 'auto';
    const qq: Quality = q === 'auto' ? (this.isMobile() ? 'medium' : 'high') : q;
    this.quality = qq;
    this.renderer.shadowMap.enabled = qq !== 'low';
    this.bloom.enabled = qq !== 'low';
    this.vfx.density = qq === 'low' ? 0.45 : qq === 'medium' ? 0.75 : 1;
    this.dpr = Math.min(window.devicePixelRatio || 1, qq === 'high' ? 2 : qq === 'medium' ? 1.5 : 1);
    this.resize();
    if (this.envScene) {
      const id = this.sceneId;
      this.sceneId = '';
      void this.loadScene(id);
    }
  }
  private isMobile() {
    return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || Math.min(window.innerWidth, window.innerHeight) < 560;
  }

  resize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // keep the whole 5×2 board in frame on narrow (portrait-ish) screens
    this.camera.fov = w / h < 1.2 ? 52 : w / h < 1.6 ? 42 : 36;
    this.camera.updateProjectionMatrix();
    this.vfx.setPixelScale(h * this.dpr);
  };

  private buildBoard() {
    void model('formation_plate').then((proto) => {
      for (const side of ['E', 'H'] as const)
        for (const row of ['F', 'R'] as const)
          for (let col = 1; col <= 5; col++) {
            const k = `${side}:${row}${col}` as SectorKey;
            const p = proto.clone(true);
            p.position.copy(sectorCenter(k));
            p.scale.set(1.12, 1, 1.4);
            p.traverse((o) => {
              const m = o as THREE.Mesh;
              if (m.isMesh) {
                m.material = pbr('stone_plate', { color: side === 'E' ? 0x8a8078 : 0xa49c90 });
                m.castShadow = false;
                m.receiveShadow = true;
                m.userData.sector = k;
              }
            });
            const hl = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.62), new THREE.MeshBasicMaterial({ map: sprite('textures/glow_radial.png'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
            hl.rotation.x = -Math.PI / 2;
            hl.position.copy(sectorCenter(k)).setY(0.11);
            hl.userData.sector = k;
            this.boardGroup.add(p, hl);
            this.plates.set(k, { mesh: p, hl });
          }
    });
  }

  // ------------------------------------------------------------------ scenes
  async loadScene(sceneId: string) {
    if (sceneId === this.sceneId) return;
    const t0 = performance.now();
    this.sceneId = sceneId;
    const built = await buildScene(sceneId, this.quality);
    if (this.sceneId !== sceneId) return;
    if (this.envScene) this.scene.remove(this.envScene.group);
    this.envScene = built;
    this.scene.add(built.group);
    const look = (await import('./scenes')).LOOKS[sceneId];
    this.scene.fog = new THREE.FogExp2(look?.fog ?? 0x141216, (look?.fogDensity ?? 0.04) * 0.6);
    this.scene.background = new THREE.Color(look?.fog ?? 0x0e0c0c);
    this.vfx.emberSources = built.emberSources;
    this.stats.sceneLoadMs = Math.round(performance.now() - t0);
    this.flash = 0.6; // soft fade-in from dark
    this.grade.uniforms.uFlashColor.value.set(0x0b0909);
  }

  setMode(mode: 'title' | 'explore' | 'combat') {
    this.mode = mode;
    this.boardGroup.visible = mode === 'combat';
    if (mode !== 'combat') {
      for (const [id, f] of this.figs) if (f.side === 'E') this.removeFig(id);
    }
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
    v = { id: f.id, rig, sector: f.sector, slot: 0, side: f.side, pos: new THREE.Vector3(), status: f.status, typeId: f.typeId, tween: null, anim: null, fallen: f.status === 'caido' || f.status === 'derrotado' ? 1 : 0, dead: false, deathT: 0, flash: 0, hidden: false, phase: Math.random() * 10, weaponIcon };
    // nameplate
    const plate = document.createElement('div');
    plate.className = `nameplate ${f.side === 'E' ? 'enemy' : 'hero'}`;
    this.labels.appendChild(plate);
    v.plate = plate;
    this.figs.set(f.id, v);
    return v;
  }
  private removeFig(id: string) {
    const v = this.figs.get(id);
    if (!v) return;
    this.scene.remove(v.rig.root);
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
      this.updatePlate(v, f);
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

  private updatePlate(v: FigView, f: Figure) {
    if (!v.plate) return;
    if (f.side === 'H') {
      v.plate.style.display = 'none';
      return;
    }
    const pct = Math.max(0, f.hp / f.maxHp) * 100;
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
    v.plate.innerHTML = `<div class="np-bar"><i style="width:${pct}%"></i></div><div class="np-row"><span class="np-hp">${f.hp}</span>${f.armor ? `<span class="np-arm">${f.armor}</span>` : ''}${conds.map((c) => `<svg class="np-c c-${c}"><use href="#cond_${c}"/></svg>`).join('')}${br}</div>`;
  }

  private updateMarkers(S: CombatState) {
    this.markers.clear();
    const bf = S.battlefield;
    for (const k of bf.cover) {
      const c = sectorCenter(k);
      void model('formation_divider').then((m) => {
        m.position.copy(c).add(new THREE.Vector3(0, 0, k[0] === 'E' ? 0.82 : -0.82));
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
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 1.2), new THREE.MeshBasicMaterial({ color: 0xc2463a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(COL_X(col), 0.03, 0);
      this.engageLines.add(m);
      const x = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: sprite('textures/glow_radial.png'), color: 0xff5a3a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      x.rotation.x = -Math.PI / 2;
      x.position.set(COL_X(col), 0.04, 0);
      this.engageLines.add(x);
    }
  }

  setHighlight(h: Highlight) {
    this.highlight = h;
  }

  // ------------------------------------------------------------------ input
  private onPointerMove = (e: PointerEvent) => {
    const hit = this.pick(e);
    this.setHover(hit.figureId ?? null, hit.sector ?? null, e.clientX, e.clientY);
  };
  private onPointerDown = (e: PointerEvent) => {
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
    while (this.queue.length) {
      const t = this.queue.shift()!;
      if (!t.started) t.start?.();
      t.tick?.(1, 0);
      t.end?.();
    }
    for (const v of this.figs.values()) {
      v.tween = null;
      v.anim = null;
    }
    if (this.lastState) void this.syncCombat(this.lastState, {});
  }

  play(events: DomainEvent[]) {
    for (const ev of events) this.enqueueEvent(ev);
  }

  private task(t: Omit<Task, 't'>) {
    this.queue.push({ ...t, t: 0 });
  }
  private headPos(id: string) {
    const v = this.figs.get(id);
    if (!v) return new THREE.Vector3();
    return v.pos.clone().setY(v.rig.height * 0.75);
  }
  private chestPos(id: string) {
    const v = this.figs.get(id);
    if (!v) return new THREE.Vector3();
    return v.pos.clone().setY(v.rig.height * 0.55);
  }

  private pendingAttack: { sourceId: string; cat: string; school: string } | null = null;

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
        this.pendingAttack = { sourceId: ev.sourceId, cat: ev.cat, school: ev.school };
        const v = this.figs.get(ev.sourceId);
        if (!v) break;
        const tgt = ev.targetIds[0] ? this.figs.get(ev.targetIds[0]) : undefined;
        const dir = tgt ? tgt.pos.clone().sub(v.pos).setY(0).normalize() : new THREE.Vector3(0, 0, v.side === 'H' ? -1 : 1);
        this.task({
          dur: 0.32,
          start: () => {
            v.anim = { kind: ev.school === 'arcane' || ev.school === 'holy' || ev.school === 'bell' ? 'cast' : 'windup', t: 0, dur: 0.32, dir };
            snd(ev.school === 'arcane' ? 'spell_arcane_cast' : ev.school === 'holy' ? 'holy_cast' : ev.school === 'arrow' ? 'bow_draw' : ev.school === 'bolt' ? 'crossbow_shot' : ev.school === 'bell' ? 'bell_toll_short' : ev.cat === 'cac' ? 'swing_light' : 'swing_heavy', { volume: 0.8 });
          },
        });
        break;
      }
      case 'roll':
        this.task({ dur: 0.62, start: () => this.cb.onRoll?.(ev) });
        break;
      case 'hit':
      case 'miss': {
        const src = this.figs.get(ev.sourceId);
        const tgt = this.figs.get(ev.targetId);
        if (!tgt) break;
        const ranged = this.pendingAttack && (this.pendingAttack.cat === 'distancia' || this.pendingAttack.cat === 'global');
        const school = ev.type === 'hit' ? ev.school : this.pendingAttack?.school ?? 'metal';
        const travel = ranged && src ? 0.38 : 0.12;
        if (src) {
          const dir = tgt.pos.clone().sub(src.pos).setY(0).normalize();
          this.task({ dur: 0.14, start: () => (src.anim = { kind: ranged ? 'release' : 'lunge', t: 0, dur: 0.38, dir }) });
          if (ranged) this.projectile(src, tgt, school, travel);
        }
        this.task({
          dur: travel + 0.1,
          tick: () => undefined,
          end: () => {
            const at = this.chestPos(tgt.id);
            if (ev.type === 'miss') {
              this.floatText(at, 'Erro', 'miss');
              snd('miss_whoosh', { volume: 0.7 });
              return;
            }
            if (ev.damage > 0) {
              this.vfx.impact(at, school, ev.damage / 2 + (ev.critical ? 0.6 : 0));
              tgt.anim = { kind: 'hurt', t: 0, dur: 0.45, dir: src ? tgt.pos.clone().sub(src.pos).setY(0).normalize() : new THREE.Vector3() };
              tgt.flash = 1;
              this.floatText(at, `${ev.damage}`, ev.critical ? 'crit' : 'dmg');
              this.shake = Math.min(0.35, 0.08 + ev.damage * 0.05 + (ev.critical ? 0.15 : 0));
              snd(impactSound(school, ev.damage), { volume: Math.min(1, 0.6 + ev.damage * 0.12) });
              if (ev.critical) snd('dice_critical', { volume: 0.6 });
            } else {
              tgt.anim = { kind: 'block', t: 0, dur: 0.4 };
              this.vfx.guard(at);
              this.floatText(at, 'Bloqueado', 'block');
              snd(ev.blocked > 0 ? 'block_shield' : 'armor_absorb', { volume: 0.8 });
            }
          },
        });
        break;
      }
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
          dur: 0.45,
          start: () => {
            const at = this.chestPos(ev.targetId);
            this.vfx.heal(this.figs.get(ev.targetId)?.pos.clone() ?? at);
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
            this.floatText(at.clone().add(new THREE.Vector3(0, 0.25, 0)), CONDITION_LABEL[ev.condition] ?? ev.condition, 'cond');
            const s: Record<string, string> = { guardado: 'guard_gain', veneno: 'cond_poison', sangramento: 'cond_bleed', queimando: 'cond_burn', atordoado: 'cond_stun', imobilizado: 'cond_immobilize', exposto: 'cond_exposed', quebrado: 'cond_broken', bencao: 'bless', julgado: 'holy_impact', furtivo: 'dash' };
            snd(s[ev.condition] ?? 'ui_click', { volume: 0.55 });
          },
        });
        break;
      case 'guardUsed':
        this.task({ dur: 0.1, start: () => this.vfx.guard(this.chestPos(ev.targetId)) });
        break;
      case 'move': {
        const v = this.figs.get(ev.figureId);
        if (!v) break;
        const to = this.lastState ? this.slotPositions({ figures: this.lastState.figures.map((f) => (f.id === ev.figureId ? { ...f, sector: ev.to } : f)) }).get(ev.figureId) ?? sectorCenter(ev.to) : sectorCenter(ev.to);
        const dur = ev.teleport ? 0.35 : ev.forced ? 0.32 : 0.48;
        this.task({
          dur,
          start: () => {
            v.tween = { from: v.pos.clone(), to: to.clone(), t: 0, dur, hop: ev.forced ? 0.05 : ev.teleport ? 0 : 0.22 };
            v.sector = ev.to;
            if (ev.teleport) {
              this.vfx.impact(v.pos.clone().setY(0.8), 'arcane', 0.6);
              snd('teleport', { volume: 0.7 });
            } else snd(ev.forced ? 'push_impact' : `step_stone_${1 + Math.floor(Math.random() * 3)}`, { volume: 0.55 });
          },
          end: () => {
            v.pos.copy(to);
            v.tween = null;
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
        this.task({
          dur: 1.2,
          start: () => {
            const v = this.figs.get(ev.figureId);
            if (!v) return;
            v.dead = true;
            v.deathT = v.rig.anim ? -0.7 : 0;
            v.rig.anim?.play('death', { hold: true, speed: 1.3 });
            this.vfx.dissolve(v.pos.clone(), v.rig.height);
            if (v.plate) v.plate.style.display = 'none';
            snd('death_enemy', { volume: 0.85 });
          },
          end: () => this.removeFig(ev.figureId),
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
              }
            } else if (ev.what === 'phase2') {
              this.vfx.impact(at, 'profane', 2);
              this.shake = 0.4;
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
      case 'defeat':
        this.task({ dur: 0.2 });
        break;
      default:
        break;
    }
    if (ev.type === 'activationEnd') this.pendingAttack = null;
  }

  private projectile(src: FigView, tgt: FigView, school: string, dur: number) {
    const from = src.pos.clone().setY(src.rig.height * 0.65);
    const to = tgt.pos.clone().setY(tgt.rig.height * 0.55);
    let obj: THREE.Object3D;
    if (school === 'arrow' || school === 'bolt') {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 5), flat(0x5a4632)));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 6), flat(0x9aa0a8, { metalness: 0.8 }));
      tip.position.y = 0.38;
      g.add(tip);
      obj = g;
    } else {
      const c = school === 'holy' ? 0xffe2a0 : school === 'fire' ? 0xff7a2a : school === 'profane' || school === 'bell' ? 0xb070ff : 0x9a8cff;
      obj = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), flat(c, { emissive: c, emissiveIntensity: 4 }));
    }
    this.scene.add(obj);
    const task: Task = {
      dur,
      t: 0,
      tick: (k) => {
        const p = from.clone().lerp(to, k);
        p.y += Math.sin(k * Math.PI) * (school === 'arrow' ? 0.8 : 0.3);
        obj.position.copy(p);
        const ahead = from.clone().lerp(to, Math.min(1, k + 0.05));
        ahead.y += Math.sin(Math.min(1, k + 0.05) * Math.PI) * (school === 'arrow' ? 0.8 : 0.3);
        obj.lookAt(ahead);
        obj.rotateX(Math.PI / 2);
        if (school !== 'arrow' && school !== 'bolt' && Math.random() < 0.6) this.vfx.condition(p, 'exposto');
      },
      end: () => this.scene.remove(obj),
    };
    this.queue.push(task);
    if (school === 'arrow') this.cb.onSound?.('bow_release', { volume: 0.8 });
  }

  private floatText(at: THREE.Vector3, text: string, kind: string) {
    const el = document.createElement('div');
    el.className = `float-text ft-${kind}`;
    el.textContent = text;
    this.labels.appendChild(el);
    const p = at.clone().project(this.camera);
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    el.style.left = `${((p.x + 1) / 2) * w}px`;
    el.style.top = `${((1 - p.y) / 2) * h}px`;
    setTimeout(() => el.remove(), 1500);
  }

  // ------------------------------------------------------------------ loop
  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const rawDt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const dt = rawDt;
    this.processQueue(dt * this.speed);
    this.updateFigures(dt, t);
    this.updateCamera(dt, t);
    this.vfx.update(dt);
    // highlights
    const time = t;
    for (const [k, p] of this.plates) {
      const kind = this.highlight.sectors.get(k);
      const mat = p.hl.material as THREE.MeshBasicMaterial;
      const hover = this.hoverSector === k && !this.hoverFig;
      const target = kind ? (hover ? 0.95 : 0.55 + Math.sin(time * 3) * 0.12) : hover && this.mode === 'combat' ? 0.18 : 0;
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * 12);
      mat.color.set(kind === 'attack' ? 0xff5a40 : kind === 'ally' ? 0x8fe07a : kind === 'area' ? 0xff8a40 : kind === 'objective' ? 0xb59cff : kind === 'deploy' ? 0x9fd0ff : 0xffd27a);
    }
    for (const m of this.markers.children) if (m.userData.spin) m.rotation.z += dt * m.userData.spin;
    if (this.envScene) {
      for (const f of this.envScene.flicker) f.light.intensity = f.base * (0.82 + Math.sin(t * 9 + f.phase) * 0.06 + Math.sin(t * 23 + f.phase * 3) * 0.05 + Math.random() * 0.05);
      const bell = this.envScene.bell;
      if (bell) {
        const sw = (bell.userData.swing ?? 0) as number;
        bell.rotation.z = Math.sin(t * 2.2) * 0.04 * sw + Math.sin(t * 0.5) * 0.008;
        bell.userData.swing = Math.max(0, sw - dt * 0.25);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.grade.uniforms.uFlash.value = this.flash * 0.6;
    this.grade.uniforms.uTime.value = t;
    const t0 = performance.now();
    if (this.quality === 'low') this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
    this.updateLabels();
    const info = this.renderer.info;
    this.stats.calls = info.render.calls;
    this.stats.tris = info.render.triangles;
    this.stats.geos = info.memory.geometries;
    this.stats.texs = info.memory.textures;
    this.fpsAcc += rawDt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.stats.fps = Math.round(this.fpsN / this.fpsAcc);
      this.stats.frameMs = +((this.fpsAcc / this.fpsN) * 1000).toFixed(1);
      // adaptive quality: degrade when sustained low FPS
      if (this.autoQuality && this.stats.fps < 40 && this.quality !== 'low') {
        if (++this.slowFrames > 6) {
          this.slowFrames = 0;
          const next: Quality = this.quality === 'high' ? 'medium' : 'low';
          this.quality = next;
          this.renderer.shadowMap.enabled = next !== 'low';
          this.bloom.enabled = next !== 'low';
          this.dpr = Math.max(1, this.dpr - 0.5);
          this.vfx.density *= 0.7;
          this.resize();
        }
      } else this.slowFrames = 0;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    void t0;
  };

  private processQueue(dt: number) {
    let budget = dt;
    let guard = 0;
    while (this.queue.length && guard++ < 50) {
      const t = this.queue[0];
      if (!t.started) {
        t.started = true;
        t.start?.();
      }
      const remaining = t.dur - t.t;
      const step = Math.min(remaining, budget);
      t.t += step;
      budget -= step;
      t.tick?.(t.dur > 0 ? t.t / t.dur : 1, step);
      if (t.t >= t.dur - 1e-6) {
        this.queue.shift();
        t.end?.();
        if (!this.queue.length) {
          this.cb.onQueueIdle?.();
          if (this.lastState) void this.syncCombat(this.lastState, {});
        }
      } else break;
      if (budget <= 0) break;
    }
  }

  private updateFigures(dt: number, t: number) {
    for (const v of this.figs.values()) {
      const r = v.rig;
      // tween between sectors
      if (v.tween) {
        if (r.anim && v.tween.t === 0 && v.tween.hop > 0.1) r.anim.play('walk', { speed: 1.6 });
        v.tween.t = Math.min(v.tween.dur, v.tween.t + dt * this.speed);
        const k = v.tween.t / v.tween.dur;
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        v.pos.lerpVectors(v.tween.from, v.tween.to, e);
        v.pos.y = 0.12 + Math.sin(k * Math.PI) * v.tween.hop;
      }
      r.root.position.copy(v.pos);
      // facing
      const baseYaw = v.side === 'H' ? Math.PI : 0;
      r.root.rotation.y += (baseYaw - r.root.rotation.y) * Math.min(1, dt * 6);
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
        r.anim.update(dt * this.speed);
        if (v.anim && !v.anim.t) {
          const k = v.anim.kind;
          const school = this.pendingAttack?.school;
          if (k === 'windup') r.anim.play(this.pendingAttack && (this.pendingAttack.cat === 'distancia') && (r.anim.map.shoot && (school === 'arrow' || school === 'bolt')) ? 'shoot' : 'attack', { speed: 1.25 });
          else if (k === 'cast') r.anim.play(school === 'holy' || school === 'bell' ? 'raise' : 'cast', { speed: 1.2 });
          else if (k === 'hurt') r.anim.play('hit', { speed: 1.2 });
          else if (k === 'block') r.anim.play('block', { speed: 1.2 });
          else if (k === 'fall') {
            r.anim.play('fall', { hold: true });
          } else if (k === 'rise') {
            r.anim.holding = false;
            r.anim.play('rise');
          } else if (k === 'intent') r.anim.play('taunt', { speed: 1.4 });
        }
      }
      // one-shot animations
      if (v.anim) {
        v.anim.t += dt * this.speed;
        const k = Math.min(1, v.anim.t / v.anim.dur);
        const dir = v.anim.dir ?? new THREE.Vector3();
        const local = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -r.root.rotation.y);
        if (r.anim) {
          if (v.anim.kind === 'lunge') r.root.position.addScaledVector(dir, Math.sin(k * Math.PI) * 0.45);
          if (v.anim.kind === 'hurt') r.root.position.addScaledVector(dir, Math.sin(k * Math.PI) * 0.12);
        } else switch (v.anim.kind) {
          case 'windup':
            r.armR.rotation.x = -k * 1.8;
            r.body.position.z = -local.z * 0.08 * k;
            break;
          case 'cast':
            r.armR.rotation.x = -k * 2.4;
            r.armL.rotation.x = -k * 2.2;
            r.body.position.y += k * 0.06;
            break;
          case 'lunge': {
            const s = Math.sin(k * Math.PI);
            r.root.position.addScaledVector(dir, s * 0.55);
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
            r.root.position.addScaledVector(dir, s * 0.18);
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
      } else if (v.fallen >= 1 && !r.anim.holding && !v.anim) {
        r.anim.play('fall', { hold: true, speed: 4 });
      }
      // hit flash
      if (v.flash > 0) {
        v.flash = Math.max(0, v.flash - dt * 4);
        for (const m of r.mats) {
          m.emissive.copy(m.userData.baseEmissive).lerp(new THREE.Color(0xffd0b0), v.flash);
          m.emissiveIntensity = Math.max(m.userData.baseEmissiveIntensity, v.flash * 1.4);
        }
      }
      // dissolve
      if (v.dead) {
        v.deathT += dt * this.speed;
        const s = Math.max(0, 1 - Math.max(0, v.deathT) / 0.75);
        r.root.scale.setScalar(r.scale * (0.6 + 0.4 * s));
        r.root.position.y -= (1 - s) * 0.6;
        for (const m of r.mats) {
          m.transparent = true;
          m.opacity = s;
        }
      }
      // highlight ring under figure
      const hl = this.highlight.figures.get(v.id);
      let ring = r.root.getObjectByName('hlring') as THREE.Mesh | undefined;
      if (hl || this.hoverFig === v.id) {
        if (!ring) {
          ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
          ring.name = 'hlring';
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.04;
          r.root.add(ring);
        }
        ring.visible = true;
        const c = hl === 'attack' ? 0xff5a40 : hl === 'ally' ? 0x8fe07a : hl === 'active' ? 0xffd27a : hl === 'intent' ? 0xb59cff : 0xffffff;
        (ring.material as THREE.MeshBasicMaterial).color.set(c);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(t * 5) * 0.25;
        ring.scale.setScalar(1 / r.scale);
      } else if (ring) ring.visible = false;
    }
  }

  private updateCamera(dt: number, t: number) {
    const aspect = this.camera.aspect;
    if (this.mode === 'title') {
      const a = t * 0.05;
      this.camTarget.set(Math.sin(a) * 3.5, 3.2, 9 + Math.cos(a) * 1.5);
      this.camLook.set(0, 2.2, -6);
    } else if (this.mode === 'explore') {
      const a = Math.sin(t * 0.07) * 0.6;
      this.camTarget.set(Math.sin(a) * 6, 5.2, 11.5);
      this.camLook.set(Math.sin(a) * 1.5, 1.4, -3.5);
    } else {
      const narrow = aspect < 1.45;
      // phones in landscape: the HUD eats the bottom of a short screen, so frame the board higher and a bit tighter
      const wide = aspect > 1.9;
      this.camTarget.set(Math.sin(t * 0.15) * 0.2, narrow ? 13.2 : wide ? 13.4 : 11.0, narrow ? 11.2 : wide ? 10.6 : 9.4);
      this.camLook.set(0, 0.2, wide ? 0.55 : -0.3);
    }
    this.camPos.lerp(this.camTarget, Math.min(1, dt * 1.8));
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.5);
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.25;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.25;
    }
    this.camera.lookAt(this.camLook);
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
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

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
