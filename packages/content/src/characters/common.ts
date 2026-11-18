import {
  adjacent,
  canTarget,
  enemies,
  faixaOf,
  fig,
  heroes,
  lowerGrade,
  pushOps,
  reg,
  startHeroAttack,
  type ActionCmd,
  type AttackCat,
  type Attr,
  type ClassResources,
  type Ctx,
  type DieSpec,
  type Figure,
  type ItemDef,
  type VfxSchool,
} from '@mosteiro/core';

export const ATTR_LABEL: Record<Attr, string> = {
  poder: 'Poder',
  guarda: 'Guarda',
  agilidade: 'Agilidade',
  precisao: 'Precisão',
  arcano: 'Arcano',
  determinacao: 'Determinação',
  espirito: 'Espírito',
  sombra: 'Sombra',
};

export function emptyResources(): ClassResources {
  return {
    sequencia: 0,
    seqAdvanced: false,
    conviccao: 0,
    julgadoId: null,
    runes: { ruina: true, vinculo: true, transposicao: true, raio: true, explosao: true, sigilo: true },
    instabilidade: 0,
    liturgia: [],
    mira: 0,
  };
}

/** Die for an attribute, applying Arcanista Instabilidade 3 (Arcano −1 Grau). */
export function heroDie(f: Figure, attr: Attr): DieSpec {
  let g = f.attrs![attr];
  if (attr === 'arcano' && f.typeId === 'arcanista' && (f.res?.instabilidade ?? 0) >= 3) g = lowerGrade(g);
  return { grade: g, source: ATTR_LABEL[attr] };
}
export function diceOf(f: Figure, attrs: Attr[]): DieSpec[] {
  return attrs.map((a) => heroDie(f, a));
}
export function weaponOf(f: Figure): ItemDef | undefined {
  const id = f.equipment?.primary?.itemId;
  return id ? reg().items[id] : undefined;
}
export function weaponCatOf(f: Figure): AttackCat {
  return weaponOf(f)?.cat ?? 'cac';
}
export function schoolOf(w?: ItemDef): VfxSchool {
  if (!w) return 'blunt';
  if (w.bow) return 'arrow';
  if (w.focus) return w.proficiency?.includes('Sagrado') ? 'holy' : 'arcane';
  const n = w.icon;
  if (n.includes('hammer') || n.includes('mace')) return 'blunt';
  return 'metal';
}

export function targetOf(c: Ctx, cmd: ActionCmd): Figure {
  return fig(c, cmd.targetIds![0]);
}

export interface WeaponAttackOpts {
  techId: string;
  name: string;
  /** Attributes rolled; 'weapon' uses the weapon/focus dice. */
  dice: Attr[] | 'weapon';
  dano: number | 'weapon';
  cat?: AttackCat;
  radiante?: boolean;
  ignoreArmor?: number;
  ignoreCover?: boolean;
  spell?: boolean;
  control?: boolean;
  weapon?: boolean;
  school?: VfxSchool;
  extraTargets?: string[];
  data?: Record<string, number | boolean | string>;
  targetId?: string;
}

export function weaponAttack(c: Ctx, f: Figure, cmd: ActionCmd, o: WeaponAttackOpts) {
  const w = weaponOf(f);
  const attrs = o.dice === 'weapon' ? (w?.dice ?? ['poder', 'agilidade']) : o.dice;
  const dano = o.dano === 'weapon' ? (w?.dano ?? 1) : o.dano;
  startHeroAttack(c, {
    sourceId: f.id,
    targetId: o.targetId ?? cmd.targetIds![0],
    extraTargets: o.extraTargets,
    techId: o.techId,
    name: o.name,
    cat: o.cat ?? weaponCatOf(f),
    dice: diceOf(f, attrs),
    dano,
    radiante: o.radiante,
    school: o.school ?? (o.spell ? 'arcane' : schoolOf(w)),
    ignoreArmor: o.ignoreArmor,
    ignoreCover: o.ignoreCover,
    weapon: o.weapon ?? !o.spell,
    spell: o.spell,
    control: o.control,
    data: o.data,
    pre: cmd.pre,
  });
}

export function stepLater(c: Ctx, f: Figure, steps: number, ignoreEngagement: boolean, reason: string) {
  pushOps(c, [{ op: 'step', figureId: f.id, steps, ignoreEngagement, reason }], false);
}

/** Faixa legality for bows (§18.5). */
export function bowAllows(f: Figure, target: Figure): boolean {
  const w = weaponOf(f);
  if (!w?.bow) return true;
  const fx = faixaOf(f.sector, target.sector);
  if (!w.bow.faixas.includes(fx)) return false;
  if (w.bow.noAdjacent && adjacent(f, target)) return false;
  return true;
}
export function inIdeal(f: Figure, target: Figure, extraIdeal?: string): boolean {
  const w = weaponOf(f);
  if (!w?.bow) return false;
  const fx = faixaOf(f.sector, target.sector);
  return fx === w.bow.ideal || fx === extraIdeal;
}
export function hasBow(f: Figure) {
  return !!weaponOf(f)?.bow;
}

export function legalEnemyTargets(c: Ctx, f: Figure, cat: AttackCat) {
  return enemies(c).filter((e) => canTarget(f.sector, e, cat, c.S.figures, f.side));
}

export function nearestAllyDistance(c: Ctx, f: Figure, at = f.sector) {
  let best = Infinity;
  for (const h of heroes(c)) {
    if (h.id === f.id) continue;
    const a = at;
    const b = h.sector;
    const d = Math.abs(Number(a[3]) - Number(b[3])) + (a[2] === b[2] ? 0 : 1);
    best = Math.min(best, d);
  }
  return best;
}
