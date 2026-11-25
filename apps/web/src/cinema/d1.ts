/**
 * Dungeon 1 — Mosteiro do Sino Partido: the opening, the three boss intros and the finale (script: docs/STORY.md).
 * Positions are relative to the board origin (heroes +Z, enemies −Z) or computed from the room / the combat state,
 * so they survive backdrop changes. Player-facing text: short pt-BR lines.
 */
import * as THREE from 'three';
import type { Ctx, Cue, Cutscene, Shot, Speaker, V3 } from './engine/types';
import { registerCutscene } from './registry';
import { buildExterior, type Exterior } from './sets/exterior';
import { crackedBell, glowSprite, spectralLantern, type Bell, type Lantern } from './sets/props';
import { COLUMN, envBellCenter, partyOf, roomBounds, sampleKeys, stageBoard, stageParty, steps, swingEnvBell, v3 } from './scripts/helpers';
import { MENTOR } from './brand';
import { expectedScene } from './direction';

const SPEAKERS: Record<string, Speaker> = {
  anselmo: { name: MENTOR.name, kind: 'mentor' },
  severin: { name: 'Abade Severin', kind: 'villain' },
};
const NIGHT_FOG = { color: 0x0b0d15, density: 0.0105 };

// ------------------------------------------------------------------ the mentor's lantern, driven by global-time keys
interface LanternRig {
  lantern: Lantern;
  keys: { t: number; pos: V3; level?: number }[];
}
function addLantern(c: Ctx): LanternRig {
  const lantern = spectralLantern();
  c.stage.addSet('lantern', lantern.group);
  const rig: LanternRig = { lantern, keys: [] };
  c.stage.onUpdate((_dt, t) => {
    const ks = rig.keys;
    if (ks.length) {
      let i = 0;
      while (i < ks.length - 1 && ks[i + 1].t <= t) i++;
      const a = ks[i];
      const b = ks[Math.min(i + 1, ks.length - 1)];
      const u = b === a ? 0 : THREE.MathUtils.clamp((t - a.t) / Math.max(1e-4, b.t - a.t), 0, 1);
      const e = u * u * (3 - 2 * u);
      lantern.group.position.set(...a.pos).lerp(new THREE.Vector3(...b.pos), e);
      lantern.level = (a.level ?? 1) + ((b.level ?? 1) - (a.level ?? 1)) * e;
    }
    lantern.update(t);
  });
  return rig;
}

