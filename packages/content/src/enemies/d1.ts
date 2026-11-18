/**
 * Bestiário D1 — fichas e Intenções (Regra Mestra §34, §43). Status: APROVADO PARA PLAYTEST.
 * Every intent cites its text verbatim in `text`; `plan` implements it with the engine helpers.
 * Interpretations flagged HIPÓTESE are listed in docs/OPEN_DESIGN_QUESTIONS.md.
 */
import {
  adjacent,
  adjacentHeroes,
  applyCondition,
  attackIntent,
  bestHeroColumn,
  bestHeroSector,
  canAttackNow,
  connections,
  defaultTarget,
  engagedNow,
  enemies,
  fig,
  guardOps,
  hasRoom,
  heroAlliesAdjacent,
  heroes,
  heroesInColumn,
  heroHasCondition,
  isActive,
  isEngaged,
  log,
  makeSpec,
  markUse,
  canUse,
  moveTo,
  moveTowardTarget,
  nearAllies,
  parseSector,
  pathToAttack,
  pushOps,
  rearOf,
  retreat,
  setCond,
  sk,
  tryFig,
  newId,
  type Ctx,
  type EnemyDef,
  type Figure,
  type IntentDef,
  type SectorKey,
} from '@mosteiro/core';

const P = (section: string, note?: string) => ({ section, status: 'PLAYTEST' as const, note });

// ----------------------------------------------------------------------------- helpers
function isPenitente(f: Figure) {
  return f.typeId === 'penitente';
}
function penitentesAdjacentTo(c: Ctx, h: Figure, exceptId?: string) {
  return enemies(c).filter((e) => isPenitente(e) && e.id !== exceptId && adjacent(e, h)).length;
}
function call(c: Ctx, fn: string, args: Record<string, unknown>) {
  pushOps(c, [{ op: 'call', fn, args }], false);
}

// ============================================================================ Penitente Oco
const penitente: EnemyDef = {
  id: 'penitente',
  name: 'Penitente Oco',
  tier: 'comum',
  tierLabel: 'Comum · Profano',
  hp: 4,
  armor: 0,
  profano: true,
  prefers: 'F',
  prefab: 'penitente',
  source: P('§43 Penitente Oco'),
  lore: 'Monges que continuaram ajoelhados depois que a fé os deixou. A cinza ocupa o lugar da carne.',
  passives: [{ name: 'Multidão Oca', text: 'Ao atacar herói Adjacente a outro Penitente, +1 Dano; não acumula.' }],
  damageBonus: (c, self, target) => (penitentesAdjacentTo(c, target, self.id) > 0 ? 1 : 0),
  intents: [
    {
      id: 'pen_arrastar',
      name: 'Arrastar-se',
      tempo: 'rapido',
      kind: 'move',
      text: 'Mova até 2 conexões; se terminar Engajado, Guardado; sem Ataque.',
      plan(c, self) {
        moveTowardTarget(c, self, 2, 'cac');
        call(c, 'enemy:guardIfEngaged', { id: self.id });
      },
    },
    {
      id: 'pen_fome',
      name: 'Fome',
      tempo: 'rapido',
      kind: 'melee',
      dano: 2,
      def: 'guarda',
      text: 'Se já Engajado, Dano 2, Defesa Guarda; senão mova até 2.',
      plan(c, self) {
        if (engagedNow(c, self)) attackIntent(c, self, { cat: 'cac', dano: 2, def: 'guarda', move: 0, name: 'Fome', intentId: 'pen_fome', school: 'flesh' });
        else moveTowardTarget(c, self, 2, 'cac');
      },
    },
    {
      id: 'pen_unhas',
      name: 'Unhas Partidas',
      tempo: 'tatico',
      kind: 'melee',
      dano: 2,
      def: 'guarda',
      text: 'Mova 1; Dano 2, Defesa Guarda.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 2, def: 'guarda', move: 1, name: 'Unhas Partidas', intentId: 'pen_unhas', school: 'flesh' });
      },
    },
    {
      id: 'pen_mordida',
      name: 'Mordida Cinzenta',
      tempo: 'tatico',
      kind: 'melee',
      dano: 1,
      def: 'guarda',
      text: 'Mova 1; Dano 1, Defesa Guarda; Dano final → Sangramento 1.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 1, def: 'guarda', move: 1, name: 'Mordida Cinzenta', intentId: 'pen_mordida', school: 'flesh', onDamage: [{ kind: 'cond', cond: 'sangramento', n: 1 }] });
      },
    },
    {
      id: 'pen_agarrar',
      name: 'Agarrar as Pernas',
      tempo: 'pesado',
      kind: 'control',
      dano: 1,
      def: 'agilidade',
      text: 'Mova 1; Dano 1, Defesa Agilidade; Defesa com 0 Sucessos → Imobilizado.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 1, def: 'agilidade', move: 1, name: 'Agarrar as Pernas', intentId: 'pen_agarrar', school: 'flesh', onZero: [{ kind: 'cond', cond: 'imobilizado' }] });
      },
    },
    {
      id: 'pen_todos',
      name: 'Todos Sobre Ele',
      tempo: 'pesado',
      kind: 'melee',
      dano: 2,
      def: 'guarda',
      text: 'Priorize herói Adjacente ao maior número de Penitentes; mova 1; Dano 2, Defesa Guarda; Multidão Oca pode elevar para 3.',
      plan(c, self) {
        const max = Math.max(0, ...heroes(c).map((h) => penitentesAdjacentTo(c, h)));
        attackIntent(c, self, {
          cat: 'cac',
          dano: 2,
          def: 'guarda',
          move: 1,
          name: 'Todos Sobre Ele',
          intentId: 'pen_todos',
          school: 'flesh',
          prefer: max > 0 ? (h) => penitentesAdjacentTo(c, h) === max : undefined,
        });
      },
    },
  ],
};

// ============================================================================ Cão de Cinza
const isolated = (c: Ctx, h: Figure) => heroAlliesAdjacent(c, h) === 0;
const cao: EnemyDef = {
  id: 'cao',
  name: 'Cão de Cinza',
  tier: 'comum',
  tierLabel: 'Comum',
  hp: 3,
  armor: 0,
  profano: false,
  prefers: 'F',
  prefab: 'cao',
  source: P('§43 Cão de Cinza'),
  lore: 'Os cães da Vigília ainda farejam peregrinos perdidos — agora para devorá-los.',
  passives: [{ name: 'Caça ao Isolado', text: 'Ataques contra herói sem aliado Adjacente causam +1 Dano.' }],
  damageBonus: (c, _self, target) => (isolated(c, target) ? 1 : 0),
  intents: [
    {
      id: 'cao_farejar',
      name: 'Farejar',
      tempo: 'rapido',
      kind: 'move',
      text: 'Priorize herói com menos aliados Adjacentes; mova 2; Guardado; sem Ataque.',
      plan(c, self) {
        const min = Math.min(...heroes(c).map((h) => heroAlliesAdjacent(c, h)));
        moveTowardTarget(c, self, 2, 'cac', (h) => heroAlliesAdjacent(c, h) === min);
        guardOps(c, self, [self.id]);
      },
    },
    {
      id: 'cao_rodear',
      name: 'Rodear',
      tempo: 'rapido',
      kind: 'melee',
      dano: 1,
      def: 'agilidade',
      text: 'Mova 2 buscando alvo já pressionado; se atacar, Dano 1, Defesa Agilidade.',
      plan(c, self) {
        attackIntent(c, self, {
          cat: 'cac',
          dano: 1,
          def: 'agilidade',
          move: 2,
          name: 'Rodear',
          intentId: 'cao_rodear',
          school: 'flesh',
          prefer: (h) => isEngaged(h, c.S.figures),
        });
      },
    },
    {
      id: 'cao_bote',
      name: 'Bote',
      tempo: 'tatico',
      kind: 'melee',
      dano: 2,
      def: 'agilidade',
      text: 'Mova 2; Dano 2, Defesa Agilidade.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 2, def: 'agilidade', move: 2, name: 'Bote', intentId: 'cao_bote', school: 'flesh' });
      },
    },
    {
      id: 'cao_tendao',
      name: 'Rasgar Tendão',
      tempo: 'tatico',
      kind: 'melee',
      dano: 1,
      def: 'agilidade',
      text: 'Mova 1; Dano 1, Defesa Agilidade; Dano final → Sangramento 1.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 1, def: 'agilidade', move: 1, name: 'Rasgar Tendão', intentId: 'cao_tendao', school: 'flesh', onDamage: [{ kind: 'cond', cond: 'sangramento', n: 1 }] });
      },
    },
    {
      id: 'cao_recuar',
      name: 'Atacar e Recuar',
      tempo: 'tatico',
      kind: 'melee',
      dano: 1,
      def: 'agilidade',
      text: 'Mova 1; Dano 1, Defesa Agilidade; depois Passo 1 para longe; pode sair de Engajamento.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 1, def: 'agilidade', move: 1, name: 'Atacar e Recuar', intentId: 'cao_recuar', school: 'flesh' });
        call(c, 'enemy:retreat', { id: self.id, n: 1, leave: true });
      },
    },
    {
      id: 'cao_matar',
      name: 'Matar o Perdido',
      tempo: 'pesado',
      kind: 'melee',
      dano: 2,
      def: 'agilidade',
      text: 'Priorize isolado; Dano 2, Defesa Agilidade; Caça ao Isolado pode tornar Dano 3.',
      plan(c, self) {
        // HIPÓTESE Q-NOMOVE: intent without written Movement does not move.
        attackIntent(c, self, { cat: 'cac', dano: 2, def: 'agilidade', move: 0, noMove: true, name: 'Matar o Perdido', intentId: 'cao_matar', school: 'flesh', prefer: (h) => isolated(c, h) });
      },
    },
  ],
};

