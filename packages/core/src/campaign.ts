/**
 * Campaign layer (§28–§32, §37, §50, §59, §61). Pure reducer over a serializable CampaignState.
 * Dungeons plug in through DungeonDef (data + small flow functions) — the engine never hardcodes a Dungeon.
 */
import type { Attr, Figure, Grade, ItemRef, SectorKey } from './types';
import type { CombatState } from './state';
import { emptyConditions, emptyCounters } from './state';
import { createRng, shuffle, type RngState } from './rng';
import { reg } from './registry';
import { createCombat, dispatch as combatDispatch, type Command as CombatCommand } from './engine';
import { raiseGrade } from './dice';

export const SCHEMA_VERSION = 1;

// ============================================================================ dungeon contract
export interface LocationDef {
  id: string;
  code: string;
  name: string;
  /** Public locations appear on the map from the start (unexplored); secret ones only after reveal. */
  public: boolean;
  map: { x: number; y: number };
  scene: string;
  ambience: string;
  arrival: string;
  source: string;
}

export interface EncounterDef {
  id: string;
  code: string;
  name: string;
  locationId: string;
  kind: 'obrigatorio' | 'rota' | 'raro' | 'opcional' | 'secreto' | 'miniboss' | 'boss';
  /** compositions[partySize-1] = list of enemy type ids. */
  compositions: string[][];
  /** reinforcements[partySize-1] = waves. */
  reinforcements?: { atEndOfCycle: number; enemies: string[] }[][];
  cover: SectorKey[];
  entries: SectorKey[];
  objectives?: string[];
  enemyCap?: number;
  rewards: {
    comum?: number;
    raro?: number;
    consumivel?: number;
    gold: number[];
    states?: string[];
    epic?: string[];
  };
  intro: string;
  outro?: string;
  music: string;
  source: string;
  /** Explicit placements override the automatic layout (by party size). */
  placements?: (SectorKey | undefined)[][];
}

export interface ExploreOption {
  id: string;
  label: string;
  detail?: string;
  kind: 'combat' | 'travel' | 'narrative' | 'finish';
  locationId?: string;
  encounterId?: string;
  /** Closes optional opportunities (Salão). */
  warning?: string;
  icon?: string;
}

export interface ArchiveEntry {
  code: string;
  title: string;
  text: string;
  source: string;
}

export interface DungeonDef {
  id: string;
  number: number;
  name: string;
  subtitle: string;
  canonical: boolean;
  /** Hidden test dungeons never appear in the campaign UI. */
  hidden?: boolean;
  modes: ('basico' | 'avancado')[];
  locations: LocationDef[];
  encounters: EncounterDef[];
  archive: Record<string, ArchiveEntry>;
  startNode: string;
  stateCards: Record<string, { name: string; text: string; icon: string; secretLine?: string }>;
  /** Options available at the current node. */
  options(s: CampaignState): ExploreOption[];
  /** Apply a non-combat option or set up the next node. Return encounter to start, if any. */
  choose(s: CampaignState, optionId: string): { encounterId?: string; narrative?: string; archive?: string } | void;
  /** Called after a victory, before rewards. */
  onVictory(s: CampaignState, enc: EncounterDef, combat: CombatState): void;
  /** Called after rewards are collected. */
  afterRewards(s: CampaignState, enc: EncounterDef): void;
  /** Combat context flags (Manivela, Silêncio, Guarda inicial). */
  combatContext(s: CampaignState, enc: EncounterDef): Partial<CombatState['ctx']>;
  epilogue(s: CampaignState): { code: string; title: string; text: string };
}

let DUNGEONS: Record<string, DungeonDef> = {};
export function registerDungeon(d: DungeonDef) {
  DUNGEONS[d.id] = d;
}
export function dungeons(): DungeonDef[] {
  return Object.values(DUNGEONS);
}
export function dungeon(id: string): DungeonDef {
  const d = DUNGEONS[id];
  if (!d) throw new Error(`dungeon ${id} not registered`);
  return d;
}
export function clearDungeons() {
  DUNGEONS = {};
}

// ============================================================================ campaign state
export interface HeroRecord {
  id: string;
  name: string;
  classId: string;
  attrs: Record<Attr, Grade>;
  hp: number;
  trauma: number;
  status: 'ok' | 'caido' | 'derrotado';
  equipment: { primary: ItemRef | null; secondary: ItemRef | null; armor: ItemRef | null; accessories: (ItemRef | null)[] };
  backpack: ItemRef[];
  cantil: number;
  cantilMax: number;
  ultimoFolego: number;
  talents: string[];
  talentPoints: number;
  masteryPoints: number;
  dungeonUses: Record<string, number>;
  /** Player seat controlling this hero (local hot-seat / online). */
  seat: string;
}

export type CampaignPhase = 'prep' | 'explore' | 'combat' | 'reward' | 'epilogue' | 'base' | 'gameover' | 'complete';

export interface RewardState {
  encounterId: string;
  title: string;
  gold: number;
  items: ItemRef[];
  states: string[];
  /** Items not yet assigned (uid). */
  unassigned: string[];
}

