import React, { useState } from 'react';
import { newCampaign, reg, type ClassDef } from '@mosteiro/core';
import { useApp } from '../app/App';
import { Icon } from './Icon';
import { session } from '../state/session';
import { ATTR_NAME, ATTR_ORDER, CLASS_COLOR, CLASS_IDS } from './data';
import { audio } from '../audio/AudioDirector';
import { toast } from './Toasts';

export interface PartyEntry {
  classId: string;
  name: string;
  seat: string;
}
const DEFAULT_NAMES: Record<string, string[]> = {
  guerreiro: ['Bertrand', 'Ilsa', 'Goran'],
  paladino: ['Aurélia', 'Teodoro', 'Mirela'],
  arcanista: ['Severa', 'Orlan', 'Ivo'],
  clerigo: ['Irmã Clara', 'Benedito', 'Ágata'],
  arqueiro: ['Leda', 'Rui', 'Tamsin'],
  ladino: ['Corvo', 'Nina', 'Silas'],
};
export function defaultName(classId: string, party: PartyEntry[]) {
  const used = new Set(party.map((p) => p.name));
  return DEFAULT_NAMES[classId].find((n) => !used.has(n)) ?? reg().classes[classId].name;
}

export function NewGame() {
  const { go } = useApp();
  const [party, setParty] = useState<PartyEntry[]>([]);
  const [focus, setFocus] = useState('guerreiro');
  const [players, setPlayers] = useState<string[]>(['Jogador 1']);
  const add = (classId: string) => {
    setFocus(classId);
    if (party.length >= 5) return toast('A party tem no máximo 5 heróis.', 'error');
    audio.play('ui_equip', { volume: 0.6 });
    setParty([...party, { classId, name: defaultName(classId, party), seat: 'p0' }]);
  };
  const start = () => {
    const seats = players.map((name, i) => ({ id: `p${i}`, name }));
    const s = newCampaign({ seed: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, dungeonId: 'd1', heroes: party.map((p) => ({ classId: p.classId, name: p.name, seat: p.seat })), seats, now: Date.now() });
    session.startLocal(s);
    go('game');
  };
  return (
    <div className="overlay screen-fade">
      <div className="frame ng">
        <div className="screen-head">
          <button className="btn icon" onClick={() => go('title')} aria-label="Voltar">
            <Icon id="back" />
          </button>
          <div className="grow">
            <div className="kicker">Novo Jogo · Modo Básico</div>
            <h2 className="h2">Forme a party</h2>
          </div>
          <div className="row small muted">
            <span>Jogadores neste dispositivo:</span>
            <div className="seg" style={{ width: 160 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={players.length === n ? 'on' : ''} onClick={() => setPlayers(Array.from({ length: n }, (_, i) => players[i] ?? `Jogador ${i + 1}`))}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="ng-body">
          <div className="col" style={{ minHeight: 0 }}>
            <div className="class-grid">
              {CLASS_IDS.map((id) => {
                const c = reg().classes[id];
                const n = party.filter((p) => p.classId === id).length;
                return (
                  <button key={id} className={`class-card ${focus === id ? 'sel' : ''}`} style={{ ['--acc' as string]: CLASS_COLOR[id] }} onClick={() => add(id)} onMouseEnter={() => setFocus(id)} onFocus={() => setFocus(id)}>
                    {n > 0 && <span className="count">×{n}</span>}
                    <Icon id={`class_${id}`} className="emblem" />
                    <div className="name">{c.name}</div>
                    <div className="ep">{c.epithet}</div>
                    <div className="stats">
                      <span className="chip red">
                        <Icon id="hp" /> {c.hp}
                      </span>
                      <span className="chip">
                        <Icon id="armor" /> {c.armor}
                      </span>
                      <span className="chip gold">{c.resourceName}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="party-slots">
              {Array.from({ length: 5 }).map((_, i) => {
                const p = party[i];
                if (!p)
                  return (
                    <div key={i} className="party-slot muted small">
                      {i === 0 ? 'Clique numa classe para recrutar' : 'Vaga livre'}
                    </div>
                  );
                return (
                  <div key={i} className="party-slot filled" style={{ ['--acc' as string]: CLASS_COLOR[p.classId] }}>
                    <Icon id={`class_${p.classId}`} size={22} style={{ color: CLASS_COLOR[p.classId] }} />
                    <div className="grow col" style={{ gap: 3 }}>
                      <input value={p.name} maxLength={18} aria-label="Nome do herói" onChange={(e) => setParty(party.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      {players.length > 1 && (
                        <select value={p.seat} onChange={(e) => setParty(party.map((x, j) => (j === i ? { ...x, seat: e.target.value } : x)))} aria-label="Jogador">
                          {players.map((pl, k) => (
                            <option key={k} value={`p${k}`}>
                              {pl}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <button className="btn icon sm ghost" aria-label="Remover" onClick={() => setParty(party.filter((_, j) => j !== i))}>
                      <Icon id="close" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <ClassDetail c={reg().classes[focus]} />
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="small muted">
            {party.length === 1 ? 'True solo: o herói recebe 2 fichas de Último Fôlego e Mochila de 7 espaços.' : party.length ? `${party.length} heróis · Mochila de ${party.length === 2 ? 5 : 4} espaços cada.` : 'De 1 a 5 heróis. A escala de inimigos e de recompensas segue o tamanho da party.'}
          </div>
          <button className="btn primary" disabled={!party.length} onClick={start}>
            Preparar a expedição <Icon id="map_path" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClassDetail({ c, compact }: { c: ClassDef; compact?: boolean }) {
  return (
    <div className="detail panel ornate" style={{ ['--acc' as string]: CLASS_COLOR[c.id] }}>
      <div className="row">
        <Icon id={`class_${c.id}`} size={44} style={{ color: CLASS_COLOR[c.id] }} />
        <div className="grow">
          <div className="h3">{c.name}</div>
          <div className="small muted">{c.description}</div>
        </div>
      </div>
      <div className="attr-grid">
        {ATTR_ORDER.map((a) => (
          <div key={a} className="attr">
            <Icon id={`attr_${a}`} />
            <div className="meter">
              <i style={{ width: `${(c.attrs[a] / 12) * 100}%` }} />
            </div>
            <span className="die">D{c.attrs[a]}</span>
            <span className="xs muted" style={{ gridColumn: '2 / 4', marginTop: -2 }}>{ATTR_NAME[a]}</span>
          </div>
        ))}
      </div>
      {!compact && (
        <div className="scroll-y" style={{ flex: 1 }}>
          {c.passives.map((p) => (
            <div key={p.name} className="tech">
              <b>{p.name}</b>
              <span />
              <p>{p.text}</p>
            </div>
          ))}
          {c.actions.filter((a) => !a.hidden?.({} as never, {} as never)).map((a) => (
            <div key={a.id} className="tech">
              <b>{a.name}</b>
              <span className="ap">{a.ap ? `${a.ap} AP` : 'Grátis'}</span>
              <p>{a.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
