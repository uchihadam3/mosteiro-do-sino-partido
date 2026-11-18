import { beforeAll, describe, expect, it } from 'vitest';
import {
  bleedTick,
  collectOptions,
  createCombat,
  ctxOf,
  dispatch,
  drain,
  heroFigure,
  newCampaign,
  pushOps,
  type CombatState,
  type Command,
  type Figure,
  type Pending,
  type RollResult,
  type SectorKey,
} from '@mosteiro/core';
import { installContent, nextCombatCommand } from '../src';

beforeAll(() => installContent());

function campaignHeroes(classes: string[]) {
  const s = newCampaign({ seed: 'T', dungeonId: 'd1', heroes: classes.map((c) => ({ classId: c, name: c })) });
  return { s, figs: s.heroes.map((h) => heroFigure(s, h)) };
}
/** Like combat.test.ts `combat`, plus `equip` to set equipment on the hero figures before the Combat starts. */
function combat(classes: string[], enemies: { typeId: string; sector: SectorKey }[], placements: SectorKey[], equip: (figs: Figure[]) => void = () => undefined, seed = 'items') {
  const { figs } = campaignHeroes(classes);
  figs.forEach((f, i) => (f.sector = placements[i]));
  equip(figs);
  return createCombat({ encounterId: 'TEST', seed, partySize: classes.length, heroes: figs, enemies, cover: [], reinforcementEntries: ['E:R3'], reinforcements: [], objectives: [], skipDeploy: true });
}
function run(S: CombatState, cmd: Command) {
  const r = dispatch(S, cmd);
  if (r.error) throw new Error(r.error);
  return r.state;
}
function untilHeroTurn(S: CombatState, tempos: Record<string, 'rapido' | 'tatico' | 'pesado'>) {
  for (const [id, t] of Object.entries(tempos)) S = run(S, { t: 'tempo', figureId: id, tempo: t });
  return run(S, { t: 'confirmTempo' });
}
/** Answer start-of-combat / start-of-activation prompts (Julgar, Verso...) with the autoplay. */
function settle(S: CombatState) {
  while (S.pending) S = run(S, nextCombatCommand(S)!);
  return S;
}
/** Every hero picks `tempo`; then `id` starts its Activation. */
function activate(S: CombatState, id: string, tempo: 'rapido' | 'tatico' | 'pesado') {
  S = settle(S);
  S = untilHeroTurn(S, Object.fromEntries(S.figures.filter((f) => f.side === 'H').map((f) => [f.id, tempo])));
  while (S.phase !== 'heroBand') S = run(S, nextCombatCommand(S)!);
  S = run(S, { t: 'activate', figureId: id });
  return settle(S);
}
const hero = (S: CombatState, id: string) => S.figures.find((f) => f.id === id)!;
const foes = (S: CombatState) => S.figures.filter((f) => f.side === 'E');
function answer(S: CombatState, a: Extract<Command, { t: 'answer' }>['answer']) {
  return run(S, { t: 'answer', pendingId: S.pending!.id, answer: a });
}
function pendingOf<K extends Pending['kind']>(S: CombatState, kind: K) {
  expect(S.pending?.kind).toBe(kind);
  return S.pending as Extract<Pending, { kind: K }>;
}
/** Replace the roll of the open attackPost pending (deterministic test of post-roll effects). */
function forceRoll(S: CombatState, successes: number, impulsos: number) {
  const p = pendingOf(S, 'attackPost');
  const roll: RollResult = { dice: p.roll.dice, successes, impulsos, critico: false };
  p.roll = roll;
  p.options = collectOptions(ctxOf(S), hero(S, p.attack.sourceId), p.attack, roll);
  return p;
}

describe('Orbe Gravítico (§19 Arcanista)', () => {
  it('o Puxar do Poço Gravitacional pode ser desviado para outro Setor conectado legal', () => {
    let S = combat(['arcanista'], [{ typeId: 'penitente', sector: 'E:R2' }], ['H:R3'], (f) => (f[0].equipment!.primary = { uid: 'orbe', itemId: 'orbe_gravitico' }));
    S = activate(S, 'h1', 'rapido');
    const e = foes(S)[0];
    expect(e.sector).toBe('E:R2');
    S = run(S, { t: 'action', actionId: 'a_poco', figureId: 'h1', sectors: ['E:R2', 'E:R1'] });
    const p = forceRoll(S, 1, 0);
    const redirect = p.options.find((o) => o.id.startsWith('orbe_gravitico|') && o.id.endsWith('|E:R3'));
    expect(redirect).toBeTruthy();
    S = answer(S, { kind: 'attackPost', choices: [redirect!.id] });
    expect(hero(S, e.id).sector).toBe('E:R3');
  });
});

