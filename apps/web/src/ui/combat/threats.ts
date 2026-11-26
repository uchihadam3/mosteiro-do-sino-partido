/**
 * Who each enemy will hit this Cycle: runs each revealed Intention's plan on a copy of the battle (the real state is
 * untouched). Used by the HUD (order strip, portraits) and by the board (the intent bubble over each enemy).
 */
import { ctxOf, intentFor, type CombatState, type Tempo } from '@mosteiro/core';

export interface Threat {
  from: string;
  to: string[];
  dano: Record<string, number>;
  tempo: Tempo;
  name: string;
}
/** Runs each revealed Intention's plan on a copy of the state to learn its targets (the real state is untouched). */
export function predictThreats(S: CombatState): Threat[] {
  const out: Threat[] = [];
  if (S.phase === 'deploy' || S.result) return out;
  for (const f of S.figures) {
    if (f.side !== 'E' || f.status !== 'active') continue;
    const intent = intentFor(S, f.typeId);
    if (!intent || !['melee', 'ranged', 'area', 'control'].includes(intent.kind)) continue;
    try {
      const copy = structuredClone(S);
      copy.queue = [];
      copy.pending = null;
      copy.settings = { ...copy.settings, autoTieBreak: true };
      const c2 = ctxOf(copy);
      const self = copy.figures.find((x) => x.id === f.id)!;
      intent.plan(c2, self);
      for (const op of copy.queue) {
        if (op.op !== 'eAttack') continue;
        const to = op.spec.targetIds.filter((id) => S.figures.some((h) => h.id === id && h.side === 'H' && h.status === 'active'));
        if (!to.length) continue;
        const dano: Record<string, number> = {};
        for (const id of to) dano[id] = op.spec.dano + (op.spec.perTargetBonus[id] ?? 0);
        out.push({ from: f.id, to, dano, tempo: intent.tempo, name: intent.name });
      }
    } catch {
      /* a plan that needs a decision (tie) is simply not previewed */
    }
  }
  return out;
}
export function incomingDamage(threats: Threat[]): Record<string, number> {
  const sum: Record<string, number> = {};
  for (const t of threats) for (const id of t.to) sum[id] = (sum[id] ?? 0) + (t.dano[id] ?? 0);
  return sum;
}

