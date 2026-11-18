/**
 * Ataque de herói (§12, R06):
 *  1. choose technique/weapon + legal target; pay costs
 *  2. roll the dice and convert results (table §11)
 *  3. 0 Successes → miss
 *  4. Dano bruto = Dano base + Successes beyond the first + modifiers
 *  5. Crítico: +1 Dano and ignores 1 Armadura (unless modified)
 *  6. then Armadura (Quebrado → treat as 1 less), Guardado, Cobertura (Distância only, −1, after the rest) and other reducers
 *  7. resolve Impulsos and later effects per their timing.
 */
import type { AttackCat, Figure, RollResult, VfxSchool } from './types';
import type { AttackOption, AttackOutcome, AttackSpec, Ctx } from './state';
import { rollDice, raiseLowest, summarize, type DieSpec, MAX_DICE } from './dice';
import { rollInt } from './rng';
import { reg } from './registry';
import { consumeGuard, dealDamage, fig, hasCover, hooksOf, log, newId, pushOps, setCond, tryFig, bleedTick, canUse, markUse } from './effects';
import { adjacent, canTarget, isActive } from './board';

export interface StartAttackInput {
  sourceId: string;
  targetId: string;
  extraTargets?: string[];
  techId: string;
  name: string;
  cat: AttackCat;
  dice: DieSpec[];
  dano: number;
  radiante?: boolean;
  school?: VfxSchool;
  ignoreArmor?: number;
  ignoreCover?: boolean;
  weapon?: boolean;
  spell?: boolean;
  control?: boolean;
  data?: Record<string, number | boolean | string>;
  pre?: string[];
}

