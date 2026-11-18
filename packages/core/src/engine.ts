/**
 * Combat engine — a deterministic command interpreter.
 *   dispatch(state, command) → { state, events, error }
 * The input state is never mutated (structuredClone draft). All randomness comes from state.rng.
 * Renderers observe `events` and the new state; they never decide tactical math.
 *
 * Ciclo (§6, R04): restore Reações → reveal 1 Intenção per enemy type → heroes choose Tempo →
 * Heróis Rápidos → Inimigos Rápidos → Heróis Táticos → Inimigos Táticos → Heróis Pesados → Inimigos Pesados → fim de Ciclo.
 */
import type { Band, DomainEvent, Figure, SectorKey, Tempo } from './types';
import { BANDS, bandSide, bandTempo } from './types';
import type { CombatState, Ctx, EnemyTypeState, Op, Pending, ReinforcementWave, SigilEntry } from './state';
import { emptyConditions, emptyCounters, tempoAp } from './state';
import { createRng, shuffle, type RngState } from './rng';
import { reg, type ActionCmd, type ActionDef, type EnemyDef } from './registry';
import {
  applyCondition,
  bleedTick,
  dealDamage,
  enemies,
  fig,
  forcedMove,
  heroes,
  hooksOf,
  log,
  newId,
  pushOps,
  setCond,
  tryFig,
  afterEnterSector,
  canUse,
  markUse,
  heal,
} from './effects';
import { NeedTieBreak } from './ai';
import { finishHeroAttack, findAction, rerollDie, validateChoices } from './attack';
import { beginDefense, commitDefense, resolveConditionResponse, resolveDefense, resolveEgide, runEffect, runEnemyAttack } from './defense';
import { adjacent, connections, hasRoom, isActive, isEngaged, parseSector, sectorEngaged, sk, isValidArea2, allSectors, canTarget } from './board';

// ============================================================================ init
export interface EnemyPlacement {
  typeId: string;
  sector: SectorKey;
}
export interface CombatInit {
  encounterId: string;
  seed: string | RngState;
  partySize: number;
  heroes: Figure[];
  enemies: EnemyPlacement[];
  cover: SectorKey[];
  reinforcementEntries: SectorKey[];
  reinforcements: { atEndOfCycle: number; enemies: { typeId: string; sector?: SectorKey }[] }[];
  objectives: string[];
  enemyCap?: number;
  ctx?: Partial<CombatState['ctx']>;
  settings?: Partial<CombatState['settings']>;
  /** Skip deployment phase (heroes already placed). */
  skipDeploy?: boolean;
}

export function makeEnemyFigure(def: EnemyDef, id: string, sector: SectorKey, partySize: number, order: number): Figure {
  const hp = Array.isArray(def.hp) ? def.hp[Math.max(1, Math.min(5, partySize)) - 1] : def.hp;
  return {
    id,
    side: 'E',
    typeId: def.id,
    name: def.name,
    sector,
    status: 'active',
    hp,
    maxHp: hp,
    armor: def.armor,
    conditions: emptyConditions(),
    counters: emptyCounters(),
    order,
    isBoss: !!def.boss,
    isMiniboss: !!def.miniboss,
    profano: def.profano,
  };
}

export function createCombat(init: CombatInit): CombatState {
  const R = reg();
  const S: CombatState = {
    v: 1,
    encounterId: init.encounterId,
    partySize: init.partySize,
    cycle: 0,
    band: 'HR',
    phase: init.skipDeploy ? 'tempo' : 'deploy',
    result: null,
    figures: [],
    activeId: null,
    enemyTypes: {},
    typeOrder: [],
    battlefield: { cover: init.cover.slice(), smoke: [], sigils: [], consecrated: [], traps: [], reinforcementEntries: init.reinforcementEntries.slice() },
    objectives: {},
    reinforcements: init.reinforcements.map((w) => ({ ...w, done: false })),
    enemyCap: init.enemyCap ?? 8,
    queue: [],
    enemyActQueue: [],
    pending: null,
    tieChoices: {},
    flags: {},
    boss: {
      ressonancia: 0,
      terceiraPreparada: false,
      convocacoes: 0,
      contrapesos: [
        { id: 'oeste', used: false, lastFailCycle: -1 },
        { id: 'norte', used: false, lastFailCycle: -1 },
        { id: 'leste', used: false, lastFailCycle: -1 },
      ],
      manivelaUsada: false,
      silencioUsado: false,
      canto: 1,
      ultimaBadaladaPendente: false,
      cavaleiroGuarda: init.ctx?.guardaInicial ?? 'fechada',
      vigiaMarcados: [],
      vigiaGuardado: false,
      fase2: {},
      exposedByRes: false,
    },
    ctx: { hasManivela: false, hasSilencio: false, guardaInicial: 'fechada', encounterRules: [], ...(init.ctx ?? {}) },
    rng: typeof init.seed === 'string' ? createRng(init.seed) : { ...init.seed },
    log: [],
    logSeq: 0,
    nextId: 0,
    settings: { autoTieBreak: false, ...(init.settings ?? {}) },
    commandCount: 0,
  };
  let order = 0;
  for (const h of init.heroes) S.figures.push({ ...structuredClone(h), order: order++ });
  for (const e of init.enemies) {
    const def = R.enemies[e.typeId];
    if (!def) throw new Error(`enemy ${e.typeId} missing`);
    S.nextId++;
    S.figures.push(makeEnemyFigure(def, `e${S.nextId}`, e.sector, init.partySize, order++));
    if (!S.typeOrder.includes(def.id)) S.typeOrder.push(def.id);
  }
  for (const o of init.objectives) S.objectives[o] = { id: o, lastAttemptCycle: -1, uses: 0, done: false, data: {} };
  for (const t of S.typeOrder) S.enemyTypes[t] = newTypeState(S, t);
  const c: Ctx = { S, events: [] };
  log(c, 'system', `Combate iniciado: ${init.encounterId}.`);
  if (init.skipDeploy) startCombat(c);
  return S;
}