export interface CampaignState {
  schemaVersion: number;
  id: string;
  createdAt: number;
  updatedAt: number;
  seed: string;
  mode: 'basico';
  dungeonId: string;
  partySizeOriginal: number;
  heroes: HeroRecord[];
  formation: Record<string, SectorKey>;
  gold: number;
  armazem: ItemRef[];
  usados: string[];
  decks: { comum: string[]; raro: string[]; consumivel: string[] };
  removed: string[];
  dungeonsCompleted: number;
  phase: CampaignPhase;
  node: string;
  flags: Record<string, boolean | string | number>;
  revealed: string[];
  visited: string[];
  completed: string[];
  combat: CombatState | null;
  combatEncounterId: string | null;
  reward: RewardState | null;
  archiveRead: string[];
  /** Archive entry the UI must show now (modal). */
  pendingArchive: string | null;
  narrative: string | null;
  base: BaseState | null;
  log: { t: number; text: string }[];
  rng: RngState;
  nextUid: number;
  seats: { id: string; name: string }[];
  settings: { autoTieBreak: boolean };
  gameOverReason: string | null;
  epilogue: { code: string; title: string; text: string } | null;
}

export interface BaseState {
  visit: number;
  vitrine: { comum: string[]; raro: string[] };
  consumables: string[];
  servicesUsed: Record<string, number>;
  reserva: string | null;
  restored: boolean;
}

// ============================================================================ helpers
export function uid(s: CampaignState, itemId: string): ItemRef {
  s.nextUid++;
  return { uid: `i${s.nextUid}`, itemId };
}
export function clog(s: CampaignState, text: string) {
  s.log.push({ t: s.log.length, text });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}
export function backpackCapacity(partySize: number): number {
  return partySize <= 1 ? 7 : partySize === 2 ? 5 : 4;
}
/** Loot scaling by ORIGINAL party size (§30). */
export function lootCount(kind: 'comum' | 'raro' | 'consumivel', partySize: number): number {
  if (kind === 'comum') return partySize <= 2 ? 1 : partySize <= 4 ? 2 : 3;
  if (kind === 'raro') return partySize <= 3 ? 1 : 2;
  return partySize <= 1 ? 1 : partySize <= 3 ? 2 : 3;
}
export function recordMaxHp(h: HeroRecord): number {
  const cls = reg().classes[h.classId];
  let hp = cls.hp;
  const arm = h.equipment.armor ? reg().items[h.equipment.armor.itemId] : undefined;
  hp += arm?.maxHpBonus ?? 0;
  return Math.max(1, hp - 2 * h.trauma);
}
export function heroArmor(h: HeroRecord): number {
  const arm = h.equipment.armor ? reg().items[h.equipment.armor.itemId] : undefined;
  return arm?.armor ?? 0;
}

export function makeHero(s: CampaignState, classId: string, name: string, seat: string): HeroRecord {
  const cls = reg().classes[classId];
  const items = cls.startingItems.map((id) => uid(s, id));
  const weapons = items.filter((i) => reg().items[i.itemId].slot === 'weapon');
  const armor = items.find((i) => reg().items[i.itemId].slot === 'armor') ?? null;
  const h: HeroRecord = {
    id: `h${s.heroes.length + 1}`,
    name,
    classId,
    attrs: { ...cls.attrs },
    hp: cls.hp,
    trauma: 0,
    status: 'ok',
    equipment: { primary: weapons[0] ?? null, secondary: weapons[1] ?? null, armor, accessories: [null, null] },
    backpack: [],
    cantil: 2,
    cantilMax: 2,
    ultimoFolego: 0,
    talents: [],
    talentPoints: 0,
    masteryPoints: 0,
    dungeonUses: {},
    seat,
  };
  // remaining starting items go to the Armazém (do not occupy the Mochila)
  for (const w of weapons.slice(2)) s.armazem.push(w);
  h.hp = recordMaxHp(h);
  return h;
}

export interface NewCampaignInput {
  seed: string;
  heroes: { classId: string; name: string; seat?: string }[];
  dungeonId: string;
  seats?: { id: string; name: string }[];
  now?: number;
}

export function newCampaign(inp: NewCampaignInput): CampaignState {
  if (inp.heroes.length < 1 || inp.heroes.length > 5) throw new Error('A party tem de 1 a 5 heróis.');
  const rng = createRng(`campaign:${inp.seed}`);
  const pools = lootPools();
  const s: CampaignState = {
    schemaVersion: SCHEMA_VERSION,
    id: `c-${inp.seed}`,
    createdAt: inp.now ?? 0,
    updatedAt: inp.now ?? 0,
    seed: inp.seed,
    mode: 'basico',
    dungeonId: inp.dungeonId,
    partySizeOriginal: inp.heroes.length,
    heroes: [],
    formation: {},
    gold: 0,
    armazem: [],
    usados: [],
    decks: { comum: shuffle(rng, pools.comum), raro: shuffle(rng, pools.raro), consumivel: shuffle(rng, pools.consumivel) },
    removed: [],
    dungeonsCompleted: 0,
    phase: 'prep',
    node: '',
    flags: {},
    revealed: [],
    visited: [],
    completed: [],
    combat: null,
    combatEncounterId: null,
    reward: null,
    archiveRead: [],
    pendingArchive: null,
    narrative: null,
    base: null,
    log: [],
    rng,
    nextUid: 0,
    seats: inp.seats ?? [{ id: 'local', name: 'Jogador' }],
    settings: { autoTieBreak: false },
    gameOverReason: null,
    epilogue: null,
  };
  for (const h of inp.heroes) s.heroes.push(makeHero(s, h.classId, h.name, h.seat ?? s.seats[0].id));
  if (s.heroes.length === 1) s.heroes[0].ultimoFolego = 2; // §50.6
  autoFormation(s);
  return s;
}

let LOOT: { comum: string[]; raro: string[]; consumivel: string[] } | null = null;
export function setLootPools(p: { comum: string[]; raro: string[]; consumivel: string[] }) {
  LOOT = p;
}
function lootPools() {
  if (!LOOT) throw new Error('loot pools not set');
  return LOOT;
}

