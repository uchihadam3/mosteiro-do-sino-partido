/**
 * Content contracts. Content packages (classes, items, enemies, dungeons) implement these;
 * the engine consumes them through an injected Registry so new Dungeons plug in by data
 * without changing the engine (Fase 6).
 */
import type { AttackCat, Attr, Figure, Grade, RollResult, SectorKey, Tempo } from './types';
import type { AttackOption, AttackOutcome, AttackSpec, Ctx, DefenseState, EnemyAttackSpec } from './state';

export type Status = 'CANONICO' | 'PLAYTEST' | 'WATCH' | 'ABERTO' | 'HIPOTESE';

export interface SourceRef {
  /** Section of the master document, e.g. "§18.1" or "D1 GAL-800". */
  section: string;
  status: Status;
  note?: string;
}

export interface ReactionOption {
  heroId: string;
  kind: string;
  label: string;
  addDie?: Grade;
}

export interface Hooks {
  onCombatStart?(c: Ctx, f: Figure): void;
  onActivationStart?(c: Ctx, f: Figure): void;
  onActivationEnd?(c: Ctx, f: Figure): void;
  onCycleStart?(c: Ctx, f: Figure): void;
  /** Attacker-side pre-roll modification. */
  preAttack?(c: Ctx, f: Figure, a: AttackSpec): void;
  /** Post-roll spend options (Impulso, Mira, Convicção, Brecha). */
  attackOptions?(c: Ctx, f: Figure, a: AttackSpec, r: RollResult): AttackOption[];
  /** Called during resolution BEFORE damage for each chosen option belonging to this source. */
  applyAttackOption?(c: Ctx, f: Figure, a: AttackSpec, r: RollResult, optId: string, out: AttackOutcome): void;
  /** Called after damage for chosen options (effects like Quebrado "depois do Dano"). */
  afterAttackOption?(c: Ctx, f: Figure, a: AttackSpec, r: RollResult, optId: string, out: AttackOutcome): void;
  /** Always called after the attacker's attack resolves. */
  afterAttack?(c: Ctx, f: Figure, a: AttackSpec, r: RollResult, out: AttackOutcome): void;
  /** Defender-side dice modification before rolling Defesa. */
  preDefense?(c: Ctx, f: Figure, d: DefenseState): void;
  /** Reactions this figure can offer for defender d (including itself). */
  defenseReactions?(c: Ctx, reactor: Figure, d: DefenseState): ReactionOption[];
  applyReaction?(c: Ctx, reactor: Figure, d: DefenseState, kind: string): void;
  /** After a Defesa resolved against an enemy attack. */
  afterDefense?(c: Ctx, f: Figure, d: DefenseState, final: number): void;
  /** Reduce final damage of an enemy attack (armors like Couraça do Veterano). Return reduction. */
  reduceEnemyDamage?(c: Ctx, f: Figure, d: DefenseState, current: number): number;
  onDamaged?(c: Ctx, f: Figure, amount: number, info: { direct: boolean; sourceId: string | null }): void;
  onMoved?(c: Ctx, f: Figure, info: { from: SectorKey; to: SectorKey; voluntary: boolean; kind: string; connections: number }): void;
  onEnemyDefeated?(c: Ctx, f: Figure, enemy: Figure, info: { byAttack: AttackSpec | null }): void;
  /** Static: does this figure currently have Cobertura from this source? */
  grantsCover?(c: Ctx, owner: Figure, target: Figure): boolean;
  /** Max HP modifier (armors). */
  maxHpBonus?: number;
  /** Rapid Tempo free Passo suppressed (Cota Rebitada, Placas). */
  noRapidStep?: boolean;
  /** Cost modifier for first Reposicionar (Placas de Campanha). */
  repositionExtraCostFirst?: number;
  /** When a heal technique of this figure restores HP. */
  onHealOther?(c: Ctx, f: Figure, target: Figure, amount: number): number; // returns bonus
  onGuardConsumed?(c: Ctx, f: Figure, reduced: number): number; // returns extra reduction
  onCantil?(c: Ctx, f: Figure): void;
}

