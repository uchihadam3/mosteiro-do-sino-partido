import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { canWield, reg, type HeroRecord, type ItemDef } from '@mosteiro/core';
import { Icon } from './Icon';
import { getSettings } from '../state/settings';
import './gamify.css';

/* ==========================================================================
   Game kit: small, reusable "gamified" pieces for the menu screens —
   framed item art, chunky stat badges, coin price tags, pagers (no scroll),
   and a couple of juice helpers.
   ========================================================================== */

export const reduced = () => (typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduced') || !!getSettings().reducedMotion;

/** The one number that matters for an item, with the icon it is shown with. */
export function keyStat(d: ItemDef): { v: string; l: string; icon: string; n?: number } | null {
  if (d.slot === 'weapon' && d.dano !== undefined)
    return {
      v: String(d.dano),
      l: 'Dano',
      icon: 'act_attack_melee',
      n: d.dano,
    };
  if (d.slot === 'armor' && d.armor !== undefined) return { v: String(d.armor), l: 'Armadura', icon: 'armor', n: d.armor };
  if (d.maxHpBonus)
    return {
      v: `${d.maxHpBonus > 0 ? '+' : ''}${d.maxHpBonus}`,
      l: 'Vida',
      icon: 'hp',
      n: d.maxHpBonus,
    };
  return null;
}
/** Comparable number (weapon damage, armour value); accessories and consumables compare by nothing. */
export function statNum(d: ItemDef | null | undefined): number | undefined {
  if (!d) return undefined;
  if (d.slot === 'weapon') return d.dano;
  if (d.slot === 'armor') return d.armor;
  return undefined;
}
/** First sentence of the rules text, for one-line card blurbs (full text one tap away). */
export function shortText(d: ItemDef): string {
  const t = d.text.trim();
  const cut = t.search(/[.;](\s|$)/);
  return cut > 0 && cut < t.length - 1 ? t.slice(0, cut + 1) : t;
}

/** Framed item art: rarity-coloured bevel, glow and shimmer. */
export function ItemArt({ d, size = 'md', dim, className }: { d: ItemDef | null; size?: 'sm' | 'md' | 'lg' | 'xl'; dim?: boolean; className?: string }) {
  return (
    <span className={`gk-art gk-${size} ${d ? `rc-${d.rarity}` : 'gk-empty'} ${dim ? 'dim' : ''} ${className ?? ''}`} aria-hidden>
      <span className="gk-art-in">{d && <Icon id={d.icon} />}</span>
    </span>
  );
}

/** Chunky number badge: icon + big value (+ optional tiny label). */
export function StatBadge({ icon, v, l, tone, delta }: { icon: string; v: React.ReactNode; l?: string; tone?: 'gold' | 'red' | 'blue' | 'green' | 'plain'; delta?: number }) {
  return (
    <span className={`gk-stat t-${tone ?? 'gold'}`}>
      <Icon id={icon} />
      <b>{v}</b>
      {l && <small>{l}</small>}
      {delta ? <Delta n={delta} /> : null}
    </span>
  );
}
export function Delta({ n }: { n: number }) {
  if (!n) return null;
  return <em className={`gk-delta ${n > 0 ? 'up' : 'down'}`}>{n > 0 ? `▲${n}` : `▼${-n}`}</em>;
}

/** Coin price tag (red + struck through when you cannot pay). */
export function Price({ n, poor, big }: { n: number; poor?: boolean; big?: boolean }) {
  return (
    <span className={`gk-price ${poor ? 'poor' : ''} ${big ? 'big' : ''}`} aria-label={`${n} ouro${poor ? ' (sem ouro suficiente)' : ''}`}>
      <span className="gk-coin" aria-hidden>
        <Icon id="gold" />
      </span>
      <b>{n}</b>
    </span>
  );
}

/** Measures a box and says how many cells of a given size fit (rows × columns), so lists page instead of scroll. */
export function useFit(cellW: number, cellH: number, gap = 8, min = 1, gapY = gap) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ cols: 1, rows: 1 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (w < 10) return;
      const cols = Math.max(1, Math.floor((w + gap) / (cellW + gap)));
      const rows = Math.max(1, Math.floor((h + gapY) / (cellH + gapY)));
      setFit((f) => (f.cols === cols && f.rows === rows ? f : { cols, rows }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cellW, cellH, gap, gapY]);
  return {
    ref,
    cols: fit.cols,
    rows: fit.rows,
    per: Math.max(min, fit.cols * fit.rows),
  };
}

/** Live media query. */
export function useMedia(q: string) {
  const [m, setM] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia(q);
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}
export const WIDE = '(min-width: 900px) and (min-height: 560px)';