function newTypeState(S: CombatState, typeId: string): EnemyTypeState {
  const def = reg().enemies[typeId];
  return { typeId, deck: shuffle(S.rng, def.intents.map((_, i) => i)), drawnCount: 0, revealed: null, obligatory: false };
}

// ============================================================================ commands
export type Command =
  | { t: 'deploy'; figureId: string; sector: SectorKey }
  | { t: 'start' }
  | { t: 'tempo'; figureId: string; tempo: Tempo }
  | { t: 'confirmTempo' }
  | { t: 'activate'; figureId: string }
  | ({ t: 'action' } & ActionCmd)
  | { t: 'end'; figureId: string }
  | { t: 'answer'; pendingId: string; answer: PendingAnswer }
  | { t: 'reroll'; dieIndex: number }
  | { t: 'settings'; autoTieBreak?: boolean };

export type PendingAnswer =
  | { kind: 'attackPost'; choices: string[] }
  | { kind: 'defense'; reactions: { heroId: string; kind: string }[] }
  | { kind: 'egide'; paladinId: string | null }
  | { kind: 'conditionResponse'; choice: { heroId: string; kind: string } | null }
  | { kind: 'step'; sector: SectorKey | null }
  | { kind: 'tieBreak'; heroId: string }
  | { kind: 'choice'; optionId: string }
  | { kind: 'allocate'; alloc: Record<string, number> }
  | { kind: 'silencio'; use: boolean };

export interface DispatchResult {
  state: CombatState;
  events: DomainEvent[];
  error: string | null;
}

export function dispatch(state: CombatState, cmd: Command): DispatchResult {
  const S = structuredClone(state);
  const c: Ctx = { S, events: [] };
  try {
    handle(c, cmd);
    S.commandCount++;
    drain(c);
    return { state: S, events: c.events, error: null };
  } catch (e) {
    if (e instanceof RuleError) return { state, events: [], error: e.message };
    throw e;
  }
}

export class RuleError extends Error {}
function fail(msg: string): never {
  throw new RuleError(msg);
}

function handle(c: Ctx, cmd: Command) {
  const S = c.S;
  if (S.phase === 'ended') fail('O combate terminou.');
  switch (cmd.t) {
    case 'settings':
      if (cmd.autoTieBreak !== undefined) S.settings.autoTieBreak = cmd.autoTieBreak;
      return;
    case 'deploy': {
      if (S.phase !== 'deploy') fail('Posicionamento já encerrado.');
      const f = fig(c, cmd.figureId);
      if (f.side !== 'H') fail('Apenas heróis são posicionados.');
      if (cmd.sector[0] !== 'H') fail('Posicione no lado dos heróis.');
      if (!hasRoom(S.figures, cmd.sector, f.id)) fail('Setor cheio (máximo 2 figuras).');
      f.sector = cmd.sector;
      return;
    }
    case 'start':
      if (S.phase !== 'deploy') fail('Combate já iniciado.');
      startCombat(c);
      return;
    case 'tempo': {
      if (S.phase !== 'tempo') fail('Não é a fase de escolha de Tempo.');
      if (S.pending) fail('Resolva a decisão pendente.');
      const f = fig(c, cmd.figureId);
      if (f.side !== 'H' || !isActive(f)) fail('Herói inválido.');
      f.tempo = cmd.tempo;
      c.events.push({ type: 'resource', figureId: f.id, resource: 'tempo', value: ['rapido', 'tatico', 'pesado'].indexOf(cmd.tempo) });
      return;
    }
    case 'confirmTempo': {
      if (S.phase !== 'tempo') fail('Não é a fase de escolha de Tempo.');
      if (S.pending) fail('Resolva a decisão pendente.');
      const missing = heroes(c).filter((h) => !h.tempo);
      if (missing.length) fail(`Escolha o Tempo de: ${missing.map((m) => m.name).join(', ')}.`);
      for (const h of heroes(c)) log(c, 'tempo', `${h.name} escolhe Tempo ${tempoLabel(h.tempo!)}.`);
      // Vigia das Três Vigílias (§43): confronts the heroes' Tempo choice.
      for (const t of S.typeOrder) reg().handlers[`tempoConfirmed:${t}`]?.(c, { typeId: t });
      S.band = 'HR';
      enterBand(c);
      return;
    }
    case 'activate': {
      if (S.phase !== 'heroBand') fail('Não é o momento de ativar um herói.');
      if (S.pending) fail('Resolva a decisão pendente.');
      const f = fig(c, cmd.figureId);
      const cands = bandCandidates(c);
      if (!cands.some((x) => x.id === f.id)) fail(`${f.name} não pode agir agora.`);
      startHeroActivation(c, f);
      return;
    }
    case 'end': {
      if (S.phase !== 'heroActing' || S.activeId !== cmd.figureId) fail('Este herói não está ativo.');
      if (S.pending) fail('Resolva a decisão pendente.');
      if (S.queue.length) fail('Aguarde a resolução.');
      endHeroActivation(c, fig(c, cmd.figureId));
      return;
    }
    case 'action':
      return doAction(c, cmd);
    case 'reroll': {
      if (!S.pending || S.pending.kind !== 'attackPost') fail('Nenhum ataque aguardando.');
      try {
        rerollDie(c, cmd.dieIndex);
      } catch (e) {
        fail((e as Error).message);
      }
      return;
    }
    case 'answer':
      return answerPending(c, cmd.pendingId, cmd.answer);
  }
}

export function tempoLabel(t: Tempo): string {
  return t === 'rapido' ? 'Rápido' : t === 'tatico' ? 'Tático' : 'Pesado';
}

