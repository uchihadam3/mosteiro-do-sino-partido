/**
 * Ataque inimigo e Defesa (§13, R06). Enemies never roll Attack.
 * Intenção → Dano + Defense attribute → hero rolls Defesa (each Success blocks 1 Dano)
 * → Armadura → Guardado → Cobertura → other reducers → Dano final → condition triggers.
 * Dano Direto: no Defesa; ignores Defesa, Armadura and Cobertura.
 * Reações (§14): 1 per hero per Cycle. Ajuda universal: +D4 to your or an Adjacent ally's Defesa (max 3 dice).
 */
import type { Figure } from './types';
import type { Ctx, DefenseState, EffectSpec, EnemyAttackSpec } from './state';
import { rollDice, raiseLowest, summarize, MAX_DICE, type DieSpec } from './dice';
import { reg, type ReactionOption } from './registry';
import {
  applyCondition,
  consumeGuard,
  dealDamage,
  fig,
  hasCover,
  heroes,
  hooksOf,
  inSupportZone,
  log,
  newId,
  pull,
  push,
  pushOps,
  setCond,
  tryFig,
  canUse,
  markUse,
  hasItem,
} from './effects';
import { adjacent, canTarget, isActive } from './board';

export function enqueueEnemyAttack(c: Ctx, spec: EnemyAttackSpec) {
  pushOps(c, [{ op: 'eAttack', spec }], false);
}

export function runEnemyAttack(c: Ctx, spec: EnemyAttackSpec) {
  const src = tryFig(c, spec.sourceId);
  if (!src || !isActive(src)) return;
  const targets = spec.targetIds.map((id) => tryFig(c, id)).filter((t): t is Figure => !!t && isActive(t));
  if (!targets.length) {
    log(c, 'attack', `${src.name}: ${spec.name} sem alvo válido.`);
    return;
  }
  // single-target CaC/Alcance must still be legal after movement
  const legal = targets.filter((t) => spec.cat === 'distancia' || spec.cat === 'global' || spec.data['area'] || canTarget(src.sector, t, spec.cat, c.S.figures, src.side));
  if (!legal.length) {
    log(c, 'attack', `${src.name} não alcança o alvo com ${spec.name}.`);
    return;
  }
  c.events.push({ type: 'attackDeclared', sourceId: src.id, targetIds: legal.map((t) => t.id), cat: spec.cat, name: spec.name, school: spec.school });
  log(c, 'attack', `${src.name} — ${spec.name}: ${legal.map((t) => t.name).join(', ')} defende(m) Dano ${spec.dano}${spec.direct ? ' Direto' : `, Defesa ${attrLabel(spec.def)}`}.`);
  // Sangramento on enemy attack
  if (src.conditions.sangramento > 0) {
    src.conditions.sangramento--;
    dealDamage(c, src, 1, { direct: true, sourceId: null, school: 'blood', label: 'Sangramento', condition: 'sangramento' });
    if (!isActive(src)) return;
  }
  pushOps(
    c,
    legal.map((t) => ({ op: 'defend' as const, spec, targetId: t.id })),
  );
}

export function attrLabel(a: string): string {
  return (
    {
      poder: 'Poder',
      guarda: 'Guarda',
      agilidade: 'Agilidade',
      precisao: 'Precisão',
      arcano: 'Arcano',
      determinacao: 'Determinação',
      espirito: 'Espírito',
      sombra: 'Sombra',
    } as Record<string, string>
  )[a] ?? a;
}

