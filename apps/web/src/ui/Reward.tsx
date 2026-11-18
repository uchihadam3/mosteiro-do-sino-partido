import React, { useEffect } from 'react';
import { backpackCapacity, dungeon, reg } from '@mosteiro/core';
import { useSession } from '../app/hooks';
import { Icon } from './Icon';
import { ItemCard, run } from './Inventory';
import { CLASS_COLOR } from './data';
import { VoteBar } from './Explore';
import { audio } from '../audio/AudioDirector';

export function Reward() {
  const s = useSession();
  const st = s.state!;
  const r = st.reward!;
  const d = dungeon(st.dungeonId);
  const enc = d.encounters.find((e) => e.id === r.encounterId);
  const cap = backpackCapacity(st.partySizeOriginal);
  useEffect(() => {
    audio.play('sting_reward', { volume: 0.9 });
    if (r.gold) setTimeout(() => audio.play('ui_coin', { volume: 0.8 }), 600);
  }, [r.encounterId]);
  const holder = (uid: string) => st.heroes.find((h) => h.backpack.some((b) => b.uid === uid));
  return (
    <div className="modal-back">
      <div className="modal panel ornate" style={{ width: 'min(980px, 97vw)' }}>
        <div className="kicker">Vitória · {enc?.code}</div>
        <h2 className="h2">{r.title}</h2>
        {enc?.outro && <p className="prose" style={{ margin: '6px 0 0' }}>{enc.outro}</p>}
        <div className="divider" />
        <div className="body col">
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span className="chip gold" style={{ fontSize: 'var(--fs-sm)' }}>
              <Icon id="gold" /> +{r.gold} ouro (total {st.gold + r.gold})
            </span>
            {r.states.map((k) => {
              const c = d.stateCards[k];
              return (
                <span key={k} className="chip gold" style={{ fontSize: 'var(--fs-sm)' }} title={c?.text}>
                  <Icon id={c?.icon ?? 'act_objective'} /> {c?.name ?? k}
                </span>
              );
            })}
          </div>
          {r.states.map((k) => d.stateCards[k]).filter((c) => c?.secretLine).map((c) => (
            <div key={c!.name} className="small prose" style={{ borderLeft: '2px solid var(--gold)', paddingLeft: 10 }}>
              <b>{c!.name}:</b> {c!.text} <i className="muted">{c!.secretLine}</i>
            </div>
          ))}
          {r.items.length > 0 ? (
            <>
              <div className="small muted">Tudo o que foi revelado é encontrado. Carregue cada item numa Mochila ({cap} espaços por herói) ou deixe-o: loot não carregado não pertence à party.</div>
              <div className="loot-grid">
                {r.items.map((it, i) => {
                  const def = reg().items[it.itemId];
                  const h = holder(it.uid);
                  return (
                    <div key={it.uid} className={`loot ${def.rarity}`} style={{ animationDelay: `${i * 120}ms` }}>
                      <ItemCard it={it.itemId} />
                      <div className="row" style={{ flexWrap: 'wrap', gap: 4, marginTop: 'auto' }}>
                        {st.heroes.map((x) => (
                          <button
                            key={x.id}
                            className={`opt ${h?.id === x.id ? 'on' : ''}`}
                            style={{ padding: '4px 8px', borderColor: CLASS_COLOR[x.classId] }}
                            disabled={h?.id !== x.id && x.backpack.length >= cap}
                            onClick={() => void run({ t: 'assignLoot', uid: it.uid, heroId: x.id })}
                          >
                            {x.name} <small>{x.backpack.length}/{cap}</small>
                          </button>
                        ))}
                        {h && (
                          <button className="opt" style={{ padding: '4px 8px' }} onClick={() => void run({ t: 'assignLoot', uid: it.uid, heroId: 'leave' }, 'ui_cancel')}>
                            Deixar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="small muted">Este encontro não concede cartas de loot.</div>
          )}
        </div>
        <div className="actions">
          <VoteBar voteKey="collectRewards" />
          {r.unassigned.length > 0 && r.items.length > 0 && <span className="xs muted" style={{ alignSelf: 'center' }}>{r.unassigned.length} item(ns) serão deixados.</span>}
          <button className="btn primary" onClick={() => void run({ t: 'collectRewards' }, 'ui_coin')}>
            Seguir adiante
          </button>
        </div>
      </div>
    </div>
  );
}