// ============================================================================ combat start / cycle
function startCombat(c: Ctx) {
  const S = c.S;
  // combat-start hooks: Ladino Furtivo, Vestes Consagradas, Manto choice, Paladino Julgado...
  for (const h of heroes(c)) for (const { h: hk } of hooksOf(h)) hk.onCombatStart?.(c, h);
  for (const e of enemies(c)) reg().enemies[e.typeId]?.onCombatStart?.(c, e);
  S.phase = 'tempo';
  beginCycle(c);
}

function beginCycle(c: Ctx) {
  const S = c.S;
  S.cycle++;
  S.band = 'HR';
  S.tieChoices = {};
  c.events.push({ type: 'cycleStart', cycle: S.cycle });
  log(c, 'cycle', `— Ciclo ${S.cycle} —`);
  for (const f of S.figures) {
    f.counters.cycle = {};
    if (f.side === 'H') {
      f.tempo = null;
      f.acted = false;
      if (f.status === 'active') f.reaction = true; // restore 1 Reação (§14)
    }
  }
  for (const h of heroes(c)) for (const { h: hk } of hooksOf(h)) hk.onCycleStart?.(c, h);
  revealIntents(c);
  S.phase = 'tempo';
}

function typesPresent(c: Ctx): string[] {
  return c.S.typeOrder.filter((t) => c.S.figures.some((f) => f.typeId === t && f.side === 'E' && f.status === 'active'));
}

function revealIntents(c: Ctx) {
  const S = c.S;
  const R = reg();
  for (const t of typesPresent(c)) {
    if (!S.enemyTypes[t]) S.enemyTypes[t] = newTypeState(S, t);
    const ts = S.enemyTypes[t];
    const def = R.enemies[t];
    ts.obligatory = false;
    const override = R.handlers[`revealOverride:${t}`];
    if (override) {
      override(c, { typeId: t });
      if (ts.obligatory) {
        const intent = def.obligatory!.find((i) => i.id === ts.revealed)!;
        c.events.push({ type: 'intentRevealed', enemyType: t, intentId: intent.id });
        log(c, 'intent', `${def.name} revela Intenção obrigatória: ${intent.name} (${tempoLabel(intent.tempo)}).`);
        def.onReveal?.(c, t, intent);
        continue;
      }
    }
    if (ts.deck.length === 0) {
      ts.deck = shuffle(S.rng, def.intents.map((_, i) => i));
      log(c, 'intent', `${def.name}: baralho de Intenções embaralhado.`);
    }
    const idx = ts.deck.shift()!;
    ts.drawnCount++;
    const intent = def.intents[idx];
    ts.revealed = intent.id;
    c.events.push({ type: 'intentRevealed', enemyType: t, intentId: intent.id });
    log(c, 'intent', `${def.name} revela: ${intent.name} (${tempoLabel(intent.tempo)}).`);
    def.onReveal?.(c, t, intent);
  }
}

export function revealedIntent(c: Ctx | { S: CombatState }, typeId: string) {
  const ts = c.S.enemyTypes[typeId];
  if (!ts?.revealed) return null;
  const def = reg().enemies[typeId];
  return def.intents.find((i) => i.id === ts.revealed) ?? def.obligatory?.find((i) => i.id === ts.revealed) ?? null;
}

function bandCandidates(c: Ctx): Figure[] {
  const t = bandTempo(c.S.band);
  return heroes(c).filter((h) => h.tempo === t && !h.acted);
}

function enterBand(c: Ctx) {
  const S = c.S;
  // loop over empty bands
  for (;;) {
    if (S.result) return;
    if (S.band === 'END') {
      endCycle(c);
      return;
    }
    c.events.push({ type: 'bandStart', band: S.band });
    const side = bandSide(S.band);
    if (side === 'H') {
      if (bandCandidates(c).length) {
        S.phase = 'heroBand';
        return;
      }
    } else {
      const t = bandTempo(S.band);
      for (const ty of typesPresent(c)) reg().handlers[`bandStart:${ty}`]?.(c, { band: S.band, typeId: ty });
      const list = enemies(c)
        .filter((e) => e.reinforcementCycle !== S.cycle)
        .filter((e) => revealedIntent(c, e.typeId)?.tempo === t)
        .sort((a, b) => S.typeOrder.indexOf(a.typeId) - S.typeOrder.indexOf(b.typeId) || a.order - b.order);
      S.enemyActQueue = list.map((e) => e.id);
      if (list.length || S.queue.length) {
        S.phase = 'enemyBand';
        return;
      }
    }
    S.band = BANDS[BANDS.indexOf(S.band) + 1];
  }
}

function nextBand(c: Ctx) {
  c.S.band = BANDS[BANDS.indexOf(c.S.band) + 1];
  enterBand(c);
}

function endCycle(c: Ctx) {
  const S = c.S;
  log(c, 'cycle', `Fim do Ciclo ${S.cycle}.`);
  // Queimando (§15): every Burning figure suffers 1 Dano Direto; enemies then remove it.
  for (const f of S.figures.filter((x) => isActive(x) && x.conditions.queimando)) {
    dealDamage(c, f, 1, { direct: true, sourceId: null, school: 'fire', label: 'Queimando' });
    if (f.side === 'E' && f.conditions.queimando) setCond(c, f, 'queimando', false);
  }
  // expire "até o fim do Ciclo atual"
  const before = S.battlefield.smoke.length;
  S.battlefield.smoke = S.battlefield.smoke.filter((s) => s.until.kind !== 'endOfCycle');
  if (before !== S.battlefield.smoke.length) c.events.push({ type: 'smoke', sectors: [], added: false });
  for (const f of S.figures) f.conditions.imuneQueimando = false;
  for (const ty of S.typeOrder) reg().handlers[`cycleEnd:${ty}`]?.(c, { typeId: ty });
  // reinforcements
  for (const w of S.reinforcements) if (!w.done && w.atEndOfCycle <= S.cycle) spawnWave(c, w);
  if (checkEnd(c)) return;
  beginCycle(c);
}

