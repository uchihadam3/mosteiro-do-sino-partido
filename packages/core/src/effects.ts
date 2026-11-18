/**
 * Shared low-level effects: logging, lookups, once-per limits, damage, healing,
 * conditions (§15), Caído/Trauma/Derrotado/Último Fôlego (§50), Cobertura (§9).
 */
import type { ConditionId, Figure, LogEntry, SectorKey, VfxSchool } from './types';
import type { Ctx, EffectSpec, Op } from './state';
import { reg, type DotCondition, type Hooks } from './registry';
import { adjacent, connections, hasRoom, isActive, parseSector, sk } from './board';

// ----------------------------------------------------------------- lookups
export function fig(c: Ctx, id: string): Figure {
  const f = c.S.figures.find((x) => x.id === id);
  if (!f) throw new Error(`figure ${id} not found`);
  return f;
}
export function tryFig(c: Ctx, id: string | null | undefined): Figure | undefined {
  if (!id) return undefined;
  return c.S.figures.find((x) => x.id === id);
}
export function heroes(c: Ctx, activeOnly = true): Figure[] {
  return c.S.figures.filter((f) => f.side === 'H' && (!activeOnly || f.status === 'active'));
}
export function enemies(c: Ctx, activeOnly = true): Figure[] {
  return c.S.figures.filter((f) => f.side === 'E' && (!activeOnly || f.status === 'active'));
}
export function onBoard(c: Ctx): Figure[] {
  return c.S.figures.filter((f) => f.status !== 'dead' && f.status !== 'reserve');
}

// ----------------------------------------------------------------- log/events
export function log(c: Ctx, kind: LogEntry['kind'], text: string, data?: Record<string, unknown>) {
  c.S.logSeq++;
  c.S.log.push({ seq: c.S.logSeq, cycle: c.S.cycle, kind, text, data });
  if (c.S.log.length > 600) c.S.log.splice(0, c.S.log.length - 600);
}
export function pushOps(c: Ctx, ops: Op[], front = true) {
  if (front) c.S.queue.unshift(...ops);
  else c.S.queue.push(...ops);
}
export function newId(c: Ctx, prefix: string): string {
  c.S.nextId++;
  return `${prefix}${c.S.nextId}`;
}

// ----------------------------------------------------------------- once-per limits (§4)
export type Scope = 'activation' | 'cycle' | 'combat';
export function usedCount(f: Figure, scope: Scope, key: string): number {
  return f.counters[scope][key] ?? 0;
}
export function canUse(f: Figure, scope: Scope, key: string, max = 1): boolean {
  return usedCount(f, scope, key) < max;
}
export function markUse(f: Figure, scope: Scope, key: string) {
  f.counters[scope][key] = (f.counters[scope][key] ?? 0) + 1;
}

// ----------------------------------------------------------------- hooks of a figure
export function hooksOf(f: Figure): { id: string; h: Hooks }[] {
  const out: { id: string; h: Hooks }[] = [];
  const R = reg();
  if (f.side === 'H') {
    const cls = R.classes[f.typeId];
    if (cls) out.push({ id: `class:${cls.id}`, h: cls });
    const eq = f.equipment;
    if (eq) {
      const items = [eq.primary, eq.armor, ...eq.accessories].filter(Boolean);
      for (const it of items) {
        const d = R.items[it!.itemId];
        if (d) out.push({ id: `item:${d.id}`, h: d });
      }
    }
    for (const t of f.talents ?? []) {
      const d = R.talents[t];
      if (d && d.implemented) out.push({ id: `talent:${d.id}`, h: d });
    }
    (R.globalHeroHooks ?? []).forEach((h, i) => out.push({ id: `global:${i}`, h }));
  }
  return out;
}
export function hasTalent(f: Figure, id: string): boolean {
  return (f.talents ?? []).includes(id);
}
export function hasItem(f: Figure, itemId: string): boolean {
  const eq = f.equipment;
  if (!eq) return false;
  return [eq.primary, eq.armor, ...eq.accessories].some((x) => x?.itemId === itemId);
}
export function weaponDef(f: Figure) {
  const id = f.equipment?.primary?.itemId;
  return id ? reg().items[id] : undefined;
}

