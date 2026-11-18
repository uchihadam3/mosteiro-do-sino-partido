import React, { useState } from 'react';
import { backpackCapacity, canWield, reg, recordMaxHp, type HeroRecord, type ItemRef } from '@mosteiro/core';
import { useSession } from '../app/hooks';
import { session } from '../state/session';
import { Icon } from './Icon';
import { ATTR_NAME, CAT_LABEL, CLASS_COLOR, RARITY_LABEL, SLOT_LABEL } from './data';
import { toast } from './Toasts';
import { audio } from '../audio/AudioDirector';

type SlotKey = 'primary' | 'secondary' | 'armor' | 'acc0' | 'acc1';
const SLOT_NAMES: Record<SlotKey, string> = { primary: 'Primária', secondary: 'Secundária', armor: 'Armadura', acc0: 'Acessório', acc1: 'Acessório' };

export async function run(cmd: Parameters<typeof session.dispatch>[0], okSound = 'ui_equip') {
  const err = await session.dispatch(cmd);
  if (err) {
    toast(err, 'error');
    audio.play('ui_error', { volume: 0.6 });
  } else audio.play(okSound, { volume: 0.6 });
  return err;
}

export function ItemCard({ it, hero, compare }: { it: string; hero?: HeroRecord; compare?: string | null }) {
  const d = reg().items[it];
  if (!d) return null;
  const c = compare ? reg().items[compare] : null;
  const delta = (a?: number, b?: number) => (a === undefined || b === undefined || a === b ? null : a > b ? <span className="up"> ▲{a - b}</span> : <span className="down"> ▼{b - a}</span>);
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row">
        <Icon id={d.icon} size={34} style={{ color: 'var(--gold-2)' }} />
        <div className="grow">
          <div className="display" style={{ fontSize: 'var(--fs-md)' }}>{d.name}</div>
          <div className={`rar ${d.rarity}`}>
            {RARITY_LABEL[d.rarity]} · {SLOT_LABEL[d.slot]}
            {d.proficiency ? ` · ${d.proficiency.join(' | ')}` : ''}
          </div>
        </div>
      </div>
      {d.slot === 'weapon' && d.dice && (
        <div className="row xs cmp" style={{ flexWrap: 'wrap', gap: 6 }}>
          <span className="chip">{d.dice.map((x) => ATTR_NAME[x]).join(' + ')}</span>
          <span className="chip gold">Dano {d.dano}{delta(d.dano, c?.dano)}</span>
          {d.cat && <span className="chip">{CAT_LABEL[d.cat]}</span>}
          {d.bow && <span className="chip">Ideal {d.bow.ideal === 'proxima' ? 'Próxima' : d.bow.ideal === 'media' ? 'Média' : 'Longa'}</span>}
        </div>
      )}
      {d.slot === 'armor' && (
        <div className="row xs cmp" style={{ gap: 6 }}>
          <span className="chip">Armadura {d.armor}{delta(d.armor, c?.armor)}</span>
          {d.maxHpBonus ? <span className="chip red">HP máx {d.maxHpBonus > 0 ? '+' : ''}{d.maxHpBonus}</span> : null}
        </div>
      )}
      <div className="small" style={{ color: 'var(--ink-2)', lineHeight: 1.4 }}>{d.text}</div>
      {hero && d.slot === 'weapon' && !canWield(hero, d.id) && <div className="xs" style={{ color: 'var(--blood-2)' }}>Sem proficiência para {reg().classes[hero.classId].name}.</div>}
      {!d.implemented && <div className="xs muted">Efeito parcialmente implementado nesta versão (ver docs).</div>}
      {d.source.status === 'HIPOTESE' && <div className="xs muted">Interpretação provisória: {d.source.note}</div>}
    </div>
  );
}

