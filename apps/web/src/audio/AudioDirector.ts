/**
 * Audio director (Web Audio). Music beds crossfade by context, ambience per location, SFX one-shots with variants.
 * Loops use loopStart/loopEnd from the manifest (files carry wrapped padding for seamless loops).
 * Nothing plays before the first user gesture (browser autoplay policy).
 */
import { getSettings, subscribeSettings } from '../state/settings';

interface Asset {
  file: string;
  category: 'music' | 'sting' | 'ambience' | 'ui' | 'sfx';
  duration: number;
  loop: boolean;
  loopStart?: number;
  loopEnd?: number;
  gainDb?: number;
  description?: string;
}

const BASE = import.meta.env.BASE_URL + 'assets/audio/';

class AudioDirector {
  ctx: AudioContext | null = null;
  private manifest: Record<string, Asset> = {};
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private music: { id: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private amb: { id: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wantMusic: string | null = null;
  private wantAmb: string | null = null;
  private lastPlay = new Map<string, number>();
  ready = false;
  /** Caption callback for accessibility subtitles. */
  onCaption: ((text: string) => void) | null = null;

  async init() {
    try {
      const r = await fetch(BASE + 'manifest.json');
      this.manifest = (await r.json()).assets;
    } catch {
      this.manifest = {};
    }
    subscribeSettings(() => this.applyVolumes());
    const unlock = () => {
      this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  private unlock() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.ambBus = this.ctx.createGain();
    // gentle bus compressor keeps loud bell hits from clipping
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 3;
    this.sfxBus.connect(comp).connect(this.master);
    this.musicBus.connect(this.master);
    this.ambBus.connect(this.master);
    this.ready = true;
    this.applyVolumes();
    if (this.wantMusic) this.setMusic(this.wantMusic, true);
    if (this.wantAmb) this.setAmbience(this.wantAmb, true);
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const s = getSettings();
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.music, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(s.ambience, t, 0.1);
  }

  private load(id: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(id);
    if (!p) {
      const a = this.manifest[id];
      if (!a || !this.ctx) return Promise.resolve(null);
      p = fetch(BASE + a.file)
        .then((r) => r.arrayBuffer())
        .then((b) => this.ctx!.decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(id, p);
    }
    return p;
  }

  /** Preload a set of short SFX to avoid first-hit latency. */
  preload(ids: string[]) {
    if (!this.ctx) return;
    ids.forEach((i) => void this.load(i));
  }

  play(id: string, opts: { volume?: number; delay?: number; rate?: number } = {}) {
    if (!this.ctx) return;
    // variant pick: id_2, id_3 exist for some
    const variants = [id, `${id}_2`, `${id}_3`].filter((x) => this.manifest[x]);
    const pick = variants.length ? variants[Math.floor(Math.random() * variants.length)] : id;
    const a = this.manifest[pick];
    if (!a) return;
    const now = this.ctx.currentTime;
    // anti-spam: same sound within 40 ms is skipped
    if ((this.lastPlay.get(pick) ?? -1) > now - 0.04) return;
    this.lastPlay.set(pick, now);
    void this.load(pick).then((buf) => {
      if (!buf || !this.ctx) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = (opts.rate ?? 1) * (a.category === 'sfx' ? 0.96 + Math.random() * 0.08 : 1);
      const g = this.ctx.createGain();
      g.gain.value = dbToGain(a.gainDb ?? 0) * (opts.volume ?? 1);
      src.connect(g).connect(a.category === 'music' || a.category === 'sting' ? this.musicBus : this.sfxBus);
      src.start(this.ctx.currentTime + (opts.delay ?? 0));
    });
    const cap = CAPTIONS[id];
    if (cap && getSettings().subtitles) this.onCaption?.(cap);
  }

  setMusic(id: string | null, force = false) {
    if (!force && this.wantMusic === id) return;
    this.wantMusic = id;
    if (!this.ctx) return;
    this.crossfade('music', id, 2.4);
  }
  setAmbience(id: string | null, force = false) {
    if (!force && this.wantAmb === id) return;
    this.wantAmb = id;
    if (!this.ctx) return;
    this.crossfade('amb', id, 3);
  }

  private crossfade(kind: 'music' | 'amb', id: string | null, fade: number) {
    const ctx = this.ctx!;
    const cur = kind === 'music' ? this.music : this.amb;
    if (cur && cur.id === id) return;
    if (cur) {
      const t = ctx.currentTime;
      cur.gain.gain.cancelScheduledValues(t);
      cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
      cur.gain.gain.linearRampToValueAtTime(0, t + fade);
      const old = cur.src;
      setTimeout(() => old.stop(), fade * 1000 + 100);
    }
    if (kind === 'music') this.music = null;
    else this.amb = null;
    if (!id) return;
    const a = this.manifest[id];
    if (!a) return;
    void this.load(id).then((buf) => {
      if (!buf || !this.ctx) return;
      if ((kind === 'music' ? this.wantMusic : this.wantAmb) !== id) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = a.loopStart ?? 0;
      src.loopEnd = a.loopEnd ?? buf.duration;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(kind === 'music' ? this.musicBus : this.ambBus);
      src.start(0, a.loopStart ?? 0);
      g.gain.linearRampToValueAtTime(dbToGain(a.gainDb ?? 0), this.ctx.currentTime + fade);
      const slot = { id, src, gain: g };
      if (kind === 'music') this.music = slot;
      else this.amb = slot;
    });
  }

  /** Duck the music briefly under stingers/boss moments. */
  duck(amount = 0.35, dur = 2) {
    if (!this.ctx || !this.music) return;
    const g = this.music.gain.gain;
    const t = this.ctx.currentTime;
    const v = g.value;
    g.cancelScheduledValues(t);
    g.setValueAtTime(v, t);
    g.linearRampToValueAtTime(v * amount, t + 0.15);
    g.linearRampToValueAtTime(v, t + dur);
  }
}

function dbToGain(db: number) {
  return Math.pow(10, db / 20);
}

/** Accessibility captions (pt-BR) for the sounds that carry game information. */
const CAPTIONS: Record<string, string> = {
  sting_victory: '[coro triunfal e sino maior]',
  sting_defeat: '[sino rachado, o coro silencia]',
  sting_secret: '[sinos agudos — algo foi revelado]',
  sting_boss_intro: '[badalada imensa e tambores]',
  sting_reward: '[sinos e moedas]',
  bell_toll_long: '[o sino dobra longamente]',
  bell_toll_short: '[uma badalada]',
  bell_great_cracked: '[o grande sino rachado ressoa]',
  chain_rattle: '[correntes chacoalham]',
  door_stone: '[porta de pedra se arrasta]',
  body_fall: '[um corpo tomba]',
  rise_up: '[alguém se levanta]',
  heal: '[luz de cura]',
};

export const audio = new AudioDirector();