/** Build the defense and either resolve directly or open the reaction window. */
export function beginDefense(c: Ctx, spec: EnemyAttackSpec, targetId: string) {
  const t = tryFig(c, targetId);
  if (!t || !isActive(t)) return;
  if (spec.direct) {
    const src = tryFig(c, spec.sourceId);
    const bonus = bonusFor(c, spec, t);
    dealDamage(c, t, spec.dano + bonus, { direct: true, sourceId: spec.sourceId, school: spec.school, label: spec.name });
    if (src) postEffects(c, spec, t, spec.dano + bonus, 99);
    return;
  }
  const grade = t.attrs?.[spec.def] ?? 4;
  const d: DefenseState = { attack: spec, targetId, dice: [{ grade, source: attrLabel(spec.def) }], reactionsUsed: [] };
  for (const { h } of hooksOf(t)) h.preDefense?.(c, t, d);
  // Bênção da Vigília: next Defesa raises the main die 1 Grau, then remove (§18.4).
  if (t.conditions.bencao) {
    d.dice = [{ grade: raiseLowest([d.dice[0]], 1)[0].grade, source: `${d.dice[0].source}+Bênção` }, ...d.dice.slice(1)];
    t.conditions.bencao = false;
    c.events.push({ type: 'condition', targetId: t.id, condition: 'bencao', added: false });
    log(c, 'condition', `Bênção da Vigília eleva a Defesa de ${t.name}.`);
  }
  const options = reactionOptions(c, d);
  if (!options.length) {
    pushOps(c, [{ op: 'defendResolve', d }]);
    return;
  }
  const preview = previewDefense(c, d);
  c.S.pending = {
    id: newId(c, 'p'),
    controllers: [...new Set(options.map((o) => o.heroId))],
    kind: 'defense',
    d,
    options,
    preview,
  };
}

function previewDefense(c: Ctx, d: DefenseState) {
  const t = fig(c, d.targetId);
  return {
    dano: d.attack.dano + bonusFor(c, d.attack, t),
    armor: Math.max(0, t.armor - d.attack.ignoreArmor - (t.conditions.quebrado ? 1 : 0)),
    cover: d.attack.cat === 'distancia' && !d.attack.ignoreCover && hasCover(c, t),
    guard: t.conditions.guardado,
  };
}

export function heroCanReact(c: Ctx, h: Figure): boolean {
  return isActive(h) && !!h.reaction && !h.conditions.semReacoes;
}

export function reactionOptions(c: Ctx, d: DefenseState): ReactionOption[] {
  const t = fig(c, d.targetId);
  const out: ReactionOption[] = [];
  if (d.dice.length >= MAX_DICE) return out;
  for (const h of heroes(c)) {
    if (!heroCanReact(c, h)) continue;
    if (d.reactionsUsed.some((r) => r.heroId === h.id)) continue;
    // Ajuda universal
    if (h.id === t.id || adjacent(h, t)) out.push({ heroId: h.id, kind: 'ajuda', label: `Ajuda (${h.name}): +D4`, addDie: 4 });
    for (const { h: hk } of hooksOf(h)) out.push(...(hk.defenseReactions?.(c, h, d) ?? []));
  }
  return out;
}

/** Commit chosen reactions (each hero at most one Reação per Cycle). */
export function commitDefense(c: Ctx, d: DefenseState, chosen: { heroId: string; kind: string }[]) {
  const seen = new Set<string>();
  const opts = reactionOptions(c, d);
  for (const ch of chosen) {
    if (seen.has(ch.heroId)) throw new Error('Cada herói possui apenas 1 Reação por Ciclo.');
    const o = opts.find((x) => x.heroId === ch.heroId && x.kind === ch.kind);
    if (!o) throw new Error(`Reação inválida: ${ch.kind}`);
    if (d.dice.length >= MAX_DICE && o.addDie) throw new Error('Máximo de 3 dados na Defesa.');
    seen.add(ch.heroId);
    const h = fig(c, ch.heroId);
    h.reaction = false;
    c.events.push({ type: 'resource', figureId: h.id, resource: 'reaction', value: 0 });
    d.reactionsUsed.push({ heroId: h.id, kind: ch.kind });
    if (ch.kind === 'ajuda') {
      d.dice.push({ grade: 4, source: `Ajuda (${h.name})` });
      log(c, 'defense', `${h.name} gasta a Reação: Ajuda +D4.`);
    } else {
      // each hook handles only the kinds it offers (unknown kinds are ignored by the hook)
      for (const { h: hk } of hooksOf(h)) hk.applyReaction?.(c, h, d, ch.kind);
    }
    if (d.dice.length > MAX_DICE) d.dice = d.dice.slice(0, MAX_DICE);
  }
  pushOps(c, [{ op: 'defendResolve', d }]);
}

function bonusFor(c: Ctx, spec: EnemyAttackSpec, t: Figure): number {
  const src = tryFig(c, spec.sourceId);
  let b = spec.perTargetBonus[t.id] ?? 0;
  if (src) b += reg().enemies[src.typeId]?.damageBonus?.(c, src, t, spec) ?? 0;
  return b;
}