// ================================================================== ABERTURA (new campaign, at the Pórtico)
registerCutscene({
  id: 'abertura',
  dungeonId: 'd1',
  title: 'Abertura',
  trigger: { on: 'dungeonStart' },
  scene: 'portico',
  music: null,
  amb: 'amb_cloister_wind',
  speakers: SPEAKERS,
  async setup(c) {
    const ext = buildExterior(c.d.quality);
    c.stage.addSet('exterior', ext.group);
    c.data.ext = ext;
    c.stage.onUpdate((dt, t) => {
      ext.update(dt, t, c.d.camera.position, c.d.renderer.domElement.height);
      // the church door: opens at data.doorAt (stateless in time, so tapping ahead lands on the right frame)
      const at = c.data.doorAt as number | undefined;
      if (at !== undefined) {
        const k = THREE.MathUtils.clamp((t - at) / 1.6, 0, 1);
        ext.openDoor(k * k * (3 - 2 * k));
      }
    });
    c.data.lantern = addLantern(c);
    c.data.party = await stageParty(c);
  },
  shots(c) {
    const ext = c.data.ext as Exterior;
    const lan = c.data.lantern as LanternRig;
    const party = (c.data.party as ReturnType<typeof partyOf>) ?? [];
    const L = ext.length;
    const hero = (i: number, u: number) => {
      const [side, back] = COLUMN[i % COLUMN.length];
      const uu = THREE.MathUtils.clamp(u + back / L, 0, 1);
      const p = ext.path(uu);
      const tan = ext.tangent(uu);
      const perp = new THREE.Vector3(-tan.z, 0, tan.x);
      p.addScaledVector(perp, side);
      p.y = ext.heightAt(p.x, p.z);
      return p;
    };
    const walk = (u0: number, u1: number, dur: number, base = 'walk') =>
      party.map((m, i) => ({ actor: m.id, base, speed: 1.05, path: sampleKeys(dur, 8, (k) => hero(i, u0 + (u1 - u0) * k)) }));
    const lead = (u: number) => ext.path(u);
    const ahead = (u: number, d = 2.6, h = 1.9) => {
      const p = ext.path(Math.min(1, u + d / L));
      p.y = Math.max(p.y, ext.heightAt(p.x, p.z)) + h;
      return v3(p);
    };
    const bell = ext.bellTop.clone();
    const bellMid = bell.clone().add(new THREE.Vector3(0, -1.7, 0));
    const exterior = { sets: ['exterior', 'lantern'], env: false, vfx: false, fog: NIGHT_FOG, bg: 0x05060a };

    // shot timings (global start of each shot, for the lantern keys)
    const D = [8, 7.5, 9.5, 8, 8, 10];
    const T0 = D.map((_, i) => D.slice(0, i).reduce((a, b) => a + b, 0));
    c.data.doorAt = T0[4] + 4.7;

    // S3 tracking (valley path)
    const s3 = { u0: 0.42, u1: 0.58 };
    const p30 = lead(s3.u0);
    const p31 = lead(s3.u1);
    const t30 = ext.tangent(s3.u0);
    const t31 = ext.tangent(s3.u1);
    const side = (t: THREE.Vector3) => new THREE.Vector3(-t.z, 0, t.x);
    // S4 behind the party, looking up to the gate
    const s4 = { u0: 0.7, u1: 0.82 };
    const p40 = lead(s4.u0);
    const p41 = lead(s4.u1);
    // S5 through the gate to the portal
    const s5 = { u0: 0.885, u1: 0.985 };

    // the portico interior (location backdrop), relative to the room
    const rb = roomBounds(c);
    const exits = (c.d.environment as unknown as { walk?: { exits?: Record<string, { x: number; z: number }> } } | null)?.walk?.exits;
    const zIn0 = Math.min(3.0, rb.maxZ - 5.2);
    const zIn1 = Math.min(1.2, zIn0 - 2.8);
    const door = exits?.north?.z ?? Math.max(rb.minZ + 0.5, -9);
    const camZ = rb.maxZ - 0.7;

    lan.keys = [
      { t: 0, pos: ahead(s3.u0), level: 0 },
      { t: T0[2], pos: ahead(s3.u0), level: 0 },
      { t: T0[2] + 1.2, pos: ahead(s3.u0 + 0.01), level: 1 },
      { t: T0[3], pos: ahead(s3.u1) },
      { t: T0[3] + 0.01, pos: ahead(s4.u0, 3.2, 2.1) },
      { t: T0[4], pos: ahead(s4.u1, 3.2, 2.1) },
      { t: T0[4] + 0.01, pos: ahead(s5.u0, 2.4, 2.0) },
      { t: T0[4] + 4.4, pos: [0, 2.3, -3.4] },
      { t: T0[5] - 1.0, pos: [0, 2.2, -6.8], level: 0.35 },
      { t: T0[5] - 0.59, pos: [0, 2.2, zIn1 - 2.2], level: 0.6 },
      { t: T0[5] + 1, pos: [0, 2.2, zIn1 - 2.4], level: 1 },
      { t: T0[5] + 8.5, pos: [0, 2.0, door + 1.4], level: 0.85 },
    ];

    const shots: Shot[] = [
      // S1 — the monastery on its crag, storm, a distant toll
      {
        dur: D[0],
        ...exterior,
        sway: 0.06,
        cam: [
          { t: 0, pos: [38, -5.5, 86], look: [3.5, 13.5, -14], fov: 36, p: { look: [6, 16, -16] } },
          { t: D[0], pos: [30.5, -3.6, 70], look: [3.5, 14.2, -14], fov: 34, ease: 'linear', p: { look: [6, 17, -16] } },
        ],
        cues: [
          { at: 0, fade: 1, dur: 0.01 },
          { at: 0.2, fade: 0, dur: 2.4 },
          { at: 0.7, sfx: 'bell_toll_long', vol: 0.55 },
          { at: 1.6, line: 'Faz décadas que o sino rachou.', who: 'anselmo' },
          { at: 4.2, fx: () => ext.strike(1), flash: 0.18, color: 0xdde6ff },
          { at: 4.45, fx: () => ext.strike(0.6) },
        ],
      },
      // S2 — the belfry: the cracked bell swings by itself
      {
        dur: D[1],
        ...exterior,
        sway: 0.03,
        cam: [
          { t: 0, pos: v3(bellMid.clone().add(new THREE.Vector3(1.3, -0.6, 10.6))), look: v3(bellMid.clone().add(new THREE.Vector3(0, 0.35, 0))), fov: 32, pk: 0.48 },
          { t: D[1], pos: v3(bellMid.clone().add(new THREE.Vector3(0.6, -0.4, 8.0))), look: v3(bellMid.clone().add(new THREE.Vector3(0, 0.2, 0))), fov: 31, pk: 0.48, ease: 'linear' },
        ],
        cues: [
          { at: 0.6, fx: () => (ext.bell.toll(1), ext.bellEmbers.surge(1.2)), sfx: 'bell_great_cracked', vol: 0.95, flash: 0.32, color: 0xffa050, shake: 0.12, duck: 0.4 },
          { at: 1.5, line: 'E o som ficou preso no bronze.', who: 'anselmo' },
          { at: 4.9, fx: () => (ext.bell.toll(0.55), ext.bellEmbers.surge(0.6)), sfx: 'bell_toll_short', vol: 0.45, rate: 0.62, flash: 0.12, color: 0xffa050 },
        ],
      },
      // S3 — the pilgrims' path in the rain; the lantern appears
      {
        dur: D[2],
        ...exterior,
        sway: 0.045,
        actors: walk(s3.u0, s3.u1, D[2]),
        cam: [
          { t: 0, pos: v3(p31.clone().addScaledVector(t31, 7.6).addScaledVector(side(t31), -2.4).setY(ext.heightAt(p31.x + t31.x * 7.6, p31.z + t31.z * 7.6) + 1.15)), look: v3(p30.clone().add(new THREE.Vector3(0, 1.3, 0))), fov: 36, pk: 0.55, p: { pk: 0.36 } },
          { t: D[2], pos: v3(p31.clone().addScaledVector(t31, 3.7).addScaledVector(side(t31), -1.7).setY(ext.heightAt(p31.x + t31.x * 3.7, p31.z + t31.z * 3.7) + 1.3)), look: v3(p31.clone().addScaledVector(t31, -1.2).add(new THREE.Vector3(0, 1.15, 0))), fov: 36, pk: 0.55, ease: 'linear', p: { pk: 0.36 } },
        ],
        cues: [{ at: 0, music: 'music_title' }, { at: 1.3, line: 'Toda noite ele chama mais alto. Os peregrinos atendem.', who: 'anselmo', dur: 4.6 }, { at: 6.4, fx: () => ext.strike(0.7) }, ...steps(0.3, D[2])],
      },
      // S4 — low behind the party, the monastery towering ahead
      {
        dur: D[3],
        ...exterior,
        sway: 0.04,
        actors: walk(s4.u0, s4.u1, D[3]),
        cam: [
          { t: 0, pos: v3(p40.clone().addScaledVector(ext.tangent(s4.u0), -7.4).addScaledVector(side(ext.tangent(s4.u0)), -2.9).add(new THREE.Vector3(0, 1.0, 0))), look: [0.8, 6.8, -7], fov: 40, pk: 0.55, p: { pos: v3(p40.clone().addScaledVector(ext.tangent(s4.u0), -5.6).addScaledVector(side(ext.tangent(s4.u0)), -1.2).add(new THREE.Vector3(0, 2.1, 0))), pk: 0.42 } },
          { t: D[3], pos: v3(p41.clone().addScaledVector(ext.tangent(s4.u1), -6.6).addScaledVector(side(ext.tangent(s4.u1)), -2.4).add(new THREE.Vector3(0, 1.15, 0))), look: [0.4, 7.6, -7.5], fov: 40, pk: 0.55, ease: 'linear', p: { pos: v3(p41.clone().addScaledVector(ext.tangent(s4.u1), -5.0).addScaledVector(side(ext.tangent(s4.u1)), -1.0).add(new THREE.Vector3(0, 2.2, 0))), pk: 0.42 } },
        ],
        cues: [{ at: 1.0, line: 'Vocês vieram calá-lo. Sigam a minha luz.', who: 'anselmo' }, ...steps(0.2, D[3])],
      },
      // S5 — through the gate to the church door, which swings open
      {
        dur: D[4],
        ...exterior,
        sway: 0.03,
        actors: party.map((m, i) => ({
          actor: m.id,
          base: 'walk',
          speed: 1.05,
          path: [...sampleKeys(D[4] - 1.6, 6, (k) => hero(i, s5.u0 + (s5.u1 - s5.u0) * k)), { t: D[4], pos: v3(hero(i, s5.u1)) }],
        })),
        cam: [
          { t: 0, pos: [1.1, 2.4, 11.2], look: [0, 2.6, -6], fov: 38, pk: 0.62 },
          { t: D[4], pos: [0.5, 2.05, 6.8], look: [0, 2.3, -6], fov: 38, pk: 0.62, ease: 'linear' },
        ],
        cues: [
          { at: 0.9, line: 'Eu fui o último sineiro deste lugar.', who: 'anselmo' },
          ...steps(0.2, D[4] - 1.6),
          { at: 4.6, sfx: 'door_stone', vol: 0.85 },
          { at: D[4] - 1.5, state: (cc) => party.forEach((m) => cc.stage.setBase(m.id, 'idle')) },
          { at: D[4] - 0.75, fade: 1, dur: 0.7 },
        ],
      },
      // S6 — inside the Pórtico (the real location); title card
      {
        dur: D[5],
        sets: ['lantern'],
        env: true,
        vfx: true,
        sway: 0.03,
        actors: party.map((m, i) => {
          const [sx, back] = COLUMN[i % COLUMN.length];
          const from: V3 = [sx * 1.2, 0, zIn0 - back * 1.1];
          const to: V3 = [sx * 1.3, 0, zIn1 - back * 1.05];
          return { actor: m.id, base: 'walk', speed: 1.0, path: [{ t: 0, pos: from }, { t: 5.2, pos: to }] };
        }),
        cam: [
          { t: 0, pos: [1.0, 2.7, camZ], look: [0, 1.5, door + 2], fov: 42, pk: 0.62 },
          { t: 5.5, pos: [0.5, 3.4, camZ], look: [0, 1.4, door + 2.4], fov: 42, pk: 0.62, ease: 'inOut' },
          { t: D[5], pos: [0, 5.6, camZ], look: [0, 1.2, door + 3], fov: 42, pk: 0.62, ease: 'inOut' },
        ],
        cues: [
          { at: 0, fade: 0, dur: 1.1 },
          { at: 0.9, line: 'Severin espera lá em cima, sob o sino.', who: 'anselmo' },
          ...steps(0.2, 5.0, 0.52, 0.16),
          { at: 5.3, state: (cc) => party.forEach((m) => cc.stage.setBase(m.id, 'idle')) },
          { at: 4.4, chapter: { num: 'Capítulo I', title: 'Mosteiro do Sino Partido' }, dur: 4.6 },
          { at: 4.4, sfx: 'cycle_start', vol: 0.75 },
          { at: D[5] - 1.1, fade: 1, dur: 1.0 },
        ],
      },
    ];
    // party starts hidden until the valley shot
    shots[0].actors = party.map((m) => ({ actor: m.id, visible: false }));
    shots[2].actors = (shots[2].actors ?? []).map((a) => ({ ...a, visible: true }));
    return shots;
  },
});

