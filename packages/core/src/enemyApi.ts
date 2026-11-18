/**
 * Helpers to author Intenções as small deterministic plans.
 * Each helper enqueues serializable ops (move → attack → effects) on the engine queue.
 */
import type { AttackCat, Attr, Figure, SectorKey, VfxSchool } from './types';
import type { Ctx, EffectSpec, EnemyAttackSpec } from './state';
import { defaultTarget, pathToAttack, approach, retreatPath, type TargetQuery } from './ai';
import { enemies, heroes, newId, pushOps } from './effects';
import { adjacent, canTarget, isEngaged, parseSector, sk } from './board';

export interface AttackIntentOpts {
  cat: AttackCat;
  dano: number;
  def: Attr;
  move: number;
  name: string;
  intentId: string;
  school?: VfxSchool;
  prefer?: (h: Figure) => boolean;
  score?: (h: Figure) => number;
  lowestHpFirst?: boolean;
  onDamage?: EffectSpec[];
  onZero?: EffectSpec[];
  after?: EffectSpec[];
  ignoreCover?: boolean;
  ignoreArmor?: number;
  canLeaveEngagement?: boolean;
  /** Only attack if the enemy is engaged at the start (e.g. "Fome"). */
  requireEngagedAtStart?: boolean;
  bonusFor?: (h: Figure) => number;
  data?: Record<string, number | boolean | string>;
  /** Do not move even if needed (e.g. "sem movimento"). */
  noMove?: boolean;
}

export function makeSpec(c: Ctx, self: Figure, o: AttackIntentOpts, targets: Figure[]): EnemyAttackSpec {
  const per: Record<string, number> = {};
  if (o.bonusFor) for (const t of targets) per[t.id] = o.bonusFor(t);
  return {
    key: newId(c, 'ea'),
    sourceId: self.id,
    targetIds: targets.map((t) => t.id),
    name: o.name,
    intentId: o.intentId,
    dano: o.dano,
    def: o.def,
    cat: o.cat,
    ignoreCover: !!o.ignoreCover,
    ignoreArmor: o.ignoreArmor ?? 0,
    school: o.school ?? (o.cat === 'distancia' ? 'bolt' : 'metal'),
    onDamage: o.onDamage ?? [],
    onZero: o.onZero ?? [],
    after: o.after ?? [],
    perTargetBonus: per,
    direct: false,
    data: o.data ?? {},
  };
}

/** Standard "mova X; Dano Y, Defesa Z" intent. Returns the chosen target (or null). */
export function attackIntent(c: Ctx, self: Figure, o: AttackIntentOpts): Figure | null {
  const q: TargetQuery = { cat: o.cat, prefer: o.prefer, score: o.score, lowestHpFirst: o.lowestHpFirst, canLeaveEngagement: o.canLeaveEngagement, reason: `${self.name} — ${o.name}: empate absoluto no Alvo Padrão.` };
  const target = defaultTarget(c, self, q);
  if (!target) return null;
  if (!o.noMove) {
    const path = pathToAttack(c, self, target, o.cat, { maxMove: o.move, canLeaveEngagement: o.canLeaveEngagement });
    if (path.length > 1) pushOps(c, [{ op: 'move', id: self.id, path, forced: false, voluntary: true, canLeaveEngagement: !!o.canLeaveEngagement, stopOnEngage: true }], false);
  }
  pushOps(c, [{ op: 'eAttack', spec: makeSpec(c, self, o, [target]) }], false);
  return target;
}

/** Move toward the default target without attacking ("mova até 2"). */
export function moveTowardTarget(c: Ctx, self: Figure, move: number, cat: AttackCat = 'cac', prefer?: (h: Figure) => boolean, canLeave = false) {
  if (move <= 0) return null;
  const target = defaultTarget(c, self, { cat, prefer, canLeaveEngagement: canLeave, reason: `${self.name}: empate absoluto ao escolher para onde se mover.` });
  if (!target) return null;
  const path = pathToAttack(c, self, target, cat, { maxMove: move, canLeaveEngagement: canLeave });
  if (path.length > 1) pushOps(c, [{ op: 'move', id: self.id, path, forced: false, voluntary: true, canLeaveEngagement: canLeave, stopOnEngage: true }], false);
  return target;
}

