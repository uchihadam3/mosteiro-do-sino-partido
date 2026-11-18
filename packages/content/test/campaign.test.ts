import { beforeAll, describe, expect, it } from 'vitest';
import { campaignDispatch, dungeon, dungeons, migrate, newCampaign, toEnvelope, reg, type CampaignState } from '@mosteiro/core';
import { autoplayCampaign, installContent } from '../src';

beforeAll(() => installContent());
const CLASSES = ['guerreiro', 'paladino', 'arcanista', 'clerigo', 'arqueiro', 'ladino'];
function camp(n: number, seed = 's') {
  return newCampaign({ seed, dungeonId: 'd1', heroes: CLASSES.slice(0, n).map((c) => ({ classId: c, name: c })) });
}

describe('D1 Básico ponta a ponta (aceites 02, 03, 05, 07)', () => {
  for (const n of [1, 2, 3, 4, 5]) {
    for (const route of ['leste', 'oeste'] as const) {
      it(`${n} herói(s), rota ${route}, caminho obrigatório apenas`, () => {
        const r = autoplayCampaign(camp(n, `main-${n}-${route}`), { route, optionals: false, decipher: false });
        expect(r.errors).toEqual([]);
        expect(['victory', 'gameover']).toContain(r.outcome);
        if (r.outcome === 'victory') {
          expect(r.state.completed).toContain('CAM-E01');
          // §31 main-route gold: 8/11/14/17/20
          expect(r.state.gold).toBe([8, 11, 14, 17, 20][n - 1]);
          if (route === 'oeste') expect(r.state.completed).toEqual(expect.arrayContaining(['CAN-E01', 'CAR-E01']));
          expect(r.state.completed.some((x) => x === 'RARO-L' || x === 'RARO-O' || x === 'CAP-E01' || x === 'REL-E01' || x === 'CRI-E01')).toBe(false);
        }
      });
    }
  }
});

describe('Segredos do Básico §61 (aceites 04, 05, 06, 15)', () => {
  it('Relicário só é revelado com Sete Linhas decifradas no Scriptorium', () => {
    const noDecipher = autoplayCampaign(camp(3, 'rel-a'), { route: 'leste', optionals: true, decipher: false, maxCommands: 30000 });
    expect(noDecipher.state.flags['relRevealed']).toBeFalsy();
    for (const opts of noDecipher.seenOptions) expect(opts).not.toContain('go_rel');
    // with decipher: arcanista/arqueiro try every Cycle
    let revealed = false;
    for (const seed of ['rel-b', 'rel-c', 'rel-d', 'rel-e']) {
      const r = autoplayCampaign(camp(3, seed), { route: 'leste', optionals: true, decipher: true });
      if (r.state.flags['relRevealed']) {
        revealed = true;
        expect(r.state.archiveRead).toContain('B-SCR-01');
        const firstRel = r.seenOptions.findIndex((o) => o.includes('go_rel'));
        expect(firstRel).toBeGreaterThan(-1);
        break;
      }
    }
    expect(revealed).toBe(true);
  });
  it('Cripta/Vigia: nunca antes de Silêncio + Palavra/Peso; B-VIG-01 é lido', () => {
    const r = autoplayCampaign(camp(4, 'vig'), { route: 'oeste', optionals: true, decipher: false });
    expect(r.errors).toEqual([]);
    const idxCri = r.seenOptions.findIndex((o) => o.includes('go_cri'));
    if (r.state.flags['criptaRevealed']) {
      expect(r.state.archiveRead).toContain('B-VIG-01');
      expect(r.state.flags['state:marcaSilencio']).toBe(true);
      expect(r.state.flags['state:marcaPeso']).toBe(true);
      expect(idxCri).toBeGreaterThan(-1);
    }
    // never offered before both marks
    const s0 = camp(2, 'spoil');
    const opts = dungeon('d1').options({ ...s0, node: 'CLA', phase: 'explore', flags: { route: 'leste', routeDone: true, rareOffered: true, 'state:marcaSilencio': true } } as CampaignState);
    expect(opts.map((o) => o.id)).not.toContain('go_cri');
  });
  it('No máximo 1 Raro de rota; Oeste não oferece o raro Leste', () => {
    const r = autoplayCampaign(camp(2, 'rare'), { route: 'oeste', optionals: true, decipher: false });
    const afterRoute = r.seenOptions.slice(r.seenOptions.map((o) => o.includes('go_can')).lastIndexOf(true) + 1);
    for (const o of afterRoute) expect(o).not.toContain('go_scr');
    expect(r.state.completed.filter((x) => x.startsWith('RARO')).length).toBeLessThanOrEqual(1);
    expect(r.state.completed).not.toContain('RARO-L');
  });
  it('Iniciar o Salão encerra as oportunidades opcionais', () => {
    const s = camp(2, 'sal');
    const st = { ...s, node: 'CLA', phase: 'explore' as const, flags: { route: 'leste', routeDone: true, rareOffered: true, relRevealed: true, salaoStarted: true } };
    const ids = dungeon('d1').options(st as CampaignState).map((o) => o.id);
    expect(ids).not.toContain('go_cap');
    expect(ids).not.toContain('go_rare');
    expect(ids).not.toContain('go_rel');
  });
  it('mapa público não contém REL nem Cripta antes da revelação', () => {
    let s = camp(1, 'map');
    s = campaignDispatch(s, { t: 'beginDungeon' }).state;
    expect(s.revealed).not.toContain('REL');
    expect(s.revealed).not.toContain('CRI');
  });
});