// ============================================================================ Besteiro do Claustro
function besteiroIgnoresCover(self: Figure) {
  // Mira Apoiada: if it did not move this Activation, the first Distância attack ignores Cobertura.
  return (self.counters.activation['moved'] ?? 0) === 0;
}
function besteiroShot(c: Ctx, self: Figure, o: { dano: number; def: 'agilidade' | 'precisao'; name: string; id: string; onDamage?: any[]; onZero?: any[]; ignoreCover?: boolean }) {
  const ignore = o.ignoreCover || besteiroIgnoresCover(self);
  attackIntent(c, self, { cat: 'distancia', dano: o.dano, def: o.def, move: 0, noMove: true, name: o.name, intentId: o.id, school: 'bolt', onDamage: o.onDamage, onZero: o.onZero, ignoreCover: ignore });
}
const besteiro: EnemyDef = {
  id: 'besteiro',
  name: 'Besteiro do Claustro',
  tier: 'comum',
  tierLabel: 'Comum',
  hp: 3,
  armor: 0,
  profano: false,
  prefers: 'R',
  prefab: 'besteiro',
  source: P('§43 Besteiro do Claustro'),
  lore: 'Guardas leigos que juraram defender o claustro. As bestas ainda estão carregadas.',
  passives: [{ name: 'Mira Apoiada', text: 'Se não se mover na Ativação, o primeiro Ataque de Distância ignora Cobertura.' }],
  intents: [
    {
      id: 'bes_posicionar',
      name: 'Posicionar',
      tempo: 'rapido',
      kind: 'ranged',
      dano: 1,
      def: 'agilidade',
      text: 'Mova 1; Distância Dano 1, Defesa Agilidade.',
      plan(c, self) {
        // Distância always has a legal target → movement "only as needed" is 0 (§33).
        besteiroShot(c, self, { dano: 1, def: 'agilidade', name: 'Posicionar', id: 'bes_posicionar' });
      },
    },
    {
      id: 'bes_recuperar',
      name: 'Recuperar Distância',
      tempo: 'rapido',
      kind: 'ranged',
      dano: 2,
      def: 'agilidade',
      text: 'Se pressionado/Engajado, mova 1 para Retaguarda podendo sair de Engajamento; Dano 1; se já seguro, Dano 2.',
      plan(c, self) {
        if (engagedNow(c, self)) {
          const rear = rearOf(self);
          if (hasRoom(c.S.figures, rear, self.id)) {
            pushOps(c, [{ op: 'move', id: self.id, path: [self.sector, rear], forced: false, voluntary: true, canLeaveEngagement: true, stopOnEngage: false }], false);
            self.counters.activation['moved'] = 1;
          }
          attackIntent(c, self, { cat: 'distancia', dano: 1, def: 'agilidade', move: 0, noMove: true, name: 'Recuperar Distância', intentId: 'bes_recuperar', school: 'bolt' });
        } else besteiroShot(c, self, { dano: 2, def: 'agilidade', name: 'Recuperar Distância', id: 'bes_recuperar' });
      },
    },
    {
      id: 'bes_limpo',
      name: 'Disparo Limpo',
      tempo: 'tatico',
      kind: 'ranged',
      dano: 2,
      def: 'agilidade',
      text: 'Sem movimento; Distância Dano 2, Defesa Agilidade.',
      plan(c, self) {
        besteiroShot(c, self, { dano: 2, def: 'agilidade', name: 'Disparo Limpo', id: 'bes_limpo' });
      },
    },
    {
      id: 'bes_farpado',
      name: 'Virote Farpado',
      tempo: 'tatico',
      kind: 'ranged',
      dano: 1,
      def: 'agilidade',
      text: 'Distância Dano 1, Defesa Agilidade; Dano → Sangramento 1.',
      plan(c, self) {
        besteiroShot(c, self, { dano: 1, def: 'agilidade', name: 'Virote Farpado', id: 'bes_farpado', onDamage: [{ kind: 'cond', cond: 'sangramento', n: 1 }] });
      },
    },
    {
      id: 'bes_prender',
      name: 'Prender ao Chão',
      tempo: 'tatico',
      kind: 'control',
      dano: 1,
      def: 'agilidade',
      text: 'Distância Dano 1, Defesa Agilidade; Defesa com 0 Sucessos → Imobilizado.',
      plan(c, self) {
        besteiroShot(c, self, { dano: 1, def: 'agilidade', name: 'Prender ao Chão', id: 'bes_prender', onZero: [{ kind: 'cond', cond: 'imobilizado' }] });
      },
    },
    {
      id: 'bes_mortal',
      name: 'Mira Mortal',
      tempo: 'pesado',
      kind: 'ranged',
      dano: 3,
      def: 'precisao',
      text: 'Sem movimento; Distância Dano 3, Defesa Precisão; ignora Cobertura.',
      plan(c, self) {
        besteiroShot(c, self, { dano: 3, def: 'precisao', name: 'Mira Mortal', id: 'bes_mortal', ignoreCover: true });
      },
    },
  ],
};

// ============================================================================ Escudeiro da Cinza
const escudeiro: EnemyDef = {
  id: 'escudeiro',
  name: 'Escudeiro da Cinza',
  tier: 'comum',
  tierLabel: 'Comum pesado',
  hp: 6,
  armor: 1,
  profano: false,
  prefers: 'F',
  prefab: 'escudeiro',
  source: P('§43 Escudeiro da Cinza'),
  lore: 'Escudos de carvalho cobertos de fuligem. Eles não atacam primeiro — esperam você errar.',
  passives: [{ name: 'Interpor', text: 'Uma vez por Ciclo, quando aliado comum/Elite Adjacente for alvo de Corpo a Corpo/Alcance e o Escudeiro for alvo legal, pode receber o Ataque.' }],
  intents: [
    {
      id: 'esc_parede',
      name: 'Parede de Escudo',
      tempo: 'rapido',
      kind: 'buff',
      text: 'Mova 1; ele e aliado Adjacente Guardado.',
      plan(c, self) {
        moveTowardTarget(c, self, 1, 'cac');
        call(c, 'enemy:guardSelfAndAdjacent', { id: self.id, n: 1 });
      },
    },
    {
      id: 'esc_fincar',
      name: 'Fincar Posição',
      tempo: 'rapido',
      kind: 'buff',
      text: 'Guardado; até próxima Ativação ignora primeiro Empurrar/Puxar.',
      plan(c, self) {
        guardOps(c, self, [self.id]);
        call(c, 'enemy:fincar', { id: self.id });
      },
    },
    {
      id: 'esc_borda',
      name: 'Borda do Escudo',
      tempo: 'tatico',
      kind: 'melee',
      dano: 2,
      def: 'guarda',
      text: 'Mova 1; Dano 2, Defesa Guarda.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 2, def: 'guarda', move: 1, name: 'Borda do Escudo', intentId: 'esc_borda', school: 'blunt' });
      },
    },
    {
      id: 'esc_empurrao',
      name: 'Empurrão',
      tempo: 'tatico',
      kind: 'melee',
      dano: 1,
      def: 'poder',
      text: 'Dano 1, Defesa Poder; Dano → Empurrar 1.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 1, def: 'poder', move: 0, noMove: true, name: 'Empurrão', intentId: 'esc_empurrao', school: 'blunt', onDamage: [{ kind: 'push' }] });
      },
    },
    {
      id: 'esc_cobrir',
      name: 'Cobrir a Linha',
      tempo: 'tatico',
      kind: 'buff',
      dano: 1,
      def: 'guarda',
      text: 'Mova 1 em direção ao aliado; ambos Guardado; se já Engajado, antes disso Dano 1, Defesa Guarda.',
      plan(c, self) {
        if (engagedNow(c, self)) attackIntent(c, self, { cat: 'cac', dano: 1, def: 'guarda', move: 0, noMove: true, name: 'Cobrir a Linha', intentId: 'esc_cobrir', school: 'blunt' });
        else {
          const ally = enemies(c).filter((e) => e.id !== self.id).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.order - b.order)[0];
          if (ally) moveTo(c, self, ally.sector, 1);
        }
        call(c, 'enemy:guardSelfAndAdjacent', { id: self.id, n: 1 });
      },
    },
    {
      id: 'esc_joelho',
      name: 'Quebra-Joelho',
      tempo: 'pesado',
      kind: 'melee',
      dano: 3,
      def: 'guarda',
      text: 'Mova 1; Dano 3, Defesa Guarda; controle de Quebrado (Defesa com 0 Sucessos).',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 3, def: 'guarda', move: 1, name: 'Quebra-Joelho', intentId: 'esc_joelho', school: 'blunt', onZero: [{ kind: 'cond', cond: 'quebrado' }] });
      },
    },
  ],
};

