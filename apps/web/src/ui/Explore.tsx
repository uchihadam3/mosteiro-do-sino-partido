import React, { useState } from 'react';
import { dungeon, recordMaxHp, type CampaignState } from '@mosteiro/core';
import { useSession } from '../app/hooks';
import { Icon } from './Icon';
import { CLASS_COLOR } from './data';
import { run } from './Inventory';
import { InventoryModal } from './InventoryModal';
import { audio } from '../audio/AudioDirector';

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
    <div className="map panel ornate">
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
              {isHere && <circle r="4.6" fill="none" stroke="#e6cf8f" strokeWidth="0.5"><animate attributeName="r" values="3.6;5.2;3.6" dur="2.4s" repeatCount="indefinite" /></circle>}
              <circle r="2.6" fill={done.has(l.id) ? '#6d5124' : visited ? '#3a2e22' : '#1d1915'} stroke={isHere ? '#e6cf8f' : l.public ? '#8c6a3f' : '#a58cff'} strokeWidth="0.6" />
              {/* the bottom-most node (Pórtico) is labelled to its side so it never collides with the node above it */}
              <text x={l.map.y > 85 ? 4.2 : 0} y={l.map.y > 85 ? 1.2 : 6.4} textAnchor={l.map.y > 85 ? 'start' : 'middle'}>
                {l.name.replace(/ d[aoe]s? .*/, '').replace('Relicário', 'Relicário').slice(0, 22)}
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

export function PartyStrip({ st, onOpen }: { st: CampaignState; onOpen?(): void }) {
  return (
    <div className="party-strip">
      {st.heroes.map((h) => {
        const max = recordMaxHp(h);
        return (
          <button key={h.id} className="mini-hero" style={{ ['--acc' as string]: CLASS_COLOR[h.classId], cursor: onOpen ? 'pointer' : 'default', opacity: h.status === 'ok' ? 1 : 0.55 }} onClick={onOpen}>
            <Icon id={`class_${h.classId}`} />
            <div className="nm">{h.name}</div>
            <div className="row" style={{ gap: 6 }}>
              <div className="bar grow" style={{ height: 6 }}>
                <i style={{ width: `${(h.hp / max) * 100}%` }} />
              </div>
              <span className="xs">
                {h.status === 'caido' ? 'Caído' : h.status === 'derrotado' ? 'Derrotado' : `${h.hp}/${max}`}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function Explore() {
  const s = useSession();
  const st = s.state!;
  const d = dungeon(st.dungeonId);
  const loc = d.locations.find((l) => l.id === st.node) ?? d.locations[0];
  const opts = d.options(st);
  const [inv, setInv] = useState(false);
  const [confirmOpt, setConfirmOpt] = useState<{ id: string; label: string; warning: string } | null>(null);
  const fallen = st.heroes.filter((h) => h.status === 'caido');
  return (
    <div className="overlay screen-fade">
      <div className="frame explore">
        <div className="loc-card panel ornate">
          <div className="code">{loc.code}</div>
          <h2 className="h2" style={{ margin: '4px 0 8px' }}>{loc.name}</h2>
          <div className="prose">{loc.id === 'CLA' && st.completed.length > 1 ? 'O Claustro é o ponto de convergência. Daqui partem as passagens que vocês já conhecem — e talvez outras.' : loc.arrival}</div>
          <div className="divider" />
          <div className="row small muted" style={{ gap: 14 }}>
            <span className="row" style={{ gap: 4 }}>
              <Icon id="gold" style={{ color: 'var(--gold-2)' }} /> {st.gold} ouro
            </span>
            <span className="row" style={{ gap: 4 }}>
              <Icon id="loc_campanario" /> {st.completed.length} encontros vencidos
            </span>
          </div>
        </div>
        <MapPanel st={st} />
        <div className="choices" style={{ flexDirection: 'column', alignItems: 'center' }}>
          {fallen.length > 0 && (
            <div className="panel row small" style={{ padding: '8px 12px' }}>
              <span>{fallen.map((h) => h.name).join(', ')} {fallen.length > 1 ? 'estão Caídos' : 'está Caído'}.</span>
              {fallen.map((h) => (
                <button key={h.id} className="btn sm" onClick={() => void run({ t: 'raiseOutOfCombat', heroId: h.id }, 'rise_up')}>
                  Levantar {h.name} (+1 Trauma)
                </button>
              ))}
            </div>
          )}
          <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center', gap: 10, width: '100%' }}>
            {opts.map((o, i) => {
              const v = s.votes[`explore:${o.id}`];
              const secret = o.id === 'go_rel' || o.id === 'go_cri' || o.id === 'go_rare';
              return (
                <button
                  key={o.id}
                  className={`choice ${secret ? 'secret' : ''}`}
                  style={{ animationDelay: `${i * 60}ms` }}
                  onMouseEnter={() => audio.play('ui_hover', { volume: 0.35 })}
                  onClick={() => {
                    if (o.warning) return setConfirmOpt({ id: o.id, label: o.label, warning: o.warning });
                    void run({ t: 'explore', optionId: o.id }, 'door_stone');
                  }}
                >
                  <Icon id={o.icon ?? 'map_path'} />
                  <div className="grow">
                    <div className="lbl">{o.label}</div>
                    {o.detail && <div className="det">{o.detail}</div>}
                    {o.warning && <div className="det" style={{ color: 'var(--warn)' }}>{o.warning}</div>}
                  </div>
                  {v && (
                    <div className="votes">
                      {v.seats.map((x) => (
                        <span key={x} className="vote-dot" title={s.seats.find((y) => y.id === x)?.name} />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <PartyStrip st={st} onOpen={() => setInv(true)} />
        </div>
        {confirmOpt && (
          <div className="modal-back" onClick={() => setConfirmOpt(null)}>
            <div className="modal panel ornate" role="alertdialog" aria-label={confirmOpt.label} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
              <div className="kicker">Sem volta</div>
              <h2 className="h2">{confirmOpt.label}</h2>
              <div className="divider" />
              <p className="small" style={{ color: 'var(--warn)' }}>{confirmOpt.warning}</p>
              <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn" autoFocus onClick={() => setConfirmOpt(null)}>
                  Ainda não
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    const id = confirmOpt.id;
                    setConfirmOpt(null);
                    void run({ t: 'explore', optionId: id }, 'door_stone');
                  }}
                >
                  Seguir em frente
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {inv && <InventoryModal onClose={() => setInv(false)} />}
    </div>
  );
}