export function autoFormation(s: CampaignState) {
  const order: SectorKey[] = ['H:F3', 'H:F2', 'H:F4', 'H:R3', 'H:R2', 'H:R4', 'H:F1', 'H:F5', 'H:R1', 'H:R5'];
  const melee = new Set(['guerreiro', 'paladino', 'ladino']);
  const sorted = [...s.heroes].sort((a, b) => Number(melee.has(b.classId)) - Number(melee.has(a.classId)));
  const front: SectorKey[] = ['H:F3', 'H:F2', 'H:F4', 'H:F1', 'H:F5'];
  const rear: SectorKey[] = ['H:R3', 'H:R2', 'H:R4', 'H:R1', 'H:R5'];
  const used = new Set<SectorKey>();
  for (const h of sorted) {
    const pref = melee.has(h.classId) ? [...front, ...rear] : [...rear, ...front];
    const k = pref.find((x) => !used.has(x)) ?? order[0];
    used.add(k);
    s.formation[h.id] = k;
  }
}

// ============================================================================ combat setup
export function layoutEnemies(enc: EncounterDef, partySize: number): { typeId: string; sector: SectorKey }[] {
  const comp = enc.compositions[Math.max(1, Math.min(5, partySize)) - 1];
  const explicit = enc.placements?.[partySize - 1];
  const count: Record<string, number> = {};
  const out: { typeId: string; sector: SectorKey }[] = [];
  const cols = [3, 2, 4, 1, 5];
  const occ = (k: SectorKey) => out.filter((o) => o.sector === k).length + (count[k] ?? 0);
  // bosses/elites first so they claim the center
  const ordered = comp.map((t, i) => ({ t, i })).sort((a, b) => rank(b.t) - rank(a.t) || a.i - b.i);
  for (const { t, i } of ordered) {
    const fixed = explicit?.[i];
    if (fixed) {
      out.push({ typeId: t, sector: fixed });
      continue;
    }
    const def = reg().enemies[t];
    const rows: ('F' | 'R')[] = def.prefers === 'F' ? ['F', 'R'] : ['R', 'F'];
    let placed: SectorKey | null = null;
    // spread first (1 per sector), then fill to 2
    for (const cap of [1, 2]) {
      for (const r of rows) {
        for (const c of cols) {
          const k = `E:${r}${c}` as SectorKey;
          if (occ(k) < cap) {
            placed = k;
            break;
          }
        }
        if (placed) break;
      }
      if (placed) break;
    }
    out.push({ typeId: t, sector: placed ?? 'E:R3' });
  }
  return out;
  function rank(t: string) {
    const d = reg().enemies[t];
    return d.boss ? 3 : d.miniboss ? 2 : d.tier === 'elite' || d.tier === 'raro' ? 1 : 0;
  }
}

export function heroFigure(s: CampaignState, h: HeroRecord): Figure {
  const R = reg();
  const maxHp = recordMaxHp(h);
  return {
    id: h.id,
    side: 'H',
    typeId: h.classId,
    name: h.name,
    sector: s.formation[h.id] ?? 'H:F3',
    status: h.status === 'ok' ? 'active' : h.status === 'caido' ? 'caido' : 'derrotado',
    hp: Math.min(h.hp, maxHp),
    maxHp,
    armor: heroArmor(h),
    conditions: emptyConditions(),
    counters: emptyCounters(),
    order: 0,
    isBoss: false,
    isMiniboss: false,
    profano: false,
    heroId: h.id,
    tempo: null,
    acted: false,
    ap: 0,
    reaction: true,
    trauma: h.trauma,
    attrs: { ...h.attrs },
    res: {
      sequencia: 0,
      seqAdvanced: false,
      conviccao: 0,
      julgadoId: null,
      runes: { ruina: true, vinculo: true, transposicao: true, raio: true, explosao: true, sigilo: true },
      instabilidade: 0,
      liturgia: [],
      mira: 0,
    },
    equipment: {
      primary: h.equipment.primary,
      secondary: h.equipment.secondary,
      armor: h.equipment.armor,
      accessories: h.equipment.accessories.filter((x): x is ItemRef => !!x),
    },
    backpack: h.backpack.filter((i) => R.items[i.itemId]?.slot === 'consumable').map((i) => ({ ...i })),
    cantil: h.cantil,
    ultimoFolego: h.ultimoFolego,
    talents: h.talents.slice(),
    dungeonUses: { ...h.dungeonUses },
    manto: null,
  };
}

export function startEncounter(s: CampaignState, encId: string) {
  const d = dungeon(s.dungeonId);
  const enc = d.encounters.find((e) => e.id === encId);
  if (!enc) throw new Error(`encounter ${encId}`);
  const ps = s.partySizeOriginal;
  const waves = (enc.reinforcements?.[ps - 1] ?? []).map((w) => ({ atEndOfCycle: w.atEndOfCycle, enemies: w.enemies.map((t) => ({ typeId: t })) }));
  s.rng.n++;
  const combatSeed = `${s.seed}:${encId}:${s.completed.length}:${s.rng.a}`;
  const combat = createCombat({
    encounterId: enc.id,
    seed: combatSeed,
    partySize: ps,
    heroes: s.heroes.map((h) => heroFigure(s, h)),
    enemies: layoutEnemies(enc, ps),
    cover: enc.cover,
    reinforcementEntries: enc.entries,
    reinforcements: waves,
    objectives: enc.objectives ?? [],
    enemyCap: enc.enemyCap,
    ctx: d.combatContext(s, enc),
    settings: { autoTieBreak: s.settings.autoTieBreak },
  });
  s.combat = combat;
  s.combatEncounterId = enc.id;
  s.phase = 'combat';
  s.narrative = null;
  clog(s, `Encontro: ${enc.name}.`);
}