export function Inventory({ heroId, setHeroId, inBase, sell }: { heroId: string; setHeroId(id: string): void; inBase: boolean; sell?: boolean }) {
  const s = useSession();
  const st = s.state!;
  const h = st.heroes.find((x) => x.id === heroId) ?? st.heroes[0];
  const [sel, setSel] = useState<{ ref: ItemRef; from: string } | null>(null);
  const cap = backpackCapacity(st.partySizeOriginal);
  const mine = s.controls(h.id);
  const slotRef = (k: SlotKey) => (k === 'acc0' ? h.equipment.accessories[0] : k === 'acc1' ? h.equipment.accessories[1] : h.equipment[k]);
  const selDef = sel ? reg().items[sel.ref.itemId] : null;
  const targetSlots: SlotKey[] = !selDef ? [] : selDef.slot === 'weapon' ? ['primary', 'secondary'] : selDef.slot === 'armor' ? ['armor'] : selDef.slot === 'accessory' ? ['acc0', 'acc1'] : [];
  return (
    <div className="base-body" style={{ gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)' }}>
      <div className="panel col" style={{ padding: 14, minHeight: 0 }}>
        <div className="tabs" style={{ flexWrap: 'wrap' }}>
          {st.heroes.map((x) => (
            <button key={x.id} className={`tab ${x.id === h.id ? 'on' : ''}`} style={{ borderRadius: 8, borderBottom: '1px solid var(--line)', color: x.id === h.id ? CLASS_COLOR[x.classId] : undefined }} onClick={() => { setHeroId(x.id); setSel(null); }}>
              {x.name}
            </button>
          ))}
        </div>
        <div className="row small">
          <Icon id={`class_${h.classId}`} size={36} style={{ color: CLASS_COLOR[h.classId] }} />
          <div className="grow">
            <div className="display">{h.name}</div>
            <div className="xs muted">
              {reg().classes[h.classId].name} · HP {h.hp}/{recordMaxHp(h)} · Cantil {h.cantil}/{h.cantilMax}
              {h.trauma ? ` · Trauma ${h.trauma}` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {(['primary', 'secondary', 'armor', 'acc0', 'acc1'] as SlotKey[]).map((k) => {
            const r = slotRef(k);
            const d = r ? reg().items[r.itemId] : null;
            const canDrop = sel && targetSlots.includes(k) && mine;
            return (
              <button
                key={k}
                className={`slot ${r ? '' : 'empty'}`}
                style={canDrop ? { borderColor: 'var(--gold-2)', boxShadow: '0 0 12px rgba(230,207,143,0.2)' } : undefined}
                onClick={() => {
                  if (canDrop && sel) {
                    void run({ t: 'equip', heroId: h.id, uid: sel.ref.uid, slot: k });
                    setSel(null);
                  } else if (r) setSel({ ref: r, from: `slot:${k}` });
                }}
              >
                <Icon id={d?.icon ?? 'item_accessory_ring'} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="sl">{SLOT_NAMES[k]}</div>
                  <div className="small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d?.name ?? '—'}</div>
                </div>
              </button>
            );
          })}
          <div className="slot" style={{ cursor: 'default' }}>
            <Icon id="cantil" />
            <div className="grow">
              <div className="sl">Cantil</div>
              <div className="small">
                {h.cantil}/{h.cantilMax} cargas · cura 3
              </div>
            </div>
            {!inBase && mine && h.cantil > 0 && h.hp < recordMaxHp(h) && (
              <button className="btn sm" onClick={() => void run({ t: 'drinkCantil', heroId: h.id }, 'heal')}>
                Beber
              </button>
            )}
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="kicker">Mochila</div>
          <span className="xs muted">
            {h.backpack.length}/{cap} espaços
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
          {Array.from({ length: cap }).map((_, i) => {
            const r = h.backpack[i];
            const d = r ? reg().items[r.itemId] : null;
            return (
              <button key={i} className={`slot ${r ? '' : 'empty'}`} style={sel?.ref.uid === r?.uid && r ? { borderColor: 'var(--gold-2)' } : undefined} onClick={() => r && setSel({ ref: r, from: 'backpack' })}>
                {d ? <Icon id={d.icon} /> : <span style={{ width: 28 }} />}
                <div className="small grow" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d?.name ?? ''}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="panel col" style={{ padding: 14, minHeight: 0 }}>
        {sel && selDef ? (
          <>
            <ItemCard it={sel.ref.itemId} hero={h} compare={targetSlots[0] ? slotRef(targetSlots[0])?.itemId : null} />
            <div className="divider" />
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {mine &&
                targetSlots.map((k) => (
                  <button key={k} className="btn sm" disabled={selDef.slot === 'weapon' && !canWield(h, selDef.id)} onClick={() => { void run({ t: 'equip', heroId: h.id, uid: sel.ref.uid, slot: k }); setSel(null); }}>
                    Equipar: {SLOT_NAMES[k]}{k === 'acc1' ? ' 2' : ''}
                  </button>
                ))}
              {mine && sel.from.startsWith('slot:') && (
                <button className="btn sm" onClick={() => { void run({ t: 'unequip', heroId: h.id, slot: sel.from.slice(5) as SlotKey }); setSel(null); }}>
                  Desequipar
                </button>
              )}
              {st.heroes.filter((x) => x.id !== h.id).map((x) => (
                <button key={x.id} className="btn sm ghost" onClick={() => { void run({ t: 'transfer', uid: sel.ref.uid, to: x.id }); setSel(null); }}>
                  → {x.name}
                </button>
              ))}
              {inBase && (
                <button className="btn sm ghost" onClick={() => { void run({ t: 'transfer', uid: sel.ref.uid, to: 'armazem' }); setSel(null); }}>
                  → Armazém
                </button>
              )}
              {sell && (
                <button className="btn sm danger" onClick={() => { void run({ t: 'sell', uid: sel.ref.uid }, 'ui_coin'); setSel(null); }}>
                  Vender
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="muted small">Selecione um item para ver detalhes, comparar e equipar. Fora de Combate a reorganização é livre (§16, §27).</div>
        )}
        {inBase && (
          <>
            <div className="divider" />
            <div className="kicker">Armazém da Base</div>
            <div className="scroll-y" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6, alignContent: 'start', flex: 1 }}>
              {st.armazem.length === 0 && <div className="xs muted">Vazio.</div>}
              {st.armazem.map((r) => {
                const d = reg().items[r.itemId];
                return (
                  <button key={r.uid} className="slot" style={sel?.ref.uid === r.uid ? { borderColor: 'var(--gold-2)' } : undefined} onClick={() => setSel({ ref: r, from: 'armazem' })}>
                    <Icon id={d.icon} />
                    <div className="small grow" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
