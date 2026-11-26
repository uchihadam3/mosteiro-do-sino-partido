/**
 * Headless autoplayer: drives the real engine with simple, deterministic heuristics.
 * Used by end-to-end tests (full D1 runs for 1–5 heroes, both routes) and by tools/sim.
 * It never bypasses validation: every move is a normal command.
 */
import {
  actionAvailability,
  actionTargets,
  campaignDispatch,
  ctxOf,
  dungeon,
  enemies,
  expectedSuccesses,
  heroes,
  type CampaignCommand,
  type CampaignState,
  type Command,
  type CombatState,
  type Figure,
  type PendingAnswer,
  type SectorKey,
  type Tempo,
} from '@mosteiro/core';
import { finishDungeon } from '../dungeons/d1';

export interface Strategy {
  route: 'leste' | 'oeste';
  optionals: boolean;
  /** Try Sete Linhas in the Scriptorium. */
  decipher: boolean;
  maxCommands?: number;
}

const TEMPO_BY_CLASS: Record<string, Tempo> = { guerreiro: 'tatico', paladino: 'tatico', arcanista: 'tatico', clerigo: 'tatico', arqueiro: 'tatico', ladino: 'rapido' };

export function answerPending(S: CombatState): PendingAnswer | null {
  const p = S.pending;
  if (!p) return null;
  switch (p.kind) {
    case 'attackPost': {
      let imp = p.roll.impulsos;
      const src = S.figures.find((f) => f.id === p.attack.sourceId)!;
      let mira = src.res?.mira ?? 0;
      let conv = src.res?.conviccao ?? 0;
      let brecha = Number(p.attack.data['targetBrechas'] ?? 0);
      const groups = new Set<string>();
      const chosen: string[] = [];
      const order = [...p.options].sort((a, b) => score(b.id) - score(a.id));
      for (const o of order) {
        const ci = o.cost.impulso ?? 0,
          cm = o.cost.mira ?? 0,
          cc = o.cost.conviccao ?? 0,
          cb = o.cost.brecha ?? 0;
        if (ci > imp || cm > mira || cc > conv || cb > brecha) continue;
        if (o.group && groups.has(o.group)) continue;
        if (o.id === 'mira:cover' || o.id.includes('passo') || o.id.includes('escapar')) continue;
        if (o.requiresHit && p.roll.successes + (chosen.includes('brecha:pontoFraco') ? 1 : 0) < 1 && o.id !== 'brecha:pontoFraco') continue;
        chosen.push(o.id);
        imp -= ci;
        mira -= cm;
        conv -= cc;
        brecha -= cb;
        if (o.group) groups.add(o.group);
      }
      return { kind: 'attackPost', choices: chosen };
    }
    case 'defense': {
      const t = S.figures.find((f) => f.id === p.d.targetId)!;
      const dano = p.preview.dano;
      const used = new Set<string>();
      const out: { heroId: string; kind: string }[] = [];
      if (dano >= 2 || t.hp <= dano + 1) {
        for (const o of p.options) {
          if (used.has(o.heroId) || out.length + p.d.dice.length >= 3) continue;
          used.add(o.heroId);
          out.push({ heroId: o.heroId, kind: o.kind });
        }
      }
      return { kind: 'defense', reactions: out };
    }
    case 'egide':
      return { kind: 'egide', paladinId: p.paladins[0] };
    case 'conditionResponse':
      return { kind: 'conditionResponse', choice: p.options[0] ? { heroId: p.options[0].heroId, kind: p.options[0].kind } : null };
    case 'step':
      return { kind: 'step', sector: null };
    case 'tieBreak':
      return { kind: 'tieBreak', heroId: [...p.candidates].sort((a, b) => hpOf(S, b) - hpOf(S, a))[0] };
    case 'choice': {
      const o = p.options.find((x) => x.id !== 'none' && x.id !== 'no') ?? p.options[0];
      return { kind: 'choice', optionId: o.id };
    }
    case 'allocate': {
      const alloc: Record<string, number> = {};
      let left = p.total;
      for (const t of p.targets) {
        const n = Math.min(p.maxPer, left);
        alloc[t] = n;
        left -= n;
      }
      return { kind: 'allocate', alloc };
    }
    case 'silencio':
      return { kind: 'silencio', use: true };
  }
  return null;
  function score(id: string) {
    if (id === 'smite' || id.startsWith('brecha:golpe')) return 10;
    if (id === 'brecha:pontoFraco') return 9;
    if (id.startsWith('mira:armor')) return 6;
    return 1;
  }
}
function hpOf(S: CombatState, id: string) {
  return S.figures.find((f) => f.id === id)?.hp ?? 0;
}