// ============================================================================ Acólito do Sino
function areaSectorAttack(c: Ctx, self: Figure, o: { dano: number; def: any; name: string; id: string; onZero?: any[]; onDamage?: any[]; school?: any }) {
  const k = bestHeroSector(c, self);
  if (!k) return;
  const targets = heroes(c).filter((h) => h.sector === k);
  pushOps(c, [{ op: 'eAttack', spec: { ...makeSpec(c, self, { cat: 'distancia', dano: o.dano, def: o.def, move: 0, name: o.name, intentId: o.id, school: o.school ?? 'bell', onZero: o.onZero, onDamage: o.onDamage }, targets), data: { area: true } } }], false);
}
const canto = (c: Ctx, self: Figure) => {
  attackIntent(c, self, { cat: 'distancia', dano: 1, def: 'espirito', move: 0, noMove: true, name: 'Canto da Fraqueza', intentId: 'aco_canto', school: 'profane', onZero: [{ kind: 'cond', cond: 'quebrado' }] });
};
const acolito: EnemyDef = {
  id: 'acolito',
  name: 'Acólito do Sino',
  tier: 'comum',
  tierLabel: 'Comum de suporte · Profano',
  hp: 4,
  armor: 0,
  profano: true,
  prefers: 'R',
  prefab: 'acolito',
  source: P('§43 Acólito do Sino'),
  lore: 'Ainda tocam sinos de mão para chamar fiéis. Ninguém vivo atende.',
  passives: [{ name: 'Voz do Sino', text: 'Ataques espirituais ignoram Cobertura quando a carta disser.' }],
  intents: [
    {
      id: 'aco_bencao',
      name: 'Bênção Cinzenta',
      tempo: 'rapido',
      kind: 'buff',
      text: 'Até 2 aliados próximos Guardado; depois mova 1.',
      plan(c, self) {
        call(c, 'enemy:guardNear', { id: self.id, n: 2, includeSelf: false });
        moveTowardTarget(c, self, 1, 'distancia');
      },
    },
    {
      id: 'aco_curta',
      name: 'Badalada Curta',
      tempo: 'rapido',
      kind: 'area',
      dano: 1,
      def: 'espirito',
      text: 'Um Setor de heróis; figuras ali defendem Dano 1, Defesa Espírito.',
      plan(c, self) {
        areaSectorAttack(c, self, { dano: 1, def: 'espirito', name: 'Badalada Curta', id: 'aco_curta' });
      },
    },
    {
      id: 'aco_canto',
      name: 'Canto da Fraqueza',
      tempo: 'tatico',
      kind: 'ranged',
      dano: 1,
      def: 'espirito',
      text: 'Distância Dano 1, Defesa Espírito; aplica Quebrado (Defesa com 0 Sucessos).',
      plan: canto,
    },
    {
      id: 'aco_chamado',
      name: 'Chamado à Vigília',
      tempo: 'tatico',
      kind: 'move',
      text: 'Um aliado próximo Passo 1; depois o Acólito move 1.',
      plan(c, self) {
        call(c, 'enemy:allyStep', { id: self.id, n: 1, count: 1 });
        moveTowardTarget(c, self, 1, 'distancia');
      },
    },
    {
      id: 'aco_longa',
      name: 'Badalada Longa',
      tempo: 'pesado',
      kind: 'area',
      dano: 2,
      def: 'espirito',
      text: 'Escolha coluna de heróis; Frente/Retaguarda defendem separadamente Dano 2, Espírito.',
      plan(c, self) {
        const col = bestHeroColumn(c, self);
        if (col == null) return;
        const targets = heroesInColumn(c, col);
        pushOps(c, [{ op: 'eAttack', spec: { ...makeSpec(c, self, { cat: 'distancia', dano: 2, def: 'espirito', move: 0, name: 'Badalada Longa', intentId: 'aco_longa', school: 'bell' }, targets), data: { area: true } } }], false);
      },
    },
    {
      id: 'aco_sacrificio',
      name: 'Sacrifício do Servo',
      tempo: 'pesado',
      kind: 'heal',
      text: 'Aliado ferido próximo cura 2; Acólito sofre 1 Dano Direto; se ninguém ferido, use Canto da Fraqueza.',
      plan(c, self) {
        const hurt = nearAllies(c, self).filter((e) => e.hp < e.maxHp);
        if (!hurt.length) return canto(c, self);
        pushOps(c, [{ op: 'heal', targetId: hurt[0].id, amount: 2, sourceId: self.id }, { op: 'directDamage', targetId: self.id, amount: 1, sourceId: self.id, school: 'profane' }], false);
      },
    },
  ],
};

// ============================================================================ Turiferário Cego
function smokeConnected(c: Ctx, self: Figure, n: 1 | 2) {
  call(c, 'turiferario:smoke', { id: self.id, n });
}
const turiferario: EnemyDef = {
  id: 'turiferario',
  name: 'Turiferário Cego',
  tier: 'raro',
  tierLabel: 'Raro · Profano',
  hp: 5,
  armor: 0,
  profano: true,
  prefers: 'R',
  prefab: 'turiferario',
  source: P('§43 Turiferário Cego'),
  lore: 'Os olhos queimaram há décadas. O turíbulo nunca apagou.',
  passives: [{ name: 'Fumo Litúrgico', text: 'Cria Fumaça/Cobertura nos Setores inimigos indicados por suas cartas; nunca concede vantagem acidental aos heróis.' }],
  intents: [
    {
      id: 'tur_erguer',
      name: 'Erguer o Turíbulo',
      tempo: 'rapido',
      kind: 'buff',
      text: 'Reposicione para Retaguarda se possível; crie Fumaça em Setor inimigo conectado até próxima Ativação.',
      plan(c, self) {
        const rear = rearOf(self);
        if (parseSector(self.sector).row === 'F' && hasRoom(c.S.figures, rear, self.id))
          pushOps(c, [{ op: 'move', id: self.id, path: [self.sector, rear], forced: false, voluntary: true, canLeaveEngagement: false, stopOnEngage: false }], false);
        smokeConnected(c, self, 1);
      },
    },
    {
      id: 'tur_passos',
      name: 'Passos pelo Fumo',
      tempo: 'rapido',
      kind: 'move',
      text: 'Mova 2; pode sair de Engajamento.',
      plan(c, self) {
        retreat(c, self, 2, true);
      },
    },
    {
      id: 'tur_brasa',
      name: 'Brasa do Turíbulo',
      tempo: 'tatico',
      kind: 'ranged',
      dano: 1,
      def: 'espirito',
      text: 'Distância Dano 1, Defesa Espírito; Dano → Queimando.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'distancia', dano: 1, def: 'espirito', move: 0, noMove: true, name: 'Brasa do Turíbulo', intentId: 'tur_brasa', school: 'fire', onDamage: [{ kind: 'cond', cond: 'queimando' }] });
      },
    },
    {
      id: 'tur_nuvem',
      name: 'Nuvem Cega',
      tempo: 'tatico',
      kind: 'area',
      dano: 1,
      def: 'determinacao',
      text: 'Heróis no Setor alvo defendem Dano 1, Determinação; 0 Sucessos → sem Reações até início da próxima Ativação.',
      plan(c, self) {
        areaSectorAttack(c, self, { dano: 1, def: 'determinacao', name: 'Nuvem Cega', id: 'tur_nuvem', school: 'profane', onZero: [{ kind: 'cond', cond: 'semReacoes' }] });
      },
    },
    {
      id: 'tur_cinza',
      name: 'Cinza nos Olhos',
      tempo: 'pesado',
      kind: 'control',
      dano: 2,
      def: 'precisao',
      text: 'Distância Dano 2, Defesa Precisão; 0 Sucessos → Atordoado.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'distancia', dano: 2, def: 'precisao', move: 0, noMove: true, name: 'Cinza nos Olhos', intentId: 'tur_cinza', school: 'profane', onZero: [{ kind: 'cond', cond: 'atordoado' }] });
      },
    },
    {
      id: 'tur_incenso',
      name: 'Incenso Mortuário',
      tempo: 'pesado',
      kind: 'buff',
      text: 'Dois Setores inimigos conectados recebem Fumaça até próxima Ativação; um inimigo em cada recebe Guardado; sem Ataque.',
      plan(c, self) {
        smokeConnected(c, self, 2);
      },
    },
  ],
};

