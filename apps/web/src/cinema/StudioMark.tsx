/**
 * Studio emblem — UCHIHADAM PRODUCTION. An original seal: two upright blades joined into a "U", crossguards like a
 * crown, an ember diamond held between them, inside an engraved ring. Metallic gradients; the light sweep and the
 * ember pulse are CSS-driven (cinema.css, .sm-anim).
 */
import React, { useId } from 'react';
import { STUDIO } from './brand';
import './cinema.css';

const U_PATH =
  'M92 44 L99 64 L99 128 C99 148 108 156 120 156 C132 156 141 148 141 128 L141 64 L148 44 L155 64 L155 128 C155 158 140 172 120 172 C100 172 85 158 85 128 L85 64 Z';
const GUARDS = 'M75 67 L109 67 L104.5 76 L79.5 76 Z M131 67 L165 67 L160.5 76 L135.5 76 Z';
const KEEL = 'M111 169 L120 188 L129 169 Z';
const EMBER = 'M120 80 L131.5 104 L120 128 L108.5 104 Z';

export function StudioMark({ className, animate = false }: { className?: string; animate?: boolean }) {
  const id = useId().replace(/:/g, '');
  const u = (n: string) => `${n}-${id}`;
  const ticks: React.ReactNode[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const major = i % 9 === 0;
    const r0 = major ? 95 : 98;
    const r1 = major ? 106 : 102;
    ticks.push(<line key={i} x1={120 + Math.sin(a) * r0} y1={120 - Math.cos(a) * r0} x2={120 + Math.sin(a) * r1} y2={120 - Math.cos(a) * r1} strokeWidth={major ? 2 : 1} />);
  }
  return (
    <svg className={`sm-mark ${animate ? 'sm-anim' : ''} ${className ?? ''}`} viewBox="0 0 240 240" aria-hidden>
      <defs>
        <linearGradient id={u('chrome')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="0.22" stopColor="#efe0b6" />
          <stop offset="0.47" stopColor="#b8935a" />
          <stop offset="0.53" stopColor="#6a4c25" />
          <stop offset="0.62" stopColor="#d8bd85" />
          <stop offset="0.85" stopColor="#f3e4bc" />
          <stop offset="1" stopColor="#8a6a38" />
        </linearGradient>
        <linearGradient id={u('steel')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2efe6" />
          <stop offset="0.35" stopColor="#a8a196" />
          <stop offset="0.5" stopColor="#5d574e" />
          <stop offset="0.66" stopColor="#d9d2c4" />
          <stop offset="1" stopColor="#6f685d" />
        </linearGradient>
        <radialGradient id={u('ember')} cx="0.5" cy="0.55" r="0.6">
          <stop offset="0" stopColor="#fff7d6" />
          <stop offset="0.3" stopColor="#ffc35a" />
          <stop offset="0.7" stopColor="#ff6a1c" />
          <stop offset="1" stopColor="#a8260a" />
        </radialGradient>
        <radialGradient id={u('bloom')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff9a3c" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#ff6a1c" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ff6a1c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={u('sweep')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={u('glow')} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="b1" />
          <feGaussianBlur stdDeviation="9" result="b2" />
          <feMerge>
            <feMergeNode in="b2" />
            <feMergeNode in="b1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={u('emboss')} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" floodColor="#000" floodOpacity="0.8" />
        </filter>
        <clipPath id={u('clip')}>
          <path d={U_PATH} />
          <path d={GUARDS} />
          <path d={KEEL} />
        </clipPath>
      </defs>
      <circle className="sm-bloom" cx="120" cy="112" r="96" fill={`url(#${u('bloom')})`} />
      {/* ring */}
      <g className="sm-ring" filter={`url(#${u('emboss')})`}>
        <circle cx="120" cy="120" r="110" fill="none" stroke={`url(#${u('steel')})`} strokeWidth="3.2" pathLength={100} className="sm-ring-a" />
        <circle cx="120" cy="120" r="92" fill="none" stroke={`url(#${u('chrome')})`} strokeWidth="1.3" strokeOpacity="0.75" pathLength={100} className="sm-ring-b" />
        <g className="sm-ticks" stroke={`url(#${u('chrome')})`}>{ticks}</g>
      </g>
      {/* monogram */}
      <g className="sm-u" filter={`url(#${u('emboss')})`}>
        <path d={U_PATH} fill={`url(#${u('chrome')})`} stroke="#2b1d0d" strokeWidth="1" />
        <path d={GUARDS} fill={`url(#${u('chrome')})`} stroke="#2b1d0d" strokeWidth="1" />
        <path d={KEEL} fill={`url(#${u('chrome')})`} stroke="#2b1d0d" strokeWidth="1" />
        {/* fullers */}
        <path d="M92 58 L92 124 M148 58 L148 124" stroke="#3a2812" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M93.3 58 L93.3 124 M149.3 58 L149.3 124" stroke="#fff6dc" strokeOpacity="0.35" strokeWidth="0.8" strokeLinecap="round" />
      </g>
      {/* ember held between the blades */}
      <g className="sm-ember" filter={`url(#${u('glow')})`}>
        <path d={EMBER} fill={`url(#${u('ember')})`} />
        <path d="M120 92 L125.5 104 L120 116 L114.5 104 Z" fill="#fff4cf" opacity="0.85" />
      </g>
      {/* star between the tips */}
      <path className="sm-star" d="M120 46 L122.2 55.8 L132 58 L122.2 60.2 L120 70 L117.8 60.2 L108 58 L117.8 55.8 Z" fill="#fff3d1" filter={`url(#${u('glow')})`} />
      {/* light sweep */}
      <g clipPath={`url(#${u('clip')})`}>
        <rect className="sm-sweep" x="-120" y="20" width="70" height="200" fill={`url(#${u('sweep')})`} transform="skewX(-20)" />
      </g>
    </svg>
  );
}

/** Wordmark: UCHIHADAM / PRODUCTION (HTML text so it stays crisp and uses the loaded Cinzel face). */
export function StudioWordmark({ animate = false }: { animate?: boolean }) {
  const name = STUDIO.name.toUpperCase();
  return (
    <div className={`sm-word ${animate ? 'sm-anim' : ''}`}>
      <div className="sm-name" aria-label={name}>
        {name.split('').map((c, i) => (
          <span key={i} style={{ ['--i' as string]: i }}>
            {c}
          </span>
        ))}
      </div>
      <div className="sm-suffix">
        <i />
        <span>{STUDIO.suffix.toUpperCase()}</span>
        <i />
      </div>
    </div>
  );
}
