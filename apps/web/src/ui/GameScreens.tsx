import React, { useEffect, useState } from 'react';
import { dungeon } from '@mosteiro/core';
import { useSession } from '../app/hooks';
import { useApp } from '../app/App';
import { Prep } from './Prep';
import { Explore } from './Explore';
import { CombatHUD } from './combat/CombatHUD';
import { Reward } from './Reward';
import { Base } from './Base';
import { Icon } from './Icon';
import { PauseMenu } from './Pause';
import { session } from '../state/session';
import { audio } from '../audio/AudioDirector';

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
      {st.phase === 'combat' && st.combat && <CombatHUD />}
      {st.phase === 'reward' && <Reward />}
      {(st.phase === 'base' || st.phase === 'complete') && <Base />}
      {st.phase === 'epilogue' && st.epilogue && <Epilogue />}
      {st.phase === 'gameover' && <GameOver />}
      {st.pendingArchive && d.archive[st.pendingArchive] && <ArchiveModal code={st.pendingArchive} />}
      {st.narrative && !st.pendingArchive && st.phase === 'explore' && <NarrativeModal />}
      {st.phase !== 'combat' && (
        <button className="btn icon pause-btn" style={{ position: 'fixed', right: 'calc(16px + var(--safe-r))', top: 'calc(14px + var(--safe-t))', zIndex: 40 }} onClick={() => setPause(true)} aria-label="Menu">
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
    <div className="panel xs" style={{ position: 'fixed', right: 'calc(70px + var(--safe-r))', top: 'calc(18px + var(--safe-t))', padding: '6px 10px', zIndex: 39, display: 'flex', gap: 8, alignItems: 'center' }}>
      <span className="kicker" style={{ fontSize: 10 }}>{s.role === 'host' ? 'Anfitrião' : 'Online'}</span>
      {s.seats.map((x) => (
        <span key={x.id} className={`chip ${x.connected ? 'green' : 'red'}`} title={x.connected ? 'Conectado' : 'Desconectado'}>
          {x.name}
        </span>
      ))}
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
    <div className="modal-back">
      <div className="archive" role="dialog" aria-label={e.title}>
        <div className="seal">
          <Icon id="sete_linhas" size={34} />
        </div>
        <div className="code">ARQUIVO OCULTO · {e.code}</div>
        <h2>{e.title.replace(/^Arquivo Oculto · /, '')}</h2>
        <p>{e.text}</p>
        <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn primary" onClick={() => void session.dispatch({ t: 'closeArchive' })}>
            Continuar
          </button>
        </div>
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
    <div className="modal-back" style={{ background: 'radial-gradient(ellipse at center, rgba(10,8,8,0.25), rgba(5,4,4,0.7))' }}>
      <div className="narrative panel ornate">
        <div className="kicker">{loc ? `${loc.code} · ${loc.name}` : d.name}</div>
        <p>{st.narrative}</p>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn primary" autoFocus onClick={() => void session.dispatch({ t: 'closeNarrative' })}>
            Seguir
          </button>
        </div>
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
    <div className="modal-back">
      <div className="narrative panel ornate" style={{ textAlign: 'center' }}>
        <div className="kicker">Dungeon 1 concluída</div>
        <h2 className="h1" style={{ fontSize: 'var(--fs-xl)', margin: '10px 0' }}>{e.title.replace('Epílogo · ', '')}</h2>
        <p style={{ whiteSpace: 'pre-wrap' }}>{e.text}</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 22 }}>
          <button className="btn primary" onClick={() => void session.dispatch({ t: 'finishDungeon' })}>
            Retornar à Base
          </button>
        </div>
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
    <div className="modal-back">
      <div className="narrative panel ornate" style={{ textAlign: 'center' }}>
        <div className="kicker" style={{ color: 'var(--blood-2)' }}>Game Over da campanha</div>
        <h2 className="h1" style={{ fontSize: 'var(--fs-xl)', margin: '10px 0' }}>O sino continua a soar</h2>
        <p>{s.state!.gameOverReason}</p>
        <p className="small muted">Todos os heróis caíram ao mesmo tempo. Na V2, o wipe total é a punição máxima da campanha.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 22 }}>
          <button className="btn" onClick={() => { session.close(); go('title'); }}>
            Menu principal
          </button>
          <button className="btn primary" onClick={() => { session.close(); go('newgame'); }}>
            Nova campanha
          </button>
        </div>
      </div>
    </div>
  );
}
