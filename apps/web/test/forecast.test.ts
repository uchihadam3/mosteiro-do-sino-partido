import { beforeAll, describe, expect, it } from 'vitest';
import { createCombat, dispatch, heroFigure, newCampaign, probAtLeastOneSuccess, type CombatState, type Command, type Grade, type SectorKey } from '@mosteiro/core';
import { installContent, nextCombatCommand } from '@mosteiro/content';
import { simulateAttack } from '../src/ui/combat/forecast';

beforeAll(() => installContent());

function combat(classes: string[], enemies: { typeId: string; sector: SectorKey }[], placements: SectorKey[]) {
  const s = newCampaign({ seed: 'F', dungeonId: 'd1', heroes: classes.map((c) => ({ classId: c, name: c })) });
  const figs = s.heroes.map((h) => heroFigure(s, h));
  figs.forEach((f, i) => (f.sector = placements[i]));
  return createCombat({ encounterId: 'TEST', seed: 'fc', partySize: classes.length, heroes: figs, enemies, cover: [], reinforcementEntries: ['E:R3'], reinforcements: [], objectives: [], skipDeploy: true });
}
function run(S: CombatState, cmd: Command) {
  const r = dispatch(S, cmd);
  if (r.error) throw new Error(r.error);
  return r.state;
}
function heroActing(S: CombatState) {
  S = run(S, { t: 'tempo', figureId: 'h1', tempo: 'tatico' });
  S = run(S, { t: 'confirmTempo' });
  while (S.phase !== 'heroBand' && S.phase !== 'ended') S = run(S, nextCombatCommand(S)!);
  return run(S, { t: 'activate', figureId: 'h1' });
}

describe('attack forecast (simulated on copies of the battle)', () => {
  it('matches the dice odds and never touches the real state', () => {
    let S = combat(['guerreiro'], [{ typeId: 'penitente', sector: 'E:F1' }], ['H:F1']);
    S = heroActing(S);
    const e = S.figures.find((f) => f.side === 'E')!;
    const snapshot = JSON.stringify(S);
    const t0 = performance.now();
    const fc = simulateAttack(S, { t: 'action', actionId: 'g_corte', figureId: 'h1', targetIds: [e.id] }, e.id, 200);
    const ms = performance.now() - t0;
    expect(JSON.stringify(S)).toBe(snapshot);
    expect(fc).not.toBeNull();
    // the sampled hit rate agrees with the exact odds of the dice rolled
    expect(fc!.dice.length).toBeGreaterThan(0);
    expect(Math.abs(fc!.hit - probAtLeastOneSuccess(fc!.dice as Grade[]))).toBeLessThan(0.07);
    expect(fc!.dmgMin).toBeGreaterThanOrEqual(0);
    expect(fc!.dmgMax).toBeGreaterThanOrEqual(fc!.dmgTypical);
    expect(fc!.kill).toBeGreaterThanOrEqual(0);
    expect(fc!.kill).toBeLessThanOrEqual(fc!.hit + 1e-9);
    console.log(`forecast g_corte vs penitente: hit ${fc!.hit.toFixed(2)} kill ${fc!.kill.toFixed(2)} dmg ${fc!.dmgMin}-${fc!.dmgMax} (typ ${fc!.dmgTypical}) imp ${fc!.impulso.toFixed(2)} dice ${fc!.dice.join('+')} · ${(ms / 200).toFixed(2)} ms/sample`);
  });
  it('a target with 1 HP dies whenever the attack connects', () => {
    let S = combat(['guerreiro'], [{ typeId: 'penitente', sector: 'E:F1' }], ['H:F1']);
    S = heroActing(S);
    const e = S.figures.find((f) => f.side === 'E')!;
    e.hp = 1;
    const fc = simulateAttack(S, { t: 'action', actionId: 'g_corte', figureId: 'h1', targetIds: [e.id] }, e.id, 120)!;
    expect(fc.kill).toBeCloseTo(fc.hit, 5);
  });
  it('an illegal command gives no forecast', () => {
    let S = combat(['guerreiro'], [{ typeId: 'penitente', sector: 'E:R5' }], ['H:F1']);
    S = heroActing(S);
    const e = S.figures.find((f) => f.side === 'E')!;
    expect(simulateAttack(S, { t: 'action', actionId: 'g_corte', figureId: 'h1', targetIds: [e.id] }, e.id, 20)).toBeNull();
  });
});
