import { describe, expect, it } from 'vitest';
import {
  readDie,
  raiseGrade,
  lowerGrade,
  rollDice,
  createRng,
  connections,
  canTarget,
  isValidArea2,
  sectorsAdjacent,
  isEngaged,
  hasRoom,
  faixaOf,
  emptyConditions,
  emptyCounters,
  type Figure,
  type SectorKey,
} from '../src';

function fig(id: string, side: 'H' | 'E', sector: SectorKey, extra: Partial<Figure> = {}): Figure {
  return { id, side, typeId: 'x', name: id, sector, status: 'active', hp: 5, maxHp: 5, armor: 0, conditions: emptyConditions(), counters: emptyCounters(), order: 0, isBoss: false, isMiniboss: false, profano: false, ...extra };
}

describe('§11 tabela universal de dados', () => {
  it('converte cada face corretamente', () => {
    const exp: Record<number, [number, number, boolean]> = { 1: [0, 0, false], 2: [0, 0, false], 3: [1, 0, false], 5: [1, 0, false], 6: [1, 1, false], 8: [1, 1, false], 9: [2, 1, false], 11: [2, 1, false], 12: [3, 0, true] };
    for (const [v, [s, i, c]] of Object.entries(exp)) {
      const r = readDie(Number(v));
      expect([r.successes, r.impulso, r.critico]).toEqual([s, i, c]);
    }
  });
  it('Grau sobe/desce dentro de D4–D12', () => {
    expect(raiseGrade(4)).toBe(6);
    expect(raiseGrade(10)).toBe(12);
    expect(raiseGrade(12)).toBe(12);
    expect(lowerGrade(4)).toBe(4);
    expect(lowerGrade(8)).toBe(6);
  });
  it('rolagens respeitam faces de D4/D6/D8/D10/D12 e o máximo de 3 dados', () => {
    const rng = createRng('dice');
    for (const g of [4, 6, 8, 10, 12] as const) {
      for (let i = 0; i < 500; i++) {
        const r = rollDice(rng, [{ grade: g, source: 't' }]);
        expect(r.dice[0].value).toBeGreaterThanOrEqual(1);
        expect(r.dice[0].value).toBeLessThanOrEqual(g);
      }
    }
    const r = rollDice(rng, [1, 2, 3, 4].map(() => ({ grade: 6 as const, source: 't' })));
    expect(r.dice.length).toBe(3);
  });
  it('RNG é determinístico pela semente', () => {
    const a = createRng('same');
    const b = createRng('same');
    const ra = rollDice(a, [{ grade: 12, source: '' }, { grade: 8, source: '' }]);
    const rb = rollDice(b, [{ grade: 12, source: '' }, { grade: 8, source: '' }]);
    expect(ra).toEqual(rb);
  });
});

describe('§5 Formação 5×2 — conexões', () => {
  it('conexões ortogonais no mesmo lado, nunca diagonal', () => {
    expect(connections('H:F3').sort()).toEqual(['H:F2', 'H:F4', 'H:R3'].sort());
    expect(connections('E:R1').sort()).toEqual(['E:R2', 'E:F1'].sort());
    expect(connections('H:F1')).not.toContain('H:R2');
  });
  it('Área 2 Setores: apenas ortogonais conectados', () => {
    expect(isValidArea2('E:F2', 'E:F3')).toBe(true);
    expect(isValidArea2('E:F2', 'E:R2')).toBe(true);
    expect(isValidArea2('E:F2', 'E:R3')).toBe(false);
    expect(isValidArea2('E:F2', 'H:F2')).toBe(false);
  });
  it('adjacência inclui mesmo Setor e Frentes opostas da mesma coluna', () => {
    expect(sectorsAdjacent('H:F2', 'H:F2')).toBe(true);
    expect(sectorsAdjacent('H:F2', 'E:F2')).toBe(true);
    expect(sectorsAdjacent('H:F2', 'E:F3')).toBe(false);
    expect(sectorsAdjacent('H:R2', 'E:R2')).toBe(false);
  });
  it('máximo 2 figuras por Setor', () => {
    const figs = [fig('a', 'H', 'H:F1'), fig('b', 'H', 'H:F1')];
    expect(hasRoom(figs, 'H:F1')).toBe(false);
    expect(hasRoom(figs, 'H:F1', 'a')).toBe(true);
  });
});

describe('§7 Engajamento e §8 alcances', () => {
  const h = fig('h', 'H', 'H:F2');
  const hr = fig('hr', 'H', 'H:R2');
  const e = fig('e', 'E', 'E:F2');
  const er = fig('er', 'E', 'E:R2');
  const figs = [h, hr, e, er];
  it('Frentes opostas da mesma coluna ficam Engajadas; Caído não engaja', () => {
    expect(isEngaged(h, figs)).toBe(true);
    expect(isEngaged(hr, figs)).toBe(false);
    expect(isEngaged(h, [{ ...h }, { ...e, status: 'caido' }])).toBe(false);
  });
  it('Corpo a Corpo: atacante na Frente, mesma coluna; Frente bloqueia Retaguarda', () => {
    expect(canTarget('H:F2', e, 'cac', figs, 'H')).toBe(true);
    expect(canTarget('H:F2', er, 'cac', figs, 'H')).toBe(false);
    expect(canTarget('H:R2', e, 'cac', figs, 'H')).toBe(false);
    expect(canTarget('H:F3', e, 'cac', figs, 'H')).toBe(false);
  });
  it('Coluna aberta permite atingir a Retaguarda', () => {
    expect(canTarget('H:F2', er, 'cac', [h, er], 'H')).toBe(true);
  });
  it('Alcance: atacante na Retaguarda pode atingir a Frente; a própria Frente não bloqueia', () => {
    expect(canTarget('H:R2', e, 'alcance', figs, 'H')).toBe(true);
    expect(canTarget('H:R2', er, 'alcance', figs, 'H')).toBe(false);
  });
  it('Distância: qualquer coluna e fileira', () => {
    expect(canTarget('H:R5', er, 'distancia', figs, 'H')).toBe(true);
  });
  it('Faixas do Arqueiro', () => {
    expect(faixaOf('H:F1', 'E:F4')).toBe('proxima');
    expect(faixaOf('H:R1', 'E:F4')).toBe('media');
    expect(faixaOf('H:R1', 'E:R4')).toBe('longa');
  });
});