// ============================================================================ Carcereiro das Correntes
const carcereiro: EnemyDef = {
  id: 'carcereiro',
  name: 'Carcereiro das Correntes',
  tier: 'elite',
  tierLabel: 'Elite de rota',
  hp: 6,
  armor: 1,
  profano: false,
  prefers: 'F',
  prefab: 'carcereiro',
  source: P('§43 Carcereiro das Correntes'),
  lore: 'Ele guarda as chaves de celas que não têm mais portas.',
  passives: [{ name: 'Cativo Marcado', text: 'Ataques contra herói Imobilizado causam +1 Dano.' }],
  damageBonus: (_c, _s, t) => (t.conditions.imobilizado ? 1 : 0),
  intents: [
    {
      id: 'car_presa',
      name: 'Escolher a Presa',
      tempo: 'rapido',
      kind: 'move',
      text: 'Menor HP alcançável; mova 2; Guardado; sem Ataque.',
      plan(c, self) {
        const t = defaultTarget(c, self, { cat: 'alcance', lowestHpFirst: true, reason: 'Carcereiro: empate na presa de menor HP.' });
        if (t) {
          const path = pathToAttack(c, self, t, 'alcance', { maxMove: 2 });
          if (path.length > 1) pushOps(c, [{ op: 'move', id: self.id, path, forced: false, voluntary: true, canLeaveEngagement: false, stopOnEngage: true }], false);
        }
        guardOps(c, self, [self.id]);
      },
    },
    {
      id: 'car_gancho',
      name: 'Gancho',
      tempo: 'tatico',
      kind: 'melee',
      dano: 1,
      def: 'guarda',
      text: 'Alcance Dano 1, Defesa Guarda; Dano → Puxar 1.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'alcance', dano: 1, def: 'guarda', move: 0, noMove: true, name: 'Gancho', intentId: 'car_gancho', school: 'metal', onDamage: [{ kind: 'pull' }] });
      },
    },
    {
      id: 'car_arrastar',
      name: 'Arrastar',
      tempo: 'tatico',
      kind: 'melee',
      dano: 1,
      def: 'poder',
      text: 'Priorize Retaguarda; Alcance Dano 1, Defesa Poder; Dano → Puxar 1; vulnerabilidade usa Quebrado, não Exposto em herói.',
      plan(c, self) {
        attackIntent(c, self, {
          cat: 'alcance',
          dano: 1,
          def: 'poder',
          move: 0,
          noMove: true,
          name: 'Arrastar',
          intentId: 'car_arrastar',
          school: 'metal',
          prefer: (h) => parseSector(h.sector).row === 'R' && canAttackNow(c, self, h, 'alcance'),
          onDamage: [{ kind: 'pull' }],
        });
      },
    },
    {
      id: 'car_varredura',
      name: 'Varredura de Corrente',
      tempo: 'tatico',
      kind: 'area',
      dano: 1,
      def: 'guarda',
      text: 'Até 2 heróis Adjacentes defendem Dano 1, Guarda; Dano → Empurrar 1.',
      plan(c, self) {
        const t = adjacentHeroes(c, self, 2);
        if (t.length) pushOps(c, [{ op: 'eAttack', spec: makeSpec(c, self, { cat: 'cac', dano: 1, def: 'guarda', move: 0, name: 'Varredura de Corrente', intentId: 'car_varredura', school: 'metal', onDamage: [{ kind: 'push' }] }, t) }], false);
        else log(c, 'attack', `${self.name}: nenhum herói Adjacente para a Varredura.`);
      },
    },
    {
      id: 'car_algemar',
      name: 'Algemar',
      tempo: 'pesado',
      kind: 'control',
      dano: 2,
      def: 'guarda',
      text: 'Mova 1; Dano 2, Guarda; 0 Sucessos na Defesa → Imobilizado.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'alcance', dano: 2, def: 'guarda', move: 1, name: 'Algemar', intentId: 'car_algemar', school: 'metal', onZero: [{ kind: 'cond', cond: 'imobilizado' }] });
      },
    },
    {
      id: 'car_quebrar',
      name: 'Quebrar o Cativo',
      tempo: 'pesado',
      kind: 'melee',
      dano: 3,
      def: 'guarda',
      text: 'Priorize Imobilizado; Dano 3, Guarda; Dano → Quebrado; Cativo Marcado pode elevar para 4.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'alcance', dano: 3, def: 'guarda', move: 0, noMove: true, name: 'Quebrar o Cativo', intentId: 'car_quebrar', school: 'blunt', prefer: (h) => h.conditions.imobilizado, onDamage: [{ kind: 'cond', cond: 'quebrado' }] });
      },
    },
  ],
};

// ============================================================================ Carrasco do Contrapeso
const carrasco: EnemyDef = {
  id: 'carrasco',
  name: 'Carrasco do Contrapeso',
  tier: 'elite',
  tierLabel: 'Raro · Elite — WATCH',
  hp: 7,
  armor: 1,
  profano: false,
  prefers: 'F',
  prefab: 'carrasco',
  source: { section: '§43 Carrasco do Contrapeso', status: 'WATCH' },
  lore: 'O contrapeso que ele arrasta pesava exatamente o mesmo que um condenado.',
  passives: [{ name: 'Sentença', text: 'Primeira vez na Ativação que atacar herói que já possui Condição, +1 Dano.' }],
  damageBonus: (c, self, t) => {
    if (heroHasCondition(t) && canUse(self, 'activation', 'sentenca')) {
      markUse(self, 'activation', 'sentenca');
      return 1;
    }
    return 0;
  },
  intents: [
    {
      id: 'crr_medir',
      name: 'Medir o Pescoço',
      tempo: 'rapido',
      kind: 'move',
      text: 'Mova 1 em direção ao menor HP; Guardado.',
      plan(c, self) {
        const t = defaultTarget(c, self, { cat: 'cac', lowestHpFirst: true, reason: 'Carrasco: empate no menor HP.' });
        if (t) {
          const path = pathToAttack(c, self, t, 'cac', { maxMove: 1 });
          if (path.length > 1) pushOps(c, [{ op: 'move', id: self.id, path, forced: false, voluntary: true, canLeaveEngagement: false, stopOnEngage: true }], false);
        }
        guardOps(c, self, [self.id]);
      },
    },
    {
      id: 'crr_cepo',
      name: 'Passo do Cepo',
      tempo: 'rapido',
      kind: 'melee',
      dano: 1,
      def: 'guarda',
      text: 'Mova 1 em direção a herói com Condição; se Engajado, Dano 1, Guarda.',
      plan(c, self) {
        moveTowardTarget(c, self, 1, 'cac', heroHasCondition);
        call(c, 'carrasco:cepo', { id: self.id });
      },
    },
    {
      id: 'crr_lateral',
      name: 'Golpe Lateral',
      tempo: 'tatico',
      kind: 'melee',
      dano: 2,
      def: 'guarda',
      text: 'Mova 1; Dano 2, Guarda; Dano → Empurrar 1.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 2, def: 'guarda', move: 1, name: 'Golpe Lateral', intentId: 'crr_lateral', school: 'metal', onDamage: [{ kind: 'push' }] });
      },
    },
    {
      id: 'crr_postura',
      name: 'Quebrar Postura',
      tempo: 'tatico',
      kind: 'control',
      dano: 2,
      def: 'poder',
      text: 'Dano 2, Defesa Poder; 0 Sucessos → Quebrado.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 2, def: 'poder', move: 0, noMove: true, name: 'Quebrar Postura', intentId: 'crr_postura', school: 'blunt', onZero: [{ kind: 'cond', cond: 'quebrado' }] });
      },
    },
    {
      id: 'crr_cutelo',
      name: 'Cutelo Descendente',
      tempo: 'pesado',
      kind: 'melee',
      dano: 3,
      def: 'guarda',
      text: 'Mova 1; Dano 3, Guarda; Sentença pode tornar 4.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 3, def: 'guarda', move: 1, name: 'Cutelo Descendente', intentId: 'crr_cutelo', school: 'metal' });
      },
    },
    {
      id: 'crr_execucao',
      name: 'Execução',
      tempo: 'pesado',
      kind: 'melee',
      dano: 2,
      def: 'determinacao',
      text: 'Priorize menor HP com Condição; Dano 2, Determinação; Dano → Sangramento 1; Sentença pode tornar 3.',
      plan(c, self) {
        const withCond = heroes(c).filter(heroHasCondition);
        const minHp = withCond.length ? Math.min(...withCond.map((h) => h.hp)) : 0;
        attackIntent(c, self, {
          cat: 'cac',
          dano: 2,
          def: 'determinacao',
          move: 0,
          noMove: true,
          name: 'Execução',
          intentId: 'crr_execucao',
          school: 'metal',
          prefer: withCond.length ? (h) => heroHasCondition(h) && h.hp === minHp : undefined,
          onDamage: [{ kind: 'cond', cond: 'sangramento', n: 1 }],
        });
      },
    },
  ],
};