// ================================================================== boss intros
interface BossIntro {
  id: string;
  encounterId: string;
  bossType: string;
  card: { kick: string; name: string; epi: string };
  /** Extra staging (fallback bell etc.). */
  setup?(c: Ctx): void;
  shots(c: Ctx): Shot[];
}
function registerBoss(b: BossIntro) {
  registerCutscene({
    id: b.id,
    dungeonId: 'd1',
    title: b.card.name,
    trigger: { on: 'combatStart', encounterId: b.encounterId },
    // wait for the encounter's backdrop before the first frame
    scene: (st) => expectedScene(st, true),
    speakers: SPEAKERS,
    async setup(c) {
      await stageBoard(c, b.bossType);
      for (const a of c.stage.actors.values()) c.stage.setBase(a.id, 'idle');
      b.setup?.(c);
    },
    shots: (c) => {
      const shots = b.shots(c);
      // close-ups show the boss alone; the hand-back reveals the whole line-up as the board will show it
      const bossId = c.stage.get('boss')?.id;
      const others = [...c.stage.actors.values()].filter((a) => a.id !== bossId).map((a) => a.id);
      shots.forEach((sh, i) => {
        const last = i === shots.length - 1;
        sh.actors = [...(sh.actors ?? []), ...others.map((id) => ({ actor: id, visible: last }))];
      });
      return shots;
    },
  });
}