// ----------------------------------------------------------------- cover (§9)
export function hasCover(c: Ctx, target: Figure): boolean {
  const bf = c.S.battlefield;
  if (bf.cover.includes(target.sector)) return true;
  if (bf.smoke.some((s) => s.sector === target.sector)) return true;
  // item / class sources on the same side (e.g. Espada e Escudo protects ally behind)
  for (const owner of c.S.figures) {
    if (owner.side !== target.side || owner.status !== 'active') continue;
    for (const { h } of hooksOf(owner)) if (h.grantsCover?.(c, owner, target)) return true;
  }
  return false;
}

// ----------------------------------------------------------------- HP helpers
export function heroMaxHp(f: Figure): number {
  return f.maxHp;
}
export function halfOrLess(f: Figure): boolean {
  return f.hp * 2 <= f.maxHp;
}

// ----------------------------------------------------------------- damage
export interface DamageInfo {
  direct: boolean;
  sourceId: string | null;
  school: VfxSchool;
  /** Skip Guardado (already applied in pipeline). */
  skipGuard?: boolean;
  label?: string;
  /** Damage came from a hero attack pipeline (it calls onEnemyDefeated with the attack). */
  fromAttack?: boolean;
  /** Dano Direto caused by this Condition (Faixa do Sobrevivente). */
  condition?: DotCondition;
}

/**
 * Apply damage that has already been reduced by Defesa/Armadura/Cobertura as appropriate.
 * Dano Direto ignores Defesa, Armadura and Cobertura (§13) but Guardado ("próximo Dano sofrido") still applies.
 * Returns damage actually dealt.
 */
export function dealDamage(c: Ctx, target: Figure, amount: number, info: DamageInfo): number {
  if (!isActive(target) || amount <= 0) return 0;
  let dmg = amount;
  // Faixa do Sobrevivente: reduce Dano Direto caused by Veneno/Sangramento/Queimando (the Condition stays).
  if (info.direct && info.condition) {
    for (const { h } of hooksOf(target)) {
      const red = h.reduceConditionDamage?.(c, target, info.condition, dmg) ?? 0;
      if (red > 0) dmg = Math.max(0, dmg - red);
    }
    if (dmg <= 0) return 0;
  }
  if (!info.skipGuard && target.conditions.guardado && dmg > 0) {
    dmg = consumeGuard(c, target, dmg);
  }
  if (info.direct && target.conditions.escamasNegras && dmg > 0) {
    target.conditions.escamasNegras = false;
    dmg -= 1;
    log(c, 'item', `${target.name}: Couro de Escamas Negras reduz o Dano Direto em 1.`);
  }
  if (dmg <= 0) return 0;
  target.hp = Math.max(0, target.hp - dmg);
  c.events.push({ type: 'damage', targetId: target.id, amount: dmg, direct: info.direct, school: info.school });
  log(c, 'damage', `${target.name} sofre ${dmg} Dano${info.direct ? ' Direto' : ''}${info.label ? ` (${info.label})` : ''}. HP ${target.hp}/${target.maxHp}.`);
  // Furtivo ends on taking at least 1 Dano (§51.1)
  if (target.conditions.furtivo) setCond(c, target, 'furtivo', false);
  for (const { h } of hooksOf(target)) h.onDamaged?.(c, target, dmg, { direct: info.direct, sourceId: info.sourceId });
  if (target.side === 'E') reg().enemies[target.typeId]?.onDamaged?.(c, target, dmg);
  if (target.hp <= 0) onZeroHp(c, target, info.sourceId, !!info.fromAttack);
  return dmg;
}

/** Guardado: reduce next damage by 1 then remove (§15). Returns remaining damage. */
export function consumeGuard(c: Ctx, target: Figure, dmg: number): number {
  if (!target.conditions.guardado || dmg <= 0) return dmg;
  let reduction = 1;
  for (const { h } of hooksOf(target)) reduction += h.onGuardConsumed?.(c, target, reduction) ?? 0;
  target.conditions.guardado = false;
  c.events.push({ type: 'guardUsed', targetId: target.id });
  c.events.push({ type: 'condition', targetId: target.id, condition: 'guardado', added: false });
  log(c, 'condition', `${target.name}: Guardado reduz ${Math.min(reduction, dmg)} Dano.`);
  return Math.max(0, dmg - reduction);
}