// ============================================================================ Relicário Faminto
const relicario: EnemyDef = {
  id: 'relicario',
  name: 'Relicário Faminto',
  tier: 'especial',
  tierLabel: 'Especial · Segredo',
  hp: 5,
  armor: 0,
  profano: false,
  prefers: 'F',
  prefab: 'relicario',
  source: P('§43 Relicário Faminto'),
  lore: 'A tampa se abre um dedo e então mostra dentes.',
  passives: [{ name: 'Tesouro Vivo', text: 'Começa Guardado; a recompensa associada só é obtida se derrotado.' }],
  onCombatStart: (c, f) => setCond(c, f, 'guardado', true),
  intents: [
    {
      id: 'rel_salto',
      name: 'Salto da Tampa',
      tempo: 'rapido',
      kind: 'melee',
      dano: 2,
      def: 'agilidade',
      text: 'Mova 2; Dano 2, Agilidade.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 2, def: 'agilidade', move: 2, name: 'Salto da Tampa', intentId: 'rel_salto', school: 'flesh' });
      },
    },
    {
      id: 'rel_carapaca',
      name: 'Fechar a Carapaça',
      tempo: 'rapido',
      kind: 'buff',
      text: '+1 Armadura até próxima Ativação e Guardado; sem Ataque.',
      plan(c, self) {
        call(c, 'relicario:carapaca', { id: self.id });
      },
    },
    {
      id: 'rel_lingua',
      name: 'Língua de Couro',
      tempo: 'tatico',
      kind: 'melee',
      dano: 1,
      def: 'agilidade',
      text: 'Alcance Dano 1, Agilidade; Dano → Puxar 1.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'alcance', dano: 1, def: 'agilidade', move: 0, noMove: true, name: 'Língua de Couro', intentId: 'rel_lingua', school: 'flesh', onDamage: [{ kind: 'pull' }] });
      },
    },
    {
      id: 'rel_morder',
      name: 'Morder a Mão',
      tempo: 'tatico',
      kind: 'melee',
      dano: 1,
      def: 'agilidade',
      text: 'Dano 1, Agilidade; Dano → Sangramento 1.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 1, def: 'agilidade', move: 0, noMove: true, name: 'Morder a Mão', intentId: 'rel_morder', school: 'flesh', onDamage: [{ kind: 'cond', cond: 'sangramento', n: 1 }] });
      },
    },
    {
      id: 'rel_correr',
      name: 'Correr com o Tesouro',
      tempo: 'tatico',
      kind: 'ranged',
      dano: 1,
      def: 'agilidade',
      text: 'Mova 2 para longe podendo sair de Engajamento; depois Distância Dano 1 se possível.',
      plan(c, self) {
        retreat(c, self, 2, true);
        attackIntent(c, self, { cat: 'distancia', dano: 1, def: 'agilidade', move: 0, noMove: true, name: 'Correr com o Tesouro', intentId: 'rel_correr', school: 'blunt' });
      },
    },
    {
      id: 'rel_cuspir',
      name: 'Cuspir Cacos',
      tempo: 'pesado',
      kind: 'area',
      dano: 2,
      def: 'agilidade',
      text: 'Heróis num Setor defendem Dano 2, Agilidade; depois Passo 1 para longe.',
      plan(c, self) {
        areaSectorAttack(c, self, { dano: 2, def: 'agilidade', name: 'Cuspir Cacos', id: 'rel_cuspir', school: 'blunt' });
        call(c, 'enemy:retreat', { id: self.id, n: 1, leave: true });
      },
    },
  ],
};

// ============================================================================ Cantor da Última Badalada
const cantor: EnemyDef = {
  id: 'cantor',
  name: 'Cantor da Última Badalada',
  tier: 'elite',
  tierLabel: 'Elite especial · Profano',
  hp: [8, 14, 20, 26, 32],
  armor: 0,
  profano: true,
  prefers: 'R',
  prefab: 'cantor',
  scale: 1.15,
  source: P('§34 / §43 Cantor da Última Badalada'),
  lore: 'Uma voz canta sozinha no interior da capela. Cada nota afina o sino que ninguém toca.',
  passives: [
    { name: 'Canto', text: 'Começa com Canto 1. Cartas NOTA aumentam Canto em 1. Ao chegar a 3, a próxima Intenção normal é substituída por Última Badalada.' },
  ],
  intents: [
    {
      id: 'can_hino',
      name: 'Hino de Ferro',
      tempo: 'rapido',
      kind: 'buff',
      tags: ['NOTA'],
      text: 'NOTA — dois aliados Guardado.',
      plan(c, self) {
        call(c, 'enemy:guardNear', { id: self.id, n: 2, includeSelf: true, any: true });
      },
    },
    {
      id: 'can_marcha',
      name: 'Marcha do Coro',
      tempo: 'rapido',
      kind: 'move',
      tags: ['NOTA'],
      text: 'NOTA — até 2 aliados Passo 1.',
      plan(c, self) {
        call(c, 'enemy:allyStep', { id: self.id, n: 1, count: 2, any: true });
      },
    },
    {
      id: 'can_verso',
      name: 'Verso da Dor',
      tempo: 'tatico',
      kind: 'area',
      tags: ['NOTA'],
      dano: 1,
      def: 'espirito',
      text: 'NOTA — Distância Dano 1, Espírito; todos no Setor do alvo defendem.',
      plan(c, self) {
        const t = defaultTarget(c, self, { cat: 'distancia', reason: 'Cantor: empate no Verso da Dor.' });
        if (!t) return;
        const targets = heroes(c).filter((h) => h.sector === t.sector);
        pushOps(c, [{ op: 'eAttack', spec: { ...makeSpec(c, self, { cat: 'distancia', dano: 1, def: 'espirito', move: 0, name: 'Verso da Dor', intentId: 'can_verso', school: 'bell' }, targets), data: { area: true } } }], false);
      },
    },
    {
      id: 'can_dissonancia',
      name: 'Dissonância',
      tempo: 'tatico',
      kind: 'ranged',
      dano: 2,
      def: 'espirito',
      text: 'Distância Dano 2, Espírito; 0 Sucessos → Quebrado.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'distancia', dano: 2, def: 'espirito', move: 0, noMove: true, name: 'Dissonância', intentId: 'can_dissonancia', school: 'bell', onZero: [{ kind: 'cond', cond: 'quebrado' }] });
      },
    },
    {
      id: 'can_respiracao',
      name: 'Respiração de Bronze',
      tempo: 'tatico',
      kind: 'heal',
      tags: ['NOTA'],
      text: 'NOTA — Cantor cura 2; se cheio, aliado ferido cura 2.',
      plan(c, self) {
        if (self.hp < self.maxHp) pushOps(c, [{ op: 'heal', targetId: self.id, amount: 2, sourceId: self.id }], false);
        else {
          const hurt = enemies(c).filter((e) => e.id !== self.id && e.hp < e.maxHp).sort((a, b) => a.hp - b.hp || a.order - b.order)[0];
          if (hurt) pushOps(c, [{ op: 'heal', targetId: hurt.id, amount: 2, sourceId: self.id }], false);
        }
      },
    },
    {
      id: 'can_silencio',
      name: 'Silêncio Cortante',
      tempo: 'pesado',
      kind: 'control',
      dano: 2,
      def: 'determinacao',
      text: 'Distância Dano 2, Determinação; 0 Sucessos → Atordoado.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'distancia', dano: 2, def: 'determinacao', move: 0, noMove: true, name: 'Silêncio Cortante', intentId: 'can_silencio', school: 'bell', onZero: [{ kind: 'cond', cond: 'atordoado' }] });
      },
    },
  ],
  obligatory: [
    {
      id: 'can_ultima',
      name: 'Última Badalada',
      tempo: 'pesado',
      kind: 'area',
      dano: 2,
      def: 'espirito',
      text: 'Pesado obrigatória: todos os heróis defendem Dano 2, Espírito; 0 Sucessos → Atordoado; Canto volta a 0.',
      plan(c, self) {
        pushOps(
          c,
          [
            { op: 'eAttack', spec: { ...makeSpec(c, self, { cat: 'distancia', dano: 2, def: 'espirito', move: 0, name: 'Última Badalada', intentId: 'can_ultima', school: 'bell', onZero: [{ kind: 'cond', cond: 'atordoado' }] }, heroes(c)), data: { area: true } } },
            { op: 'call', fn: 'cantor:reset', args: {} },
          ],
          false,
        );
      },
    },
  ],
};

