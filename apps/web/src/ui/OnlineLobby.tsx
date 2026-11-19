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
import './menus.css';

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
  const room = s.transport?.room ?? '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room);
      toast('Código copiado.');
    } catch {
      toast(`Código: ${room}`);
    }
  };
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const share = () => void navigator.share?.({ title: 'Mosteiro do Sino Partido', text: `Entre na minha sala: ${room}` }).catch(() => undefined);

  return (
    <div className="k-screen solid m-lobby">
      <div className="k-head">
        <button className="k-round" onClick={() => { session.close(); go('title'); }} aria-label="Voltar">
          <Icon id="back" />
        </button>
        <div className="k-title">
          <div className="k-kicker">Cooperativo online</div>
          <h1 className="k-h1">{connected ? 'Sala de espera' : 'Jogar com amigos'}</h1>
        </div>
      </div>

      {!connected ? (
        <>
          <div className="k-body">
            <div className="m-pre k-stack" style={{ gap: 12 }}>
              <div className="panel m-namecard">
                <span className="k-emblem" style={{ '--acc': 'var(--gold-2)' } as React.CSSProperties}>
                  <span className="display" style={{ fontSize: 22, fontWeight: 700 }}>{(settings.playerName || '?').slice(0, 1).toUpperCase()}</span>
                </span>
                <label className="grow" style={{ minWidth: 0 }}>
                  <div className="lbl">Seu nome</div>
                  <input className="k-input" value={settings.playerName} maxLength={18} onChange={(e) => setSettings({ playerName: e.target.value })} />
                </label>
              </div>

              <button className="m-choice host" disabled={busy} onClick={create}>
                <span className="k-emblem lg">
                  <Icon id="class_paladino" />
                </span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <div className="t">Criar sala</div>
                  <div className="d">Você é o anfitrião e convida os amigos.</div>
                </span>
              </button>

              <div className="m-or">ou</div>

              <div className="m-join">
                <div className="top">
                  <span className="k-emblem lg">
                    <Icon id="map_path" />
                  </span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="t">Entrar numa sala</div>
                    <div className="d">Digite o código do anfitrião.</div>
                  </div>
                </div>
                <div className="go">
                  <input className="k-input" placeholder="CÓDIGO" value={code} maxLength={8} autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && void join()} />
                  <button className="k-btn" disabled={busy || !code} onClick={join}>
                    Entrar
                  </button>
                </div>
              </div>

              <details className="m-adv">
                <summary>
                  <Icon id="settings" /> Avançado
                </summary>
                <p>Por padrão a conexão é direta (WebRTC). Se a rede bloquear, use um servidor de retransmissão:</p>
                <input className="k-input" placeholder="ws://192.168.0.10:8787" value={relayUrl} onChange={(e) => setRelayUrl(e.target.value)} />
              </details>

              <div className="m-hint">Até 5 heróis na party, divididos entre os jogadores.</div>
            </div>
          </div>
          <div />
        </>
      ) : (
        <>
          <div className="k-body">
            <div className="m-lobby-grid on">
              <div className="k-stack" style={{ gap: 12 }}>
                <div className="m-room">
                  <div className="grow">
                    <div className="k-kicker">Código da sala</div>
                    <div className="display">{room}</div>
                  </div>
                  <div className="acts">
                    <button className="k-btn sm" onClick={() => void copy()}>
                      Copiar
                    </button>
                    {canShare && (
                      <button className="k-btn sm" onClick={share}>
                        Enviar
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="k-section" style={{ marginTop: 4 }}>Jogadores</div>
                  <div className="m-players">
                    {s.seats.map((x) => {
                      const n = lobby.heroes.filter((h) => h.seat === x.id).length;
                      return (
                        <div key={x.id} className={`m-player ${x.connected ? '' : 'off'}`}>
                          <span className="av" aria-hidden>{x.name.slice(0, 1).toUpperCase()}</span>
                          <span>
                            <div>{x.name}</div>
                            <div className="meta">
                              {x.isHost ? 'Anfitrião' : x.connected ? 'Conectado' : 'Saiu'}
                              {x.id === mySeat ? ' · você' : ''} · {n} herói{n === 1 ? '' : 's'}
                            </div>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <div className="k-section" style={{ marginTop: 4 }}>Recrute seus heróis</div>
                <div className="m-classes">
                  {CLASS_IDS.map((id) => {
                    const mineCount = lobby.heroes.filter((h) => h.classId === id).length;
                    return (
                      <button key={id} className="btn sm m-class" style={{ '--acc': CLASS_COLOR[id] } as React.CSSProperties} disabled={lobby.heroes.length >= 5} onClick={() => addHero(id)}>
                        <span className="k-emblem">
                          <Icon id={`class_${id}`} />
                        </span>
                        {reg().classes[id].name}
                        {mineCount > 0 && <span className="m-badge">{mineCount}</span>}
                      </button>
                    );
                  })}
                </div>

                <div className="k-section">Party ({lobby.heroes.length}/5)</div>
                <div className="m-party">
                  {lobby.heroes.length === 0 && <div className="m-empty">Toque numa classe para recrutar.</div>}
                  {lobby.heroes.map((h, i) => {
                    const mine = h.seat === mySeat || isHost;
                    return (
                      <div key={i} className="m-hero-row" style={{ '--acc': CLASS_COLOR[h.classId] } as React.CSSProperties}>
                        <span className="k-emblem">
                          <Icon id={`class_${h.classId}`} />
                        </span>
                        <div className="grow" style={{ minWidth: 0, flex: 1 }}>
                          <div className="nm">{h.name}</div>
                          <div className="cl">{reg().classes[h.classId].name}</div>
                        </div>
                        {isHost ? (
                          <select aria-label={`Jogador de ${h.name}`} value={h.seat} onChange={(e) => setHeroes(lobby.heroes.map((x, j) => (j === i ? { ...x, seat: e.target.value } : x)))}>
                            {s.seats.filter((x) => x.connected).map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="k-chip">{s.seats.find((x) => x.id === h.seat)?.name}</span>
                        )}
                        {mine && (
                          <button className="k-round" style={{ width: 40, height: 40 }} aria-label={`Remover ${h.name}`} onClick={() => setHeroes(lobby.heroes.filter((_, j) => j !== i))}>
                            <Icon id="close" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <div className="k-foot">
            {isHost ? (
              <button className="k-cta" disabled={!lobby.heroes.length} onClick={start}>
                Iniciar campanha
              </button>
            ) : (
              <div className="m-wait">
                <i /> Aguardando o anfitrião iniciar…
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
