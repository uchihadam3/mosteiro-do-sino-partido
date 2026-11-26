import React, { useState } from 'react';
import { MASTERY_COST, PRICES, reg, type Attr } from '@mosteiro/core';
import { maxTalentTier } from '@mosteiro/content';
import { useSession } from '../app/hooks';
import { useApp } from '../app/App';
import { Icon } from './Icon';
import { Inventory, run } from './Inventory';
import { HeroStage } from './Prep';
import './party.css';
import { ATTR_NAME, ATTR_ORDER, CLASS_COLOR } from './data';
import { session } from '../state/session';
import { VoteBar } from './Explore';
import { Sheet } from './Settings';
import { ItemDetail } from './Reward';
import { toast } from './Toasts';
import './menus.css';

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
  const unspent = st.heroes.some((h) => h.masteryPoints > 0 || h.talentPoints > 0);
  const done = st.phase === 'complete';
  const tabs: [Tab, string, string][] = [
    ['loja', 'Loja', 'gold'],
    ['equip', 'Equipar', 'mochila'],
    ['herois', 'Heróis', 'talento'],
    ['servicos', 'Serviços', 'act_item'],
  ];
  return (
    <div className="k-screen m-base">
      <div className="k-head m-head-pad">
        <div className="k-title">
          <div className="k-kicker">Base · D{st.dungeonsCompleted} vencida</div>
          <h1 className="k-h1">
            Refúgio<span className="m-pc-inline"> dos Peregrinos</span>
          </h1>
        </div>
        <span className="m-gold-pill" aria-label={`${st.gold} ouro`}>
          <Icon id="gold" /> {st.gold}
        </span>
      </div>
      <div className="m-tabbar">
        <div className="k-tabs" role="tablist">
          {tabs.map(([k, l, ic]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              <Icon id={ic} /> {l}
              {k === 'herois' && unspent && <span className="dot" aria-label="pontos para gastar" />}
            </button>
          ))}
        </div>
      </div>
      <div className="k-body">
        {tab === 'loja' && <Shop heroId={heroId} />}
        {tab === 'equip' && (
          <div className="pt-pane-equip b-equip">
            <HeroStage heroId={heroId} setHeroId={setHeroId} active />
            <Inventory heroId={heroId} setHeroId={setHeroId} inBase sell showHeroes={false} />
          </div>
        )}
        {tab === 'herois' && <Heroes heroId={heroId} setHeroId={setHeroId} />}
        {tab === 'servicos' && <Services />}
      </div>
      <div className="k-foot">
        {done ? (
          <>
            <div className="k-note">A Dungeon 2 ainda está em desenvolvimento. Seu progresso fica salvo.</div>
            <button className="k-btn" onClick={() => { session.close(); go('title'); }}>
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

function WareCard({ w, onOpen }: { w: Ware; onOpen(): void }) {
  const s = useSession();
  const st = s.state!;
  const d = reg().items[w.id];
  const p = priceOf(w.id, w.kind);
  return (
    <button className={`m-ware r-${d.rarity} ${st.gold < p ? 'poor' : ''}`} onClick={onOpen}>
      {st.base?.reserva === w.id && <span className="tagr">Reservado</span>}
      <span className="art">
        <Icon id={d.icon} />
      </span>
      <span className="nm">{d.name}</span>
      <span className="m-rar">{w.kind === 'consumivel' ? 'Consumível' : w.kind === 'usado' ? 'Usado' : d.rarity === 'raro' ? 'Raro' : 'Comum'}</span>
      <span className="price">
        <Icon id="gold" /> {p}
      </span>
    </button>
  );
}

function Shop({ heroId }: { heroId: string }) {
  const s = useSession();
  const st = s.state!;
  const B = st.base!;
  const [sel, setSel] = useState<Ware | null>(null);
  const wares = (ids: string[], kind: Kind): Ware[] => ids.map((id, idx) => ({ id, kind, idx }));
  const section = (title: string, list: Ware[], empty: string) => (
    <>
      <div className="k-section">{title}</div>
      {list.length === 0 ? (
        <div className="m-empty">{empty}</div>
      ) : (
        <div className="m-shop">
          {list.map((w) => (
            <WareCard key={w.kind + w.id + w.idx} w={w} onOpen={() => setSel(w)} />
          ))}
        </div>
      )}
    </>
  );
  return (
    <>
      {section('Vitrine', [...wares(B.vitrine.comum, 'comum'), ...wares(B.vitrine.raro, 'raro')], 'A Vitrine está vazia.')}
      {section('Consumíveis', wares(B.consumables, 'consumivel'), 'Nenhum consumível nesta visita.')}
      {section('Usados', wares(st.usados, 'usado'), 'Nada no Estoque de Usados. Itens vendidos aparecem aqui.')}
      <div className="m-hint" style={{ marginTop: 14 }}>Compras vão para o Armazém. Venda na aba “Equipar”.</div>
      {sel && <SelSheet sel={sel} heroId={heroId} onClose={() => setSel(null)} />}
    </>
  );
}

function SelSheet({ sel, heroId, onClose }: { sel: Ware; heroId: string; onClose(): void }) {
  const s = useSession();
  const st = s.state!;
  const B = st.base!;
  const price = priceOf(sel.id, sel.kind);
  const isVitrine = sel.kind === 'comum' || sel.kind === 'raro';
  const remessa = sel.kind === 'comum' ? 'remessaComum' : 'remessaRara';
  return (
    <Sheet
      title={sel.kind === 'consumivel' ? 'Consumível' : sel.kind === 'usado' ? 'Estoque de Usados' : 'Vitrine'}
      onClose={onClose}
      foot={
        <>
          <button
            className="k-cta"
            disabled={st.gold < price}
            onClick={() => {
              void run({ t: 'buy', itemId: sel.id, kind: sel.kind, heroId: 'armazem' }, 'ui_coin').then((err) => !err && toast(`${reg().items[sel.id].name} foi para o Armazém.`));
              onClose();
            }}
          >
            Comprar · <Icon id="gold" /> {price}
          </button>
          {isVitrine && (
            <div className="k-row" style={{ width: 'min(420px, 100%)' }}>
              <button
                className="k-btn sm grow"
                style={{ flex: 1 }}
                disabled={st.gold < 1}
                onClick={() => void run({ t: 'service', id: 'reserva', index: sel.kind === 'comum' ? sel.idx : B.vitrine.comum.length + sel.idx }, 'ui_coin').then((err) => !err && toast('Reservado para a próxima visita.'))}
              >
                <Icon id="selo_peso" /> Reservar · 1
              </button>
              <button
                className="k-btn sm grow"
                style={{ flex: 1 }}
                disabled={!!B.servicesUsed[remessa] || st.gold < (sel.kind === 'comum' ? 2 : 3)}
                onClick={() => {
                  void run({ t: 'service', id: remessa, index: sel.idx }, 'ui_page');
                  onClose();
                }}
              >
                <Icon id="load" /> Trocar · {sel.kind === 'comum' ? 2 : 3}
              </button>
            </div>
          )}
        </>
      }
    >
      <ItemDetail id={sel.id} hero={st.heroes.find((h) => h.id === heroId)} />
      {st.gold < price && <div className="m-item-note bad">Ouro insuficiente ({st.gold}/{price}).</div>}
    </Sheet>
  );
}

function Services() {
  const s = useSession();
  const st = s.state!;
  const B = st.base!;
  const [pick, setPick] = useState<'remessaComum' | 'remessaRara' | 'reserva' | null>(null);
  const list: { id: 'remessaComum' | 'remessaRara' | 'reserva'; t: string; d: string; cost: number; icon: string; used: boolean }[] = [
    { id: 'remessaComum', t: 'Nova Remessa Comum', d: 'Troca 1 Comum da Vitrine. 1× por visita.', cost: 2, icon: 'item_sword', used: !!B.servicesUsed.remessaComum },
    { id: 'remessaRara', t: 'Nova Remessa Rara', d: 'Troca 1 Raro da Vitrine. 1× por visita.', cost: 3, icon: 'item_orb', used: !!B.servicesUsed.remessaRara },
    { id: 'reserva', t: 'Reserva do Mercador', d: 'Guarda 1 carta para a próxima visita.', cost: 1, icon: 'selo_peso', used: false },
  ];
  const cards = pick === 'remessaComum' ? B.vitrine.comum.map((id, i) => ({ id, index: i })) : pick === 'remessaRara' ? B.vitrine.raro.map((id, i) => ({ id, index: i })) : [...B.vitrine.comum, ...B.vitrine.raro].map((id, i) => ({ id, index: i }));
  return (
    <>
      <div className="m-services">
        {list.map((x) => (
          <button key={x.id} className="m-service" disabled={x.used || st.gold < x.cost} onClick={() => setPick(x.id)}>
            <span className="k-emblem">
              <Icon id={x.icon} />
            </span>
            <span className="grow" style={{ flex: 1, minWidth: 0 }}>
              <div className="t">{x.t}</div>
              <div className="d">{x.used ? 'Já usado nesta visita.' : x.d}</div>
            </span>
            <span className="m-coin">
              <Icon id="gold" /> {x.cost}
            </span>
          </button>
        ))}
      </div>
      <div className="m-hint" style={{ marginTop: 14 }}>Sem cura nem Maestria pagas. Venda rende metade do preço.</div>
      {pick && (
        <Sheet kicker={list.find((x) => x.id === pick)!.t} title={pick === 'reserva' ? 'Reservar qual carta?' : 'Trocar qual carta?'} onClose={() => setPick(null)}>
          {cards.length === 0 ? (
            <div className="m-empty">Nenhuma carta disponível.</div>
          ) : (
            <div className="m-shop">
              {cards.map((c) => {
                const d = reg().items[c.id];
                return (
                  <button
                    key={c.id + c.index}
                    className={`m-ware r-${d.rarity}`}
                    onClick={() => {
                      void run({ t: 'service', id: pick, index: c.index }, pick === 'reserva' ? 'ui_coin' : 'ui_page');
                      setPick(null);
                    }}
                  >
                    {B.reserva === c.id && <span className="tagr">Reservado</span>}
                    <span className="art">
                      <Icon id={d.icon} />
                    </span>
                    <span className="nm">{d.name}</span>
                    <span className="m-rar">{d.rarity === 'raro' ? 'Raro' : 'Comum'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

function Heroes({ heroId, setHeroId }: { heroId: string; setHeroId(id: string): void }) {
  const s = useSession();
  const st = s.state!;
  const h = st.heroes.find((x) => x.id === heroId) ?? st.heroes[0];
  const cls = reg().classes[h.classId];
  const talents = Object.values(reg().talents).filter((t) => t.classId === h.classId);
  const maxTier = maxTalentTier(st.dungeonsCompleted);
  const mine = s.controls(h.id);
  const [path, setPath] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const infoT = info ? reg().talents[info] : null;
  const pathList = (pid: string) =>
    talents
      .filter((t) => t.path === pid)
      .sort((a, b) => a.tier - b.tier)
      .map((t) => {
        const owned = h.talents.includes(t.id);
        const locked = t.tier > maxTier;
        const can = !owned && !locked && h.talentPoints > 0 && mine;
        return (
          <button key={t.id} className={`m-talent ${owned ? 'owned' : locked ? 'locked' : can ? 'can' : ''}`} onClick={() => setInfo(t.id)}>
            <span className="tier">T{t.tier}</span>
            <span style={{ minWidth: 0 }}>
              <div className="nm">{t.name}</div>
              <div className="tx">{t.text}</div>
            </span>
            <span className="st">{owned ? <Icon id="check" /> : locked ? <Icon id="map_lock" /> : can ? <Icon id="talento" /> : null}</span>
          </button>
        );
      });
  const saveName = () => {
    const n = (renaming ?? '').trim();
    if (n && n !== h.name) void run({ t: 'renameHero', heroId: h.id, name: n }, 'ui_confirm');
    setRenaming(null);
  };
  return (
    <div style={acc(h.classId)}>
      <div className="m-herostrip" role="tablist" aria-label="Heróis">
        {st.heroes.map((x) => {
          const pts = x.masteryPoints + x.talentPoints;
          return (
            <button key={x.id} role="tab" aria-selected={x.id === h.id} className={`m-heropick ${x.id === h.id ? 'on' : ''}`} style={acc(x.classId)} onClick={() => { setHeroId(x.id); setRenaming(null); }}>
              <span className="k-emblem">
                <Icon id={`class_${x.classId}`} />
              </span>
              <span className="n">{x.name}</span>
              {pts > 0 && <span className="m-badge">{pts}</span>}
            </button>
          );
        })}
      </div>
      <div className="m-heroes-pc">
        <div className="k-stack">
          <div className="m-herocard">
            <span className="k-emblem lg">
              <Icon id={`class_${h.classId}`} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {renaming !== null ? (
                <div className="m-rename">
                  <input className="k-input" autoFocus value={renaming} maxLength={18} onChange={(e) => setRenaming(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveName()} aria-label="Nome do herói" />
                  <button className="k-round" onClick={saveName} aria-label="Salvar nome">
                    <Icon id="check" />
                  </button>
                </div>
              ) : (
                <div className="nm">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                  {mine && (
                    <button onClick={() => setRenaming(h.name)} aria-label="Renomear">
                      <Icon id="verso" />
                    </button>
                  )}
                </div>
              )}
              <div className="cl">
                {cls.name} · {cls.epithet}
              </div>
              <div className="m-points">
                <span className={`k-chip ${h.masteryPoints ? 'gold' : ''}`}>
                  <Icon id="maestria" /> Maestria {h.masteryPoints}
                </span>
                <span className={`k-chip ${h.talentPoints ? 'gold' : ''}`}>
                  <Icon id="talento" /> Talento {h.talentPoints}
                </span>
              </div>
            </div>
          </div>
          <div>
            <div className="k-section">Maestria</div>
            <div className="m-attrs">
              {ATTR_ORDER.map((a) => {
                const g = h.attrs[a];
                const cost = MASTERY_COST[g];
                const can = g < 12 && h.masteryPoints >= (cost ?? 99) && mine;
                return (
                  <div key={a} className="m-attr">
                    <Icon id={`attr_${a}`} />
                    <div className="a">
                      <div className="n">{ATTR_NAME[a as Attr]}</div>
                      <div className="g">D{g}</div>
                    </div>
                    <button className="m-plus" disabled={!can} aria-label={`Subir ${ATTR_NAME[a as Attr]}`} onClick={() => void run({ t: 'mastery', heroId: h.id, attr: a }, 'level_up')}>
                      {g >= 12 ? 'Máx.' : `D${g + 2}`}
                      {g < 12 && <small>{cost} pt</small>}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div>
          <div className="k-section">Talentos</div>
          <div className="m-paths m-only-phone">
            <div className="k-tabs">
              {cls.talentPaths.map((p, i) => (
                <button key={p.id} className={path === i ? 'on' : ''} onClick={() => setPath(i)}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="m-talents m-only-phone">{cls.talentPaths[path] && pathList(cls.talentPaths[path].id)}</div>
          <div className="m-talents-cols m-only-pc">
            {cls.talentPaths.map((p) => (
              <div key={p.id} className="m-talents">
                <div className="m-pathname">{p.name}</div>
                {pathList(p.id)}
              </div>
            ))}
          </div>
          <div className="m-hint" style={{ marginTop: 10 }}>T1 agora · T2 após a D3 · T3 após a D5 · T4 após a D7</div>
        </div>
      </div>
      {infoT && (
        <Sheet
          kicker={`Talento T${infoT.tier} · ${cls.talentPaths.find((p) => p.id === infoT.path)?.name ?? ''}`}
          title={infoT.name}
          onClose={() => setInfo(null)}
          foot={
            h.talents.includes(infoT.id) ? (
              <div className="k-note">Já aprendido.</div>
            ) : infoT.tier > maxTier ? (
              <div className="k-note">Libera após a Dungeon {infoT.tier === 2 ? 3 : infoT.tier === 3 ? 5 : 7}.</div>
            ) : (
              <button
                className="k-cta"
                disabled={h.talentPoints < 1 || !mine}
                onClick={() => {
                  void run({ t: 'talent', heroId: h.id, talentId: infoT.id }, 'level_up');
                  setInfo(null);
                }}
              >
                <Icon id="talento" /> Aprender · 1 pt
              </button>
            )
          }
        >
          <div className="m-item-text">{infoT.text}</div>
        </Sheet>
      )}
    </div>
  );
}
