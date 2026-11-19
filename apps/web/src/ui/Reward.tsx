import React, { useEffect, useState } from 'react';
import { backpackCapacity, canWield, dungeon, reg, type HeroRecord } from '@mosteiro/core';
import { useSession } from '../app/hooks';
import { Icon } from './Icon';
import { run } from './Inventory';
import { ATTR_NAME, CAT_LABEL, CLASS_COLOR, RARITY_LABEL, SLOT_LABEL } from './data';
import { VoteBar } from './Explore';
import { Sheet } from './Settings';
import { audio } from '../audio/AudioDirector';
import './menus.css';

/** Item details for a bottom sheet (used by the loot reveal and the Base shop). */
export function ItemDetail({ id, hero }: { id: string; hero?: HeroRecord }) {
  const d = reg().items[id];
  if (!d) return null;
  return (
    <div className={`r-${d.rarity}`}>
      <div className="m-item-hero">
        <span className="art">
          <Icon id={d.icon} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="nm">{d.name}</div>
          <div className="m-rar">
            {RARITY_LABEL[d.rarity]} · {SLOT_LABEL[d.slot]}
          </div>
        </div>
      </div>
      <div className="m-item-stats">
        {d.slot === 'weapon' && d.dano !== undefined && (
          <span className="k-chip gold">
            <Icon id="act_attack_melee" /> Dano {d.dano}
          </span>
        )}
        {d.slot === 'weapon' && d.dice && (
          <span className="k-chip">
            <Icon id="dice_d8" /> {d.dice.map((x) => ATTR_NAME[x]).join(' + ')}
          </span>
        )}
        {d.cat && <span className="k-chip">{CAT_LABEL[d.cat]}</span>}
        {d.bow && <span className="k-chip">Ideal {d.bow.ideal === 'proxima' ? 'Próxima' : d.bow.ideal === 'media' ? 'Média' : 'Longa'}</span>}
        {d.slot === 'armor' && (
          <span className="k-chip gold">
            <Icon id="armor" /> Armadura {d.armor}
          </span>
        )}
        {d.maxHpBonus ? (
          <span className="k-chip red">
            <Icon id="hp" /> HP máx {d.maxHpBonus > 0 ? '+' : ''}
            {d.maxHpBonus}
          </span>
        ) : null}
        {d.proficiency && <span className="k-chip">{d.proficiency.join(' | ')}</span>}
      </div>
      <div className="m-item-text">{d.text}</div>
      {hero && d.slot === 'weapon' && !canWield(hero, d.id) && <div className="m-item-note bad">Sem proficiência para {reg().classes[hero.classId].name}.</div>}
      {!d.implemented && <div className="m-item-note">Efeito parcialmente implementado nesta versão.</div>}
    </div>
  );
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
  return (
    <div className="k-screen m-reward">
      <div className="k-head m-head-pad" style={{ paddingLeft: 66 }}>
        <div className="m-laurel">
          <span className="kicker">Vitória · {enc?.code}</span>
        </div>
        <h1 className="m-reward-title">{r.title}</h1>
        {enc?.outro && (
          <p className={`m-outro ${outroOpen ? 'open' : ''}`} onClick={() => setOutroOpen((o) => !o)}>
            {enc.outro}
          </p>
        )}
      </div>
      <div className="k-body">
        <div className="m-spoils">
          <div className="m-goldpop">
            <span className="coin">
              <Icon id="gold" />
            </span>
            <span>
              <b>+{r.gold}</b> <small>ouro · total {st.gold + r.gold}</small>
            </span>
          </div>
          {r.states.map((k) => {
            const c = d.stateCards[k];
            return (
              <button key={k} className="m-statecard" onClick={() => setStateInfo(k)}>
                <Icon id={c?.icon ?? 'act_objective'} /> {c?.name ?? k}
              </button>
            );
          })}
        </div>
        {r.items.length > 0 ? (
          <>
            <p className="m-loot-hint">Toque num herói para guardar o item na Mochila dele ({cap} espaços).</p>
            <div className="m-loot">
              {r.items.map((it, i) => {
                const def = reg().items[it.itemId];
                const h = holder(it.uid);
                return (
                  <div key={it.uid} className={`m-lootcard r-${def.rarity} ${def.rarity} ${h ? 'got' : ''}`} style={{ animationDelay: `${0.5 + i * 0.18}s` }}>
                    <div className="face">
                      <button className="art" onClick={() => setDetail(it.itemId)} aria-label={`Detalhes de ${def.name}`}>
                        <Icon id={def.icon} />
                        <span className="i">
                          <Icon id="info" />
                        </span>
                      </button>
                      <div className="info">
                        <div className="nm">{def.name}</div>
                        <div className="m-rar">
                          {RARITY_LABEL[def.rarity]} · {SLOT_LABEL[def.slot]}
                        </div>
                        <div className="m-owner">{h ? <>Com <b>{h.name}</b></> : 'Ninguém pegou ainda'}</div>
                      </div>
                      <div className="m-takers">
                        {st.heroes.map((x) => {
                          const on = h?.id === x.id;
                          return (
                            <button
                              key={x.id}
                              className={`m-taker ${on ? 'on' : ''}`}
                              style={{ '--acc': CLASS_COLOR[x.classId] } as React.CSSProperties}
                              disabled={!on && x.backpack.length >= cap}
                              aria-pressed={on}
                              aria-label={on ? `Tirar de ${x.name}` : `Dar a ${x.name}`}
                              title={x.name}
                              onClick={() => void (on ? run({ t: 'assignLoot', uid: it.uid, heroId: 'leave' }, 'ui_cancel') : run({ t: 'assignLoot', uid: it.uid, heroId: x.id }))}
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
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="m-loot-hint">Este encontro não concede cartas de loot.</p>
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
        <Sheet title="Item" onClose={() => setDetail(null)}>
          <ItemDetail id={detail} />
        </Sheet>
      )}
      {sc && (
        <Sheet kicker="Carta de Estado" title={sc.name} onClose={() => setStateInfo(null)}>
          <div className="m-item-text">{sc.text}</div>
          {sc.secretLine && <div className="m-item-note" style={{ fontStyle: 'italic' }}>{sc.secretLine}</div>}
        </Sheet>
      )}
    </div>
  );
}
