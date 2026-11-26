import React, { useEffect, useState } from 'react';
import { dungeon } from '@mosteiro/core';
import { useSession } from '../app/hooks';
import { useApp } from '../app/App';
import { Prep } from './Prep';
import { Explore } from './Explore';
import { GameHUD } from './combat/GameHUD';
import { Reward } from './Reward';
import { Base } from './Base';
import { Icon } from './Icon';
import { PauseMenu } from './Pause';
import { session } from '../state/session';
import { audio } from '../audio/AudioDirector';
import './explore.css';
import './story.css';
import { useShrinkToFit } from './gamekit';

/** Story prose that shrinks to fit its card instead of scrolling. */
function Prose({ text, center }: { text: string; center?: boolean }) {
  const ref = useShrinkToFit<HTMLParagraphElement>(18, 12.5, [text]);
  return (
    <p ref={ref} className={`story-text ${center ? 'center' : ''}`}>
      {text}
    </p>
  );
}

export function GameScreens() {
  const s = useSession();
  const st = s.state!;
  const [pause, setPause] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPause((p) => !p);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const d = dungeon(st.dungeonId);
  return (
    <>
      {st.phase === 'prep' && <Prep />}
      {st.phase === 'explore' && <Explore />}
      {st.phase === 'combat' && st.combat && <GameHUD />}
      {st.phase === 'reward' && <Reward />}
      {(st.phase === 'base' || st.phase === 'complete') && <Base />}
      {st.phase === 'epilogue' && st.epilogue && <Epilogue />}
      {st.phase === 'gameover' && <GameOver />}
      {st.pendingArchive && d.archive[st.pendingArchive] && <ArchiveModal code={st.pendingArchive} />}
      {st.narrative && !st.pendingArchive && st.phase === 'explore' && <NarrativeModal />}
      {st.phase !== 'combat' && (
        <button
          className="k-round pause-btn"
          style={{
            position: 'fixed',
            right: 'calc(12px + var(--safe-r))',
            top: 'calc(10px + var(--safe-t))',
            zIndex: 40,
          }}
          onClick={() => setPause(true)}
          aria-label="Menu"
        >
          <Icon id="menu" />
        </button>
      )}
      {pause && <PauseMenu onClose={() => setPause(false)} />}
      {s.role !== 'local' && <NetBadge />}
    </>
  );
}

function NetBadge() {
  const s = useSession();
  return (
    <div
      className="k-chip"
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(4px + env(safe-area-inset-bottom, 0px))',
        zIndex: 39,
        background: 'rgba(14,11,11,0.8)',
      }}
      title={s.seats.map((x) => `${x.name}${x.connected ? '' : ' (saiu)'}`).join(', ')}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: s.seats.every((x) => x.connected) ? '#8fbf72' : '#e0a64a',
        }}
      />
      {s.role === 'host' ? 'Anfitrião' : 'Online'} · {s.seats.filter((x) => x.connected).length} jogadores
    </div>
  );
}

export function ArchiveModal({ code }: { code: string }) {
  const s = useSession();
  const e = dungeon(s.state!.dungeonId).archive[code];
  useEffect(() => {
    audio.play('sting_secret', { volume: 0.9 });
    audio.duck(0.3, 4);
  }, [code]);
  return (
    <div className="story-back">
      <div className="story archive-sheet archive gx-story" role="dialog" aria-label={e.title}>
        <div className="seal">
          <Icon id="sete_linhas" />
        </div>
        <div className="k-kicker">Arquivo oculto · {e.code}</div>
        <h2>{e.title.replace(/^Arquivo Oculto · /, '')}</h2>
        <Prose text={e.text} />
        <button className="k-cta" onClick={() => void session.dispatch({ t: 'closeArchive' })}>
          Continuar
        </button>
      </div>
    </div>
  );
}

function NarrativeModal() {
  const s = useSession();
  const st = s.state!;
  const d = dungeon(st.dungeonId);
  const loc = d.locations.find((l) => l.id === st.node);
  useEffect(() => audio.play('page_turn', { volume: 0.6 }), [st.narrative]);
  return (
    <div className="story-back">
      <div className="story narrative gx-story" role="dialog" aria-label={loc?.name ?? d.name}>
        <div className="story-orn" aria-hidden>
          <Icon id="map_path" />
        </div>
        <div className="k-kicker">{loc ? 'Vocês chegam a' : ''}</div>
        <h2>{loc ? loc.name : d.name}</h2>
        <Prose text={st.narrative ?? ''} />
        <button className="k-cta" autoFocus onClick={() => void session.dispatch({ t: 'closeNarrative' })}>
          Seguir
        </button>
      </div>
    </div>
  );
}

function Epilogue() {
  const s = useSession();
  const e = s.state!.epilogue!;
  useEffect(() => {
    audio.setMusic(null);
    audio.play('sting_victory', { volume: 1 });
  }, []);
  return (
    <div className="story-back">
      <div className="story gx-story epilogue" role="dialog" aria-label={e.title}>
        <div className="k-kicker">Dungeon 1 concluída</div>
        <h2>{e.title.replace('Epílogo · ', '')}</h2>
        <Prose text={e.text} />
        <button className="k-cta" onClick={() => void session.dispatch({ t: 'finishDungeon' })}>
          Retornar à Base
        </button>
      </div>
    </div>
  );
}

function GameOver() {
  const { go } = useApp();
  const s = useSession();
  useEffect(() => {
    audio.setMusic(null);
    audio.play('sting_defeat', { volume: 1 });
  }, []);
  return (
    <div className="story-back">
      <div className="story gx-story gameover" role="dialog" aria-label="Fim da campanha">
        <div className="k-kicker" style={{ color: 'var(--blood-2)' }}>
          Fim da campanha
        </div>
        <h2>O sino continua a soar</h2>
        <Prose text={s.state!.gameOverReason ?? ''} center />
        <div className="k-stack">
          <button
            className="k-cta"
            onClick={() => {
              session.close();
              go('newgame');
            }}
          >
            Nova campanha
          </button>
          <button
            className="k-btn"
            onClick={() => {
              session.close();
              go('title');
            }}
          >
            Menu principal
          </button>
        </div>
      </div>
    </div>
  );
}
