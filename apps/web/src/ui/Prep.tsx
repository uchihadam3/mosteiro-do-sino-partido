import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/App';
import { type SectorKey } from '@mosteiro/core';
import { useSession } from '../app/hooks';
import { Icon } from './Icon';
import { Inventory, run } from './Inventory';
import { CLASS_COLOR } from './data';
import { VoteBar } from './Explore';
import { HeroDisc } from './party/Sheet';
import './party.css';

/** 5×2 hero sectors. Tap a hero, then tap a sector (setFormation). */
export function FormationBoard({ pick, setPick }: { pick: string | null; setPick(id: string | null): void }) {
  const s = useSession();
  const st = s.state!;
  const rows: ('F' | 'R')[] = ['F', 'R'];
  const picked = pick ? st.heroes.find((h) => h.id === pick) : null;
  return (
    <div className="pt-form">
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
      <div className={`pt-form-hint ${picked ? 'on' : ''}`}>{picked ? `Toque num setor para ${picked.name}` : 'Toque num herói e depois num setor'}</div>
      <div className="pt-heroes sm">
        {st.heroes.map((h) => (
          <HeroDisc key={h.id} h={h} size={46} on={pick === h.id} onClick={() => setPick(pick === h.id ? null : h.id)} label={`Mover ${h.name}`} />
        ))}
      </div>
      <p className="pt-fine center">Até 2 por setor. A Frente protege a Retaguarda da mesma coluna.</p>
    </div>
  );
}

/** Hero switcher + the stage where the chosen hero stands in 3D while you dress them (Prep and Base). */
export function HeroStage({ heroId, setHeroId, active }: { heroId: string; setHeroId(id: string): void; active: boolean }) {
  const s = useSession();
  const st = s.state!;
  const { diorama } = useApp();
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!diorama || !active) return;
    const place = () => {
      const r = stage.current?.getBoundingClientRect();
      const c = diorama.renderer.domElement.getBoundingClientRect();
      diorama.showcase(heroId, r && r.height > 40 ? { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height } : undefined);
    };
    place();
    const t = setTimeout(place, 400);
    window.addEventListener('resize', place);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', place);
      diorama.showcase(null);
    };
  }, [diorama, heroId, active]);
  return (
    <>
      {st.heroes.length > 1 && (
        <div className="pt-heroes" role="tablist" aria-label="Heróis">
          {st.heroes.map((x) => (
            <HeroDisc key={x.id} h={x} size={st.heroes.length >= 5 ? 46 : 52} on={x.id === heroId} onClick={() => setHeroId(x.id)} />
          ))}
        </div>
      )}
      <div className="pt-stage" ref={stage} aria-hidden>
        <span className="pt-stage-floor" />
      </div>
    </>
  );
}

export function Prep() {
  const s = useSession();
  const st = s.state!;
  const [heroId, setHeroId] = useState(st.heroes[0].id);
  const [pick, setPick] = useState<string | null>(null);
  const [tab, setTab] = useState<'equip' | 'form'>('equip');
  return (
    <div className={`k-screen pt-prep tab-${tab}`}>
      <div className="k-head pt-head-menu">
        <div className="k-title">
          <div className="k-kicker">Antes da Dungeon 1</div>
          <h1 className="k-h1 pt-h1">Preparar a expedição</h1>
        </div>
      </div>
      <div className="pt-tabbar">
        <div className="k-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'equip'} className={tab === 'equip' ? 'on' : ''} onClick={() => setTab('equip')}>
            Equipamento
          </button>
          <button role="tab" aria-selected={tab === 'form'} className={tab === 'form' ? 'on' : ''} onClick={() => setTab('form')}>
            Formação
          </button>
        </div>
      </div>
      <div className="k-body pt-prep-body">
        <section className="pt-pane pt-pane-equip" aria-label="Equipamento">
          <HeroStage heroId={heroId} setHeroId={setHeroId} active={tab === 'equip'} />
          <Inventory heroId={heroId} setHeroId={setHeroId} inBase showHeroes={false} />
        </section>
        <section className="pt-pane pt-pane-form" aria-label="Formação">
          <div className="k-section pt-pc-only">Formação inicial</div>
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
