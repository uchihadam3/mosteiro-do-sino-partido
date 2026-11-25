/**
 * CinemaLayer — always mounted above the game (App.tsx). Watches the session and starts the cutscene the state calls
 * for (opening at the Pórtico, boss intros, finale), then renders the letterbox, subtitles, name cards and "Pular".
 * Tap anywhere = next line; Pular / Esc = skip. Debug: window.__cinema.play('abertura' | 'cantor' | 'vigia' | 'severin' | 'final').
 */
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useApp } from '../app/App';
import { useSession } from '../app/hooks';
import { session } from '../state/session';
import { Icon } from '../ui/Icon';
import { cinema, getCineView, subscribeCinema, barsFor, type CineLine } from './player';
import { cutsceneFor, findCutscene } from './registry';
import { MentorPortrait } from './MentorPortrait';
import { GameLogo } from './GameLogo';
import { GAME } from './brand';
import './d1';
import './cinema.css';

export function CinemaLayer() {
  const { diorama, route } = useApp();
  const s = useSession();
  const st = s.state;
  const v = useSyncExternalStore(subscribeCinema, getCineView);
  const [bar, setBar] = useState(() => barsFor(innerWidth, innerHeight));
  const latest = useRef({ st, inGame: route === 'game' });
  latest.current = { st, inGame: route === 'game' };

  useEffect(() => {
    const on = () => setBar(barsFor(innerWidth, innerHeight));
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);

  // story beats
  useEffect(() => {
    if (!diorama || route !== 'game' || !st || cinema.playing) return;
    const cs = cutsceneFor(st);
    if (cs) void cinema.play(cs, diorama, st, () => latest.current);
  }, [diorama, route, st?.id, st?.phase, st?.node, st?.combatEncounterId, st?.combat?.phase, !!st?.epilogue, v.active]);

  // leaving the game (menu, disconnect) ends any cutscene
  useEffect(() => {
    if ((route !== 'game' || !st) && cinema.playing) cinema.skip();
  }, [route, !!st]);

  // debug / test hooks
  useEffect(() => {
    (window as unknown as { __cinema: unknown }).__cinema = {
      play(id: string) {
        const stNow = session.state;
        const cs = findCutscene(id, stNow?.dungeonId);
        if (!cs || !diorama || !stNow) return false;
        void cinema.play(cs, diorama, stNow, () => latest.current);
        return true;
      },
      skip: () => cinema.skip(),
      advance: () => cinema.advance(),
      seek: (t: number) => cinema.seek(t),
      get time() {
        return cinema.currentTime;
      },
      get duration() {
        return cinema.duration;
      },
      get playing() {
        return cinema.playing;
      },
      get id() {
        return cinema.id;
      },
      get ctx() {
        return cinema.context;
      },
    };
  }, [diorama]);

  if (!v.active) return null;
  const style = { ['--bar' as string]: `${bar}px`, ['--bar-b' as string]: `${bar}px` } as React.CSSProperties;
  return (
    <div
      className={`cine-root ${v.bars ? 'bars' : ''}`}
      style={style}
      role="dialog"
      aria-label={v.title}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('.cine-skip')) return;
        cinema.advance();
      }}
    >
      <div className="cine-tint" />
      <div className="cine-bar top" />
      <div className="cine-bar bottom" />
      <div className="cine-fade" style={{ opacity: v.fade, ['--fade-dur' as string]: `${v.fadeDur}s` }} />
      {v.chapter && (
        <div className={`cine-chapter ${v.chapterOut ? 'out' : ''}`} key={v.chapter.id}>
          <div className="inner">
            <div className="num">{v.chapter.num}</div>
            {v.chapter.title === GAME.title ? <GameLogo size="card" animate /> : <div className="cine-chapter-title">{v.chapter.title}</div>}
          </div>
        </div>
      )}
      {v.card && (
        <div className={`cine-card ${v.cardOut ? 'out' : ''}`} key={v.card.id}>
          {v.card.kick && <div className="kick">{v.card.kick}</div>}
          <div className={`name ${v.card.name.length > 16 ? 'long' : ''}`}>{v.card.name}</div>
          <div className="rule" />
          {v.card.epi && <div className="epi">{v.card.epi}</div>}
        </div>
      )}
      <div className="cine-sub" aria-live="polite">
        {v.line && <Line l={v.line} out={v.lineOut} key={v.line.id} />}
      </div>
      {v.canSkip && (
        <button
          className="cine-skip"
          aria-label="Pular cena"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            cinema.skip();
          }}
        >
          Pular
          <Icon id="skip" />
        </button>
      )}
    </div>
  );
}

function Line({ l, out }: { l: CineLine; out: boolean }) {
  return (
    <div className={`cine-line ${l.kind ?? ''} ${out ? 'out' : ''}`}>
      {l.kind === 'mentor' && <MentorPortrait size={46} speaking />}
      <div>
        {l.name && <span className="who">{l.name}</span>}
        <span className="txt">
          {l.text}
          {l.more && !out && <i className="more" aria-hidden />}
        </span>
      </div>
    </div>
  );
}
