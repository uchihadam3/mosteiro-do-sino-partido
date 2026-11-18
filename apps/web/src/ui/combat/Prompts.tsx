import React, { useEffect, useState } from 'react';
import { type CombatState, type Pending, type PendingAnswer } from '@mosteiro/core';
import { useSession } from '../../app/hooks';
import { Icon } from '../Icon';
import { ATTR_NAME } from '../data';
import { act } from './CombatHUD';

function answer(p: Pending, a: PendingAnswer) {
  return act({ t: 'combat', cmd: { t: 'answer', pendingId: p.id, answer: a } });
}

export function PendingPrompt({ S }: { S: CombatState }) {
  const s = useSession();
  const p = S.pending!;
  const name = (id: string) => S.figures.find((f) => f.id === id)?.name ?? id;
  const mine = p.controllers.length === 0 || p.controllers.some((id) => s.controls(id)) || (p.kind === 'defense' && s.controls(p.d.targetId));
  if (!mine) {
    const who = p.controllers.map((id) => s.state!.seats.find((x) => x.id === s.state!.heroes.find((h) => h.id === id)?.seat)?.name).filter(Boolean);
    return (
      <div className="prompt panel">
        <div className="q">Aguardando decisão</div>
        <div className="small muted">{who.length ? `${[...new Set(who)].join(', ')} está decidindo…` : 'Outro jogador está decidindo…'}</div>
      </div>
    );
  }
  switch (p.kind) {
    case 'attackPost':
      return <AttackPost p={p} S={S} />;
    case 'defense':
      return <Defense p={p} S={S} />;
    case 'egide':
      return (
        <div className="prompt panel ornate">
          <div className="q">Égide — {name(p.d.targetId)} sofreria {p.damage} Dano</div>
          <div className="small muted">Gaste a Reação do Paladino e role Espírito: cada Sucesso reduz 1 Dano adicional. Se impedir todo o Dano, gera 1 Convicção (1/Ciclo).</div>
          <div className="opts">
            {p.paladins.map((id) => (
              <button key={id} className="btn primary sm" onClick={() => void answer(p, { kind: 'egide', paladinId: id })}>
                Égide ({name(id)})
              </button>
            ))}
            <button className="btn sm" onClick={() => void answer(p, { kind: 'egide', paladinId: null })}>
              Não usar
            </button>
          </div>
        </div>
      );
    case 'conditionResponse':
      return (
        <div className="prompt panel ornate">
          <div className="q">
            {name(p.targetId)} receberia {p.effect.kind === 'cond' ? condName(p.effect.cond) : 'uma Condição'}
          </div>
          <div className="small muted">O Dano permanece; apenas a Condição pode ser cancelada.</div>
          <div className="opts">
            {p.options.map((o) => (
              <button key={o.heroId + o.kind} className="btn primary sm" onClick={() => void answer(p, { kind: 'conditionResponse', choice: { heroId: o.heroId, kind: o.kind } })}>
                {o.label}
              </button>
            ))}
            <button className="btn sm" onClick={() => void answer(p, { kind: 'conditionResponse', choice: null })}>
              Aceitar
            </button>
          </div>
        </div>
      );
    case 'step':
      return (
        <div className="hint-chip panel">
          <span className="kicker" style={{ color: 'var(--gold-2)' }}>{p.reason}</span>
          <span>
            {name(p.figureId)}: Passo {p.steps} — escolha um Setor destacado
          </span>
          <button className="btn sm" onClick={() => void answer(p, { kind: 'step', sector: null })}>
            Não mover
          </button>
        </div>
      );
    case 'tieBreak':
      return (
        <div className="prompt panel ornate">
          <div className="q">A party decide</div>
          <div className="small muted">{p.reason} Escolha quem será o alvo.</div>
          <div className="opts">
            {p.candidates.map((id) => {
              const f = S.figures.find((x) => x.id === id)!;
              return (
                <button key={id} className="opt" onClick={() => void answer(p, { kind: 'tieBreak', heroId: id })}>
                  {f.name}
                  <small>HP {f.hp}/{f.maxHp}</small>
                </button>
              );
            })}
          </div>
        </div>
      );
    case 'choice':
      return (
        <div className="prompt panel ornate">
          <div className="q">{p.prompt}</div>
          <div className="opts">
            {p.options.map((o) => (
              <button key={o.id} className="opt" onClick={() => void answer(p, { kind: 'choice', optionId: o.id })}>
                {o.label}
                {o.detail && <small>{o.detail}</small>}
              </button>
            ))}
          </div>
        </div>
      );
    case 'allocate':
      return <Allocate p={p} S={S} />;
    case 'silencio':
      return (
        <div className="prompt panel ornate">
          <div className="q">Silêncio do Coro</div>
          <div className="small muted">A Ressonância de Severin está prestes a subir para {S.boss.ressonancia + 1}. Usar o Silêncio do Coro agora (uma vez por combate)?</div>
          <div className="opts">
            <button className="btn primary sm" onClick={() => void answer(p, { kind: 'silencio', use: true })}>
              Silenciar
            </button>
            <button className="btn sm" onClick={() => void answer(p, { kind: 'silencio', use: false })}>
              Guardar para depois
            </button>
          </div>
        </div>
      );
  }
}

