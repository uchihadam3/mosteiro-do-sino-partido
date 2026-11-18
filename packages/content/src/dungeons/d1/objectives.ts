/**
 * Objetivos de Batalha (§36, §61.1): position + AP + Test; one attempt of the whole party per Cycle when stated.
 */
import {
  canUse,
  dealDamage,
  hasItem,
  hasTalent,
  heroes,
  adjacent,
  log,
  markUse,
  parseSector,
  raiseLowest,
  rollDice,
  summarize,
  type ActionDef,
  type Attr,
  type Ctx,
  type DieSpec,
  type Figure,
} from '@mosteiro/core';
import { heroDie } from '../../characters/common';
import { lowerResonance } from '../../enemies/d1';

const LABEL: Record<string, string> = { arcano: 'Arcano', precisao: 'Precisão', poder: 'Poder' };

/** Teste de Objetivo: 1 die of the chosen attribute + allowed bonuses (Pesado, Kit de Campo, Lente Rúnica, Mãos de Mestre, Manivela). */
function objectiveTest(c: Ctx, f: Figure, attr: Attr, pre: string[] | undefined, extra: DieSpec[] = []): { ok: boolean; successes: number } {
  let dice: DieSpec[] = [heroDie(f, attr)];
  if (pre?.includes('pesado') && f.tempo === 'pesado' && canUse(f, 'activation', 'pesadoGrau')) {
    markUse(f, 'activation', 'pesadoGrau');
    dice = raiseLowest(dice, 1, 'Pesado');
  }
  if (hasTalent(f, 'l_maos_mestre')) dice = raiseLowest(dice, 1, 'Mãos de Mestre');
  dice.push(...extra);
  // Kit de Campo: own or Adjacent ally, once per Combat, +D6 (not Attack/Defense/Control)
  const kitOwner = heroes(c).find((h) => hasItem(h, 'kit_campo') && (h.id === f.id || adjacent(h, f)) && canUse(h, 'combat', 'kit'));
  if (kitOwner && dice.length < 3) {
    markUse(kitOwner, 'combat', 'kit');
    dice.push({ grade: 6, source: 'Kit de Campo' });
  }
  if (hasItem(f, 'lente_runica') && canUse(f, 'combat', 'lenteRunica') && dice.length < 3) {
    markUse(f, 'combat', 'lenteRunica');
    dice.push({ grade: 8, source: 'Lente Rúnica' });
  }
  let r = summarize(rollDice(c.S.rng, dice).dice);
  c.events.push({ type: 'roll', figureId: f.id, purpose: `Teste de ${LABEL[attr] ?? attr}`, roll: r });
  // Estojo do Arrombador: reroll 1 die (2 for Ladino) after a failure
  const estojo = heroes(c).find((h) => hasItem(h, 'estojo_arrombador') && (h.id === f.id || adjacent(h, f)) && canUse(h, 'combat', 'estojo'));
  if (r.successes < 1 && estojo) {
    markUse(estojo, 'combat', 'estojo');
    const n = estojo.id === f.id && f.typeId === 'ladino' ? 2 : 1;
    const ds = r.dice.slice();
    const order = ds.map((d, i) => ({ d, i })).sort((a, b) => a.d.value - b.d.value).slice(0, n);
    const re = summarize(rollDice(c.S.rng, order.map((o) => ({ grade: o.d.grade, source: `${o.d.source} (Estojo)` }))).dice);
    order.forEach((o, k) => (ds[o.i] = re.dice[k]));
    r = summarize(ds);
    log(c, 'item', 'Estojo do Arrombador: rerrolagem.');
    c.events.push({ type: 'roll', figureId: f.id, purpose: 'Estojo do Arrombador', roll: r });
  }
  log(c, 'objective', `Teste de ${LABEL[attr] ?? attr}: ${r.dice.map((d) => `D${d.grade}=${d.value}`).join(' · ')} → ${r.successes} Sucesso(s).`);
  return { ok: r.successes >= 1, successes: r.successes };
}

function hasCordaGancho(f: Figure, c: Ctx) {
  return hasItem(f, 'corda_gancho') && canUse(f, 'combat', 'corda');
}

/**
 * Decifrar as Sete Linhas — 1 AP, Teste Arcano ou Precisão, 1 Sucesso, max one party attempt per Cycle.
 * HIPÓTESE Q-POS-SETE: position = any hero Retaguarda Sector (the wall behind the party).
 */
export const seteLinhas: ActionDef = {
  id: 'obj_setelinhas',
  name: 'Decifrar as Sete Linhas',
  ap: 1,
  kind: 'utility',
  icon: 'sete_linhas',
  text: '1 AP. Teste Arcano ou Precisão, 1 Sucesso. Uma tentativa da party por Ciclo. Falha: o AP é gasto; não tente novamente neste Ciclo. Posição: Retaguarda.',
  source: { section: '§36 / §61.1', status: 'CANONICO', note: 'Posição: HIPÓTESE Q-POS-SETE.' },
  targeting: { type: 'none' },
  options: (c, f) => [
    { id: 'arcano', label: `Arcano (D${heroDie(f, 'arcano').grade})` },
    { id: 'precisao', label: `Precisão (D${heroDie(f, 'precisao').grade})` },
  ],
  hidden: (c) => !c.S.objectives['setelinhas'] || !!c.S.objectives['setelinhas'].done,
  available: (c, f) => {
    const o = c.S.objectives['setelinhas'];
    if (o.lastAttemptCycle === c.S.cycle) return 'A party já tentou neste Ciclo.';
    if (parseSector(f.sector).row !== 'R' && !hasCordaGancho(f, c)) return 'Posicione-se na Retaguarda (a parede das Sete Linhas).';
    return null;
  },
  validate: (c, f, cmd) => (cmd.option === 'arcano' || cmd.option === 'precisao' ? null : 'Escolha Arcano ou Precisão.'),
  execute: (c, f, cmd) => {
    const o = c.S.objectives['setelinhas'];
    if (parseSector(f.sector).row !== 'R') markUse(f, 'combat', 'corda');
    o.lastAttemptCycle = c.S.cycle;
    o.uses++;
    const r = objectiveTest(c, f, cmd.option as Attr, cmd.pre);
    c.events.push({ type: 'objective', objectiveId: 'setelinhas', success: r.ok });
    if (!r.ok) {
      log(c, 'objective', 'As linhas vibram e se apagam. Não é possível tentar de novo neste Ciclo.');
      return;
    }
    o.done = true;
    c.S.flags['seteLinhas'] = true;
    c.S.flags['passagemDecifrada'] = true;
    c.S.flags['readArchive'] = 'B-SCR-01';
    log(c, 'secret', 'As Sete Linhas foram decifradas. Leia B-SCR-01.');
    c.events.push({ type: 'secret', code: 'B-SCR-01' });
  },
};

