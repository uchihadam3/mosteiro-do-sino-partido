/**
 * IA inimiga (§33, R08). Enemies do not use AP; the revealed Intenção tells Movement, Dano, Defesa and effects.
 * Alvo padrão: hero requiring the fewest connections for this enemy to execute the attack; already attackable = 0;
 * tie → lowest current HP; absolute tie → the party decides (pending tieBreak). Furtivo counts as +2 connections.
 * Movement: only what is needed to attack; otherwise all movement along the route that most reduces the remaining need.
 * Generic movement never leaves Engajamento unless the Intenção allows it.
 * Entering a Frente that causes Engajamento normally ends the displacement (§7).
 */
import type { AttackCat, Figure, SectorKey } from './types';
import type { Ctx } from './state';
import { adjacent, canTarget, connections, hasRoom, isEngaged, parseSector, sectorEngaged, sk } from './board';
import { enemies, heroes } from './effects';

export class NeedTieBreak extends Error {
  constructor(
    public enemyId: string,
    public candidates: string[],
    public reason: string,
  ) {
    super('tie');
  }
}

export interface MoveOpts {
  maxMove: number;
  canLeaveEngagement?: boolean;
}

/** BFS for an enemy over its own side; stops expansion at sectors that would engage (entering ends movement). */
export function enemyPaths(c: Ctx, self: Figure, opts: MoveOpts): Map<SectorKey, SectorKey[]> {
  const figs = c.S.figures;
  const res = new Map<SectorKey, SectorKey[]>();
  res.set(self.sector, [self.sector]);
  if (self.conditions.imobilizado) return res;
  const engagedNow = isEngaged(self, figs);
  if (engagedNow && !opts.canLeaveEngagement) return res;
  const q: SectorKey[] = [self.sector];
  while (q.length) {
    const cur = q.shift()!;
    const path = res.get(cur)!;
    if (path.length - 1 >= opts.maxMove) continue;
    if (cur !== self.sector && sectorEngaged(cur, self.side, figs, self.id)) continue; // entering engagement ends movement
    for (const n of connections(cur)) {
      if (res.has(n)) continue;
      res.set(n, [...path, n]);
      q.push(n);
    }
  }
  for (const [k] of res) if (k !== self.sector && !hasRoom(figs, k, self.id)) res.delete(k);
  return res;
}

/** Number of connections the enemy needs to be able to execute an attack of category `cat` on hero `h` (Infinity if impossible). */
export function attackCost(c: Ctx, self: Figure, h: Figure, cat: AttackCat, canLeaveEngagement = false): number {
  const figs = c.S.figures;
  if (canTarget(self.sector, h, cat, figs, self.side)) return 0;
  const paths = enemyPaths(c, self, { maxMove: 99, canLeaveEngagement });
  let best = Infinity;
  for (const [k, p] of paths) {
    if (canTargetFrom(c, self, k, h, cat)) best = Math.min(best, p.length - 1);
  }
  return best;
}

function canTargetFrom(c: Ctx, self: Figure, from: SectorKey, h: Figure, cat: AttackCat): boolean {
  // evaluate with self hypothetically at `from`
  const figs = c.S.figures.map((f) => (f.id === self.id ? { ...f, sector: from } : f));
  return canTarget(from, h, cat, figs, self.side);
}

export interface TargetQuery {
  cat: AttackCat;
  /** Priority filter written on the Intenção ("priorize ..."). Falls back to all if empty. */
  prefer?: (h: Figure) => boolean;
  /** Custom score (lower = better) applied before HP tie-break. */
  score?: (h: Figure) => number;
  canLeaveEngagement?: boolean;
  /** Only heroes that can be reached with maxMove (for intents that only attack if possible). */
  maxMove?: number;
  /** Use lowest HP as the primary criterion (e.g. "menor HP alcançável"). */
  lowestHpFirst?: boolean;
  reason?: string;
}

/** Alvo padrão — throws NeedTieBreak on absolute tie unless a choice is stored or auto tie-break is on. */
export function defaultTarget(c: Ctx, self: Figure, q: TargetQuery): Figure | null {
  let pool = heroes(c);
  if (!pool.length) return null;
  if (q.prefer) {
    const pref = pool.filter(q.prefer);
    if (pref.length) pool = pref;
  }
  const scored = pool.map((h) => {
    let cost = attackCost(c, self, h, q.cat, q.canLeaveEngagement);
    // Furtivo: +2 connections for Alvo Padrão (§51.1); if only legal target it remains attackable.
    if (h.conditions.furtivo && cost !== Infinity) cost += 2;
    return { h, cost, score: q.score ? q.score(h) : 0 };
  });
  const reachable = scored.filter((s) => s.cost !== Infinity);
  const list = reachable.length ? reachable : scored;
  list.sort((a, b) => {
    if (q.lowestHpFirst && a.h.hp !== b.h.hp) return a.h.hp - b.h.hp;
    if (a.score !== b.score) return a.score - b.score;
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.h.hp - b.h.hp;
  });
  const best = list[0];
  const tied = list.filter((s) => s.cost === best.cost && s.h.hp === best.h.hp && s.score === best.score && (!q.lowestHpFirst || s.h.hp === best.h.hp));
  if (tied.length > 1) {
    const stored = c.S.tieChoices[self.id];
    if (stored && tied.some((t) => t.h.id === stored)) return tied.find((t) => t.h.id === stored)!.h;
    if (c.S.settings.autoTieBreak) return tied.sort((a, b) => a.h.order - b.h.order)[0].h;
    throw new NeedTieBreak(
      self.id,
      tied.map((t) => t.h.id),
      q.reason ?? 'Empate absoluto no Alvo Padrão: a party decide.',
    );
  }
  return best.h;
}

