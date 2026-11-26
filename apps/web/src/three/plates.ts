/**
 * Over-the-figure plates for the combat board: small, iconic, no sentences.
 *
 *   enemy:  [intent bubble: action icon · damage · target hero face(s)]
 *           [HP pips/bar with the number] [armour shield] [condition icons]
 *   hero:   [slim HP bar] [condition icons]
 *
 * The HP shown is the *displayed* HP (the board lags it behind the rules until the blow lands): a drop leaves a
 * white "ghost" chunk that shrinks after a beat; a heal grows the bar. Plates are laid out every frame by
 * `layoutPlates` so they never sit on top of another figure or another plate.
 */
import { BANDS, intentFor, type Band, type CombatState, type Figure } from '@mosteiro/core';
import type { Threat } from '../ui/combat/threats';
import './plates.css';

/** Class colours (match --c-* in ui/styles.css). */
export const HERO_COLOR: Record<string, string> = {
  guerreiro: '#e0574a',
  paladino: '#e2bc5c',
  arcanista: '#9a8cff',
  clerigo: '#eae3cf',
  arqueiro: '#7cc05e',
  ladino: '#3fc0b4',
};

/** Intent kind → icon (ids of the shared SVG sprite). */
const ACT_ICON: Record<string, string> = {
  melee: 'act_attack_melee',
  ranged: 'act_attack_distancia',
  area: 'act_attack_global',
  control: 'cond_imobilizado',
  move: 'act_move',
  buff: 'act_buff',
  defend: 'act_defend',
  heal: 'act_heal',
  summon: 'act_summon',
};

/** Condition flags shown as tiny icons (no words). */
export function conditionIcons(f: Figure): string[] {
  const C = f.conditions;
  const out: string[] = [];
  if (C.guardado) out.push('guardado');
  if (C.exposto) out.push('exposto');
  if (C.quebrado) out.push('quebrado');
  if (C.imobilizado) out.push('imobilizado');
  if (C.atordoado) out.push('atordoado');
  if (C.queimando) out.push('queimando');
  if (C.sangramento) out.push('sangramento');
  if (C.veneno) out.push('veneno');
  if (C.julgadoPor) out.push('julgado');
  if (C.furtivo) out.push('furtivo');
  if (C.brechas) out.push('brecha');
  return out.slice(0, 5);
}

export interface IntentView {
  kind: string;
  name: string;
  dano?: number;
  /** hero targets (class id + damage), in order */
  to: { cls: string; dano: number }[];
  /** this enemy is acting right now */
  now: boolean;
}

export interface PlateData {
  side: 'H' | 'E';
  maxHp: number;
  armor: number;
  conds: string[];
  intent: IntentView | null;
}

/** The enemy's intent for the plate (null once it has acted this Cycle, or when it has none). */
export function intentView(S: CombatState, f: Figure, threats: Threat[]): IntentView | null {
  if (f.side !== 'E' || f.status !== 'active' || S.result || S.phase === 'deploy' || S.phase === 'ended') return null;
  const it = intentFor(S, f.typeId);
  if (!it) return null;
  const eb: Band = it.tempo === 'rapido' ? 'ER' : it.tempo === 'tatico' ? 'ET' : 'EP';
  const bi = BANDS.indexOf(S.band);
  const ei = BANDS.indexOf(eb);
  const now = S.phase === 'enemyBand' && S.activeId === f.id;
  if (S.phase !== 'tempo' && !now) {
    // already acted this Cycle: nothing more to warn about
    if (bi > ei) return null;
    if (bi === ei && S.phase === 'enemyBand' && !S.enemyActQueue.includes(f.id)) return null;
  }
  const th = threats.filter((t) => t.from === f.id);
  const to: { cls: string; dano: number }[] = [];
  for (const t of th)
    for (const id of t.to) {
      const h = S.figures.find((x) => x.id === id);
      if (h && !to.some((x) => x.cls === h.typeId && x.dano === t.dano[id])) to.push({ cls: h.typeId, dano: t.dano[id] ?? 0 });
    }
  const attack = it.kind === 'melee' || it.kind === 'ranged' || it.kind === 'area' || it.kind === 'control';
  const dano = to.length ? Math.max(...to.map((x) => x.dano)) : attack ? it.dano : undefined;
  return { kind: it.kind, name: it.name, dano: attack ? dano : undefined, to, now };
}

