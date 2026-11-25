/**
 * Game logo — "Mosteiro do Sino Partido": a cracked bronze bell under a gothic arch, the crack glowing like an ember,
 * and Cinzel lettering in gold with the same crack running through "PARTIDO".
 * Pure SVG (scales to any size). `size` picks a preset width; `layout` stacks the emblem over the title or puts it beside it.
 */
import React, { useId } from 'react';
import './cinema.css';

export type LogoSize = 'title' | 'splash' | 'loading' | 'card';

/** Shared jagged crack through the bell (emblem viewBox 0 0 200 240). */
const BELL_CRACK = 'M113 195 L109.5 183 L115.5 171 L108.5 158 L113 146 L106 132 L110 120 L104 107';
const BELL_CRACK_BRANCH_A = 'M109.5 183 L101 178 L97 181';
const BELL_CRACK_BRANCH_B = 'M108.5 158 L116 152 L121 154';

export function GameEmblem({ className, animate = false, title }: { className?: string; animate?: boolean; title?: string }) {
  const id = useId().replace(/:/g, '');
  const u = (n: string) => `${n}-${id}`;
  return (
    <svg className={`gl-emblem ${animate ? 'gl-anim' : ''} ${className ?? ''}`} viewBox="0 0 200 240" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id={u('gold')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2c8" />
          <stop offset="0.28" stopColor="#e9c97c" />
          <stop offset="0.55" stopColor="#b2843f" />
          <stop offset="0.8" stopColor="#6e4c1f" />
          <stop offset="1" stopColor="#c9a25a" />
        </linearGradient>
        <linearGradient id={u('goldH')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7a5623" />
          <stop offset="0.3" stopColor="#f3dc9c" />
          <stop offset="0.55" stopColor="#b98a43" />
          <stop offset="1" stopColor="#5e421b" />
        </linearGradient>
        <linearGradient id={u('bronze')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#24150a" />
          <stop offset="0.16" stopColor="#6b4320" />
          <stop offset="0.34" stopColor="#d9a35a" />
          <stop offset="0.42" stopColor="#f7d595" />
          <stop offset="0.56" stopColor="#a8702f" />
          <stop offset="0.8" stopColor="#4d2f14" />
          <stop offset="1" stopColor="#1c1007" />
        </linearGradient>
        <linearGradient id={u('bronzeShade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0.08" />
          <stop offset="1" stopColor="#000" stopOpacity="0.5" />
        </linearGradient>
        <radialGradient id={u('niche')} cx="0.5" cy="0.62" r="0.62">
          <stop offset="0" stopColor="#3a1d0e" />
          <stop offset="0.45" stopColor="#1a0f0a" />
          <stop offset="1" stopColor="#080606" />
        </radialGradient>
        <radialGradient id={u('emberGlow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffb25a" stopOpacity="0.85" />
          <stop offset="0.35" stopColor="#ff6a1e" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ff4a10" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={u('emberCore')} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.5" stopColor="#ffb347" />
          <stop offset="1" stopColor="#ff6a1e" />
        </linearGradient>
        <filter id={u('glow')} x="-50%" y="-20%" width="200%" height="140%">
          <feGaussianBlur stdDeviation="2.4" result="b1" />
          <feGaussianBlur stdDeviation="6" result="b2" />
          <feMerge>
            <feMergeNode in="b2" />
            <feMergeNode in="b1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={u('soft')} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.75" />
        </filter>
        <clipPath id={u('nicheClip')}>
          <path d="M40 226 L40 112 A78 78 0 0 1 100 36 A78 78 0 0 1 160 112 L160 226 Z" />
        </clipPath>
      </defs>

      {/* niche behind the bell */}
      <path d="M40 226 L40 112 A78 78 0 0 1 100 36 A78 78 0 0 1 160 112 L160 226 Z" fill={`url(#${u('niche')})`} />
      <g clipPath={`url(#${u('nicheClip')})`}>
        <ellipse className="gl-halo" cx="100" cy="150" rx="70" ry="78" fill={`url(#${u('emberGlow')})`} opacity="0.55" />
        {/* tracery rose above the bell */}
        <g opacity="0.55" fill="none" stroke={`url(#${u('gold')})`} strokeWidth="1.6">
          <circle cx="100" cy="62" r="15" />
          <circle cx="100" cy="54" r="6.5" />
          <circle cx="93" cy="66" r="6.5" />
          <circle cx="107" cy="66" r="6.5" />
        </g>
      </g>

      {/* yoke */}
      <g filter={`url(#${u('soft')})`}>
        <rect x="56" y="80" width="88" height="9" rx="2" fill={`url(#${u('goldH')})`} />
        <rect x="52" y="78" width="8" height="13" rx="1.5" fill={`url(#${u('gold')})`} />
        <rect x="140" y="78" width="8" height="13" rx="1.5" fill={`url(#${u('gold')})`} />
      </g>

      {/* the bell */}
      <g className="gl-bell" filter={`url(#${u('soft')})`}>
        <path d="M92 90 C92 81 108 81 108 90" fill="none" stroke={`url(#${u('goldH')})`} strokeWidth="4" />
        <path
          d="M100 89 C86 89 78 95 76 107 C73 125 72 147 66 167 C62 179 55 185 50 188 L50 195 L150 195 L150 188 C145 185 138 179 134 167 C128 147 127 125 124 107 C122 95 114 89 100 89 Z"
          fill={`url(#${u('bronze')})`}
        />
        <path
          d="M100 89 C86 89 78 95 76 107 C73 125 72 147 66 167 C62 179 55 185 50 188 L50 195 L150 195 L150 188 C145 185 138 179 134 167 C128 147 127 125 124 107 C122 95 114 89 100 89 Z"
          fill={`url(#${u('bronzeShade')})`}
        />
        {/* bands */}
        <path d="M77 110 Q100 104 123 110" fill="none" stroke="#f4d796" strokeOpacity="0.5" strokeWidth="1.2" />
        <path d="M75.5 116 Q100 110 124.5 116" fill="none" stroke="#2a180b" strokeOpacity="0.6" strokeWidth="1" />
        <path d="M60 178 Q100 170 140 178" fill="none" stroke="#f4d796" strokeOpacity="0.45" strokeWidth="1.4" />
        <path d="M57 183 Q100 175 143 183" fill="none" stroke="#2a180b" strokeOpacity="0.55" strokeWidth="1" />
        <ellipse cx="100" cy="195" rx="50" ry="5.5" fill="#120a05" />
        <ellipse cx="100" cy="194" rx="50" ry="5.5" fill="none" stroke={`url(#${u('goldH')})`} strokeWidth="1.6" />
      </g>

      {/* the crack: dark split, then the ember inside it */}
      <g className="gl-crack">
        <path d={BELL_CRACK} fill="none" stroke="#120703" strokeWidth="4.2" strokeLinejoin="round" strokeLinecap="round" />
        <g filter={`url(#${u('glow')})`}>
          <path className="gl-crack-core" d={BELL_CRACK} fill="none" stroke={`url(#${u('emberCore')})`} strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" pathLength={100} />
          <path className="gl-crack-branch" d={BELL_CRACK_BRANCH_A} fill="none" stroke="#ff8a3a" strokeWidth="1.1" strokeLinecap="round" pathLength={100} />
          <path className="gl-crack-branch" d={BELL_CRACK_BRANCH_B} fill="none" stroke="#ff8a3a" strokeWidth="1.1" strokeLinecap="round" pathLength={100} />
        </g>
      </g>

      {/* rising embers (animated in the splash) */}
      <g className="gl-embers" fill="#ffb45a">
        <circle cx="106" cy="104" r="1.4" />
        <circle cx="112" cy="132" r="1.1" />
        <circle cx="104" cy="150" r="1.2" />
        <circle cx="114" cy="172" r="0.9" />
      </g>

      {/* the arch frame */}
      <g filter={`url(#${u('soft')})`}>
        <path
          d="M28 228 L28 110 A90 90 0 0 1 100 22 A90 90 0 0 1 172 110 L172 228 L160 228 L160 112 A78 78 0 0 0 100 36 A78 78 0 0 0 40 112 L40 228 Z"
          fill={`url(#${u('gold')})`}
          fillRule="evenodd"
        />
        <path d="M33 228 L33 111 A85 85 0 0 1 100 28 A85 85 0 0 1 167 111 L167 228" fill="none" stroke="#3b2810" strokeOpacity="0.55" strokeWidth="0.9" />
        {/* capitals */}
        <rect x="23" y="104" width="22" height="7" rx="1" fill={`url(#${u('goldH')})`} />
        <rect x="155" y="104" width="22" height="7" rx="1" fill={`url(#${u('goldH')})`} />
        {/* finial */}
        <path d="M100 3 L105.5 14 L100 24 L94.5 14 Z" fill={`url(#${u('gold')})`} />
        <path d="M93 12.5 L107 12.5" stroke={`url(#${u('goldH')})`} strokeWidth="2.2" />
        {/* crockets */}
        <g fill={`url(#${u('gold')})`}>
          <path d="M38 76 l-7 -3 l3 7 z" />
          <path d="M60 44 l-6 -5 l1 8 z" />
          <path d="M162 76 l7 -3 l-3 7 z" />
          <path d="M140 44 l6 -5 l-1 8 z" />
        </g>
        {/* plinth */}
        <rect x="16" y="226" width="168" height="9" rx="1.5" fill={`url(#${u('goldH')})`} />
        <rect x="24" y="235" width="152" height="4" rx="1" fill="#6e4c1f" />
      </g>
    </svg>
  );
}

/** The title lettering: "MOSTEIRO DO / SINO PARTIDO", the word PARTIDO split by an ember crack through the T. */
export function GameWordmark({ className, animate = false, decorative = false }: { className?: string; animate?: boolean; decorative?: boolean }) {
  const id = useId().replace(/:/g, '');
  const u = (n: string) => `${n}-${id}`;
  // viewBox 0 0 1000 250 — the crack runs down the stem of the T (x ≈ 675)
  const crackPts = '678,92 669,124 684,146 672,172 688,196 680,218';
  const crack = `M${crackPts.split(' ').join(' L')}`;
  const left = `M0 0 L682 0 L${crackPts.split(' ').join(' L')} L676 250 L0 250 Z`;
  const right = `M1000 0 L682 0 L${crackPts.split(' ').join(' L')} L676 250 L1000 250 Z`;
  const main = (cls: string) => (
    <text
      className={cls}
      x="500"
      y="196"
      textAnchor="middle"
      fontFamily="Cinzel, 'Times New Roman', serif"
      fontWeight="700"
      fontSize="122"
      textLength="960"
      lengthAdjust="spacing"
      fill={`url(#${u('txt')})`}
      stroke="#2a1a0a"
      strokeWidth="2.4"
      paintOrder="stroke"
    >
      SINO PARTIDO
    </text>
  );
  return (
    <svg className={`gl-word ${animate ? 'gl-anim' : ''} ${className ?? ''}`} viewBox="0 0 1000 250" role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : 'Mosteiro do Sino Partido'} aria-hidden={decorative ? true : undefined}>
      <defs>
        <linearGradient id={u('txt')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6da" />
          <stop offset="0.3" stopColor="#f1d48b" />
          <stop offset="0.56" stopColor="#c6954a" />
          <stop offset="0.78" stopColor="#8a5c25" />
          <stop offset="1" stopColor="#e2bd73" />
        </linearGradient>
        <linearGradient id={u('txt2')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6e6bb" />
          <stop offset="1" stopColor="#b8904c" />
        </linearGradient>
        <linearGradient id={u('sweep')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fffbe8" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={u('rule')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c8a75e" stopOpacity="0" />
          <stop offset="0.5" stopColor="#e6cf8f" />
          <stop offset="1" stopColor="#c8a75e" stopOpacity="0" />
        </linearGradient>
        <filter id={u('shadow')} x="-5%" y="-20%" width="110%" height="150%">
          <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#000" floodOpacity="0.85" />
        </filter>
        <filter id={u('glow')} x="-200%" y="-10%" width="500%" height="120%">
          <feGaussianBlur stdDeviation="2.5" result="b1" />
          <feGaussianBlur stdDeviation="8" result="b2" />
          <feMerge>
            <feMergeNode in="b2" />
            <feMergeNode in="b2" />
            <feMergeNode in="b1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id={u('left')}>
          <path d={left} />
        </clipPath>
        <clipPath id={u('right')}>
          <path d={right} />
        </clipPath>
        {/* a hairline gap along the crack, removed from both halves */}
        <mask id={u('gap')} maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="250">
          <rect width="1000" height="250" fill="#fff" />
          <path d={crack} fill="none" stroke="#000" strokeWidth="3.5" strokeLinejoin="round" />
        </mask>
        <clipPath id={u('words')}>
          <text x="500" y="196" textAnchor="middle" fontFamily="Cinzel, 'Times New Roman', serif" fontWeight="700" fontSize="122" textLength="960" lengthAdjust="spacing">
            SINO PARTIDO
          </text>
        </clipPath>
      </defs>
      <g filter={`url(#${u('shadow')})`}>
        <text className="gl-pre" x="500" y="66" textAnchor="middle" fontFamily="Cinzel, 'Times New Roman', serif" fontWeight="500" fontSize="46" textLength="540" lengthAdjust="spacing" fill={`url(#${u('txt2')})`}>
          MOSTEIRO DO
        </text>
        <g className="gl-main" mask={`url(#${u('gap')})`}>
          <g clipPath={`url(#${u('left')})`}>{main('')}</g>
          <g transform="translate(2.6 3.4) rotate(0.6 682 150)">
            <g clipPath={`url(#${u('right')})`}>{main('')}</g>
          </g>
        </g>
      </g>
      {/* light sweep across the lettering */}
      <g clipPath={`url(#${u('words')})`} className="gl-sweep-wrap">
        <rect className="gl-sweep" x="-260" y="60" width="220" height="200" fill={`url(#${u('sweep')})`} transform="skewX(-18)" />
      </g>
      {/* ember in the split */}
      <path className="gl-word-crack" d={crack} fill="none" stroke="#ffa04a" strokeWidth="2" strokeLinejoin="round" filter={`url(#${u('glow')})`} pathLength={100} transform="translate(1.3 1.7)" />
      {/* ornament rule */}
      <g className="gl-rule">
        <rect x="330" y="232" width="340" height="2" fill={`url(#${u('rule')})`} />
        <path d="M500 225 L508 233 L500 241 L492 233 Z" fill="#e6cf8f" />
      </g>
    </svg>
  );
}

/** Emblem + lettering. layout 'stack' = emblem above the title; 'row' = emblem beside it. */
export function GameLogo({ size = 'title', layout = 'stack', animate = false, className }: { size?: LogoSize; layout?: 'stack' | 'row' | 'auto'; animate?: boolean; className?: string }) {
  return (
    <div className={`game-logo gl-${size} gl-${layout} ${animate ? 'gl-anim' : ''} ${className ?? ''}`} role="img" aria-label="Mosteiro do Sino Partido">
      <GameEmblem animate={animate} />
      <GameWordmark animate={animate} decorative />
    </div>
  );
}