function spawnWave(c: Ctx, w: ReinforcementWave) {
  w.done = true;
  for (const e of w.enemies) spawnEnemy(c, e.typeId, e.sector, 'Reforço');
}

/** Place a reinforcement; respects active cap (8 ordinary / boss may declare 10); excess goes to Reserve. */
export function spawnEnemy(c: Ctx, typeId: string, sector: SectorKey | undefined, reason: string): Figure | null {
  const S = c.S;
  const def = reg().enemies[typeId];
  const activeCount = enemies(c).length;
  S.nextId++;
  const id = `e${S.nextId}`;
  const entries = [sector, ...S.battlefield.reinforcementEntries, 'E:R3', 'E:R2', 'E:R4', 'E:R1', 'E:R5', 'E:F3', 'E:F2', 'E:F4', 'E:F1', 'E:F5'].filter(Boolean) as SectorKey[];
  const place = entries.find((k) => hasRoom(S.figures, k));
  const f = makeEnemyFigure(def, id, place ?? 'E:R3', S.partySize, S.figures.length + 100);
  f.reinforcementCycle = S.cycle;
  if (activeCount >= S.enemyCap || !place) {
    f.status = 'reserve';
    S.figures.push(f);
    log(c, 'reinforcement', `${def.name} vai para a Reserva (limite de ${S.enemyCap} inimigos ativos).`);
    return f;
  }
  S.figures.push(f);
  if (!S.typeOrder.includes(typeId)) S.typeOrder.push(typeId);
  if (!S.enemyTypes[typeId]) S.enemyTypes[typeId] = newTypeState(S, typeId);
  c.events.push({ type: 'spawn', figureId: id });
  log(c, 'reinforcement', `${reason}: ${def.name} entra em ${place}.`);
  afterEnterSector(c, f, place);
  return f;
}

/** Victory / defeat check. Returns true when the combat ended. */
export function checkEnd(c: Ctx): boolean {
  const S = c.S;
  if (S.result) return true;
  if (!heroes(c).length) {
    S.result = 'defeat';
    S.phase = 'ended';
    S.queue = [];
    S.pending = null;
    c.events.push({ type: 'defeat' });
    log(c, 'system', 'Todos os heróis estão Caídos ou Derrotados.');
    return true;
  }
  if (!enemies(c).length) {
    // bring reserve first
    const reserve = S.figures.filter((f) => f.status === 'reserve');
    if (reserve.length) {
      for (const r of reserve) {
        const place = [...S.battlefield.reinforcementEntries, 'E:R3', 'E:R2', 'E:R4', 'E:F3'].find((k) => hasRoom(S.figures, k as SectorKey)) as SectorKey | undefined;
        if (!place) break;
        r.status = 'active';
        r.sector = place;
        c.events.push({ type: 'spawn', figureId: r.id });
      }
      return false;
    }
    const pendingWave = S.reinforcements.find((w) => !w.done);
    if (pendingWave) {
      // HIPÓTESE (OPEN_DESIGN_QUESTIONS Q-REINF): scheduled reinforcements arrive early when the field is cleared.
      log(c, 'reinforcement', 'O campo ficou vazio: os Reforços previstos chegam antecipadamente.');
      spawnWave(c, pendingWave);
      return false;
    }
    S.result = 'victory';
    S.phase = 'ended';
    S.queue = [];
    S.pending = null;
    c.events.push({ type: 'victory' });
    log(c, 'system', 'Vitória!');
    return true;
  }
  return false;
}

// ============================================================================ hero activation
function startHeroActivation(c: Ctx, f: Figure) {
  const S = c.S;
  S.activeId = f.id;
  S.phase = 'heroActing';
  f.counters.activation = {};
  f.movedThisActivation = 0;
  f.steppedThisActivation = false;
  f.ap = tempoAp(f.tempo!);
  f.counters.activation['rapidStep'] = f.tempo === 'rapido' && !hooksOf(f).some(({ h }) => h.noRapidStep) ? 0 : 1;
  c.events.push({ type: 'activationStart', figureId: f.id });
  log(c, 'activation', `${f.name} inicia a Ativação (${tempoLabel(f.tempo!)}, ${f.ap} AP).`);
  if (f.conditions.atordoado) {
    f.ap = Math.max(0, f.ap - 1);
    setCond(c, f, 'atordoado', false);
    log(c, 'condition', `Atordoado: ${f.name} perde 1 AP.`);
  }
  if (f.conditions.semReacoes) setCond(c, f, 'semReacoes', false);
  if (f.conditions.bencao) setCond(c, f, 'bencao', false);
  if (f.conditions.ancorado) {
    f.conditions.ancorado = false;
    f.conditions.ancoradoUsado = false;
  }
  expireActivationScoped(c, f);
  for (const { h } of hooksOf(f)) h.onActivationStart?.(c, f);
}

function expireActivationScoped(c: Ctx, f: Figure) {
  const S = c.S;
  const n = S.battlefield.smoke.length;
  S.battlefield.smoke = S.battlefield.smoke.filter((s) => !(s.until.kind === 'activationStart' && s.until.figureId === f.id));
  if (n !== S.battlefield.smoke.length) c.events.push({ type: 'smoke', sectors: [], added: false });
  S.battlefield.consecrated = S.battlefield.consecrated.filter((a) => a.ownerId !== f.id);
}

function endHeroActivation(c: Ctx, f: Figure) {
  const S = c.S;
  for (const { h } of hooksOf(f)) h.onActivationEnd?.(c, f);
  // Veneno (§15): end of own Activation — 1 Dano Direto and remove 1.
  if (isActive(f) && f.conditions.veneno > 0) {
    f.conditions.veneno--;
    log(c, 'condition', `Veneno: ${f.name} sofre 1 Dano Direto (restam ${f.conditions.veneno}).`);
    dealDamage(c, f, 1, { direct: true, sourceId: null, school: 'poison', label: 'Veneno' });
  }
  // HIPÓTESE Q-IMOB: Imobilizado lasts until the end of the affected figure's next Activation.
  if (f.conditions.imobilizado && f.counters.activation['imobAppliedNow'] !== 1) setCond(c, f, 'imobilizado', false);
  f.acted = true;
  f.ap = 0;
  S.activeId = null;
  delete S.flags['__forceEndActivation'];
  c.events.push({ type: 'activationEnd', figureId: f.id });
  S.phase = 'heroBand';
  if (!bandCandidates(c).length) nextBand(c);
}