/** Pick the next command for the current combat state. */
export function nextCombatCommand(S: CombatState): Command | null {
  if (S.phase === 'ended') return null;
  if (S.pending) {
    const a = answerPending(S);
    return a ? { t: 'answer', pendingId: S.pending.id, answer: a } : null;
  }
  const c = ctxOf(S);
  if (S.phase === 'deploy') return { t: 'start' };
  if (S.phase === 'tempo') {
    const missing = heroes(c).find((h) => !h.tempo);
    if (missing) return { t: 'tempo', figureId: missing.id, tempo: TEMPO_BY_CLASS[missing.typeId] ?? 'tatico' };
    return { t: 'confirmTempo' };
  }
  if (S.phase === 'heroBand') {
    const t = S.band === 'HR' ? 'rapido' : S.band === 'HT' ? 'tatico' : 'pesado';
    const cand = heroes(c).find((h) => h.tempo === t && !h.acted);
    return cand ? { t: 'activate', figureId: cand.id } : null;
  }
  if (S.phase === 'heroActing') {
    const f = S.figures.find((x) => x.id === S.activeId)!;
    return chooseAction(S, f) ?? { t: 'end', figureId: f.id };
  }
  return null;
}

function chooseAction(S: CombatState, f: Figure): Command | null {
  const c = ctxOf(S);
  const avail = actionAvailability(c, f).filter((a) => !a.reason);
  const find = (id: string) => avail.find((a) => a.def.id === id);
  const act = (id: string, extra: Partial<Command & { t: 'action' }> = {}): Command => ({ t: 'action', actionId: id, figureId: f.id, pre: ['pesado'], ...extra }) as Command;
  // objectives
  const sete = find('obj_setelinhas');
  if (sete && S.flags['__autoDecipher'] !== false) {
    const attr = (f.attrs!.arcano >= f.attrs!.precisao ? 'arcano' : 'precisao') as string;
    return act('obj_setelinhas', { option: attr });
  }
  const cw = find('obj_contrapeso');
  if (cw && S.boss.ressonancia >= 1) {
    const opts = cw.def.options!(c, f).filter((o) => !o.disabled);
    const best = opts.sort((a, b) => Number(b.label.match(/D(\d+)/)?.[1] ?? 0) - Number(a.label.match(/D(\d+)/)?.[1] ?? 0))[0];
    if (best) return act('obj_contrapeso', { option: best.id, pre: ['pesado', 'manivela'] });
  }
  // raise fallen ally
  const raise = find('levantar');
  if (raise) {
    const t = actionTargets(c, f, raise.def);
    if (t.figures.length) return act('levantar', { targetIds: [t.figures[0]] });
  }
  // AMÉM when ready
  if (find('c_amem')) return act('c_amem');
  // heal when hurt
  if (f.hp <= Math.ceil(f.maxHp / 3) && find('cantil')) return act('cantil');
  const prece = find('c_prece');
  if (prece) {
    const t = actionTargets(c, f, prece.def).figures.map((id) => S.figures.find((x) => x.id === id)!).filter((h) => h.hp <= h.maxHp - 3);
    if (t.length) return act('c_prece', { targetIds: [t.sort((a, b) => a.hp - b.hp)[0].id] });
  }
  // attacks: pick best expected damage
  let best: { cmd: Command; score: number } | null = null;
  for (const a of avail) {
    if (a.def.kind !== 'attack' && a.def.id !== 'a_lanca') continue;
    if (a.def.targeting.type !== 'enemy' && a.def.targeting.type !== 'area2') continue;
    const ts = actionTargets(c, f, a.def);
    const pv = a.def.preview?.(c, f);
    const dice = (pv?.dice ?? ['poder', 'poder']).map((x) => f.attrs![x as keyof typeof f.attrs]);
    const exp = expectedSuccesses(dice as any);
    if (a.def.targeting.type === 'area2') {
      for (const ar of ts.areas) {
        const n = enemies(c).filter((e) => ar.includes(e.sector)).length;
        const sc = n * ((pv?.dano ?? 1) + exp - 1) - a.cost * 0.1;
        if (n && (!best || sc > best.score)) best = { cmd: act(a.def.id, { sectors: ar as SectorKey[] }), score: sc };
      }
      continue;
    }
    for (const tid of ts.figures) {
      const e = S.figures.find((x) => x.id === tid)!;
      const dmg = Math.max(0, (pv?.dano ?? 2) + exp - 1 - e.armor);
      const sc = dmg + (e.hp <= dmg ? 3 : 0) + (e.isBoss ? 0.5 : 0) - a.cost * 0.1;
      if (!best || sc > best.score) best = { cmd: act(a.def.id, { targetIds: [tid] }), score: sc };
    }
  }
  if (best) return best.cmd;
  // support actions
  const prot = find('p_protecao');
  if (prot) {
    const t = actionTargets(c, f, prot.def).figures;
    if (t.length) return act('p_protecao', { targetIds: [t[0]] });
  }
  const mirar = find('ar_mirar');
  if (mirar) return act('ar_mirar');
  // move toward a column with enemies (Reposicionar)
  const rep = find('reposicionar');
  if (rep && (f.counters.activation['autoMoves'] ?? 0) < 2) {
    const ts = actionTargets(c, f, rep.def).sectors;
    const ecols = enemies(c).map((e) => Number(e.sector[3]));
    if (ecols.length) {
      const melee = ['guerreiro', 'paladino', 'ladino'].includes(f.typeId);
      const scoreK = (k: string) => Math.min(...ecols.map((col) => Math.abs(col - Number(k[3])))) + (melee && k[2] === 'R' ? 1 : 0) + (!melee && k[2] === 'F' ? 0.5 : 0);
      const cur = scoreK(f.sector);
      const better = ts.filter((k) => scoreK(k) < cur).sort((a, b) => scoreK(a) - scoreK(b));
      if (better.length) {
        f.counters.activation['autoMoves'] = (f.counters.activation['autoMoves'] ?? 0) + 1;
        return act('reposicionar', { sector: better[0] });
      }
    }
  }
  return null;
}

