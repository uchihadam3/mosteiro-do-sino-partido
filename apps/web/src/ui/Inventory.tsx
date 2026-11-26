import React, { useEffect, useMemo, useRef, useState } from 'react';
import { backpackCapacity, canWield, findItem, PRICES, reg, recordMaxHp, type HeroRecord, type ItemDef, type ItemRef } from '@mosteiro/core';
import { useSession } from '../app/hooks';
import { useApp } from '../app/App';
import { session } from '../state/session';
import { Icon } from './Icon';
import { CLASS_COLOR } from './data';
import { toast } from './Toasts';
import { audio } from '../audio/AudioDirector';
import { HeroDisc, Sheet } from './party/Sheet';
import { Delta, ItemArt, ItemFacts, keyStat, Pager, Price, shortText, StatBadge, statNum, useBump, useFit, usePages } from './gamekit';
import './party.css';
import './gamify.css';

type SlotKey = 'primary' | 'secondary' | 'armor' | 'acc0' | 'acc1';
const SLOT_NAMES: Record<SlotKey, string> = {
  primary: 'Mão principal',
  secondary: 'Mão secundária',
  armor: 'Armadura',
  acc0: 'Acessório',
  acc1: 'Acessório',
};
const SLOT_SHORT: Record<SlotKey, string> = {
  primary: 'Arma',
  secondary: '2ª arma',
  armor: 'Armadura',
  acc0: 'Acessório',
  acc1: 'Acessório',
};
const SLOT_ICON: Record<SlotKey, string> = {
  primary: 'item_sword',
  secondary: 'item_dagger',
  armor: 'item_armor_medium',
  acc0: 'item_accessory_ring',
  acc1: 'item_accessory_amulet',
};
const WANT: Record<SlotKey, ItemDef['slot']> = {
  primary: 'weapon',
  secondary: 'weapon',
  armor: 'armor',
  acc0: 'accessory',
  acc1: 'accessory',
};

export async function run(cmd: Parameters<typeof session.dispatch>[0], okSound = 'ui_equip') {
  const err = await session.dispatch(cmd);
  if (err) {
    toast(err, 'error');
    audio.play('ui_error', { volume: 0.6 });
  } else audio.play(okSound, { volume: 0.6 });
  return err;
}

export function sellValue(d: ItemDef) {
  if (d.slot === 'consumable') return Math.floor((d.price ?? 2) / 2);
  if (d.rarity === 'inicial') return 0;
  return d.rarity === 'epico' ? PRICES.epico.sell : d.rarity === 'raro' ? PRICES.raro.sell : PRICES.comum.sell;
}
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

const slotRefOf = (h: HeroRecord, k: SlotKey) => (k === 'acc0' ? h.equipment.accessories[0] : k === 'acc1' ? h.equipment.accessories[1] : h.equipment[k]);
/** The equipped item a candidate is compared with. */
function compareRef(h: HeroRecord, d: ItemDef): ItemRef | null {
  if (d.slot === 'weapon') return h.equipment.primary;
  if (d.slot === 'armor') return h.equipment.armor;
  return null;
}
function deltaFor(h: HeroRecord, d: ItemDef, against?: ItemRef | null) {
  const a = statNum(d);
  const curRef = against === undefined ? compareRef(h, d) : against;
  const b = curRef ? statNum(reg().items[curRef.itemId]) : d.slot === 'armor' ? 0 : undefined;
  return a !== undefined && b !== undefined ? a - b : 0;
}

/** Big item presentation for sheets: framed art, rarity ribbon, the key number as a badge, rules text. Also used by Base and Reward. */
export function ItemCard({ it, hero, compare }: { it: string; hero?: HeroRecord; compare?: string | null }) {
  const d = reg().items[it];
  if (!d) return null;
  const k = keyStat(d);
  const c = compare ? reg().items[compare] : null;
  const delta = c && statNum(d) !== undefined && statNum(c) !== undefined ? statNum(d)! - statNum(c)! : 0;
  return (
    <div className={`eq-show rc-${d.rarity}`}>
      <div className="eq-show-top">
        <ItemArt d={d} size="xl" />
        <div className="eq-show-id">
          <span className="gk-ribbon">
            {RAR[d.rarity]} · {KIND[d.slot]}
          </span>
          <div className="eq-show-nm">{d.name}</div>
          {k && <StatBadge icon={k.icon} v={k.v} l={k.l} tone={k.icon === 'hp' ? 'red' : 'gold'} delta={delta} />}
        </div>
      </div>
      <ItemFacts d={d} hero={hero} />
    </div>
  );
}

