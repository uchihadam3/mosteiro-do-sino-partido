/** Seat permissions for online co-op (pure: also unit-tested). */
import { findItem, type CampaignCommand, type CampaignState } from '@mosteiro/core';

/** Seat-level permission: a player only acts for the heroes assigned to their seat. */
export function permission(s: CampaignState, seat: string, cmd: CampaignCommand): string | null {
  const owns = (heroId?: string | null) => !!heroId && s.heroes.find((h) => h.id === heroId)?.seat === seat;
  if (cmd.t === 'combat') {
    const c = cmd.cmd;
    const S = s.combat;
    if (!S) return 'Sem combate.';
    switch (c.t) {
      case 'tempo':
      case 'activate':
      case 'end':
        return owns(c.figureId) ? null : 'Este herói pertence a outro jogador.';
      case 'action':
        return owns(c.figureId) ? null : 'Este herói pertence a outro jogador.';
      case 'reroll':
        return S.pending && S.pending.kind === 'attackPost' && owns(S.pending.attack.sourceId) ? null : 'Decisão de outro jogador.';
      case 'answer': {
        const p = S.pending;
        if (!p) return 'Nada a decidir.';
        if (p.kind === 'defense') {
          const a = c.answer as { kind: 'defense'; reactions: { heroId: string }[] };
          if (a.reactions.some((r) => !owns(r.heroId))) return 'Você só pode gastar Reações dos seus heróis.';
          return p.controllers.some((id) => owns(id)) || owns(p.d.targetId) ? null : 'Decisão de outro jogador.';
        }
        if (!p.controllers.length) return null;
        return p.controllers.some((id) => owns(id)) ? null : 'Decisão de outro jogador.';
      }
      case 'deploy':
        return owns(c.figureId) ? null : 'Este herói pertence a outro jogador.';
      case 'confirmTempo':
      case 'start':
      case 'settings':
        return null;
    }
  }
  switch (cmd.t) {
    case 'equip':
    case 'unequip':
    case 'mastery':
    case 'talent':
    case 'drinkCantil':
    case 'renameHero':
      return owns(cmd.heroId) ? null : 'Este herói pertence a outro jogador.';
    case 'useOutOfCombat':
      return owns(cmd.heroId) ? null : 'Este herói pertence a outro jogador.';
    case 'buy':
      return cmd.heroId === 'armazem' || owns(cmd.heroId) ? null : 'Compre para os seus heróis ou para o Armazém.';
    case 'sell':
    case 'transfer': {
      // items in the shared Armazém belong to the party; items carried or equipped belong to the hero's player
      const at = findItem(s, cmd.uid);
      if (!at) return 'Item não encontrado.';
      const fromOk = at.where === 'armazem' || owns(at.hero?.id);
      if (!fromOk) return 'Este item está com o herói de outro jogador.';
      if (cmd.t === 'transfer' && at.where === 'armazem' && cmd.to !== 'armazem' && !owns(cmd.to)) return 'Pegue do Armazém só para os seus heróis.';
      return null;
    }
    case 'assignLoot':
      // the host acts as the party's quartermaster; other players claim loot for their own heroes or the Armazém
      return seat === 'host' || cmd.heroId === 'armazem' || cmd.heroId === 'leave' || owns(cmd.heroId) ? null : 'Este herói pertence a outro jogador.';
    case 'assignSeat':
      return seat === 'host' ? null : 'Apenas o anfitrião distribui os heróis.';
    default:
      return null;
  }
}
