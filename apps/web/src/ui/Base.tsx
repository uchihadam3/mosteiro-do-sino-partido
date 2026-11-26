import React, { useEffect, useState } from 'react';
import { MASTERY_COST, PRICES, reg, type Attr, type HeroRecord, type TalentDef } from '@mosteiro/core';
import { maxTalentTier } from '@mosteiro/content';
import { useSession } from '../app/hooks';
import { useApp } from '../app/App';
import { Icon } from './Icon';
import { HeroTabs, Inventory, ItemCard, run } from './Inventory';
import './party.css';
import { ATTR_NAME, ATTR_ORDER, CLASS_COLOR } from './data';
import { session } from '../state/session';
import { VoteBar } from './Explore';
import { Sheet } from './party/Sheet';
import { toast } from './Toasts';
import { audio } from '../audio/AudioDirector';
import { FloatDiff, ItemArt, keyStat, Pager, Price, useBump, useFit, useMedia, usePages, WIDE } from './gamekit';
import './menus.css';
import './gamify.css';
import './base.css';

type Tab = 'loja' | 'equip' | 'herois' | 'servicos';
type Kind = 'comum' | 'raro' | 'consumivel' | 'usado';
type Ware = { id: string; kind: Kind; idx: number };

const acc = (classId: string) => ({ '--acc': CLASS_COLOR[classId] }) as React.CSSProperties;

