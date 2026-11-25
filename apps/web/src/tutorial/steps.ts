/**
 * Tutorial content: short lines, one action at a time, the game waits for the player to actually do it.
 * A step targets a DOM element (CSS selector) or a 3D figure; `done` advances; `skipIf` jumps over a step that
 * no longer applies (e.g. the game already did it automatically). Tips are one-shot, non-blocking hints that show
 * the first time a mechanic appears anywhere in the campaign.
 */
import type { CampaignState, CombatState } from '@mosteiro/core';

export interface TutCtx {
  st: CampaignState | null;
  S: CombatState | null;
  /** true if a selector currently matches a visible element */
  has(sel: string): boolean;
  /** how many visible elements match */
  count(sel: string): number;
  /** first enemy the active hero could attack (glowing), if any */
  attackableEnemy(): string | null;
}

export type Target = { dom: string } | { figure: (t: TutCtx) => string | null } | null;

export interface Step {
  id: string;
  say: string;
  target: Target;
  /** Block every tap except on the target (true for "do exactly this" steps). */
  block?: boolean;
  /** The step can start (otherwise the engine waits). */
  when?: (t: TutCtx) => boolean;
  /** The player did it: go on. */
  done: (t: TutCtx) => boolean;
  /** Can never happen anymore in this chapter: drop it (it is not shown later). */
  skipIf?: (t: TutCtx) => boolean;
  /** Info-only steps auto-advance after this many ms (or on tap). */
  autoMs?: number;
}

/**
 * A chapter is a set of lessons. The coach shows the first lesson not learned yet whose situation is happening
 * now (`when`), waits for the player to do it (`done`), and comes back to the others when their moment arrives
 * (e.g. enemies may act before the heroes: the attack lessons simply wait for the heroes' turn).
 */
export interface Chapter {
  id: string;
  /** Starts when this is true (checked continuously). */
  start: (t: TutCtx) => boolean;
  /** The chapter is over (its context is gone): remaining lessons are dropped. */
  end: (t: TutCtx) => boolean;
  steps: Step[];
}

const inCombat = (t: TutCtx) => !!t.S && t.st?.phase === 'combat';
const phase = (t: TutCtx) => t.S?.phase;
const pending = (t: TutCtx) => t.S?.pending?.kind ?? null;

/** The first battle teaches the whole loop by doing it. */
const cycle = (t: TutCtx) => t.S?.cycle ?? 0;
export const FIRST_BATTLE: Chapter = {
  id: 'first-battle',
  start: (t) => inCombat(t) && (phase(t) === 'deploy' || phase(t) === 'tempo') && cycle(t) <= 1,
  end: (t) => !inCombat(t) || !!t.S?.result,
  steps: [
    {
      id: 'deploy',
      say: 'Seus heróis já estão em posição. Toque em Começar.',
      target: { dom: '.g-bottom .g-cta' },
      block: true,
      when: (t) => phase(t) === 'deploy',
      done: (t) => phase(t) !== 'deploy',
      skipIf: (t) => phase(t) !== 'deploy',
    },
    {
      id: 'choice-start',
      say: 'Antes da luta, uma escolha rápida. Toque numa opção.',
      target: { dom: '.prompt .opt' },
      block: true,
      when: (t) => pending(t) === 'choice',
      done: (t) => pending(t) !== 'choice',
      skipIf: (t) => cycle(t) > 1 || phase(t) === 'heroBand' || phase(t) === 'heroActing' || phase(t) === 'enemyBand',
    },
    {
      id: 'threats',
      say: 'As linhas vermelhas mostram quem cada inimigo vai atacar.',
      target: { dom: '.g-threats' },
      when: (t) => phase(t) === 'tempo' && !pending(t) && t.has('.g-threats .th'),
      done: () => false,
      skipIf: (t) => cycle(t) > 1,
      autoMs: 3800,
    },
    {
      id: 'tempo',
      say: 'Cada herói tem um ritmo. Agora estão todos prontos: toque em Lutar!',
      target: { dom: '.g-tempo .g-cta' },
      block: true,
      when: (t) => phase(t) === 'tempo' && !pending(t) && t.has('.g-tempo .g-cta'),
      done: (t) => phase(t) !== 'tempo',
      skipIf: (t) => cycle(t) > 1,
    },
    {
      id: 'pick-hero',
      say: 'Sua vez! Toque no herói que está brilhando.',
      target: { dom: '.g-port.can' },
      block: true,
      // only when there is a real choice (a single eligible hero is activated automatically)
      when: (t) => phase(t) === 'heroBand' && t.count('.g-port.can') >= 2,
      done: (t) => phase(t) === 'heroActing',
    },
    {
      id: 'tap-enemy',
      say: 'Toque num inimigo brilhando para mirar.',
      target: { figure: (t) => t.attackableEnemy() },
      block: true,
      when: (t) => phase(t) === 'heroActing' && !pending(t) && !!t.attackableEnemy(),
      done: (t) => t.has('.g-forecast') || !!pending(t),
    },
    {
      id: 'forecast',
      say: 'Chance de acertar e dano provável. Toque em Atacar!',
      target: { dom: '.g-fc-go' },
      block: true,
      when: (t) => t.has('.g-forecast'),
      done: (t) => !t.has('.g-forecast'),
    },
    {
      id: 'dice',
      say: 'Os dados decidem: números altos são acertos. Toque em Continuar.',
      target: { dom: '.prompt .btn.primary' },
      block: true,
      when: (t) => pending(t) === 'attackPost',
      done: (t) => pending(t) !== 'attackPost',
    },
    {
      id: 'ap',
      say: 'As bolinhas douradas são seus pontos de ação. Ataque de novo ou toque em Encerrar.',
      target: { dom: '.g-act.end' },
      when: (t) => phase(t) === 'heroActing' && !pending(t) && t.has('.g-act.end'),
      done: (t) => phase(t) !== 'heroActing',
      autoMs: 5000,
    },
    {
      id: 'defend',
      say: 'Um inimigo ataca! Mais dados, mais chance de bloquear. Toque em Defender.',
      target: { dom: '.prompt .btn.primary' },
      block: true,
      when: (t) => pending(t) === 'defense',
      done: (t) => pending(t) !== 'defense',
    },
  ],
};