export type TargetSpec =
  | { type: 'none' }
  | { type: 'enemy'; reach: 'weapon' | AttackCat; adjacentOnly?: boolean }
  | { type: 'ally'; range: 'self' | 'adjacent' | 'support' | 'any' | 'selfOrAdjacent' | 'supportOrSelf'; allowSelf?: boolean; allowCaido?: boolean }
  | { type: 'area2'; side: 'E' | 'H'; reach?: AttackCat }
  | { type: 'sector'; side: 'E' | 'H'; filter?: 'support' | 'any' | 'emptyOrRoom' }
  | { type: 'sectors2'; side: 'H' | 'E' }
  | { type: 'move'; steps: number; ignoreEngagement: boolean };

export interface ActionCmd {
  actionId: string;
  figureId: string;
  targetIds?: string[];
  sector?: SectorKey;
  sectors?: SectorKey[];
  /** Pre-roll toggles (pesado, tonico:<uid>, oleo:<uid>, lente, ...). */
  pre?: string[];
  /** Free-form option (e.g. 'cure2'|'cure4', rune choice). */
  option?: string;
}

export interface ActionDef {
  id: string;
  name: string;
  ap: number;
  kind: 'attack' | 'spell' | 'support' | 'move' | 'control' | 'utility';
  text: string;
  tier?: 'I' | 'II' | 'III';
  /** Shown in UI; icon id from the icon set. */
  icon?: string;
  source: SourceRef;
  targeting: TargetSpec;
  /** Extra AP (e.g. leaving Engagement) is computed by the engine for movement. */
  /** Return null if usable, or a PT-BR reason string. */
  available?(c: Ctx, f: Figure): string | null;
  /** Validate concrete targets; return reason or null. */
  validate?(c: Ctx, f: Figure, cmd: ActionCmd): string | null;
  /** Dynamic AP cost (e.g. Contrapeso 1/2 AP by party size). */
  apCost?(c: Ctx, f: Figure, cmd?: ActionCmd): number;
  execute(c: Ctx, f: Figure, cmd: ActionCmd): void;
  /** For attacks: preview dice (attrs) & dano for UI. */
  preview?(c: Ctx, f: Figure): { dice?: Attr[]; dano?: number; cat?: AttackCat };
  /** Called by the attack pipeline after resolution (technique-specific effects). */
  onResolve?(c: Ctx, f: Figure, a: AttackSpec, r: RollResult, out: AttackOutcome): void;
  attackOptions?(c: Ctx, f: Figure, a: AttackSpec, r: RollResult): AttackOption[];
  applyAttackOption?(c: Ctx, f: Figure, a: AttackSpec, r: RollResult, optId: string, out: AttackOutcome): void;
  afterAttackOption?(c: Ctx, f: Figure, a: AttackSpec, r: RollResult, optId: string, out: AttackOutcome): void;
  /** Hidden from action bar (e.g. talents not owned). */
  hidden?(c: Ctx, f: Figure): boolean;
  limit?: 'activation' | 'cycle' | 'combat' | 'dungeon';
  /** Sub-options the UI must present (e.g. Canalizar: which Runa; Imposição: cura 2 / cura 4). */
  options?(c: Ctx, f: Figure): { id: string; label: string; disabled?: string | null }[];
}

export interface TalentDef extends Hooks {
  id: string;
  classId: string;
  path: string;
  tier: 1 | 2 | 3 | 4;
  name: string;
  text: string;
  source: SourceRef;
  /** Implemented in engine? false = shown but marked as pending implementation. */
  implemented: boolean;
  actions?: ActionDef[];
}

export interface ClassDef extends Hooks {
  id: string;
  name: string;
  epithet: string;
  hp: number;
  armor: number;
  attrs: Record<Attr, Grade>;
  proficiencies: string[];
  startingItems: string[];
  resourceName: string;
  description: string;
  passives: { name: string; text: string }[];
  actions: ActionDef[];
  talentPaths: { id: string; name: string }[];
  source: SourceRef;
  accent: string;
}