/** Write combat results back into hero records (HP persists between Combats — §28). */
function writeBack(s: CampaignState, combat: CombatState) {
  for (const h of s.heroes) {
    const f = combat.figures.find((x) => x.id === h.id);
    if (!f) continue;
    h.trauma = f.trauma ?? h.trauma;
    h.hp = f.status === 'active' ? f.hp : 0;
    h.status = f.status === 'active' ? 'ok' : f.status === 'caido' ? 'caido' : 'derrotado';
    // consumables used are gone; equipment stays (weapon order persists)
    const kept = new Set((f.backpack ?? []).map((i) => i.uid));
    const usedConsumables = h.backpack.filter((i) => reg().items[i.itemId]?.slot === 'consumable' && !kept.has(i.uid));
    for (const u of usedConsumables) s.flags[`__usedConsumable:${u.uid}`] = u.itemId;
    h.backpack = h.backpack.filter((i) => reg().items[i.itemId]?.slot !== 'consumable' || kept.has(i.uid));
    h.cantil = f.cantil ?? h.cantil;
    h.ultimoFolego = f.ultimoFolego ?? h.ultimoFolego;
    h.dungeonUses = { ...(f.dungeonUses ?? {}) };
    if (f.equipment) {
      h.equipment.primary = f.equipment.primary;
      h.equipment.secondary = f.equipment.secondary;
    }
  }
}

function draw(s: CampaignState, kind: 'comum' | 'raro' | 'consumivel', n: number): ItemRef[] {
  const out: ItemRef[] = [];
  for (let i = 0; i < n; i++) {
    let id = s.decks[kind].shift();
    if (!id && kind === 'consumivel') {
      // consumables return to the general supply — rebuild from pool minus carried copies
      s.decks.consumivel = shuffle(s.rng, lootPools().consumivel);
      id = s.decks.consumivel.shift();
    }
    if (!id) break;
    out.push(uid(s, id));
  }
  return out;
}

// ============================================================================ commands
export type CampaignCommand =
  | { t: 'beginDungeon' }
  | { t: 'setFormation'; heroId: string; sector: SectorKey }
  | { t: 'explore'; optionId: string }
  | { t: 'combat'; cmd: CombatCommand }
  | { t: 'assignLoot'; uid: string; heroId: string | 'armazem' | 'leave' }
  | { t: 'collectRewards' }
  | { t: 'closeArchive' }
  | { t: 'closeNarrative' }
  | { t: 'equip'; heroId: string; uid: string; slot: 'primary' | 'secondary' | 'armor' | 'acc0' | 'acc1' }
  | { t: 'unequip'; heroId: string; slot: 'primary' | 'secondary' | 'armor' | 'acc0' | 'acc1' }
  | { t: 'transfer'; uid: string; to: string | 'armazem' }
  | { t: 'useOutOfCombat'; heroId: string; uid: string; targetId: string }
  | { t: 'drinkCantil'; heroId: string }
  | { t: 'raiseOutOfCombat'; heroId: string }
  | { t: 'buy'; itemId: string; kind: 'comum' | 'raro' | 'consumivel' | 'usado'; heroId: string | 'armazem' }
  | { t: 'sell'; uid: string }
  | { t: 'service'; id: 'remessaComum' | 'remessaRara' | 'reserva'; index: number }
  | { t: 'mastery'; heroId: string; attr: Attr }
  | { t: 'talent'; heroId: string; talentId: string }
  | { t: 'leaveBase' }
  | { t: 'settings'; autoTieBreak?: boolean }
  | { t: 'renameHero'; heroId: string; name: string }
  | { t: 'assignSeat'; heroId: string; seat: string };

export interface CampaignResult {
  state: CampaignState;
  events: import('./types').DomainEvent[];
  error: string | null;
}

export class CampaignError extends Error {}
function cfail(m: string): never {
  throw new CampaignError(m);
}

export function campaignDispatch(state: CampaignState, cmd: CampaignCommand, now = Date.now()): CampaignResult {
  if (cmd.t === 'combat') {
    if (state.phase !== 'combat' || !state.combat) return { state, events: [], error: 'Não há combate ativo.' };
    const r = combatDispatch(state.combat, cmd.cmd);
    if (r.error) return { state, events: [], error: r.error };
    const s = { ...state, combat: r.state, updatedAt: now };
    // Sete Linhas success → B-SCR-01 must be read immediately (§61.1)
    if (r.state.flags['readArchive'] && !s.archiveRead.includes(String(r.state.flags['readArchive']))) {
      s.pendingArchive = String(r.state.flags['readArchive']);
      s.archiveRead = [...s.archiveRead, s.pendingArchive];
    }
    if (r.state.phase === 'ended') return { state: endCombat(structuredClone(s)), events: r.events, error: null };
    return { state: s, events: r.events, error: null };
  }
  const s = structuredClone(state);
  try {
    applyCampaign(s, cmd);
    s.updatedAt = now;
    return { state: s, events: [], error: null };
  } catch (e) {
    if (e instanceof CampaignError) return { state, events: [], error: e.message };
    throw e;
  }
}

