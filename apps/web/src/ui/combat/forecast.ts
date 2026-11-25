/**
 * Exact attack forecast. The rules engine is pure and deterministic, so instead of re-implementing the damage
 * formula (techniques, Impulsos, Crítico, Armadura, Quebrado, Guardado, Cobertura, Interpor…) the forecast plays the
 * real command on copies of the battle with many different dice and counts what happened. The real state is never
 * touched and nothing random leaks back: every sample uses its own seed.
 */
import { createRng, dispatch, type CombatState, type Command, type DomainEvent, type Pending } from '@mosteiro/core';

export type ActionCommand = Extract<Command, { t: 'action' }>;

export interface AttackForecast {
  samples: number;
  /** chance the attack connects (≥1 Sucesso) */
  hit: number;
  /** chance the target goes down */
  kill: number;
  /** damage actually dealt to the target when the attack connects */
  dmgMin: number;
  dmgMax: number;
  dmgTypical: number;
  /** chance of at least one Impulso / of a Crítico */
  impulso: number;
  crit: number;
  /** someone else takes the blow (e.g. the Escudeiro's Interpor) */
  redirect: string | null;
  /** the dice this attack rolls (grades), as seen in the simulation */
  dice: number[];
}

/** Impulsos are lost if unspent: pre-spend them on the strongest effects (damage first). Persistent resources
 *  (Mira, Convicção, Brechas) stay the player's call. Shared by the result sheet and the forecast. */
export function autoSpend(p: Extract<Pending, { kind: 'attackPost' }>): string[] {
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

const cache = new Map<string, AttackForecast | null>();
const keyOf = (S: CombatState, cmd: ActionCommand, targetId: string, samples: number) =>
  [S.encounterId, S.commandCount, S.logSeq, cmd.actionId, cmd.figureId, targetId, (cmd.pre ?? []).join(','), cmd.option ?? '', samples].join('|');

/** Peek at a cached forecast without computing it. */
export function cachedForecast(S: CombatState, cmd: ActionCommand, targetId: string, samples = 96): AttackForecast | null | undefined {
  return cache.get(keyOf(S, cmd, targetId, samples));
}

/** One simulation in progress: run samples a few at a time, then read the result. */
class Sim {
  private base: CombatState;
  private before: number;
  private i = 0;
  private hits = 0;
  private kills = 0;
  private imp = 0;
  private crit = 0;
  private rolled = 0;
  private redirect: string | null = null;
  private dice: number[] = [];
  private dmg: number[] = [];
  failed = false;
  constructor(
    S: CombatState,
    private cmd: ActionCommand,
    private targetId: string,
    readonly samples: number,
  ) {
    // the log is only ever appended to: dropping it makes every copy much cheaper
    this.base = { ...S, log: [] };
    this.before = S.figures.find((f) => f.id === targetId)?.hp ?? 0;
  }
  get done() {
    return this.failed || this.i >= this.samples;
  }
  step(n: number) {
    const { cmd, targetId } = this;
    for (let k = 0; k < n && !this.done; k++) {
      let r = dispatch({ ...this.base, rng: createRng(`fc:${this.i++}`) }, cmd);
      if (r.error) {
        this.failed = true;
        return;
      }
      const events: DomainEvent[] = [...r.events];
      // accept the defaults on the result sheet (what tapping "Continuar" does)
      for (let j = 0; j < 4 && r.state.pending?.kind === 'attackPost'; j++) {
        const p = r.state.pending;
        const next = dispatch(r.state, { t: 'answer', pendingId: p.id, answer: { kind: 'attackPost', choices: autoSpend(p) } });
        if (next.error) break;
        r = next;
        events.push(...next.events);
      }
      const declared = events.find((e): e is Extract<DomainEvent, { type: 'attackDeclared' }> => e.type === 'attackDeclared' && e.sourceId === cmd.figureId);
      if (declared && declared.targetIds[0] && declared.targetIds[0] !== targetId) this.redirect = declared.targetIds[0];
      const roll = events.find((e): e is Extract<DomainEvent, { type: 'roll' }> => e.type === 'roll' && e.figureId === cmd.figureId);
      if (!roll) continue;
      if (!this.rolled) this.dice = roll.roll.dice.map((d) => d.grade);
      this.rolled++;
      if (roll.roll.impulsos > 0) this.imp++;
      if (roll.roll.critico) this.crit++;
      const after = r.state.figures.find((f) => f.id === targetId);
      const connected = roll.roll.successes >= 1 && !events.some((e) => e.type === 'miss' && e.targetId === targetId);
      if (connected) {
        this.hits++;
        this.dmg.push(Math.max(0, this.before - (after?.hp ?? 0)));
      }
      if (!after || after.status !== 'active') this.kills++;
    }
  }
  result(): AttackForecast | null {
    if (this.failed || !this.rolled) return null;
    const dmg = [...this.dmg].sort((a, b) => a - b);
    const n = this.rolled;
    return {
      samples: n,
      hit: this.hits / n,
      kill: this.kills / n,
      dmgMin: dmg[0] ?? 0,
      dmgMax: dmg[dmg.length - 1] ?? 0,
      dmgTypical: dmg[Math.floor(dmg.length / 2)] ?? 0,
      impulso: this.imp / n,
      crit: this.crit / n,
      redirect: this.redirect,
      dice: this.dice,
    };
  }
}

function remember(key: string, v: AttackForecast | null) {
  if (cache.size > 400) cache.clear();
  cache.set(key, v);
  return v;
}

/** Synchronous forecast (tests, small sample counts). */
export function simulateAttack(S: CombatState, cmd: ActionCommand, targetId: string, samples = 96): AttackForecast | null {
  const key = keyOf(S, cmd, targetId, samples);
  const known = cache.get(key);
  if (known !== undefined) return known;
  if (!S.figures.some((f) => f.id === targetId)) return null;
  const sim = new Sim(S, cmd, targetId, samples);
  sim.step(samples);
  return remember(key, sim.result());
}

/**
 * Same forecast, computed a few samples per task so a phone never stutters (the card shows quick odds first and the
 * exact numbers a moment later). Returns a cancel function.
 */
export function forecastLater(S: CombatState, cmd: ActionCommand, targetId: string, done: (f: AttackForecast | null) => void, samples = 96, slice = 4, budgetMs = 10): () => void {
  const key = keyOf(S, cmd, targetId, samples);
  const known = cache.get(key);
  if (known !== undefined) {
    done(known);
    return () => {};
  }
  if (!S.figures.some((f) => f.id === targetId)) {
    done(null);
    return () => {};
  }
  const sim = new Sim(S, cmd, targetId, samples);
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = () => {
    if (cancelled) return;
    // as many samples as fit in a few milliseconds: fast phones finish in one go, slow ones never stutter
    const t0 = performance.now();
    do sim.step(slice);
    while (!sim.done && performance.now() - t0 < budgetMs);
    if (sim.done) done(remember(key, sim.result()));
    else timer = setTimeout(tick, 0);
  };
  timer = setTimeout(tick, 0);
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}