/** Declare & roll a hero attack. Creates the 'attackPost' pending when there are choices. */
export function startHeroAttack(c: Ctx, inp: StartAttackInput) {
  const src = fig(c, inp.sourceId);
  let target = fig(c, inp.targetId);
  // Escudeiro "Interpor" (§43): 1/Ciclo, when an adjacent common/Elite ally is targeted by CaC/Alcance and the Escudeiro is a legal target.
  const support = !!inp.data?.['support'];
  if ((inp.cat === 'cac' || inp.cat === 'alcance') && !inp.control && !support) {
    const interposer = c.S.figures.find(
      (e) =>
        e.side === 'E' &&
        isActive(e) &&
        e.typeId === 'escudeiro' &&
        e.id !== target.id &&
        adjacent(e, target) &&
        !target.isBoss &&
        !target.isMiniboss &&
        canUse(e, 'cycle', 'interpor') &&
        legalFor(c, src, e, inp.cat),
    );
    if (interposer) {
      markUse(interposer, 'cycle', 'interpor');
      log(c, 'attack', `${interposer.name} usa Interpor e recebe o Ataque no lugar de ${target.name}.`);
      target = interposer;
    }
  }
  const w = src.equipment?.primary ? reg().items[src.equipment.primary.itemId] : undefined;
  const a: AttackSpec = {
    key: newId(c, 'atk'),
    sourceId: src.id,
    targetId: target.id,
    extraTargets: inp.extraTargets ?? [],
    techId: inp.techId,
    name: inp.name,
    cat: inp.cat,
    dice: inp.dice.slice(0, MAX_DICE),
    dano: inp.dano,
    bonusDano: 0,
    radiante: !!inp.radiante,
    school: inp.school ?? 'metal',
    ignoreArmor: inp.ignoreArmor ?? 0,
    ignoreCover: !!inp.ignoreCover,
    weapon: !!inp.weapon,
    weaponItemId: inp.weapon && w ? w.id : null,
    spell: !!inp.spell,
    control: !!inp.control,
    extraSuccesses: 0,
    furtivoAtDeclare: src.conditions.furtivo,
    targetHadBrecha: target.conditions.brechas > 0,
    targetWasExposto: target.conditions.exposto,
    targetWasQuebrado: target.conditions.quebrado,
    targetWasJulgado: target.conditions.julgadoPor === src.id,
    data: { ...(inp.data ?? {}) },
    pre: inp.pre ?? [],
  };
  // Exposto: next Attack against the target raises one Attack die by 1 Grau; then remove (§15).
  for (const tid of support ? [] : [a.targetId, ...a.extraTargets]) {
    const t = tryFig(c, tid);
    if (t && t.side !== src.side && t.conditions.exposto) {
      if (tid === a.targetId) a.dice = raiseLowest(a.dice, 1, 'Exposto');
      setCond(c, t, 'exposto', false);
    }
  }
  // Pesado: once per Activation, raise one appropriate die (§6). Player toggles via pre 'pesado'.
  if (a.pre.includes('pesado') && src.tempo === 'pesado' && canUse(src, 'activation', 'pesadoGrau')) {
    markUse(src, 'activation', 'pesadoGrau');
    a.dice = raiseLowest(a.dice, 1, 'Pesado');
    log(c, 'attack', `Tempo Pesado: ${src.name} aumenta 1 Grau.`);
  }
  // technique + equipment + class + talents pre-attack hooks
  const tech = findAction(src, a.techId);
  for (const { h } of hooksOf(src)) h.preAttack?.(c, src, a);
  // Furtivo ends after resolving a hostile Attack/Technique; handled after resolution.
  if (!support) {
    c.events.push({ type: 'attackDeclared', sourceId: src.id, targetIds: [a.targetId, ...a.extraTargets], cat: a.cat, name: a.name, school: a.school });
    log(c, 'attack', `${src.name} usa ${a.name} contra ${target.name}${a.extraTargets.length ? ` (+${a.extraTargets.length})` : ''}.`);
  } else log(c, 'attack', `${src.name} usa ${a.name}${target.id !== src.id ? ` em ${target.name}` : ''}.`);
  // Sangramento triggers on Attack (not on support rolls / sigil triggers)
  if (!support && !a.data['noBleed']) bleedTick(c, src);
  if (!isActive(src)) return;
  a.data['targetBrechas'] = target.conditions.brechas;
  const roll = rollDice(c.S.rng, a.dice);
  const r2 = summarize(roll.dice, a.extraSuccesses);
  c.events.push({ type: 'roll', figureId: src.id, purpose: a.name, roll: r2 });
  log(c, 'attack', `Rolagem: ${r2.dice.map((d) => `D${d.grade}=${d.value}`).join(' · ')} → ${r2.successes} Sucesso(s), ${r2.impulsos} Impulso(s)${r2.critico ? ', Crítico' : ''}.`, {
    dice: r2.dice,
  });
  const options = collectOptions(c, src, a, r2, tech);
  const canReroll = (src.res?.mira ?? 0) > 0 && src.typeId === 'arqueiro';
  if (options.length === 0 && !canReroll) {
    pushOps(c, [{ op: 'finishAttack', attack: a, roll: r2, choices: [] }]);
  } else {
    c.S.pending = { id: newId(c, 'p'), controllers: [src.id], kind: 'attackPost', attack: a, roll: r2, options, canReroll };
  }
}

function legalFor(c: Ctx, src: Figure, e: Figure, cat: AttackCat) {
  return canTarget(src.sector, e, cat, c.S.figures, src.side);
}

export function findAction(f: Figure, id: string) {
  const R = reg();
  const cls = R.classes[f.typeId];
  const fromClass = cls?.actions.find((x) => x.id === id);
  if (fromClass) return fromClass;
  for (const t of f.talents ?? []) {
    const td = R.talents[t];
    const a = td?.actions?.find((x) => x.id === id);
    if (a) return a;
  }
  return R.universalActions.find((x) => x.id === id) ?? Object.values(R.objectiveActions).find((x) => x.id === id);
}

export function collectOptions(c: Ctx, src: Figure, a: AttackSpec, r: RollResult, tech = findAction(src, a.techId)): AttackOption[] {
  const out: AttackOption[] = [];
  if (tech?.attackOptions) out.push(...tech.attackOptions(c, src, a, r).map((o) => ({ ...o, source: o.source || `tech:${tech.id}` })));
  for (const { id, h } of hooksOf(src)) {
    const opts = h.attackOptions?.(c, src, a, r) ?? [];
    out.push(...opts.map((o) => ({ ...o, source: o.source || id })));
  }
  return out;
}

