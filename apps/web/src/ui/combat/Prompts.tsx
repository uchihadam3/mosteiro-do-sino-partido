/**
 * Decisions the rules ask for mid-combat, shown as a bottom sheet: one short question, the dice, big buttons.
 * Rules detail is available behind "O que faz" only.
 */
import React, { useEffect, useState } from 'react';
import { probAtLeastOneSuccess, expectedSuccesses, type CombatState, type Grade, type Pending, type PendingAnswer } from '@mosteiro/core';
import { useSession } from '../../app/hooks';
import { Icon } from '../Icon';
import { ATTR_NAME } from '../data';
import { act } from './GameHUD';

function answer(p: Pending, a: PendingAnswer) {
  return act({ t: 'combat', cmd: { t: 'answer', pendingId: p.id, answer: a } });
}

const COND: Record<string, string> = { veneno: 'Veneno', sangramento: 'Sangramento', queimando: 'Queimando', quebrado: 'Quebrado', exposto: 'Exposto', imobilizado: 'Imobilizado', atordoado: 'Atordoado' };
const condName = (c: string) => COND[c] ?? c;

function Sheet({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="prompt" role="dialog" aria-label={label}>
      <div className="g-sheet-grab" />
      {children}
    </div>
  );
}

export function PendingPrompt({ S }: { S: CombatState }) {
  const s = useSession();
  const p = S.pending!;
  const name = (id: string) => S.figures.find((f) => f.id === id)?.name ?? id;
  const mine = p.controllers.length === 0 || p.controllers.some((id) => s.controls(id)) || (p.kind === 'defense' && s.controls(p.d.targetId));
  if (!mine) {
    const who = p.controllers.map((id) => s.state!.seats.find((x) => x.id === s.state!.heroes.find((h) => h.id === id)?.seat)?.name).filter(Boolean);
    return <div className="hint-chip">{who.length ? `${[...new Set(who)].join(', ')} está decidindo…` : 'Outro jogador está decidindo…'}</div>;
  }
  switch (p.kind) {
    case 'attackPost':
      return <AttackPost p={p} S={S} />;
    case 'defense':
      return <Defense p={p} S={S} />;
    case 'egide':
      return (
        <Sheet label="Égide">
          <div className="q">Proteger {name(p.d.targetId)}?</div>
          <div className="sub">Vai sofrer {p.damage} de Dano. A Égide do Paladino rola Espírito para reduzir mais.</div>
          <div className="acts">
            <button className="btn" onClick={() => void answer(p, { kind: 'egide', paladinId: null })}>
              Não
            </button>
            {p.paladins.map((id) => (
              <button key={id} className="btn primary" onClick={() => void answer(p, { kind: 'egide', paladinId: id })}>
                Égide · {name(id)}
              </button>
            ))}
          </div>
        </Sheet>
      );
    case 'conditionResponse':
      return (
        <Sheet label="Evitar condição">
          <div className="q">
            {name(p.targetId)} ficaria {p.effect.kind === 'cond' ? condName(p.effect.cond) : 'afetado'}
          </div>
          <div className="sub">O Dano continua; dá para cancelar só a condição.</div>
          <div className="acts">
            <button className="btn" onClick={() => void answer(p, { kind: 'conditionResponse', choice: null })}>
              Aceitar
            </button>
            {p.options.map((o) => (
              <button key={o.heroId + o.kind} className="btn primary" onClick={() => void answer(p, { kind: 'conditionResponse', choice: { heroId: o.heroId, kind: o.kind } })}>
                {o.label}
              </button>
            ))}
          </div>
        </Sheet>
      );
    case 'step':
      return (
        <div className="hint-chip">
          <span>
            <b style={{ color: 'var(--gold-2)' }}>{name(p.figureId)}</b> pode andar {p.steps} — toque num lugar brilhando
          </span>
          <button className="g-pill" onClick={() => void answer(p, { kind: 'step', sector: null })}>
            Ficar
          </button>
        </div>
      );
    case 'tieBreak':
      return (
        <Sheet label="Escolher alvo">
          <div className="q">Quem o inimigo ataca?</div>
          <div className="sub">{p.reason}</div>
          <div className="opts">
            {p.candidates.map((id) => {
              const f = S.figures.find((x) => x.id === id)!;
              return (
                <button key={id} className="opt" onClick={() => void answer(p, { kind: 'tieBreak', heroId: id })}>
                  {f.name}
                  <small>
                    {f.hp}/{f.maxHp} de vida
                  </small>
                </button>
              );
            })}
          </div>
        </Sheet>
      );
    case 'choice':
      return (
        <Sheet label="Escolha">
          <div className="q">{p.prompt}</div>
          <div className="opts">
            {p.options.map((o) => (
              <button key={o.id} className="opt" onClick={() => void answer(p, { kind: 'choice', optionId: o.id })}>
                {o.label}
                {o.detail && <small>{o.detail}</small>}
              </button>
            ))}
          </div>
        </Sheet>
      );
    case 'allocate':
      return <Allocate p={p} S={S} />;
    case 'silencio':
      return (
        <Sheet label="Silêncio do Coro">
          <div className="q">Usar o Silêncio do Coro?</div>
          <div className="sub">Impede que a Ressonância suba para {S.boss.ressonancia + 1}. Só uma vez no combate.</div>
          <div className="acts">
            <button className="btn" onClick={() => void answer(p, { kind: 'silencio', use: false })}>
              Guardar
            </button>
            <button className="btn primary" onClick={() => void answer(p, { kind: 'silencio', use: true })}>
              Silenciar
            </button>
          </div>
        </Sheet>
      );
  }
}