function endCombat(s: CampaignState): CampaignState {
  const combat = s.combat!;
  const d = dungeon(s.dungeonId);
  const enc = d.encounters.find((e) => e.id === s.combatEncounterId)!;
  writeBack(s, combat);
  if (combat.result === 'defeat') {
    s.phase = 'gameover';
    s.gameOverReason = 'Todos os heróis caíram. O Sino continua a soar.';
    clog(s, 'Game Over da campanha.');
    return s;
  }
  s.completed.push(enc.id);
  d.onVictory(s, enc, combat);
  // rewards (§30, §59): reveal exactly the indicated quantities; everything revealed is found.
  const ps = s.partySizeOriginal;
  const items: ItemRef[] = [];
  if (enc.rewards.comum) items.push(...draw(s, 'comum', enc.rewards.comum * lootCount('comum', ps)));
  if (enc.rewards.raro) items.push(...draw(s, 'raro', enc.rewards.raro * lootCount('raro', ps)));
  if (enc.rewards.consumivel) items.push(...draw(s, 'consumivel', enc.rewards.consumivel * lootCount('consumivel', ps)));
  for (const e of enc.rewards.epic ?? []) items.push(uid(s, e));
  const gold = enc.rewards.gold[ps - 1] ?? 0;
  s.reward = { encounterId: enc.id, title: enc.name, gold, items, states: enc.rewards.states ?? [], unassigned: items.map((i) => i.uid) };
  s.phase = 'reward';
  s.combat = null;
  clog(s, `Vitória: ${enc.name}.`);
  return s;
}

function hero(s: CampaignState, id: string): HeroRecord {
  const h = s.heroes.find((x) => x.id === id);
  if (!h) cfail('Herói inválido.');
  return h;
}
function backpackFull(s: CampaignState, h: HeroRecord) {
  return h.backpack.length >= backpackCapacity(s.partySizeOriginal);
}

function applyCampaign(s: CampaignState, cmd: CampaignCommand) {
  const d = dungeon(s.dungeonId);
  switch (cmd.t) {
    case 'settings':
      if (cmd.autoTieBreak !== undefined) s.settings.autoTieBreak = cmd.autoTieBreak;
      return;
    case 'renameHero':
      hero(s, cmd.heroId).name = cmd.name.slice(0, 24) || hero(s, cmd.heroId).name;
      return;
    case 'assignSeat':
      if (!s.seats.some((x) => x.id === cmd.seat)) cfail('Jogador inválido.');
      hero(s, cmd.heroId).seat = cmd.seat;
      return;
    case 'beginDungeon': {
      if (s.phase !== 'prep') cfail('A Dungeon já começou.');
      s.phase = 'explore';
      s.node = d.startNode;
      s.revealed = d.locations.filter((l) => l.public).map((l) => l.id);
      s.visited = [d.startNode];
      s.narrative = d.locations.find((l) => l.id === d.startNode)?.arrival ?? null;
      clog(s, `${d.name}: a expedição começa.`);
      return;
    }
    case 'setFormation': {
      if (s.phase === 'combat') cfail('Durante o Combate use as ações de movimento.');
      const occupied = Object.entries(s.formation).filter(([id, k]) => id !== cmd.heroId && k === cmd.sector).length;
      if (cmd.sector[0] !== 'H') cfail('Setor inválido.');
      if (occupied >= 2) cfail('Setor cheio (máximo 2).');
      s.formation[cmd.heroId] = cmd.sector;
      return;
    }
    case 'explore': {
      if (s.phase !== 'explore') cfail('Não é possível explorar agora.');
      if (s.pendingArchive) cfail('Leia a entrada do Arquivo.');
      const opt = d.options(s).find((o) => o.id === cmd.optionId);
      if (!opt) cfail('Opção indisponível.');
      const r = d.choose(s, opt.id);
      if (r?.archive && !s.archiveRead.includes(r.archive)) {
        s.pendingArchive = r.archive;
        s.archiveRead.push(r.archive);
      }
      if (r?.narrative) s.narrative = r.narrative;
      if (r?.encounterId) startEncounter(s, r.encounterId);
      return;
    }
    case 'closeArchive':
      s.pendingArchive = null;
      return;
    case 'closeNarrative':
      s.narrative = null;
      return;
    case 'assignLoot': {
      if (s.phase !== 'reward' || !s.reward) cfail('Sem recompensas.');
      const it = s.reward.items.find((i) => i.uid === cmd.uid);
      if (!it) cfail('Item inválido.');
      // reassigning: remove from wherever it is
      for (const h of s.heroes) h.backpack = h.backpack.filter((x) => x.uid !== cmd.uid);
      s.armazem = s.armazem.filter((x) => x.uid !== cmd.uid);
      if (!s.reward.unassigned.includes(cmd.uid)) s.reward.unassigned.push(cmd.uid);
      if (cmd.heroId === 'leave') return;
      if (cmd.heroId === 'armazem') cfail('O Armazém fica na Base: carregue o item na Mochila ou deixe-o.');
      const h = hero(s, cmd.heroId);
      if (backpackFull(s, h)) cfail(`A Mochila de ${h.name} está cheia (${backpackCapacity(s.partySizeOriginal)}).`);
      h.backpack.push(it);
      s.reward.unassigned = s.reward.unassigned.filter((x) => x !== cmd.uid);
      return;
    }
    case 'collectRewards': {
      if (s.phase !== 'reward' || !s.reward) cfail('Sem recompensas.');
      const r = s.reward;
      s.gold += r.gold;
      for (const st of r.states) s.flags[`state:${st}`] = true;
      // Loot not carried does not belong to the party (§27)
      for (const u of r.unassigned) {
        const it = r.items.find((i) => i.uid === u)!;
        const def = reg().items[it.itemId];
        if (def.slot === 'consumable') s.decks.consumivel.push(it.itemId);
        else s.removed.push(it.itemId);
      }
      clog(s, `Recompensas: +${r.gold} ouro${r.states.length ? `, ${r.states.map((x) => d.stateCards[x]?.name ?? x).join(', ')}` : ''}.`);
      const enc = d.encounters.find((e) => e.id === r.encounterId)!;
      s.reward = null;
      s.phase = 'explore';
      d.afterRewards(s, enc);
      return;
    }
    case 'drinkCantil': {
      if (s.phase === 'combat') cfail('Use a ação de combate.');
      const h = hero(s, cmd.heroId);
      if (h.status !== 'ok') cfail('Herói fora de ação.');
      if (h.cantil <= 0) cfail('Cantil vazio.');
      const max = recordMaxHp(h);
      if (h.hp >= max) cfail('HP cheio.');
      h.cantil--;
      h.hp = Math.min(max, h.hp + 3);
      clog(s, `${h.name} bebe do Cantil (+3 HP).`);
      return;
    }
    case 'raiseOutOfCombat': {
      // HIPÓTESE Q-LEVANTAR-FORA: fora de Combate, Levantar aplica o mesmo resultado (25% HP + 1 Trauma) sem AP.
      if (s.phase === 'combat') cfail('Use a ação Levantar.');
      const h = hero(s, cmd.heroId);
      if (h.status !== 'caido') cfail('O herói não está Caído.');
      if (!s.heroes.some((x) => x.status === 'ok')) cfail('Ninguém pode Levantá-lo.');
      h.trauma++;
      const max = recordMaxHp(h);
      h.hp = Math.max(1, Math.ceil(max * 0.25));
      h.status = 'ok';
      clog(s, `${h.name} é Levantado (1 Trauma).`);
      return;
    }
    case 'useOutOfCombat': {
      if (s.phase === 'combat') cfail('Use a ação de combate.');
      const h = hero(s, cmd.heroId);
      const idx = h.backpack.findIndex((i) => i.uid === cmd.uid);
      if (idx < 0) cfail('Item não está na Mochila.');
      const def = reg().items[h.backpack[idx].itemId];
      if (!def.consumable?.outOfCombat) cfail('Este Consumível só pode ser usado em Combate.');
      const t = hero(s, cmd.targetId);
      // out of combat only Veneno/Sangramento/Queimando would matter; conditions are cleared after combat in the digital flow.
      h.backpack.splice(idx, 1);
      s.decks.consumivel.push(def.id);
      clog(s, `${h.name} usa ${def.name} em ${t.name}.`);
      return;
    }
    case 'equip':
    case 'unequip':
    case 'transfer':
      return manageInventory(s, cmd);
    case 'buy':
    case 'sell':
    case 'service':
    case 'mastery':
    case 'talent':
    case 'leaveBase':
      return baseCommand(s, cmd);
  }
}