// ============================================================================ Cavaleiro da Vigília Quebrada
function cavaleiroArmor(c: Ctx) {
  for (const f of c.S.figures) if (f.typeId === 'cavaleiro') f.armor = c.S.boss.cavaleiroGuarda === 'fechada' ? 2 : 0;
}
const cavaleiro: EnemyDef = {
  id: 'cavaleiro',
  name: 'Cavaleiro da Vigília Quebrada',
  tier: 'miniboss',
  tierLabel: 'Miniboss',
  hp: [6, 12, 17, 22, 27],
  armor: 2,
  profano: false,
  miniboss: true,
  prefers: 'F',
  prefab: 'cavaleiro',
  scale: 1.3,
  source: P('§34 / §43 Cavaleiro da Vigília Quebrada'),
  lore: 'Ele não guardava Severin. Guardava o caminho contra ele.',
  passives: [
    { name: 'Guardas', text: 'Guarda Fechada: Armadura 2. Guarda Aberta: Armadura 0. A Guarda muda quando a Intenção é revelada.' },
    { name: 'Comandante', text: 'Uma vez por Ciclo, quando receber Guardado, aliado Adjacente também pode receber Guardado.' },
  ],
  onCombatStart: (c) => cavaleiroArmor(c),
  onReveal: (c, _t, intent) => {
    // HIPÓTESE Q-GUARDA: in Cycle 1 the entry Guard (Fechada / Aberta via Cárceres) holds; from Cycle 2 the Intenção defines it.
    if (c.S.cycle >= 2 && intent.guard) c.S.boss.cavaleiroGuarda = intent.guard;
    cavaleiroArmor(c);
    log(c, 'boss', `Cavaleiro em Guarda ${c.S.boss.cavaleiroGuarda === 'fechada' ? 'Fechada (Armadura 2)' : 'Aberta (Armadura 0)'}.`);
    for (const f of c.S.figures) if (f.typeId === 'cavaleiro') c.events.push({ type: 'boss', figureId: f.id, what: 'guarda', value: c.S.boss.cavaleiroGuarda === 'fechada' ? 2 : 0 });
  },
  intents: [
    {
      id: 'cav_muralha',
      name: 'Muralha',
      tempo: 'rapido',
      guard: 'fechada',
      kind: 'buff',
      text: 'Fechada — mova 1; Guardado; aliado Adjacente Guardado.',
      plan(c, self) {
        moveTowardTarget(c, self, 1, 'cac');
        call(c, 'enemy:guardSelfAndAdjacent', { id: self.id, n: 1 });
      },
    },
    {
      id: 'cav_reagrupar',
      name: 'Reagrupar',
      tempo: 'rapido',
      guard: 'fechada',
      kind: 'move',
      text: 'Fechada — aliados próximos podem Passo 1; um recebe Guardado.',
      plan(c, self) {
        call(c, 'enemy:allyStep', { id: self.id, n: 1, count: 8 });
        call(c, 'enemy:guardNear', { id: self.id, n: 1, includeSelf: false });
      },
    },
    {
      id: 'cav_investida',
      name: 'Investida',
      tempo: 'tatico',
      guard: 'aberta',
      kind: 'melee',
      dano: 3,
      def: 'guarda',
      text: 'Aberta — mova 2 podendo sair de Engajamento; Dano 3, Guarda; Dano → Empurrar 1.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 3, def: 'guarda', move: 2, canLeaveEngagement: true, name: 'Investida', intentId: 'cav_investida', school: 'metal', onDamage: [{ kind: 'push' }] });
      },
    },
    {
      id: 'cav_disciplina',
      name: 'Disciplina de Aço',
      tempo: 'tatico',
      guard: 'fechada',
      kind: 'melee',
      dano: 2,
      def: 'guarda',
      text: 'Fechada — mova 1; Dano 2, Guarda; depois Guardado.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 2, def: 'guarda', move: 1, name: 'Disciplina de Aço', intentId: 'cav_disciplina', school: 'metal' });
        guardOps(c, self, [self.id]);
      },
    },
    {
      id: 'cav_romper',
      name: 'Romper a Linha',
      tempo: 'tatico',
      guard: 'aberta',
      kind: 'area',
      dano: 2,
      def: 'poder',
      text: 'Aberta — até 2 heróis Adjacentes defendem Dano 2, Poder.',
      plan(c, self) {
        const t = adjacentHeroes(c, self, 2);
        if (t.length) pushOps(c, [{ op: 'eAttack', spec: makeSpec(c, self, { cat: 'cac', dano: 2, def: 'poder', move: 0, name: 'Romper a Linha', intentId: 'cav_romper', school: 'metal' }, t) }], false);
        else log(c, 'attack', `${self.name}: nenhum herói Adjacente para Romper a Linha.`);
      },
    },
    {
      id: 'cav_misericordia',
      name: 'Corte de Misericórdia',
      tempo: 'pesado',
      guard: 'aberta',
      kind: 'melee',
      dano: 4,
      def: 'guarda',
      text: 'Aberta — menor HP; mova 1; Dano 4, Guarda.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 4, def: 'guarda', move: 1, lowestHpFirst: true, name: 'Corte de Misericórdia', intentId: 'cav_misericordia', school: 'metal' });
      },
    },
  ],
};

// ============================================================================ Vigia das Três Vigílias
function vigiaBonus(c: Ctx, h: Figure) {
  if (!c.S.boss.vigiaMarcados.includes(h.id)) return 0;
  return c.S.boss.fase2['vigia'] ? 1 : 0;
}
function vigiaAttack(c: Ctx, self: Figure, o: { id: string; name: string; tempo: 'rapido' | 'tatico' | 'pesado'; base: number; strong: number; def: any; preferTempo?: boolean; strongEffects?: any[]; move?: number }) {
  const marked = c.S.boss.vigiaMarcados;
  const t = defaultTarget(c, self, {
    cat: o.move ? 'cac' : 'global',
    prefer: o.preferTempo ? (h) => h.tempo === o.tempo : undefined,
    reason: `Vigia — ${o.name}: empate no alvo.`,
  });
  if (!t) return;
  if (o.move) {
    const path = pathToAttack(c, self, t, 'cac', { maxMove: o.move });
    if (path.length > 1) pushOps(c, [{ op: 'move', id: self.id, path, forced: false, voluntary: true, canLeaveEngagement: false, stopOnEngage: true }], false);
  }
  const strong = marked.includes(t.id) && t.tempo === o.tempo;
  const dano = strong ? o.strong : o.base;
  const spec = makeSpec(c, self, { cat: o.move ? 'cac' : 'global', dano, def: o.def, move: 0, name: `${o.name}${strong ? ' (fortalecido)' : ''}`, intentId: o.id, school: 'profane', onDamage: strong ? o.strongEffects : [] }, [t]);
  spec.perTargetBonus[t.id] = strong ? vigiaBonus(c, t) : 0;
  pushOps(c, [{ op: 'eAttack', spec }], false);
}
const vigia: EnemyDef = {
  id: 'vigia',
  name: 'Vigia das Três Vigílias',
  tier: 'boss',
  tierLabel: 'Boss secreto',
  hp: [8, 18, 27, 36, 45],
  armor: 1,
  profano: false,
  boss: true,
  prefers: 'F',
  prefab: 'vigia',
  scale: 1.45,
  source: P('§34 / §43 Vigia das Três Vigílias'),
  lore: 'Três horas de vigília. Ele conhece a sua — e espera por ela.',
  passives: [
    { name: 'Três Vigílias', text: 'Depois de revelar a Intenção, os heróis escolhem Tempos. Se ninguém escolher o mesmo Tempo da Intenção, o Vigia recebe Guardado. Se alguém escolher, a carta tem efeito fortalecido contra esses heróis.' },
    { name: 'Hora Partida', text: 'Na metade do HP: Armadura 0; efeitos fortalecidos causam +1 Dano.' },
  ],
  onDamaged: (c, self) => {
    if (!c.S.boss.fase2['vigia'] && self.hp * 2 <= self.maxHp && self.hp > 0) {
      c.S.boss.fase2['vigia'] = true;
      self.armor = 0;
      log(c, 'boss', 'Hora Partida! O Vigia perde a Armadura e seus golpes fortalecidos ficam mais cruéis.');
      c.events.push({ type: 'boss', figureId: self.id, what: 'phase2' });
    }
  },
  intents: [
    {
      id: 'vig_apressados',
      name: 'Caçar os Apressados',
      tempo: 'rapido',
      kind: 'melee',
      dano: 2,
      def: 'agilidade',
      text: 'Alvo Rápido; Dano 2 Agilidade; contra Rápido Dano 3.',
      plan: (c, s) => vigiaAttack(c, s, { id: 'vig_apressados', name: 'Caçar os Apressados', tempo: 'rapido', base: 2, strong: 3, def: 'agilidade', preferTempo: true }),
    },
    {
      id: 'vig_passo',
      name: 'Passo Proibido',
      tempo: 'rapido',
      kind: 'melee',
      dano: 1,
      def: 'agilidade',
      text: 'Mova 2; contra Rápido Dano 2 + Empurrar 1; caso contrário Dano 1.',
      plan: (c, s) => vigiaAttack(c, s, { id: 'vig_passo', name: 'Passo Proibido', tempo: 'rapido', base: 1, strong: 2, def: 'agilidade', move: 2, strongEffects: [{ kind: 'push' }] }),
    },
    {
      id: 'vig_medida',
      name: 'Medida Exata',
      tempo: 'tatico',
      kind: 'melee',
      dano: 2,
      def: 'precisao',
      text: 'Alvo Tático; Dano 2 Precisão; contra Tático Dano 3 (+ Exposto apenas quando aplicável — inimigos não usam Exposto em heróis no PvE).',
      plan: (c, s) => vigiaAttack(c, s, { id: 'vig_medida', name: 'Medida Exata', tempo: 'tatico', base: 2, strong: 3, def: 'precisao', preferTempo: true }),
    },
    {
      id: 'vig_centro',
      name: 'Centro da Vigília',
      tempo: 'tatico',
      kind: 'melee',
      dano: 2,
      def: 'determinacao',
      text: 'Dano 2 Determinação; contra Tático e com Dano, Quebrado.',
      plan: (c, s) => vigiaAttack(c, s, { id: 'vig_centro', name: 'Centro da Vigília', tempo: 'tatico', base: 2, strong: 2, def: 'determinacao', strongEffects: [{ kind: 'cond', cond: 'quebrado' }] }),
    },
    {
      id: 'vig_peso',
      name: 'Peso da Terceira Hora',
      tempo: 'pesado',
      kind: 'melee',
      dano: 3,
      def: 'guarda',
      text: 'Alvo Pesado; Dano 3 Guarda; contra Pesado Dano 4.',
      plan: (c, s) => vigiaAttack(c, s, { id: 'vig_peso', name: 'Peso da Terceira Hora', tempo: 'pesado', base: 3, strong: 4, def: 'guarda', preferTempo: true }),
    },
    {
      id: 'vig_oracao',
      name: 'Oração Imóvel',
      tempo: 'pesado',
      kind: 'control',
      dano: 2,
      def: 'espirito',
      text: 'Dano 2 Espírito; contra Pesado Dano 3 e, com Dano, Imobilizado.',
      plan: (c, s) => vigiaAttack(c, s, { id: 'vig_oracao', name: 'Oração Imóvel', tempo: 'pesado', base: 2, strong: 3, def: 'espirito', strongEffects: [{ kind: 'cond', cond: 'imobilizado' }] }),
    },
  ],
};

