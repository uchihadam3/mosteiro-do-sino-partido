/**
 * Universal hero actions (R05, §6, §16, §24, §26, §50).
 */
import type { ActionDef } from './registry';
import type { Figure, SectorKey } from './types';
import type { Ctx } from './state';
import { adjacent, connections, hasRoom, isEngaged, parseSector, sectorEngaged } from './board';
import { applyCondition, canUse, fig, heal, hooksOf, log, markUse, raiseHero, setCond } from './effects';
import { heroMove, leaveEngagementCost, stepDestinations } from './engine';

const SRC = (section: string) => ({ section, status: 'CANONICO' as const });

function reposDestinations(c: Ctx, f: Figure): SectorKey[] {
  if (f.conditions.imobilizado) return [];
  return connections(f.sector).filter((k) => hasRoom(c.S.figures, k, f.id));
}

export function repositionCost(c: Ctx, f: Figure, dest?: SectorKey): number {
  let cost = 1;
  const first = (f.counters.activation['reposCount'] ?? 0) === 0;
  if (first) for (const { h } of hooksOf(f)) cost += h.repositionExtraCostFirst ?? 0;
  if (dest) cost += leaveEngagementCost(c, f, dest, false);
  else if (isEngaged(f, c.S.figures)) cost += 0; // shown per destination
  return cost;
}

export const reposicionar: ActionDef = {
  id: 'reposicionar',
  name: 'Reposicionar',
  ap: 1,
  kind: 'move',
  icon: 'act_move',
  text: 'Mova 1 conexão legal (1 AP). Sair de Engajamento custa +1 AP. Pode atravessar Setor aliado cheio, mas não terminar nele.',
  source: SRC('§6 / R05'),
  targeting: { type: 'sector', side: 'H' },
  apCost: (c, f, cmd) => repositionCost(c, f, cmd?.sector),
  available: (c, f) => (f.conditions.imobilizado ? 'Imobilizado impede movimento voluntário.' : f.counters.activation['respiracao'] ? 'Respiração Controlada: apenas Passos nesta Ativação.' : null),
  validate: (c, f, cmd) => {
    if (!cmd.sector) return 'Escolha o Setor.';
    if (!reposDestinations(c, f).includes(cmd.sector)) return 'Destino não conectado ou cheio.';
    if (repositionCost(c, f, cmd.sector) > (f.ap ?? 0)) return 'AP insuficiente (sair de Engajamento custa +1).';
    return null;
  },
  execute: (c, f, cmd) => {
    f.counters.activation['reposCount'] = (f.counters.activation['reposCount'] ?? 0) + 1;
    heroMove(c, f, cmd.sector!, { kind: 'reposicionar', ignoreEngagement: false });
  },
};

/** Tempo Rápido: 1 free Passo (still pays +1 AP to leave Engajamento). */
export const passoRapido: ActionDef = {
  id: 'passoRapido',
  name: 'Passo (Rápido)',
  ap: 0,
  kind: 'move',
  icon: 'act_passo',
  text: 'Tempo Rápido concede 1 Passo gratuito por Ativação. Sair de Engajamento ainda custa +1 AP.',
  source: SRC('§6 / §7'),
  targeting: { type: 'move', steps: 1, ignoreEngagement: false },
  hidden: (c, f) => f.tempo !== 'rapido',
  apCost: (c, f, cmd) => (cmd?.sector ? leaveEngagementCost(c, f, cmd.sector, false) : 0),
  available: (c, f) => {
    if ((f.counters.activation['rapidStep'] ?? 1) >= 1) return 'Passo gratuito já usado (ou indisponível pela Armadura).';
    if (f.conditions.imobilizado) return 'Imobilizado.';
    return null;
  },
  validate: (c, f, cmd) => (cmd.sector && leaveEngagementCost(c, f, cmd.sector, false) > (f.ap ?? 0) ? 'Sair de Engajamento custa +1 AP.' : null),
  execute: (c, f, cmd) => {
    f.counters.activation['rapidStep'] = 1;
    heroMove(c, f, cmd.sector!, { kind: 'passo', ignoreEngagement: false });
  },
};

