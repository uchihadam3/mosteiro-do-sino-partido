/**
 * Mosteiro do Sino Partido — V2 core types.
 * Source of truth: REGRA MESTRA V2 PASS 14. Terminology follows §4.
 * This package is PURE: no DOM, no Three.js, no React.
 */

export type Attr =
  | 'poder'
  | 'guarda'
  | 'agilidade'
  | 'precisao'
  | 'arcano'
  | 'determinacao'
  | 'espirito'
  | 'sombra';

export const ATTRS: Attr[] = ['poder', 'guarda', 'agilidade', 'precisao', 'arcano', 'determinacao', 'espirito', 'sombra'];

/** Grau de Dado (§11). */
export type Grade = 4 | 6 | 8 | 10 | 12;
export const GRADES: Grade[] = [4, 6, 8, 10, 12];

export type Side = 'H' | 'E';
export type Row = 'F' | 'R';
export type Col = 1 | 2 | 3 | 4 | 5;
/** Sector key, e.g. "H:F3" or "E:R1". */
export type SectorKey = `${Side}:${Row}${Col}`;

export type Tempo = 'rapido' | 'tatico' | 'pesado';
export const TEMPOS: Tempo[] = ['rapido', 'tatico', 'pesado'];

/** Attack categories (§8). */
export type AttackCat = 'cac' | 'alcance' | 'distancia' | 'global';

export type ConditionId =
  | 'veneno'
  | 'sangramento'
  | 'queimando'
  | 'quebrado'
  | 'exposto'
  | 'imobilizado'
  | 'atordoado'
  | 'guardado'
  | 'furtivo'
  | 'julgado'
  | 'semReacoes'
  | 'bencao'
  | 'ancorado'
  | 'armaduraExtra'
  | 'escamasNegras';

export interface Conditions {
  veneno: number; // max 3
  sangramento: number; // max 2
  queimando: boolean;
  quebrado: boolean;
  exposto: boolean;
  imobilizado: boolean;
  atordoado: boolean;
  guardado: boolean;
  furtivo: boolean;
  /** Paladin mark (enemy). Stores paladin figure id. */
  julgadoPor: string | null;
  /** Rogue Brechas on this figure (enemy). */
  brechas: number;
  /** Turiferário "Nuvem Cega": cannot use Reactions until start of next Activation. */
  semReacoes: boolean;
  /** Clérigo Bênção da Vigília marker. */
  bencao: boolean;
  /** Bastião de Ferro anchor. */
  ancorado: boolean;
  ancoradoUsado: boolean;
  /** Relicário "Fechar a Carapaça": +N armor until next Activation. */
  armaduraExtra: number;
  /** Couro de Escamas Negras active. */
  escamasNegras: boolean;
  /** Unguento: cannot receive Queimando until end of Cycle. */
  imuneQueimando: boolean;
  /** Escudeiro Fincar Posição: ignores next push/pull. */
  ignoraEmpurrao: boolean;
}

export type FigureStatus = 'active' | 'caido' | 'derrotado' | 'dead' | 'reserve';

export interface Counters {
  /** Reset at the start of each of this figure's Activations. */
  activation: Record<string, number>;
  /** Reset at the start of each Cycle. */
  cycle: Record<string, number>;
  /** Persist for the whole Combat. */
  combat: Record<string, number>;
}

export type RuneId = 'ruina' | 'vinculo' | 'transposicao' | 'raio' | 'explosao' | 'sigilo';
export const RUNE_INTENTS: RuneId[] = ['ruina', 'vinculo', 'transposicao'];
export const RUNE_FORMS: RuneId[] = ['raio', 'explosao', 'sigilo'];

export type Verse = 'misericordia' | 'vigilia' | 'julgamento';

export interface ClassResources {
  // Guerreiro
  sequencia: 0 | 1 | 2;
  seqAdvanced: boolean;
  // Paladino
  conviccao: number;
  julgadoId: string | null;
  // Arcanista
  runes: Record<RuneId, boolean>; // true = Pronta
  instabilidade: number;
  // Clérigo
  liturgia: Verse[];
  // Arqueiro
  mira: number;
  // Ladino (Brechas live on targets)
}