export type ItemSlot = 'weapon' | 'armor' | 'accessory' | 'consumable';
export type Rarity = 'inicial' | 'comum' | 'raro' | 'epico';

export interface ItemDef extends Hooks {
  id: string;
  name: string;
  slot: ItemSlot;
  rarity: Rarity;
  text: string;
  source: SourceRef;
  icon: string;
  // weapons/foci
  proficiency?: string[];
  dice?: [Attr, Attr];
  dano?: number;
  cat?: AttackCat;
  focus?: boolean;
  bow?: { faixas: ('proxima' | 'media' | 'longa')[]; ideal: 'proxima' | 'media' | 'longa'; noAdjacent?: boolean };
  // armor
  armor?: number;
  weight?: 'leve' | 'media' | 'pesada' | 'veste';
  // consumable
  price?: number;
  consumable?: ConsumableDef;
  /** Arena value etc. (future). */
  arenaValue?: number;
  /** Starting class item (sell value 0). */
  classId?: string;
  implemented: boolean;
}

export interface ConsumableDef {
  timing: 'ap1' | 'free-pre-attack' | 'free-pre-roll' | 'reactive';
  targeting: TargetSpec;
  outOfCombat?: boolean;
  execute?(c: Ctx, f: Figure, cmd: ActionCmd): void;
}

export interface IntentDef {
  id: string;
  name: string;
  tempo: Tempo;
  text: string;
  tags?: ('SINO' | 'NOTA')[];
  guard?: 'fechada' | 'aberta';
  /** Icon hint for UI: attack type. */
  kind: 'melee' | 'ranged' | 'area' | 'buff' | 'move' | 'summon' | 'control' | 'heal';
  dano?: number;
  def?: Attr;
  /** Enqueue ops for this enemy's Activation. */
  plan(c: Ctx, self: Figure): void;
}

export interface EnemyDef {
  id: string;
  name: string;
  tier: 'comum' | 'raro' | 'elite' | 'especial' | 'miniboss' | 'boss';
  tierLabel: string;
  hp: number | [number, number, number, number, number];
  armor: number;
  profano: boolean;
  boss?: boolean;
  miniboss?: boolean;
  passives: { name: string; text: string }[];
  intents: IntentDef[];
  obligatory?: IntentDef[];
  source: SourceRef;
  /** Preferred deployment row. */
  prefers: 'F' | 'R';
  /** Visual prefab id. */
  prefab: string;
  scale?: number;
  lore?: string;
  onCombatStart?(c: Ctx, f: Figure): void;
  /** Called when this type's intent is revealed (boss guards etc). */
  onReveal?(c: Ctx, typeId: string, intent: IntentDef): void;
  /** Return bonus Dano when this enemy attacks hero target. */
  damageBonus?(c: Ctx, self: Figure, target: Figure, spec: EnemyAttackSpec): number;
  onDamaged?(c: Ctx, self: Figure, amount: number): void;
}

export interface Registry {
  classes: Record<string, ClassDef>;
  items: Record<string, ItemDef>;
  enemies: Record<string, EnemyDef>;
  talents: Record<string, TalentDef>;
  /** Named continuation handlers used by 'call' ops and 'choice' pendings. */
  handlers: Record<string, (c: Ctx, args: Record<string, unknown>) => void>;
  /** Universal actions available to every hero (Reposicionar, Levantar, ...). */
  universalActions: ActionDef[];
  /** Encounter-specific objective actions. */
  objectiveActions: Record<string, ActionDef>;
  /** Hooks applied to every hero (pre-roll consumables etc). */
  globalHeroHooks?: Hooks[];
}

let REGISTRY: Registry | null = null;
export function setRegistry(r: Registry) {
  REGISTRY = r;
}
export function reg(): Registry {
  if (!REGISTRY) throw new Error('Registry not initialised — call setRegistry(content) first');
  return REGISTRY;
}