/** The chosen hero standing in 3D (Diorama.showcase frames them inside this box). */
export function StageBox({ heroId, active, children }: { heroId: string; active: boolean; children?: React.ReactNode }) {
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
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    if (stage.current && ro) ro.observe(stage.current);
    window.addEventListener('resize', place);
    return () => {
      clearTimeout(t);
      ro?.disconnect();
      window.removeEventListener('resize', place);
      diorama.showcase(null);
    };
  }, [diorama, heroId, active]);
  return (
    <div className="pt-stage eq-stage" ref={stage} aria-hidden>
      <span className="pt-stage-floor" />
      {children}
    </div>
  );
}

/** Round faces to switch hero (with a little badge when they have something to do). */
export function HeroTabs({ heroId, setHeroId, badge }: { heroId: string; setHeroId(id: string): void; badge?(h: HeroRecord): React.ReactNode }) {
  const s = useSession();
  const st = s.state!;
  if (st.heroes.length < 2) return null;
  return (
    <div className="pt-heroes eq-heroes" role="tablist" aria-label="Heróis">
      {st.heroes.map((x) => (
        <HeroDisc
          key={x.id}
          h={x}
          size={st.heroes.length >= 5 ? 42 : 48}
          on={x.id === heroId}
          badge={badge?.(x)}
          onClick={() => {
            if (x.id !== heroId) audio.play('ui_hover', { volume: 0.4 });
            setHeroId(x.id);
          }}
        />
      ))}
    </div>
  );
}

type InvSheet = { k: 'slot'; slot: SlotKey } | { k: 'item'; uid: string; back?: InvSheet } | null;

/**
 * Equipment as a paper doll: the hero in the middle (3D on the stage, or a big emblem), weapon / armour /
 * accessory sockets around them, the Cantil as a flask, and the bag (Mochila / Armazém) as a row of sockets.
 * Tapping a socket opens a card chooser; tapping a bag item opens its card with one clear action.
 */
export function Inventory({ heroId, setHeroId, inBase, sell, showHeroes = true, stage = false }: { heroId: string; setHeroId(id: string): void; inBase: boolean; sell?: boolean; showHeroes?: boolean; stage?: boolean }) {
  const s = useSession();
  const st = s.state!;
  const h = st.heroes.find((x) => x.id === heroId) ?? st.heroes[0];
  const [sheet, setSheet] = useState<InvSheet>(null);
  const mine = s.controls(h.id);
  const close = () => setSheet(null);
  const cands = (k: SlotKey) => [...h.backpack, ...(inBase ? st.armazem : [])].filter((r) => reg().items[r.itemId]?.slot === WANT[k]);

  const socket = (k: SlotKey) => {
    const r = slotRefOf(h, k);
    const list = cands(k);
    const curN = r ? statNum(reg().items[r.itemId]) : k === 'armor' ? 0 : undefined;
    const better = list.some((c) => {
      const n = statNum(reg().items[c.itemId]);
      return canWield(h, c.itemId) && n !== undefined && curN !== undefined && n > curN;
    });
    return <Socket key={k} k={k} r={r} hint={!r && list.length > 0 ? 'fill' : better ? 'up' : null} onOpen={() => setSheet({ k: 'slot', slot: k })} />;
  };

  return (
    <div className={`eq ${stage ? 'has-stage' : 'no-stage'}`} style={{ ['--acc' as string]: CLASS_COLOR[h.classId] }}>
      {showHeroes && (
        <HeroTabs
          heroId={h.id}
          setHeroId={(id) => {
            setHeroId(id);
            setSheet(null);
          }}
        />
      )}
      <Plate h={h} />
      <div className="eq-doll">
        <div className="eq-col l">
          {socket('primary')}
          {socket('armor')}
          {socket('acc0')}
        </div>
        <div className="eq-mid">
          {stage ? (
            <StageBox heroId={h.id} active />
          ) : (
            <div className="eq-emblem" aria-hidden>
              <Icon id={`class_${h.classId}`} />
            </div>
          )}
        </div>
        <div className="eq-col r">
          {socket('secondary')}
          {socket('acc1')}
          <Flask h={h} inBase={inBase} mine={mine} />
        </div>
      </div>
      <Bag h={h} inBase={inBase} onItem={(uid) => setSheet({ k: 'item', uid })} />

      {sheet?.k === 'slot' && <SlotSheet h={h} slot={sheet.slot} inBase={inBase} sell={!!sell} mine={mine} onClose={close} onItem={(uid) => setSheet({ k: 'item', uid, back: sheet })} />}
      {sheet?.k === 'item' && <ItemSheet h={h} uid={sheet.uid} inBase={inBase} sell={!!sell} mine={mine} onClose={close} onBack={sheet.back ? () => setSheet(sheet.back!) : undefined} />}
    </div>
  );
}