/** Last shot of every intro: over the party's shoulders, pulling up toward the battle view, then dip to black. */
function handBack(c: Ctx, dur: number, cues: Cue[] = []): Shot {
  const lead = c.stage.get('lead');
  const lp = lead ? lead.pos.clone() : new THREE.Vector3(0, 0, 1.45);
  return {
    dur,
    env: true,
    vfx: true,
    sway: 0.025,
    cam: [
      { t: 0, pos: [lp.x + 1.7, 2.5, lp.z + 4.2], look: { actor: 'boss', part: 'chest' }, fov: 40, pk: 0.7 },
      { t: dur, pos: [lp.x * 0.3 + 0.6, 7.4, lp.z + 8.2], look: [0, 0.6, -0.6], fov: 42, pk: 0.75, ease: 'inOut' },
    ],
    cues: [...cues, { at: dur - 0.75, fade: 1, dur: 0.6 }],
  };
}

// ---- Cantor da Última Badalada (Capela do Último Ofício)
registerBoss({
  id: 'cantor',
  encounterId: 'CAP-E01',
  bossType: 'cantor',
  card: { kick: 'Capela do Último Ofício', name: 'Cantor da Última Badalada', epi: 'A voz que afina o sino' },
  shots(c) {
    const env = { env: true, vfx: true };
    return [
      {
        dur: 4.4,
        ...env,
        sway: 0.03,
        cam: [
          { t: 0, orbit: { target: { actor: 'boss', part: 'head' }, yaw: 14, pitch: 4, dist: 6.4 }, fov: 36 },
          { t: 4.4, orbit: { target: { actor: 'boss', part: 'head' }, yaw: 6, pitch: 6, dist: 4.2 }, fov: 34, ease: 'linear' },
        ],
        cues: [
          { at: 0, fade: 0, dur: 0.8 },
          { at: 0.2, sfx: 'chant_note', vol: 0.85 },
          { at: 0.3, play: { actor: 'boss', anim: 'Spellcast_Long', speed: 0.8 } },
          { at: 1.1, card: { kick: 'Capela do Último Ofício', name: 'Cantor da Última Badalada', epi: 'A voz que afina o sino' }, dur: 3.2 },
          { at: 2.5, sfx: 'chant_note', vol: 0.8, rate: 1.12 },
        ],
      },
      {
        dur: 4.6,
        ...env,
        sway: 0.02,
        cam: [
          { t: 0, orbit: { target: { actor: 'boss', part: 'chest' }, yaw: 28, pitch: 9, fit: [2.2, 2.4], shift: [0.24, 0] }, fov: 34, p: { orbit: { target: { actor: 'boss', part: 'chest', off: [0, 0.2, 0] }, yaw: 28, pitch: 9, fit: [2.2, 2.8], shift: [0, 0.3] } } },
          { t: 4.6, orbit: { target: { actor: 'boss', part: 'chest' }, yaw: -18, pitch: 6, fit: [2.0, 2.2], shift: [0.24, 0] }, fov: 34, ease: 'inOutSine', p: { orbit: { target: { actor: 'boss', part: 'chest', off: [0, 0.2, 0] }, yaw: -18, pitch: 6, fit: [2.0, 2.6], shift: [0, 0.3] } } },
        ],
        cues: [
          { at: 0.2, play: { actor: 'boss', anim: 'raise', speed: 0.9 } },
          { at: 0.35, sfx: 'sting_boss_intro', vol: 0.9, duck: 0.35, flash: 0.32, color: 0xff6a4a, shake: 0.18 },
          { at: 0.9, sfx: 'chant_note', vol: 0.7, rate: 1.25 },
          { at: 1.4, line: 'Cada nota dele afina o sino. Calem essa voz.', who: 'anselmo', dur: 3.1 },
        ],
      },
      handBack(c, 2.8),
    ];
  },
});

