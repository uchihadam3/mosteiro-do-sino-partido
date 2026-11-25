import React, { useEffect, useState } from 'react';
import { dungeon, recordMaxHp, type CampaignState, type ExploreOption } from '@mosteiro/core';
import { useSession } from '../app/hooks';
import { Icon } from './Icon';
import { CLASS_COLOR } from './data';
import { run } from './Inventory';
import { InventoryModal } from './InventoryModal';
import { audio } from '../audio/AudioDirector';
import { useWorldUi, worldActions, worldUi } from '../world/store';
import { useEscape } from './party/Sheet';
import './explore.css';

export function VoteBar({ voteKey }: { voteKey: string }) {
  const s = useSession();
  const v = s.votes[voteKey];
  if (!v || s.onlineSeats().length < 2) return null;
  return (
    <div className="chip gold" style={{ marginRight: 10 }}>
      Pronto: {v.seats.length}/{s.onlineSeats().length}
    </div>
  );
}

const SECRET_IDS = new Set(['go_rel', 'go_cri', 'go_rare']);

function MapPanel({ st }: { st: CampaignState }) {
  const d = dungeon(st.dungeonId);
  const known = d.locations.filter((l) => st.revealed.includes(l.id));
  const edges: [string, string][] = [
    ['POR', 'GAL'],
    ['GAL', 'CLA'],
    ['CLA', 'SCR'],
    ['CLA', 'CAN'],
    ['CAN', 'CAR'],
    ['CLA', 'CAP'],
    ['SCR', 'SAL'],
    ['CAR', 'SAL'],
    ['SAL', 'CAM'],
    ['SCR', 'REL'],
    ['CLA', 'CRI'],
  ];
  const pos = (id: string) => d.locations.find((l) => l.id === id)!.map;
  const here = st.phase === 'combat' && st.combatEncounterId ? d.encounters.find((e) => e.id === st.combatEncounterId)?.locationId : st.node;
  const done = new Set(st.completed.map((e) => d.encounters.find((x) => x.id === e)?.locationId));
  return (
    <div className="map x-map">
      <div className="row map-head" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="kicker">Mapa</span>
        <span className="xs muted">{st.flags['route'] ? `Rota ${st.flags['route'] === 'leste' ? 'Leste' : 'Oeste'}` : 'Rota não escolhida'}</span>
      </div>
      <svg viewBox="0 0 100 100" role="img" aria-label="Mapa do Mosteiro (locais conhecidos)">
        <defs>
          <radialGradient id="mapbg" cx="50%" cy="50%" r="70%">
            <stop offset="0" stopColor="#2a221a" />
            <stop offset="1" stopColor="#120e0c" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" rx="3" fill="url(#mapbg)" />
        {edges
          .filter(([a, b]) => known.some((l) => l.id === a) && known.some((l) => l.id === b))
          .map(([a, b]) => {
            const pa = pos(a);
            const pb = pos(b);
            const walked = st.visited.includes(a) && st.visited.includes(b);
            return <line key={a + b} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={walked ? '#c8a75e' : '#5d574d'} strokeWidth={walked ? 0.9 : 0.5} strokeDasharray={walked ? '' : '1.4 1.2'} />;
          })}
        {known.map((l) => {
          const isHere = l.id === here;
          const visited = st.visited.includes(l.id);
          return (
            <g key={l.id} className="node" transform={`translate(${l.map.x} ${l.map.y})`}>
              {isHere && (
                <circle r="4.6" fill="none" stroke="#e6cf8f" strokeWidth="0.5">
                  <animate attributeName="r" values="3.6;5.2;3.6" dur="2.4s" repeatCount="indefinite" />
                </circle>
              )}
              <circle r="2.6" fill={done.has(l.id) ? '#6d5124' : visited ? '#3a2e22' : '#1d1915'} stroke={isHere ? '#e6cf8f' : l.public ? '#8c6a3f' : '#a58cff'} strokeWidth="0.6" />
              {/* the bottom-most node (Pórtico) is labelled to its side so it never collides with the node above it */}
              <text x={l.map.y > 85 ? 4.2 : 0} y={l.map.y > 85 ? 1.2 : 6.4} textAnchor={l.map.y > 85 ? 'start' : 'middle'}>
                {l.name.replace(/ d[aoe]s? .*/, '').slice(0, 22)}
              </text>
            </g>
          );
        })}
      </svg>
      <StateCards st={st} />
    </div>
  );
}

function StateCards({ st }: { st: CampaignState }) {
  const d = dungeon(st.dungeonId);
  const cards = Object.entries(d.stateCards).filter(([k]) => st.flags[`state:${k}`]);
  const manto = st.heroes.some((h) => h.equipment.armor?.itemId === 'manto_primeiro_caminho' || h.backpack.some((b) => b.itemId === 'manto_primeiro_caminho'));
  if (!cards.length && !manto) return null;
  return (
    <div className="col" style={{ gap: 4, marginTop: 8 }}>
      <div className="kicker" style={{ fontSize: 10 }}>Estados de campanha</div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
        {cards.map(([k, c]) => (
          <span key={k} className="chip gold" title={`${c.text}${c.secretLine ? `\n${c.secretLine}` : ''}`}>
            <Icon id={c.icon} /> {c.name}
          </span>
        ))}
        {manto && (
          <span className="chip" style={{ color: '#e0a8ff' }}>
            <Icon id="item_cloak_epic" /> Manto do Primeiro Caminho
          </span>
        )}
      </div>
    </div>
  );
}

export function PartyStrip({ st, onOpen }: { st: CampaignState; onOpen?(heroId: string): void }) {
  return (
    <div className="x-party">
      {st.heroes.map((h) => {
        const max = recordMaxHp(h);
        const pct = Math.max(0, h.hp / max);
        return (
          <button key={h.id} className={`x-port ${h.status !== 'ok' ? 'down' : ''}`} style={{ ['--acc' as string]: CLASS_COLOR[h.classId], ['--hp' as string]: `${pct * 360}deg` }} onClick={() => onOpen?.(h.id)} aria-label={`${h.name}: ${h.hp} de ${max}. Abrir mochila`}>
            <span className="ring">
              <span className="face">
                <Icon id={`class_${h.classId}`} />
              </span>
            </span>
            <span className="hpnum">{h.status === 'caido' ? 'Caído' : h.status === 'derrotado' ? '✕' : h.hp}</span>
            <span className="nm">{h.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Escape closes this sheet (and never toggles the pause menu underneath). */
function EscClose({ onClose }: { onClose(): void }) {
  useEscape(onClose);
  return null;
}

/** One path as a card (the "Caminhos" sheet and the plain fallback list). */
function ChoiceCard({ o, i, onChoose }: { o: ExploreOption; i: number; onChoose(o: ExploreOption): void }) {
  const s = useSession();
  const v = s.votes[`explore:${o.id}`];
  const secret = SECRET_IDS.has(o.id);
  return (
    <button className={`x-choice ${secret ? 'secret' : ''} ${o.kind === 'combat' ? 'fight' : ''}`} style={{ animationDelay: `${i * 60}ms` }} onMouseEnter={() => audio.play('ui_hover', { volume: 0.35 })} onClick={() => onChoose(o)}>
      <span className="ic">
        <Icon id={o.icon ?? 'map_path'} />
      </span>
      <span className="txt">
        <span className="lbl">{o.label}</span>
        {o.detail && <span className="det">{o.detail}</span>}
      </span>
      {o.warning && <span className="warn">!</span>}
      {v && (
        <span className="votes">
          {v.seats.map((x) => (
            <span key={x} className="vote-dot" title={s.seats.find((y) => y.id === x)?.name} />
          ))}
        </span>
      )}
      <Icon id="map_path" className="go" />
    </button>
  );
}

/** Exploration HUD over the real-time world: where am I, what can I do right here, who is with me. */
export function Explore() {
  const s = useSession();
  const st = s.state!;
  const ui = useWorldUi();
  const d = dungeon(st.dungeonId);
  const loc = d.locations.find((l) => l.id === st.node) ?? d.locations[0];
  const opts = d.options(st);
  const [inv, setInv] = useState<string | null>(null);
  const [map, setMap] = useState(false);
  const [about, setAbout] = useState(false);
  const [paths, setPaths] = useState(false);
  const [localConfirm, setLocalConfirm] = useState<{ optionId: string; label: string; warning: string } | null>(null);
  const confirm = ui.active ? ui.confirm : localConfirm;
  const fallen = st.heroes.filter((h) => h.status === 'caido');
  const arrival = loc.id === 'CLA' && st.completed.length > 1 ? 'O Claustro é o ponto de convergência. Daqui partem as passagens que vocês já conhecem — e talvez outras.' : loc.arrival;
  const sheetOpen = inv !== null || map || about || paths || !!confirm;
  useEffect(() => {
    worldActions.setUiOpen(sheetOpen);
  }, [sheetOpen]);
  useEffect(() => () => worldActions.setUiOpen(false), []);

  const choose = (o: ExploreOption) => {
    setPaths(false);
    if (ui.active) return worldActions.request(o.id, 'list');
    if (o.warning) return setLocalConfirm({ optionId: o.id, label: o.label, warning: o.warning });
    void run({ t: 'explore', optionId: o.id }, 'door_stone');
  };
  const confirmGo = () => {
    if (!confirm) return;
    const id = confirm.optionId;
    setLocalConfirm(null);
    if (ui.active) worldActions.go(id);
    else void run({ t: 'explore', optionId: id }, 'door_stone');
  };
  const cancelConfirm = () => {
    setLocalConfirm(null);
    worldUi.set({ confirm: null });
  };
  // the way forward, as a short tracker under the place name (tap = walk there)
  const mainIds = ui.active && ui.main.length ? ui.main : opts.map((o) => o.id);
  const tracker = opts.filter((o) => mainIds.includes(o.id)).slice(0, 3);
  const prompt = ui.prompt;
  const waiting = ui.waiting ? opts.find((o) => o.id === ui.waiting) : undefined;
  const wVote = ui.waiting ? s.votes[`explore:${ui.waiting}`] : undefined;

  return (
    <div className={`x-screen ${ui.busy ? 'busy' : ''} ${ui.active ? 'world' : 'flat'}`}>
      <div className="x-top">
        <button className="x-place" onClick={() => setAbout(true)} aria-label={`${loc.name}: sobre este lugar`}>
          <span className="name">{loc.name}</span>
        </button>
        <div className="x-top-right">
          <span className="x-gold" title="Ouro da party">
            <Icon id="gold" /> {st.gold}
          </span>
          <button className="k-round x-map-btn" onClick={() => setMap(true)} aria-label="Mapa">
            <Icon id="map_path" />
          </button>
        </div>
      </div>
      {tracker.length > 0 && (
        <div className="x-track" aria-label="Caminho">
          {tracker.map((o, i) => (
            <button key={o.id} className={`x-choice x-obj ${o.kind === 'combat' ? 'fight' : ''} ${SECRET_IDS.has(o.id) ? 'secret' : ''}`} style={{ animationDelay: `${i * 80}ms` }} onClick={() => choose(o)}>
              <span className="dia" aria-hidden />
              <span className="lbl">{o.label}</span>
              {o.warning && <span className="warn">!</span>}
            </button>
          ))}
        </div>
      )}

      {ui.caption && !prompt && (
        <div className="x-caption" key={ui.caption.key} aria-live="polite">
          <p>{ui.caption.text}</p>
        </div>
      )}
      {ui.hint && !ui.caption && !prompt && !ui.busy && !fallen.length && (
        <div className={`x-hint ${ui.hint}`} aria-hidden>
          <span className="x-hint-ic" />
          {ui.hint === 'touch' ? 'Arraste para andar · toque para ir' : 'WASD ou clique para andar'}
        </div>
      )}

      <div className="x-bottom">
        {fallen.length > 0 && !ui.busy && (
          <div className="x-fallen">
            {fallen.map((h) => (
              <button key={h.id} className="k-btn sm" onClick={() => void run({ t: 'raiseOutOfCombat', heroId: h.id }, 'rise_up')}>
                <Icon id="act_heal" /> Levantar {h.name} <span className="k-muted">(+1 Trauma)</span>
              </button>
            ))}
          </div>
        )}
        <div className="x-act-slot">
          {prompt && !ui.busy && (
            <button key={prompt.optionId} className={`x-act ${prompt.fight ? 'fight' : ''} ${prompt.secret ? 'secret' : ''} ${prompt.kind === 'narrative' ? 'lore' : ''}`} onClick={() => worldActions.request(prompt.optionId, 'prompt')}>
              <span className="x-act-ic">
                <Icon id={prompt.fight ? 'act_attack_melee' : prompt.icon} />
              </span>
              <span className="x-act-txt">
                <span className="t">{prompt.text}</span>
                {(prompt.sub || prompt.fight) && <span className="s">{[prompt.fight ? 'Combate' : null, prompt.sub].filter(Boolean).join(' · ')}</span>}
              </span>
              <kbd className="x-key">E</kbd>
            </button>
          )}
          {waiting && !ui.busy && (
            <div className="x-wait">
              Esperando a party · {waiting.label.split(/\s+[—–]\s+/).pop()}
              {wVote ? ` · ${wVote.seats.length}/${s.onlineSeats().length}` : ''}
            </div>
          )}
        </div>
        <div className="x-bar">
          <PartyStrip st={st} onOpen={(id) => setInv(id)} />
          <button className="x-paths-btn" onClick={() => setPaths(true)} aria-label="Caminhos">
            <Icon id="map_path" />
            <span>Caminhos</span>
            {opts.length > 0 && <b>{opts.length}</b>}
          </button>
        </div>
      </div>

      {about && (
        <div className="k-sheet-back" onClick={() => setAbout(false)}>
          <div className="k-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={loc.name}>
            <div className="grab" />
            <EscClose onClose={() => setAbout(false)} />
            <div className="k-kicker">Sobre este lugar</div>
            <div className="k-h1">{loc.name}</div>
            <p className="x-prose">{arrival}</p>
            <div className="k-row k-small k-muted" style={{ gap: 16 }}>
              <span>
                <Icon id="gold" /> {st.gold} ouro
              </span>
              <span>{st.completed.length} encontros vencidos</span>
            </div>
          </div>
        </div>
      )}
      {map && (
        <div className="k-sheet-back" onClick={() => setMap(false)}>
          <div className="k-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Mapa">
            <div className="grab" />
            <EscClose onClose={() => setMap(false)} />
            <MapPanel st={st} />
          </div>
        </div>
      )}
      {paths && (
        <div className="k-sheet-back" onClick={() => setPaths(false)}>
          <div className="k-sheet x-paths-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Caminhos">
            <div className="grab" />
            <EscClose onClose={() => setPaths(false)} />
            <div className="k-kicker">{loc.name}</div>
            <div className="k-h1">Caminhos</div>
            <div className="x-choices">
              {opts.map((o, i) => (
                <ChoiceCard key={o.id} o={o} i={i} onChoose={choose} />
              ))}
              {!opts.length && <p className="x-prose k-muted">Nenhum caminho aberto daqui.</p>}
            </div>
          </div>
        </div>
      )}
      {confirm && (
        <div className="k-sheet-back" onClick={cancelConfirm}>
          <div className="k-sheet" role="alertdialog" aria-label={confirm.label} onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <EscClose onClose={cancelConfirm} />
            <div className="k-kicker" style={{ color: 'var(--warn)' }}>
              Sem volta
            </div>
            <div className="k-h1">{confirm.label}</div>
            <p className="x-prose" style={{ color: 'var(--warn)' }}>
              {confirm.warning}
            </p>
            <div className="k-stack">
              <button className="k-cta" onClick={confirmGo}>
                Seguir em frente
              </button>
              <button className="k-btn" autoFocus onClick={cancelConfirm}>
                Ainda não
              </button>
            </div>
          </div>
        </div>
      )}
      {inv !== null && <InventoryModal heroId={inv || undefined} onClose={() => setInv(null)} />}
    </div>
  );
}