export function resolveDefense(c: Ctx, d: DefenseState) {
  const t = tryFig(c, d.targetId);
  const spec = d.attack;
  if (!t || !isActive(t)) return;
  const roll = rollDice(c.S.rng, d.dice);
  const r = summarize(roll.dice);
  d.roll = r;
  c.events.push({ type: 'roll', figureId: t.id, purpose: `Defesa — ${spec.name}`, roll: r });
  const dano = spec.dano + bonusFor(c, spec, t);
  log(c, 'defense', `${t.name} rola Defesa ${r.dice.map((x) => `D${x.grade}=${x.value}`).join(' · ')} → ${r.successes} Sucesso(s) bloqueiam.`, { dice: r.dice });
  let dmg = Math.max(0, dano - r.successes);
  // Armadura
  let armor = t.armor + t.conditions.armaduraExtra;
  armor = Math.max(0, armor - spec.ignoreArmor);
  if (t.conditions.quebrado) {
    armor = Math.max(0, armor - 1);
    setCond(c, t, 'quebrado', false);
  }
  // Solo Consagrado: first Attack hitting each protected hero meets +1 Armadura
  for (const area of c.S.battlefield.consecrated) {
    if (area.sectors.includes(t.sector) && !area.used.includes(t.id)) {
      area.used.push(t.id);
      armor += 1;
      log(c, 'defense', `Solo Consagrado: +1 Armadura para ${t.name}.`);
      break;
    }
  }
  // Bastião de Ferro (Âncora): once during the Anchor, first Attack causing ≥1 Dano after Defesa treats Armadura as 2.
  if (t.conditions.ancorado && !t.conditions.ancoradoUsado && dmg >= 1) {
    t.conditions.ancoradoUsado = true;
    armor = Math.max(armor, 2);
    log(c, 'item', `Âncora: Armadura de ${t.name} tratada como 2.`);
  }
  const afterArmor = Math.max(0, dmg - armor);
  if (dmg > 0 && armor > 0) c.events.push({ type: 'armorAbsorb', targetId: t.id, amount: Math.min(dmg, armor) });
  dmg = afterArmor;
  if (dmg > 0 && t.conditions.guardado) dmg = consumeGuard(c, t, dmg);
  let coverUsed = false;
  if (dmg > 0 && spec.cat === 'distancia' && !spec.ignoreCover && hasCover(c, t)) {
    dmg -= 1;
    coverUsed = true;
    log(c, 'defense', `Cobertura reduz 1 Dano de ${t.name}.`);
    c.S.flags[`__coverReduced:${t.id}`] = c.S.cycle;
  }
  for (const { h } of hooksOf(t)) {
    const red = h.reduceEnemyDamage?.(c, t, d, dmg) ?? 0;
    if (red > 0) dmg = Math.max(0, dmg - red);
  }
  // Égide window
  const paladins = heroes(c).filter(
    (p) => p.typeId === 'paladino' && heroCanReact(c, p) && (p.id === t.id || inSupportZone(p, t) || adjacent(p, t)) && !d.reactionsUsed.some((x) => x.heroId === p.id),
  );
  c.S.flags['__lastDefCover'] = coverUsed;
  if (dmg > 0 && paladins.length) {
    c.S.pending = { id: newId(c, 'p'), controllers: paladins.map((p) => p.id), kind: 'egide', d, damage: dmg, paladins: paladins.map((p) => p.id) };
    return;
  }
  applyDefenseDamage(c, d, dmg);
}

/** Paladino Égide (§18.2): spend Reação, roll Espírito; each Success reduces 1 additional Dano. */
export function resolveEgide(c: Ctx, d: DefenseState, damage: number, paladinId: string | null) {
  let dmg = damage;
  if (paladinId) {
    const p = fig(c, paladinId);
    p.reaction = false;
    d.reactionsUsed.push({ heroId: p.id, kind: 'egide' });
    const r = summarize(rollDice(c.S.rng, [{ grade: p.attrs!.espirito, source: 'Espírito (Égide)' }]).dice);
    c.events.push({ type: 'roll', figureId: p.id, purpose: 'Égide', roll: r });
    const before = dmg;
    dmg = Math.max(0, dmg - r.successes);
    log(c, 'defense', `${p.name} usa Égide: ${r.successes} Sucesso(s) reduzem ${before - dmg} Dano.`);
    if (before > 0 && dmg === 0 && canUse(p, 'cycle', 'egideConv') && p.res) {
      markUse(p, 'cycle', 'egideConv');
      p.res.conviccao = Math.min(3, p.res.conviccao + 1);
      log(c, 'resource', `${p.name} impede o Dano e gera 1 Convicção (${p.res.conviccao}).`);
    }
    for (const { h } of hooksOf(p)) (h as any).afterEgide?.(c, p, d, r);
  }
  applyDefenseDamage(c, d, dmg);
}

