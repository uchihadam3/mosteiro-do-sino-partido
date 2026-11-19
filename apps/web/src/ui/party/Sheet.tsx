import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { recordMaxHp, type HeroRecord } from '@mosteiro/core';
import { Icon } from '../Icon';
import { CLASS_COLOR } from '../data';
import '../party.css';

/* Escape closes only the top-most sheet/modal (and never toggles the pause menu underneath). */
const escStack: { current: () => void }[] = [];
let escBound = false;
function bindEsc() {
  if (escBound || typeof window === 'undefined') return;
  escBound = true;
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !escStack.length) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      escStack[escStack.length - 1].current();
    },
    true,
  );
}
export function useEscape(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    bindEsc();
    const entry = { current: () => ref.current() };
    escStack.push(entry);
    return () => {
      const i = escStack.indexOf(entry);
      if (i >= 0) escStack.splice(i, 1);
    };
  }, []);
}

/** Bottom sheet (centered dialog on PC), portalled to <body> so it sits above every HUD layer. */
export function Sheet({ onClose, onBack, title, kicker, children, className, label }: { onClose(): void; onBack?(): void; title?: React.ReactNode; kicker?: React.ReactNode; children: React.ReactNode; className?: string; label?: string }) {
  useEscape(onBack ?? onClose);
  return createPortal(
    <div className="k-sheet-back pt-sheet-back" onClick={onClose}>
      <div className={`k-sheet pt-sheet ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {(title || onBack || kicker) && (
          <div className="pt-sheet-head">
            {onBack && (
              <button className="k-round pt-sm-round" onClick={onBack} aria-label="Voltar">
                <Icon id="back" />
              </button>
            )}
            <div className="pt-sheet-title">
              {kicker && <div className="k-kicker">{kicker}</div>}
              {title && <div className="pt-sheet-h">{title}</div>}
            </div>
            <button className="k-round pt-sm-round" onClick={onClose} aria-label="Fechar">
              <Icon id="close" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Round hero portrait: class emblem inside an HP ring, name underneath. */
export function HeroDisc({ h, on, onClick, label, size, badge }: { h: HeroRecord; on?: boolean; onClick?(): void; label?: string; size?: number; badge?: React.ReactNode }) {
  const max = recordMaxHp(h);
  const pct = Math.max(0, Math.min(1, h.hp / max));
  return (
    <button
      type="button"
      className={`pt-disc ${on ? 'on' : ''} ${h.status !== 'ok' ? 'down' : ''}`}
      style={{ ['--acc' as string]: CLASS_COLOR[h.classId], ['--hp' as string]: `${pct * 360}deg`, ['--d' as string]: `${size ?? 54}px` }}
      onClick={onClick}
      aria-pressed={on}
      aria-label={label ?? h.name}
    >
      <span className="ring">
        <span className="face">
          <Icon id={`class_${h.classId}`} />
        </span>
      </span>
      {badge}
      <span className="nm">{h.name}</span>
    </button>
  );
}
