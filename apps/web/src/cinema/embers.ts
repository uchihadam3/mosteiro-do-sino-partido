/** A light 2D ember field (canvas, additive) for the splash: drifting sparks plus bursts on cue. */
interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  hue: number;
  phase: number;
}

export class EmberField {
  private ctx: CanvasRenderingContext2D | null;
  private embers: Ember[] = [];
  private raf = 0;
  private last = 0;
  private dpr = 1;
  private sprite: HTMLCanvasElement;
  private acc = 0;
  /** Ambient sparks per second. */
  rate = 14;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
    this.sprite = document.createElement('canvas');
    this.sprite.width = this.sprite.height = 64;
    const g = this.sprite.getContext('2d');
    if (g) {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(255,245,215,1)');
      r.addColorStop(0.18, 'rgba(255,190,90,0.95)');
      r.addColorStop(0.45, 'rgba(255,110,30,0.35)');
      r.addColorStop(1, 'rgba(255,80,20,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
    }
  }

  private resize = () => {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.canvas.clientWidth * this.dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * this.dpr);
  };

  start() {
    this.resize();
    window.addEventListener('resize', this.resize);
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
  }

  /** Burst of sparks from a point given in 0..1 screen coordinates. */
  burst(fx: number, fy: number, n: number, spread = 1) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4 * spread;
      const sp = (60 + Math.random() * 220) * this.dpr;
      this.spawn(fx * w + (Math.random() - 0.5) * 18 * this.dpr, fy * h + (Math.random() - 0.5) * 18 * this.dpr, Math.cos(a) * sp, Math.sin(a) * sp, 0.8 + Math.random() * 1.6, (1.2 + Math.random() * 2.4) * this.dpr);
    }
  }

  private spawn(x: number, y: number, vx: number, vy: number, life: number, size: number) {
    if (this.embers.length > 260) this.embers.shift();
    this.embers.push({ x, y, vx, vy, life, max: life, size, hue: Math.random(), phase: Math.random() * 10 });
  }

  private step(dt: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.acc += dt * this.rate;
    while (this.acc > 1) {
      this.acc--;
      this.spawn(Math.random() * w, h * (0.75 + Math.random() * 0.3), (Math.random() - 0.3) * 20 * this.dpr, -(30 + Math.random() * 60) * this.dpr, 2.5 + Math.random() * 3.5, (0.8 + Math.random() * 1.8) * this.dpr);
    }
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const t = performance.now() / 1000;
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.embers.splice(i, 1);
        continue;
      }
      // drag + gentle updraft + sway
      e.vx *= 1 - dt * 0.9;
      e.vy = e.vy * (1 - dt * 0.9) - 26 * this.dpr * dt;
      e.x += (e.vx + Math.sin(t * 1.7 + e.phase) * 14 * this.dpr) * dt;
      e.y += e.vy * dt;
      const k = e.life / e.max;
      const flick = 0.75 + 0.25 * Math.sin(t * 13 + e.phase * 7);
      const a = Math.min(1, k * 2.2) * Math.min(1, (1 - k) * 8) * flick;
      const s = e.size * (3.2 + 2 * (1 - e.hue)) * (0.6 + 0.4 * k);
      ctx.globalAlpha = a;
      ctx.drawImage(this.sprite, e.x - s, e.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