/** Arqueiro: spend 1 Mira to reroll one die (§18.5). Keeps pending open with recomputed options. */
export function rerollDie(c: Ctx, dieIndex: number) {
  const p = c.S.pending;
  if (!p || p.kind !== 'attackPost') throw new Error('no attack pending');
  const src = fig(c, p.attack.sourceId);
  if ((src.res?.mira ?? 0) <= 0) throw new Error('Sem Mira');
  const d = p.roll.dice[dieIndex];
  if (!d) throw new Error('dado inválido');
  src.res!.mira--;
  const nd = { ...d, value: rollInt(c.S.rng, d.grade), rerolled: true };
  const dice = p.roll.dice.slice();
  dice[dieIndex] = nd;
  const r = summarize(dice, p.attack.extraSuccesses);
  log(c, 'resource', `${src.name} gasta 1 Mira e rerrola D${d.grade}: ${d.value} → ${nd.value}.`);
  c.events.push({ type: 'roll', figureId: src.id, purpose: `${p.attack.name} (rerrolagem)`, roll: r });
  c.events.push({ type: 'resource', figureId: src.id, resource: 'mira', value: src.res!.mira });
  p.roll = r;
  p.options = collectOptions(c, src, p.attack, r);
  p.canReroll = src.res!.mira > 0;
}

export function validateChoices(opts: AttackOption[], roll: RollResult, choices: string[], src: Figure, maxBrecha = 99): string | null {
  let imp = 0,
    mira = 0,
    conv = 0,
    brecha = 0;
  const groups = new Set<string>();
  for (const id of choices) {
    const o = opts.find((x) => x.id === id);
    if (!o) return `Opção inválida: ${id}`;
    if (o.group) {
      if (groups.has(o.group)) return `Opções exclusivas: ${o.label}`;
      groups.add(o.group);
    }
    imp += o.cost.impulso ?? 0;
    mira += o.cost.mira ?? 0;
    conv += o.cost.conviccao ?? 0;
    brecha += o.cost.brecha ?? 0;
  }
  if (imp > roll.impulsos) return 'Impulsos insuficientes.';
  if (mira > (src.res?.mira ?? 0)) return 'Mira insuficiente.';
  if (conv > (src.res?.conviccao ?? 0)) return 'Convicção insuficiente.';
  if (brecha > maxBrecha) return 'Brechas insuficientes no alvo.';
  return null;
}

/** Resolve a hero attack after post-roll choices. */
export function finishHeroAttack(c: Ctx, a: AttackSpec, roll: RollResult, choices: string[]) {
  const src = fig(c, a.sourceId);
  const R = reg();
  const tech = findAction(src, a.techId);
  const opts = collectOptions(c, src, a, roll, tech);
  const chosen = opts.filter((o) => choices.includes(o.id));
  // pay costs
  for (const o of chosen) {
    if (o.cost.mira && src.res) src.res.mira -= o.cost.mira;
    if (o.cost.conviccao && src.res) src.res.conviccao -= o.cost.conviccao;
    if (o.cost.brecha) {
      const t = tryFig(c, a.targetId);
      if (t) t.conditions.brechas = Math.max(0, t.conditions.brechas - o.cost.brecha);
    }
  }
  const out: AttackOutcome = {
    hit: false,
    results: [],
    spent: chosen.map((o) => o.id),
    addDano: 0,
    addIgnoreArmor: 0,
    ignoreCover: a.ignoreCover,
    radiante: a.radiante,
    noConviccaoGain: false,
  };
  // pre-damage option application (may add successes / dano / pierce)
  let extraSucc = 0;
  for (const o of chosen) {
    if (o.id === 'brecha:pontoFraco') extraSucc += 1;
    applyOpt(c, src, a, roll, o, out, tech, 'pre');
  }
  const successes = roll.successes + extraSucc;
  out.hit = successes >= 1;
  const targets = [a.targetId, ...a.extraTargets].map((id) => tryFig(c, id)).filter((t): t is Figure => !!t && isActive(t));
  if (a.control) {
    // Teste de Controle: success applies the effect; handled by technique onResolve.
    log(c, 'attack', out.hit ? `${a.name}: Controle bem-sucedido.` : `${a.name}: Controle falha.`);
  } else if (!out.hit) {
    log(c, 'attack', `${a.name} erra (0 Sucessos).`);
    for (const t of targets) c.events.push({ type: 'miss', sourceId: src.id, targetId: t.id });
  } else {
    for (const t of targets) {
      const res = computeHeroDamage(c, src, t, a, successes, roll.critico, out);
      out.results.push(res);
    }
  }
  // Paladino: Convicção via Julgamento (once per Activation) when dealing damage to the Julgado without spending Convicção.
  // technique-specific effects
  tech?.onResolve?.(c, src, a, roll, out);
  for (const o of chosen) applyOpt(c, src, a, roll, o, out, tech, 'post');
  for (const { h } of hooksOf(src)) h.afterAttack?.(c, src, a, roll, out);
  // Quebrado on target consumed by the next attack that hits (done in computeHeroDamage)
  // Furtivo ends after resolving a hostile Attack/Technique (§51.1)
  if (src.conditions.furtivo && !a.data['keepFurtivo'] && !a.data['support']) setCond(c, src, 'furtivo', false);
  for (const r of out.results) {
    const t = tryFig(c, r.targetId);
    if (t && t.status === 'dead') for (const { h } of hooksOf(src)) h.onEnemyDefeated?.(c, src, t, { byAttack: a });
  }
  void R;
  pushOps(c, [{ op: 'checkEnd' }], false);
}

