/**
 * Interactive tutorial: a spotlight on the one thing to do, a pointing hand, one short line from the mentor,
 * and the game waits for the player to actually do it. One-shot tips cover mechanics the first time they appear.
 * Progress is per device (localStorage). Off in ?debug sessions unless ?tutorial=1.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { actionAvailability, actionTargets, ctxOf, type Figure } from '@mosteiro/core';
import { useSession } from '../app/hooks';
import { useApp } from '../app/App';
import { audio } from '../audio/AudioDirector';
import { FIRST_BATTLE, TIPS, type Chapter, type Step, type Target, type Tip, type TutCtx } from './steps';
import { Mentor } from './mentor';
import './tutorial.css';

const KEY = 'mosteiro.tutorial.v1';
interface Progress {
  off?: boolean;
  chapters: string[];
  tips: string[];
}
function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { chapters: [], tips: [], ...JSON.parse(raw) };
  } catch {
    /* private mode */
  }
  return { chapters: [], tips: [] };
}
function save(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
/** Settings/Pause helpers. */
export function tutorialEnabled() {
  return !load().off;
}
export function setTutorialEnabled(on: boolean) {
  save({ ...load(), off: !on });
  window.dispatchEvent(new Event('mosteiro-tutorial'));
}
export function resetTutorial() {
  save({ chapters: [], tips: [], off: false });
  window.dispatchEvent(new Event('mosteiro-tutorial'));
}

const CHAPTERS: Chapter[] = [FIRST_BATTLE];

function debugBlocked() {
  const q = new URLSearchParams(location.search);
  return !!q.get('debug') && q.get('tutorial') !== '1';
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  round: boolean;
}

export function TutorialLayer() {
  const s = useSession();
  const { diorama } = useApp();
  const [prog, setProg] = useState<Progress>(load);
  const [chapter, setChapter] = useState<{ id: string; i: number } | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [tick, setTick] = useState(0);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const on = () => setProg(load());
    window.addEventListener('mosteiro-tutorial', on);
    return () => window.removeEventListener('mosteiro-tutorial', on);
  }, []);

  const st = s.state;
  const S = st?.phase === 'combat' ? (st.combat ?? null) : null;
  const ctx: TutCtx = useMemo(
    () => ({
      st,
      S,
      has: (sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      },
      attackableEnemy: () => {
        if (!S || S.phase !== 'heroActing' || !S.activeId) return null;
        const hero = S.figures.find((f) => f.id === S.activeId);
        if (!hero || hero.side !== 'H' || !s.controls(hero.id)) return null;
        const c = ctxOf(S);
        const attacks = actionAvailability(c, hero).filter((a) => !a.reason && (a.def.kind === 'attack' || a.def.kind === 'spell') && a.def.targeting.type === 'enemy');
        for (const a of attacks) {
          try {
            const id = actionTargets(c, hero, a.def).figures.find((fid) => S.figures.some((f: Figure) => f.id === fid && f.side === 'E'));
            if (id) return id;
          } catch {
            /* ignore */
          }
        }
        return null;
      },
    }),
    [st, S, tick],
  );

  const active = !prog.off && !debugBlocked() && !!st;
  const ch = chapter ? CHAPTERS.find((c) => c.id === chapter.id) : null;
  const step: Step | null = ch && chapter ? (ch.steps[chapter.i] ?? null) : null;

  // heartbeat: DOM-driven conditions (forecast open, buttons shown) are re-checked a few times per second
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((n) => n + 1), 220);
    return () => clearInterval(id);
  }, [active]);

  // drive chapters / steps / tips
  useEffect(() => {
    if (!active) {
      if (chapter) setChapter(null);
      if (tip) setTip(null);
      return;
    }
    // start a chapter
    if (!chapter) {
      const next = CHAPTERS.find((c) => !prog.chapters.includes(c.id) && c.start(ctx));
      if (next) {
        setChapter({ id: next.id, i: 0 });
        return;
      }
    }
    if (ch && chapter) {
      if (chapter.i >= ch.steps.length) {
        const p = { ...prog, chapters: [...prog.chapters, ch.id] };
        save(p);
        setProg(p);
        setChapter(null);
        return;
      }
      const cur = ch.steps[chapter.i];
      if (cur.skipIf?.(ctx) || (cur.when ? false : false)) {
        setChapter({ ...chapter, i: chapter.i + 1 });
        return;
      }
      if (cur.when && !cur.when(ctx)) {
        // waiting for the right moment; if the battle moved on past this whole chapter, close it
        if (!ctx.S) {
          const p = { ...prog, chapters: [...prog.chapters, ch.id] };
          save(p);
          setProg(p);
          setChapter(null);
        }
        return;
      }
      if (cur.done(ctx)) {
        audio.play('ui_confirm', { volume: 0.35 });
        setChapter({ ...chapter, i: chapter.i + 1 });
        return;
      }
      return;
    }
    // tips, one at a time, when no chapter step is showing
    if (!tip) {
      const t = TIPS.find((x) => !prog.tips.includes(x.id) && x.when(ctx));
      if (t) setTip(t);
    }
  }, [tick, st, S, prog, chapter?.id, chapter?.i, active]);

  // info steps advance by themselves
  useEffect(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    if (step?.autoMs && (!step.when || step.when(ctx))) autoTimer.current = setTimeout(() => setChapter((c) => (c ? { ...c, i: c.i + 1 } : c)), step.autoMs);
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, [step?.id]);

  // where is the target on screen
  const showing: { say: string; target: Target; block: boolean; info: boolean; tip: boolean } | null = step && (!step.when || step.when(ctx)) ? { say: step.say, target: step.target, block: !!step.block, info: !!step.autoMs, tip: false } : tip ? { say: tip.say, target: tip.target, block: false, info: false, tip: true } : null;
  useEffect(() => {
    if (!showing) return setRect(null);
    let raf = 0;
    const measure = () => {
      raf = requestAnimationFrame(measure);
      const t = showing.target;
      if (!t) return setRect((r) => (r ? null : r));
      if ('dom' in t) {
        const el = document.querySelector(t.dom) as HTMLElement | null;
        const r = el?.getBoundingClientRect();
        if (!r || !r.width) return setRect((x) => (x ? null : x));
        setRect((x) => (x && Math.abs(x.x - r.left) < 1 && Math.abs(x.y - r.top) < 1 && Math.abs(x.w - r.width) < 1 && Math.abs(x.h - r.height) < 1 ? x : { x: r.left, y: r.top, w: r.width, h: r.height, round: false }));
      } else {
        const id = t.figure(ctx);
        const p = id ? diorama?.screenOf(id) : null;
        if (!p) return setRect((x) => (x ? null : x));
        const w = 92;
        const h = 118;
        setRect((x) => (x && Math.abs(x.x - (p.x - w / 2)) < 1 && Math.abs(x.y - (p.y - 24)) < 1 ? x : { x: p.x - w / 2, y: p.y - 24, w, h, round: true }));
      }
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [showing?.say, showing?.target, diorama, ctx]);

  if (!active || !showing) return null;
  const dismissTip = () => {
    if (!tip) return;
    const p = { ...prog, tips: [...prog.tips, tip.id] };
    save(p);
    setProg(p);
    setTip(null);
  };
  const skipAll = () => {
    const p = { ...prog, off: true };
    save(p);
    setProg(p);
    setChapter(null);
    setTip(null);
  };
  const next = () => setChapter((c) => (c ? { ...c, i: c.i + 1 } : c));
  const pad = 8;
  const hole = rect ? { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 } : null;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  // put the mentor's line on the side of the screen away from the target
  const bubbleTop = hole ? hole.y + hole.h / 2 > vh * 0.5 : false;

  return (
    <div className={`tut ${showing.block ? 'blocking' : ''} ${showing.tip ? 'is-tip' : ''}`}>
      {(showing.block || showing.info) && (
        <svg className="tut-scrim" width={vw} height={vh} aria-hidden>
          <defs>
            <mask id="tut-hole">
              <rect x="0" y="0" width={vw} height={vh} fill="white" />
              {hole && <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={rect?.round ? Math.min(hole.w, hole.h) / 2 : 16} fill="black" />}
            </mask>
          </defs>
          <rect x="0" y="0" width={vw} height={vh} fill="rgba(4,3,3,0.62)" mask="url(#tut-hole)" />
        </svg>
      )}
      {/* input blockers around the hole: only the target can be tapped */}
      {showing.block &&
        (hole ? (
          <>
            <div className="tut-block" style={{ left: 0, top: 0, width: vw, height: Math.max(0, hole.y) }} />
            <div className="tut-block" style={{ left: 0, top: hole.y + hole.h, width: vw, height: Math.max(0, vh - hole.y - hole.h) }} />
            <div className="tut-block" style={{ left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.h }} />
            <div className="tut-block" style={{ left: hole.x + hole.w, top: hole.y, width: Math.max(0, vw - hole.x - hole.w), height: hole.h }} />
          </>
        ) : null)}
      {showing.info && <div className="tut-block tap-next" style={{ left: 0, top: 0, width: vw, height: vh }} onClick={next} />}
      {hole && (
        <>
          <div className={`tut-ring ${rect?.round ? 'round' : ''}`} style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} />
          <div className="tut-hand" style={{ left: hole.x + hole.w / 2, top: bubbleTop ? hole.y - 6 : hole.y + hole.h + 6 }} data-up={bubbleTop ? '1' : '0'}>
            <svg viewBox="0 0 48 48" aria-hidden>
              <path d="M24 4 L34 18 H28 V34 H20 V18 H14 Z" />
            </svg>
          </div>
        </>
      )}
      <div className={`tut-bubble ${bubbleTop ? 'top' : 'bottom'}`} role="status" aria-live="polite">
        <Mentor />
        <div className="txt">
          <p>{showing.say}</p>
          <div className="row">
            {showing.tip && (
              <button className="tut-ok" onClick={dismissTip}>
                Entendi
              </button>
            )}
            {showing.info && (
              <button className="tut-ok" onClick={next}>
                Continuar
              </button>
            )}
            {!showing.tip && (
              <button className="tut-skip" onClick={skipAll}>
                Pular tutorial
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