/** First loot: hand an item to a hero, then move on. */
export const FIRST_LOOT: Chapter = {
  id: 'first-loot',
  start: (t) => t.st?.phase === 'reward' && t.has('.m-lootcard'),
  end: (t) => t.st?.phase !== 'reward',
  steps: [
    {
      id: 'give',
      say: 'Vitória! Toque num herói para ele guardar o item.',
      target: { dom: '.m-lootcard:not(.got) .m-taker' },
      block: true,
      when: (t) => t.st?.phase === 'reward' && t.has('.m-lootcard:not(.got) .m-taker'),
      done: (t) => t.has('.m-lootcard.got'),
      skipIf: (t) => t.st?.phase !== 'reward',
    },
    {
      id: 'onward',
      say: 'O que ficar sem dono fica para trás. Toque em Seguir adiante.',
      target: { dom: '.k-foot .k-cta' },
      block: true,
      when: (t) => t.st?.phase === 'reward' && t.has('.k-foot .k-cta'),
      done: (t) => t.st?.phase !== 'reward',
      skipIf: (t) => t.st?.phase !== 'reward',
    },
  ],
};

/** Before the first expedition: equipment is ready; go. */
export const FIRST_PREP: Chapter = {
  id: 'first-prep',
  start: (t) => t.st?.phase === 'prep' && (t.st?.visited?.length ?? 0) === 0,
  end: (t) => t.st?.phase !== 'prep',
  steps: [
    {
      id: 'gear',
      say: 'Aqui você troca armas e armaduras. Por agora, está tudo pronto.',
      target: null,
      when: (t) => t.st?.phase === 'prep',
      done: () => false,
      skipIf: (t) => t.st?.phase !== 'prep',
      autoMs: 3500,
    },
    {
      id: 'go',
      say: 'Toque em Partir para o Mosteiro.',
      target: { dom: '.k-foot .k-cta' },
      block: true,
      when: (t) => t.st?.phase === 'prep' && t.has('.k-foot .k-cta'),
      done: (t) => t.st?.phase !== 'prep',
      skipIf: (t) => t.st?.phase !== 'prep',
    },
  ],
};

/** One-shot tips: the first time a mechanic shows up. */
export interface Tip {
  id: string;
  say: string;
  target: Target;
  when: (t: TutCtx) => boolean;
}
export const TIPS: Tip[] = [
  {
    id: 'tempo-change',
    say: 'Rápido age antes dos inimigos. Pesado age por último, mas bate mais forte. Toque num retrato para mudar.',
    target: { dom: '.g-tempo-sum' },
    when: (t) => phase(t) === 'tempo' && (t.S?.cycle ?? 0) >= 2 && !pending(t) && t.has('.g-tempo-sum'),
  },
  {
    id: 'impulse',
    say: 'Impulsos! Gaste-os em efeitos extras antes de continuar.',
    target: { dom: '.prompt .opts' },
    when: (t) => pending(t) === 'attackPost' && (t.S?.pending?.kind === 'attackPost' ? t.S.pending.roll.impulsos > 0 && t.S.pending.options.length > 0 : false),
  },
  {
    id: 'other-actions',
    say: 'Além de atacar, cada herói tem técnicas e movimentos aqui embaixo.',
    target: { dom: '.g-act-row' },
    when: (t) => phase(t) === 'heroActing' && !pending(t) && (t.S?.cycle ?? 0) >= 2 && t.has('.g-act-row'),
  },
  {
    id: 'step',
    say: 'Você pode se mover: toque num lugar brilhando.',
    target: null,
    when: (t) => pending(t) === 'step',
  },
  {
    id: 'fallen',
    say: 'Um herói caiu! Ele não morreu: um aliado pode levantá-lo.',
    target: { dom: '.g-port.down' },
    when: (t) => inCombat(t) && !!t.S?.figures.some((f) => f.side === 'H' && f.status === 'caido'),
  },
  {
    id: 'boss',
    say: 'Chefe! Fique de olho no medidor do sino lá em cima.',
    target: { dom: '.g-gauge' },
    when: (t) => inCombat(t) && t.has('.g-gauge'),
  },
  {
    id: 'reaction-class',
    say: 'Escolha se gasta a Reação de um herói. Cada herói tem 1 Reação por ciclo.',
    target: { dom: '.prompt' },
    when: (t) => pending(t) === 'egide' || pending(t) === 'conditionResponse',
  },
  {
    id: 'objective',
    say: 'Esta luta tem um objetivo extra. Toque aqui para ver como.',
    target: { dom: '.g-obj' },
    when: (t) => inCombat(t) && t.has('.g-obj'),
  },
  {
    id: 'tie',
    say: 'Empate: vocês escolhem quem o inimigo vai atacar.',
    target: { dom: '.prompt' },
    when: (t) => pending(t) === 'tieBreak',
  },
];