function applyDefenseDamage(c: Ctx, d: DefenseState, dmg: number) {
  const t = fig(c, d.targetId);
  const spec = d.attack;
  const src = tryFig(c, spec.sourceId);
  const dealt = dmg > 0 ? dealDamage(c, t, dmg, { direct: false, sourceId: spec.sourceId, school: spec.school, skipGuard: true, label: spec.name }) : 0;
  c.events.push({ type: 'hit', sourceId: spec.sourceId, targetId: t.id, damage: dealt, blocked: Math.max(0, spec.dano - dealt), school: spec.school, critical: false });
  if (dealt === 0) log(c, 'defense', `${t.name} não sofre Dano de ${spec.name}.`);
  // Riposta (Guerreiro §18.1): once per Cycle, Defesa vs adjacent CaC attack → 0 Dano final ⇒ 1 Dano Direto to attacker.
  // Guarda Experiente (T2) extends to exactly 1.
  if (t.typeId === 'guerreiro' && isActive(t) && src && isActive(src) && spec.cat === 'cac' && adjacent(src, t) && canUse(t, 'cycle', 'riposta')) {
    const threshold = (t.talents ?? []).includes('g_guarda_experiente') ? 1 : 0;
    if (dealt <= threshold) {
      markUse(t, 'cycle', 'riposta');
      log(c, 'attack', `Riposta! ${t.name} causa 1 Dano Direto em ${src.name}.`);
      dealDamage(c, src, 1, { direct: true, sourceId: t.id, school: 'metal', label: 'Riposta' });
    }
  }
  for (const { h } of hooksOf(t)) h.afterDefense?.(c, t, d, dealt);
  postEffects(c, spec, t, dealt, d.roll?.successes ?? 0);
}

function postEffects(c: Ctx, spec: EnemyAttackSpec, t: Figure, final: number, successes: number) {
  const effects: EffectSpec[] = [];
  if (final >= 1) effects.push(...spec.onDamage);
  if (successes === 0) effects.push(...spec.onZero);
  effects.push(...spec.after);
  pushOps(
    c,
    effects.map((e) => ({ op: 'effect' as const, targetId: t.id, effect: e, sourceId: spec.sourceId })),
  );
}

const HERO_CONDITIONS = new Set(['veneno', 'sangramento', 'queimando', 'quebrado', 'exposto', 'imobilizado', 'atordoado']);