function onZeroHp(c: Ctx, f: Figure, sourceId: string | null, fromAttack: boolean) {
  if (f.side === 'E') {
    f.status = 'dead';
    c.events.push({ type: 'death', figureId: f.id });
    log(c, 'death', `${f.name} é derrotado.`);
    // Paladino: Julgado died
    // remove brechas etc. (figure gone)
    const killer = tryFig(c, sourceId);
    if (killer && !fromAttack) for (const { h } of hooksOf(killer)) h.onEnemyDefeated?.(c, killer, f, { byAttack: null });
    pushOps(c, [{ op: 'checkEnd' }], true);
    return;
  }
  heroFalls(c, f);
}

/** §50 — hero reaches 0 HP. */
export function heroFalls(c: Ctx, f: Figure) {
  const trauma = f.trauma ?? 0;
  // §50.6 Último Fôlego — true solo
  if (c.S.partySize === 1 && (f.ultimoFolego ?? 0) > 0 && trauma < 2) {
    f.ultimoFolego = (f.ultimoFolego ?? 0) - 1;
    f.trauma = trauma + 1;
    f.maxHp = Math.max(1, f.maxHp - 2);
    f.hp = Math.ceil(f.maxHp * 0.25);
    c.events.push({ type: 'fall', figureId: f.id });
    c.events.push({ type: 'rise', figureId: f.id });
    log(c, 'resource', `Último Fôlego: ${f.name} recebe 1 Trauma e retorna com ${f.hp} HP (${f.ultimoFolego} ficha(s) restante(s)).`);
    if (c.S.activeId === f.id) {
      f.ap = 0;
      c.S.flags['__forceEndActivation'] = f.id;
    }
    return;
  }
  if (trauma >= 2) {
    f.status = 'derrotado';
    log(c, 'death', `${f.name} cai com 2 Traumas e fica Derrotado.`);
  } else {
    f.status = 'caido';
    log(c, 'death', `${f.name} fica Caído.`);
  }
  f.conditions.furtivo = false;
  c.events.push({ type: 'fall', figureId: f.id });
  if (c.S.activeId === f.id) {
    f.ap = 0;
    c.S.flags['__forceEndActivation'] = f.id;
  }
  pushOps(c, [{ op: 'checkEnd' }], true);
}

/** §50.2 Levantar: return with 25% of current max HP (rounded up) and 1 Trauma. */
export function raiseHero(c: Ctx, f: Figure, pct = 0.25) {
  if (f.status !== 'caido') return;
  f.trauma = (f.trauma ?? 0) + 1;
  f.maxHp = Math.max(1, f.maxHp - 2);
  f.hp = Math.max(1, Math.ceil(f.maxHp * pct));
  f.status = 'active';
  c.events.push({ type: 'rise', figureId: f.id });
  log(c, 'heal', `${f.name} é Levantado com ${f.hp} HP e recebe 1 Trauma (total ${f.trauma}).`);
}

export function heal(c: Ctx, target: Figure, amount: number, sourceId: string | null, opts: { technique?: boolean } = {}): number {
  if (!isActive(target) || amount <= 0) return 0;
  let amt = amount;
  const src = tryFig(c, sourceId);
  if (opts.technique && src && src.id !== target.id) for (const { h } of hooksOf(src)) amt += h.onHealOther?.(c, src, target, amt) ?? 0;
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amt);
  const healed = target.hp - before;
  if (healed > 0) {
    c.events.push({ type: 'heal', targetId: target.id, amount: healed });
    log(c, 'heal', `${target.name} recupera ${healed} HP. HP ${target.hp}/${target.maxHp}.`);
    if (opts.technique && src) for (const { h } of hooksOf(src)) h.onTechniqueHeal?.(c, src, target, healed);
  }
  return healed;
}

/**
 * Guardado granted by a hero Técnica (class/talent technique). Applies it and, only if it was actually granted
 * (target active and not already Guardado), fires the source's `onTechniqueGuard` hooks (Cetro/Malha do Peregrino).
 */
export function techniqueGuard(c: Ctx, src: Figure, target: Figure): boolean {
  if (!isActive(target) || target.conditions.guardado) return false;
  applyCondition(c, target, 'guardado', 1, src.id);
  if (!target.conditions.guardado) return false;
  for (const { h } of hooksOf(src)) h.onTechniqueGuard?.(c, src, target);
  return true;
}

// ----------------------------------------------------------------- conditions
const COND_LABEL: Record<string, string> = {
  veneno: 'Veneno',
  sangramento: 'Sangramento',
  queimando: 'Queimando',
  quebrado: 'Quebrado',
  exposto: 'Exposto',
  imobilizado: 'Imobilizado',
  atordoado: 'Atordoado',
  guardado: 'Guardado',
  furtivo: 'Furtivo',
  semReacoes: 'Sem Reações',
  bencao: 'Bênção da Vigília',
};
export function condLabel(id: string) {
  return COND_LABEL[id] ?? id;
}

