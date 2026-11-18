import React, { useState } from 'react';
import { MASTERY_COST, PRICES, reg, type Attr } from '@mosteiro/core';
import { maxTalentTier } from '@mosteiro/content';
import { useSession } from '../app/hooks';
import { useApp } from '../app/App';
import { Icon } from './Icon';
import { Inventory, ItemCard, run } from './Inventory';
import { ATTR_NAME, ATTR_ORDER, CLASS_COLOR } from './data';
import { session } from '../state/session';

type Tab = 'herois' | 'equip' | 'mercado';

export function Base() {
  const s = useSession();
  const st = s.state!;
  const [tab, setTab] = useState<Tab>('herois');
  const [heroId, setHeroId] = useState(st.heroes[0].id);
  return (
    <div className="overlay screen-fade">
      <div className="frame base">
        <div className="screen-head" style={{ paddingRight: 60 }}>
          <div className="grow">
            <div className="kicker">Base · após a Dungeon {st.dungeonsCompleted}</div>
            <h2 className="h2">Refúgio dos Peregrinos</h2>
          </div>
          <span className="chip gold" style={{ fontSize: 'var(--fs)' }}>
            <Icon id="gold" /> {st.gold} ouro
          </span>
          <div className="tabs">
            {(
              [
                ['herois', 'Heróis'],
                ['equip', 'Equipamento'],
                ['mercado', 'Mercado'],
              ] as [Tab, string][]
            ).map(([k, l]) => (
              <button key={k} className={`tab ${tab === k ? 'on' : ''}`} style={{ borderRadius: 8, borderBottom: '1px solid var(--line)' }} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {tab === 'herois' && <Heroes heroId={heroId} setHeroId={setHeroId} />}
        {tab === 'equip' && <Inventory heroId={heroId} setHeroId={setHeroId} inBase sell />}
        {tab === 'mercado' && <Market heroId={heroId} />}
      </div>
    </div>
  );
}

function Heroes({ heroId, setHeroId }: { heroId: string; setHeroId(id: string): void }) {
  const s = useSession();
  const st = s.state!;
  const { go } = useApp();
  const h = st.heroes.find((x) => x.id === heroId)!;
  const cls = reg().classes[h.classId];
  const talents = Object.values(reg().talents).filter((t) => t.classId === h.classId);
  const maxTier = maxTalentTier(st.dungeonsCompleted);
  return (
    <div className="base-body" style={{ gridTemplateColumns: 'minmax(260px, 0.9fr) minmax(0, 1.6fr)' }}>
      <div className="panel col" style={{ padding: 14, minHeight: 0 }}>
        <div className="tabs" style={{ flexWrap: 'wrap' }}>
          {st.heroes.map((x) => (
            <button key={x.id} className={`tab ${x.id === h.id ? 'on' : ''}`} style={{ borderRadius: 8, borderBottom: '1px solid var(--line)', color: x.id === h.id ? CLASS_COLOR[x.classId] : undefined }} onClick={() => setHeroId(x.id)}>
              {x.name}
            </button>
          ))}
        </div>
        <div className="row">
          <Icon id={`class_${h.classId}`} size={42} style={{ color: CLASS_COLOR[h.classId] }} />
          <div className="grow">
            <div className="h3">{h.name}</div>
            <div className="small muted">{cls.name} · {cls.epithet}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="chip gold">Maestria: {h.masteryPoints}</span>
          <span className="chip gold">Talento: {h.talentPoints}</span>
        </div>
        <div className="kicker">Maestria — aumente um Grau</div>
        <div className="col" style={{ gap: 4 }}>
          {ATTR_ORDER.map((a) => {
            const g = h.attrs[a];
            const cost = MASTERY_COST[g];
            return (
              <div key={a} className="row small" style={{ gap: 8 }}>
                <Icon id={`attr_${a}`} style={{ color: 'var(--ink-3)' }} />
                <span className="grow">{ATTR_NAME[a as Attr]}</span>
                <span className="display" style={{ color: 'var(--gold-2)', minWidth: 36 }}>D{g}</span>
                <button className="btn sm" disabled={g >= 12 || h.masteryPoints < (cost ?? 99) || !s.controls(h.id)} onClick={() => void run({ t: 'mastery', heroId: h.id, attr: a }, 'level_up')}>
                  {g >= 12 ? 'Máx.' : `D${g + 2} · ${cost}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="panel col" style={{ padding: 14, minHeight: 0 }}>
        <div className="row">
          <div className="kicker grow">Árvore de Talentos</div>
          <span className="xs muted">T1 disponível · T2 após D3 · T3 após D5 · T4 após D7</span>
        </div>
        <div className="scroll-y" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, flex: 1 }}>
          {cls.talentPaths.map((p) => (
            <div key={p.id} className="col" style={{ gap: 6 }}>
              <div className="display" style={{ color: CLASS_COLOR[h.classId], textAlign: 'center' }}>{p.name}</div>
              {talents
                .filter((t) => t.path === p.id)
                .sort((a, b) => a.tier - b.tier)
                .map((t) => {
                  const owned = h.talents.includes(t.id);
                  const locked = t.tier > maxTier;
                  return (
                    <button
                      key={t.id}
                      className="loot"
                      style={{ textAlign: 'left', cursor: owned || locked ? 'default' : 'pointer', opacity: locked ? 0.45 : 1, borderColor: owned ? CLASS_COLOR[h.classId] : undefined }}
                      disabled={owned || locked || h.talentPoints < 1 || !s.controls(h.id)}
                      onClick={() => void run({ t: 'talent', heroId: h.id, talentId: t.id }, 'level_up')}
                    >
                      <div className="row">
                        <span className="chip">T{t.tier}</span>
                        <span className="nm grow">{t.name}</span>
                        {owned && <Icon id="check" style={{ color: 'var(--ok)' }} />}
                        {locked && <Icon id="map_lock" />}
                      </div>
                      <div className="tx">{t.text}</div>
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
        <div className="divider" />
        <div className="row">
          <div className="grow small muted">A Dungeon 2 ainda está em desenvolvimento. Seu progresso fica salvo e seguirá quando ela chegar.</div>
          <button className="btn" onClick={() => { session.close(); go('title'); }}>
            Menu principal
          </button>
        </div>
      </div>
    </div>
  );
}

function Market({ heroId }: { heroId: string }) {
  const s = useSession();
  const st = s.state!;
  const B = st.base!;
  const [sel, setSel] = useState<{ id: string; kind: 'comum' | 'raro' | 'consumivel' | 'usado'; idx: number } | null>(null);
  const price = (id: string, kind: string) => (kind === 'consumivel' ? reg().items[id].price ?? 2 : kind === 'raro' ? PRICES.raro.buy : kind === 'usado' ? (reg().items[id].rarity === 'raro' ? PRICES.raro.buy : reg().items[id].rarity === 'epico' ? PRICES.epico.buy : PRICES.comum.buy) : PRICES.comum.buy);
  const Row = ({ ids, kind }: { ids: string[]; kind: 'comum' | 'raro' | 'consumivel' | 'usado' }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 6 }}>
      {ids.length === 0 && <div className="xs muted">Nada disponível.</div>}
      {ids.map((id, i) => (
        <button key={id + i} className="slot" style={sel?.id === id && sel.kind === kind ? { borderColor: 'var(--gold-2)' } : undefined} onClick={() => setSel({ id, kind, idx: i })}>
          <Icon id={reg().items[id].icon} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reg().items[id].name}</div>
            <div className="xs" style={{ color: 'var(--gold-2)' }}>
              {price(id, kind)} ouro{B.reserva === id ? ' · reservado' : ''}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
  return (
    <div className="base-body">
      <div className="panel col scroll-y" style={{ padding: 14 }}>
        <div className="kicker">Vitrine — Comuns</div>
        <Row ids={B.vitrine.comum} kind="comum" />
        <div className="kicker">Vitrine — Raros</div>
        <Row ids={B.vitrine.raro} kind="raro" />
        <div className="kicker">Consumíveis (1 cópia por visita)</div>
        <Row ids={B.consumables} kind="consumivel" />
        <div className="kicker">Estoque de Usados</div>
        <Row ids={st.usados} kind="usado" />
      </div>
      <div className="panel col" style={{ padding: 14 }}>
        {sel ? (
          <>
            <ItemCard it={sel.id} hero={st.heroes.find((h) => h.id === heroId)} />
            <div className="divider" />
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <button className="btn primary sm" disabled={st.gold < price(sel.id, sel.kind)} onClick={() => { void run({ t: 'buy', itemId: sel.id, kind: sel.kind, heroId: 'armazem' }, 'ui_coin'); setSel(null); }}>
                Comprar ({price(sel.id, sel.kind)} ouro) → Armazém
              </button>
              {sel.kind !== 'consumivel' && sel.kind !== 'usado' && (
                <button className="btn sm" disabled={st.gold < 1} onClick={() => void run({ t: 'service', id: 'reserva', index: sel.kind === 'comum' ? sel.idx : B.vitrine.comum.length + sel.idx }, 'ui_coin')}>
                  Reservar (1 ouro)
                </button>
              )}
              {(sel.kind === 'comum' || sel.kind === 'raro') && (
                <button className="btn sm" disabled={!!B.servicesUsed[sel.kind === 'comum' ? 'remessaComum' : 'remessaRara']} onClick={() => { void run({ t: 'service', id: sel.kind === 'comum' ? 'remessaComum' : 'remessaRara', index: sel.idx }, 'ui_page'); setSel(null); }}>
                  Nova Remessa ({sel.kind === 'comum' ? 2 : 3} ouro)
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="small muted">
            Selecione uma carta. Preços: Comum 8 · Raro 14 · Épico recomprado 24. Venda: metade. Serviços: Nova Remessa Comum (2) e Rara (3), uma por visita; Reserva do Mercador (1). Sem cura ou Maestria pagas (§31–32).
          </div>
        )}
      </div>
    </div>
  );
}