// ============================================================================ Abade Severin
function severinSummonLimit(c: Ctx) {
  return Math.max(1, Math.min(5, c.S.partySize));
}
const severin: EnemyDef = {
  id: 'severin',
  name: 'Abade Severin',
  tier: 'boss',
  tierLabel: 'O Sino Partido · Boss final',
  hp: [9, 18, 26, 34, 42],
  armor: 1,
  profano: true,
  boss: true,
  prefers: 'F',
  prefab: 'severin',
  scale: 1.7,
  source: P('§34 / §43 Abade Severin'),
  lore: 'Ele tocou o sino até rachá-lo. O som nunca parou — apenas ficou do lado de dentro.',
  passives: [
    { name: 'Ressonância', text: '0–3. Intenções SINO aumentam em 1 depois de resolver. Em 2, Severin recebe Exposto. Ao atingir 3, prepare a Terceira Badalada para a fase Pesada do Ciclo. Contrapeso pode reduzir antes disso e cancelar a Badalada.' },
    { name: 'Fases', text: 'Fase 1 Armadura 1. Metade do HP → Fase 2, Armadura 0.' },
    { name: 'Convocações', text: 'Limite cumulativo de Penitentes convocados: igual ao tamanho da party (1–5). No limite, Chamar os Penitentes concede Guardado a 1 Penitente ativo.' },
  ],
  onDamaged: (c, self) => {
    if (!c.S.boss.fase2['severin'] && self.hp * 2 <= self.maxHp && self.hp > 0) {
      c.S.boss.fase2['severin'] = true;
      self.armor = 0;
      log(c, 'boss', 'O sino racha mais fundo — Severin entra na Fase 2 (Armadura 0).');
      c.events.push({ type: 'boss', figureId: self.id, what: 'phase2' });
    }
  },
  intents: [
    {
      id: 'sev_chamar',
      name: 'Chamar os Penitentes',
      tempo: 'rapido',
      tags: ['SINO'],
      kind: 'summon',
      text: 'SINO — 1 reforço com 1–3 heróis; 2 com 4–5, respeitando o limite ativo da luta.',
      plan(c, self) {
        call(c, 'severin:chamar', { id: self.id });
      },
    },
    {
      id: 'sev_verbo',
      name: 'Verbo Invertido',
      tempo: 'rapido',
      kind: 'ranged',
      dano: 2,
      def: 'espirito',
      text: 'Distância Dano 2 Espírito; 0 Sucessos → Atordoado.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'distancia', dano: 2, def: 'espirito', move: 0, noMove: true, name: 'Verbo Invertido', intentId: 'sev_verbo', school: 'profane', onZero: [{ kind: 'cond', cond: 'atordoado' }] });
      },
    },
    {
      id: 'sev_procissao',
      name: 'Procissão de Bronze',
      tempo: 'tatico',
      tags: ['SINO'],
      kind: 'melee',
      dano: 2,
      def: 'guarda',
      text: 'SINO — mova 1 para o maior grupo; Dano 2 Guarda.',
      plan(c, self) {
        const k = bestHeroSector(c, self);
        attackIntent(c, self, { cat: 'cac', dano: 2, def: 'guarda', move: 1, name: 'Procissão de Bronze', intentId: 'sev_procissao', school: 'bell', prefer: k ? (h) => h.sector === k : undefined });
      },
    },
    {
      id: 'sev_circulo',
      name: 'Círculo do Badalo',
      tempo: 'tatico',
      tags: ['SINO'],
      kind: 'area',
      dano: 1,
      def: 'guarda',
      text: 'SINO — coluna de heróis; cada figura defende Dano 1 Guarda; Dano → Empurrar 1.',
      plan(c, self) {
        const col = bestHeroColumn(c, self);
        if (col == null) return;
        pushOps(c, [{ op: 'eAttack', spec: { ...makeSpec(c, self, { cat: 'global', dano: 1, def: 'guarda', move: 0, name: 'Círculo do Badalo', intentId: 'sev_circulo', school: 'bell', onDamage: [{ kind: 'push' }] }, heroesInColumn(c, col)), data: { area: true } } }], false);
      },
    },
    {
      id: 'sev_martelo',
      name: 'Martelo Litúrgico',
      tempo: 'pesado',
      kind: 'melee',
      dano: 4,
      def: 'guarda',
      text: 'Menor HP; mova 1; Dano 4 Guarda; Dano → Quebrado.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 4, def: 'guarda', move: 1, lowestHpFirst: true, name: 'Martelo Litúrgico', intentId: 'sev_martelo', school: 'blunt', onDamage: [{ kind: 'cond', cond: 'quebrado' }] });
      },
    },
    {
      id: 'sev_juramento',
      name: 'Quebrar o Juramento',
      tempo: 'pesado',
      kind: 'melee',
      dano: 3,
      def: 'guarda',
      text: 'Priorize Guardado; Dano 3 Guarda; ignora 1 Armadura; Dano → Empurrar 1.',
      plan(c, self) {
        attackIntent(c, self, { cat: 'cac', dano: 3, def: 'guarda', move: 0, noMove: true, ignoreArmor: 1, name: 'Quebrar o Juramento', intentId: 'sev_juramento', school: 'blunt', prefer: (h) => h.conditions.guardado, onDamage: [{ kind: 'push' }] });
      },
    },
  ],
  obligatory: [
    {
      id: 'sev_terceira',
      name: 'Terceira Badalada',
      tempo: 'pesado',
      kind: 'area',
      dano: 2,
      def: 'espirito',
      text: 'Fase 1 Dano 2 Espírito; Fase 2 Dano 3 Espírito; 0 Sucessos → Atordoado; Ressonância volta a 0.',
      plan() {
        /* resolved by handler severin:terceira at the start of the enemy Heavy band */
      },
    },
  ],
};

export const D1_ENEMIES: EnemyDef[] = [penitente, cao, besteiro, escudeiro, acolito, turiferario, carcereiro, carrasco, relicario, cantor, cavaleiro, vigia, severin];