export interface Figure {
  id: string;
  side: Side;
  /** Content id: hero class id or enemy type id. */
  typeId: string;
  name: string;
  sector: SectorKey;
  status: FigureStatus;
  hp: number;
  /** Max HP at combat start (already including Trauma reduction and item bonuses). */
  maxHp: number;
  armor: number;
  conditions: Conditions;
  counters: Counters;
  /** Order index for deterministic sorting. */
  order: number;
  isBoss: boolean;
  isMiniboss: boolean;
  profano: boolean;
  // ---- heroes only ----
  heroId?: string;
  tempo?: Tempo | null;
  acted?: boolean;
  ap?: number;
  reaction?: boolean;
  trauma?: number;
  attrs?: Record<Attr, Grade>;
  res?: ClassResources;
  equipment?: CombatEquipment;
  /** Backpack consumables (item ids with uid). */
  backpack?: ItemRef[];
  cantil?: number;
  ultimoFolego?: number;
  talents?: string[];
  /** Movement voluntarily performed during this activation (connections). */
  movedThisActivation?: number;
  /** Manto do Primeiro Caminho stance. */
  manto?: 'caminho' | 'refugio' | null;
  /** Whether hero took a step before the current attack (Espada do Contrapasso). */
  steppedThisActivation?: boolean;
  /** Uses limited to once per Dungeon (persisted to the campaign hero record). */
  dungeonUses?: Record<string, number>;
  // ---- enemies only ----
  reinforcementCycle?: number;
}

export interface ItemRef {
  uid: string;
  itemId: string;
}

export interface CombatEquipment {
  primary: ItemRef | null;
  secondary: ItemRef | null;
  armor: ItemRef | null;
  accessories: ItemRef[];
}

/** A rolled die. */
export interface DieRoll {
  grade: Grade;
  value: number;
  /** Original grade before upgrades (for log). */
  baseGrade: Grade;
  source: string;
  rerolled?: boolean;
}

export interface RollResult {
  dice: DieRoll[];
  successes: number;
  impulsos: number;
  critico: boolean;
}

export interface LogEntry {
  seq: number;
  cycle: number;
  kind:
    | 'system'
    | 'cycle'
    | 'intent'
    | 'tempo'
    | 'activation'
    | 'move'
    | 'attack'
    | 'defense'
    | 'damage'
    | 'heal'
    | 'condition'
    | 'resource'
    | 'death'
    | 'reinforcement'
    | 'objective'
    | 'secret'
    | 'boss'
    | 'item';
  text: string;
  data?: Record<string, unknown>;
}

/** Visual/audio domain events produced by the engine. The renderer consumes these; it never decides math. */
export type DomainEvent =
  | { type: 'cycleStart'; cycle: number }
  | { type: 'intentRevealed'; enemyType: string; intentId: string }
  | { type: 'bandStart'; band: Band }
  | { type: 'activationStart'; figureId: string }
  | { type: 'activationEnd'; figureId: string }
  | { type: 'move'; figureId: string; from: SectorKey; to: SectorKey; forced: boolean; teleport?: boolean }
  | { type: 'attackDeclared'; sourceId: string; targetIds: string[]; cat: AttackCat; name: string; school: VfxSchool }
  | { type: 'roll'; figureId: string; purpose: string; roll: RollResult }
  | { type: 'hit'; sourceId: string; targetId: string; damage: number; blocked: number; school: VfxSchool; critical: boolean }
  | { type: 'miss'; sourceId: string; targetId: string }
  | { type: 'damage'; targetId: string; amount: number; direct: boolean; school: VfxSchool }
  | { type: 'heal'; targetId: string; amount: number }
  | { type: 'condition'; targetId: string; condition: ConditionId; added: boolean }
  | { type: 'guardUsed'; targetId: string }
  | { type: 'armorAbsorb'; targetId: string; amount: number }
  | { type: 'fall'; figureId: string }
  | { type: 'rise'; figureId: string }
  | { type: 'death'; figureId: string }
  | { type: 'spawn'; figureId: string }
  | { type: 'smoke'; sectors: SectorKey[]; added: boolean }
  | { type: 'sigil'; sector: SectorKey; kind: string; added: boolean }
  | { type: 'resource'; figureId: string; resource: string; value: number }
  | { type: 'boss'; figureId: string; what: string; value?: number }
  | { type: 'objective'; objectiveId: string; success: boolean }
  | { type: 'secret'; code: string }
  | { type: 'victory' }
  | { type: 'defeat' };

export type VfxSchool = 'metal' | 'blunt' | 'flesh' | 'arcane' | 'holy' | 'profane' | 'fire' | 'arrow' | 'bolt' | 'shadow' | 'bell' | 'poison' | 'blood' | 'none';

/** Bands of the Cycle (§6 Ordem do Ciclo). */
export type Band = 'HR' | 'ER' | 'HT' | 'ET' | 'HP' | 'EP' | 'END';
export const BANDS: Band[] = ['HR', 'ER', 'HT', 'ET', 'HP', 'EP', 'END'];
export function bandTempo(b: Band): Tempo | null {
  if (b === 'HR' || b === 'ER') return 'rapido';
  if (b === 'HT' || b === 'ET') return 'tatico';
  if (b === 'HP' || b === 'EP') return 'pesado';
  return null;
}
export function bandSide(b: Band): Side | null {
  if (b === 'END') return null;
  return b[0] === 'H' ? 'H' : 'E';
}
