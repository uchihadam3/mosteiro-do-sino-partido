import type {
  AttackCat,
  Attr,
  Band,
  ConditionId,
  Conditions,
  Counters,
  DomainEvent,
  Figure,
  Grade,
  LogEntry,
  RollResult,
  SectorKey,
  Tempo,
  VfxSchool,
} from './types';
import type { RngState } from './rng';
import type { DieSpec } from './dice';

export function emptyConditions(): Conditions {
  return {
    veneno: 0,
    sangramento: 0,
    queimando: false,
    quebrado: false,
    exposto: false,
    imobilizado: false,
    atordoado: false,
    guardado: false,
    furtivo: false,
    julgadoPor: null,
    brechas: 0,
    semReacoes: false,
    bencao: false,
    ancorado: false,
    ancoradoUsado: false,
    armaduraExtra: 0,
    escamasNegras: false,
    imuneQueimando: false,
    ignoraEmpurrao: false,
  };
}
export function emptyCounters(): Counters {
  return { activation: {}, cycle: {}, combat: {} };
}

export interface EnemyTypeState {
  typeId: string;
  deck: number[]; // remaining intent indices, top = index 0
  drawnCount: number;
  revealed: string | null; // intent id
  /** Intent ids revealed this cycle that are "obligatory" substitutions. */
  obligatory: boolean;
}

export interface SmokeEntry {
  sector: SectorKey;
  until: { kind: 'endOfCycle' } | { kind: 'activationStart'; figureId: string };
  source: string;
}

export interface SigilEntry {
  id: string;
  ownerId: string;
  kind: 'detonacao' | 'estase' | 'portalA' | 'portalB';
  pair?: string;
  sector: SectorKey;
}

export interface Battlefield {
  /** Static Cobertura sectors defined by the Campo de Batalha. */
  cover: SectorKey[];
  smoke: SmokeEntry[];
  sigils: SigilEntry[];
  /** Solo Consagrado areas. */
  consecrated: { ownerId: string; sectors: SectorKey[]; used: string[] }[];
  /** Fio de Tropeço traps etc. */
  traps: { ownerId: string; sector: SectorKey; kind: string }[];
  reinforcementEntries: SectorKey[];
}

export interface ReinforcementWave {
  atEndOfCycle: number;
  enemies: { typeId: string; sector?: SectorKey }[];
  done: boolean;
}

export interface ObjectiveState {
  id: string;
  /** Cycle of last attempt by the party (one attempt per Cycle when applicable). */
  lastAttemptCycle: number;
  uses: number;
  done: boolean;
  data: Record<string, number | boolean | string>;
}

export interface BossState {
  ressonancia: number;
  terceiraPreparada: boolean;
  convocacoes: number;
  contrapesos: { id: string; used: boolean; lastFailCycle: number }[];
  manivelaUsada: boolean;
  silencioUsado: boolean;
  canto: number;
  ultimaBadaladaPendente: boolean;
  cavaleiroGuarda: 'fechada' | 'aberta';
  vigiaMarcados: string[]; // hero ids that chose the same Tempo as Vigia's intent this cycle
  vigiaGuardado: boolean;
  fase2: Record<string, boolean>;
  exposedByRes: boolean;
}

// ---------------------------------------------------------------------------
// Attack / defense specs (serializable)
// ---------------------------------------------------------------------------
export interface AttackSpec {
  key: string;
  sourceId: string;
  targetId: string;
  /** Additional targets resolved with the same roll (Área). */
  extraTargets: string[];
  techId: string;
  name: string;
  cat: AttackCat;
  dice: DieSpec[];
  dano: number;
  bonusDano: number;
  radiante: boolean;
  school: VfxSchool;
  ignoreArmor: number;
  ignoreCover: boolean;
  /** true when this is a weapon attack (Óleo de Afiação, weapon signatures). */
  weapon: boolean;
  weaponItemId: string | null;
  spell: boolean;
  /** Teste de Controle rather than damage attack. */
  control: boolean;
  extraSuccesses: number;
  /** Was the attacker Furtivo when declared. */
  furtivoAtDeclare: boolean;
  /** Target had at least one Brecha at declaration. */
  targetHadBrecha: boolean;
  /** Target already Exposto/Quebrado/Julgado before attack. */
  targetWasExposto: boolean;
  targetWasQuebrado: boolean;
  targetWasJulgado: boolean;
  /** Free-form technique data. */
  data: Record<string, number | boolean | string>;
  /** Pre-roll choices applied (pesado, tonico, oleo, ...). */
  pre: string[];
}

export interface AttackOption {
  id: string;
  label: string;
  source: string;
  cost: { impulso?: number; mira?: number; conviccao?: number; brecha?: number };
  /** Only meaningful if the attack hits. */
  requiresHit?: boolean;
  /** Options sharing an exclusive group are mutually exclusive. */
  group?: string;
  /** Applies only to one specific target (área). */
  description?: string;
}

export interface AttackOutcome {
  hit: boolean;
  /** Per target damage results. */
  results: { targetId: string; raw: number; armor: number; final: number; killed: boolean; reducedByCover: boolean }[];
  spent: string[];
  /** Effects to apply on the main target after damage. */
  addDano: number;
  addIgnoreArmor: number;
  ignoreCover: boolean;
  radiante: boolean;
  noConviccaoGain: boolean;
}