export const trocar: ActionDef = {
  id: 'trocar',
  name: 'Trocar',
  ap: 1,
  kind: 'move',
  icon: 'act_swap',
  text: 'Você e um aliado ativo em Setor conectado trocam de posição (1 AP), mesmo com Setores cheios. Se qualquer um deixar Engajamento, +1 AP no total.',
  source: SRC('R05 Trocar'),
  targeting: { type: 'ally', range: 'adjacent' },
  apCost: (c, f, cmd) => {
    const o = cmd?.targetIds?.[0] ? c.S.figures.find((x) => x.id === cmd.targetIds![0]) : undefined;
    if (!o) return 1;
    const leaves = (isEngaged(f, c.S.figures) && o.sector !== f.sector) || (isEngaged(o, c.S.figures) && o.sector !== f.sector);
    return 1 + (leaves ? 1 : 0);
  },
  available: (c, f) => (f.conditions.imobilizado ? 'Imobilizado.' : f.counters.activation['respiracao'] ? 'Respiração Controlada: apenas Passos nesta Ativação.' : null),
  validate: (c, f, cmd) => {
    const o = fig(c, cmd.targetIds![0]);
    if (o.sector === f.sector) return 'Já estão no mesmo Setor.';
    if (!connections(f.sector).includes(o.sector)) return 'O aliado precisa estar em Setor conectado.';
    if (o.conditions.imobilizado) return 'O aliado está Imobilizado.';
    return null;
  },
  execute: (c, f, cmd) => {
    const o = fig(c, cmd.targetIds![0]);
    const a = f.sector;
    const b = o.sector;
    f.counters.activation['trocaCount'] = (f.counters.activation['trocaCount'] ?? 0) + 1;
    o.sector = a;
    c.events.push({ type: 'move', figureId: o.id, from: b, to: a, forced: false });
    heroMove(c, f, b, { kind: 'troca', ignoreEngagement: false });
    log(c, 'move', `${f.name} e ${o.name} trocam de posição.`);
  },
};

export const trocarArma: ActionDef = {
  id: 'trocarArma',
  name: 'Trocar Arma',
  ap: 1,
  kind: 'utility',
  icon: 'act_swap_weapon',
  text: 'Troque Primária ↔ Secundária preparada (1 AP, máximo uma vez por Ativação). Não reinicia limites “uma vez por...”.',
  source: SRC('§16'),
  targeting: { type: 'none' },
  limit: 'activation',
  available: (c, f) => (!f.equipment?.secondary ? 'Sem arma Secundária preparada.' : null),
  execute: (c, f) => {
    const eq = f.equipment!;
    const p = eq.primary;
    eq.primary = eq.secondary;
    eq.secondary = p;
    log(c, 'item', `${f.name} troca de arma.`);
    c.events.push({ type: 'resource', figureId: f.id, resource: 'weapon', value: 1 });
    // Manto do Primeiro Caminho — CAMINHO: once per Cycle, after TROCAR ARMA, Passo 1.
    if (f.manto === 'caminho' && canUse(f, 'cycle', 'mantoCaminho')) {
      markUse(f, 'cycle', 'mantoCaminho');
      c.S.queue.unshift({ op: 'step', figureId: f.id, steps: 1, ignoreEngagement: false, reason: 'Manto — Caminho' });
    }
  },
};

export const cantil: ActionDef = {
  id: 'cantil',
  name: 'Beber do Cantil',
  ap: 1,
  kind: 'support',
  icon: 'cantil',
  text: 'Em si mesmo, 1 AP, máximo 1 gole por Ativação: cure 3 HP. Começa com 2 cargas; não recarrega entre Locais.',
  source: SRC('§26'),
  targeting: { type: 'none' },
  limit: 'activation',
  available: (c, f) => ((f.cantil ?? 0) <= 0 ? 'Cantil vazio.' : f.hp >= f.maxHp ? 'HP cheio.' : null),
  execute: (c, f) => {
    f.cantil = (f.cantil ?? 0) - 1;
    heal(c, f, 3, f.id);
    log(c, 'item', `${f.name} bebe do Cantil (${f.cantil} carga(s) restante(s)).`);
    for (const { h } of hooksOf(f)) h.onCantil?.(c, f);
  },
};

export const levantar: ActionDef = {
  id: 'levantar',
  name: 'Levantar',
  ap: 2,
  kind: 'support',
  icon: 'act_raise',
  text: 'Herói Adjacente a um herói Caído gasta 2 AP: ele retorna com 25% do HP máximo atual (arredondado para cima) e recebe 1 Trauma.',
  source: SRC('§50.2'),
  targeting: { type: 'ally', range: 'adjacent', allowCaido: true },
  validate: (c, f, cmd) => (fig(c, cmd.targetIds![0]).status !== 'caido' ? 'O alvo não está Caído.' : null),
  execute: (c, f, cmd) => {
    const t = fig(c, cmd.targetIds![0]);
    const pct = (f.talents ?? []).includes('c_mao_que_levanta') ? 0.35 : 0.25;
    raiseHero(c, t, pct);
  },
};

export const apagarFogo: ActionDef = {
  id: 'apagarFogo',
  name: 'Apagar Chamas',
  ap: 1,
  kind: 'support',
  icon: 'cond_queimando',
  text: 'Remova Queimando de si ou de um aliado Adjacente (1 AP).',
  source: SRC('§15 Queimando'),
  targeting: { type: 'ally', range: 'selfOrAdjacent' },
  validate: (c, f, cmd) => (!fig(c, cmd.targetIds![0]).conditions.queimando ? 'O alvo não está Queimando.' : null),
  execute: (c, f, cmd) => setCond(c, fig(c, cmd.targetIds![0]), 'queimando', false),
};

export const UNIVERSAL_ACTIONS: ActionDef[] = [reposicionar, passoRapido, trocar, trocarArma, cantil, levantar, apagarFogo];

export { stepDestinations, sectorEngaged, parseSector, adjacent, applyCondition };