// ============================================================================ actions
export function heroActions(c: Ctx, f: Figure): ActionDef[] {
  const R = reg();
  const out: ActionDef[] = [];
  const cls = R.classes[f.typeId];
  if (cls) out.push(...cls.actions);
  for (const t of f.talents ?? []) {
    const td = R.talents[t];
    if (td?.implemented && td.actions) out.push(...td.actions);
  }
  out.push(...R.universalActions);
  for (const o of Object.keys(c.S.objectives)) if (R.objectiveActions[o]) out.push(R.objectiveActions[o]);
  return out.filter((a) => !a.hidden?.(c, f));
}

export function actionCost(c: Ctx, f: Figure, a: ActionDef, cmd?: ActionCmd): number {
  return a.apCost ? a.apCost(c, f, cmd) : a.ap;
}

export interface ActionAvailability {
  def: ActionDef;
  cost: number;
  reason: string | null;
}

export function actionAvailability(c: Ctx, f: Figure): ActionAvailability[] {
  return heroActions(c, f).map((def) => {
    const cost = actionCost(c, f, def);
    let reason: string | null = null;
    if (c.S.phase !== 'heroActing' || c.S.activeId !== f.id) reason = 'Não é a Ativação deste herói.';
    else if (c.S.pending) reason = 'Resolva a decisão pendente.';
    else if ((f.ap ?? 0) < cost) reason = `AP insuficiente (custa ${cost}).`;
    else reason = def.available?.(c, f) ?? null;
    if (!reason && def.limit && def.limit !== 'dungeon' && !canUse(f, def.limit, `act:${def.id}`)) reason = `Limite: uma vez por ${limitLabel(def.limit)}.`;
    if (!reason && def.limit === 'dungeon' && (f.dungeonUses?.[def.id] ?? 0) >= 1) reason = 'Limite: uma vez por Dungeon.';
    if (!reason) {
      const t = actionTargets(c, f, def);
      if (t.needsTarget && !t.any) reason = 'Nenhum alvo válido.';
    }
    return { def, cost, reason };
  });
}

function limitLabel(l: string) {
  return l === 'activation' ? 'Ativação' : l === 'cycle' ? 'Ciclo' : 'Combate';
}

export interface TargetSet {
  needsTarget: boolean;
  any: boolean;
  figures: string[];
  sectors: SectorKey[];
  areas: [SectorKey, SectorKey][];
}

/** Single source of truth for legal targets — the UI highlights exactly what the engine accepts. */
export function actionTargets(c: Ctx, f: Figure, def: ActionDef): TargetSet {
  const T = def.targeting;
  const out: TargetSet = { needsTarget: T.type !== 'none', any: false, figures: [], sectors: [], areas: [] };
  const ok = (cmd: Omit<ActionCmd, 'actionId' | 'figureId'>) => !def.validate || def.validate(c, f, { actionId: def.id, figureId: f.id, ...cmd }) === null;
  switch (T.type) {
    case 'none':
      out.any = true;
      break;
    case 'enemy': {
      const cat = T.reach === 'weapon' ? weaponCat(f) : T.reach;
      for (const e of enemies(c)) {
        if (T.adjacentOnly && !adjacent(f, e)) continue;
        if (!canTarget(f.sector, e, cat, c.S.figures, f.side)) continue;
        if (ok({ targetIds: [e.id] })) out.figures.push(e.id);
      }
      break;
    }
    case 'ally': {
      for (const h of c.S.figures.filter((x) => x.side === 'H' && (x.status === 'active' || (T.allowCaido && x.status === 'caido')))) {
        const self = h.id === f.id;
        let inRange = false;
        switch (T.range) {
          case 'self':
            inRange = self;
            break;
          case 'adjacent':
            inRange = !self && adjacent(h, f);
            break;
          case 'selfOrAdjacent':
            inRange = self || adjacent(h, f);
            break;
          case 'support':
            inRange = !self && Math.abs(parseSector(h.sector).col - parseSector(f.sector).col) <= 1;
            break;
          case 'supportOrSelf':
            inRange = self || Math.abs(parseSector(h.sector).col - parseSector(f.sector).col) <= 1;
            break;
          case 'any':
            inRange = T.allowSelf || !self;
            break;
        }
        if (inRange && ok({ targetIds: [h.id] })) out.figures.push(h.id);
      }
      break;
    }
    case 'sector': {
      for (const k of allSectors(T.side)) if (ok({ sector: k })) out.sectors.push(k);
      break;
    }
    case 'area2':
    case 'sectors2': {
      const side = T.side;
      const ks = allSectors(side);
      const needConnected = T.type === 'area2';
      for (let i = 0; i < ks.length; i++)
        for (let j = i + 1; j < ks.length; j++) if ((!needConnected || isValidArea2(ks[i], ks[j])) && ok({ sectors: [ks[i], ks[j]] })) out.areas.push([ks[i], ks[j]]);
      break;
    }
    case 'move': {
      for (const k of stepDestinations(c, f, T.steps, T.ignoreEngagement)) if (ok({ sector: k })) out.sectors.push(k);
      break;
    }
  }
  out.any = out.any || out.figures.length > 0 || out.sectors.length > 0 || out.areas.length > 0;
  return out;
}

export function weaponCat(f: Figure) {
  const w = f.equipment?.primary ? reg().items[f.equipment.primary.itemId] : undefined;
  return w?.cat ?? 'cac';
}