export interface EnemyAttackSpec {
  key: string;
  sourceId: string;
  targetIds: string[];
  name: string;
  intentId: string;
  dano: number;
  def: Attr;
  cat: AttackCat;
  ignoreCover: boolean;
  ignoreArmor: number;
  school: VfxSchool;
  /** Effects applied when Dano final >= 1. */
  onDamage: EffectSpec[];
  /** Effects applied when the Defesa produced 0 Successes. */
  onZero: EffectSpec[];
  /** Effects applied to the target after the attack resolves regardless. */
  after: EffectSpec[];
  /** Per-target Dano overrides (Vigia strengthened, passives). */
  perTargetBonus: Record<string, number>;
  direct: boolean;
  data: Record<string, number | boolean | string>;
}

export type EffectSpec =
  | { kind: 'cond'; cond: ConditionId; n?: number }
  | { kind: 'push' }
  | { kind: 'pull' }
  | { kind: 'directDamage'; n: number };

export interface DefenseState {
  attack: EnemyAttackSpec;
  targetId: string;
  dice: DieSpec[];
  reactionsUsed: { heroId: string; kind: string }[];
  roll?: RollResult;
}

// ---------------------------------------------------------------------------
// Ops — the interpreter's work queue. Everything serializable.
// ---------------------------------------------------------------------------
export type Op =
  | { op: 'enemyActivate'; id: string }
  | { op: 'enemyPlan'; id: string }
  | { op: 'enemyEnd'; id: string }
  | { op: 'move'; id: string; path: SectorKey[]; forced: boolean; voluntary: boolean; canLeaveEngagement: boolean; stopOnEngage: boolean; teleport?: boolean }
  | { op: 'eAttack'; spec: EnemyAttackSpec }
  | { op: 'defend'; spec: EnemyAttackSpec; targetId: string }
  | { op: 'defendResolve'; d: DefenseState }
  | { op: 'effect'; targetId: string; effect: EffectSpec; sourceId: string; viaCondition?: boolean }
  | { op: 'guard'; targetIds: string[]; sourceId: string }
  | { op: 'heal'; targetId: string; amount: number; sourceId: string }
  | { op: 'directDamage'; targetId: string; amount: number; sourceId: string; school: VfxSchool }
  | { op: 'smoke'; sectors: SectorKey[]; until: SmokeEntry['until']; sourceId: string }
  | { op: 'summon'; typeId: string; count: number; sourceId: string; reason: string }
  | { op: 'afterIntent'; figureId: string; intentId: string; typeId: string }
  | { op: 'finishAttack'; attack: AttackSpec; roll: RollResult; choices: string[] }
  | { op: 'step'; figureId: string; steps: number; ignoreEngagement: boolean; reason: string; passThroughEnemies?: boolean }
  | { op: 'call'; fn: string; args: Record<string, unknown> }
  | { op: 'log'; text: string; kind?: LogEntry['kind'] }
  | { op: 'checkEnd' };

// ---------------------------------------------------------------------------
// Pending decisions (player input required)
// ---------------------------------------------------------------------------
export interface PendingBase {
  id: string;
  /** Figure ids whose controller may answer (empty = any / host). */
  controllers: string[];
}
export type Pending = PendingBase &
  (
    | { kind: 'attackPost'; attack: AttackSpec; roll: RollResult; options: AttackOption[]; canReroll: boolean }
    | { kind: 'defense'; d: DefenseState; options: { heroId: string; kind: string; label: string; addDie?: Grade }[]; preview: { dano: number; armor: number; cover: boolean; guard: boolean } }
    | { kind: 'egide'; d: DefenseState; damage: number; paladins: string[] }
    | { kind: 'conditionResponse'; targetId: string; effect: EffectSpec; sourceId: string; options: { heroId: string; kind: string; label: string }[] }
    | { kind: 'step'; figureId: string; steps: number; ignoreEngagement: boolean; destinations: SectorKey[]; reason: string; passThroughEnemies?: boolean }
    | { kind: 'tieBreak'; enemyId: string; candidates: string[]; reason: string }
    | { kind: 'choice'; prompt: string; figureId: string; handler: string; options: { id: string; label: string; detail?: string }[]; args: Record<string, unknown> }
    | { kind: 'allocate'; prompt: string; figureId: string; handler: string; total: number; maxPer: number; targets: string[]; args: Record<string, unknown> }
    | { kind: 'silencio'; figureId: string }
  );

export interface CombatSettings {
  autoTieBreak: boolean;
}

export interface CombatContextFlags {
  /** Campaign state cards relevant to this combat. */
  hasManivela: boolean;
  hasSilencio: boolean;
  guardaInicial: 'fechada' | 'aberta';
  /** Severin limits (cumulative summons) etc. */
  encounterRules: string[];
}

export interface CombatState {
  v: 1;
  encounterId: string;
  partySize: number;
  cycle: number;
  band: Band;
  phase: 'deploy' | 'tempo' | 'heroBand' | 'heroActing' | 'enemyBand' | 'ended';
  result: 'victory' | 'defeat' | null;
  figures: Figure[];
  activeId: string | null;
  enemyTypes: Record<string, EnemyTypeState>;
  typeOrder: string[];
  battlefield: Battlefield;
  objectives: Record<string, ObjectiveState>;
  reinforcements: ReinforcementWave[];
  enemyCap: number;
  queue: Op[];
  enemyActQueue: string[];
  pending: Pending | null;
  tieChoices: Record<string, string>;
  /** Flags earned during combat that the campaign reads (e.g. passagemDecifrada). */
  flags: Record<string, boolean | number | string>;
  boss: BossState;
  ctx: CombatContextFlags;
  rng: RngState;
  log: LogEntry[];
  logSeq: number;
  nextId: number;
  settings: CombatSettings;
  /** For deterministic hashing / desync detection. */
  commandCount: number;
}

export interface Ctx {
  S: CombatState;
  events: DomainEvent[];
}

export function tempoAp(t: Tempo): number {
  return t === 'rapido' ? 2 : 3;
}

export type { Grade };
