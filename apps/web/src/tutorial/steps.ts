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
  /** the real-time exploration world (doors, objects, the party leader) */
  world: {
    active: boolean;
    busy: boolean;
    hint: null | 'touch' | 'mouse';
    prompt: boolean;
    leader: { x: number; y: number } | null;
    /** screen position of the main-path door/object, when on screen */
    main: { x: number; y: number } | null;
  };
}

export type Target = { dom: string } | { figure: (t: TutCtx) => string | null } | { point: (t: TutCtx) => { x: number; y: number } | null } | null;

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
  /** Lessons that must be learned first (keeps the story in order). */
  after?: string[];
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
      say: 'Cada inimigo já mostra o que vai fazer. As linhas vermelhas apontam quem ele vai atacar.',
      target: { dom: '.g-threats' },
      when: (t) => phase(t) === 'tempo' && !pending(t) && t.has('.g-threats .th'),
      done: () => false,
      skipIf: (t) => cycle(t) > 1,
      autoMs: 5500,
    },
    {
      id: 'order',
      say: 'No topo está a ordem deste ciclo: quem age primeiro fica à esquerda. O destacado é quem age agora.',
      target: { dom: '.g-order' },
      when: (t) => phase(t) === 'tempo' && !pending(t) && t.has('.g-order'),
      done: () => false,
      skipIf: (t) => cycle(t) > 1,
      autoMs: 6000,
    },
    {
      id: 'tempo',
      say: 'Mudar o ritmo de um herói muda a ordem (Rápido age antes dos inimigos). Por agora, toque em Lutar!',
      target: { dom: '.g-tempo .g-cta' },
      block: true,
      when: (t) => phase(t) === 'tempo' && !pending(t) && t.has('.g-tempo .g-cta'),
      done: (t) => phase(t) !== 'tempo',
      skipIf: (t) => cycle(t) > 1,
    },
    {
      id: 'pick-hero',
      say: 'Vez dos heróis! Toque no herói que está brilhando.',
      target: { dom: '.g-port.can' },
      block: true,
      // only when there is a real choice (a single eligible hero is activated automatically)
      when: (t) => phase(t) === 'heroBand' && t.count('.g-port.can') >= 2,
      done: (t) => phase(t) === 'heroActing',
    },
    {
      id: 'skills',
      say: 'Sua vez! Escolha o que fazer: Atacar, Mover, Apoio ou Encerrar. Só aparece o que dá para fazer agora.',
      target: { dom: '.g-cmds' },
      when: (t) => phase(t) === 'heroActing' && !pending(t) && t.has('.g-cmd.c-attack') && !t.has('.g-menu') && !t.has('.g-forecast') && !t.has('.g-target'),
      done: () => false,
      autoMs: 6500,
    },
    {
      id: 'pick-skill',
      after: ['skills'],
      say: 'Toque em Atacar.',
      target: { dom: '.g-cmd.c-attack' },
      block: true,
      when: (t) => phase(t) === 'heroActing' && !pending(t) && t.has('.g-cmd.c-attack') && !t.has('.g-menu.attack') && !t.has('.g-forecast') && !t.has('.g-target'),
      done: (t) => t.has('.g-menu.attack') || t.has('.g-target') || t.has('.g-forecast') || !!pending(t),
    },
    {
      id: 'pick-card',
      after: ['pick-skill'],
      say: 'Cada carta é um golpe e diz o que faz. As bolinhas são o custo. Toque em um golpe.',
      target: { dom: '.g-menu.attack .g-card' },
      block: true,
      when: (t) => t.has('.g-menu.attack .g-card') && !t.has('.g-target') && !t.has('.g-forecast') && !pending(t),
      done: (t) => t.has('.g-target') || t.has('.g-forecast') || !!pending(t),
    },
    {
      id: 'tap-enemy',
      after: ['pick-card'],
      say: 'Os inimigos que você alcança brilham. Toque em um deles.',
      target: { figure: (t) => t.attackableEnemy() },
      block: true,
      when: (t) => phase(t) === 'heroActing' && !pending(t) && !!t.attackableEnemy() && !t.has('.g-forecast'),
      done: (t) => t.has('.g-forecast') || !!pending(t),
    },
    {
      id: 'forecast',
      after: ['tap-enemy'],
      say: 'Antes de atacar você vê a chance de acertar e o dano. Depois os dados decidem! Toque em Atacar.',
      target: { dom: '.g-fc-go' },
      block: true,
      when: (t) => t.has('.g-forecast'),
      done: (t) => !t.has('.g-forecast'),
    },
    {
      id: 'dice',
      after: ['forecast'],
      say: 'Os dados decidem: cada dado mostra o que valeu (✓ acerta, ✗ erra). Toque em Continuar.',
      target: { dom: '.prompt .btn.primary' },
      block: true,
      when: (t) => pending(t) === 'attackPost',
      done: (t) => pending(t) !== 'attackPost',
    },
    {
      id: 'ap',
      after: ['forecast'],
      say: 'O golpe gastou bolinhas (PA). Faça outra coisa ou toque em Encerrar para passar a vez.',
      target: { dom: '.g-act.end' },
      when: (t) => phase(t) === 'heroActing' && !pending(t) && t.has('.g-act.end') && !t.has('.g-forecast'),
      done: (t) => phase(t) !== 'heroActing',
      autoMs: 6500,
    },
    {
      id: 'defend',
      say: 'Um inimigo ataca! Mais dados, mais chance de bloquear o dano. Toque em Defender.',
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

/** First steps in the real-time world: walk, follow the trail, use the door. */
/** walking around with nothing else on screen (no story sheet, no confirmation) */
const inWorld = (t: TutCtx) => t.st?.phase === 'explore' && t.world.active && !t.has('.k-sheet');
export const FIRST_WALK: Chapter = {
  id: 'first-walk',
  start: (t) => inWorld(t) && (t.st?.completed?.length ?? 0) === 0,
  end: (t) => t.st?.phase !== 'explore',
  steps: [
    {
      id: 'walk',
      say: 'Arraste o dedo para andar (no PC: WASD ou clique).',
      target: { point: (t) => t.world.leader },
      when: (t) => inWorld(t) && !t.world.busy && !!t.world.hint,
      done: (t) => !t.world.hint,
    },
    {
      id: 'follow',
      say: 'Siga as brasas até a porta que brilha.',
      target: { point: (t) => t.world.main },
      when: (t) => inWorld(t) && !t.world.busy && !t.world.hint && !t.world.prompt && !!t.world.main,
      done: (t) => t.world.prompt,
      autoMs: 6000,
    },
    {
      id: 'use',
      say: 'Perto de algo? Toque no botão para usar.',
      target: { dom: '.x-act' },
      when: (t) => inWorld(t) && !t.world.busy && t.has('.x-act'),
      // used: the place changes (door → battle) or a "no way back" confirmation opens
      done: (t) => t.st?.phase !== 'explore' || t.has('.k-sheet'),
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
/** First active figure carrying a condition (heroes first), for "first time you see it" tips. */
const withCond = (t: TutCtx, k: string) => {
  const figs = (t.S?.figures ?? []).filter((f) => f.status === 'active' && (f.conditions as unknown as Record<string, unknown>)[k]);
  return (figs.find((f) => f.side === 'H') ?? figs[0])?.id ?? null;
};
const condTip = (k: string, say: string): Tip => ({
  id: `cond-${k}`,
  say,
  target: { figure: (t) => withCond(t, k) },
  when: (t) => inCombat(t) && !pending(t) && (phase(t) === 'heroActing' || phase(t) === 'tempo' || phase(t) === 'heroBand') && !!withCond(t, k),
});

export const TIPS: Tip[] = [
  {
    id: 'kit',
    say: 'Toque no nome do herói para ver tudo o que ele sabe fazer.',
    target: { dom: '.g-kit-btn' },
    when: (t) => phase(t) === 'heroActing' && !pending(t) && (t.S?.cycle ?? 0) >= 2 && t.has('.g-kit-btn') && !t.has('.g-forecast') && !t.has('.g-target'),
  },
  condTip('sangramento', 'Sangrando: perde vida ao se mover ou atacar.'),
  condTip('veneno', 'Veneno: dano no fim da vez de quem está envenenado.'),
  condTip('queimando', 'Queimando: 1 de dano por ciclo. Gaste 1 AP para apagar.'),
  condTip('imobilizado', 'Imobilizado: não consegue andar nesta vez.'),
  condTip('atordoado', 'Atordoado: tem 1 AP a menos.'),
  condTip('exposto', 'Exposto: o próximo ataque contra ele usa um dado maior.'),
  condTip('quebrado', 'Quebrado: a armadura vale 1 a menos no próximo golpe.'),
  condTip('guardado', 'Guardado: o próximo dano recebido é 1 menor.'),
  {
    id: 'paths',
    say: 'Mais de um caminho! Aqui você vê todos e o mapa.',
    target: { dom: '.x-paths-btn' },
    when: (t) => t.st?.phase === 'explore' && t.world.active && !t.world.busy && (t.st?.completed?.length ?? 0) > 0 && t.count('.x-track .x-choice') >= 2,
  },
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
    id: 'tie',
    say: 'Empate: vocês escolhem quem o inimigo vai atacar.',
    target: { dom: '.prompt' },
    when: (t) => pending(t) === 'tieBreak',
  },
];