// ---- Vigia das Três Vigílias (Cripta — secret; only reachable once revealed)
registerBoss({
  id: 'vigia',
  encounterId: 'CRI-E01',
  bossType: 'vigia',
  card: { kick: 'Cripta das Três Vigílias', name: 'Vigia das Três Vigílias', epi: 'Ele conta as horas' },
  setup(c) {
    // the three lanterns he carries — one per vigil — glow in their colours and flare on their hour
    const rig = c.stage.get('boss')?.rig;
    const flares: THREE.Sprite[] = [];
    [0xffd27a, 0x9fd4ff, 0xff7a5a].forEach((col, i) => {
      const l = rig?.extras[`lantern${i}`];
      if (!l) return;
      const g = glowSprite(col, 0.9, 0.55);
      g.scale.setScalar(0.9 / Math.max(0.01, rig!.scale));
      l.add(g);
      flares.push(g);
    });
    c.data.flares = flares;
    c.data.flareAt = [-9, -9, -9];
    c.stage.onUpdate((_dt, t) => {
      const at = c.data.flareAt as number[];
      flares.forEach((g, i) => {
        const k = Math.max(0, 1 - (t - at[i]) / 1.4);
        (g.material as THREE.SpriteMaterial).opacity = 0.55 + k * 0.45;
        g.scale.setScalar(((0.9 + k * 1.6) / Math.max(0.01, rig!.scale)) * (1 + Math.sin(t * 3 + i) * 0.06));
      });
    });
  },
  shots(c) {
    const env = { env: true, vfx: true };
    const at = () => c.stage.point({ actor: 'boss', part: 'chest' });
    const hour = (k: number): Cue => ({
      at: 0.5 + k * 1.1,
      sfx: 'bell_toll_short',
      vol: 0.7,
      rate: 1 - k * 0.06,
      flash: 0.2,
      color: [0xffd27a, 0x9fd4ff, 0xff7a5a][k],
      fx: (cc) => {
        cc.d.vfx.ring(at(), 'rune', [0xffd27a, 0x9fd4ff, 0xff7a5a][k], 0.4, 2.6, 0.8, true);
        (cc.data.flareAt as number[])[k] = cc.time;
      },
    });
    return [
      {
        dur: 5.2,
        ...env,
        sway: 0.03,
        cam: [
          { t: 0, orbit: { target: { actor: 'boss', part: 'chest', off: [0, 0.2, 0] }, yaw: 40, pitch: 12, fit: [4.2, 4], shift: [0.2, 0] }, fov: 36, p: { orbit: { target: { actor: 'boss', part: 'chest', off: [0, 0.4, 0] }, yaw: 40, pitch: 12, fit: [4.2, 4.4], shift: [0, 0.28] } } },
          { t: 5.2, orbit: { target: { actor: 'boss', part: 'chest', off: [0, 0.2, 0] }, yaw: 6, pitch: 8, fit: [3.4, 3.4], shift: [0.2, 0] }, fov: 36, ease: 'linear', p: { orbit: { target: { actor: 'boss', part: 'chest', off: [0, 0.4, 0] }, yaw: 6, pitch: 8, fit: [3.4, 3.8], shift: [0, 0.28] } } },
        ],
        cues: [{ at: 0, fade: 0, dur: 0.9 }, hour(0), hour(1), hour(2), { at: 2.9, card: { kick: 'Cripta das Três Vigílias', name: 'Vigia das Três Vigílias', epi: 'Ele conta as horas' }, dur: 3.2 }],
      },
      {
        dur: 5.0,
        ...env,
        sway: 0.02,
        cam: [
          { t: 0, orbit: { target: { actor: 'boss', part: 'chest', off: [0, 0.25, 0] }, yaw: -14, pitch: 4, fit: [2.6, 2.6], shift: [0.18, 0] }, fov: 34, p: { orbit: { target: { actor: 'boss', part: 'chest', off: [0, 0.35, 0] }, yaw: -14, pitch: 4, fit: [2.6, 3.0], shift: [0, 0.26] } } },
          { t: 5.0, orbit: { target: { actor: 'boss', part: 'chest', off: [0, 0.25, 0] }, yaw: 12, pitch: 7, fit: [2.3, 2.3], shift: [0.18, 0] }, fov: 34, ease: 'inOutSine', p: { orbit: { target: { actor: 'boss', part: 'chest', off: [0, 0.35, 0] }, yaw: 12, pitch: 7, fit: [2.3, 2.7], shift: [0, 0.26] } } },
        ],
        cues: [
          { at: 0.25, play: { actor: 'boss', anim: 'cast', speed: 0.85 } },
          { at: 0.4, sfx: 'sting_boss_intro', vol: 0.9, duck: 0.35, flash: 0.28, color: 0x9fd4ff, shake: 0.16 },
          { at: 0.7, line: 'Nem eu sabia que ele ainda vigiava.', who: 'anselmo', dur: 2.3 },
          { at: 3.0, line: 'Ele conhece a sua hora. Não a entreguem.', who: 'anselmo', dur: 2.6 },
        ],
      },
      handBack(c, 2.6),
    ];
  },
});

