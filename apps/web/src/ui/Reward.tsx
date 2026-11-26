import React, { useEffect, useState } from 'react';
import { backpackCapacity, dungeon, reg, type HeroRecord } from '@mosteiro/core';
import { useSession } from '../app/hooks';
import { Icon } from './Icon';
import { ItemCard, run } from './Inventory';
import { CLASS_COLOR } from './data';
import { VoteBar } from './Explore';
import { Sheet } from './party/Sheet';
import { audio } from '../audio/AudioDirector';
import { ItemArt, keyStat, Pager, StatBadge, useFit, useMedia, usePages, WIDE } from './gamekit';
import './menus.css';
import './gamify.css';
import './reward.css';

const RAR: Record<string, string> = {
  inicial: 'Inicial',
  comum: 'Comum',
  raro: 'Raro',
  epico: 'Épico',
};
const KIND: Record<string, string> = {
  weapon: 'Arma',
  armor: 'Armadura',
  accessory: 'Acessório',
  consumable: 'Consumível',
};

/** Item details for a bottom sheet (kept for older callers; same big card as the equipment screens). */
export function ItemDetail({ id, hero }: { id: string; hero?: HeroRecord }) {
  return <ItemCard it={id} hero={hero} />;
}

export function Reward() {
  const s = useSession();
  const st = s.state!;
  const r = st.reward!;
  const d = dungeon(st.dungeonId);
  const enc = d.encounters.find((e) => e.id === r.encounterId);
  const cap = backpackCapacity(st.partySizeOriginal);
  const [detail, setDetail] = useState<string | null>(null);
  const [stateInfo, setStateInfo] = useState<string | null>(null);
  const [outroOpen, setOutroOpen] = useState(false);
  useEffect(() => {
    audio.play('sting_reward', { volume: 0.9 });
    if (r.gold) setTimeout(() => audio.play('ui_coin', { volume: 0.8 }), 600);
  }, [r.encounterId]);
  const holder = (uid: string) => st.heroes.find((h) => h.backpack.some((b) => b.uid === uid));
  const left = r.items.length ? r.unassigned.length : 0;
  const sc = stateInfo ? d.stateCards[stateInfo] : null;
  const wide = useMedia(WIDE);
  const side = useMedia('(max-height: 500px) and (orientation: landscape)');
  const fit = useFit(wide ? 196 : side ? 160 : 162, wide ? 300 : side ? 214 : 250, wide ? 16 : 10);
  const pg = usePages(r.items, fit.per);
  return (
    <div className="k-screen m-reward rw">
      <div className="k-head m-head-pad rw-head">
        <div className="rw-titles">
          <div className="m-laurel">
            <span className="kicker">Vitória</span>
          </div>
          <h1 className="m-reward-title">{r.title}</h1>
          {enc?.outro && (
            <p className={`m-outro rw-outro ${outroOpen ? 'open' : ''}`} onClick={() => setOutroOpen((o) => !o)}>
              {enc.outro}
            </p>
          )}
        </div>
        <div className="rw-spoils">
          <div className="rw-gold" aria-label={`Mais ${r.gold} de ouro; total ${st.gold + r.gold}`}>
            <span className="gk-coin rw-coin" aria-hidden>
              <Icon id="gold" />
            </span>
            <b>+{r.gold}</b>
            <small>total {st.gold + r.gold}</small>
          </div>
          {r.states.map((k) => {
            const c = d.stateCards[k];
            return (
              <button key={k} className="rw-state" onClick={() => setStateInfo(k)}>
                <Icon id={c?.icon ?? 'act_objective'} /> {c?.name ?? k}
              </button>
            );
          })}
        </div>
      </div>
      <div className="k-body rw-body">
        {r.items.length > 0 ? (
          <>
            <p className="rw-hint">
              Toque num <b>herói</b> para pôr o item na Mochila dele · {cap} espaços
            </p>
            <div className="rw-cards" ref={fit.ref}>
              {pg.items.map((it, i) => {
                const def = reg().items[it.itemId];
                const h = holder(it.uid);
                const k = keyStat(def);
                return (
                  <div
                    key={it.uid}
                    className={`m-lootcard rw-card rc-${def.rarity} ${def.rarity} ${h ? 'got' : ''}`}
                    style={{
                      animationDelay: `${0.45 + i * 0.16}s`,
                      ['--tk' as string]: st.heroes.length > 3 ? '34px' : '42px',
                      ['--acc' as string]: h ? CLASS_COLOR[h.classId] : undefined,
                    }}
                  >
                    <div className="rw-in">
                      <button className="rw-art" onClick={() => setDetail(it.itemId)} aria-label={`Detalhes de ${def.name}`}>
                        <ItemArt d={def} size="xl" />
                        <span className="rw-i" aria-hidden>
                          <Icon id="info" />
                        </span>
                      </button>
                      <span className="gk-ribbon">
                        {RAR[def.rarity]} · {KIND[def.slot]}
                      </span>
                      <div className="rw-nm">{def.name}</div>
                      {k && <StatBadge icon={k.icon} v={k.v} tone={k.icon === 'hp' ? 'red' : 'gold'} />}
                      <div className="rw-who">
                        {h ? (
                          <>
                            Com <b>{h.name}</b>
                          </>
                        ) : (
                          'Para quem?'
                        )}
                      </div>
                      <div className="m-takers rw-takers">
                        {st.heroes.map((x) => {
                          const on = h?.id === x.id;
                          const full = !on && x.backpack.length >= cap;
                          return (
                            <button
                              key={x.id}
                              className={`m-taker ${on ? 'on' : ''} ${full ? 'full' : ''}`}
                              style={
                                {
                                  '--acc': CLASS_COLOR[x.classId],
                                } as React.CSSProperties
                              }
                              disabled={full}
                              aria-pressed={on}
                              aria-label={on ? `Tirar de ${x.name}` : `Dar a ${x.name}`}
                              title={full ? `${x.name}: Mochila cheia` : x.name}
                              onClick={() =>
                                void (on
                                  ? run(
                                      {
                                        t: 'assignLoot',
                                        uid: it.uid,
                                        heroId: 'leave',
                                      },
                                      'ui_cancel',
                                    )
                                  : run({
                                      t: 'assignLoot',
                                      uid: it.uid,
                                      heroId: x.id,
                                    }))
                              }
                            >
                              <Icon id={`class_${x.classId}`} />
                              <span className="cnt">
                                {x.backpack.length}/{cap}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {h && (
                      <span className="rw-stamp" aria-hidden>
                        <Icon id="check" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <Pager page={pg.page} pages={pg.pages} setPage={pg.setPage} label="Mais itens" />
          </>
        ) : (
          <p className="rw-hint">Este encontro não concede itens.</p>
        )}
      </div>
      <div className="k-foot">
        {left > 0 && <div className="k-note">{left === 1 ? '1 item ficará para trás' : `${left} itens ficarão para trás`}</div>}
        <VoteBar voteKey="collectRewards" />
        <button className="k-cta" onClick={() => void run({ t: 'collectRewards' }, 'ui_coin')}>
          <Icon id="gold" /> Seguir adiante
        </button>
      </div>
      {detail && (
        <Sheet title=" " kicker="Item" label={reg().items[detail]?.name} onClose={() => setDetail(null)} className="eq-sheet eq-itemsheet">
          <ItemCard it={detail} />
        </Sheet>
      )}
      {sc && (
        <Sheet kicker="Carta de Estado" title={sc.name} onClose={() => setStateInfo(null)} className="eq-sheet">
          <p className="rw-sc">{sc.text}</p>
          {sc.secretLine && <p className="rw-sc secret">{sc.secretLine}</p>}
        </Sheet>
      )}
    </div>
  );
}