describe('Save, economia e progressão (aceites 11, 16)', () => {
  it('save envelope com checksum e rejeição de corrupção', () => {
    const s = camp(2, 'save');
    const env = toEnvelope(s, 'slot 1', 0);
    expect(migrate(structuredClone(env))).toEqual(s);
    const bad = structuredClone(env);
    bad.state.gold = 999;
    expect(() => migrate(bad)).toThrow(/corrompido/);
  });
  it('salvar no meio do combate e recarregar mantém o estado idêntico', () => {
    let s = camp(2, 'midsave');
    s = campaignDispatch(s, { t: 'beginDungeon' }).state;
    s = campaignDispatch(s, { t: 'closeNarrative' }).state;
    s = campaignDispatch(s, { t: 'explore', optionId: 'go_gal' }).state;
    expect(s.phase).toBe('combat');
    const reloaded = migrate(JSON.parse(JSON.stringify(toEnvelope(s, 'auto', 0))));
    expect(reloaded).toEqual(s);
  });
  it('retorno à Base concede +1 Maestria e +1 Talento; T1 compra e T2 bloqueado', () => {
    const r = autoplayCampaign(camp(1, 'base1'), { route: 'leste', optionals: false, decipher: false });
    if (r.outcome !== 'victory') return;
    let s = r.state;
    expect(s.phase).toBe('base');
    const h = s.heroes[0];
    expect(h.masteryPoints).toBe(1);
    expect(h.talentPoints).toBe(1);
    expect(s.base!.vitrine.comum.length).toBe(4);
    expect(s.base!.vitrine.raro.length).toBe(2);
    const t1 = Object.values(reg().talents).find((t) => t.classId === h.classId && t.tier === 1)!;
    const t2 = Object.values(reg().talents).find((t) => t.classId === h.classId && t.tier === 2)!;
    expect(campaignDispatch(s, { t: 'talent', heroId: h.id, talentId: t2.id }).error).toMatch(/T2/);
    s = campaignDispatch(s, { t: 'talent', heroId: h.id, talentId: t1.id }).state;
    expect(s.heroes[0].talents).toContain(t1.id);
    const d4 = (Object.entries(h.attrs).find(([, g]) => g === 4) ?? [])[0] as any;
    s = campaignDispatch(s, { t: 'mastery', heroId: h.id, attr: d4 }).state;
    expect(s.heroes[0].attrs[d4 as 'poder']).toBe(6);
  });
  it('Dungeon de teste não canônica é plugável e oculta', () => {
    const test = dungeons().find((d) => d.id === 'test-fixture')!;
    expect(test.hidden).toBe(true);
    expect(test.canonical).toBe(false);
    const s = newCampaign({ seed: 't', dungeonId: 'test-fixture', heroes: [{ classId: 'guerreiro', name: 'G' }] });
    const r = autoplayCampaign(s, { route: 'leste', optionals: false, decipher: false });
    expect(r.state.completed).toContain('T-E01');
  });
});