const COND: Record<string, string> = { veneno: 'Veneno', sangramento: 'Sangramento', queimando: 'Queimando', quebrado: 'Quebrado', exposto: 'Exposto', imobilizado: 'Imobilizado', atordoado: 'Atordoado' };
function condName(c: string) {
  return COND[c] ?? c;
}

function DiceFaces({ roll, onReroll }: { roll: { dice: { grade: number; value: number; source: string }[] }; onReroll?(i: number): void }) {
  return (
    <div className="dice-row" style={{ margin: '8px 0 4px' }}>
      {roll.dice.map((d, i) => {
        const s = d.value <= 2 ? 's0' : d.value === 12 ? 'crit' : d.value >= 6 ? 'imp' : 's1';
        return (
          <div key={i} className="col" style={{ alignItems: 'center', gap: 2 }}>
            <div className={`die3d ${s}`} style={{ animation: 'none', width: 46, height: 46 }}>
              <Icon id={`dice_d${d.grade}`} />
              <span className="v" style={{ fontSize: 17 }}>{d.value}</span>
            </div>
            <span className="xs muted">{d.source}</span>
            {onReroll && (
              <button className="btn sm" style={{ minHeight: 26, padding: '2px 8px' }} onClick={() => onReroll(i)}>
                Rerrolar
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AttackPost({ p, S }: { p: Extract<Pending, { kind: 'attackPost' }>; S: CombatState }) {
  const [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => setChosen([]), [p.id, p.roll]);
  const src = S.figures.find((f) => f.id === p.attack.sourceId)!;
  const tgt = S.figures.find((f) => f.id === p.attack.targetId);
  const sum = (k: 'impulso' | 'mira' | 'conviccao' | 'brecha') => chosen.reduce((n, id) => n + (p.options.find((o) => o.id === id)?.cost[k] ?? 0), 0);
  const brechas = Number(p.attack.data['targetBrechas'] ?? 0);
  const can = (id: string) => {
    if (chosen.includes(id)) return true;
    const o = p.options.find((x) => x.id === id)!;
    if (o.group && chosen.some((c) => p.options.find((x) => x.id === c)?.group === o.group)) return false;
    if ((o.cost.impulso ?? 0) + sum('impulso') > p.roll.impulsos) return false;
    if ((o.cost.mira ?? 0) + sum('mira') > (src.res?.mira ?? 0)) return false;
    if ((o.cost.conviccao ?? 0) + sum('conviccao') > (src.res?.conviccao ?? 0)) return false;
    if ((o.cost.brecha ?? 0) + sum('brecha') > brechas) return false;
    return true;
  };
  const succ = p.roll.successes + (chosen.includes('brecha:pontoFraco') ? 1 : 0);
  const cost = (o: (typeof p.options)[number]) => [o.cost.impulso && `${o.cost.impulso} Impulso`, o.cost.mira && `${o.cost.mira} Mira`, o.cost.conviccao && `${o.cost.conviccao} Convicção`, o.cost.brecha && `${o.cost.brecha} Brecha`].filter(Boolean).join(' · ') || 'grátis';
  return (
    <div className="prompt panel ornate">
      <div className="q">
        {p.attack.name} → {tgt?.name}
      </div>
      <div className="row small" style={{ gap: 8 }}>
        <span className={`chip ${succ ? 'green' : 'red'}`}>{p.attack.control ? (succ ? 'Controle bem-sucedido' : 'Controle falhou') : succ ? `Acerta · ${succ} Sucesso${succ > 1 ? 's' : ''}` : 'Erra (0 Sucessos)'}</span>
        <span className="chip gold">
          Impulsos {p.roll.impulsos - sum('impulso')}/{p.roll.impulsos}
        </span>
        {p.roll.critico && <span className="chip gold">Crítico: +1 Dano, ignora 1 Armadura</span>}
        {!p.attack.control && !p.attack.data['support'] && succ > 0 && <span className="chip">Dano base {p.attack.dano} + {Math.max(0, succ - 1)}</span>}
      </div>
      <DiceFaces roll={p.roll} onReroll={p.canReroll ? (i) => void act({ t: 'combat', cmd: { t: 'reroll', dieIndex: i } }) : undefined} />
      {p.canReroll && <div className="xs muted">Arqueiro: gaste 1 Mira para rerrolar um dado ({src.res?.mira ?? 0} Mira).</div>}
      {p.options.length > 0 && (
        <>
          <div className="kicker" style={{ marginTop: 8 }}>Gastar</div>
          <div className="opts">
            {p.options.map((o) => (
              <button key={o.id} className={`opt ${chosen.includes(o.id) ? 'on' : ''}`} disabled={!can(o.id)} onClick={() => setChosen(chosen.includes(o.id) ? chosen.filter((x) => x !== o.id) : [...chosen, o.id])}>
                {o.label}
                <small>{cost(o)}{o.requiresHit && !succ ? ' · requer acerto' : ''}</small>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn primary" autoFocus onClick={() => void act({ t: 'combat', cmd: { t: 'answer', pendingId: p.id, answer: { kind: 'attackPost', choices: chosen } } })}>
          Resolver
        </button>
      </div>
    </div>
  );
}

function Defense({ p, S }: { p: Extract<Pending, { kind: 'defense' }>; S: CombatState }) {
  const s = useSession();
  const [chosen, setChosen] = useState<{ heroId: string; kind: string }[]>([]);
  useEffect(() => setChosen([]), [p.id]);
  const t = S.figures.find((f) => f.id === p.d.targetId)!;
  const src = S.figures.find((f) => f.id === p.d.attack.sourceId);
  const dice = p.d.dice.length + chosen.filter((c) => p.options.find((o) => o.heroId === c.heroId && o.kind === c.kind)?.addDie).length;
  const toggle = (o: (typeof p.options)[number]) => {
    const has = chosen.some((c) => c.heroId === o.heroId && c.kind === o.kind);
    if (has) setChosen(chosen.filter((c) => !(c.heroId === o.heroId && c.kind === o.kind)));
    else setChosen([...chosen.filter((c) => c.heroId !== o.heroId), { heroId: o.heroId, kind: o.kind }]);
  };
  const pv = p.preview;
  return (
    <div className="prompt panel ornate">
      <div className="q">
        {src?.name} — {p.d.attack.name}
      </div>
      <div className="small">
        <b>{t.name}</b> defende <b style={{ color: '#f0a090' }}>Dano {pv.dano}</b> com <b>{ATTR_NAME[p.d.attack.def]}</b> (D{p.d.dice[0].grade}). Cada Sucesso bloqueia 1.
      </div>
      <div className="row xs" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <span className="chip">Armadura {pv.armor}</span>
        {pv.guard && <span className="chip green">Guardado −1</span>}
        {pv.cover && <span className="chip green">Cobertura −1</span>}
        {p.d.attack.onZero.length > 0 && <span className="chip red">0 Sucessos → {p.d.attack.onZero.map((e) => (e.kind === 'cond' ? condName(e.cond) : e.kind)).join(', ')}</span>}
        {p.d.attack.onDamage.length > 0 && <span className="chip red">Com Dano → {p.d.attack.onDamage.map((e) => (e.kind === 'cond' ? condName(e.cond) : e.kind === 'push' ? 'Empurrar' : e.kind === 'pull' ? 'Puxar' : '')).join(', ')}</span>}
      </div>
      <div className="kicker" style={{ marginTop: 10 }}>Reações ({dice}/3 dados)</div>
      <div className="opts">
        {p.options.map((o) => {
          const on = chosen.some((c) => c.heroId === o.heroId && c.kind === o.kind);
          const mine = s.controls(o.heroId);
          return (
            <button key={o.heroId + o.kind} className={`opt ${on ? 'on' : ''}`} disabled={!mine || (!on && dice >= 3 && !!o.addDie)} onClick={() => toggle(o)}>
              {o.label}
              {!mine && <small>de outro jogador</small>}
            </button>
          );
        })}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12, gap: 8 }}>
        <button className="btn" onClick={() => void act({ t: 'combat', cmd: { t: 'answer', pendingId: p.id, answer: { kind: 'defense', reactions: [] } } })}>
          Sem Reação
        </button>
        <button className="btn primary" autoFocus onClick={() => void act({ t: 'combat', cmd: { t: 'answer', pendingId: p.id, answer: { kind: 'defense', reactions: chosen } } })}>
          Rolar Defesa
        </button>
      </div>
    </div>
  );
}

function Allocate({ p, S }: { p: Extract<Pending, { kind: 'allocate' }>; S: CombatState }) {
  const [alloc, setAlloc] = useState<Record<string, number>>(() => Object.fromEntries(p.targets.map((t) => [t, 0])));
  const total = Object.values(alloc).reduce((a, b) => a + b, 0);
  return (
    <div className="prompt panel ornate">
      <div className="q">{p.prompt}</div>
      <div className="col" style={{ gap: 6, marginTop: 8 }}>
        {p.targets.map((id) => {
          const f = S.figures.find((x) => x.id === id)!;
          return (
            <div key={id} className="row small">
              <span className="grow">
                {f.name} <span className="muted">HP {f.hp}/{f.maxHp}</span>
              </span>
              <button className="btn icon sm" disabled={!alloc[id]} onClick={() => setAlloc({ ...alloc, [id]: alloc[id] - 1 })}>
                −
              </button>
              <b style={{ minWidth: 20, textAlign: 'center' }}>{alloc[id]}</b>
              <button className="btn icon sm" disabled={alloc[id] >= p.maxPer || total >= p.total} onClick={() => setAlloc({ ...alloc, [id]: alloc[id] + 1 })}>
                +
              </button>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
        <span className="xs muted">
          {total}/{p.total} distribuídos
        </span>
        <button className="btn primary" onClick={() => void act({ t: 'combat', cmd: { t: 'answer', pendingId: p.id, answer: { kind: 'allocate', alloc } } })}>
          Confirmar
        </button>
      </div>
    </div>
  );
}
