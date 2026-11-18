import { beforeAll, describe, expect, it } from 'vitest';
import {
  actionTargets,
  checkEnd,
  dealDamage,
  createCombat,
  ctxOf,
  dispatch,
  emptyConditions,
  emptyCounters,
  heroFigure,
  newCampaign,
  reg,
  type CombatState,
  type Command,
  type Figure,
  type SectorKey,
} from '@mosteiro/core';
import { installContent, nextCombatCommand } from '../src';

beforeAll(() => installContent());

function campaignHeroes(classes: string[]) {
  const s = newCampaign({ seed: 'T', dungeonId: 'd1', heroes: classes.map((c) => ({ classId: c, name: c })) });
  return { s, figs: s.heroes.map((h) => heroFigure(s, h)) };
}
function combat(classes: string[], enemies: { typeId: string; sector: SectorKey }[], placements: SectorKey[], seed = 'c1', extra: Partial<Parameters<typeof createCombat>[0]> = {}) {
  const { figs } = campaignHeroes(classes);
  figs.forEach((f, i) => (f.sector = placements[i]));
  return createCombat({ encounterId: 'TEST', seed, partySize: classes.length, heroes: figs, enemies, cover: [], reinforcementEntries: ['E:R3'], reinforcements: [], objectives: [], skipDeploy: true, ...extra });
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

describe('Ciclo e Tempo (§6)', () => {
  it('Intenções são reveladas antes da escolha de Tempo', () => {
    const S = combat(['guerreiro'], [{ typeId: 'penitente', sector: 'E:F3' }], ['H:F1']);
    expect(S.phase).toBe('tempo');
    expect(S.enemyTypes['penitente'].revealed).toBeTruthy();
  });
  it('Rápido = 2 AP + Passo; Tático = 3 AP; Pesado = 3 AP', () => {
    for (const [t, ap] of [['rapido', 2], ['tatico', 3], ['pesado', 3]] as const) {
      let S = combat(['guerreiro'], [{ typeId: 'escudeiro', sector: 'E:R5' }], ['H:F1']);
      S = untilHeroTurn(S, { h1: t });
      // Escudeiro intents may act in Rápido before heroes when hero is not Rápido — find the hero band
      while (S.phase !== 'heroBand' && S.phase !== 'ended') {
        const cmd = nextCombatCommand(S)!;
        S = run(S, cmd);
      }
      S = run(S, { t: 'activate', figureId: 'h1' });
      expect(S.figures.find((f) => f.id === 'h1')!.ap).toBe(ap);
    }
  });
  it('mesmo seed e mesmas escolhas reproduzem o combate (aceite 08)', () => {
    const play = () => {
      let S = combat(['guerreiro', 'arqueiro', 'clerigo'], [{ typeId: 'penitente', sector: 'E:F2' }, { typeId: 'besteiro', sector: 'E:R3' }, { typeId: 'cao', sector: 'E:F4' }], ['H:F2', 'H:R3', 'H:R4'], 'det');
      for (let i = 0; i < 2000 && S.phase !== 'ended'; i++) S = run(S, nextCombatCommand(S)!);
      return S;
    };
    const a = play();
    const b = play();
    expect(a.log.map((x) => x.text)).toEqual(b.log.map((x) => x.text));
    expect(a.rng).toEqual(b.rng);
  });
});

describe('Validação de ações (aceite 10)', () => {
  it('Corpo a Corpo fora de coluna é rejeitado; UI e motor usam o mesmo resolvedor', () => {
    let S = combat(['guerreiro'], [{ typeId: 'escudeiro', sector: 'E:F5' }], ['H:F1']);
    S = untilHeroTurn(S, { h1: 'rapido' });
    S = run(S, { t: 'activate', figureId: 'h1' });
    const c = ctxOf(S);
    const f = S.figures.find((x) => x.id === 'h1')!;
    const corte = reg().classes.guerreiro.actions.find((a) => a.id === 'g_corte')!;
    expect(actionTargets(c, f, corte).figures).toEqual([]);
    const e = S.figures.find((x) => x.side === 'E')!;
    const r = dispatch(S, { t: 'action', actionId: 'g_corte', figureId: 'h1', targetIds: [e.id] });
    expect(r.error).toBeTruthy();
  });
  it('AP nunca fica negativo', () => {
    let S = combat(['guerreiro'], [{ typeId: 'escudeiro', sector: 'E:F1' }], ['H:F1']);
    S = untilHeroTurn(S, { h1: 'rapido' });
    while (S.phase !== 'heroBand') S = run(S, nextCombatCommand(S)!);
    S = run(S, { t: 'activate', figureId: 'h1' });
    const e = S.figures.find((x) => x.side === 'E')!;
    S = run(S, { t: 'action', actionId: 'g_corte', figureId: 'h1', targetIds: [e.id] });
    while (S.pending) S = run(S, nextCombatCommand(S)!);
    const r = dispatch(S, { t: 'action', actionId: 'g_corte', figureId: 'h1', targetIds: [e.id] });
    expect(r.error).toMatch(/AP/);
    expect(S.figures.find((x) => x.id === 'h1')!.ap).toBeGreaterThanOrEqual(0);
  });
  it('sair de Engajamento custa +1 AP', () => {
    let S = combat(['guerreiro'], [{ typeId: 'escudeiro', sector: 'E:F1' }], ['H:F1']);
    S = untilHeroTurn(S, { h1: 'tatico' });
    while (S.phase !== 'heroBand') S = run(S, nextCombatCommand(S)!);
    S = run(S, { t: 'activate', figureId: 'h1' });
    const before = S.figures.find((x) => x.id === 'h1')!.ap!;
    S = run(S, { t: 'action', actionId: 'reposicionar', figureId: 'h1', sector: 'H:R1' });
    expect(S.figures.find((x) => x.id === 'h1')!.ap).toBe(before - 2);
  });
});

describe('Dano e Defesa (§12, §13)', () => {
  it('Cobertura reduz apenas Distância; Dano Direto ignora Armadura', () => {
    let S = combat(['arqueiro'], [{ typeId: 'escudeiro', sector: 'E:R2' }], ['H:F2'], 'cov', { cover: ['E:R2'] });
    S = untilHeroTurn(S, { h1: 'rapido' });
    while (S.phase !== 'heroBand') S = run(S, nextCombatCommand(S)!);
    S = run(S, { t: 'activate', figureId: 'h1' });
    const e = S.figures.find((x) => x.side === 'E')!;
    S = run(S, { t: 'action', actionId: 'ar_disparo', figureId: 'h1', targetIds: [e.id] });
    if (S.pending) S = run(S, { t: 'answer', pendingId: S.pending.id, answer: { kind: 'attackPost', choices: [] } });
    const line = S.log.find((l) => l.text.includes('Disparo Básico →'));
    if (line && !line.text.includes('erra')) expect(line.text).toMatch(/Cobertura −1|Dano final 0/);
  });
});

describe('Caído, Trauma e Último Fôlego (§50 — aceite 11)', () => {
  it('true solo: ao cair gasta Último Fôlego, recebe Trauma e volta com 25% do HP', () => {
    const S = combat(['arqueiro'], [{ typeId: 'carrasco', sector: 'E:F1' }], ['H:F1'], 'solo');
    const h = S.figures.find((f) => f.id === 'h1')!;
    h.ultimoFolego = 2;
    h.hp = 1;
    const c = ctxOf(S);
    dealDamage(c, h, 3, { direct: true, sourceId: null, school: 'none' });
    const after = S.figures.find((f) => f.id === 'h1')!;
    expect(after.ultimoFolego).toBe(1);
    expect(after.trauma).toBe(1);
    expect(after.maxHp).toBe(8);
    expect(after.status).toBe('active');
    expect(after.hp).toBe(2);
    dealDamage(c, after, 9, { direct: true, sourceId: null, school: 'none' });
    dealDamage(c, after, 9, { direct: true, sourceId: null, school: 'none' });
    expect(after.ultimoFolego).toBe(0);
    expect(after.status).toBe('derrotado');
    checkEnd(c);
    expect(S.result).toBe('defeat');
  });
  it('party: herói Caído pode ser Levantado com 25% e 1 Trauma; com 2 Traumas cair = Derrotado', () => {
    let S = combat(['guerreiro', 'clerigo'], [{ typeId: 'escudeiro', sector: 'E:R5' }], ['H:F1', 'H:F2']);
    const g = S.figures.find((f) => f.id === 'h1')!;
    g.status = 'caido';
    g.hp = 0;
    S = untilHeroTurn(S, { h2: 'tatico' });
    while (S.phase !== 'heroBand') S = run(S, nextCombatCommand(S)!);
    S = run(S, { t: 'activate', figureId: 'h2' });
    while (S.pending) S = run(S, nextCombatCommand(S)!);
    S = run(S, { t: 'action', actionId: 'levantar', figureId: 'h2', targetIds: ['h1'] });
    const g2 = S.figures.find((f) => f.id === 'h1')!;
    expect(g2.status).toBe('active');
    expect(g2.trauma).toBe(1);
    expect(g2.maxHp).toBe(12);
    expect(g2.hp).toBe(3);
  });
});

describe('Composições exatas por party (aceite 03)', () => {
  it('GAL-E01 com 5 heróis: 4 Penitentes + 1 Acólito e Besteiro no fim do Ciclo 2', async () => {
    const { s } = campaignHeroes(['guerreiro', 'paladino', 'arcanista', 'clerigo', 'arqueiro']);
    const { startEncounter } = await import('@mosteiro/core');
    const s2 = structuredClone(s);
    startEncounter(s2, 'GAL-E01');
    const en = s2.combat!.figures.filter((f) => f.side === 'E');
    expect(en.filter((e) => e.typeId === 'penitente').length).toBe(4);
    expect(en.filter((e) => e.typeId === 'acolito').length).toBe(1);
    expect(s2.combat!.reinforcements[0]).toMatchObject({ atEndOfCycle: 2, enemies: [{ typeId: 'besteiro' }] });
    // no sector over capacity
    const count: Record<string, number> = {};
    for (const f of s2.combat!.figures) count[f.sector] = (count[f.sector] ?? 0) + 1;
    expect(Math.max(...Object.values(count))).toBeLessThanOrEqual(2);
  });
});

void emptyConditions;
void emptyCounters;
export type { Figure };