// ---- Abade Severin (Campanário Partido)
registerBoss({
  id: 'severin',
  encounterId: 'CAM-E01',
  bossType: 'severin',
  card: { kick: 'Campanário Partido', name: 'Abade Severin', epi: 'O Sino Partido' },
  setup(c) {
    // the location normally has the great bell overhead; if not, hang our own above Severin
    if (!envBellCenter(c)) {
      const b = crackedBell(2.6);
      const boss = c.stage.get('boss');
      b.pivot.position.set(boss?.pos.x ?? 0, 6.6, (boss?.pos.z ?? -1.5) - 5.5);
      c.stage.addSet('bell', b.pivot);
      c.stage.onUpdate((dt, t) => b.update(dt, t));
      c.data.bell = b;
    }
  },
  shots(c) {
    const env = { env: true, vfx: true };
    const own = c.data.bell as Bell | undefined;
    const bellAt = (): V3 => {
      const e = envBellCenter(c);
      if (e) return v3(e);
      return own ? v3(own.pivot.position.clone().add(new THREE.Vector3(0, -1.3, 0))) : [0, 4.6, -8.6];
    };
    const toll = (k: number) => (cc: Ctx) => {
      swingEnvBell(cc, k);
      own?.toll(k);
      cc.d.vfx.impact(new THREE.Vector3(...bellAt()), 'bell', 1.4 * k);
    };
    const boss = c.stage.get('boss');
    const bp = boss ? boss.pos : new THREE.Vector3(0, 0, -1.45);
    return [
      {
        dur: 4.6,
        ...env,
        sway: 0.03,
        cam: [
          { t: 0, pos: [bp.x + 2.6, 0.5, bp.z + 5.4], look: bellAt(), fov: 44, pk: 0.7 },
          { t: 1.4, pos: [bp.x + 2.45, 0.55, bp.z + 5.1], look: bellAt(), fov: 44, pk: 0.7, ease: 'linear' },
          { t: 4.6, pos: [bp.x + 0.7, 1.35, bp.z + 3.4], look: { actor: 'boss', part: 'head' }, fov: 40, pk: 0.7, ease: 'inOut' },
        ],
        cues: [
          { at: 0, fade: 0, dur: 0.7 },
          { at: 0.35, fx: toll(1), sfx: 'bell_great_cracked', vol: 0.95, flash: 0.35, color: 0xffb070, shake: 0.2 },
        ],
      },
      {
        dur: 4.8,
        ...env,
        sway: 0.02,
        cam: [
          { t: 0, orbit: { target: { actor: 'boss', part: 'chest', off: [0, 0.15, 0] }, yaw: 24, pitch: 2, fit: [2.6, 3.0], shift: [0.24, 0] }, fov: 36, p: { orbit: { target: { actor: 'boss', part: 'chest', off: [0, 0.3, 0] }, yaw: 24, pitch: 2, fit: [2.6, 3.4], shift: [0, 0.3] } } },
          { t: 4.8, orbit: { target: { actor: 'boss', part: 'chest', off: [0, 0.15, 0] }, yaw: -14, pitch: 6, fit: [2.4, 2.8], shift: [0.24, 0] }, fov: 36, ease: 'inOutSine', p: { orbit: { target: { actor: 'boss', part: 'chest', off: [0, 0.3, 0] }, yaw: -14, pitch: 6, fit: [2.4, 3.2], shift: [0, 0.3] } } },
        ],
        cues: [
          { at: 0.2, play: { actor: 'boss', anim: 'cast', speed: 0.85 } },
          { at: 0.45, sfx: 'sting_boss_intro', vol: 1, duck: 0.3, flash: 0.4, color: 0xff7a40, shake: 0.35, fx: toll(0.6) },
          { at: 0.7, card: { kick: 'Campanário Partido', name: 'Abade Severin', epi: 'O Sino Partido' }, dur: 3.2 },
          { at: 2.6, line: 'Ajoelhem-se. A última badalada é minha.', who: 'severin', dur: 2.4 },
        ],
      },
      handBack(c, 3.6, [{ at: 0.3, line: 'Ele tirou a corda das minhas mãos.', who: 'anselmo', dur: 2.5 }]),
    ];
  },
});

