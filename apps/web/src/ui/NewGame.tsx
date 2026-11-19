import React, { useRef, useState } from 'react';
import { newCampaign, reg, type ClassDef } from '@mosteiro/core';
import { useApp } from '../app/App';
import { Icon } from './Icon';
import { session } from '../state/session';
import { ATTR_NAME, ATTR_ORDER, CLASS_COLOR, CLASS_IDS } from './data';
import { audio } from '../audio/AudioDirector';
import { toast } from './Toasts';
import { Sheet } from './party/Sheet';
import './party.css';

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

type NgSheet = { k: 'class'; id: string } | { k: 'hero'; i: number } | { k: 'players' } | null;
const MAX = 5;

export function NewGame() {
  const { go } = useApp();
  const [party, setParty] = useState<PartyEntry[]>([]);
  const [players, setPlayers] = useState<string[]>(['Jogador 1']);
  const [sheet, setSheet] = useState<NgSheet>(null);
  const [pop, setPop] = useState<string | null>(null);
  const hold = useRef<{ t: number | null; fired: boolean }>({ t: null, fired: false });

  const add = (classId: string) => {
    if (party.length >= MAX) return toast('A party tem no máximo 5 heróis.', 'error');
    audio.play('ui_equip', { volume: 0.6 });
    setParty([...party, { classId, name: defaultName(classId, party), seat: 'p0' }]);
    setPop(`${classId}:${party.length}`);
  };
  const setPlayerCount = (n: number) => {
    setPlayers(Array.from({ length: n }, (_, i) => players[i] ?? `Jogador ${i + 1}`));
    // heroes owned by a seat that no longer exists go back to player 1
    setParty(party.map((p) => (Number(p.seat.slice(1)) >= n ? { ...p, seat: 'p0' } : p)));
  };
  const patch = (i: number, v: Partial<PartyEntry>) => setParty(party.map((x, j) => (j === i ? { ...x, ...v } : x)));
  const remove = (i: number) => {
    audio.play('ui_click', { volume: 0.5 });
    setParty(party.filter((_, j) => j !== i));
  };
  const start = () => {
    const seats = players.map((name, i) => ({ id: `p${i}`, name }));
    const s = newCampaign({ seed: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, dungeonId: 'd1', heroes: party.map((p) => ({ classId: p.classId, name: p.name, seat: p.seat })), seats, now: Date.now() });
    session.startLocal(s);
    go('game');
  };

  // press-and-hold on a class card opens its details instead of recruiting
  const holdStart = (id: string) => {
    hold.current.fired = false;
    if (hold.current.t) window.clearTimeout(hold.current.t);
    hold.current.t = window.setTimeout(() => {
      hold.current.fired = true;
      setSheet({ k: 'class', id });
    }, 480);
  };
  const holdEnd = () => {
    if (hold.current.t) window.clearTimeout(hold.current.t);
    hold.current.t = null;
  };

  const note = party.length === 1 ? 'Herói solo: 2 Últimos Fôlegos e Mochila de 7.' : party.length ? `${party.length} heróis · Mochila de ${party.length === 2 ? 5 : 4} espaços cada.` : 'Toque nas classes para recrutar de 1 a 5 heróis.';
  const multi = players.length > 1;

  return (
    <div className="k-screen pt-ng">
      <div className="k-head">
        <button className="k-round" onClick={() => go('title')} aria-label="Voltar">
          <Icon id="back" />
        </button>
        <div className="k-title">
          <div className="k-kicker">Novo jogo</div>
          <h1 className="k-h1">Forme a party</h1>
        </div>
        <button className="pt-players" onClick={() => setSheet({ k: 'players' })} aria-label={`Jogadores neste dispositivo: ${players.length}`}>
          <span className="n">{players.length}</span>
          <span className="l">{multi ? 'jogadores' : 'jogador'}</span>
        </button>
      </div>

      <div className="k-body pt-ng-body">
        <div className="pt-classes">
          {CLASS_IDS.map((id) => {
            const c = reg().classes[id];
            const n = party.filter((p) => p.classId === id).length;
            return (
              <div key={id} className="pt-cwrap" style={{ ['--acc' as string]: CLASS_COLOR[id] }}>
                <button
                  className={`class-card pt-ccard ${n ? 'has' : ''}`}
                  onClick={() => {
                    if (hold.current.fired) {
                      hold.current.fired = false;
                      return;
                    }
                    add(id);
                  }}
                  onPointerDown={() => holdStart(id)}
                  onPointerUp={holdEnd}
                  onPointerLeave={holdEnd}
                  onPointerCancel={holdEnd}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    holdEnd();
                    hold.current.fired = true;
                    setSheet({ k: 'class', id });
                  }}
                  aria-label={`Recrutar ${c.name}`}
                >
                  <span className="pt-cglow" />
                  <span className="pt-cemb">
                    <Icon id={`class_${id}`} />
                  </span>
                  {n > 0 && <span className="pt-count">×{n}</span>}
                  <span className="pt-cname">{c.name}</span>
                  <span className="pt-cep">{c.epithet}</span>
                  <span className="pt-cstats">
                    <span className="k-chip red" title="Vida">
                      <Icon id="hp" /> {c.hp}
                    </span>
                    <span className="k-chip" title="Armadura">
                      <Icon id="armor" /> {c.armor}
                    </span>
                  </span>
                </button>
                <button className="pt-info" onClick={() => setSheet({ k: 'class', id })} aria-label={`Detalhes: ${c.name}`}>
                  <Icon id="info" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="k-foot pt-ng-foot">
        <div className="party-slots pt-pslots" aria-label="Party">
          {Array.from({ length: MAX }).map((_, i) => {
            const p = party[i];
            if (!p)
              return (
                <div key={i} className="party-slot pt-pslot empty" aria-hidden>
                  <span className="ring">
                    <span className="face">{i === party.length ? '+' : ''}</span>
                  </span>
                  <span className="nm">{i === party.length ? 'Vaga' : ''}</span>
                </div>
              );
            const popped = pop === `${p.classId}:${i}`;
            return (
              <div key={i} className={`party-slot filled pt-pslot ${popped ? 'pop' : ''}`} style={{ ['--acc' as string]: CLASS_COLOR[p.classId] }}>
                <button className="pt-pface" onClick={() => setSheet({ k: 'hero', i })} aria-label={`Editar ${p.name}`}>
                  <span className="ring">
                    <span className="face">
                      <Icon id={`class_${p.classId}`} />
                    </span>
                  </span>
                  <span className="nm">{p.name || '—'}</span>
                </button>
                {multi && <span className="pt-seat">J{Number(p.seat.slice(1)) + 1}</span>}
                <button className="pt-x" onClick={() => remove(i)} aria-label={`Remover ${p.name}`}>
                  <Icon id="close" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="pt-ng-go">
          <button className="k-cta" disabled={!party.length} onClick={start}>
            Preparar a expedição <Icon id="map_path" />
          </button>
          <div className="k-note">{note}</div>
        </div>
      </div>

      {sheet?.k === 'class' && (
        <Sheet onClose={() => setSheet(null)} label={reg().classes[sheet.id].name} className="pt-class-sheet">
          <ClassDetail c={reg().classes[sheet.id]} />
          <div className="pt-sheet-foot">
            {party.length >= MAX ? (
              <div className="pt-full">Party completa (5/5)</div>
            ) : (
              <button
                className="k-cta"
                onClick={() => {
                  add(sheet.id);
                  setSheet(null);
                }}
              >
                Recrutar
              </button>
            )}
          </div>
        </Sheet>
      )}

      {sheet?.k === 'hero' && party[sheet.i] && (
        <HeroEditSheet
          p={party[sheet.i]}
          players={players}
          onChange={(v) => patch(sheet.i, v)}
          onRemove={() => {
            remove(sheet.i);
            setSheet(null);
          }}
          onClass={() => setSheet({ k: 'class', id: party[sheet.i].classId })}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.k === 'players' && (
        <Sheet onClose={() => setSheet(null)} kicker="Neste dispositivo" title="Jogadores">
          <div className="k-tabs pt-count-tabs" role="group" aria-label="Número de jogadores">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={players.length === n ? 'on' : ''} onClick={() => setPlayerCount(n)}>
                {n}
              </button>
            ))}
          </div>
          <p className="pt-hint-line">{multi ? 'Escolha quem controla cada herói.' : 'Um jogador controla toda a party.'}</p>
          {multi && party.length > 0 && (
            <div className="pt-seat-list">
              {party.map((p, i) => (
                <label key={i} className="pt-seat-row" style={{ ['--acc' as string]: CLASS_COLOR[p.classId] }}>
                  <span className="k-emblem">
                    <Icon id={`class_${p.classId}`} />
                  </span>
                  <span className="grow">{p.name}</span>
                  <SeatSelect value={p.seat} players={players} onChange={(seat) => patch(i, { seat })} />
                </label>
              ))}
            </div>
          )}
          <div className="pt-sheet-foot">
            <button className="k-btn" onClick={() => setSheet(null)}>
              Pronto
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function SeatSelect({ value, players, onChange }: { value: string; players: string[]; onChange(seat: string): void }) {
  return (
    <select className="pt-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Jogador">
      {players.map((pl, k) => (
        <option key={k} value={`p${k}`}>
          {pl}
        </option>
      ))}
    </select>
  );
}

function HeroEditSheet({ p, players, onChange, onRemove, onClass, onClose }: { p: PartyEntry; players: string[]; onChange(v: Partial<PartyEntry>): void; onRemove(): void; onClass(): void; onClose(): void }) {
  const c = reg().classes[p.classId];
  return (
    <Sheet onClose={onClose} label={`Herói: ${p.name}`}>
      <div className="pt-hero-edit" style={{ ['--acc' as string]: CLASS_COLOR[p.classId] }}>
        <span className="k-emblem lg">
          <Icon id={`class_${p.classId}`} />
        </span>
        <div className="grow">
          <div className="k-kicker">{c.name}</div>
          <div className="pt-sheet-h">{p.name || '—'}</div>
        </div>
        <button className="k-round pt-sm-round" onClick={onClose} aria-label="Fechar">
          <Icon id="close" />
        </button>
      </div>
      <label className="pt-field">
        <span>Nome</span>
        <input className="k-input" value={p.name} maxLength={18} aria-label="Nome do herói" onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      {players.length > 1 && (
        <label className="pt-field">
          <span>Jogador</span>
          <SeatSelect value={p.seat} players={players} onChange={(seat) => onChange({ seat })} />
        </label>
      )}
      <div className="pt-acts two">
        <button className="pt-act" onClick={onClass}>
          <Icon id="info" /> Ver classe
        </button>
        <button className="pt-act red" onClick={onRemove}>
          <Icon id="close" /> Remover
        </button>
      </div>
      <div className="pt-sheet-foot">
        <button className="k-btn" onClick={onClose}>
          Pronto
        </button>
      </div>
    </Sheet>
  );
}

/** Class sheet content: identity, stats, attribute bars, abilities (tap to expand). */
export function ClassDetail({ c, compact }: { c: ClassDef; compact?: boolean }) {
  return (
    <div className="pt-cd" style={{ ['--acc' as string]: CLASS_COLOR[c.id] }}>
      <div className="pt-cd-head">
        <span className="k-emblem lg">
          <Icon id={`class_${c.id}`} />
        </span>
        <div className="grow">
          <div className="k-kicker">{c.epithet}</div>
          <div className="pt-cd-name">{c.name}</div>
          <div className="pt-cd-chips">
            <span className="k-chip red">
              <Icon id="hp" /> {c.hp} HP
            </span>
            <span className="k-chip">
              <Icon id="armor" /> Armadura {c.armor}
            </span>
            <span className="k-chip gold">{c.resourceName}</span>
          </div>
        </div>
      </div>
      <p className="pt-cd-desc">{c.description}</p>
      <div className="pt-attrs">
        {ATTR_ORDER.map((a) => (
          <div key={a} className="pt-attr">
            <Icon id={`attr_${a}`} />
            <span className="an">{ATTR_NAME[a]}</span>
            <span className="bar">
              <i style={{ width: `${(c.attrs[a] / 12) * 100}%` }} />
            </span>
            <span className="die">D{c.attrs[a]}</span>
          </div>
        ))}
      </div>
      {!compact && (
        <>
          <div className="k-section">Habilidades</div>
          <div className="pt-abs">
            {c.passives.map((p) => (
              <details key={p.name} className="pt-ab">
                <summary>
                  <b>{p.name}</b>
                  <span className="k-chip">Passiva</span>
                </summary>
                <p>{p.text}</p>
              </details>
            ))}
            {c.actions
              .filter((a) => !a.hidden?.({} as never, {} as never))
              .map((a) => (
                <details key={a.id} className="pt-ab">
                  <summary>
                    {a.icon && <Icon id={a.icon} />}
                    <b>{a.name}</b>
                    <span className="k-chip gold">{a.ap ? `${a.ap} AP` : 'Grátis'}</span>
                  </summary>
                  <p>{a.text}</p>
                </details>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