const svg = (id: string, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

/** One plate (DOM lives in the diorama's labels layer). */
export class FigPlate {
  el: HTMLDivElement;
  private intentEl: HTMLDivElement;
  private numEl: HTMLElement;
  private barEl: HTMLDivElement;
  private fillEl: HTMLElement;
  private ghostEl: HTMLElement;
  private armEl: HTMLElement;
  private condEl: HTMLDivElement;
  private sig = '';
  hp = -1;
  maxHp = 1;
  /** layout state (px): measured size, current and target top-left, chosen slot */
  w = 0;
  h = 0;
  dirty = true;
  x = NaN;
  y = NaN;
  slot = 0;
  visible = true;

  constructor(
    parent: HTMLElement,
    public side: 'H' | 'E',
  ) {
    const el = document.createElement('div');
    el.className = `fplate ${side === 'E' ? 'fp-e' : 'fp-h'}`;
    el.innerHTML =
      `<div class="fp-intent"></div>` +
      `<div class="fp-main"><b class="fp-num"></b><div class="fp-bar"><i class="fp-ghost"></i><i class="fp-fill"></i></div><span class="fp-arm"></span></div>` +
      `<div class="fp-conds"></div>`;
    parent.appendChild(el);
    this.el = el;
    this.intentEl = el.querySelector('.fp-intent')!;
    this.numEl = el.querySelector('.fp-num')!;
    this.barEl = el.querySelector('.fp-bar')!;
    this.fillEl = el.querySelector('.fp-fill')!;
    this.ghostEl = el.querySelector('.fp-ghost')!;
    this.armEl = el.querySelector('.fp-arm')!;
    this.condEl = el.querySelector('.fp-conds')!;
  }

  private layerOn = true;
  /** the whole plate layer is hidden outside combat (without losing each plate's own visibility) */
  setLayerOn(on: boolean) {
    if (on === this.layerOn) return;
    this.layerOn = on;
    this.el.style.visibility = on ? '' : 'hidden';
  }

  show(v: boolean) {
    if (v) this.el.classList.remove('fp-gone');
    if (v === this.visible) return;
    this.visible = v;
    this.el.style.display = v ? '' : 'none';
    if (v) this.dirty = true;
  }
  /** death: the plate stays where it is a moment (the last drain plays out), then fades away */
  fade() {
    if (!this.visible) return;
    this.visible = false;
    this.el.classList.add('fp-gone');
  }

  /** Everything but the HP (conditions, armour, intent). */
  setData(d: PlateData) {
    const it = d.intent;
    const sig = JSON.stringify([d.maxHp, d.armor, d.conds, it]);
    if (sig === this.sig) return;
    this.sig = sig;
    this.dirty = true;
    this.maxHp = Math.max(1, d.maxHp);
    // segmented pips for small pools, a plain bar for big ones
    const pips = d.maxHp <= 12;
    this.barEl.classList.toggle('pips', pips);
    this.barEl.style.setProperty('--n', String(this.maxHp));
    this.armEl.innerHTML = d.armor > 0 ? `${svg('attr_guarda')}<b>${d.armor}</b>` : '';
    this.armEl.style.display = d.armor > 0 ? '' : 'none';
    this.condEl.innerHTML = d.conds.map((c) => svg(`cond_${c}`, `c-${c}`)).join('');
    this.condEl.style.display = d.conds.length ? '' : 'none';
    if (!it) {
      this.intentEl.style.display = 'none';
      this.intentEl.innerHTML = '';
    } else {
      this.intentEl.style.display = '';
      this.intentEl.className = `fp-intent k-${it.kind} ${it.now ? 'now' : ''}`;
      this.intentEl.title = it.name;
      const faces = it.to
        .slice(0, 3)
        .map((t) => `<i class="fp-face" style="--hc:${HERO_COLOR[t.cls] ?? '#ddd'}">${svg(`class_${t.cls}`)}</i>`)
        .join('');
      const attack = it.dano !== undefined;
      this.intentEl.innerHTML =
        svg(ACT_ICON[it.kind] ?? 'act_attack_melee', 'fp-act') +
        (attack ? `<b class="fp-dmg">${it.dano}</b>` : '') +
        (attack && faces ? `<span class="fp-arrow" aria-hidden="true"></span><span class="fp-to">${faces}</span>` : '');
    }
    if (this.hp >= 0) this.paint(this.hp, false);
  }

  /** Set the displayed HP; `animate` plays the drain (ghost chunk) or the heal swell. */
  setHp(hp: number, animate = true) {
    const prev = this.hp;
    this.hp = hp;
    if (prev < 0 || !animate || prev === hp) {
      this.paint(hp, false);
      return;
    }
    this.paint(hp, true, prev);
  }

  private paint(hp: number, animate: boolean, prev = hp) {
    const pct = (x: number) => `${Math.max(0, Math.min(1, x / this.maxHp)) * 100}%`;
    this.numEl.textContent = String(Math.max(0, hp));
    this.barEl.classList.toggle('low', hp / this.maxHp <= 0.34);
    if (!animate) {
      this.ghostEl.style.transition = 'none';
      this.fillEl.style.transition = 'none';
      this.fillEl.style.width = pct(hp);
      this.ghostEl.style.width = pct(hp);
      return;
    }
    if (hp < prev) {
      // the blow lands: the bar drops at once, a white chunk lingers then drains away
      this.fillEl.style.transition = 'none';
      this.fillEl.style.width = pct(hp);
      this.ghostEl.style.transition = 'none';
      this.ghostEl.style.width = pct(prev);
      void this.ghostEl.offsetWidth;
      this.ghostEl.style.transition = '';
      this.ghostEl.style.width = pct(hp);
      this.el.classList.remove('fp-hit', 'fp-heal');
      void this.el.offsetWidth;
      this.el.classList.add('fp-hit');
    } else {
      this.ghostEl.style.transition = 'none';
      this.ghostEl.style.width = pct(hp);
      this.fillEl.style.transition = '';
      this.fillEl.style.width = pct(hp);
      this.el.classList.remove('fp-hit', 'fp-heal');
      void this.el.offsetWidth;
      this.el.classList.add('fp-heal');
    }
    this.numEl.classList.remove('pop');
    void this.numEl.offsetWidth;
    this.numEl.classList.add('pop');
  }

  remove() {
    this.el.remove();
  }
}

export interface PlateBox {
  plate: FigPlate;
  /** anchor: just above the head (px) */
  ax: number;
  ay: number;
  /** own figure's screen box */
  own: Box;
  /** depth (larger = farther from the camera) */
  depth: number;
}
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
/** preference for each candidate slot: above the head, left, right, higher up */
const SLOT_COST = [0, 70, 70, 110];
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/**
 * Place every plate: right above its figure's head when that is free; otherwise beside the head (left/right) or
 * a little higher, whichever covers the least of the other figures and the plates already placed. Farther
 * figures are placed first; a plate keeps its slot unless another is clearly better (no flicker).
 */
export function layoutPlates(items: PlateBox[], figures: Box[], W: number, H: number, ease: number) {
  items.sort((a, b) => b.depth - a.depth);
  const placed: Box[] = [];
  for (const it of items) {
    const p = it.plate;
    if (p.dirty || !p.w) {
      p.w = p.el.offsetWidth;
      p.h = p.el.offsetHeight;
      p.dirty = false;
    }
    const w = p.w;
    const h = p.h;
    const side = Math.max(w * 0.5 + (it.own.x1 - it.own.x0) * 0.32, w * 0.62);
    const cands = [
      { x: it.ax - w / 2, y: it.ay - h },
      { x: it.ax - w / 2 - side, y: it.ay - h * 0.55 },
      { x: it.ax - w / 2 + side, y: it.ay - h * 0.55 },
      { x: it.ax - w / 2, y: it.ay - h * 1.75 },
    ];
    let best = 0;
    let bestCost = Infinity;
    const costs = cands.map((c, i) => {
      const x = Math.max(2, Math.min(W - w - 2, c.x));
      const y = Math.max(2, Math.min(H - h - 2, c.y));
      const b = { x0: x, y0: y, x1: x + w, y1: y + h };
      let cost = SLOT_COST[i] + Math.abs(x - c.x) * 3;
      for (const f of figures) if (f !== it.own) cost += overlap(b, f) * 1.0;
      for (const q of placed) cost += overlap(b, q) * 2.5;
      return { cost, x, y };
    });
    costs.forEach((c, i) => {
      if (c.cost < bestCost) {
        bestCost = c.cost;
        best = i;
      }
    });
    // hysteresis: keep the current slot unless the new one is clearly better
    if (best !== p.slot && costs[p.slot] && costs[p.slot].cost <= bestCost + 24) best = p.slot;
    p.slot = best;
    const tx = costs[best].x;
    const ty = costs[best].y;
    if (Number.isNaN(p.x) || Math.abs(tx - p.x) > W * 0.4 || Math.abs(ty - p.y) > H * 0.4) {
      p.x = tx;
      p.y = ty;
    } else {
      p.x += (tx - p.x) * ease;
      p.y += (ty - p.y) * ease;
    }
    placed.push({ x0: p.x, y0: p.y, x1: p.x + w, y1: p.y + h });
    p.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
  }
}