export function Base() {
  const s = useSession();
  const st = s.state!;
  const { go } = useApp();
  const [tab, setTab] = useState<Tab>('loja');
  const [heroId, setHeroId] = useState(st.heroes[0].id);
  const [fresh, setFresh] = useState(0);
  const unspent = st.heroes.some((h) => h.masteryPoints > 0 || h.talentPoints > 0);
  const done = st.phase === 'complete';
  const bump = useBump(st.gold, 700);
  const tabs: [Tab, string, string][] = [
    ['loja', 'Loja', 'gold'],
    ['equip', 'Equipar', 'mochila'],
    ['herois', 'Heróis', 'talento'],
    ['servicos', 'Serviços', 'act_item'],
  ];
  const pick = (k: Tab) => {
    if (k !== tab) audio.play('ui_hover', { volume: 0.35 });
    if (k === 'equip') setFresh(0);
    setTab(k);
  };
  return (
    <div className={`k-screen m-base gx-base tab-${tab}`}>
      <div className="k-head m-head-pad">
        <div className="k-title">
          <div className="k-kicker">Base · D{st.dungeonsCompleted} vencida</div>
          <h1 className="k-h1">
            Refúgio<span className="m-pc-inline"> dos Peregrinos</span>
          </h1>
        </div>
        <span className={`m-gold-pill bx-gold ${bump ? 'bump' : ''}`} aria-label={`${st.gold} ouro`}>
          <span className="gk-coin" aria-hidden>
            <Icon id="gold" />
          </span>
          {st.gold}
          <FloatDiff v={st.gold} />
        </span>
      </div>
      <div className="m-tabbar">
        <div className="k-tabs gx-tabs" role="tablist">
          {tabs.map(([k, l, ic]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => pick(k)}>
              <Icon id={ic} /> {l}
              {k === 'herois' && unspent && <span className="dot" aria-label="pontos para gastar" />}
              {k === 'equip' && fresh > 0 && <span className="bx-new">+{fresh}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="k-body bx-body">
        {tab === 'loja' && <Shop heroId={heroId} onBought={() => setFresh((n) => n + 1)} />}
        {tab === 'equip' && (
          <div className="pt-pane-equip b-equip bx-equip">
            <Inventory heroId={heroId} setHeroId={setHeroId} inBase sell stage />
          </div>
        )}
        {tab === 'herois' && <Heroes heroId={heroId} setHeroId={setHeroId} />}
        {tab === 'servicos' && <Services onBought={() => setTab('loja')} />}
      </div>
      <div className="k-foot">
        {done ? (
          <>
            <div className="k-note">A Dungeon 2 ainda está em desenvolvimento. Seu progresso fica salvo.</div>
            <button
              className="k-btn"
              onClick={() => {
                session.close();
                go('title');
              }}
            >
              <Icon id="back" /> Menu principal
            </button>
          </>
        ) : (
          <>
            <VoteBar voteKey="leaveBase" />
            <button className="k-cta" onClick={() => void run({ t: 'leaveBase' }, 'ui_confirm')}>
              <Icon id="map_path" /> Partir
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function priceOf(id: string, kind: Kind) {
  const r = reg().items[id];
  if (kind === 'consumivel') return r.price ?? 2;
  if (kind === 'raro') return PRICES.raro.buy;
  if (kind === 'usado') return r.rarity === 'raro' ? PRICES.raro.buy : r.rarity === 'epico' ? PRICES.epico.buy : PRICES.comum.buy;
  return PRICES.comum.buy;
}

/** One item standing on the merchant's shelf: art, name, key number, hanging price tag. */
function WareCard({ w, onOpen, i, noPrice }: { w: Ware; onOpen(): void; i: number; noPrice?: boolean }) {
  const s = useSession();
  const st = s.state!;
  const d = reg().items[w.id];
  const p = priceOf(w.id, w.kind);
  const poor = !noPrice && st.gold < p;
  const k = keyStat(d);
  return (
    <button
      className={`sh-ware rc-${d.rarity} ${poor ? 'poor' : ''}`}
      style={{ animationDelay: `${i * 45}ms` }}
      onClick={onOpen}
      aria-label={`${d.name}${noPrice ? '' : `, ${p} ouro`}${poor ? ' (sem ouro suficiente)' : ''}`}
    >
      {st.base?.reserva === w.id && <span className="sh-res">Reservado</span>}
      <ItemArt d={d} size="lg" dim={poor} />
      <span className="sh-nm">{d.name}</span>
      {k ? (
        <span className="sh-k">
          <Icon id={k.icon} /> {k.v}
        </span>
      ) : (
        <span className="sh-k plain">{d.slot === 'consumable' ? 'Consumível' : 'Acessório'}</span>
      )}
      {!noPrice && (
        <span className="sh-tag">
          <Price n={p} poor={poor} />
        </span>
      )}
    </button>
  );
}

/** A shelf of cards that pages (no scrolling). */
function Shelf({ list, empty, onOpen, noPrice, resetKey }: { list: Ware[]; empty: string; onOpen(w: Ware): void; noPrice?: boolean; resetKey?: unknown }) {
  const wide = useMedia(WIDE);
  const fit = useFit(wide ? 124 : 100, wide ? 188 : 168, wide ? 14 : 8, 1, wide ? 10 : 8);
  const pg = usePages(list, fit.per, resetKey);
  return (
    <div className="sh-shelfwrap">
      <div className="sh-shelf" ref={fit.ref} style={{ ['--rows' as string]: fit.rows }}>
        {list.length === 0 ? <div className="sh-empty">{empty}</div> : pg.items.map((w, i) => <WareCard key={w.kind + w.id + w.idx} w={w} i={i} noPrice={noPrice} onOpen={() => onOpen(w)} />)}
      </div>
      <Pager page={pg.page} pages={pg.pages} setPage={pg.setPage} />
    </div>
  );
}

function Shop({ heroId, onBought }: { heroId: string; onBought(): void }) {
  const s = useSession();
  const st = s.state!;
  const B = st.base!;
  const [sel, setSel] = useState<Ware | null>(null);
  const [shelf, setShelf] = useState<'vitrine' | 'cons' | 'usados'>('vitrine');
  const wares = (ids: string[], kind: Kind): Ware[] => ids.map((id, idx) => ({ id, kind, idx }));
  const shelves: {
    k: typeof shelf;
    l: string;
    icon: string;
    list: Ware[];
    empty: string;
  }[] = [
    {
      k: 'vitrine',
      l: 'Vitrine',
      icon: 'item_sword',
      list: [...wares(B.vitrine.comum, 'comum'), ...wares(B.vitrine.raro, 'raro')],
      empty: 'A Vitrine está vazia.',
    },
    {
      k: 'cons',
      l: 'Poções',
      icon: 'item_consumable_vial',
      list: wares(B.consumables, 'consumivel'),
      empty: 'Nenhum consumível nesta visita.',
    },
    {
      k: 'usados',
      l: 'Usados',
      icon: 'act_swap',
      list: wares(st.usados, 'usado'),
      empty: 'Itens que você vender aparecem aqui.',
    },
  ];
  const cur = shelves.find((x) => x.k === shelf)!;
  return (
    <div className="sh">
      <div className="sh-shelves" role="group" aria-label="Prateleiras">
        {shelves.map((x) => (
          <button key={x.k} className={shelf === x.k ? 'on' : ''} aria-pressed={shelf === x.k} onClick={() => setShelf(x.k)}>
            <Icon id={x.icon} /> {x.l} <b>{x.list.length}</b>
          </button>
        ))}
      </div>
      <Shelf list={cur.list} empty={cur.empty} onOpen={setSel} resetKey={shelf} />
      <div className="sh-hint">
        <Icon id="save" /> Compras vão para o Armazém · venda na aba Equipar
      </div>
      {sel && <BuySheet sel={sel} heroId={heroId} onClose={() => setSel(null)} onBought={onBought} />}
    </div>
  );
}

function BuySheet({ sel, heroId, onClose, onBought }: { sel: Ware; heroId: string; onClose(): void; onBought(): void }) {
  const s = useSession();
  const st = s.state!;
  const B = st.base!;
  const price = priceOf(sel.id, sel.kind);
  const poor = st.gold < price;
  const isVitrine = sel.kind === 'comum' || sel.kind === 'raro';
  const remessa = sel.kind === 'comum' ? 'remessaComum' : 'remessaRara';
  const swapCost = sel.kind === 'comum' ? 2 : 3;
  const d = reg().items[sel.id];
  return (
    <Sheet title=" " kicker={sel.kind === 'consumivel' ? 'Poções' : sel.kind === 'usado' ? 'Usados' : 'Vitrine'} label={d.name} onClose={onClose} className="eq-sheet eq-itemsheet sh-buy">
      <div className="eq-is-grid">
        <ItemCard it={sel.id} hero={st.heroes.find((h) => h.id === heroId)} />
        <div className="eq-acts">
          <div className="sh-pricebig">
            <Price n={price} poor={poor} big />
            {poor && <span className="sh-miss">Faltam {price - st.gold}</span>}
          </div>
          <button
            className="k-cta eq-go"
            disabled={poor}
            onClick={() => {
              void run({ t: 'buy', itemId: sel.id, kind: sel.kind, heroId: 'armazem' }, 'ui_coin').then((err) => {
                if (err) return;
                toast(`${d.name} foi para o Armazém.`);
                onBought();
              });
              onClose();
            }}
          >
            <Icon id="gold" /> Comprar
          </button>
          {isVitrine && (
            <div className="eq-acts-row">
              <button
                className="gk-tile"
                disabled={st.gold < 1}
                onClick={() =>
                  void run(
                    {
                      t: 'service',
                      id: 'reserva',
                      index: sel.kind === 'comum' ? sel.idx : B.vitrine.comum.length + sel.idx,
                    },
                    'ui_coin',
                  ).then((err) => !err && toast('Reservado para a próxima visita.'))
                }
              >
                <Price n={1} poor={st.gold < 1} />
                <span>Reservar</span>
              </button>
              <button
                className="gk-tile"
                disabled={!!B.servicesUsed[remessa] || st.gold < swapCost}
                onClick={() => {
                  void run({ t: 'service', id: remessa, index: sel.idx }, 'ui_page');
                  onClose();
                }}
              >
                <Price n={swapCost} poor={st.gold < swapCost} />
                <span>{B.servicesUsed[remessa] ? 'Já trocou' : 'Trocar'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function Services({ onBought }: { onBought(): void }) {
  const s = useSession();
  const st = s.state!;
  const B = st.base!;
  const [pick, setPick] = useState<'remessaComum' | 'remessaRara' | 'reserva' | null>(null);
  const list: {
    id: 'remessaComum' | 'remessaRara' | 'reserva';
    t: string;
    d: string;
    cost: number;
    icon: string;
    used: boolean;
  }[] = [
    {
      id: 'remessaComum',
      t: 'Nova Remessa',
      d: 'Troca 1 item Comum da Vitrine',
      cost: 2,
      icon: 'item_sword',
      used: !!B.servicesUsed.remessaComum,
    },
    {
      id: 'remessaRara',
      t: 'Remessa Rara',
      d: 'Troca 1 item Raro da Vitrine',
      cost: 3,
      icon: 'item_orb',
      used: !!B.servicesUsed.remessaRara,
    },
    {
      id: 'reserva',
      t: 'Reserva',
      d: 'Guarda 1 item para a próxima visita',
      cost: 1,
      icon: 'selo_peso',
      used: false,
    },
  ];
  const cards: Ware[] =
    pick === 'remessaComum'
      ? B.vitrine.comum.map((id, i) => ({ id, kind: 'comum', idx: i }))
      : pick === 'remessaRara'
        ? B.vitrine.raro.map((id, i) => ({ id, kind: 'raro', idx: i }))
        : [...B.vitrine.comum, ...B.vitrine.raro].map((id, i) => ({
            id,
            kind: 'comum',
            idx: i,
          }));
  return (
    <div className="sv">
      <div className="sv-cards">
        {list.map((x, i) => {
          const poor = st.gold < x.cost;
          return (
            <button key={x.id} className={`sv-card ${x.used ? 'used' : ''} ${poor ? 'poor' : ''}`} style={{ animationDelay: `${i * 70}ms` }} disabled={x.used || poor} onClick={() => setPick(x.id)}>
              <span className="sv-medal">
                <Icon id={x.icon} />
              </span>
              <span className="t">{x.t}</span>
              <span className="d">{x.used ? 'Já usado nesta visita' : x.d}</span>
              <span className="sv-foot">
                <Price n={x.cost} poor={poor} />
                {x.id !== 'reserva' && <small>1× por visita</small>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="sh-hint">Sem cura nem Maestria pagas · venda rende metade do preço</div>
      {pick && (
        <Sheet kicker={list.find((x) => x.id === pick)!.t} title={pick === 'reserva' ? 'Reservar qual item?' : 'Trocar qual item?'} onClose={() => setPick(null)} className="eq-sheet sv-sheet">
          <Shelf
            list={cards}
            noPrice
            empty="Nenhum item disponível."
            onOpen={(w) => {
              void run({ t: 'service', id: pick, index: w.idx }, pick === 'reserva' ? 'ui_coin' : 'ui_page').then((err) => {
                if (err) return;
                toast(pick === 'reserva' ? 'Reservado para a próxima visita.' : 'Chegou mercadoria nova na Vitrine.');
                if (pick !== 'reserva') onBought();
              });
              setPick(null);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Heróis: dice & talent tree */
const ROMAN = ['', 'I', 'II', 'III', 'IV'];

function Heroes({ heroId, setHeroId }: { heroId: string; setHeroId(id: string): void }) {
  const s = useSession();
  const st = s.state!;
  const h = st.heroes.find((x) => x.id === heroId) ?? st.heroes[0];
  const mine = s.controls(h.id);
  const [view, setView] = useState<'dice' | 'tree'>(() => (h.masteryPoints === 0 && h.talentPoints > 0 ? 'tree' : 'dice'));
  const [info, setInfo] = useState<string | null>(null);
  return (
    <div className="hx" style={acc(h.classId)}>
      <div className="hx-side">
        <HeroTabs
          heroId={h.id}
          setHeroId={setHeroId}
          badge={(x) => {
            const pts = x.masteryPoints + x.talentPoints;
            return pts > 0 ? <span className="m-badge">{pts}</span> : null;
          }}
        />
        <HeroHeader h={h} mine={mine} />
        <div className="hx-switch" role="group" aria-label="Evolução">
          <button className={view === 'dice' ? 'on' : ''} aria-pressed={view === 'dice'} onClick={() => setView('dice')}>
            <Icon id="maestria" /> Maestria {h.masteryPoints > 0 && <b>{h.masteryPoints}</b>}
          </button>
          <button className={view === 'tree' ? 'on' : ''} aria-pressed={view === 'tree'} onClick={() => setView('tree')}>
            <Icon id="talento" /> Talentos {h.talentPoints > 0 && <b>{h.talentPoints}</b>}
          </button>
        </div>
      </div>
      <div className={`hx-main show-${view}`}>
        <Dice h={h} mine={mine} />
        <Tree h={h} onInfo={setInfo} />
      </div>
      {info && <TalentSheet h={h} id={info} mine={mine} onClose={() => setInfo(null)} />}
    </div>
  );
}

function HeroHeader({ h, mine }: { h: HeroRecord; mine: boolean }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const cls = reg().classes[h.classId];
  useEffect(() => setRenaming(null), [h.id]);
  const saveName = () => {
    const n = (renaming ?? '').trim();
    if (n && n !== h.name) void run({ t: 'renameHero', heroId: h.id, name: n }, 'ui_confirm');
    setRenaming(null);
  };
  return (
    <div className="hx-head">
      <span className="hx-emb">
        <Icon id={`class_${h.classId}`} />
      </span>
      <div className="hx-id">
        {renaming !== null ? (
          <div className="m-rename">
            <input className="k-input" autoFocus value={renaming} maxLength={18} onChange={(e) => setRenaming(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveName()} aria-label="Nome do herói" />
            <button className="k-round" onClick={saveName} aria-label="Salvar nome">
              <Icon id="check" />
            </button>
          </div>
        ) : (
          <div className="hx-nm">
            <span>{h.name}</span>
            {mine && (
              <button onClick={() => setRenaming(h.name)} aria-label="Renomear">
                <Icon id="verso" />
              </button>
            )}
          </div>
        )}
        <div className="hx-cl">{cls.name}</div>
      </div>
      <div className="hx-pts">
        <span className={`hx-pt ${h.masteryPoints ? 'on' : ''}`} title="Pontos de Maestria">
          <Icon id="maestria" />
          <b>{h.masteryPoints}</b>
        </span>
        <span className={`hx-pt ${h.talentPoints ? 'on' : ''}`} title="Pontos de Talento">
          <Icon id="talento" />
          <b>{h.talentPoints}</b>
        </span>
      </div>
    </div>
  );
}

/** Attributes as dice: the die you roll now, and what one upgrade turns it into. */
function Dice({ h, mine }: { h: HeroRecord; mine: boolean }) {
  return (
    <div className="hx-dice" aria-label="Maestria">
      {ATTR_ORDER.map((a, i) => {
        const g = h.attrs[a];
        const cost = MASTERY_COST[g];
        const max = g >= 12;
        const can = !max && h.masteryPoints >= (cost ?? 99) && mine;
        return <Die key={a} a={a} g={g} cost={cost} max={max} can={can} i={i} onUp={() => void run({ t: 'mastery', heroId: h.id, attr: a }, 'level_up')} />;
      })}
    </div>
  );
}
function Die({ a, g, cost, max, can, i, onUp }: { a: Attr; g: number; cost?: number; max: boolean; can: boolean; i: number; onUp(): void }) {
  const pop = useBump(g, 700);
  return (
    <button
      className={`hx-die ${can ? 'can' : ''} ${max ? 'max' : ''} ${pop ? 'pop' : ''}`}
      style={{ animationDelay: `${i * 35}ms` }}
      disabled={!can}
      onClick={onUp}
      aria-label={`${ATTR_NAME[a]}: D${g}${max ? ', máximo' : can ? `. Subir para D${g + 2} por ${cost} ponto${cost === 1 ? '' : 's'}` : ''}`}
    >
      <span className="hx-an">
        <Icon id={`attr_${a}`} /> {ATTR_NAME[a]}
      </span>
      <span className="hx-face">
        <Icon id={`dice_d${Math.min(12, Math.max(4, g))}`} />
        <b>D{g}</b>
      </span>
      <span className="hx-up">
        {max ? (
          <em>Máx.</em>
        ) : (
          <>
            ▲ D{g + 2} <i>{cost}</i>
          </>
        )}
      </span>
    </button>
  );
}

/** Talent tree: one column (or row, sideways) per path, tiers I–IV joined by a line. */
function Tree({ h, onInfo }: { h: HeroRecord; onInfo(id: string): void }) {
  const s = useSession();
  const st = s.state!;
  const cls = reg().classes[h.classId];
  const all = Object.values(reg().talents).filter((t) => t.classId === h.classId);
  const maxTier = maxTalentTier(st.dungeonsCompleted);
  const mine = s.controls(h.id);
  return (
    <div className="hx-tree" aria-label="Talentos">
      {cls.talentPaths.map((p) => {
        const list = all.filter((t) => t.path === p.id).sort((a, b) => a.tier - b.tier);
        return (
          <div key={p.id} className="hx-path">
            <div className="hx-pname">{p.name}</div>
            <div className="hx-nodes">
              {list.map((t) => {
                const owned = h.talents.includes(t.id);
                const locked = t.tier > maxTier;
                const can = !owned && !locked && h.talentPoints > 0 && mine;
                return (
                  <button
                    key={t.id}
                    className={`hx-node ${owned ? 'owned' : locked ? 'locked' : can ? 'can' : ''}`}
                    onClick={() => onInfo(t.id)}
                    aria-label={`${t.name} (T${t.tier})${owned ? ', aprendido' : locked ? ', bloqueado' : ''}`}
                  >
                    <span className="hx-orb">{owned ? <Icon id="check" /> : locked ? <Icon id="map_lock" /> : <b>{ROMAN[t.tier]}</b>}</span>
                    <span className="hx-tn">{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TalentSheet({ h, id, mine, onClose }: { h: HeroRecord; id: string; mine: boolean; onClose(): void }) {
  const s = useSession();
  const st = s.state!;
  const t: TalentDef = reg().talents[id];
  const cls = reg().classes[h.classId];
  const maxTier = maxTalentTier(st.dungeonsCompleted);
  const owned = h.talents.includes(t.id);
  return (
    <Sheet kicker={`${cls.talentPaths.find((p) => p.id === t.path)?.name ?? ''} · Nível ${ROMAN[t.tier]}`} title={t.name} onClose={onClose} className="eq-sheet hx-sheet">
      <div className="hx-sheet-body" style={acc(h.classId)}>
        <span className={`hx-orb big ${owned ? 'owned' : ''}`}>{owned ? <Icon id="check" /> : <b>{ROMAN[t.tier]}</b>}</span>
        <p>{t.text}</p>
      </div>
      <div className="eq-ch-foot">
        {owned ? (
          <div className="hx-note">Já aprendido.</div>
        ) : t.tier > maxTier ? (
          <div className="hx-note">
            <Icon id="map_lock" /> Libera após a Dungeon {t.tier === 2 ? 3 : t.tier === 3 ? 5 : 7}.
          </div>
        ) : (
          <button
            className="k-cta eq-go"
            disabled={h.talentPoints < 1 || !mine}
            onClick={() => {
              void run({ t: 'talent', heroId: h.id, talentId: t.id }, 'level_up');
              onClose();
            }}
          >
            <Icon id="talento" /> {h.talentPoints < 1 ? 'Sem pontos de Talento' : 'Aprender · 1 ponto'}
          </button>
        )}
      </div>
    </Sheet>
  );
}