// ============================================================================ campaign autoplay
export interface RunReport {
  state: CampaignState;
  commands: number;
  combats: number;
  errors: string[];
  outcome: 'victory' | 'gameover' | 'stuck';
  seenOptions: string[][];
}

export function autoplayCampaign(start: CampaignState, strat: Strategy): RunReport {
  let s = start;
  const errors: string[] = [];
  let n = 0;
  let combats = 0;
  const seen: string[][] = [];
  const max = strat.maxCommands ?? 40000;
  const run = (cmd: CampaignCommand) => {
    const r = campaignDispatch(s, cmd, 0);
    n++;
    if (r.error) errors.push(`${cmd.t}: ${r.error}`);
    else s = r.state;
    return !r.error;
  };
  while (n < max) {
    if (s.pendingArchive) {
      run({ t: 'closeArchive' });
      continue;
    }
    if (s.narrative) {
      run({ t: 'closeNarrative' });
      continue;
    }
    if (s.phase === 'prep') {
      run({ t: 'beginDungeon' });
      continue;
    }
    if (s.phase === 'gameover') return { state: s, commands: n, combats, errors, outcome: 'gameover', seenOptions: seen };
    if (s.phase === 'epilogue') {
      s = structuredClone(s);
      finishDungeon(s);
      return { state: s, commands: n, combats, errors, outcome: 'victory', seenOptions: seen };
    }
    if (s.phase === 'reward') {
      const r = s.reward!;
      let progressed = false;
      for (const u of r.unassigned) {
        const h = s.heroes.find((x) => x.backpack.length < (s.partySizeOriginal <= 1 ? 7 : s.partySizeOriginal === 2 ? 5 : 4));
        if (h && run({ t: 'assignLoot', uid: u, heroId: h.id })) {
          progressed = true;
          break;
        }
      }
      if (!progressed) run({ t: 'collectRewards' });
      continue;
    }
    if (s.phase === 'explore') {
      // between combats: raise fallen heroes and drink when low
      const fallen = s.heroes.find((h) => h.status === 'caido');
      if (fallen) {
        run({ t: 'raiseOutOfCombat', heroId: fallen.id });
        continue;
      }
      const opts = dungeon(s.dungeonId).options(s);
      seen.push(opts.map((o) => o.id));
      const pick = pickOption(opts.map((o) => o.id), strat);
      if (!pick) return { state: s, commands: n, combats, errors, outcome: 'stuck', seenOptions: seen };
      run({ t: 'explore', optionId: pick });
      if ((s.phase as string) === 'combat') {
        combats++;
        if (!strat.decipher && s.combat) s.combat.flags['__autoDecipher'] = false;
      }
      continue;
    }
    if (s.phase === 'combat' && s.combat) {
      const cmd = nextCombatCommand(s.combat);
      if (!cmd) return { state: s, commands: n, combats, errors: [...errors, 'combat stuck'], outcome: 'stuck', seenOptions: seen };
      const before = s.combat;
      const ok = run({ t: 'combat', cmd });
      if (!ok && cmd.t === 'action') {
        // fallback: end activation
        if (before.activeId) run({ t: 'combat', cmd: { t: 'end', figureId: before.activeId } });
      }
      continue;
    }
    return { state: s, commands: n, combats, errors, outcome: 'stuck', seenOptions: seen };
  }
  return { state: s, commands: n, combats, errors: [...errors, 'max commands'], outcome: 'stuck', seenOptions: seen };
}

function pickOption(ids: string[], strat: Strategy): string | null {
  const pref = strat.optionals ? ['go_gal', 'go_cap', strat.route === 'leste' ? 'go_scr' : 'go_can', 'go_car', 'go_rel', 'go_rare', 'go_cri', 'go_sal', 'go_cam'] : ['go_gal', strat.route === 'leste' ? 'go_scr' : 'go_can', 'go_car', 'go_sal', 'go_cam'];
  for (const p of pref) if (ids.includes(p)) return p;
  // the Sete Linhas are read while exploring the Scriptorium, only when the strategy wants to decipher them
  if (strat.decipher && ids.includes('read_lines')) return 'read_lines';
  return ids.find((i) => !i.startsWith('go_') && i !== 'read_lines') ?? null;
}