const CW: Record<string, { col: number; label: string }> = { oeste: { col: 1, label: 'Oeste' }, norte: { col: 3, label: 'Norte' }, leste: { col: 5, label: 'Leste' } };

/**
 * Contrapesos de Severin — 1 AP (1–2 heróis) / 2 AP (3–5); Teste Poder ou Precisão, 1 Sucesso; each once per Combat.
 * Failure: not consumed, but cannot retry that Contrapeso in the same Cycle.
 * Manivela Conservada (1/Combat): −1 AP and +D6.
 * HIPÓTESE Q-POS-CONTRAPESO: Oeste = coluna 1, Norte = coluna 3, Leste = coluna 5 (qualquer fileira).
 */
export const contrapeso: ActionDef = {
  id: 'obj_contrapeso',
  name: 'Acionar Contrapeso',
  ap: 1,
  kind: 'utility',
  icon: 'contrapeso',
  text: 'Teste Poder ou Precisão, 1 Sucesso: reduza Ressonância em 1 e marque o Contrapeso usado. Custo 1 AP (1–2 heróis) ou 2 AP (3–5). Falha: não reduz e não tente aquele Contrapeso de novo neste Ciclo.',
  source: { section: '§36 / §43 Severin', status: 'CANONICO', note: 'Posições: HIPÓTESE Q-POS-CONTRAPESO.' },
  targeting: { type: 'none' },
  hidden: (c) => !c.S.objectives['contrapesos'],
  apCost: (c, f, cmd) => {
    const base = c.S.partySize <= 2 ? 1 : 2;
    const man = cmd?.pre?.includes('manivela') && c.S.ctx.hasManivela && !c.S.boss.manivelaUsada ? 1 : 0;
    return Math.max(0, base - man);
  },
  options: (c, f) =>
    c.S.boss.contrapesos.flatMap((cw) => {
      const info = CW[cw.id];
      const col = Number(f.sector[3]);
      const reason = cw.used ? 'Já usado' : cw.lastFailCycle === c.S.cycle ? 'Falhou neste Ciclo' : col !== info.col && !hasCordaGancho(f, c) ? `Fique na coluna ${info.col}` : null;
      return (['poder', 'precisao'] as Attr[]).map((a) => ({ id: `${cw.id}:${a}`, label: `${info.label} — ${LABEL[a]} (D${heroDie(f, a).grade})`, disabled: reason }));
    }),
  available: (c, f) => (c.S.boss.contrapesos.every((x) => x.used) ? 'Todos os Contrapesos foram usados.' : null),
  validate: (c, f, cmd) => {
    const [id, attr] = String(cmd.option ?? '').split(':');
    const cw = c.S.boss.contrapesos.find((x) => x.id === id);
    if (!cw || !CW[id] || (attr !== 'poder' && attr !== 'precisao')) return 'Escolha Contrapeso e atributo.';
    if (cw.used) return 'Contrapeso já usado.';
    if (cw.lastFailCycle === c.S.cycle) return 'Não tente este Contrapeso de novo neste Ciclo.';
    if (Number(f.sector[3]) !== CW[id].col && !hasCordaGancho(f, c)) return `Posicione-se na coluna ${CW[id].col}.`;
    return null;
  },
  execute: (c, f, cmd) => {
    const [id, attr] = String(cmd.option).split(':');
    const cw = c.S.boss.contrapesos.find((x) => x.id === id)!;
    if (Number(f.sector[3]) !== CW[id].col) markUse(f, 'combat', 'corda');
    const extra: DieSpec[] = [];
    if (cmd.pre?.includes('manivela') && c.S.ctx.hasManivela && !c.S.boss.manivelaUsada) {
      c.S.boss.manivelaUsada = true;
      extra.push({ grade: 6, source: 'Manivela Conservada' });
      log(c, 'objective', 'Manivela Conservada: −1 AP e +D6.');
    }
    const r = objectiveTest(c, f, attr as Attr, cmd.pre, extra);
    c.events.push({ type: 'objective', objectiveId: `contrapeso:${id}`, success: r.ok });
    if (r.ok) {
      cw.used = true;
      lowerResonance(c);
      c.events.push({ type: 'boss', figureId: f.id, what: 'contrapeso', value: c.S.boss.ressonancia });
    } else {
      cw.lastFailCycle = c.S.cycle;
      log(c, 'objective', `O Contrapeso ${CW[id].label} não cede.`);
    }
  },
};

export const OBJECTIVE_ACTIONS: Record<string, ActionDef> = { setelinhas: seteLinhas, contrapesos: contrapeso };
export { dealDamage };
