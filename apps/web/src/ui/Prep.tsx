import React, { useState } from 'react';
import { type SectorKey } from '@mosteiro/core';
import { useSession } from '../app/hooks';
import { Icon } from './Icon';
import { Inventory, run } from './Inventory';
import { CLASS_COLOR } from './data';
import { VoteBar } from './Explore';
import { HeroDisc } from './party/Sheet';
import { useMedia, WIDE } from './gamekit';
import './party.css';

/** 5×2 hero sectors. Tap a hero, then tap a sector (setFormation). */
export function FormationBoard({ pick, setPick }: { pick: string | null; setPick(id: string | null): void }) {
  const s = useSession();
  const st = s.state!;
  const rows: ('F' | 'R')[] = ['F', 'R'];
  const picked = pick ? st.heroes.find((h) => h.id === pick) : null;
  return (
    <div className="pt-form gx-form">
      <div className="pt-form-board">
        <div className="pt-enemy">
          <span>▲</span> Inimigos à frente <span>▲</span>
        </div>
        {rows.map((r) => (
          <div key={r} className="pt-frow">
            <div className="pt-frow-l">{r === 'F' ? 'Frente' : 'Retaguarda'}</div>
            <div className="pt-fcells">
              {[1, 2, 3, 4, 5].map((c) => {
                const k = `H:${r}${c}` as SectorKey;
                const here = st.heroes.filter((h) => st.formation[h.id] === k);
                const open = !!pick && (here.length < 2 || here.some((h) => h.id === pick));
                return (
                  <div
                    key={k}
                    role="button"
                    tabIndex={0}
                    aria-label={`${r === 'F' ? 'Frente' : 'Retaguarda'} ${c}${here.length ? `: ${here.map((h) => h.name).join(', ')}` : ''}`}
                    className={`pt-cell ${open ? 'open' : ''} ${here.length ? 'busy' : ''} ${here.length > 1 ? 'two' : ''}`}
                    onClick={() => {
                      if (pick) {
                        void run({ t: 'setFormation', heroId: pick, sector: k }, 'step_stone_1');
                        setPick(null);
                      } else if (here[0]) setPick(here[0].id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') (e.currentTarget as HTMLElement).click();
                    }}
                  >
                    <span className="pt-cn">{c}</span>
                    {here.map((h) => (
                      <span
                        key={h.id}
                        className={`pt-fig ${pick === h.id ? 'on' : ''}`}
                        style={{ ['--acc' as string]: CLASS_COLOR[h.classId] }}
                        onClick={(e) => {
                          // tapping a hero picks it (or drops the pick); tapping another hero while one is picked moves into this sector
                          if (!pick || pick === h.id) {
                            e.stopPropagation();
                            setPick(pick === h.id ? null : h.id);
                          }
                        }}
                      >
                        <Icon id={`class_${h.classId}`} />
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="pt-form-side">
        <div className={`pt-form-hint ${picked ? 'on' : ''}`}>{picked ? `Toque num setor para ${picked.name}` : 'Toque num herói e depois num setor'}</div>
        <div className="pt-heroes sm">
          {st.heroes.map((h) => (
            <HeroDisc key={h.id} h={h} size={46} on={pick === h.id} onClick={() => setPick(pick === h.id ? null : h.id)} label={`Mover ${h.name}`} />
          ))}
        </div>
        <p className="pt-fine center">Até 2 por setor · a Frente protege a Retaguarda da mesma coluna</p>
      </div>
    </div>
  );
}

export function Prep() {
  const s = useSession();
  const st = s.state!;
  const [heroId, setHeroId] = useState(st.heroes[0].id);
  const [pick, setPick] = useState<string | null>(null);
  const [tab, setTab] = useState<'equip' | 'form'>('equip');
  const wide = useMedia(WIDE);
  return (
    <div className={`k-screen pt-prep gx-prep tab-${tab}`}>
      <div className="k-head pt-head-menu">
        <div className="k-title">
          <div className="k-kicker">Antes da Dungeon 1</div>
          <h1 className="k-h1 pt-h1">Preparar a expedição</h1>
        </div>
      </div>
      <div className="pt-tabbar">
        <div className="k-tabs gx-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'equip'} className={tab === 'equip' ? 'on' : ''} onClick={() => setTab('equip')}>
            <Icon id="item_sword" /> Equipamento
          </button>
          <button role="tab" aria-selected={tab === 'form'} className={tab === 'form' ? 'on' : ''} onClick={() => setTab('form')}>
            <Icon id="act_move" /> Formação
          </button>
        </div>
      </div>
      <div className="k-body pt-prep-body">
        <section className="pt-pane pt-pane-equip" aria-label="Equipamento">
          <Inventory heroId={heroId} setHeroId={setHeroId} inBase stage={tab === 'equip' || wide} />
        </section>
        <section className="pt-pane pt-pane-form" aria-label="Formação">
          <div className="k-section pt-pc-only">
            <Icon id="act_move" /> Formação
          </div>
          <FormationBoard pick={pick} setPick={setPick} />
        </section>
      </div>
      <div className="k-foot">
        <VoteBar voteKey="beginDungeon" />
        <button className="k-cta" onClick={() => void run({ t: 'beginDungeon' }, 'door_stone')}>
          Partir para o Mosteiro <Icon id="loc_portico" />
        </button>
      </div>
    </div>
  );
}