/**
 * Path the enemy uses to attack `target`: minimal connections to a legal attack position (prefers
 * the position in the target's column, then lowest column index for determinism).
 * If impossible within maxMove, uses all movement toward the best route.
 */
export function pathToAttack(c: Ctx, self: Figure, target: Figure, cat: AttackCat, opts: MoveOpts): SectorKey[] {
  if (canTarget(self.sector, target, cat, c.S.figures, self.side)) return [self.sector];
  const paths = enemyPaths(c, self, { maxMove: 99, canLeaveEngagement: opts.canLeaveEngagement });
  const tcol = parseSector(target.sector).col;
  let goal: SectorKey[] | null = null;
  for (const [k, p] of paths) {
    if (!canTargetFrom(c, self, k, target, cat)) continue;
    if (
      !goal ||
      p.length < goal.length ||
      (p.length === goal.length && Math.abs(parseSector(k).col - tcol) < Math.abs(parseSector(goal[goal.length - 1]).col - tcol))
    )
      goal = p;
  }
  if (!goal) {
    // cannot attack at all: approach the target column front
    return approach(c, self, sk('E', 'F', tcol), opts);
  }
  if (goal.length - 1 <= opts.maxMove) return goal;
  // truncate to maxMove, then ensure the stop sector has room
  for (let n = opts.maxMove; n >= 1; n--) {
    const k = goal[n];
    if (hasRoom(c.S.figures, k, self.id)) return goal.slice(0, n + 1);
  }
  return [self.sector];
}

/** Move toward a sector using up to maxMove connections. */
export function approach(c: Ctx, self: Figure, dest: SectorKey, opts: MoveOpts): SectorKey[] {
  const paths = enemyPaths(c, self, opts);
  const d = parseSector(dest);
  let best: SectorKey[] = [self.sector];
  let bestScore = score(self.sector);
  function score(k: SectorKey) {
    const p = parseSector(k);
    return Math.abs(p.col - d.col) + (p.row === d.row ? 0 : 1);
  }
  for (const [k, p] of paths) {
    const s = score(k);
    if (s < bestScore || (s === bestScore && p.length < best.length)) {
      best = p;
      bestScore = s;
    }
  }
  return best;
}

/** Move away from heroes ("para longe"): toward Retaguarda; may leave Engajamento if allowed. */
export function retreatPath(c: Ctx, self: Figure, maxMove: number, canLeaveEngagement: boolean): SectorKey[] {
  const paths = enemyPaths(c, self, { maxMove, canLeaveEngagement });
  let best: SectorKey[] = [self.sector];
  let bestScore = threat(c, self, self.sector);
  for (const [k, p] of paths) {
    const s = threat(c, self, k);
    if (s < bestScore || (s === bestScore && p.length < best.length && k !== self.sector)) {
      best = p;
      bestScore = s;
    }
  }
  return best;
}
function threat(c: Ctx, self: Figure, k: SectorKey): number {
  const p = parseSector(k);
  let t = p.row === 'F' ? 10 : 0;
  if (sectorEngaged(k, self.side, c.S.figures, self.id)) t += 20;
  t += heroes(c).filter((h) => parseSector(h.sector).col === p.col).length;
  return t;
}

export function heroesInSector(c: Ctx, k: SectorKey): Figure[] {
  return heroes(c).filter((h) => h.sector === k);
}
export function enemiesAdjacentTo(c: Ctx, h: Figure, typeId?: string): Figure[] {
  return enemies(c).filter((e) => adjacent(e, h) && (!typeId || e.typeId === typeId));
}
export function heroAlliesAdjacent(c: Ctx, h: Figure): number {
  return heroes(c).filter((o) => o.id !== h.id && adjacent(o, h)).length;
}
export function enemyAlliesNear(c: Ctx, self: Figure): Figure[] {
  return enemies(c).filter((e) => e.id !== self.id && adjacent(e, self));
}
