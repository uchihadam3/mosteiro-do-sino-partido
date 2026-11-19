import React, { useEffect, useState } from 'react';
import { backpackCapacity, canWield, findItem, PRICES, reg, recordMaxHp, type HeroRecord, type ItemDef, type ItemRef } from '@mosteiro/core';
import { useSession } from '../app/hooks';
import { session } from '../state/session';
import { Icon } from './Icon';
import { ATTR_NAME, CAT_LABEL, CLASS_COLOR, RARITY_LABEL, SLOT_LABEL } from './data';
import { toast } from './Toasts';
import { audio } from '../audio/AudioDirector';
import { HeroDisc, Sheet } from './party/Sheet';
import './party.css';

type SlotKey = 'primary' | 'secondary' | 'armor' | 'acc0' | 'acc1';
const SLOTS: SlotKey[] = ['primary', 'secondary', 'armor', 'acc0', 'acc1'];
const SLOT_NAMES: Record<SlotKey, string> = { primary: 'Primária', secondary: 'Secundária', armor: 'Armadura', acc0: 'Acessório 1', acc1: 'Acessório 2' };
const SLOT_ICON: Record<SlotKey, string> = { primary: 'item_sword', secondary: 'item_dagger', armor: 'item_armor_medium', acc0: 'item_accessory_ring', acc1: 'item_accessory_amulet' };
const WANT: Record<SlotKey, ItemDef['slot']> = { primary: 'weapon', secondary: 'weapon', armor: 'armor', acc0: 'accessory', acc1: 'accessory' };

export async function run(cmd: Parameters<typeof session.dispatch>[0], okSound = 'ui_equip') {
  const err = await session.dispatch(cmd);
  if (err) {
    toast(err, 'error');
    audio.play('ui_error', { volume: 0.6 });
  } else audio.play(okSound, { volume: 0.6 });
  return err;
}

/** One short stat line for tiles and lists. */
function keyStat(d: ItemDef): string | null {
  if (d.slot === 'weapon' && d.dano !== undefined) return `Dano ${d.dano}`;
  if (d.slot === 'armor' && d.armor !== undefined) return `Arm. ${d.armor}`;
  if (d.slot === 'consumable') return 'Consumível';
  return null;
}
function sellValue(d: ItemDef) {
  if (d.slot === 'consumable') return Math.floor((d.price ?? 2) / 2);
  if (d.rarity === 'inicial') return 0;
  return d.rarity === 'epico' ? PRICES.epico.sell : d.rarity === 'raro' ? PRICES.raro.sell : PRICES.comum.sell;
}

/** Item details (name, rarity, stats with comparison, rules text). Also used by Base and Reward. */
export function ItemCard({ it, hero, compare }: { it: string; hero?: HeroRecord; compare?: string | null }) {
  const d = reg().items[it];
  if (!d) return null;
  const c = compare ? reg().items[compare] : null;
  const delta = (a?: number, b?: number) => (a === undefined || b === undefined || a === b ? null : a > b ? <span className="pt-up"> ▲{a - b}</span> : <span className="pt-down"> ▼{b - a}</span>);
  return (
    <div className={`pt-item r-${d.rarity}`}>
      <div className="pt-item-head">
        <span className="pt-item-ico">
          <Icon id={d.icon} />
        </span>
        <div className="grow">
          <div className="pt-item-name">{d.name}</div>
          <div className="pt-item-sub">
            <span className="rar">{RARITY_LABEL[d.rarity]}</span> · {SLOT_LABEL[d.slot]}
            {d.proficiency ? ` · ${d.proficiency.join(' | ')}` : ''}
          </div>
        </div>
      </div>
      {d.slot === 'weapon' && d.dice && (
        <div className="pt-item-chips">
          <span className="k-chip gold">
            Dano {d.dano}
            {delta(d.dano, c?.dano)}
          </span>
          <span className="k-chip">{d.dice.map((x) => ATTR_NAME[x]).join(' + ')}</span>
          {d.cat && <span className="k-chip">{CAT_LABEL[d.cat]}</span>}
          {d.bow && <span className="k-chip">Ideal {d.bow.ideal === 'proxima' ? 'Próxima' : d.bow.ideal === 'media' ? 'Média' : 'Longa'}</span>}
        </div>
      )}
      {d.slot === 'armor' && (
        <div className="pt-item-chips">
          <span className="k-chip gold">
            <Icon id="armor" /> Armadura {d.armor}
            {delta(d.armor, c?.armor)}
          </span>
          {d.maxHpBonus ? (
            <span className="k-chip red">
              HP máx {d.maxHpBonus > 0 ? '+' : ''}
              {d.maxHpBonus}
            </span>
          ) : null}
        </div>
      )}
      <p className="pt-item-text">{d.text}</p>
      {hero && d.slot === 'weapon' && !canWield(hero, d.id) && <div className="pt-warn">Sem proficiência para {reg().classes[hero.classId].name}.</div>}
      {!d.implemented && <div className="pt-fine">Efeito parcialmente implementado nesta versão.</div>}
      {d.source.status === 'HIPOTESE' && <div className="pt-fine">Interpretação provisória: {d.source.note}</div>}
    </div>
  );
}