// ============================================================================ inventory (§16, §27)
function findItem(s: CampaignState, uidv: string): { where: 'armazem' | 'backpack' | 'equip'; hero?: HeroRecord; slot?: string; ref: ItemRef } | null {
  const a = s.armazem.find((i) => i.uid === uidv);
  if (a) return { where: 'armazem', ref: a };
  for (const h of s.heroes) {
    const b = h.backpack.find((i) => i.uid === uidv);
    if (b) return { where: 'backpack', hero: h, ref: b };
    const eq = h.equipment;
    for (const [slot, r] of [['primary', eq.primary], ['secondary', eq.secondary], ['armor', eq.armor], ['acc0', eq.accessories[0]], ['acc1', eq.accessories[1]]] as const) if (r?.uid === uidv) return { where: 'equip', hero: h, slot, ref: r };
  }
  return null;
}
function removeFrom(s: CampaignState, loc: NonNullable<ReturnType<typeof findItem>>) {
  if (loc.where === 'armazem') s.armazem = s.armazem.filter((i) => i.uid !== loc.ref.uid);
  else if (loc.where === 'backpack') loc.hero!.backpack = loc.hero!.backpack.filter((i) => i.uid !== loc.ref.uid);
  else setSlot(loc.hero!, loc.slot as any, null);
}
function getSlot(h: HeroRecord, slot: 'primary' | 'secondary' | 'armor' | 'acc0' | 'acc1') {
  if (slot === 'acc0') return h.equipment.accessories[0];
  if (slot === 'acc1') return h.equipment.accessories[1];
  return h.equipment[slot];
}
function setSlot(h: HeroRecord, slot: 'primary' | 'secondary' | 'armor' | 'acc0' | 'acc1', v: ItemRef | null) {
  if (slot === 'acc0') h.equipment.accessories[0] = v;
  else if (slot === 'acc1') h.equipment.accessories[1] = v;
  else h.equipment[slot] = v;
}
export function canWield(h: HeroRecord, itemId: string): boolean {
  const def = reg().items[itemId];
  if (def.slot !== 'weapon') return true;
  const prof = reg().classes[h.classId].proficiencies;
  return (def.proficiency ?? []).some((p) => prof.includes(p));
}
function manageInventory(s: CampaignState, cmd: Extract<CampaignCommand, { t: 'equip' | 'unequip' | 'transfer' }>) {
  if (s.phase === 'combat') cfail('Equipamentos ficam travados durante o Combate (§16).');
  const inBase = s.phase === 'base' || s.phase === 'prep';
  if (cmd.t === 'equip') {
    const h = hero(s, cmd.heroId);
    const loc = findItem(s, cmd.uid);
    if (!loc) cfail('Item não encontrado.');
    if (loc.where === 'armazem' && !inBase) cfail('O Armazém só é acessível na Base.');
    const def = reg().items[loc.ref.itemId];
    const want = cmd.slot === 'primary' || cmd.slot === 'secondary' ? 'weapon' : cmd.slot === 'armor' ? 'armor' : 'accessory';
    if (def.slot !== want) cfail('Slot incompatível.');
    if (!canWield(h, def.id)) cfail(`${reg().classes[h.classId].name} não possui proficiência para ${def.name}.`);
    const prev = getSlot(h, cmd.slot);
    removeFrom(s, loc);
    setSlot(h, cmd.slot, loc.ref);
    if (prev) {
      if (loc.where === 'backpack' && loc.hero) loc.hero.backpack.push(prev);
      else if (loc.where === 'equip' && loc.hero) setSlot(loc.hero, loc.slot as any, prev);
      else if (inBase) s.armazem.push(prev);
      else if (!backpackFull(s, h)) h.backpack.push(prev);
      else cfail('Sem espaço para guardar o item substituído.');
    }
    clampHp(h);
    return;
  }
  if (cmd.t === 'unequip') {
    const h = hero(s, cmd.heroId);
    const prev = getSlot(h, cmd.slot);
    if (!prev) return;
    if (inBase) s.armazem.push(prev);
    else if (!backpackFull(s, h)) h.backpack.push(prev);
    else cfail('Mochila cheia.');
    setSlot(h, cmd.slot, null);
    clampHp(h);
    return;
  }
  // transfer
  const loc = findItem(s, cmd.uid);
  if (!loc) cfail('Item não encontrado.');
  if (cmd.to === 'armazem') {
    if (!inBase) cfail('O Armazém só é acessível na Base.');
    removeFrom(s, loc);
    s.armazem.push(loc.ref);
    return;
  }
  if (loc.where === 'armazem' && !inBase) cfail('O Armazém só é acessível na Base.');
  const to = hero(s, cmd.to);
  if (backpackFull(s, to)) cfail(`A Mochila de ${to.name} está cheia.`);
  removeFrom(s, loc);
  to.backpack.push(loc.ref);
}
function clampHp(h: HeroRecord) {
  h.hp = Math.min(h.hp, recordMaxHp(h));
}

