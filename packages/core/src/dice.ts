import type { DieRoll, Grade, RollResult } from './types';
import { GRADES } from './types';
import { rollInt, type RngState } from './rng';

/** Universal result table (§11). */
export function readDie(value: number): { successes: number; impulso: number; critico: boolean } {
  if (value <= 2) return { successes: 0, impulso: 0, critico: false };
  if (value <= 5) return { successes: 1, impulso: 0, critico: false };
  if (value <= 8) return { successes: 1, impulso: 1, critico: false };
  if (value <= 11) return { successes: 2, impulso: 1, critico: false };
  return { successes: 3, impulso: 0, critico: true };
}

export function raiseGrade(g: Grade, steps = 1): Grade {
  const i = Math.min(GRADES.length - 1, GRADES.indexOf(g) + steps);
  return GRADES[Math.max(0, i)];
}
export function lowerGrade(g: Grade, steps = 1): Grade {
  const i = Math.max(0, GRADES.indexOf(g) - steps);
  return GRADES[i];
}

/** Maximum recommended dice per roll (§11) — enforced as a hard cap for added dice. */
export const MAX_DICE = 3;

export interface DieSpec {
  grade: Grade;
  source: string;
}

export function rollDice(rng: RngState, specs: DieSpec[]): RollResult {
  const dice: DieRoll[] = specs.slice(0, MAX_DICE).map((s) => ({
    grade: s.grade,
    baseGrade: s.grade,
    source: s.source,
    value: rollInt(rng, s.grade),
  }));
  return summarize(dice);
}

export function summarize(dice: DieRoll[], extraSuccesses = 0): RollResult {
  let successes = extraSuccesses;
  let impulsos = 0;
  let critico = false;
  for (const d of dice) {
    const r = readDie(d.value);
    successes += r.successes;
    impulsos += r.impulso;
    if (r.critico) critico = true;
  }
  return { dice, successes, impulsos, critico };
}

/** Raise the lowest die among specs by n grades (used when the rule lets the player choose; we pick the most useful). */
export function raiseLowest(specs: DieSpec[], steps = 1, source?: string): DieSpec[] {
  if (!specs.length) return specs;
  let idx = 0;
  for (let i = 1; i < specs.length; i++) if (specs[i].grade < specs[idx].grade) idx = i;
  const out = specs.slice();
  out[idx] = { grade: raiseGrade(out[idx].grade, steps), source: source ? `${out[idx].source}+${source}` : out[idx].source };
  return out;
}

/** Exact probability helpers for previews (deducible without rolling). */
export function successDistribution(grade: Grade): number[] {
  const dist = [0, 0, 0, 0];
  for (let v = 1; v <= grade; v++) dist[readDie(v).successes] += 1 / grade;
  return dist;
}

export function probAtLeastOneSuccess(grades: Grade[], extraSuccesses = 0): number {
  if (extraSuccesses > 0) return 1;
  let pNone = 1;
  for (const g of grades) pNone *= 2 / g;
  return 1 - pNone;
}

/** Expected successes for a set of dice. */
export function expectedSuccesses(grades: Grade[]): number {
  let e = 0;
  for (const g of grades) {
    const d = successDistribution(g);
    e += d[1] + 2 * d[2] + 3 * d[3];
  }
  return e;
}
