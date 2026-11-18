import React, { useState } from 'react';
import { newCampaign, reg } from '@mosteiro/core';
import { useApp } from '../app/App';
import { useSession, useSettings } from '../app/hooks';
import { session } from '../state/session';
import { setSettings } from '../state/settings';
import { hostPeer, joinPeer, makeRoomCode, relay, type Transport } from '../net/transport';
import { Icon } from './Icon';
import { CLASS_COLOR, CLASS_IDS } from './data';
import { toast } from './Toasts';
import { defaultName } from './NewGame';

export function OnlineLobby() {
  const { go } = useApp();
  const s = useSession();
  const settings = useSettings();
  const [code, setCode] = useState('');
  const [relayUrl, setRelayUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const connected = !!s.transport;

  const create = async () => {
    setBusy(true);
    try {
      const room = makeRoomCode();
      const t: Transport = relayUrl ? await relay(relayUrl, room, 'host') : await hostPeer(room);
      session.attachHost(t, settings.playerName);
      session.lobby = { started: false, heroes: [], seed: `${Date.now()}-${room}` };
      session.updateLobby({}, 'host');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const join = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      let seat: string | undefined;
      try {
        seat = sessionStorage.getItem('mosteiro.seat') ?? undefined;
      } catch {
        /* ignore */
      }
      const t: Transport = relayUrl ? await relay(relayUrl, code.trim().toUpperCase(), 'client', seat) : await joinPeer(code.trim().toUpperCase(), seat);
      session.attachClient(t, settings.playerName, seat);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const lobby = s.lobby;
  const mySeat = s.localSeat;
  const isHost = s.role === 'host';
  const addHero = (classId: string) => {
    if (lobby.heroes.length >= 5) return toast('Máximo de 5 heróis na party.', 'error');
    const heroes = [...lobby.heroes, { classId, name: defaultName(classId, lobby.heroes.map((h) => ({ ...h }))), seat: isHost ? 'host' : mySeat }];
    if (isHost) session.updateLobby({ heroes }, 'host');
    else void session.dispatch({ t: 'lobbyUpdate', lobby: { heroes } });
  };
  const setHeroes = (heroes: typeof lobby.heroes) => {
    if (isHost) session.updateLobby({ heroes }, 'host');
    else void session.dispatch({ t: 'lobbyUpdate', lobby: { heroes } });
  };
  const start = () => {
    const seats = s.seats.filter((x) => x.connected).map((x) => ({ id: x.id, name: x.name }));
    const heroes = lobby.heroes.map((h) => ({ ...h, seat: seats.some((x) => x.id === h.seat) ? h.seat : 'host' }));
    const st = newCampaign({ seed: lobby.seed, dungeonId: 'd1', heroes, seats, now: Date.now() });
    session.startHostedGame(st);
    go('game');
  };

  return (
    <div className="overlay screen-fade">
      <div className="frame" style={{ gridTemplateRows: 'auto 1fr' }}>
        <div className="screen-head">
          <button className="btn icon" onClick={() => { session.close(); go('title'); }} aria-label="Voltar">
            <Icon id="back" />
          </button>
          <div className="grow">
            <div className="kicker">Cooperativo online</div>
            <h2 className="h2">Jogar com amigos</h2>
          </div>
        </div>
        {!connected ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, alignContent: 'start', maxWidth: 980, width: '100%', justifySelf: 'center' }}>
            <div className="panel ornate col" style={{ padding: 20 }}>
              <div className="h3">Seu nome</div>
              <input className="text-in" value={settings.playerName} maxLength={18} onChange={(e) => setSettings({ playerName: e.target.value })} />
              <div className="small muted">Cada jogador controla os heróis que escolher. A party tem até 5 heróis: dois jogadores podem dividir 3+2, 4+1, três jogadores 2+2+1 e assim por diante.</div>
            </div>
            <div className="panel ornate col" style={{ padding: 20 }}>
              <div className="h3">Criar sala</div>
              <div className="small muted">Você é o anfitrião: as regras rodam no seu aparelho e o progresso fica salvo aqui.</div>
              <button className="btn primary" disabled={busy} onClick={create}>
                Criar sala
              </button>
            </div>
            <div className="panel ornate col" style={{ padding: 20 }}>
              <div className="h3">Entrar numa sala</div>
              <input className="text-in code" placeholder="CÓDIGO" value={code} maxLength={8} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              <button className="btn primary" disabled={busy || !code} onClick={join}>
                Entrar
              </button>
            </div>
            <details className="panel" style={{ padding: '12px 20px', gridColumn: '1 / -1' }}>
              <summary className="small muted" style={{ cursor: 'pointer' }}>Avançado: servidor de retransmissão próprio</summary>
              <div className="small muted" style={{ margin: '8px 0' }}>Por padrão a conexão é direta entre os aparelhos (WebRTC). Se a rede bloquear, rode <code>node apps/server/relay.mjs</code> e informe o endereço.</div>
              <input className="text-in" placeholder="ws://192.168.0.10:8787" value={relayUrl} onChange={(e) => setRelayUrl(e.target.value)} />
            </details>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 14, minHeight: 0 }}>
            <div className="panel ornate col" style={{ padding: 18 }}>
              <div className="kicker">Código da sala</div>
              <div className="display" style={{ fontSize: 'var(--fs-xxl)', letterSpacing: '0.25em', color: 'var(--gold-2)' }}>{s.transport?.room}</div>
              <div className="xs muted">Compartilhe o código. Quem entrar aparece abaixo.</div>
              <div className="divider" />
              <div className="kicker">Jogadores</div>
              {s.seats.map((x) => (
                <div key={x.id} className="row small">
                  <span className={`chip ${x.connected ? 'green' : 'red'}`}>{x.isHost ? 'Anfitrião' : x.connected ? 'Conectado' : 'Saiu'}</span>
                  <span className="grow">{x.name}{x.id === mySeat ? ' (você)' : ''}</span>
                  <span className="xs muted">{lobby.heroes.filter((h) => h.seat === x.id).length} herói(s)</span>
                </div>
              ))}
            </div>
            <div className="panel col" style={{ padding: 18, minHeight: 0 }}>
              <div className="kicker">Recrute seus heróis</div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                {CLASS_IDS.map((id) => (
                  <button key={id} className="btn sm" style={{ borderColor: CLASS_COLOR[id] }} onClick={() => addHero(id)}>
                    <Icon id={`class_${id}`} style={{ color: CLASS_COLOR[id] }} /> {reg().classes[id].name}
                  </button>
                ))}
              </div>
              <div className="divider" />
              <div className="kicker">Party ({lobby.heroes.length}/5)</div>
              <div className="col" style={{ gap: 6 }}>
                {lobby.heroes.map((h, i) => {
                  const mine = h.seat === mySeat || isHost;
                  return (
                    <div key={i} className="row small slot" style={{ cursor: 'default' }}>
                      <Icon id={`class_${h.classId}`} style={{ color: CLASS_COLOR[h.classId] }} />
                      <span className="grow">
                        {h.name} <span className="muted">· {reg().classes[h.classId].name}</span>
                      </span>
                      {isHost ? (
                        <select value={h.seat} onChange={(e) => setHeroes(lobby.heroes.map((x, j) => (j === i ? { ...x, seat: e.target.value } : x)))}>
                          {s.seats.filter((x) => x.connected).map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="chip">{s.seats.find((x) => x.id === h.seat)?.name}</span>
                      )}
                      {mine && (
                        <button className="btn icon sm ghost" onClick={() => setHeroes(lobby.heroes.filter((_, j) => j !== i))}>
                          <Icon id="close" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="grow" />
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                {isHost ? (
                  <button className="btn primary" disabled={!lobby.heroes.length} onClick={start}>
                    Iniciar campanha
                  </button>
                ) : (
                  <span className="small muted">Aguardando o anfitrião iniciar…</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