describe('Couro do Caçador (§22)', () => {
  it('quando um inimigo se Engaja voluntariamente: Passo 1 ignorando Engajamento, uma vez por Combate', () => {
    let S = combat(['arqueiro'], [{ typeId: 'penitente', sector: 'E:R2' }], ['H:F2'], (f) => (f[0].equipment!.armor = { uid: 'couro', itemId: 'couro_cacador' }));
    S = settle(S);
    const e = foes(S)[0];
    const engage = (state: CombatState) => {
      const c = ctxOf(state);
      pushOps(c, [{ op: 'move', id: e.id, path: [hero(state, e.id).sector, 'E:F2'], forced: false, voluntary: true, canLeaveEngagement: false, stopOnEngage: true }]);
      drain(c);
      return state;
    };
    S = engage(structuredClone(S));
    const p = pendingOf(S, 'step');
    expect(p.reason).toBe('Couro do Caçador');
    expect(p.ignoreEngagement).toBe(true);
    expect(p.destinations).toContain('H:R2');
    S = answer(S, { kind: 'step', sector: 'H:R2' });
    expect(hero(S, 'h1').sector).toBe('H:R2');
    // second engagement in the same Combat: no new Passo
    S = structuredClone(S);
    hero(S, 'h1').sector = 'H:F2';
    hero(S, e.id).sector = 'E:R2';
    S = engage(S);
    expect(S.pending).toBeNull();
  });
});

describe('Cetro do Peregrino (§20)', () => {
  it('depois de Técnica que concede Guardado, você ou herói faz Passo 1', () => {
    let S = combat(['paladino'], [{ typeId: 'penitente', sector: 'E:R5' }], ['H:F2'], (f) => (f[0].equipment!.primary = { uid: 'cetro', itemId: 'cetro_peregrino' }));
    S = activate(S, 'h1', 'tatico');
    S = run(S, { t: 'action', actionId: 'p_protecao', figureId: 'h1', targetIds: ['h1'] });
    expect(hero(S, 'h1').conditions.guardado).toBe(true);
    const p = pendingOf(S, 'choice');
    expect(p.handler).toBe('cetro:pick');
    S = answer(S, { kind: 'choice', optionId: 'h1' });
    const step = pendingOf(S, 'step');
    expect(step.reason).toBe('Cetro do Peregrino');
    expect(step.steps).toBe(1);
  });
});

describe('Malha do Peregrino (§22)', () => {
  const equip = (f: Figure[]) => (f[0].equipment!.armor = { uid: 'malha', itemId: 'malha_peregrino' });
  it('Guardado concedido por Técnica a outro aliado Adjacente → o portador recebe Guardado', () => {
    let S = combat(['paladino', 'guerreiro'], [{ typeId: 'penitente', sector: 'E:R5' }], ['H:F2', 'H:F3'], equip);
    S = activate(S, 'h1', 'tatico');
    S = run(S, { t: 'action', actionId: 'p_protecao', figureId: 'h1', targetIds: ['h2'] });
    expect(hero(S, 'h2').conditions.guardado).toBe(true);
    expect(hero(S, 'h1').conditions.guardado).toBe(true);
  });
  it('aliado não Adjacente não conta', () => {
    let S = combat(['paladino', 'guerreiro'], [{ typeId: 'penitente', sector: 'E:R5' }], ['H:F2', 'H:R3'], equip);
    S = activate(S, 'h1', 'tatico');
    S = run(S, { t: 'action', actionId: 'p_protecao', figureId: 'h1', targetIds: ['h2'] });
    expect(hero(S, 'h2').conditions.guardado).toBe(true);
    expect(hero(S, 'h1').conditions.guardado).toBe(false);
  });
  it('Técnica que realmente cura você também conta', () => {
    let S = combat(['paladino'], [{ typeId: 'penitente', sector: 'E:R5' }], ['H:F2'], equip);
    S = activate(S, 'h1', 'tatico');
    hero(S, 'h1').hp -= 3;
    S = run(S, { t: 'action', actionId: 'p_imposicao', figureId: 'h1', targetIds: ['h1'], option: 'c1' });
    expect(hero(S, 'h1').conditions.guardado).toBe(true);
  });
});

