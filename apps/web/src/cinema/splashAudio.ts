/**
 * Splash sounds before the first user gesture. The AudioDirector only starts after a tap (autoplay policy), but an
 * installed PWA or a site with media engagement may play sound right away: try a private AudioContext, stay silent
 * if the browser keeps it suspended, never throw. Respects the mute / volume settings.
 */
import { audio } from '../audio/AudioDirector';
import { getSettings } from '../state/settings';

const BASE = import.meta.env.BASE_URL + 'assets/audio/';

interface Asset {
  file: string;
  category: string;
  gainDb?: number;
}

export class SplashAudio {
  private ctx: AudioContext | null = null;
  private bufs = new Map<string, Promise<AudioBuffer | null>>();
  private manifest: Promise<Record<string, Asset> | null> | null = null;
  private ok: Promise<boolean>;

  constructor(private ids: string[]) {
    this.ok = this.init();
  }

  private async init(): Promise<boolean> {
    try {
      if (getSettings().muted) return false;
      const nav = navigator as Navigator & { getAutoplayPolicy?(type: string): string };
      if (nav.getAutoplayPolicy && nav.getAutoplayPolicy('audiocontext') === 'disallowed') return false;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return false;
      const ctx = new Ctx();
      if (ctx.state !== 'running') await Promise.race([ctx.resume().catch(() => undefined), new Promise((r) => setTimeout(r, 160))]);
      if (ctx.state !== 'running') {
        void ctx.close().catch(() => undefined);
        return false;
      }
      this.ctx = ctx;
      this.manifest = fetch(BASE + 'manifest.json')
        .then((r) => r.json())
        .then((j) => j.assets as Record<string, Asset>)
        .catch(() => null);
      for (const id of this.ids) this.load(id);
      return true;
    } catch {
      return false;
    }
  }

  private load(id: string) {
    let p = this.bufs.get(id);
    if (!p) {
      p = (async () => {
        const m = await this.manifest;
        const a = m?.[id];
        if (!a || !this.ctx) return null;
        const data = await (await fetch(BASE + a.file)).arrayBuffer();
        return await this.ctx.decodeAudioData(data);
      })().catch(() => null);
      this.bufs.set(id, p);
    }
    return p;
  }

  /** Play now: through the AudioDirector when the page is already unlocked, else through the private context. */
  async play(id: string, volume = 1) {
    if (audio.ready) {
      audio.play(id, { volume });
      return;
    }
    if (!(await this.ok) || !this.ctx) return;
    const buf = await this.load(id);
    const m = await this.manifest;
    if (!buf || !this.ctx || !m) return;
    const a = m[id];
    const s = getSettings();
    if (s.muted) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    const bus = a.category === 'music' || a.category === 'sting' ? s.music : s.sfx;
    g.gain.value = Math.pow(10, (a.gainDb ?? 0) / 20) * volume * s.master * bus;
    src.connect(g).connect(this.ctx.destination);
    src.start();
  }

  /** Let the tails ring out, then release the context. */
  dispose(after = 9000) {
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) setTimeout(() => void ctx.close().catch(() => undefined), after);
  }
}