// ============================================================================ handlers
export const ENEMY_HANDLERS: Record<string, (c: Ctx, a: Record<string, unknown>) => void> = {
  'enemy:guardIfEngaged': (c, a) => {
    const f = tryFig(c, a.id as string);
    if (f && isActive(f) && isEngaged(f, c.S.figures)) applyCondition(c, f, 'guardado', 1, f.id);
  },
  'enemy:retreat': (c, a) => {
    const f = tryFig(c, a.id as string);
    if (f && isActive(f)) retreat(c, f, a.n as number, !!a.leave);
  },
  'enemy:fincar': (c, a) => {
    const f = tryFig(c, a.id as string);
    if (f) f.conditions.ignoraEmpurrao = true;
  },
  'enemy:guardSelfAndAdjacent': (c, a) => {
    const f = tryFig(c, a.id as string);
    if (!f || !isActive(f)) return;
    const allies = nearAllies(c, f).slice(0, (a.n as number) ?? 1);
    applyCondition(c, f, 'guardado', 1, f.id);
    commanderEcho(c, f);
    for (const x of allies) applyCondition(c, x, 'guardado', 1, f.id);
  },
  'enemy:guardNear': (c, a) => {
    const f = tryFig(c, a.id as string);
    if (!f || !isActive(f)) return;
    const n = a.n as number;
    let pool = a.any ? enemies(c).filter((e) => e.id !== f.id).sort((x, y) => Number(x.conditions.guardado) - Number(y.conditions.guardado) || x.hp / x.maxHp - y.hp / y.maxHp || x.order - y.order) : nearAllies(c, f);
    pool = pool.filter((x) => !x.conditions.guardado).concat(pool.filter((x) => x.conditions.guardado));
    const chosen = pool.slice(0, n);
    if (chosen.length < n && a.includeSelf) chosen.push(f);
    for (const x of chosen) {
      applyCondition(c, x, 'guardado', 1, f.id);
      if (x.typeId === 'cavaleiro') commanderEcho(c, x);
    }
  },
  'enemy:allyStep': (c, a) => {
    const f = tryFig(c, a.id as string);
    if (!f || !isActive(f)) return;
    const pool = (a.any ? enemies(c).filter((e) => e.id !== f.id) : nearAllies(c, f)).filter((e) => !isEngaged(e, c.S.figures));
    for (const ally of pool.slice(0, a.count as number)) moveTowardTarget(c, ally, a.n as number, 'cac');
  },
  'turiferario:smoke': (c, a) => {
    const f = tryFig(c, a.id as string);
    if (!f || !isActive(f)) return;
    const n = a.n as number;
    const cands = connections(f.sector).filter((k) => k[0] === 'E');
    const score = (k: SectorKey) => enemies(c).filter((e) => e.sector === k).length * 10 + (k[2] === 'F' ? 1 : 0);
    cands.sort((x, y) => score(y) - score(x) || x.localeCompare(y));
    let sectors: SectorKey[] = cands.slice(0, 1);
    if (n === 2) {
      // two connected enemy sectors: the Turiferário's own sector + best connected one
      sectors = [f.sector, cands[0]].filter(Boolean) as SectorKey[];
    }
    pushOps(c, [{ op: 'smoke', sectors, until: { kind: 'activationStart', figureId: f.id }, sourceId: f.id }]);
    if (n === 2) {
      for (const k of sectors) {
        const e = enemies(c).find((x) => x.sector === k && !x.conditions.guardado) ?? enemies(c).find((x) => x.sector === k);
        if (e) applyCondition(c, e, 'guardado', 1, f.id);
      }
    }
  },
  'carrasco:cepo': (c, a) => {
    const f = tryFig(c, a.id as string);
    if (!f || !isActive(f) || !isEngaged(f, c.S.figures)) return;
    attackIntent(c, f, { cat: 'cac', dano: 1, def: 'guarda', move: 0, noMove: true, name: 'Passo do Cepo', intentId: 'crr_cepo', school: 'metal' });
    // attackIntent pushes to back; move it to the front so it resolves now
    const op = c.S.queue.pop()!;
    c.S.queue.unshift(op);
  },
  'relicario:carapaca': (c, a) => {
    const f = tryFig(c, a.id as string);
    if (!f || !isActive(f)) return;
    f.conditions.armaduraExtra = 1;
    applyCondition(c, f, 'guardado', 1, f.id);
    log(c, 'boss', `${f.name} fecha a carapaça (+1 Armadura até a próxima Ativação).`);
  },
  // ---- Cantor
  'afterIntent:cantor': (c, a) => {
    const f = tryFig(c, a.figureId as string);
    const def = D1_ENEMIES.find((e) => e.id === 'cantor')!;
    const intent = def.intents.find((i) => i.id === a.intentId);
    if (f && intent?.tags?.includes('NOTA')) {
      c.S.boss.canto = Math.min(3, c.S.boss.canto + 1);
      log(c, 'boss', `Canto sobe para ${c.S.boss.canto}.`);
      c.events.push({ type: 'boss', figureId: f.id, what: 'canto', value: c.S.boss.canto });
      if (c.S.boss.canto >= 3) c.S.boss.ultimaBadaladaPendente = true;
    }
  },
  'revealOverride:cantor': (c) => {
    if (c.S.boss.ultimaBadaladaPendente) {
      c.S.boss.ultimaBadaladaPendente = false;
      c.S.enemyTypes['cantor'].revealed = 'can_ultima';
      c.S.enemyTypes['cantor'].obligatory = true;
    }
  },
  'cantor:reset': (c) => {
    c.S.boss.canto = 0;
    log(c, 'boss', 'O Canto volta a 0.');
    const f = c.S.figures.find((x) => x.typeId === 'cantor');
    if (f) c.events.push({ type: 'boss', figureId: f.id, what: 'canto', value: 0 });
  },
  // ---- Vigia
  'tempoConfirmed:vigia': (c) => {
    const intentId = c.S.enemyTypes['vigia']?.revealed;
    const v = c.S.figures.find((f) => f.typeId === 'vigia' && isActive(f));
    if (!intentId || !v) return;
    const intent = vigia.intents.find((i) => i.id === intentId)!;
    const marked = heroes(c).filter((h) => h.tempo === intent.tempo).map((h) => h.id);
    c.S.boss.vigiaMarcados = marked;
    if (!marked.length) {
      log(c, 'boss', `Nenhum herói escolheu o Tempo da Intenção (${intent.tempo}): o Vigia recebe Guardado.`);
      applyCondition(c, v, 'guardado', 1, v.id);
    } else {
      log(c, 'boss', `O Vigia marca ${marked.map((id) => fig(c, id).name).join(', ')}: a Intenção será fortalecida contra eles.`);
      c.events.push({ type: 'boss', figureId: v.id, what: 'vigiaMarca', value: marked.length });
    }
  },
  // ---- Severin
  'severin:chamar': (c, a) => {
    const f = tryFig(c, a.id as string);
    if (!f || !isActive(f)) return;
    const want = c.S.partySize >= 4 ? 2 : 1;
    const limit = severinSummonLimit(c);
    let made = 0;
    for (let i = 0; i < want; i++) {
      if (c.S.boss.convocacoes >= limit) break;
      c.S.boss.convocacoes++;
      made++;
      pushOps(c, [{ op: 'summon', typeId: 'penitente', count: 1, sourceId: f.id, reason: 'Chamar os Penitentes' }]);
    }
    c.events.push({ type: 'boss', figureId: f.id, what: 'convocacoes', value: c.S.boss.convocacoes });
    if (made === 0) {
      const p = enemies(c).find((e) => e.typeId === 'penitente');
      log(c, 'boss', `Limite de Convocações atingido (${limit}).${p ? ' Um Penitente recebe Guardado.' : ''}`);
      if (p) applyCondition(c, p, 'guardado', 1, f.id);
    }
  },
  'afterIntent:severin': (c, a) => {
    const intent = severin.intents.find((i) => i.id === a.intentId);
    if (!intent?.tags?.includes('SINO')) return;
    const f = fig(c, a.figureId as string);
    if (c.S.ctx.hasSilencio && !c.S.boss.silencioUsado) {
      c.S.pending = { id: newId(c, 'p'), controllers: [], kind: 'silencio', figureId: f.id };
      return;
    }
    raiseResonance(c, f);
  },
  'severin:silencio': (c, a) => {
    const f = c.S.figures.find((x) => x.typeId === 'severin')!;
    if (a.use) {
      c.S.boss.silencioUsado = true;
      log(c, 'boss', 'Silêncio do Coro: a Ressonância não sobe desta vez.');
      c.events.push({ type: 'boss', figureId: f.id, what: 'silencio' });
      return;
    }
    raiseResonance(c, f);
  },
  'bandStart:severin': (c, a) => {
    if (a.band !== 'EP') return;
    const f = c.S.figures.find((x) => x.typeId === 'severin' && isActive(x));
    if (!f || !c.S.boss.terceiraPreparada) return;
    if (c.S.boss.ressonancia < 3) {
      c.S.boss.terceiraPreparada = false;
      return;
    }
    c.S.boss.terceiraPreparada = false;
    const dano = c.S.boss.fase2['severin'] ? 3 : 2;
    log(c, 'boss', `TERCEIRA BADALADA! Todos os heróis defendem Dano ${dano}, Espírito.`);
    c.events.push({ type: 'boss', figureId: f.id, what: 'terceira' });
    pushOps(c, [
      { op: 'eAttack', spec: { ...makeSpec(c, f, { cat: 'global', dano, def: 'espirito', move: 0, name: 'Terceira Badalada', intentId: 'sev_terceira', school: 'bell', onZero: [{ kind: 'cond', cond: 'atordoado' }] }, heroes(c)), data: { area: true } } },
      { op: 'call', fn: 'severin:resetRes', args: {} },
    ]);
  },
  'severin:resetRes': (c) => {
    c.S.boss.ressonancia = 0;
    c.S.boss.exposedByRes = false;
    const f = c.S.figures.find((x) => x.typeId === 'severin');
    log(c, 'boss', 'A Ressonância volta a 0.');
    if (f) c.events.push({ type: 'boss', figureId: f.id, what: 'ressonancia', value: 0 });
  },
};

function commanderEcho(c: Ctx, f: Figure) {
  if (f.typeId !== 'cavaleiro' || !canUse(f, 'cycle', 'comandante')) return;
  const ally = nearAllies(c, f).find((x) => !x.conditions.guardado);
  if (ally) {
    markUse(f, 'cycle', 'comandante');
    log(c, 'boss', `Comandante: ${ally.name} também recebe Guardado.`);
    applyCondition(c, ally, 'guardado', 1, f.id);
  }
}

export function raiseResonance(c: Ctx, f: Figure) {
  const B = c.S.boss;
  B.ressonancia = Math.min(3, B.ressonancia + 1);
  log(c, 'boss', `Ressonância sobe para ${B.ressonancia}.`);
  c.events.push({ type: 'boss', figureId: f.id, what: 'ressonancia', value: B.ressonancia });
  if (B.ressonancia >= 2 && !B.exposedByRes) {
    B.exposedByRes = true;
    applyCondition(c, f, 'exposto', 1, f.id);
  }
  if (B.ressonancia >= 3) {
    B.terceiraPreparada = true;
    log(c, 'boss', 'A Terceira Badalada está preparada para a fase Pesada deste Ciclo.');
  }
}

export function lowerResonance(c: Ctx) {
  const B = c.S.boss;
  B.ressonancia = Math.max(0, B.ressonancia - 1);
  if (B.ressonancia < 2) B.exposedByRes = false;
  if (B.ressonancia < 3) B.terceiraPreparada = false;
  const f = c.S.figures.find((x) => x.typeId === 'severin');
  log(c, 'boss', `Contrapeso: a Ressonância cai para ${B.ressonancia}.`);
  if (f) c.events.push({ type: 'boss', figureId: f.id, what: 'ressonancia', value: B.ressonancia });
}

export type { IntentDef };
export { sk };