function Tile({ r, on, onClick, tag }: { r: ItemRef; on?: boolean; onClick(): void; tag?: string }) {
  const d = reg().items[r.itemId];
  if (!d) return null;
  return (
    <button className={`pt-tile full r-${d.rarity} ${on ? 'on' : ''}`} onClick={onClick} aria-label={d.name}>
      <span className="ti">
        <Icon id={d.icon} />
      </span>
      <span className="tn">{d.name}</span>
      {tag && <span className="tt">{tag}</span>}
    </button>
  );
}

type InvSheet = { k: 'slot'; slot: SlotKey } | { k: 'item'; uid: string; back?: InvSheet } | null;

/**
 * Party equipment for one hero at a time: hero strip → equipment slots → Mochila → Armazém (in Base).
 * Every action lives in the item sheet that opens when an item or slot is tapped.
 */
export function Inventory({ heroId, setHeroId, inBase, sell, showHeroes = true }: { heroId: string; setHeroId(id: string): void; inBase: boolean; sell?: boolean; showHeroes?: boolean }) {
  const s = useSession();
  const st = s.state!;
  const h = st.heroes.find((x) => x.id === heroId) ?? st.heroes[0];
  const [sheet, setSheet] = useState<InvSheet>(null);
  const cap = backpackCapacity(st.partySizeOriginal);
  const mine = s.controls(h.id);
  const max = recordMaxHp(h);
  const slotRef = (k: SlotKey) => (k === 'acc0' ? h.equipment.accessories[0] : k === 'acc1' ? h.equipment.accessories[1] : h.equipment[k]);
  const canDrink = !inBase && st.phase !== 'combat' && mine && h.status === 'ok' && h.cantil > 0 && h.hp < max;
  const close = () => setSheet(null);
  const pickHero = (id: string) => {
    setHeroId(id);
    setSheet(null);
    audio.play('ui_hover', { volume: 0.4 });
  };

  return (
    <div className="pt-inv">
      {showHeroes && st.heroes.length > 1 && (
        <div className="pt-heroes" role="tablist" aria-label="Heróis">
          {st.heroes.map((x) => (
            <HeroDisc key={x.id} h={x} size={st.heroes.length >= 5 ? 48 : 54} on={x.id === h.id} onClick={() => pickHero(x.id)} />
          ))}
        </div>
      )}

      <div className="pt-inv-cols">
        <div className="pt-inv-main">
          <div className="pt-hero-head" style={{ ['--acc' as string]: CLASS_COLOR[h.classId] }}>
            <div className="grow">
              <div className="pt-hn">{h.name}</div>
              <div className="pt-hc">{reg().classes[h.classId].name}</div>
            </div>
            <span className="k-chip red" title="Vida">
              <Icon id="hp" /> {h.hp}/{max}
            </span>
            {h.trauma ? (
              <span className="k-chip" title="Trauma">
                <Icon id="cond_trauma" /> {h.trauma}
              </span>
            ) : null}
            <button className={`pt-cantil ${canDrink ? 'go' : ''}`} disabled={!canDrink} onClick={() => void run({ t: 'drinkCantil', heroId: h.id }, 'heal')} aria-label={canDrink ? 'Beber do Cantil (+3 HP)' : `Cantil ${h.cantil}/${h.cantilMax}`} title="Cantil: cura 3">
              <Icon id="cantil" /> {h.cantil}/{h.cantilMax}
              {canDrink && <b>Beber</b>}
            </button>
          </div>

          <div className="pt-slots">
            {SLOTS.map((k) => {
              const r = slotRef(k);
              const d = r ? reg().items[r.itemId] : null;
              const stat = d ? keyStat(d) : null;
              return (
                <button key={k} className={`pt-slot s-${k} ${d ? `r-${d.rarity}` : 'empty'}`} onClick={() => setSheet({ k: 'slot', slot: k })} aria-label={`${SLOT_NAMES[k]}: ${d?.name ?? 'vazio'}`}>
                  <span className="sl">{SLOT_NAMES[k]}</span>
                  <span className="si">
                    <Icon id={d?.icon ?? SLOT_ICON[k]} />
                  </span>
                  <span className="sn">{d?.name ?? 'Vazio'}</span>
                  {stat && <span className="ss">{stat}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-inv-bags">
          <div className="pt-bag-head">
            <span className="k-section">
              <Icon id="mochila" /> Mochila
            </span>
            <span className="pt-cap">
              {h.backpack.length}/{cap}
            </span>
          </div>
          <div className="pt-tiles">
            {Array.from({ length: Math.max(cap, h.backpack.length) }).map((_, i) => {
              const r = h.backpack[i];
              return r ? <Tile key={r.uid} r={r} onClick={() => setSheet({ k: 'item', uid: r.uid })} /> : <span key={`e${i}`} className="pt-tile empty" aria-hidden />;
            })}
          </div>

          {inBase && (
            <>
              <div className="pt-bag-head">
                <span className="k-section">Armazém</span>
                <span className="pt-cap">fica na Base</span>
              </div>
              {st.armazem.length === 0 ? (
                <div className="pt-empty-line">Vazio.</div>
              ) : (
                <div className="pt-tiles">
                  {st.armazem.map((r) => (
                    <Tile key={r.uid} r={r} onClick={() => setSheet({ k: 'item', uid: r.uid })} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {sheet?.k === 'slot' && <SlotSheet h={h} slot={sheet.slot} inBase={inBase} sell={!!sell} mine={mine} onClose={close} onItem={(uid) => setSheet({ k: 'item', uid, back: sheet })} />}
      {sheet?.k === 'item' && <ItemSheet h={h} uid={sheet.uid} inBase={inBase} sell={!!sell} mine={mine} onClose={close} onBack={sheet.back ? () => setSheet(sheet.back!) : undefined} />}
    </div>
  );
}

/** Tap on a slot: what is equipped there (with its actions) + compatible items to swap in. */
function SlotSheet({ h, slot, inBase, sell, mine, onClose, onItem }: { h: HeroRecord; slot: SlotKey; inBase: boolean; sell: boolean; mine: boolean; onClose(): void; onItem(uid: string): void }) {
  const s = useSession();
  const st = s.state!;
  const cur = slot === 'acc0' ? h.equipment.accessories[0] : slot === 'acc1' ? h.equipment.accessories[1] : h.equipment[slot];
  const want = WANT[slot];
  const cands: { r: ItemRef; from: string }[] = [
    ...h.backpack.map((r) => ({ r, from: 'Mochila' })),
    ...(inBase ? st.armazem.map((r) => ({ r, from: 'Armazém' })) : []),
  ]
    .filter(({ r }) => reg().items[r.itemId]?.slot === want)
    .sort((a, b) => Number(canWield(h, b.r.itemId)) - Number(canWield(h, a.r.itemId)));
  return (
    <Sheet onClose={onClose} kicker={h.name} title={SLOT_NAMES[slot]}>
      {cur ? (
        <ItemCard it={cur.itemId} hero={h} />
      ) : (
        <div className="pt-empty-slot">
          <Icon id={SLOT_ICON[slot]} />
          <span>Nada equipado.</span>
        </div>
      )}
      <div className="k-section">{cur ? 'Trocar por' : 'Escolha um item'}</div>
      {cands.length === 0 ? (
        <div className="pt-empty-line">Nada compatível na Mochila{inBase ? ' nem no Armazém' : ''}.</div>
      ) : (
        <div className="pt-picks">
          {cands.map(({ r, from }) => {
            const d = reg().items[r.itemId];
            const ok = canWield(h, d.id);
            const stat = keyStat(d);
            return (
              <div key={r.uid} className={`pt-pick-row r-${d.rarity} ${ok ? '' : 'no'}`}>
                <button className="pt-pick-main" onClick={() => onItem(r.uid)} aria-label={`Detalhes: ${d.name}`}>
                  <span className="ti">
                    <Icon id={d.icon} />
                  </span>
                  <span className="grow">
                    <span className="pn">{d.name}</span>
                    <span className="pm">
                      {stat ? `${stat} · ` : ''}
                      {ok ? from : 'Sem proficiência'}
                    </span>
                  </span>
                </button>
                {mine && (
                  <button
                    className="pt-act sm gold"
                    disabled={!ok}
                    onClick={() => {
                      void run({ t: 'equip', heroId: h.id, uid: r.uid, slot });
                      onClose();
                    }}
                  >
                    Equipar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {cur && (
        <>
          <div className="k-section">Ações</div>
          <ItemActions h={h} uid={cur.uid} inBase={inBase} sell={sell} mine={mine} done={onClose} />
        </>
      )}
    </Sheet>
  );
}

function ItemSheet({ h, uid, inBase, sell, mine, onClose, onBack }: { h: HeroRecord; uid: string; inBase: boolean; sell: boolean; mine: boolean; onClose(): void; onBack?(): void }) {
  const s = useSession();
  const st = s.state!;
  const loc = findItem(st, uid);
  // the item moved (equipped, sold…) — nothing left to show
  useEffect(() => {
    if (!loc) onClose();
  }, [loc, onClose]);
  if (!loc) return null;
  const d = reg().items[loc.ref.itemId];
  const cmpSlot: SlotKey | null = d.slot === 'weapon' ? 'primary' : d.slot === 'armor' ? 'armor' : d.slot === 'accessory' ? 'acc0' : null;
  const cmp = cmpSlot && !(loc.where === 'equip' && loc.hero?.id === h.id) ? (cmpSlot === 'acc0' ? h.equipment.accessories[0] : h.equipment[cmpSlot as 'primary' | 'armor']) : null;
  const where = loc.where === 'armazem' ? 'Armazém' : loc.where === 'backpack' ? `Mochila · ${loc.hero?.name}` : `Equipado · ${loc.hero?.name}`;
  return (
    <Sheet onClose={onClose} onBack={onBack} kicker={where} label={d.name}>
      <ItemCard it={d.id} hero={h} compare={cmp?.itemId} />
      <ItemActions h={h} uid={uid} inBase={inBase} sell={sell} mine={mine} done={onClose} />
    </Sheet>
  );
}

/** Context actions for one item, as big buttons (equip / unequip / use / give / store / sell). */
function ItemActions({ h, uid, inBase, sell, mine, done }: { h: HeroRecord; uid: string; inBase: boolean; sell: boolean; mine: boolean; done(): void }) {
  const s = useSession();
  const st = s.state!;
  const [useOn, setUseOn] = useState(false);
  const loc = findItem(st, uid);
  if (!loc) return null;
  const d = reg().items[loc.ref.itemId];
  const fromSlot = loc.where === 'equip' && loc.hero?.id === h.id ? (loc.slot as SlotKey) : null;
  const targets: SlotKey[] = (d.slot === 'weapon' ? ['primary', 'secondary'] : d.slot === 'armor' ? ['armor'] : d.slot === 'accessory' ? ['acc0', 'acc1'] : []).filter((k) => k !== fromSlot) as SlotKey[];
  const wield = canWield(h, d.id);
  const ownBackpack = loc.where === 'backpack' && loc.hero?.id === h.id;
  const canUse = ownBackpack && mine && st.phase !== 'combat' && !!d.consumable?.outOfCombat;
  const others = st.heroes.filter((x) => x.id !== (loc.hero?.id ?? ''));
  const act = (cmd: Parameters<typeof run>[0], snd?: string) => {
    void run(cmd, snd);
    done();
  };
  return (
    <div className="pt-actions">
      {mine && targets.length > 0 && (
        <div className={`pt-acts ${targets.length > 1 ? 'two' : ''}`}>
          {targets.map((k) => (
            <button key={k} className="pt-act gold" disabled={!wield} onClick={() => act({ t: 'equip', heroId: h.id, uid, slot: k })}>
              <Icon id="check" /> {fromSlot ? `Mover p/ ${SLOT_NAMES[k]}` : targets.length > 1 ? SLOT_NAMES[k] : 'Equipar'}
            </button>
          ))}
        </div>
      )}
      {(fromSlot && mine) || canUse || (inBase && loc.where !== 'armazem') || sell ? (
        <div className="pt-acts two">
          {fromSlot && mine && (
            <button className="pt-act" onClick={() => act({ t: 'unequip', heroId: h.id, slot: fromSlot })}>
              <Icon id="act_swap_weapon" /> Desequipar
            </button>
          )}
          {canUse && (
            <button className={`pt-act ${useOn ? 'on' : ''}`} onClick={() => setUseOn(!useOn)}>
              <Icon id="act_item" /> Usar
            </button>
          )}
          {inBase && loc.where !== 'armazem' && (
            <button className="pt-act" onClick={() => act({ t: 'transfer', uid, to: 'armazem' })}>
              <Icon id="save" /> Guardar no Armazém
            </button>
          )}
          {sell && (
            <button className="pt-act red" onClick={() => act({ t: 'sell', uid }, 'ui_coin')}>
              <Icon id="gold" /> Vender · {sellValue(d)} ouro
            </button>
          )}
        </div>
      ) : null}
      {canUse && useOn && (
        <div className="pt-give">
          <div className="pt-give-l">Usar em</div>
          <div className="pt-give-row">
            {st.heroes.map((x) => (
              <HeroDisc key={x.id} h={x} size={44} label={`Usar em ${x.name}`} onClick={() => act({ t: 'useOutOfCombat', heroId: h.id, uid, targetId: x.id }, 'heal')} />
            ))}
          </div>
        </div>
      )}
      {others.length > 0 && (
        <div className="pt-give">
          <div className="pt-give-l">{loc.where === 'armazem' ? 'Levar na Mochila de' : 'Dar para'}</div>
          <div className="pt-give-row">
            {others.map((x) => (
              <HeroDisc key={x.id} h={x} size={44} label={`Dar para ${x.name}`} onClick={() => act({ t: 'transfer', uid, to: x.id })} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
