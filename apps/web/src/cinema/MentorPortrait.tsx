/**
 * Mentor portrait — Irmão Anselmo, o Último Sineiro. A round gothic portrait: the cowl in shadow, two pale ghost-lit
 * eyes, a white beard lit from below by his lantern, the bell rope over his shoulder, inside a gold ring.
 * Used by cutscene subtitles and by the interactive tutorial's coach bubbles.
 *
 *   <MentorPortrait size={56} />            static
 *   <MentorPortrait size={56} speaking />   gentle lantern flicker + eye glow (CSS, respects reduced motion)
 */
import React, { useId } from 'react';
import { MENTOR } from './brand';
import './cinema.css';

export function MentorPortrait({ size = 64, speaking = false, className, title = MENTOR.name }: { size?: number | string; speaking?: boolean; className?: string; title?: string }) {
  const id = useId().replace(/:/g, '');
  const u = (n: string) => `${n}-${id}`;
  return (
    <svg
      className={`mentor-portrait ${speaking ? 'mp-speaking' : ''} ${className ?? ''}`}
      viewBox="0 0 128 128"
      width={size}
      height={size}
      role="img"
      aria-label={title}
    >
      <defs>
        <radialGradient id={u('bg')} cx="0.62" cy="0.8" r="0.85">
          <stop offset="0" stopColor="#5a3417" />
          <stop offset="0.35" stopColor="#24160f" />
          <stop offset="1" stopColor="#070506" />
        </radialGradient>
        <linearGradient id={u('window')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b4c6e" stopOpacity="0.8" />
          <stop offset="1" stopColor="#1a2233" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={u('cowl')} x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0" stopColor="#5b5654" />
          <stop offset="0.28" stopColor="#3a302b" />
          <stop offset="0.62" stopColor="#211915" />
          <stop offset="1" stopColor="#3d2414" />
        </linearGradient>
        <linearGradient id={u('cowlIn')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#030202" />
          <stop offset="0.7" stopColor="#0c0806" />
          <stop offset="1" stopColor="#2a1b12" />
        </linearGradient>
        <linearGradient id={u('face')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a0706" />
          <stop offset="0.45" stopColor="#2b1f18" />
          <stop offset="1" stopColor="#7a5a40" />
        </linearGradient>
        <radialGradient id={u('faceLit')} cx="0.78" cy="0.95" r="0.75">
          <stop offset="0" stopColor="#d88a4a" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#7a4a28" stopOpacity="0.2" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={u('beard')} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#8f877c" />
          <stop offset="0.45" stopColor="#e9e1d1" />
          <stop offset="0.8" stopColor="#f7e2b8" />
          <stop offset="1" stopColor="#a58c66" />
        </linearGradient>
        <radialGradient id={u('lantern')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff1c4" />
          <stop offset="0.25" stopColor="#ffc76a" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="#ff8a2a" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ff8a2a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={u('ring')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6e3a8" />
          <stop offset="0.45" stopColor="#b98a43" />
          <stop offset="0.55" stopColor="#6e4c1f" />
          <stop offset="1" stopColor="#d9b46a" />
        </linearGradient>
        <filter id={u('eyeGlow')} x="-200%" y="-300%" width="500%" height="700%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={u('rim')} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        <clipPath id={u('disc')}>
          <circle cx="64" cy="64" r="58" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${u('disc')})`}>
        <rect width="128" height="128" fill={`url(#${u('bg')})`} />
        {/* lancet window behind him (moonlight) */}
        <path d="M14 70 L14 40 Q14 22 27 12 Q40 22 40 40 L40 70 Z" fill={`url(#${u('window')})`} />
        <path d="M27 14 L27 70 M14 44 L40 44" stroke="#0a0b10" strokeWidth="1.4" opacity="0.7" />

        {/* lantern light from below-right */}
        <circle className="mp-lantern-glow" cx="100" cy="112" r="34" fill={`url(#${u('lantern')})`} />

        {/* shoulders + cowl */}
        <path d="M6 128 C10 106 20 96 32 90 C30 70 34 46 44 32 C50 22 57 16 64 14 C71 16 78 22 84 32 C94 46 98 70 96 90 C108 96 118 106 122 128 Z" fill={`url(#${u('cowl')})`} />
        {/* cloth folds */}
        <path d="M32 90 C36 102 38 114 36 128 M96 90 C92 104 92 116 94 128 M48 100 C50 110 50 120 48 128" fill="none" stroke="#0e0a08" strokeOpacity="0.6" strokeWidth="1.6" />
        {/* cool ghost rim on the lit edge */}
        <path d="M33 88 C31 70 35 46 45 32 C51 23 57 17 64 15" fill="none" stroke="#a9cbff" strokeOpacity="0.55" strokeWidth="1.6" filter={`url(#${u('rim')})`} />

        {/* the opening of the hood */}
        <path d="M44 48 C46 36 54 28 64 27 C74 28 82 36 84 48 C86 62 84 80 76 94 C72 100 56 100 52 94 C44 80 42 62 44 48 Z" fill={`url(#${u('cowlIn')})`} />
        {/* face, mostly in shadow, lit from below-right by the lantern */}
        <path d="M51 52 C52 44 57 40 64 40 C71 40 76 44 77 52 C78 62 76 72 72 78 C68 82 60 82 56 78 C52 72 50 62 51 52 Z" fill={`url(#${u('face')})`} />
        <path d="M51 52 C52 44 57 40 64 40 C71 40 76 44 77 52 C78 62 76 72 72 78 C68 82 60 82 56 78 C52 72 50 62 51 52 Z" fill={`url(#${u('faceLit')})`} />
        <path d="M75.5 56 C76.5 64 75 71 71.5 77" fill="none" stroke="#ffb46a" strokeOpacity="0.55" strokeWidth="1.3" strokeLinecap="round" filter={`url(#${u('rim')})`} />
        <path d="M68 66 Q72 64.5 75 66.5" fill="none" stroke="#c58a55" strokeOpacity="0.45" strokeWidth="1" strokeLinecap="round" />
        {/* brows + sunken eyes */}
        <path d="M53.5 55.5 Q57.5 52.6 61.5 55 M66.5 55 Q70.5 52.6 74.5 55.5" fill="none" stroke="#050303" strokeWidth="2.2" strokeLinecap="round" />
        <g className="mp-eyes" filter={`url(#${u('eyeGlow')})`} fill="#d6eeff">
          <path d="M55.2 59 Q57.8 57.5 60.4 59 Q57.8 60 55.2 59 Z" />
          <path d="M67.6 59 Q70.2 57.5 72.8 59 Q70.2 60 67.6 59 Z" />
        </g>
        {/* nose catching the light */}
        <path d="M64 60 L65.4 69.5 Q64.2 71.2 62.4 70.4" fill="none" stroke="#c08a5e" strokeOpacity="0.9" strokeWidth="1.15" strokeLinecap="round" />
        {/* moustache + long beard */}
        <path d="M55 74 Q60 70.5 64 73 Q68 70.5 73 74 Q69 75.6 64 75 Q59 75.6 55 74 Z" fill="#d9cfbd" />
        <path d="M53 73 C52 82 54 92 58 102 C60 108 62 114 64 120 C66 114 68 108 70 102 C74 92 76 82 75 73 C71 78 68 79 64 79 C60 79 57 78 53 73 Z" fill={`url(#${u('beard')})`} />
        <path d="M58 82 C59 92 61 102 63 112 M64 81 L64.6 116 M70 82 C69 92 67 102 65.4 112 M55.5 78 C56 86 57.5 94 60 101" fill="none" stroke="#6f6456" strokeOpacity="0.5" strokeWidth="0.8" />

        {/* bell rope over the right shoulder (two twisted strands) */}
        <path d="M74 128 C79 117 88 103 100 85" fill="none" stroke="#2a1708" strokeWidth="9" strokeLinecap="round" />
        <path d="M74 128 C79 117 88 103 100 85" fill="none" stroke="#a87a42" strokeWidth="6.5" strokeLinecap="round" />
        <path d="M74 128 C79 117 88 103 100 85" fill="none" stroke="#e2b878" strokeWidth="6.5" strokeLinecap="butt" strokeDasharray="2.4 3" />
        <path d="M74 128 C79 117 88 103 100 85" fill="none" stroke="#5a3a18" strokeWidth="1.2" strokeDasharray="1 4.4" strokeDashoffset="2" />

        {/* the lantern */}
        <g transform="translate(101 108)">
          <path d="M-3 -17 Q0 -22 3 -17" fill="none" stroke="#8a6a3a" strokeWidth="1.4" />
          <path d="M-7 -14 L7 -14 L9 9 L-9 9 Z" fill="#160e08" stroke="#8a6a3a" strokeWidth="1.3" />
          <rect className="mp-flame" x="-5" y="-11" width="10" height="16" rx="3.5" fill="#ffd98a" />
          <path d="M0 -8 C-2.5 -4 -2 1 0 3 C2 1 2.5 -4 0 -8 Z" fill="#fff6d8" />
          <path d="M-7 -1 L7 -1 M0 -14 L0 9" stroke="#160e08" strokeWidth="1.2" />
          <rect x="-10" y="8" width="20" height="3" rx="1" fill="#8a6a3a" />
        </g>
      </g>

      {/* frame */}
      <circle cx="64" cy="64" r="59.5" fill="none" stroke="#0a0706" strokeWidth="3" />
      <circle cx="64" cy="64" r="61" fill="none" stroke={`url(#${u('ring')})`} strokeWidth="3.4" />
      <circle cx="64" cy="64" r="63" fill="none" stroke="#f6e3a8" strokeOpacity="0.25" strokeWidth="0.8" />
    </svg>
  );
}