export function moveTo(c: Ctx, self: Figure, dest: SectorKey, move: number, canLeave = false) {
  const path = approach(c, self, dest, { maxMove: move, canLeaveEngagement: canLeave });
  if (path.length > 1) pushOps(c, [{ op: 'move', id: self.id, path, forced: false, voluntary: true, canLeaveEngagement: canLeave, stopOnEngage: true }], false);
}

export function retreat(c: Ctx, self: Figure, move: number, canLeave: boolean) {
  const path = retreatPath(c, self, move, canLeave);
  if (path.length > 1) pushOps(c, [{ op: 'move', id: self.id, path, forced: false, voluntary: true, canLeaveEngagement: canLeave, stopOnEngage: false }], false);
}

export function guardOps(c: Ctx, self: Figure, ids: string[]) {
  if (ids.length) pushOps(c, [{ op: 'guard', targetIds: ids, sourceId: self.id }], false);
}

export function engagedNow(c: Ctx, self: Figure) {
  return isEngaged(self, c.S.figures);
}

/** Adjacent active allies (same side), sorted: engaged first, then lowest HP, then order. */
export function nearAllies(c: Ctx, self: Figure, includeSelf = false): Figure[] {
  return enemies(c)
    .filter((e) => (includeSelf || e.id !== self.id) && (e.id === self.id || adjacent(e, self)))
    .sort((a, b) => Number(isEngaged(b, c.S.figures)) - Number(isEngaged(a, c.S.figures)) || a.hp / a.maxHp - b.hp / b.maxHp || a.order - b.order);
}

/** The hero Sector containing the most heroes (tie → sector of default target). */
export function bestHeroSector(c: Ctx, self: Figure): SectorKey | null {
  const hs = heroes(c);
  if (!hs.length) return null;
  const count = new Map<SectorKey, number>();
  for (const h of hs) count.set(h.sector, (count.get(h.sector) ?? 0) + 1);
  const max = Math.max(...count.values());
  const best = [...count.entries()].filter(([, n]) => n === max).map(([k]) => k);
  if (best.length === 1) return best[0];
  const t = defaultTarget(c, self, { cat: 'distancia', prefer: (h) => best.includes(h.sector), reason: `${self.name}: empate ao escolher o Setor de heróis.` });
  return t ? t.sector : best[0];
}

/** The hero column with most heroes (tie → column of default target). */
export function bestHeroColumn(c: Ctx, self: Figure): number | null {
  const hs = heroes(c);
  if (!hs.length) return null;
  const count = new Map<number, number>();
  for (const h of hs) {
    const col = parseSector(h.sector).col;
    count.set(col, (count.get(col) ?? 0) + 1);
  }
  const max = Math.max(...count.values());
  const best = [...count.entries()].filter(([, n]) => n === max).map(([k]) => k);
  if (best.length === 1) return best[0];
  const t = defaultTarget(c, self, { cat: 'distancia', prefer: (h) => best.includes(parseSector(h.sector).col), reason: `${self.name}: empate ao escolher a coluna de heróis.` });
  return t ? parseSector(t.sector).col : best[0];
}

export function heroesInColumn(c: Ctx, col: number): Figure[] {
  return heroes(c).filter((h) => parseSector(h.sector).col === col);
}

/** Up to n heroes Adjacent to self (engaged), lowest HP first. */
export function adjacentHeroes(c: Ctx, self: Figure, n: number): Figure[] {
  return heroes(c)
    .filter((h) => adjacent(h, self))
    .sort((a, b) => a.hp - b.hp || a.order - b.order)
    .slice(0, n);
}

export function canAttackNow(c: Ctx, self: Figure, h: Figure, cat: AttackCat) {
  return canTarget(self.sector, h, cat, c.S.figures, self.side);
}

export function rearOf(self: Figure): SectorKey {
  return sk('E', 'R', parseSector(self.sector).col);
}

export function heroHasCondition(h: Figure): boolean {
  const C = h.conditions;
  return C.veneno > 0 || C.sangramento > 0 || C.queimando || C.quebrado || C.exposto || C.imobilizado || C.atordoado;
}