export function setCond(c: Ctx, f: Figure, cond: 'quebrado' | 'exposto' | 'imobilizado' | 'atordoado' | 'guardado' | 'furtivo' | 'semReacoes' | 'bencao' | 'queimando', on: boolean) {
  const before = f.conditions[cond];
  f.conditions[cond] = on;
  if (before !== on) {
    c.events.push({ type: 'condition', targetId: f.id, condition: cond, added: on });
    log(c, 'condition', `${f.name} ${on ? 'fica' : 'deixa de estar'} ${condLabel(cond)}.`);
  }
}

/**
 * Apply a condition with all canonical rules. `viaResponse` = already passed the Intercessão window.
 * Boss/miniboss that would receive Atordoado receives Exposto instead (§15).
 */
export function applyCondition(c: Ctx, target: Figure, cond: ConditionId, n = 1, sourceId: string | null = null): void {
  if (!isActive(target)) return;
  const C = target.conditions;
  switch (cond) {
    case 'veneno': {
      const v = Math.min(3, C.veneno + n);
      if (v !== C.veneno) {
        C.veneno = v;
        c.events.push({ type: 'condition', targetId: target.id, condition: 'veneno', added: true });
        log(c, 'condition', `${target.name} recebe Veneno (${v}).`);
      }
      return;
    }
    case 'sangramento': {
      const v = Math.min(2, C.sangramento + n);
      if (v !== C.sangramento) {
        C.sangramento = v;
        c.events.push({ type: 'condition', targetId: target.id, condition: 'sangramento', added: true });
        log(c, 'condition', `${target.name} recebe Sangramento (${v}).`);
      }
      return;
    }
    case 'queimando': {
      if (C.imuneQueimando) {
        log(c, 'condition', `${target.name} está protegido de Queimando até o fim do Ciclo.`);
        return;
      }
      if (C.queimando) {
        // §15 Queimando: reapplying deals 1 Dano Direto immediately; no extra marker.
        log(c, 'condition', `${target.name} já está Queimando: sofre 1 Dano Direto imediato.`);
        dealDamage(c, target, 1, { direct: true, sourceId, school: 'fire', label: 'Queimando reaplicado', condition: 'queimando' });
        return;
      }
      setCond(c, target, 'queimando', true);
      return;
    }
    case 'atordoado':
      if (target.isBoss || target.isMiniboss) {
        log(c, 'condition', `${target.name} é Boss/Miniboss: Atordoado converte em Exposto.`);
        setCond(c, target, 'exposto', true);
        return;
      }
      setCond(c, target, 'atordoado', true);
      return;
    case 'imobilizado':
      // Q-IMOB: applied during the figure's own Activation, it must survive that Activation's end (lasts through the next one)
      if (c.S.activeId === target.id) target.counters.activation['imobAppliedNow'] = 1;
      setCond(c, target, cond, true);
      return;
    case 'quebrado':
    case 'exposto':
    case 'guardado':
    case 'furtivo':
    case 'semReacoes':
    case 'bencao':
      setCond(c, target, cond, true);
      return;
    default:
      return;
  }
}

/** Effect from an enemy on a hero passes through the Intercessão/Selo window (handled by engine op 'effect'). */
export function effectOp(targetId: string, effect: EffectSpec, sourceId: string): Op {
  return { op: 'effect', targetId, effect, sourceId };
}