// ================================================================== FINAL (after the Campanário victory, before the epilogue)
registerCutscene({
  id: 'final',
  dungeonId: 'd1',
  title: 'O silêncio',
  trigger: { on: 'dungeonEnd' },
  scene: 'campanario',
  speakers: SPEAKERS,
  async setup(c) {
    const party = await stageParty(c);
    const spots: V3[] = [
      [0, 0, 1.5],
      [-1.35, 0, 2.05],
      [1.35, 0, 2.05],
      [-2.5, 0, 2.8],
      [2.5, 0, 2.8],
    ];
    party.forEach((m, i) => {
      c.stage.place(m.id, spots[i % spots.length], 180);
      c.stage.setBase(m.id, 'idle');
    });
    c.data.party = party;
    // the Abbot, kneeling under the silent bell
    const sev = await c.stage.enemy('severin-final', 'severin');
    c.stage.alias('boss', sev.id);
    c.stage.place(sev.id, [0, 0, -2.2], 0);
    c.data.kneel = sev.id;
    if (!envBellCenter(c)) {
      const b = crackedBell(2.6);
      b.pivot.position.set(0, 6.6, -7.4);
      c.stage.addSet('bell', b.pivot);
      c.stage.onUpdate((dt, t) => b.update(dt, t));
      c.data.bell = b;
    }
    c.data.lantern = addLantern(c);
    // a dying ember glow at the bell's crack
    const g = glowSprite(0xff7a2a, 2.4, 0.9);
    c.stage.addSet('crackGlow', g);
    c.data.crackGlow = g;
  },
  shots(c) {
    const party = (c.data.party as ReturnType<typeof partyOf>) ?? [];
    const own = c.data.bell as Bell | undefined;
    const lan = c.data.lantern as LanternRig;
    const glow = c.data.crackGlow as THREE.Sprite;
    const bellC = envBellCenter(c) ?? (own ? own.pivot.position.clone().add(new THREE.Vector3(0, -1.3, 0)) : new THREE.Vector3(0, 4.6, -8.6));
    glow.position.copy(bellC).add(new THREE.Vector3(0.25, -0.2, 0.9));
    const silencio = !!c.st.flags['state:silencio'];
    const env = { env: true, vfx: true };
    const D = [7, 8, 9.5];
    const T0 = [0, D[0], D[0] + D[1]];
    lan.keys = [
      { t: 0, pos: [0.4, 2.4, 0.4], level: 0 },
      { t: T0[1], pos: [0.4, 2.4, 0.4], level: 0 },
      { t: T0[1] + 1.4, pos: [0.3, 2.3, 0.6], level: 1 },
      { t: T0[2] + 0.5, pos: [0.2, 2.5, 0.2], level: 1 },
      { t: T0[2] + 5.4, pos: v3(bellC.clone().add(new THREE.Vector3(0, -0.4, 1.2))), level: 1 },
      { t: T0[2] + 6.6, pos: v3(bellC.clone().add(new THREE.Vector3(0, 0, 0.6))), level: 0 },
    ];
    const kneel = (cc: Ctx) => void cc.stage.pose(cc.data.kneel as string, 'Lie_Down', 0.6);
    const heroIds = party.map((m) => m.id);
    const fadeGlow = (from: number, to: number, dur: number) => (cc: Ctx) => {
      const t0 = cc.time;
      const off = cc.stage.onUpdate(() => {
        const k = Math.min(1, (cc.time - t0) / dur);
        (glow.material as THREE.SpriteMaterial).opacity = from + (to - from) * k;
        if (k >= 1) off();
      });
    };
    return [
      {
        dur: D[0],
        ...env,
        sway: 0.03,
        actors: [{ actor: 'boss', face: 0, visible: true }, ...heroIds.map((id) => ({ actor: id, visible: false }))],
        cam: [
          { t: 0, pos: [1.5, 0.6, 2.6], look: v3(bellC), fov: 40, pk: 0.7 },
          { t: D[0], pos: [1.1, 0.85, 1.6], look: v3(bellC.clone().add(new THREE.Vector3(0, -0.8, 0))), fov: 38, pk: 0.7, ease: 'linear' },
        ],
        cues: [
          { at: 0, fade: 0, dur: 1.2 },
          { at: 0.05, state: kneel },
          { at: 0.1, state: (cc) => swingEnvBell(cc, 0.5) },
          { at: 0.6, sfx: 'bell_toll_short', vol: 0.5, rate: 0.82, fx: fadeGlow(0.9, 0.45, 2.5) },
          { at: 1.6, line: 'Ouçam.', who: 'anselmo', dur: 2.0 },
          { at: 3.6, line: silencio ? 'Nada. Nem um eco.' : 'Uma última vibração… e nada.', who: 'anselmo', dur: 3.0, fx: fadeGlow(0.45, 0, 2.4) },
        ],
      },
      {
        dur: D[1],
        ...env,
        sway: 0.025,
        cam: [
          { t: 0, orbit: { target: [0, 1.05, 1.9], yaw: 148, pitch: 9, fit: [Math.min(6.2, 2.4 + party.length * 0.9), 2.4] }, fov: 36, p: { orbit: { target: [-0.6, 1.1, 1.9], yaw: 152, pitch: 9, fit: [2.6, 3.2] } } },
          { t: D[1], orbit: { target: [0, 1.05, 1.9], yaw: 200, pitch: 13, fit: [Math.min(6.6, 2.8 + party.length * 0.9), 2.6] }, fov: 36, ease: 'inOutSine', p: { orbit: { target: [0.6, 1.1, 1.9], yaw: 204, pitch: 12, fit: [2.8, 3.4] } } },
        ],
        actors: [{ actor: 'boss', visible: false }, ...heroIds.map((id) => ({ actor: id, visible: true }))],
        cues: [
          { at: 0, music: 'music_base' },
          { at: 0.9, line: 'Quarenta anos eu esperei por este silêncio.', who: 'anselmo', dur: 3.0 },
          ...party.map((m, i): Cue => ({ at: 2.6 + i * 0.18, play: { actor: m.id, anim: 'cheer', speed: 0.9 } })),
          { at: 4.6, line: 'Obrigado, peregrinos.', who: 'anselmo', dur: 2.6 },
        ],
      },
      {
        dur: D[2],
        ...env,
        sway: 0.025,
        actors: [{ actor: 'boss', visible: true }],
        cam: [
          { t: 0, pos: [0.8, 2.3, 8.2], look: v3(bellC.clone().add(new THREE.Vector3(0, -1.4, 0))), fov: 42, pk: 0.7 },
          { t: D[2], pos: [0, 6.4, Math.min(11, roomBounds(c).maxZ + 2.5)], look: v3(bellC.clone().add(new THREE.Vector3(0, -1.8, 3))), fov: 44, pk: 0.75, ease: 'inOut' },
        ],
        cues: [
          { at: 0.5, line: 'Agora eu posso descansar.', who: 'anselmo', dur: 2.8 },
          { at: 5.4, sfx: 'bless', vol: 0.8, flash: 0.35, color: 0xffe9b0 },
          { at: 5.8, line: 'Mas o eco… foi mais longe que o sino.', who: 'anselmo', dur: 3.2 },
          { at: D[2] - 1.2, fade: 1, dur: 1.1 },
        ],
      },
    ];
  },
});

export {};