/** Page state for a list shown `per` at a time. */
export function usePages<T>(list: T[], per: number, resetKey?: unknown) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(list.length / Math.max(1, per)));
  useEffect(() => setPage(0), [resetKey]);
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);
  const p = Math.min(page, pages - 1);
  return { page: p, pages, setPage, items: list.slice(p * per, p * per + per) };
}

/** Arrows + dots for a paged grid. Renders nothing when everything fits. */
export function Pager({ page, pages, setPage, label }: { page: number; pages: number; setPage(p: number): void; label?: string }) {
  if (pages <= 1) return null;
  return (
    <div className="gk-pager" role="group" aria-label={label ?? 'Páginas'}>
      <button className="gk-arrow" disabled={page <= 0} onClick={() => setPage(page - 1)} aria-label="Página anterior">
        <span className="gk-chev" />
      </button>
      <span className="gk-dots">
        {Array.from({ length: pages }).map((_, i) => (
          <button key={i} className={i === page ? 'on' : ''} onClick={() => setPage(i)} aria-label={`Página ${i + 1}`} aria-current={i === page} />
        ))}
      </span>
      <button className="gk-arrow nx" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Próxima página">
        <span className="gk-chev" />
      </button>
    </div>
  );
}

/** Adds a short-lived class when a value changes (e.g. the gold counter bumps after a purchase). */
export function useBump<T>(v: T, ms = 600) {
  const [on, setOn] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return on;
}

/** Floating "−8" / "+3" numbers above a counter whenever it changes. */
export function FloatDiff({ v }: { v: number }) {
  const prev = useRef(v);
  const [pops, setPops] = useState<{ k: number; d: number }[]>([]);
  useEffect(() => {
    const d = v - prev.current;
    prev.current = v;
    if (!d) return;
    const k = Date.now() + Math.random();
    setPops((p) => [...p, { k, d }]);
    const t = setTimeout(() => setPops((p) => p.filter((x) => x.k !== k)), 1100);
    return () => clearTimeout(t);
  }, [v]);
  return (
    <>
      {pops.map((p) => (
        <span key={p.k} className={`gk-float ${p.d > 0 ? 'up' : 'down'}`} aria-hidden>
          {p.d > 0 ? `+${p.d}` : p.d}
        </span>
      ))}
    </>
  );
}

/** Rules-detail block (full text) for an item: used behind the ⓘ tap. */
export function ItemFacts({ d, hero }: { d: ItemDef; hero?: HeroRecord }) {
  const k = keyStat(d);
  const ideal = d.bow ? (d.bow.ideal === 'proxima' ? 'Próxima' : d.bow.ideal === 'media' ? 'Média' : 'Longa') : null;
  return (
    <div className="gk-facts">
      <div className="gk-facts-badges">
        {k && <StatBadge icon={k.icon} v={k.v} l={k.l} tone={k.icon === 'hp' ? 'red' : 'gold'} />}
        {d.slot === 'armor' && d.maxHpBonus ? <StatBadge icon="hp" v={`${d.maxHpBonus > 0 ? '+' : ''}${d.maxHpBonus}`} l="Vida" tone="red" /> : null}
        {d.dice && (
          <span className="gk-tag">
            <Icon id="dice_d8" /> {d.dice.map((x) => ATTR_SHORT[x] ?? x).join(' + ')}
          </span>
        )}
        {d.cat && <span className="gk-tag">{d.cat === 'cac' ? 'Corpo a corpo' : d.cat === 'alcance' ? 'Alcance' : d.cat === 'distancia' ? 'Distância' : 'Global'}</span>}
        {ideal && <span className="gk-tag">Ideal {ideal}</span>}
      </div>
      <p className="gk-facts-text">{d.text}</p>
      {hero && d.slot === 'weapon' && !canWield(hero, d.id) && (
        <div className="gk-warn">
          <Icon id="map_lock" /> {reg().classes[hero.classId].name} não usa esta arma.
        </div>
      )}
    </div>
  );
}
const ATTR_SHORT: Record<string, string> = {
  poder: 'Poder',
  guarda: 'Guarda',
  agilidade: 'Agilidade',
  precisao: 'Precisão',
  arcano: 'Arcano',
  determinacao: 'Determinação',
  espirito: 'Espírito',
  sombra: 'Sombra',
};

/**
 * Shrinks the font of a text box (that has a bounded height) until it fits — long story text never scrolls.
 * Falls back to scrolling only below `min` px.
 */
export function useShrinkToFit<T extends HTMLElement>(max: number, min: number, deps: unknown[]) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let size = max;
      el.style.fontSize = `${size}px`;
      while (size > min && el.scrollHeight > el.clientHeight + 1) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