// ----------------------------------------------------------------- forced movement (§10)
/** Empurrar: Frente → Retaguarda of the same column if there is capacity. No lateral fallback, no chain. */
export function push(c: Ctx, target: Figure, sourceId: string | null): boolean {
  if (!isActive(target)) return false;
  const p = parseSector(target.sector);
  if (p.row !== 'F') return false;
  if (target.conditions.ignoraEmpurrao) {
    target.conditions.ignoraEmpurrao = false;
    log(c, 'move', `${target.name} ignora o Empurrar (Fincar Posição).`);
    return false;
  }
  const dest = sk(p.side, 'R', p.col);
  if (!hasRoom(c.S.figures, dest, target.id)) {
    log(c, 'move', `Empurrar falha: ${dest} está cheio.`);
    forcedMoveBlocked(c, target, sourceId, 'push');
    return false;
  }
  forcedMove(c, target, dest, sourceId);
  return true;
}
/** Puxar: Retaguarda → Frente of the same column if there is capacity. */
export function pull(c: Ctx, target: Figure, sourceId: string | null): boolean {
  if (!isActive(target)) return false;
  const p = parseSector(target.sector);
  if (p.row !== 'R') return false;
  if (target.conditions.ignoraEmpurrao) {
    target.conditions.ignoraEmpurrao = false;
    log(c, 'move', `${target.name} ignora o Puxar (Fincar Posição).`);
    return false;
  }
  const dest = sk(p.side, 'F', p.col);
  if (!hasRoom(c.S.figures, dest, target.id)) {
    log(c, 'move', `Puxar falha: ${dest} está cheio.`);
    forcedMoveBlocked(c, target, sourceId, 'pull');
    return false;
  }
  forcedMove(c, target, dest, sourceId);
  return true;
}

/** A valid Empurrar/Puxar failed only because the destination is full: notify the (hero) source's hooks. */
function forcedMoveBlocked(c: Ctx, target: Figure, sourceId: string | null, kind: 'push' | 'pull') {
  const src = tryFig(c, sourceId);
  if (src && src.side !== target.side) for (const { h } of hooksOf(src)) h.onForcedMoveBlocked?.(c, src, target, kind);
}

export function forcedMove(c: Ctx, target: Figure, dest: SectorKey, _sourceId: string | null) {
  const from = target.sector;
  target.sector = dest;
  if (target.conditions.ancorado) {
    target.conditions.ancorado = false;
    log(c, 'item', `${target.name}: movimento forçado encerra a Âncora.`);
  }
  c.events.push({ type: 'move', figureId: target.id, from, to: dest, forced: true });
  log(c, 'move', `${target.name} é movido para ${dest}.`);
  for (const { h } of hooksOf(target)) h.onMoved?.(c, target, { from, to: dest, voluntary: false, kind: 'forced', connections: 1 });
  afterEnterSector(c, target, from);
}

/** Effects of entering a sector: Furtivo ends if an enemy becomes Adjacent, traps/sigils trigger. */
export function afterEnterSector(c: Ctx, f: Figure, _from: SectorKey) {
  // Furtivo ends when an enemy becomes Adjacent (§51.1)
  for (const h of heroes(c)) {
    if (h.conditions.furtivo && enemies(c).some((e) => adjacent(e, h))) setCond(c, h, 'furtivo', false);
  }
  if (f.side === 'E') {
    const trap = c.S.battlefield.traps.find((t) => t.sector === f.sector);
    if (trap) pushOps(c, [{ op: 'call', fn: `trap:${trap.kind}`, args: { enemyId: f.id, ownerId: trap.ownerId, sector: trap.sector } }]);
    const sig = c.S.battlefield.sigils.find((s) => s.sector === f.sector && (s.kind === 'detonacao' || s.kind === 'estase'));
    if (sig) pushOps(c, [{ op: 'call', fn: 'sigil:trigger', args: { sigilId: sig.id, enemyId: f.id } }]);
  }
}

/** Sangramento (§15 / R07): on Movement or Attack, remove 1 and suffer 1 Dano Direto. */
export function bleedTick(c: Ctx, f: Figure) {
  if (f.conditions.sangramento > 0 && isActive(f)) {
    f.conditions.sangramento--;
    c.events.push({ type: 'condition', targetId: f.id, condition: 'sangramento', added: false });
    log(c, 'condition', `Sangramento: ${f.name} sofre 1 Dano Direto (restam ${f.conditions.sangramento}).`);
    dealDamage(c, f, 1, { direct: true, sourceId: null, school: 'blood', label: 'Sangramento', skipGuard: false, condition: 'sangramento' });
  }
}

/** Support zone (§18.4): own column + adjacent columns, any row (hero side). */
export function inSupportZone(owner: Figure, target: Figure): boolean {
  if (owner.side !== target.side) return false;
  const a = parseSector(owner.sector).col;
  const b = parseSector(target.sector).col;
  return Math.abs(a - b) <= 1;
}

export function alliesAdjacent(c: Ctx, f: Figure): Figure[] {
  return c.S.figures.filter((o) => o.side === f.side && o.id !== f.id && o.status === 'active' && adjacent(o, f));
}

export function sectorNeighbors(k: SectorKey) {
  return connections(k);
}
