/**
 * NÃO CANÔNICO — fixture used only by automated tests to prove that a Dungeon plugs in by data
 * without changing the engine (Fase 6 / aceite 16). Hidden: never listed in the campaign UI.
 */
import type { DungeonDef } from '@mosteiro/core';

export const TEST_DUNGEON: DungeonDef = {
  id: 'test-fixture',
  number: 99,
  name: '[TESTE] Câmara de Ensaio',
  subtitle: 'Fixture não canônica',
  canonical: false,
  hidden: true,
  modes: ['basico'],
  locations: [
    { id: 'T1', code: 'TST', name: 'Câmara de Ensaio', public: true, map: { x: 50, y: 50 }, scene: 'galeria', ambience: 'amb_torches_fire', arrival: 'Sala vazia de testes.', source: 'test' },
  ],
  encounters: [
    {
      id: 'T-E01', code: 'T-E01', name: 'Ensaio', locationId: 'T1', kind: 'obrigatorio', music: 'music_combat', source: 'test',
      compositions: [['penitente'], ['penitente'], ['penitente'], ['penitente'], ['penitente']],
      cover: [], entries: ['E:R3'], rewards: { gold: [1, 1, 1, 1, 1] }, intro: 'Teste.',
    },
  ],
  archive: {},
  startNode: 'T1',
  stateCards: {},
  options: (s) => (s.completed.includes('T-E01') ? [] : [{ id: 'fight', label: 'Ensaiar', kind: 'combat', encounterId: 'T-E01' }]),
  choose: () => ({ encounterId: 'T-E01' }),
  combatContext: () => ({}),
  onVictory: () => undefined,
  afterRewards: (s) => {
    s.phase = 'epilogue';
    s.epilogue = { code: 'T', title: 'Fim do teste', text: 'Fixture concluída.' };
  },
  epilogue: () => ({ code: 'T', title: 'Fim do teste', text: '' }),
};