function doAction(c: Ctx, cmd: { t: 'action' } & ActionCmd) {
  const S = c.S;
  if (S.pending) fail('Resolva a decisão pendente.');
  if (S.queue.length) fail('Aguarde a resolução.');
  const f = fig(c, cmd.figureId);
  if (S.phase !== 'heroActing' || S.activeId !== f.id) fail('Não é a Ativação deste herói.');
  const def = heroActions(c, f).find((a) => a.id === cmd.actionId);
  if (!def) fail('Ação indisponível.');
  const cost = actionCost(c, f, def, cmd);
  if ((f.ap ?? 0) < cost) fail(`AP insuficiente (custa ${cost}).`);
  const why = def.available?.(c, f);
  if (why) fail(why);
  if (def.limit && def.limit !== 'dungeon' && !canUse(f, def.limit, `act:${def.id}`)) fail(`Limite: uma vez por ${limitLabel(def.limit)}.`);
  if (def.limit === 'dungeon' && (f.dungeonUses?.[def.id] ?? 0) >= 1) fail('Limite: uma vez por Dungeon.');
  // target legality through the same resolver the UI uses
  const T = def.targeting;
  const ts = actionTargets(c, f, def);
  if (T.type === 'enemy' || T.type === 'ally') {
    const tid = cmd.targetIds?.[0];
    if (!tid || !ts.figures.includes(tid)) fail('Alvo inválido.');
  } else if (T.type === 'sector' || T.type === 'move') {
    if (!cmd.sector || !ts.sectors.includes(cmd.sector)) fail('Setor inválido.');
  } else if (T.type === 'area2' || T.type === 'sectors2') {
    const [a, b] = cmd.sectors ?? [];
    if (!a || !b || !ts.areas.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) fail('Área inválida (dois Setores ortogonalmente conectados).');
  }
  const v = def.validate?.(c, f, cmd);
  if (v) fail(v);
  f.ap = (f.ap ?? 0) - cost;
  if (def.limit && def.limit !== 'dungeon') markUse(f, def.limit, `act:${def.id}`);
  if (def.limit === 'dungeon') f.dungeonUses = { ...(f.dungeonUses ?? {}), [def.id]: (f.dungeonUses?.[def.id] ?? 0) + 1 };
  c.events.push({ type: 'resource', figureId: f.id, resource: 'ap', value: f.ap });
  def.execute(c, f, cmd);
}

// ============================================================================ movement
/** Hero Passo destinations: up to n connections; entering an engaging Frente ends the movement unless ignoreEngagement. */
export function stepDestinations(c: Ctx, f: Figure, n: number, ignoreEngagement: boolean): SectorKey[] {
  if (f.conditions.imobilizado) return [];
  const figs = c.S.figures;
  const seen = new Map<SectorKey, number>([[f.sector, 0]]);
  const q: SectorKey[] = [f.sector];
  while (q.length) {
    const cur = q.shift()!;
    const d = seen.get(cur)!;
    if (d >= n) continue;
    if (cur !== f.sector && !ignoreEngagement && sectorEngaged(cur, f.side, figs, f.id)) continue;
    for (const nx of connections(cur)) {
      if (seen.has(nx)) continue;
      seen.set(nx, d + 1);
      q.push(nx);
    }
  }
  return [...seen.keys()].filter((k) => k !== f.sector && hasRoom(figs, k, f.id));
}

/** Extra AP for voluntarily leaving Engajamento (+1 once per action/effect, §7). */
export function leaveEngagementCost(c: Ctx, f: Figure, dest: SectorKey, ignoreEngagement: boolean): number {
  if (ignoreEngagement) return 0;
  return isEngaged(f, c.S.figures) && dest !== f.sector ? 1 : 0;
}

export interface HeroMoveOpts {
  kind: 'reposicionar' | 'passo' | 'teleport' | 'troca';
  ignoreEngagement: boolean;
  /** Extra AP already validated/paid by the caller. */
}

export function heroMove(c: Ctx, f: Figure, dest: SectorKey, opts: HeroMoveOpts) {
  const from = f.sector;
  if (from === dest) return;
  f.sector = dest;
  const conns = Math.max(1, Math.abs(parseSector(from).col - parseSector(dest).col) + (parseSector(from).row === parseSector(dest).row ? 0 : 1));
  f.movedThisActivation = (f.movedThisActivation ?? 0) + conns;
  if (opts.kind === 'passo') f.steppedThisActivation = true;
  c.events.push({ type: 'move', figureId: f.id, from, to: dest, forced: false, teleport: opts.kind === 'teleport' });
  log(c, 'move', `${f.name} ${opts.kind === 'passo' ? 'faz Passo' : opts.kind === 'teleport' ? 'se teleporta' : 'se reposiciona'} para ${dest}.`);
  bleedTick(c, f);
  for (const { h } of hooksOf(f)) h.onMoved?.(c, f, { from, to: dest, voluntary: true, kind: opts.kind, connections: conns });
  afterEnterSector(c, f, from);
}