/** Name plate: who, class, a chunky HP bar and the total armour. */
function Plate({ h }: { h: HeroRecord }) {
  const max = recordMaxHp(h);
  const arm = h.equipment.armor ? (reg().items[h.equipment.armor.itemId]?.armor ?? 0) : 0;
  const pct = Math.max(0, Math.min(100, (h.hp / max) * 100));
  return (
    <div className="eq-plate">
      <div className="eq-plate-id">
        <span className="eq-plate-nm">{h.name}</span>
        <span className="eq-plate-cl">{reg().classes[h.classId].name}</span>
      </div>
      <div className="eq-hpbar" role="img" aria-label={`Vida ${h.hp} de ${max}`}>
        <i style={{ width: `${pct}%` }} />
        <span>
          <Icon id="hp" /> {h.hp}/{max}
        </span>
      </div>
      <StatBadge icon="armor" v={arm} tone="blue" />
      {h.trauma ? <StatBadge icon="cond_trauma" v={h.trauma} tone="red" /> : null}
    </div>
  );
}

function Socket({ k, r, hint, onOpen }: { k: SlotKey; r: ItemRef | null; hint: 'fill' | 'up' | null; onOpen(): void }) {
  const d = r ? reg().items[r.itemId] : null;
  const pop = useBump(r?.uid ?? '', 700);
  const st = d ? keyStat(d) : null;
  const big = k === 'primary' || k === 'secondary';
  return (
    <button
      className={`pt-slot s-${k} eq-sock ${big ? 'big' : ''} ${d ? `full rc-${d.rarity}` : 'empty'} ${hint ? `hint-${hint}` : ''} ${pop ? 'pop' : ''}`}
      onClick={onOpen}
      aria-label={`${SLOT_NAMES[k]}: ${d?.name ?? 'vazio'}`}
    >
      <span className="eq-sock-frame">
        {d ? (
          <Icon id={d.icon} />
        ) : (
          <>
            <Icon id={SLOT_ICON[k]} className="ghost" />
            <span className="eq-plus">+</span>
          </>
        )}
        {st && (
          <span className={`eq-sock-n ${st.icon === 'hp' ? 'red' : st.icon === 'armor' ? 'blue' : ''}`}>
            <Icon id={st.icon} />
            {st.v}
          </span>
        )}
        {hint === 'up' && (
          <span className="eq-up" aria-label="Tem algo melhor na bolsa">
            ▲
          </span>
        )}
      </span>
      <span className="eq-sock-l">{d ? d.name : hint === 'fill' ? 'Equipar' : SLOT_SHORT[k]}</span>
    </button>
  );
}