/** Effect application with the Intercessão (Clérigo) and Selo de Resistência windows. */
export function runEffect(c: Ctx, targetId: string, effect: EffectSpec, sourceId: string, skipWindow = false) {
  const t = tryFig(c, targetId);
  if (!t || !isActive(t)) return;
  if (effect.kind === 'push') {
    if (t.side === 'H' && hasItem(t, 'fivela_de_ferro') && canUse(t, 'combat', 'fivela')) {
      c.S.pending = {
        id: newId(c, 'p'),
        controllers: [t.id],
        kind: 'choice',
        prompt: `Fivela de Ferro (${t.name}): ignorar o Empurrar ou resolvê-lo (recebendo Guardado se mover)?`,
        figureId: t.id,
        handler: 'item:fivela',
        options: [
          { id: 'ignore', label: 'Ignorar o movimento' },
          { id: 'resolve', label: 'Resolver e receber Guardado' },
          { id: 'none', label: 'Não usar' },
        ],
        args: { targetId: t.id, kind: 'push', sourceId },
      };
      return;
    }
    push(c, t, sourceId);
    return;
  }
  if (effect.kind === 'pull') {
    if (t.side === 'H' && hasItem(t, 'fivela_de_ferro') && canUse(t, 'combat', 'fivela')) {
      c.S.pending = {
        id: newId(c, 'p'),
        controllers: [t.id],
        kind: 'choice',
        prompt: `Fivela de Ferro (${t.name}): ignorar o Puxar ou resolvê-lo (recebendo Guardado se mover)?`,
        figureId: t.id,
        handler: 'item:fivela',
        options: [
          { id: 'ignore', label: 'Ignorar o movimento' },
          { id: 'resolve', label: 'Resolver e receber Guardado' },
          { id: 'none', label: 'Não usar' },
        ],
        args: { targetId: t.id, kind: 'pull', sourceId },
      };
      return;
    }
    pull(c, t, sourceId);
    return;
  }
  if (effect.kind === 'directDamage') {
    dealDamage(c, t, effect.n, { direct: true, sourceId, school: 'profane' });
    return;
  }
  // conditions
  if (t.side === 'H' && !skipWindow && HERO_CONDITIONS.has(effect.cond)) {
    const opts: { heroId: string; kind: string; label: string }[] = [];
    for (const cl of heroes(c)) {
      if (cl.typeId !== 'clerigo' || !heroCanReact(c, cl)) continue;
      if (cl.id === t.id || inSupportZone(cl, t)) opts.push({ heroId: cl.id, kind: 'intercessao', label: `Intercessão (${cl.name}): rolar Espírito para cancelar` });
    }
    if ((effect.cond === 'atordoado' || effect.cond === 'imobilizado') && t.backpack?.some((i) => i.itemId === 'selo_resistencia')) {
      opts.push({ heroId: t.id, kind: 'selo', label: 'Selo de Resistência: descartar para cancelar' });
    }
    if (opts.length) {
      c.S.pending = { id: newId(c, 'p'), controllers: [...new Set(opts.map((o) => o.heroId))], kind: 'conditionResponse', targetId: t.id, effect, sourceId, options: opts };
      return;
    }
  }
  applyCondition(c, t, effect.cond, effect.n ?? 1, sourceId);
}

export function resolveConditionResponse(c: Ctx, targetId: string, effect: EffectSpec, sourceId: string, choice: { heroId: string; kind: string } | null) {
  const t = fig(c, targetId);
  if (!choice || effect.kind !== 'cond') {
    runEffect(c, targetId, effect, sourceId, true);
    return;
  }
  if (choice.kind === 'selo') {
    const i = t.backpack!.findIndex((x) => x.itemId === 'selo_resistencia');
    if (i >= 0) t.backpack!.splice(i, 1);
    log(c, 'item', `${t.name} descarta Selo de Resistência e cancela ${effect.cond}.`);
    c.events.push({ type: 'condition', targetId: t.id, condition: effect.cond, added: false });
    return;
  }
  if (choice.kind === 'intercessao') {
    const cl = fig(c, choice.heroId);
    cl.reaction = false;
    const r = summarize(rollDice(c.S.rng, [{ grade: cl.attrs!.espirito, source: 'Espírito (Intercessão)' }]).dice);
    c.events.push({ type: 'roll', figureId: cl.id, purpose: 'Intercessão', roll: r });
    if (r.successes >= 1) {
      log(c, 'defense', `${cl.name} intercede: a Condição é cancelada.`);
      c.events.push({ type: 'condition', targetId: t.id, condition: effect.cond, added: false });
      if ((cl.talents ?? []).includes('c_intercessao_firme')) applyCondition(c, t, 'guardado', 1, cl.id);
      return;
    }
    log(c, 'defense', `Intercessão de ${cl.name} falha.`);
    // Sino da Vigília (§19 Clérigo)
    if (hasItem(cl, 'sino_vigilia')) {
      if (cl.id !== t.id) {
        log(c, 'item', `Sino da Vigília: ${cl.name} recebe a Condição no lugar de ${t.name}.`);
        applyCondition(c, cl, effect.cond, effect.n ?? 1, sourceId);
        return;
      }
      dealDamage(c, cl, 1, { direct: true, sourceId: null, school: 'holy', label: 'Sino da Vigília' });
      if (isActive(cl)) {
        const r2 = summarize(rollDice(c.S.rng, [{ grade: cl.attrs!.espirito, source: 'Espírito (Sino)' }]).dice);
        c.events.push({ type: 'roll', figureId: cl.id, purpose: 'Sino da Vigília — rerrolagem', roll: r2 });
        if (r2.successes >= 1) {
          log(c, 'defense', 'Sino da Vigília: a rerrolagem cancela a Condição.');
          return;
        }
      }
    }
    applyCondition(c, t, effect.cond, effect.n ?? 1, sourceId);
  }
}

export type { DieSpec };