describe('Luvas de Empunhadura (§23)', () => {
  const setup = () =>
    combat(
      ['guerreiro'],
      [
        { typeId: 'penitente', sector: 'E:F2' },
        { typeId: 'penitente', sector: 'E:R2' },
        { typeId: 'penitente', sector: 'E:R2' },
      ],
      ['H:F2'],
      (f) => (f[0].equipment!.accessories = [{ uid: 'luvas', itemId: 'luvas_empunhadura' }]),
    );
  it('Empurrar contra inimigo comum falha por destino cheio + Impulso não gasto → Exposto', () => {
    let S = activate(setup(), 'h1', 'rapido');
    const target = foes(S).find((e) => e.sector === 'E:F2')!;
    S = run(S, { t: 'action', actionId: 'g_corte', figureId: 'h1', targetIds: [target.id] });
    forceRoll(S, 1, 2);
    S = answer(S, { kind: 'attackPost', choices: ['g_corte:empurrar'] });
    expect(hero(S, target.id).sector).toBe('E:F2');
    expect(hero(S, target.id).conditions.exposto).toBe(true);
  });
  it('sem Impulso sobrando na rolagem de origem, nada acontece', () => {
    let S = activate(setup(), 'h1', 'rapido');
    const target = foes(S).find((e) => e.sector === 'E:F2')!;
    S = run(S, { t: 'action', actionId: 'g_corte', figureId: 'h1', targetIds: [target.id] });
    forceRoll(S, 1, 1);
    S = answer(S, { kind: 'attackPost', choices: ['g_corte:empurrar'] });
    expect(hero(S, target.id).conditions.exposto).toBe(false);
  });
});

describe('Faixa do Sobrevivente (§23)', () => {
  it('uma vez por Combate reduz em 1 o Dano Direto de Veneno/Sangramento/Queimando; a Condição continua', () => {
    let S = combat(['guerreiro'], [{ typeId: 'penitente', sector: 'E:R5' }], ['H:F2'], (f) => (f[0].equipment!.accessories = [{ uid: 'faixa', itemId: 'faixa_sobrevivente' }]));
    S = activate(S, 'h1', 'rapido');
    hero(S, 'h1').conditions.veneno = 2;
    const hp = hero(S, 'h1').hp;
    S = run(S, { t: 'end', figureId: 'h1' });
    expect(hero(S, 'h1').hp).toBe(hp);
    expect(hero(S, 'h1').conditions.veneno).toBe(1);
    // second time in the same Combat: full damage
    const c = ctxOf(S);
    const h = hero(S, 'h1');
    h.conditions.sangramento = 1;
    bleedTick(c, h);
    expect(h.hp).toBe(hp - 1);
  });
});

describe('Grevas do Ímpeto (§23)', () => {
  it('o primeiro Passo 1 de Habilidade de Classe do Ciclo pode ser Passo 2; o seguinte não', () => {
    let S = combat(['clerigo'], [{ typeId: 'penitente', sector: 'E:R5' }], ['H:R1'], (f) => (f[0].equipment!.accessories = [{ uid: 'grevas', itemId: 'grevas_impeto' }]));
    S = activate(S, 'h1', 'tatico');
    hero(S, 'h1').conditions.guardado = false; // Vestes Consagradas: Guia would already be Passo 2
    S = run(S, { t: 'action', actionId: 'c_guia', figureId: 'h1', targetIds: ['h1'] });
    const p = pendingOf(S, 'step');
    expect(p.steps).toBe(2);
    expect(p.destinations).toContain('H:R3');
    S = answer(S, { kind: 'step', sector: 'H:R3' });
    expect(hero(S, 'h1').sector).toBe('H:R3');
    S = run(S, { t: 'action', actionId: 'c_guia', figureId: 'h1', targetIds: ['h1'] });
    expect(pendingOf(S, 'step').steps).toBe(1);
  });
});