/** The Cantil as a flask socket: charges as pips; tap to drink when it helps. */
function Flask({ h, inBase, mine }: { h: HeroRecord; inBase: boolean; mine: boolean }) {
  const s = useSession();
  const st = s.state!;
  const max = recordMaxHp(h);
  const can = !inBase && st.phase !== 'combat' && mine && h.status === 'ok' && h.cantil > 0 && h.hp < max;
  return (
    <button
      className={`eq-sock eq-flask ${can ? 'go' : ''}`}
      disabled={!can}
      onClick={() => void run({ t: 'drinkCantil', heroId: h.id }, 'heal')}
      aria-label={can ? 'Beber do Cantil (+3 Vida)' : `Cantil ${h.cantil}/${h.cantilMax}`}
      title="Cantil: cura 3"
    >
      <span className="eq-sock-frame">
        <Icon id="cantil" />
        <span className="eq-pips" aria-hidden>
          {Array.from({ length: h.cantilMax }).map((_, i) => (
            <i key={i} className={i < h.cantil ? 'on' : ''} />
          ))}
        </span>
      </span>
      <span className="eq-sock-l">{can ? 'Beber +3' : 'Cantil'}</span>
    </button>
  );
}

/** Mochila (and Armazém in the Base) as sockets that page instead of scrolling. */
function Bag({ h, inBase, onItem }: { h: HeroRecord; inBase: boolean; onItem(uid: string): void }) {
  const s = useSession();
  const st = s.state!;
  const cap = backpackCapacity(st.partySizeOriginal);
  const [tab, setTab] = useState<'bag' | 'store'>('bag');
  const which = inBase ? tab : 'bag';
  const fit = useFit(58, 58, 8);
  const cells: (ItemRef | null)[] = useMemo(() => {
    if (which === 'store') return st.armazem.length ? st.armazem : [null];
    return Array.from({ length: Math.max(cap, h.backpack.length) }).map((_, i) => h.backpack[i] ?? null);
  }, [which, st.armazem, h.backpack, cap]);
  const pg = usePages(cells, fit.per, `${which}:${h.id}`);
  return (
    <div className="eq-bag">
      <div className="eq-bag-tabs" role={inBase ? 'tablist' : undefined}>
        <button className={which === 'bag' ? 'on' : ''} onClick={() => setTab('bag')} role={inBase ? 'tab' : undefined} aria-selected={which === 'bag'}>
          <Icon id="mochila" /> Mochila{' '}
          <b className={h.backpack.length >= cap ? 'full' : ''}>
            {h.backpack.length}/{cap}
          </b>
        </button>
        {inBase && (
          <button className={which === 'store' ? 'on' : ''} onClick={() => setTab('store')} role="tab" aria-selected={which === 'store'}>
            <Icon id="save" /> Armazém <b>{st.armazem.length}</b>
          </button>
        )}
        <Pager page={pg.page} pages={pg.pages} setPage={pg.setPage} label="Páginas da bolsa" />
      </div>
      <div className="eq-cells" ref={fit.ref}>
        {pg.items.map((r, i) =>
          r ? (
            <BagCell key={r.uid} h={h} r={r} onClick={() => onItem(r.uid)} />
          ) : (
            <span key={`e${i}`} className="eq-cell empty" aria-hidden>
              {which === 'store' ? <em>Vazio</em> : null}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

function BagCell({ h, r, onClick }: { h: HeroRecord; r: ItemRef; onClick(): void }) {
  const d = reg().items[r.itemId];
  if (!d) return null;
  const k = keyStat(d);
  const dl = canWield(h, d.id) ? deltaFor(h, d) : 0;
  return (
    <button className={`eq-cell full rc-${d.rarity} pt-tile`} onClick={onClick} aria-label={d.name} title={d.name}>
      <Icon id={d.icon} />
      {k && <span className="eq-cell-n">{k.v}</span>}
      {dl > 0 && <span className="eq-up sm">▲</span>}
      {d.slot === 'consumable' && <span className="eq-cell-c">Usar</span>}
    </button>
  );
}

/** Tap on a socket: what is there + the items that fit, as cards to compare; one big "Equipar". */
function SlotSheet({ h, slot, inBase, mine, onClose, onItem }: { h: HeroRecord; slot: SlotKey; inBase: boolean; sell: boolean; mine: boolean; onClose(): void; onItem(uid: string): void }) {
  const s = useSession();
  const st = s.state!;
  const cur = slotRefOf(h, slot);
  const curDef = cur ? reg().items[cur.itemId] : null;
  const want = WANT[slot];
  const cands = useMemo(
    () =>
      [...h.backpack.map((r) => ({ r, from: 'Mochila' })), ...(inBase ? st.armazem.map((r) => ({ r, from: 'Armazém' })) : [])]
        .filter(({ r }) => reg().items[r.itemId]?.slot === want)
        .map((c) => ({
          ...c,
          ok: canWield(h, c.r.itemId),
          dl: deltaFor(h, reg().items[c.r.itemId], cur),
        }))
        .sort((a, b) => Number(b.ok) - Number(a.ok) || b.dl - a.dl),
    [h, st.armazem, inBase, want, cur],
  );
  const [pick, setPick] = useState<string | null>(() => cands.find((c) => c.ok)?.r.uid ?? null);
  const fit = useFit(118, 176, 10);
  const pg = usePages(cands, fit.per);
  const chosen = cands.find((c) => c.r.uid === pick);
  const equip = () => {
    if (!chosen) return;
    void run({ t: 'equip', heroId: h.id, uid: chosen.r.uid, slot });
    onClose();
  };
  return (
    <Sheet onClose={onClose} kicker={h.name} title={SLOT_NAMES[slot]} className="eq-sheet eq-chooser">
      <div className="eq-ch-body">
        <div className="eq-ch-now">
          <span className="eq-ch-cap">Equipado</span>
          {curDef ? (
            <button className={`eq-now rc-${curDef.rarity}`} onClick={() => onItem(cur!.uid)} aria-label={`Detalhes: ${curDef.name}`}>
              <ItemArt d={curDef} size="sm" />
              <span className="eq-now-nm">{curDef.name}</span>
              {keyStat(curDef) && <StatBadge icon={keyStat(curDef)!.icon} v={keyStat(curDef)!.v} tone={keyStat(curDef)!.icon === 'hp' ? 'red' : 'gold'} />}
              <span className="eq-i" aria-hidden>
                <Icon id="info" />
              </span>
            </button>
          ) : (
            <div className="eq-now none">
              <ItemArt d={null} size="sm" />
              <span className="eq-now-nm">Vazio</span>
            </div>
          )}
          {cur && mine && (
            <button
              className="gk-mini"
              onClick={() => {
                void run({ t: 'unequip', heroId: h.id, slot }, 'ui_cancel');
                onClose();
              }}
            >
              <Icon id="act_swap_weapon" /> Tirar
            </button>
          )}
        </div>

        {cands.length === 0 ? (
          <div className="eq-ch-empty">
            <span className="eq-ch-empty-art">
              <Icon id={SLOT_ICON[slot]} />
            </span>
            <b>Nada que sirva aqui</b>
            <span>{inBase ? 'Compre na Loja ou vença batalhas.' : 'Vença batalhas para achar itens.'}</span>
          </div>
        ) : (
          <div className="eq-ch-pick">
            <div className="eq-ch-cards" ref={fit.ref}>
              {pg.items.map(({ r, from, ok, dl }, i) => {
                const d = reg().items[r.itemId];
                const k = keyStat(d);
                return (
                  <div key={r.uid} className="eq-cardwrap" style={{ animationDelay: `${i * 50}ms` }}>
                    <button
                      className={`eq-card rc-${d.rarity} ${pick === r.uid ? 'sel' : ''} ${ok ? '' : 'locked'}`}
                      onClick={() => {
                        setPick(r.uid);
                        audio.play('ui_hover', { volume: 0.35 });
                      }}
                      aria-pressed={pick === r.uid}
                      aria-label={`${d.name}${ok ? '' : ' (não pode usar)'}`}
                    >
                      <ItemArt d={d} size="lg" dim={!ok} />
                      <span className="eq-card-nm">{d.name}</span>
                      {k ? (
                        <span className="eq-card-k">
                          <StatBadge icon={k.icon} v={k.v} tone={k.icon === 'hp' ? 'red' : 'gold'} />
                          <Delta n={dl} />
                        </span>
                      ) : (
                        <span className="eq-card-k">
                          <span className="gk-tag">{RAR[d.rarity]}</span>
                        </span>
                      )}
                      <span className="eq-card-tx">{shortText(d)}</span>
                      <span className="eq-card-from">{ok ? from : 'Não usa'}</span>
                      {!ok && (
                        <span className="eq-lock" aria-hidden>
                          <Icon id="map_lock" />
                        </span>
                      )}
                    </button>
                    <button className="eq-i-btn" onClick={() => onItem(r.uid)} aria-label={`Detalhes: ${d.name}`}>
                      <Icon id="info" />
                    </button>
                  </div>
                );
              })}
            </div>
            <Pager page={pg.page} pages={pg.pages} setPage={pg.setPage} />
          </div>
        )}
      </div>
      {mine && cands.length > 0 && (
        <div className="eq-ch-foot">
          <button className="k-cta eq-go" disabled={!chosen || !chosen.ok} onClick={equip}>
            <Icon id="check" /> {chosen ? (chosen.ok ? 'Equipar' : 'Não pode usar') : 'Escolha um item'}
          </button>
        </div>
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
  const equippedHere = loc.where === 'equip' && loc.hero?.id === h.id;
  const cmp = !equippedHere ? compareRef(h, d) : null;
  const where = loc.where === 'armazem' ? 'No Armazém' : loc.where === 'backpack' ? `Mochila de ${loc.hero?.name}` : `Equipado em ${loc.hero?.name}`;
  return (
    <Sheet onClose={onClose} onBack={onBack} kicker={where} label={d.name} title=" " className="eq-sheet eq-itemsheet">
      <div className="eq-is-grid">
        <ItemCard it={d.id} hero={h} compare={cmp?.itemId} />
        <ItemActions h={h} uid={uid} inBase={inBase} sell={sell} mine={mine} done={onClose} />
      </div>
    </Sheet>
  );
}

/** One clear main action (equip / use) and small icon actions (give, store, sell, take off). */
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
  const tname = (k: SlotKey) =>
    fromSlot ? `Mover p/ ${SLOT_SHORT[k]}` : targets.length > 1 ? (k === 'primary' ? 'Mão principal' : k === 'secondary' ? 'Mão secundária' : k === 'acc0' ? 'Acessório 1' : 'Acessório 2') : 'Equipar';
  return (
    <div className="eq-acts">
      {mine && targets.length > 0 && (
        <div className={`eq-acts-main ${targets.length > 1 ? 'two' : ''}`}>
          {targets.map((k) => (
            <button key={k} className="k-cta eq-go" disabled={!wield} onClick={() => act({ t: 'equip', heroId: h.id, uid, slot: k })}>
              <Icon id="check" /> {wield ? tname(k) : 'Não pode usar'}
            </button>
          ))}
        </div>
      )}
      {canUse && (
        <button className={`k-cta eq-go ${useOn ? 'on' : ''}`} onClick={() => setUseOn(!useOn)}>
          <Icon id="act_item" /> Usar
        </button>
      )}
      {canUse && useOn && (
        <div className="eq-give">
          <span className="eq-give-l">Em quem?</span>
          <div className="eq-give-row">
            {st.heroes.map((x) => (
              <HeroDisc key={x.id} h={x} size={42} label={`Usar em ${x.name}`} onClick={() => act({ t: 'useOutOfCombat', heroId: h.id, uid, targetId: x.id }, 'heal')} />
            ))}
          </div>
        </div>
      )}
      <div className="eq-acts-row">
        {fromSlot && mine && (
          <button className="gk-tile" onClick={() => act({ t: 'unequip', heroId: h.id, slot: fromSlot }, 'ui_cancel')}>
            <Icon id="act_swap_weapon" />
            <span>Tirar</span>
          </button>
        )}
        {inBase && loc.where !== 'armazem' && (
          <button className="gk-tile" onClick={() => act({ t: 'transfer', uid, to: 'armazem' })}>
            <Icon id="save" />
            <span>Guardar</span>
          </button>
        )}
        {sell && (
          <button className="gk-tile sell" onClick={() => act({ t: 'sell', uid }, 'ui_coin')}>
            <Price n={sellValue(d)} />
            <span>Vender</span>
          </button>
        )}
      </div>
      {others.length > 0 && (
        <div className="eq-give">
          <span className="eq-give-l">{loc.where === 'armazem' ? 'Levar na Mochila de' : 'Dar para'}</span>
          <div className="eq-give-row">
            {others.map((x) => (
              <HeroDisc key={x.id} h={x} size={42} label={`Dar para ${x.name}`} onClick={() => act({ t: 'transfer', uid, to: x.id })} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