function Dice({ roll, onReroll }: { roll: { dice: { grade: number; value: number; source: string }[] }; onReroll?(i: number): void }) {
  return (
    <div className="dice-row">
      {roll.dice.map((d, i) => {
        const k = d.value <= 2 ? 's0' : d.value === 12 ? 'crit' : d.value >= 6 ? 'imp' : 's1';
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div className={`g-die ${k}`} style={{ animation: 'none', width: 56, height: 56 }}>
              <Icon id={`dice_d${d.grade}`} />
              <span className="v" style={{ fontSize: 19 }}>
                {d.value}
              </span>
            </div>
            {onReroll && (
              <button className="g-pill" onClick={() => onReroll(i)}>
                Rerrolar
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function autoSpend(p: Extract<Pending, { kind: 'attackPost' }>): string[] {
  const prio = (label: string) => (/dano|sucesso/i.test(label) ? 3 : /armadura|perfura/i.test(label) ? 2 : /guardado|exposto|quebrado|imobiliz/i.test(label) ? 1.5 : 1);
  const onlyImpulse = p.options.filter((o) => (o.cost.impulso ?? 0) > 0 && !o.cost.mira && !o.cost.conviccao && !o.cost.brecha);
  const hit = p.roll.successes > 0;
  const picked: string[] = [];
  let budget = p.roll.impulsos;
  for (const o of [...onlyImpulse].sort((a, b) => prio(b.label) - prio(a.label))) {
    if (o.requiresHit && !hit) continue;
    if ((o.cost.impulso ?? 0) > budget) continue;
    if (o.group && picked.some((id) => p.options.find((x) => x.id === id)?.group === o.group)) continue;
    picked.push(o.id);
    budget -= o.cost.impulso ?? 0;
  }
  return picked;
}

function AttackPost({ p, S }: { p: Extract<Pending, { kind: 'attackPost' }>; S: CombatState }) {
  const [chosen, setChosen] = useState<string[]>([]);
  // Impulsos are lost if unspent: pre-spend them on the strongest effects (damage first). Persistent resources
  // (Mira, Convicção, Brechas) stay the player's call.
  useEffect(() => setChosen(autoSpend(p)), [p.id, p.roll]);
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
  const cost = (o: (typeof p.options)[number]) => [o.cost.impulso && `${o.cost.impulso} impulso`, o.cost.mira && `${o.cost.mira} mira`, o.cost.conviccao && `${o.cost.conviccao} convicção`, o.cost.brecha && `${o.cost.brecha} brecha`].filter(Boolean).join(' · ') || 'grátis';
  const hit = p.attack.control ? (succ ? 'Funcionou!' : 'Não funcionou') : succ ? 'Acertou!' : 'Errou';
  return (
    <Sheet label="Resultado do ataque">
      <div className="q">
        {p.attack.name} → {tgt?.name}
      </div>
      <div className="chips">
        <span className={succ ? 'good' : 'bad'}>{hit}</span>
        {!p.attack.control && !p.attack.data['support'] && succ > 0 && <span>Dano {p.attack.dano + Math.max(0, succ - 1)}</span>}
        {p.roll.impulsos > 0 && (
          <span className="gold">
            {p.roll.impulsos - sum('impulso')} impulso{p.roll.impulsos - sum('impulso') === 1 ? '' : 's'} para gastar
          </span>
        )}
        {p.roll.critico && <span className="gold">Crítico +1 Dano</span>}
      </div>
      <Dice roll={p.roll} onReroll={p.canReroll ? (i) => void act({ t: 'combat', cmd: { t: 'reroll', dieIndex: i } }) : undefined} />
      {p.options.length > 0 && (
        <div className="opts">
          {p.options.map((o) => (
            <button key={o.id} className={`opt ${chosen.includes(o.id) ? 'on' : ''}`} disabled={!can(o.id)} onClick={() => setChosen(chosen.includes(o.id) ? chosen.filter((x) => x !== o.id) : [...chosen, o.id])}>
              {o.label}
              <small>
                {cost(o)}
                {o.requiresHit && !succ ? ' · precisa acertar' : ''}
              </small>
            </button>
          ))}
        </div>
      )}
      <div className="acts">
        <button className="btn primary" autoFocus onClick={() => void act({ t: 'combat', cmd: { t: 'answer', pendingId: p.id, answer: { kind: 'attackPost', choices: chosen } } })}>
          Continuar
        </button>
      </div>
    </Sheet>
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
  // odds with the dice as they are now (+ the D4s from the help being toggled)
  const grades = [...p.d.dice.map((d) => d.grade), ...chosen.filter((c) => p.options.find((o) => o.heroId === c.heroId && o.kind === c.kind)?.addDie).map(() => 4)].slice(0, 3) as Grade[];
  const pBlock = Math.round(probAtLeastOneSuccess(grades) * 100);
  const expBlock = expectedSuccesses(grades);
  const label = (o: (typeof p.options)[number]) => (o.kind === 'ajuda' ? (o.heroId === t.id ? 'Esforço extra · +1 dado' : `Ajuda de ${S.figures.find((f) => f.id === o.heroId)?.name ?? ''} · +1 dado`) : o.label);
  const extra = [...p.d.attack.onZero.map((e) => (e.kind === 'cond' ? condName(e.cond) : e.kind)), ...p.d.attack.onDamage.map((e) => (e.kind === 'cond' ? condName(e.cond) : e.kind === 'push' ? 'Empurrar' : e.kind === 'pull' ? 'Puxar' : ''))].filter(Boolean);
  return (
    <Sheet label="Defesa">
      <div className="q">
        {src?.name} ataca {t.name}!
      </div>
      <div className="chips">
        <span className="bad">{pv.dano} de Dano</span>
        <span>Defesa: {ATTR_NAME[p.d.attack.def]}</span>
        {pv.armor > 0 && <span className="good">Armadura −{pv.armor}</span>}
        {pv.guard && <span className="good">Guardado −1</span>}
        {pv.cover && <span className="good">Cobertura −1</span>}
        {extra.length > 0 && <span className="bad">Risco: {[...new Set(extra)].join(', ')}</span>}
      </div>
      <div className="g-odds">
        <div className={`v ${pBlock >= 70 ? 'good' : pBlock < 45 ? 'bad' : ''}`}>{pBlock}%</div>
        <div className="t">
          de bloquear algum dano
          <small>cada sucesso bloqueia 1 · média {expBlock.toFixed(1)}</small>
        </div>
      </div>
      {p.options.length > 0 && (
        <>
          <div className="sub">Gastar a Reação para rolar mais dados ({dice}/3)</div>
          <div className="opts">
            {p.options.map((o) => {
              const on = chosen.some((c) => c.heroId === o.heroId && c.kind === o.kind);
              const mine = s.controls(o.heroId);
              return (
                <button key={o.heroId + o.kind} className={`opt ${on ? 'on' : ''}`} disabled={!mine || (!on && dice >= 3 && !!o.addDie)} onClick={() => toggle(o)}>
                  {label(o)}
                  {!mine && <small>de outro jogador</small>}
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="acts">
        <button className="btn primary" autoFocus onClick={() => void act({ t: 'combat', cmd: { t: 'answer', pendingId: p.id, answer: { kind: 'defense', reactions: chosen } } })}>
          Defender
        </button>
      </div>
    </Sheet>
  );
}

function Allocate({ p, S }: { p: Extract<Pending, { kind: 'allocate' }>; S: CombatState }) {
  const [alloc, setAlloc] = useState<Record<string, number>>(() => Object.fromEntries(p.targets.map((t) => [t, 0])));
  const total = Object.values(alloc).reduce((a, b) => a + b, 0);
  return (
    <Sheet label="Distribuir">
      <div className="q">{p.prompt}</div>
      <div className="sub">
        {total}/{p.total} distribuídos
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {p.targets.map((id) => {
          const f = S.figures.find((x) => x.id === id)!;
          return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1 }}>
                {f.name}{' '}
                <span className="muted">
                  {f.hp}/{f.maxHp}
                </span>
              </span>
              <button className="g-x" disabled={!alloc[id]} onClick={() => setAlloc({ ...alloc, [id]: alloc[id] - 1 })}>
                −
              </button>
              <b style={{ minWidth: 20, textAlign: 'center' }}>{alloc[id]}</b>
              <button className="g-x" disabled={alloc[id] >= p.maxPer || total >= p.total} onClick={() => setAlloc({ ...alloc, [id]: alloc[id] + 1 })}>
                +
              </button>
            </div>
          );
        })}
      </div>
      <div className="acts">
        <button className="btn primary" onClick={() => void act({ t: 'combat', cmd: { t: 'answer', pendingId: p.id, answer: { kind: 'allocate', alloc } } })}>
          Confirmar
        </button>
      </div>
    </Sheet>
  );
}