// ============================================================================ Base (§28, §31, §32, §29)
export const PRICES = { comum: { buy: 8, sell: 4 }, raro: { buy: 14, sell: 7 }, epico: { buy: 24, sell: 12 } };
export const MASTERY_COST: Record<number, number> = { 4: 1, 6: 1, 8: 2, 10: 2 };

export function enterBase(s: CampaignState) {
  s.phase = 'base';
  s.dungeonsCompleted++;
  const visit = (s.base?.visit ?? 0) + 1;
  // §28: restore HP, remove conditions/temporary states, recharge Cantil; Trauma removed (Dungeon state).
  for (const h of s.heroes) {
    h.trauma = 0;
    h.status = 'ok';
    h.cantil = h.cantilMax;
    h.hp = recordMaxHp(h);
    h.dungeonUses = {};
    h.ultimoFolego = s.heroes.length === 1 ? 2 : 0;
    // §29: +1 Maestria and +1 Talento per hero after Dungeons 1–7
    if (s.dungeonsCompleted <= 7) {
      h.masteryPoints++;
      h.talentPoints++;
    }
  }
  // used consumables return to the general supply
  for (const [k, v] of Object.entries(s.flags)) if (k.startsWith('__usedConsumable:')) {
    s.decks.consumivel.push(String(v));
    delete s.flags[k];
  }
  const reserva = s.base?.reserva ?? null;
  const vitrine = { comum: drawShop(s, 'comum', 4), raro: drawShop(s, 'raro', 2) };
  s.base = { visit, vitrine, consumables: [...new Set(lootPools().consumivel)], servicesUsed: {}, reserva, restored: true };
  clog(s, 'Retorno à Base: HP restaurado, Cantis recarregados, +1 Maestria e +1 Talento por herói.');
}
function drawShop(s: CampaignState, kind: 'comum' | 'raro', n: number): string[] {
  return s.decks[kind].splice(0, n);
}