// ============================================================================ pending answers
function answerPending(c: Ctx, pendingId: string, ans: PendingAnswer) {
  const S = c.S;
  const p = S.pending;
  if (!p || p.id !== pendingId) fail('Decisão expirada.');
  if (p.kind !== ans.kind) fail('Resposta incompatível.');
  switch (p.kind) {
    case 'attackPost': {
      const a = ans as Extract<PendingAnswer, { kind: 'attackPost' }>;
      const src = fig(c, p.attack.sourceId);
      const err = validateChoices(p.options, p.roll, a.choices, src, Number(p.attack.data['targetBrechas'] ?? 99));
      if (err) fail(err);
      S.pending = null;
      pushOps(c, [{ op: 'finishAttack', attack: p.attack, roll: p.roll, choices: a.choices }]);
      return;
    }
    case 'defense': {
      const a = ans as Extract<PendingAnswer, { kind: 'defense' }>;
      S.pending = null;
      try {
        commitDefense(c, p.d, a.reactions);
      } catch (e) {
        S.pending = p;
        fail((e as Error).message);
      }
      return;
    }
    case 'egide': {
      const a = ans as Extract<PendingAnswer, { kind: 'egide' }>;
      if (a.paladinId && !p.paladins.includes(a.paladinId)) fail('Paladino inválido.');
      S.pending = null;
      resolveEgide(c, p.d, p.damage, a.paladinId);
      return;
    }
    case 'conditionResponse': {
      const a = ans as Extract<PendingAnswer, { kind: 'conditionResponse' }>;
      if (a.choice && !p.options.some((o) => o.heroId === a.choice!.heroId && o.kind === a.choice!.kind)) fail('Resposta inválida.');
      S.pending = null;
      resolveConditionResponse(c, p.targetId, p.effect, p.sourceId, a.choice);
      return;
    }
    case 'step': {
      const a = ans as Extract<PendingAnswer, { kind: 'step' }>;
      const f = fig(c, p.figureId);
      if (a.sector) {
        if (!p.destinations.includes(a.sector)) fail('Destino inválido.');
        const extra = leaveEngagementCost(c, f, a.sector, p.ignoreEngagement);
        if (extra > (f.ap ?? 0)) fail('Sair de Engajamento custa +1 AP.');
        f.ap = (f.ap ?? 0) - extra;
        S.pending = null;
        heroMove(c, f, a.sector, { kind: 'passo', ignoreEngagement: p.ignoreEngagement });
      } else S.pending = null;
      return;
    }
    case 'tieBreak': {
      const a = ans as Extract<PendingAnswer, { kind: 'tieBreak' }>;
      if (!p.candidates.includes(a.heroId)) fail('Herói inválido.');
      S.tieChoices[p.enemyId] = a.heroId;
      S.pending = null;
      pushOps(c, [{ op: 'enemyPlan', id: p.enemyId }]);
      return;
    }
    case 'choice': {
      const a = ans as Extract<PendingAnswer, { kind: 'choice' }>;
      if (!p.options.some((o) => o.id === a.optionId)) fail('Opção inválida.');
      S.pending = null;
      const h = reg().handlers[p.handler];
      if (!h) fail(`handler ${p.handler} ausente`);
      h(c, { ...p.args, optionId: a.optionId, figureId: p.figureId });
      return;
    }
    case 'allocate': {
      const a = ans as Extract<PendingAnswer, { kind: 'allocate' }>;
      let total = 0;
      for (const [id, n] of Object.entries(a.alloc)) {
        if (!p.targets.includes(id)) fail('Alvo inválido.');
        if (n < 0 || n > p.maxPer) fail(`Máximo ${p.maxPer} por alvo.`);
        total += n;
      }
      if (total > p.total) fail(`Distribua no máximo ${p.total}.`);
      S.pending = null;
      reg().handlers[p.handler]?.(c, { ...p.args, alloc: a.alloc, figureId: p.figureId });
      return;
    }
    case 'silencio': {
      const a = ans as Extract<PendingAnswer, { kind: 'silencio' }>;
      S.pending = null;
      reg().handlers['severin:silencio']?.(c, { use: a.use, figureId: p.figureId });
      return;
    }
  }
}

// ============================================================================ interpreter
const MAX_STEPS = 5000;

export function drain(c: Ctx) {
  const S = c.S;
  let guard = 0;
  for (;;) {
    if (++guard > MAX_STEPS) throw new Error('engine loop guard');
    if (S.result) {
      S.phase = 'ended';
      return;
    }
    if (S.pending) return;
    if (S.queue.length) {
      const op = S.queue.shift()!;
      runOp(c, op);
      continue;
    }
    // queue empty — continue the flow
    if (S.phase === 'heroActing') {
      const forced = S.flags['__forceEndActivation'];
      const f = tryFig(c, S.activeId);
      if (f && (forced === f.id || !isActive(f))) {
        endHeroActivation(c, f);
        continue;
      }
      return;
    }
    if (S.phase === 'enemyBand') {
      const next = S.enemyActQueue.shift();
      if (next) {
        const e = tryFig(c, next);
        if (e && isActive(e)) S.queue.push({ op: 'enemyActivate', id: e.id });
        continue;
      }
      nextBand(c);
      continue;
    }
    if (S.phase === 'heroBand') {
      if (!bandCandidates(c).length) {
        nextBand(c);
        continue;
      }
      return;
    }
    return;
  }
}