function applyOpt(c: Ctx, src: Figure, a: AttackSpec, r: RollResult, o: AttackOption, out: AttackOutcome, tech: ReturnType<typeof findAction>, when: 'pre' | 'post') {
  if (o.requiresHit && !out.hit && when === 'post') return;
  if (o.source.startsWith('tech:')) {
    if (when === 'pre') tech?.applyAttackOption?.(c, src, a, r, o.id, out);
    else tech?.afterAttackOption?.(c, src, a, r, o.id, out);
    return;
  }
  for (const { id, h } of hooksOf(src)) {
    if (id !== o.source) continue;
    if (when === 'pre') h.applyAttackOption?.(c, src, a, r, o.id, out);
    else h.afterAttackOption?.(c, src, a, r, o.id, out);
  }
}

/** Order: Dano bruto → Crítico → Armadura (Quebrado) → Guardado → Cobertura → final. */
export function computeHeroDamage(c: Ctx, src: Figure, t: Figure, a: AttackSpec, successes: number, crit: boolean, out: AttackOutcome) {
  const isMain = t.id === a.targetId;
  let raw = a.dano + Math.max(0, successes - 1) + a.bonusDano + (isMain ? out.addDano : 0);
  let ignore = a.ignoreArmor + (isMain ? out.addIgnoreArmor : 0);
  const radiante = out.radiante;
  if (crit) {
    raw += 1;
    ignore += 1;
  }
  if (radiante && t.profano) raw += 1; // Radiante × Profano (§15)
  let armor = t.armor + t.conditions.armaduraExtra;
  if (t.conditions.quebrado) {
    armor -= 1;
    setCond(c, t, 'quebrado', false);
  }
  armor = Math.max(0, armor - ignore);
  let final = Math.max(0, raw - armor);
  if (armor > 0 && raw > 0) c.events.push({ type: 'armorAbsorb', targetId: t.id, amount: Math.min(armor, raw) });
  if (final > 0 && t.conditions.guardado) final = consumeGuard(c, t, final);
  let reducedByCover = false;
  if (a.cat === 'distancia' && final > 0 && !out.ignoreCover && hasCover(c, t)) {
    final -= 1;
    reducedByCover = true;
  }
  log(
    c,
    'attack',
    `${a.name} → ${t.name}: Dano bruto ${raw}${crit ? ' (Crítico)' : ''}, Armadura ${armor}${reducedByCover ? ', Cobertura −1' : ''} → Dano final ${final}.`,
  );
  c.events.push({ type: 'hit', sourceId: src.id, targetId: t.id, damage: final, blocked: Math.max(0, raw - final), school: radiante ? 'holy' : a.school, critical: crit });
  const dealt = final > 0 ? dealDamage(c, t, final, { direct: false, sourceId: src.id, school: radiante ? 'holy' : a.school, skipGuard: true, fromAttack: true }) : 0;
  return { targetId: t.id, raw, armor, final: dealt, killed: t.status === 'dead', reducedByCover };
}