function baseCommand(s: CampaignState, cmd: Extract<CampaignCommand, { t: 'buy' | 'sell' | 'service' | 'mastery' | 'talent' | 'leaveBase' }>) {
  if (cmd.t === 'mastery' || cmd.t === 'talent') {
    if (s.phase !== 'base') cfail('Progressão é aplicada na Base.');
    const h = hero(s, cmd.heroId);
    if (cmd.t === 'mastery') {
      const g = h.attrs[cmd.attr];
      if (g >= 12) cfail('Máximo D12.');
      const cost = MASTERY_COST[g];
      if (h.masteryPoints < cost) cfail(`Custa ${cost} Ponto(s) de Maestria.`);
      h.masteryPoints -= cost;
      h.attrs[cmd.attr] = raiseGrade(g);
      clog(s, `${h.name}: ${cmd.attr} sobe para D${h.attrs[cmd.attr]}.`);
      return;
    }
    const t = reg().talents[cmd.talentId];
    if (!t || t.classId !== h.classId) cfail('Talento inválido.');
    if (h.talents.includes(t.id)) cfail('Talento já adquirido.');
    const maxTier = s.dungeonsCompleted >= 7 ? 4 : s.dungeonsCompleted >= 5 ? 3 : s.dungeonsCompleted >= 3 ? 2 : 1;
    if (t.tier > maxTier) cfail(`T${t.tier} libera após a Dungeon ${t.tier === 2 ? 3 : t.tier === 3 ? 5 : 7}.`);
    if (h.talentPoints < 1) cfail('Sem Pontos de Talento.');
    h.talentPoints--;
    h.talents.push(t.id);
    clog(s, `${h.name} aprende ${t.name}.`);
    return;
  }
  if (s.phase !== 'base' || !s.base) cfail('Somente na Base.');
  const B = s.base;
  if (cmd.t === 'leaveBase') {
    s.phase = 'complete';
    return;
  }
  if (cmd.t === 'buy') {
    let price = 0;
    if (cmd.kind === 'comum' || cmd.kind === 'raro') {
      const list = B.vitrine[cmd.kind];
      const i = list.indexOf(cmd.itemId);
      if (i < 0) cfail('Item fora da Vitrine.');
      price = PRICES[cmd.kind].buy;
      if (s.gold < price) cfail('Ouro insuficiente.');
      list.splice(i, 1);
    } else if (cmd.kind === 'usado') {
      const i = s.usados.indexOf(cmd.itemId);
      if (i < 0) cfail('Item fora do Estoque de Usados.');
      const r = reg().items[cmd.itemId].rarity;
      price = r === 'epico' ? PRICES.epico.buy : r === 'raro' ? PRICES.raro.buy : PRICES.comum.buy;
      if (s.gold < price) cfail('Ouro insuficiente.');
      s.usados.splice(i, 1);
    } else {
      const i = B.consumables.indexOf(cmd.itemId);
      if (i < 0) cfail('Consumível indisponível nesta visita.');
      price = reg().items[cmd.itemId].price ?? 2;
      if (s.gold < price) cfail('Ouro insuficiente.');
      B.consumables.splice(i, 1);
      const di = s.decks.consumivel.indexOf(cmd.itemId);
      if (di >= 0) s.decks.consumivel.splice(di, 1);
    }
    s.gold -= price;
    const ref = uid(s, cmd.itemId);
    if (cmd.heroId === 'armazem') s.armazem.push(ref);
    else {
      const h = hero(s, cmd.heroId);
      if (backpackFull(s, h)) s.armazem.push(ref);
      else h.backpack.push(ref);
    }
    clog(s, `Compra: ${reg().items[cmd.itemId].name} (−${price} ouro).`);
    return;
  }
  if (cmd.t === 'sell') {
    const loc = findItem(s, cmd.uid);
    if (!loc) cfail('Item não encontrado.');
    const def = reg().items[loc.ref.itemId];
    let value = 0;
    if (def.slot === 'consumable') value = Math.floor((def.price ?? 2) / 2);
    else if (def.rarity === 'inicial') value = 0;
    else value = def.rarity === 'epico' ? PRICES.epico.sell : def.rarity === 'raro' ? PRICES.raro.sell : PRICES.comum.sell;
    removeFrom(s, loc);
    s.gold += value;
    if (def.slot === 'consumable') s.decks.consumivel.push(def.id);
    else if (def.rarity !== 'inicial') s.usados.push(def.id);
    clog(s, `Venda: ${def.name} (+${value} ouro).`);
    return;
  }
  if (cmd.t === 'service') {
    if (cmd.id === 'remessaComum' || cmd.id === 'remessaRara') {
      const kind = cmd.id === 'remessaComum' ? 'comum' : 'raro';
      const cost = kind === 'comum' ? 2 : 3;
      if (B.servicesUsed[cmd.id]) cfail('Uma vez por visita.');
      if (s.gold < cost) cfail('Ouro insuficiente.');
      const list = B.vitrine[kind];
      if (!list[cmd.index]) cfail('Carta inválida.');
      const next = s.decks[kind].shift();
      if (!next) cfail('Sem cartas elegíveis.');
      s.decks[kind].push(list[cmd.index]);
      list[cmd.index] = next;
      s.gold -= cost;
      B.servicesUsed[cmd.id] = 1;
      clog(s, `Nova Remessa ${kind === 'comum' ? 'Comum' : 'Rara'} (−${cost} ouro).`);
      return;
    }
    if (cmd.id === 'reserva') {
      if (s.gold < 1) cfail('Ouro insuficiente.');
      const all = [...B.vitrine.comum, ...B.vitrine.raro];
      if (!all[cmd.index]) cfail('Carta inválida.');
      B.reserva = all[cmd.index];
      s.gold -= 1;
      clog(s, `Reserva do Mercador: ${reg().items[B.reserva].name} (−1 ouro).`);
      return;
    }
  }
}

// ============================================================================ save integrity
export function checksum(s: CampaignState): string {
  const str = JSON.stringify(s);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export interface SaveEnvelope {
  format: 'mosteiro-save';
  schemaVersion: number;
  savedAt: number;
  label: string;
  checksum: string;
  state: CampaignState;
}
export function toEnvelope(s: CampaignState, label: string, now = Date.now()): SaveEnvelope {
  return { format: 'mosteiro-save', schemaVersion: SCHEMA_VERSION, savedAt: now, label, checksum: checksum(s), state: s };
}
export function migrate(env: SaveEnvelope): CampaignState {
  if (env.format !== 'mosteiro-save') throw new Error('Arquivo não é um save do Mosteiro.');
  if (checksum(env.state) !== env.checksum) throw new Error('Save corrompido (checksum não confere).');
  const s = env.state;
  if (s.schemaVersion > SCHEMA_VERSION) throw new Error('Save de uma versão mais nova do jogo.');
  // future: switch (s.schemaVersion) { case 1: ... }
  return s;
}

export type { CombatCommand };