function runOp(c: Ctx, op: Op) {
  const S = c.S;
  switch (op.op) {
    case 'checkEnd':
      checkEnd(c);
      return;
    case 'log':
      log(c, op.kind ?? 'system', op.text);
      return;
    case 'enemyActivate': {
      const e = tryFig(c, op.id);
      if (!e || !isActive(e)) return;
      e.counters.activation = {};
      e.conditions.armaduraExtra = 0;
      e.conditions.ignoraEmpurrao = false;
      expireActivationScoped(c, e);
      c.events.push({ type: 'activationStart', figureId: e.id });
      S.activeId = e.id;
      pushOps(c, [{ op: 'enemyPlan', id: e.id }]);
      // Sigils trigger when an enemy starts its Activation in their Sector
      const sig = S.battlefield.sigils.find((s) => s.sector === e.sector && (s.kind === 'detonacao' || s.kind === 'estase'));
      if (sig) pushOps(c, [{ op: 'call', fn: 'sigil:trigger', args: { sigilId: sig.id, enemyId: e.id } }]);
      return;
    }
    case 'enemyPlan': {
      const e = tryFig(c, op.id);
      if (!e || !isActive(e)) return;
      const intent = revealedIntent(c, e.typeId);
      if (!intent) {
        pushOps(c, [{ op: 'enemyEnd', id: e.id }]);
        return;
      }
      const qlen = S.queue.length;
      const saved = S.queue.splice(0, qlen);
      try {
        intent.plan(c, e);
      } catch (err) {
        if (err instanceof NeedTieBreak) {
          S.queue = saved;
          S.pending = { id: newId(c, 'p'), controllers: [], kind: 'tieBreak', enemyId: err.enemyId, candidates: err.candidates, reason: err.reason };
          return;
        }
        throw err;
      }
      S.queue.push({ op: 'afterIntent', figureId: e.id, intentId: intent.id, typeId: e.typeId }, { op: 'enemyEnd', id: e.id }, ...saved);
      return;
    }
    case 'afterIntent':
      reg().handlers[`afterIntent:${op.typeId}`]?.(c, { figureId: op.figureId, intentId: op.intentId });
      return;
    case 'enemyEnd': {
      const e = tryFig(c, op.id);
      if (e && isActive(e)) {
        if (e.conditions.veneno > 0) {
          e.conditions.veneno--;
          dealDamage(c, e, 1, { direct: true, sourceId: null, school: 'poison', label: 'Veneno' });
        }
        if (isActive(e) && e.conditions.imobilizado && e.counters.activation['imobAppliedNow'] !== 1) setCond(c, e, 'imobilizado', false);
      }
      if (e) c.events.push({ type: 'activationEnd', figureId: e.id });
      delete S.tieChoices[op.id];
      S.activeId = null;
      return;
    }
    case 'move': {
      const f = tryFig(c, op.id);
      if (!f || !isActive(f)) return;
      if (op.voluntary && f.conditions.imobilizado) {
        log(c, 'move', `${f.name} está Imobilizado e não se move.`);
        return;
      }
      let cur = f.sector;
      const path = op.path[0] === cur ? op.path.slice(1) : op.path;
      for (const k of path) {
        if (!connections(cur).includes(k) && !op.teleport) break;
        cur = k;
        if (op.stopOnEngage && sectorEngaged(k, f.side, S.figures, f.id)) break;
      }
      if (cur === f.sector) return;
      if (!hasRoom(S.figures, cur, f.id)) {
        // back off along the path to the last sector with room
        const idx = path.indexOf(cur);
        let ok: SectorKey | null = null;
        for (let i = idx - 1; i >= 0; i--) if (hasRoom(S.figures, path[i], f.id)) {
          ok = path[i];
          break;
        }
        if (!ok) return;
        cur = ok;
      }
      const from = f.sector;
      f.sector = cur;
      c.events.push({ type: 'move', figureId: f.id, from, to: cur, forced: op.forced, teleport: op.teleport });
      log(c, 'move', `${f.name} move-se para ${cur}.`);
      if (!op.forced) bleedTick(c, f);
      afterEnterSector(c, f, from);
      // Arqueiro Tiro de Interceptação window
      if (f.side === 'E' && op.voluntary) reg().handlers['reaction:afterEnemyMove']?.(c, { enemyId: f.id, from });
      return;
    }
    case 'eAttack':
      runEnemyAttack(c, op.spec);
      return;
    case 'defend':
      beginDefense(c, op.spec, op.targetId);
      return;
    case 'defendResolve':
      resolveDefense(c, op.d);
      return;
    case 'effect':
      runEffect(c, op.targetId, op.effect, op.sourceId, !!op.viaCondition);
      return;
    case 'guard':
      for (const id of op.targetIds) {
        const t = tryFig(c, id);
        if (t && isActive(t)) applyCondition(c, t, 'guardado', 1, op.sourceId);
      }
      return;
    case 'heal': {
      const t = tryFig(c, op.targetId);
      if (t) heal(c, t, op.amount, op.sourceId);
      return;
    }
    case 'directDamage': {
      const t = tryFig(c, op.targetId);
      if (t) dealDamage(c, t, op.amount, { direct: true, sourceId: op.sourceId, school: op.school });
      return;
    }
    case 'smoke':
      for (const k of op.sectors) S.battlefield.smoke.push({ sector: k, until: op.until, source: op.sourceId });
      c.events.push({ type: 'smoke', sectors: op.sectors, added: true });
      log(c, 'system', `Fumaça cobre ${op.sectors.join(' e ')}.`);
      return;
    case 'summon': {
      for (let i = 0; i < op.count; i++) spawnEnemy(c, op.typeId, undefined, op.reason);
      return;
    }
    case 'finishAttack':
      finishHeroAttack(c, op.attack, op.roll, op.choices);
      return;
    case 'step': {
      const f = tryFig(c, op.figureId);
      if (!f || !isActive(f)) return;
      const dests = stepDestinations(c, f, op.steps, op.ignoreEngagement).filter((k) => leaveEngagementCost(c, f, k, op.ignoreEngagement) <= (f.ap ?? 0));
      if (!dests.length) {
        log(c, 'move', `${f.name}: nenhum destino legal para o Passo.`);
        return;
      }
      S.pending = { id: newId(c, 'p'), controllers: [f.id], kind: 'step', figureId: f.id, steps: op.steps, ignoreEngagement: op.ignoreEngagement, destinations: dests, reason: op.reason };
      return;
    }
    case 'call': {
      const h = reg().handlers[op.fn];
      if (h) h(c, op.args);
      return;
    }
  }
}

// ============================================================================ queries for UI / AI
export function ctxOf(S: CombatState): Ctx {
  return { S, events: [] };
}
export function pendingControllers(p: Pending | null): string[] {
  return p ? p.controllers : [];
}
export function intentFor(S: CombatState, typeId: string) {
  return revealedIntent({ S } as Ctx, typeId);
}
export function figureAt(S: CombatState, k: SectorKey) {
  return S.figures.filter((f) => f.sector === k && f.status !== 'dead' && f.status !== 'reserve');
}

export { sk, parseSector, forcedMove };
export type { SigilEntry };
