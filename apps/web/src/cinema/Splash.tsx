/**
 * Launch sequence: UCHIHADAM PRODUCTION (≈3.2 s) → game logo reveal (≈2.2 s) → title.
 * Tap / click / any key skips straight to the title. ?splash=0 skips it instantly (tests, demos).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getSettings } from '../state/settings';
import { StudioMark, StudioWordmark } from './StudioMark';
import { GameLogo } from './GameLogo';
import { EmberField } from './embers';
import { SplashAudio } from './splashAudio';
import './cinema.css';

export function splashWanted(): boolean {
  const q = new URLSearchParams(location.search);
  if (q.get('debug')) return false;
  const v = q.get('splash');
  return v !== '0' && v !== 'off';
}

export function Splash({ onDone }: { onDone(): void }) {
  const [phase, setPhase] = useState<'studio' | 'game' | 'out'>('studio');
  const canvas = useRef<HTMLCanvasElement>(null);
  const done = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    setPhase('out');
    setTimeout(() => doneRef.current(), 560);
  }, []);

  useEffect(() => {
    if (!splashWanted()) {
      done.current = true;
      doneRef.current();
      return;
    }
    void document.fonts?.load('700 48px Cinzel').catch(() => undefined);
    void document.fonts?.load('500 20px Cinzel').catch(() => undefined);
    const reduced = getSettings().reducedMotion;
    // ?splash=slow8 stretches the timeline (frame-by-frame review of the animation)
    const slow = Number(/^slow(\d+)$/.exec(new URLSearchParams(location.search).get('splash') ?? '')?.[1] ?? 1) || 1;
    const field = canvas.current ? new EmberField(canvas.current) : null;
    if (field && !reduced) field.start();
    const snd = new SplashAudio(['cycle_start', 'bell_great_cracked']);
    const base = reduced ? { ignite: 150, game: 1900, crack: 2100, end: 3600 } : { ignite: 780, game: 3250, crack: 3650, end: 5650 };
    const T = { ignite: base.ignite * slow, game: base.game * slow, crack: base.crack * slow, end: base.end * slow };
    const timers = [
      setTimeout(() => {
        field?.burst(0.5, 0.42, 46, 1.2);
        void snd.play('cycle_start', 1);
      }, T.ignite),
      setTimeout(() => setPhase((p) => (p === 'out' ? p : 'game')), T.game),
      setTimeout(() => {
        // the crack in the bell ignites (emblem centre, a little below)
        const portrait = innerHeight > innerWidth;
        field?.burst(0.515, portrait ? 0.4 : 0.36, 34, 0.8);
        void snd.play('bell_great_cracked', 0.75);
      }, T.crack),
      setTimeout(finish, T.end),
    ];
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      finish();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', onKey);
      field?.stop();
      snd.dispose();
    };
  }, [finish]);

  return (
    <div className={`splash ${phase === 'out' ? 'out' : ''}`} onPointerDown={finish} role="presentation" data-phase={phase}>
      <canvas ref={canvas} className="sp-embers" />
      <div className="sp-vig" />
      <div className={`sp-stage ${phase !== 'studio' ? 'hide' : ''}`} aria-hidden={phase !== 'studio'}>
        <div className="sp-studio play">
          <StudioMark animate />
          <StudioWordmark animate />
        </div>
      </div>
      {phase !== 'studio' && (
        <div className="sp-stage">
          <div className="sp-game">
            <GameLogo size="splash" animate />
          </div>
        </div>
      )}
      <div className="sp-skip">Toque para pular</div>
    </div>
  );
}
