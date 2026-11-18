/**
 * Classes V2 (Regra Mestra §18, §19, §50, §51). All six classes with identity mechanics.
 * Base techniques are CANÔNICO; interpretations of vague texts are HIPÓTESE and listed in
 * docs/OPEN_DESIGN_QUESTIONS.md with the IDs referenced in comments (Q-xxx).
 */
import {
  adjacent,
  applyCondition,
  canTarget,
  canUse,
  connections,
  enemies,
  fig,
  hasCover,
  hasItem,
  hasRoom,
  hasTalent,
  heal,
  heroes,
  inSupportZone,
  isEngaged,
  isActive,
  log,
  markUse,
  newId,
  parseSector,
  pull,
  push,
  pushOps,
  raiseLowest,
  setCond,
  startHeroAttack,
  tryFig,
  stepDestinations,
  heroMove,
  leaveEngagementCost,
  halfOrLess,
  type ActionDef,
  type AttackOption,
  type ClassDef,
  type Ctx,
  type Figure,
  type RuneId,
  type SectorKey,
  type Verse,
  RUNE_FORMS,
  RUNE_INTENTS,
} from '@mosteiro/core';
import { bowAllows, diceOf, heroDie, inIdeal, nearestAllyDistance, stepLater, targetOf, weaponAttack, weaponCatOf, weaponOf } from './common';

const C = (section: string) => ({ section, status: 'CANONICO' as const });
const H = (section: string, note: string) => ({ section, status: 'HIPOTESE' as const, note });

// =============================================================================== shared
/** Ataque Básico com arma — HIPÓTESE Q-BASICO (§19 weapon stat lines + §20 "Ataque Básico"). */
function ataqueBasico(classId: string): ActionDef {
  return {
    id: `${classId}_basico`,
    name: 'Ataque com Arma',
    ap: 2,
    kind: 'attack',
    icon: 'act_attack_melee',
    text: 'Ataque Básico com a arma Primária: dados, Dano e alcance da arma. Assinaturas da arma aplicam-se normalmente.',
    source: H('§19 / §20', 'Q-BASICO: Ataque Básico universal com dados da arma para classes marciais.'),
    targeting: { type: 'enemy', reach: 'weapon' },
    preview: (c, f) => ({ dice: weaponOf(f)?.dice, dano: weaponOf(f)?.dano, cat: weaponCatOf(f) }),
    execute: (c, f, cmd) => weaponAttack(c, f, cmd, { techId: `${classId}_basico`, name: weaponOf(f)?.name ?? 'Ataque', dice: 'weapon', dano: 'weapon' }),
  };
}

function impulsoOpt(id: string, label: string, cost = 1, group?: string, requiresHit = true): AttackOption {
  return { id, label, source: '', cost: { impulso: cost }, requiresHit, group };
}

// =============================================================================== GUERREIRO
function linked(f: Figure, need: 1 | 2) {
  return (f.res?.sequencia ?? 0) === need;
}
function setSeq(c: Ctx, f: Figure, v: 0 | 1 | 2) {
  if (!f.res) return;
  f.res.sequencia = v;
  f.res.seqAdvanced = true;
  c.events.push({ type: 'resource', figureId: f.id, resource: 'sequencia', value: v });
  log(c, 'resource', `${f.name}: Sequência ${v === 0 ? 'zerada' : v === 1 ? 'I' : 'II'}.`);
}

const guerreiroActions: ActionDef[] = [
  ataqueBasico('guerreiro'),
  {
    id: 'g_corte',
    name: 'Corte de Abertura',
    tier: 'I',
    ap: 2,
    kind: 'attack',
    icon: 'act_attack_melee',
    text: 'Corpo a Corpo/alcance da arma. Poder + Determinação, Dano 2. Ao acertar: Sequência I. Impulso: Empurrar 1 ou Passo 1.',
    source: C('§18.1'),
    targeting: { type: 'enemy', reach: 'weapon' },
    preview: () => ({ dice: ['poder', 'determinacao'], dano: 2 }),
    execute: (c, f, cmd) => weaponAttack(c, f, cmd, { techId: 'g_corte', name: 'Corte de Abertura', dice: ['poder', 'determinacao'], dano: 2 }),
    attackOptions: () => [impulsoOpt('g_corte:empurrar', 'Impulso: Empurrar 1', 1, 'corte'), impulsoOpt('g_corte:passo', 'Impulso: Passo 1', 1, 'corte')],
    onResolve: (c, f, a, r, out) => {
      if (out.hit) setSeq(c, f, 1);
      if (hasTalent(f, 'g_investida_check')) void 0;
    },
    afterAttackOption: (c, f, a, r, opt, out) => {
      if (!out.hit) return;
      const t = tryFig(c, a.targetId);
      if (opt === 'g_corte:empurrar' && t) push(c, t, f.id);
      if (opt === 'g_corte:passo') stepLater(c, f, 1, false, 'Corte de Abertura — Impulso');
    },
  },
  {
    id: 'g_passo_tatico',
    name: 'Passo Tático',
    tier: 'II',
    ap: 1,
    kind: 'move',
    icon: 'act_passo',
    text: 'Passo 2, ignorando o custo adicional de sair de Engajamento. Se estava em Sequência I, avance para II e receba Guardado.',
    source: C('§18.1'),
    targeting: { type: 'move', steps: 2, ignoreEngagement: true },
    execute: (c, f, cmd) => {
      heroMove(c, f, cmd.sector!, { kind: 'passo', ignoreEngagement: true });
      if (linked(f, 1)) {
        setSeq(c, f, 2);
        applyCondition(c, f, 'guardado', 1, f.id);
      }
    },
  },
  {
    id: 'g_pressao',
    name: 'Pressão de Aço',
    tier: 'II',
    ap: 2,
    kind: 'attack',
    icon: 'act_attack_melee',
    text: 'Poder + Precisão, Dano 2. Se ligada a I e acertar: Sequência II e alvo Exposto. Impulso: Empurrar 1. Dois Impulsos: Sangramento 1.',
    source: C('§18.1'),
    targeting: { type: 'enemy', reach: 'weapon' },
    preview: () => ({ dice: ['poder', 'precisao'], dano: 2 }),
    execute: (c, f, cmd) => weaponAttack(c, f, cmd, { techId: 'g_pressao', name: 'Pressão de Aço', dice: ['poder', 'precisao'], dano: 2, data: { linked: linked(f, 1) } }),
    attackOptions: () => [impulsoOpt('g_pressao:empurrar', 'Impulso: Empurrar 1'), impulsoOpt('g_pressao:sangrar', 'Dois Impulsos: Sangramento 1', 2)],
    onResolve: (c, f, a, r, out) => {
      if (out.hit && a.data['linked']) {
        setSeq(c, f, 2);
        const t = tryFig(c, a.targetId);
        if (t && isActive(t)) applyCondition(c, t, 'exposto', 1, f.id);
      }
    },
    afterAttackOption: (c, f, a, r, opt, out) => {
      const t = tryFig(c, a.targetId);
      if (!out.hit || !t) return;
      if (opt === 'g_pressao:empurrar') push(c, t, f.id);
      if (opt === 'g_pressao:sangrar') applyCondition(c, t, 'sangramento', 1, f.id);
    },
  },
  {
    id: 'g_decisivo',
    name: 'Golpe Decisivo',
    tier: 'III',
    ap: 2,
    kind: 'attack',
    icon: 'act_attack_melee',
    text: 'Poder + Determinação, Dano 2. Se ligada a II: +2 Dano e ignore 1 Armadura. Depois da tentativa, zere a Sequência.',
    source: C('§18.1'),
    targeting: { type: 'enemy', reach: 'weapon' },
    preview: (c, f) => ({ dice: ['poder', 'determinacao'], dano: linked(f, 2) ? 4 : 2 }),
    execute: (c, f, cmd) => {
      const l = linked(f, 2);
      weaponAttack(c, f, cmd, { techId: 'g_decisivo', name: l ? 'Golpe Decisivo (Execução)' : 'Golpe Decisivo', dice: ['poder', 'determinacao'], dano: l ? 4 : 2, ignoreArmor: l ? 1 : 0, data: { linked: l, finisher: l } });
    },
    onResolve: (c, f, a) => {
      setSeq(c, f, 0);
      void a;
    },
  },
];

const guerreiro: ClassDef = {
  id: 'guerreiro',
  name: 'Guerreiro',
  epithet: 'A muralha que avança',
  hp: 14,
  armor: 1,
  attrs: { poder: 8, determinacao: 8, guarda: 6, agilidade: 6, precisao: 6, espirito: 4, sombra: 4, arcano: 4 },
  proficiencies: ['Marcial'],
  startingItems: ['espada_longa', 'machado_batalha', 'lanca', 'martelo_guerra', 'cota_malha'],
  resourceName: 'Sequência',
  description: 'Encadeia técnicas I → II → III. Uma Execução ligada atravessa armaduras. Riposta pune quem erra contra ele.',
  passives: [
    { name: 'Sequência', text: 'Técnicas I → II → III. A Sequência persiste entre Ativações, mas é perdida se uma Ativação terminar sem avançá-la. Uma III ligada recebe sua Execução e depois zera.' },
    { name: 'Riposta', text: 'Uma vez por Ciclo, quando uma Defesa contra Ataque Corpo a Corpo Adjacente resultar em zero Dano final, cause 1 Dano Direto ao atacante.' },
  ],
  actions: guerreiroActions,
  talentPaths: [
    { id: 'vanguarda', name: 'Vanguarda' },
    { id: 'veterano', name: 'Veterano' },
    { id: 'executor', name: 'Executor' },
  ],
  source: C('§18.1'),
  accent: '#a33a32',
  onActivationStart: (c, f) => {
    if (f.res) f.res.seqAdvanced = false;
  },
  onActivationEnd: (c, f) => {
    if (f.res && f.res.sequencia > 0 && !f.res.seqAdvanced) {
      f.res.sequencia = 0;
      c.events.push({ type: 'resource', figureId: f.id, resource: 'sequencia', value: 0 });
      log(c, 'resource', `${f.name} perde a Sequência (a Ativação terminou sem avançá-la).`);
    }
  },
};

// =============================================================================== PALADINO
function julgado(c: Ctx, f: Figure): Figure | undefined {
  const id = f.res?.julgadoId;
  const t = id ? tryFig(c, id) : undefined;
  return t && isActive(t) ? t : undefined;
}
function judge(c: Ctx, f: Figure, t: Figure) {
  for (const e of c.S.figures) if (e.conditions.julgadoPor === f.id) e.conditions.julgadoPor = null;
  t.conditions.julgadoPor = f.id;
  f.res!.julgadoId = t.id;
  c.events.push({ type: 'condition', targetId: t.id, condition: 'julgado', added: true });
  log(c, 'resource', `${f.name} marca ${t.name} como Julgado.`);
}
function promptJudge(c: Ctx, f: Figure) {
  const list = enemies(c);
  if (!list.length) return;
  c.S.pending = {
    id: newId(c, 'p'),
    controllers: [f.id],
    kind: 'choice',
    prompt: `${f.name}: marque gratuitamente um inimigo visível como Julgado.`,
    figureId: f.id,
    handler: 'paladino:julgar',
    options: list.map((e) => ({ id: e.id, label: e.name, detail: `HP ${e.hp}/${e.maxHp} · ${e.sector}` })),
    args: {},
  };
}
function gainConviccao(c: Ctx, f: Figure, n = 1) {
  if (!f.res) return;
  f.res.conviccao = Math.min(3, f.res.conviccao + n);
  c.events.push({ type: 'resource', figureId: f.id, resource: 'conviccao', value: f.res.conviccao });
  log(c, 'resource', `${f.name}: Convicção ${f.res.conviccao}.`);
}

const paladinoActions: ActionDef[] = [
  ataqueBasico('paladino'),
  {
    id: 'p_golpe_radiante',
    name: 'Golpe Radiante',
    ap: 2,
    kind: 'attack',
    icon: 'act_attack_melee',
    text: 'Poder + Espírito, Dano 2. Impulso: Guardado em você ou Empurrar 1. É Radiante por padrão e pode usar Smite quando aplicável.',
    source: C('§18.2'),
    targeting: { type: 'enemy', reach: 'weapon' },
    preview: () => ({ dice: ['poder', 'espirito'], dano: 2 }),
    execute: (c, f, cmd) => weaponAttack(c, f, cmd, { techId: 'p_golpe_radiante', name: 'Golpe Radiante', dice: ['poder', 'espirito'], dano: 2, radiante: true, school: 'holy' }),
    attackOptions: () => [impulsoOpt('p_gr:guardado', 'Impulso: Guardado em você', 1, 'gr'), impulsoOpt('p_gr:empurrar', 'Impulso: Empurrar 1', 1, 'gr')],
    afterAttackOption: (c, f, a, r, opt, out) => {
      if (!out.hit) return;
      if (opt === 'p_gr:guardado') applyCondition(c, f, 'guardado', 1, f.id);
      const t = tryFig(c, a.targetId);
      if (opt === 'p_gr:empurrar' && t) push(c, t, f.id);
    },
  },
  {
    id: 'p_passo_juramento',
    name: 'Passo do Juramento',
    ap: 1,
    kind: 'move',
    icon: 'act_passo',
    text: 'Passo 2 ignorando custo adicional de Engajamento; deve terminar mais perto do Julgado ou de um aliado.',
    source: C('§18.2'),
    targeting: { type: 'move', steps: 2, ignoreEngagement: true },
    validate: (c, f, cmd) => {
      if (!cmd.sector) return null;
      const j = julgado(c, f);
      const colOf = (k: SectorKey) => Number(k[3]);
      const distJ = (k: SectorKey) => (j ? Math.abs(colOf(k) - colOf(j.sector)) + (k[2] === 'F' ? 0 : 1) : Infinity);
      const closerJ = j && distJ(cmd.sector) < distJ(f.sector);
      const closerA = nearestAllyDistance(c, f, cmd.sector) < nearestAllyDistance(c, f);
      return closerJ || closerA ? null : 'Deve terminar mais perto do Julgado ou de um aliado.';
    },
    execute: (c, f, cmd) => heroMove(c, f, cmd.sector!, { kind: 'passo', ignoreEngagement: true }),
  },
  {
    id: 'p_protecao',
    name: 'Proteção Sagrada',
    ap: 1,
    kind: 'support',
    icon: 'cond_guardado',
    text: 'Você ou aliado em alcance de suporte recebe Guardado. Não acumula.',
    source: C('§18.2'),
    targeting: { type: 'ally', range: 'supportOrSelf' },
    validate: (c, f, cmd) => (targetOf(c, cmd).conditions.guardado ? 'O alvo já está Guardado (não acumula).' : null),
    execute: (c, f, cmd) => applyCondition(c, targetOf(c, cmd), 'guardado', 1, f.id),
  },
  {
    id: 'p_imposicao',
    name: 'Imposição das Mãos',
    ap: 2,
    kind: 'support',
    icon: 'act_heal',
    text: 'Adjacente. Gaste 1 Convicção para curar 2 ou 2 Convicções para curar 4. Pode ser em você. Não funciona em Caído e não remove Trauma.',
    source: C('§18.2'),
    targeting: { type: 'ally', range: 'selfOrAdjacent' },
    options: (c, f) => {
      const m = hasTalent(f, 'p_maos_misericordiosas');
      return [
        { id: 'c1', label: `1 Convicção: cura ${m ? 3 : 2}`, disabled: (f.res?.conviccao ?? 0) >= 1 ? null : 'Convicção insuficiente' },
        { id: 'c2', label: `2 Convicções: cura ${m ? 5 : 4}`, disabled: (f.res?.conviccao ?? 0) >= 2 ? null : 'Convicção insuficiente' },
      ];
    },
    available: (c, f) => ((f.res?.conviccao ?? 0) < 1 ? 'Sem Convicção.' : null),
    validate: (c, f, cmd) => {
      const need = cmd.option === 'c2' ? 2 : 1;
      if ((f.res?.conviccao ?? 0) < need) return 'Convicção insuficiente.';
      return null;
    },
    execute: (c, f, cmd) => {
      const t = targetOf(c, cmd);
      const two = cmd.option === 'c2';
      const m = hasTalent(f, 'p_maos_misericordiosas');
      f.res!.conviccao -= two ? 2 : 1;
      c.events.push({ type: 'resource', figureId: f.id, resource: 'conviccao', value: f.res!.conviccao });
      heal(c, t, two ? (m ? 5 : 4) : m ? 3 : 2, f.id, { technique: true });
    },
  },
];

const paladino: ClassDef = {
  id: 'paladino',
  name: 'Paladino',
  epithet: 'Juramento que não se curva',
  hp: 13,
  armor: 1,
  attrs: { poder: 8, espirito: 8, guarda: 6, determinacao: 6, precisao: 6, agilidade: 4, arcano: 4, sombra: 4 },
  proficiencies: ['Marcial', 'Sagrado'],
  startingItems: ['espada_escudo_juramento', 'martelo_juramento', 'lanca_alvorada', 'cota_juramento'],
  resourceName: 'Convicção',
  description: 'Marca um inimigo como Julgado, converte Convicção em Smite Radiante e protege aliados com Égide.',
  passives: [
    { name: 'Convicção e Julgamento', text: 'Comece cada Combate com 1 Convicção, máximo 3. Marque gratuitamente um inimigo visível como Julgado. Uma vez por Ativação, causar Dano ao Julgado sem gastar Convicção naquele Ataque pode gerar 1 Convicção.' },
    { name: 'Smite', text: 'Depois da rolagem contra o Julgado, gaste 1 Convicção: +1 Dano e o Ataque se torna Radiante. Esse Ataque não gera Convicção por Julgamento.' },
    { name: 'Égide — Reação', text: 'Quando você ou aliado em alcance de suporte sofreria Dano, gaste Reação e role Espírito. Cada Sucesso reduz 1 Dano adicional. Se impedir Dano, pode gerar 1 Convicção (máx. 1/Ciclo).' },
  ],
  actions: paladinoActions,
  talentPaths: [
    { id: 'bastiao', name: 'Bastião' },
    { id: 'julgamento', name: 'Julgamento' },
    { id: 'graca', name: 'Graça' },
  ],
  source: C('§18.2'),
  accent: '#c9a24a',
  onCombatStart: (c, f) => {
    f.res!.conviccao = 1;
    pushOps(c, [{ op: 'call', fn: 'paladino:promptJudge', args: { id: f.id } }], false);
  },
  onActivationStart: (c, f) => {
    // HIPÓTESE Q-JULGADO: if no living Julgado at the start of the Paladin's Activation, mark a new one for free.
    if (!julgado(c, f) && enemies(c).length) pushOps(c, [{ op: 'call', fn: 'paladino:promptJudge', args: { id: f.id } }], false);
  },
  attackOptions: (c, f, a) => {
    const t = tryFig(c, a.targetId);
    if (!t || a.control || a.data['support'] || t.conditions.julgadoPor !== f.id || (f.res?.conviccao ?? 0) < 1) return [];
    return [{ id: 'smite', label: 'Smite: 1 Convicção → +1 Dano e Radiante', source: 'class:paladino', cost: { conviccao: 1 }, requiresHit: true }];
  },
  applyAttackOption: (c, f, a, r, opt, out) => {
    if (opt !== 'smite') return;
    out.addDano += 1;
    out.radiante = true;
    out.noConviccaoGain = true;
    if (hasTalent(f, 'p_julgamento_final')) {
      const t = tryFig(c, a.targetId);
      if (t && halfOrLess(t)) out.addIgnoreArmor += 1;
    }
    log(c, 'resource', `${f.name} usa Smite.`);
  },
  afterAttack: (c, f, a, r, out) => {
    const main = out.results.find((x) => x.targetId === a.targetId);
    if (!main || main.final <= 0 || !a.targetWasJulgado || out.noConviccaoGain) return;
    if (out.spent.some((s) => s === 'smite')) return;
    if (canUse(f, 'activation', 'convJulg')) {
      markUse(f, 'activation', 'convJulg');
      gainConviccao(c, f);
    }
  },
  onEnemyDefeated: (c, f, e) => {
    if (e.id === f.res?.julgadoId) {
      f.res!.julgadoId = null;
      if (hasTalent(f, 'p_julgamento_implacavel') && canUse(f, 'cycle', 'julgImpl')) {
        markUse(f, 'cycle', 'julgImpl');
        pushOps(c, [{ op: 'call', fn: 'paladino:promptJudge', args: { id: f.id } }], false);
      }
    }
  },
};

// =============================================================================== ARCANISTA
const RUNE_LABEL: Record<RuneId, string> = { ruina: 'Ruína', vinculo: 'Vínculo', transposicao: 'Transposição', raio: 'Raio', explosao: 'Explosão', sigilo: 'Sigilo' };
function focusDice(f: Figure) {
  const w = weaponOf(f);
  const second = w?.focus && w.dice ? w.dice[1] : 'espirito';
  return diceOf(f, ['arcano', second]);
}
function readyOrOverload(f: Figure, r: RuneId, pre: string[] | undefined) {
  return f.res!.runes[r] || pre?.includes(`sobrecarga:${r}`);
}
function canCast(c: Ctx, f: Figure, i: RuneId, form: RuneId, pre?: string[]): string | null {
  const res = f.res!;
  const missing = [i, form].filter((r) => !res.runes[r]);
  if (missing.length === 0) return null;
  if (missing.length === 1 && res.instabilidade < 3 && canUse(f, 'activation', 'sobrecarga')) {
    if (!pre) return null; // can be cast with Sobrecarga
    if (pre.includes(`sobrecarga:${missing[0]}`)) return null;
    return `Runa ${RUNE_LABEL[missing[0]]} Esgotada — use Sobrecarga.`;
  }
  return `Runas Esgotadas: ${missing.map((m) => RUNE_LABEL[m]).join(', ')}.`;
}
function spendRunes(c: Ctx, f: Figure, i: RuneId, form: RuneId, pre?: string[]) {
  const res = f.res!;
  for (const r of [i, form]) {
    if (!res.runes[r] && pre?.includes(`sobrecarga:${r}`)) {
      markUse(f, 'activation', 'sobrecarga');
      res.instabilidade = Math.min(3, res.instabilidade + 1);
      log(c, 'resource', `${f.name}: Sobrecarga com ${RUNE_LABEL[r]} → Instabilidade ${res.instabilidade}.`);
      c.events.push({ type: 'resource', figureId: f.id, resource: 'instabilidade', value: res.instabilidade });
    }
    res.runes[r] = false;
  }
  c.events.push({ type: 'resource', figureId: f.id, resource: 'runes', value: Object.values(res.runes).filter(Boolean).length });
  f.counters.activation['bothReady'] = pre?.some((p) => p.startsWith('sobrecarga')) ? 0 : 1;
}
function sigilInRange(f: Figure, k: SectorKey) {
  // HIPÓTESE Q-SIGILO: Sigils are placed on enemy Sectors within 1 column of the Arcanista; Inscrição Distante: any column.
  if (hasTalent(f, 'a_inscricao_distante')) return true;
  return Math.abs(Number(k[3]) - Number(f.sector[3])) <= 1;
}
function placeSigil(c: Ctx, f: Figure, kind: 'detonacao' | 'estase', k: SectorKey) {
  const limit = hasTalent(f, 'a_mestre_geometria') ? 2 : 1;
  const mine = c.S.battlefield.sigils.filter((s) => s.ownerId === f.id && s.kind !== 'portalB');
  if (mine.length >= limit) removeSigil(c, mine[0].id);
  const id = newId(c, 'sig');
  c.S.battlefield.sigils.push({ id, ownerId: f.id, kind, sector: k });
  c.events.push({ type: 'sigil', sector: k, kind, added: true });
  log(c, 'resource', `${f.name} inscreve ${kind === 'detonacao' ? 'Runa de Detonação' : 'Selo de Estase'} em ${k}.`);
}
export function removeSigil(c: Ctx, id: string) {
  const s = c.S.battlefield.sigils.find((x) => x.id === id);
  if (!s) return;
  const pair = s.pair;
  c.S.battlefield.sigils = c.S.battlefield.sigils.filter((x) => x.id !== id && (!pair || x.pair !== pair));
  c.events.push({ type: 'sigil', sector: s.sector, kind: s.kind, added: false });
}

function spell(o: { id: string; name: string; i: RuneId; form: RuneId; ap?: number; text: string; targeting: ActionDef['targeting']; execute: ActionDef['execute']; validate?: ActionDef['validate']; kind?: ActionDef['kind']; icon?: string; extra?: Partial<ActionDef> }): ActionDef {
  return {
    id: o.id,
    name: o.name,
    ap: o.ap ?? 2,
    kind: o.kind ?? 'spell',
    icon: o.icon ?? 'runa',
    text: `${RUNE_LABEL[o.i]} + ${RUNE_LABEL[o.form]}. ${o.text}`,
    source: o.ap === 1 ? C('§18.3') : H('§18.3', 'Q-FEITICO: custo de 2 AP para feitiços sem custo impresso.'),
    targeting: o.targeting,
    options: (c, f) => {
      const res = f.res!;
      const missing = [o.i, o.form].filter((r) => !res.runes[r]);
      if (missing.length !== 1) return [];
      return [{ id: `sobrecarga:${missing[0]}`, label: `Sobrecarga (${RUNE_LABEL[missing[0]]} Esgotada, +1 Instabilidade)`, disabled: res.instabilidade >= 3 ? 'Instabilidade 3: Sobrecarga bloqueada' : !canUse(f, 'activation', 'sobrecarga') ? 'Sobrecarga já usada nesta Ativação' : null }];
    },
    available: (c, f) => canCast(c, f, o.i, o.form),
    validate: (c, f, cmd) => {
      const pre = [...(cmd.pre ?? []), ...(cmd.option ? [cmd.option] : [])];
      const r = canCast(c, f, o.i, o.form, pre.length ? pre : ['__none']);
      if (r) return r;
      return o.validate?.(c, f, cmd) ?? null;
    },
    execute: (c, f, cmd) => {
      const pre = [...(cmd.pre ?? []), ...(cmd.option ? [cmd.option] : [])];
      spendRunes(c, f, o.i, o.form, pre);
      o.execute(c, f, { ...cmd, pre });
    },
    ...(o.extra ?? {}),
  };
}

const arcanistaActions: ActionDef[] = [
  {
    id: 'a_estase_trigger',
    name: 'Selo de Estase (gatilho)',
    ap: 0,
    kind: 'control',
    text: 'Gatilho do Selo de Estase: Controle — Imobilizado; Impulso: Exposto.',
    source: H('§18.3', 'Q-SIGILO'),
    targeting: { type: 'none' },
    hidden: () => true,
    execute: () => undefined,
    attackOptions: () => [impulsoOpt('a_est:exposto', 'Impulso: Exposto')],
    onResolve: (c, f, a, r, out) => {
      const t = tryFig(c, a.targetId);
      if (out.hit && t && isActive(t)) applyCondition(c, t, 'imobilizado', 1, f.id);
    },
    afterAttackOption: (c, f, a, r, opt, out) => {
      const t = tryFig(c, a.targetId);
      if (opt === 'a_est:exposto' && out.hit && t && isActive(t)) applyCondition(c, t, 'exposto', 1, f.id);
    },
  },
  {
    id: 'a_centelha',
    name: 'Centelha Arcana',
    ap: 2,
    kind: 'attack',
    icon: 'act_attack_distancia',
    text: 'Distância. Arcano + atributo do Foco, Dano 1. Cantrip; não usa Runas e não gera Instabilidade.',
    source: C('§18.3'),
    targeting: { type: 'enemy', reach: 'distancia' },
    preview: (c, f) => ({ dice: ['arcano', (weaponOf(f)?.dice?.[1] ?? 'espirito') as any], dano: 1, cat: 'distancia' }),
    execute: (c, f, cmd) =>
      startHeroAttack(c, { sourceId: f.id, targetId: cmd.targetIds![0], techId: 'a_centelha', name: 'Centelha Arcana', cat: 'distancia', dice: focusDice(f), dano: 1, school: 'arcane', spell: true, weapon: false, pre: cmd.pre }),
  },
  {
    id: 'a_canalizar',
    name: 'Canalizar',
    ap: 1,
    kind: 'utility',
    icon: 'runa',
    text: '1 AP, uma vez por Ativação: recupere 1 Runa Esgotada ou reduza Instabilidade em 1.',
    source: H('§18.3', 'Q-CANALIZAR: “reduza Instabilidade conforme regra atual” = −1.'),
    targeting: { type: 'none' },
    limit: 'activation',
    options: (c, f) => [
      ...([...RUNE_INTENTS, ...RUNE_FORMS] as RuneId[]).map((r) => ({ id: r, label: `Recuperar ${RUNE_LABEL[r]}`, disabled: f.res!.runes[r] ? 'Já Pronta' : null })),
      { id: 'instab', label: 'Reduzir Instabilidade em 1', disabled: f.res!.instabilidade > 0 ? null : 'Instabilidade 0' },
    ],
    validate: (c, f, cmd) => {
      if (!cmd.option) return 'Escolha a Runa ou Instabilidade.';
      if (cmd.option === 'instab') return f.res!.instabilidade > 0 ? null : 'Instabilidade já é 0.';
      return f.res!.runes[cmd.option as RuneId] === false ? null : 'Runa já Pronta.';
    },
    execute: (c, f, cmd) => {
      const res = f.res!;
      if (cmd.option === 'instab') res.instabilidade = Math.max(0, res.instabilidade - 1);
      else res.runes[cmd.option as RuneId] = true;
      if (hasTalent(f, 'a_canalizacao_estavel') && cmd.option !== 'instab') res.instabilidade = Math.max(0, res.instabilidade - 1);
      log(c, 'resource', `${f.name} canaliza (${cmd.option === 'instab' ? 'Instabilidade' : RUNE_LABEL[cmd.option as RuneId]}).`);
      c.events.push({ type: 'resource', figureId: f.id, resource: 'runes', value: Object.values(res.runes).filter(Boolean).length });
      if (hasItem(f, 'cajado_runico')) stepLater(c, f, 1, false, 'Cajado Rúnico');
    },
  },
  spell({
    id: 'a_lanca',
    name: 'Lança Arcana',
    i: 'ruina',
    form: 'raio',
    icon: 'act_attack_distancia',
    kind: 'attack',
    text: 'Ataque focado à Distância, Dano 2.',
    targeting: { type: 'enemy', reach: 'distancia' },
    execute: (c, f, cmd) => startHeroAttack(c, { sourceId: f.id, targetId: cmd.targetIds![0], techId: 'a_lanca', name: 'Lança Arcana', cat: 'distancia', dice: focusDice(f), dano: 2, school: 'arcane', spell: true, data: { intent: 'ruina', form: 'raio' }, pre: cmd.pre }),
  }),
  spell({
    id: 'a_grilhoes',
    name: 'Grilhões Arcanos',
    i: 'vinculo',
    form: 'raio',
    kind: 'control',
    icon: 'cond_imobilizado',
    text: 'Controle à Distância: com Sucesso aplica Imobilizado; Impulso pode Expor.',
    targeting: { type: 'enemy', reach: 'distancia' },
    execute: (c, f, cmd) => startHeroAttack(c, { sourceId: f.id, targetId: cmd.targetIds![0], techId: 'a_grilhoes', name: 'Grilhões Arcanos', cat: 'distancia', dice: focusDice(f), dano: 0, school: 'arcane', spell: true, control: true, data: { intent: 'vinculo', form: 'raio' }, pre: cmd.pre }),
    extra: {
      attackOptions: () => [impulsoOpt('a_gr:exposto', 'Impulso: Exposto')],
      onResolve: (c, f, a, r, out) => {
        const t = tryFig(c, a.targetId);
        if (out.hit && t) {
          applyCondition(c, t, 'imobilizado', 1, f.id);
          if (r.successes >= 2 && hasTalent(f, 'a_vinculo_camadas')) applyCondition(c, t, 'exposto', 1, f.id);
        }
      },
      afterAttackOption: (c, f, a, r, opt, out) => {
        const t = tryFig(c, a.targetId);
        if (opt === 'a_gr:exposto' && out.hit && t) applyCondition(c, t, 'exposto', 1, f.id);
      },
    },
  }),
  spell({
    id: 'a_fio',
    name: 'Fio de Salto',
    i: 'transposicao',
    form: 'raio',
    ap: 1,
    kind: 'move',
    icon: 'act_move',
    text: '1 AP; teleporte você ou um aliado até 2 conexões no lado heroico (sair de Engajamento ainda custa +1 AP).',
    targeting: { type: 'ally', range: 'any', allowSelf: true },
    execute: (c, f, cmd) => {
      const t = targetOf(c, cmd);
      const n = 2 + (hasTalent(f, 'a_dobra_superior') ? 1 : 0) + (hasItem(f, 'orbe_espaco_curvo') && canUse(f, 'activation', 'orbeCurvo') ? 1 : 0);
      if (hasItem(f, 'orbe_espaco_curvo')) markUse(f, 'activation', 'orbeCurvo');
      teleportPrompt(c, f, t, n, 'Fio de Salto');
    },
  }),
  spell({
    id: 'a_ruptura',
    name: 'Ruptura Arcana',
    i: 'ruina',
    form: 'explosao',
    kind: 'attack',
    icon: 'act_area',
    text: 'Área 2 Setores (inimigos), Dano 1 em cada figura; Impulso pode Expor um atingido.',
    targeting: { type: 'area2', side: 'E' },
    validate: (c, f, cmd) => (cmd.sectors && enemies(c).some((e) => cmd.sectors!.includes(e.sector)) ? null : 'Nenhum inimigo na área.'),
    execute: (c, f, cmd) => {
      const ts = enemies(c).filter((e) => cmd.sectors!.includes(e.sector));
      startHeroAttack(c, { sourceId: f.id, targetId: ts[0].id, extraTargets: ts.slice(1).map((x) => x.id), techId: 'a_ruptura', name: 'Ruptura Arcana', cat: 'distancia', dice: focusDice(f), dano: 1, school: 'arcane', spell: true, data: { intent: 'ruina', form: 'explosao' }, pre: cmd.pre });
    },
    extra: {
      attackOptions: () => [impulsoOpt('a_rup:exposto', 'Impulso: Expor o alvo principal')],
      afterAttackOption: (c, f, a, r, opt, out) => {
        const t = tryFig(c, a.targetId);
        if (opt === 'a_rup:exposto' && out.hit && t && isActive(t)) applyCondition(c, t, 'exposto', 1, f.id);
      },
    },
  }),
  spell({
    id: 'a_poco',
    name: 'Poço Gravitacional',
    i: 'vinculo',
    form: 'explosao',
    kind: 'control',
    icon: 'act_pull',
    text: 'Área 2 Setores; Controle puxa inimigos não-Boss (Retaguarda → Frente); Impulso pode Imobilizar.',
    targeting: { type: 'area2', side: 'E' },
    validate: (c, f, cmd) => (cmd.sectors && enemies(c).some((e) => cmd.sectors!.includes(e.sector)) ? null : 'Nenhum inimigo na área.'),
    execute: (c, f, cmd) => {
      const ts = enemies(c).filter((e) => cmd.sectors!.includes(e.sector));
      startHeroAttack(c, { sourceId: f.id, targetId: ts[0].id, extraTargets: ts.slice(1).map((x) => x.id), techId: 'a_poco', name: 'Poço Gravitacional', cat: 'distancia', dice: focusDice(f), dano: 0, school: 'arcane', spell: true, control: true, data: { intent: 'vinculo', form: 'explosao' }, pre: cmd.pre });
    },
    extra: {
      attackOptions: () => [impulsoOpt('a_poco:imob', 'Impulso: Imobilizar o alvo principal')],
      onResolve: (c, f, a, r, out) => {
        if (!out.hit) return;
        for (const id of [a.targetId, ...a.extraTargets]) {
          const t = tryFig(c, id);
          if (t && isActive(t) && !t.isBoss && !t.isMiniboss) pull(c, t, f.id);
        }
      },
      afterAttackOption: (c, f, a, r, opt, out) => {
        const t = tryFig(c, a.targetId);
        if (opt === 'a_poco:imob' && out.hit && t && isActive(t)) applyCondition(c, t, 'imobilizado', 1, f.id);
      },
    },
  }),
  spell({
    id: 'a_dobra',
    name: 'Dobra Espacial',
    i: 'transposicao',
    form: 'explosao',
    kind: 'move',
    icon: 'act_area',
    text: 'Área 2 Setores (heróis): cada aliado ali faz Passo 1; depois um inimigo não-Boss pode ser movido 1 conexão legal.',
    targeting: { type: 'area2', side: 'H' },
    execute: (c, f, cmd) => {
      const allies = heroes(c).filter((h) => cmd.sectors!.includes(h.sector));
      for (const h of allies) pushOps(c, [{ op: 'step', figureId: h.id, steps: 1 + (hasTalent(f, 'a_dobra_superior') ? 1 : 0), ignoreEngagement: false, reason: 'Dobra Espacial' }], false);
      pushOps(c, [{ op: 'call', fn: 'arcanista:dobraEnemy', args: { id: f.id } }], false);
    },
  }),
  spell({
    id: 'a_detonacao',
    name: 'Runa de Detonação',
    i: 'ruina',
    form: 'sigilo',
    kind: 'attack',
    icon: 'rune_ring',
    text: 'Sigilo ofensivo em Setor inimigo; quando um inimigo entrar ou iniciar a Ativação ali, ataque Dano 2 (dados do Foco).',
    targeting: { type: 'sector', side: 'E' },
    validate: (c, f, cmd) => (cmd.sector && !sigilInRange(f, cmd.sector) ? 'Fora do alcance de Sigilo (coluna ±1).' : null),
    execute: (c, f, cmd) => placeSigil(c, f, 'detonacao', cmd.sector!),
  }),
  spell({
    id: 'a_estase',
    name: 'Selo de Estase',
    i: 'vinculo',
    form: 'sigilo',
    kind: 'control',
    icon: 'cond_imobilizado',
    text: 'Sigilo de controle em Setor inimigo; no gatilho, Controle: Imobilizado; Impulso: Exposto.',
    targeting: { type: 'sector', side: 'E' },
    validate: (c, f, cmd) => (cmd.sector && !sigilInRange(f, cmd.sector) ? 'Fora do alcance de Sigilo (coluna ±1).' : null),
    execute: (c, f, cmd) => placeSigil(c, f, 'estase', cmd.sector!),
  }),
  spell({
    id: 'a_portais',
    name: 'Portais Gêmeos',
    i: 'transposicao',
    form: 'sigilo',
    kind: 'move',
    icon: 'teleport',
    text: 'Crie Portal A e Portal B em dois Setores heroicos; um herói num portal pode atravessar ao outro por 1 AP (o par conta como 1 Sigilo).',
    targeting: { type: 'sectors2', side: 'H' },
    execute: (c, f, cmd) => {
      const limit = hasTalent(f, 'a_mestre_geometria') ? 2 : 1;
      const mine = c.S.battlefield.sigils.filter((s) => s.ownerId === f.id && s.kind !== 'portalB');
      if (mine.length >= limit) removeSigil(c, mine[0].id);
      const pair = newId(c, 'pair');
      const [a, b] = cmd.sectors!;
      c.S.battlefield.sigils.push({ id: newId(c, 'sig'), ownerId: f.id, kind: 'portalA', sector: a, pair }, { id: newId(c, 'sig'), ownerId: f.id, kind: 'portalB', sector: b, pair });
      c.events.push({ type: 'sigil', sector: a, kind: 'portalA', added: true });
      c.events.push({ type: 'sigil', sector: b, kind: 'portalB', added: true });
      log(c, 'resource', `${f.name} abre Portais Gêmeos em ${a} ↔ ${b}.`);
    },
  }),
];

export function teleportPrompt(c: Ctx, f: Figure, t: Figure, n: number, reason: string) {
  // teleport: any hero Sector within n connections with room (path not blocked)
  const seen = new Map<SectorKey, number>([[t.sector, 0]]);
  const q: SectorKey[] = [t.sector];
  while (q.length) {
    const cur = q.shift()!;
    const d = seen.get(cur)!;
    if (d >= n) continue;
    for (const nx of connections(cur)) if (!seen.has(nx)) {
      seen.set(nx, d + 1);
      q.push(nx);
    }
  }
  const dests = [...seen.keys()].filter((k) => k !== t.sector && hasRoom(c.S.figures, k, t.id) && leaveEngagementCost(c, t, k, false) <= (f.ap ?? 0));
  if (!dests.length) {
    log(c, 'move', `${reason}: nenhum destino legal.`);
    return;
  }
  c.S.pending = {
    id: newId(c, 'p'),
    controllers: [f.id],
    kind: 'choice',
    prompt: `${reason}: escolha o destino de ${t.name}.`,
    figureId: f.id,
    handler: 'arcanista:teleport',
    options: dests.map((k) => ({ id: k, label: k, detail: leaveEngagementCost(c, t, k, false) ? 'Sai de Engajamento: +1 AP' : undefined })),
    args: { targetId: t.id },
  };
}

const arcanista: ClassDef = {
  id: 'arcanista',
  name: 'Arcanista',
  epithet: 'Geometria proibida',
  hp: 11,
  armor: 0,
  attrs: { arcano: 8, precisao: 8, determinacao: 6, agilidade: 6, espirito: 6, guarda: 4, poder: 4, sombra: 4 },
  proficiencies: ['Arcano'],
  startingItems: ['cajado_runico', 'varinha_prismatica', 'orbe_gravitico', 'vestes_aprendiz'],
  resourceName: 'Matriz Rúnica',
  description: 'Combina uma Runa de Intenção e uma de Forma: nove feitiços entre dano, controle e manipulação espacial. A Sobrecarga cobra Instabilidade.',
  passives: [
    { name: 'Matriz Rúnica', text: 'Runas de Intenção: Ruína, Vínculo, Transposição. Runas de Forma: Raio, Explosão, Sigilo. Um feitiço combina uma Intenção + uma Forma; ambas ficam Esgotadas. No início da Ativação recupere 1 Runa Esgotada.' },
    { name: 'Sobrecarga', text: 'Uma vez por Ativação, use uma Runa Esgotada como se Pronta; ela permanece Esgotada e gera 1 Instabilidade.' },
    { name: 'Instabilidade', text: 'Máximo 3. Em 3: Arcano reduz 1 Grau e Sobrecarga fica bloqueada até estabilizar.' },
    { name: 'Barreira Rúnica — Reação', text: 'Quando alvo de Ataque, gaste Reação, esgote uma Runa Pronta e adicione D6 à Defesa, máximo 3 dados.' },
  ],
  actions: arcanistaActions,
  talentPaths: [
    { id: 'evocador', name: 'Evocador' },
    { id: 'geometra', name: 'Geômetra' },
    { id: 'tecelao', name: 'Tecelão' },
  ],
  source: C('§18.3'),
  accent: '#6f6fd8',
  onActivationStart: (c, f) => {
    const spent = (Object.keys(f.res!.runes) as RuneId[]).filter((r) => !f.res!.runes[r]);
    const n = hasTalent(f, 'a_tecelao_perfeito') ? 2 : 1;
    if (!spent.length) return;
    if (spent.length <= n) {
      for (const r of spent) f.res!.runes[r] = true;
      log(c, 'resource', `${f.name} recupera ${spent.map((r) => RUNE_LABEL[r]).join(', ')}.`);
      c.events.push({ type: 'resource', figureId: f.id, resource: 'runes', value: 6 });
      return;
    }
    pushOps(c, [{ op: 'call', fn: 'arcanista:recoverPrompt', args: { id: f.id, n } }], false);
  },
  defenseReactions: (c, h, d) => {
    if (h.id !== d.targetId || d.dice.length >= 3) return [];
    const ready = (Object.keys(h.res!.runes) as RuneId[]).filter((r) => h.res!.runes[r]);
    if (!ready.length) return [];
    return [{ heroId: h.id, kind: 'barreira', label: `Barreira Rúnica (${h.name}): esgote 1 Runa, +D6`, addDie: 6 }];
  },
  applyReaction: (c, h, d, kind) => {
    if (kind !== 'barreira') return;
    const order: RuneId[] = ['sigilo', 'explosao', 'transposicao', 'vinculo', 'raio', 'ruina'];
    const r = order.find((x) => h.res!.runes[x]);
    if (r) h.res!.runes[r] = false;
    d.dice.push({ grade: 6, source: 'Barreira Rúnica' });
    log(c, 'defense', `${h.name} ergue a Barreira Rúnica (esgota ${r ? RUNE_LABEL[r] : '—'}): +D6.`);
    if (hasItem(h, 'vestes_aprendiz') && canUse(h, 'combat', 'vestesAprendiz')) {
      markUse(h, 'combat', 'vestesAprendiz');
      pushOps(c, [{ op: 'call', fn: 'arcanista:recoverPrompt', args: { id: h.id, n: 1, reason: 'Vestes do Aprendiz' } }], false);
    }
  },
  attackOptions: (c, f, a, r) => {
    if (!a.spell || a.data['intent'] !== 'ruina' || r.impulsos < 1 || !hasTalent(f, 'a_destruicao_focada') || !canUse(f, 'activation', 'destrFocada')) return [];
    return [{ id: 'a_destr', label: 'Destruição Focada: Impulso → +1 Dano', source: 'class:arcanista', cost: { impulso: 1 }, requiresHit: true }];
  },
  applyAttackOption: (c, f, a, r, opt, out) => {
    if (opt === 'a_destr') {
      markUse(f, 'activation', 'destrFocada');
      out.addDano += 1;
    }
  },
  preAttack: (c, f, a) => {
    if (hasTalent(f, 'a_fratura_arcana') && a.spell && a.data['intent'] === 'ruina') {
      const t = tryFig(c, a.targetId);
      if (t && (t.conditions.quebrado || t.conditions.exposto)) a.ignoreArmor += 1;
    }
  },
};

// =============================================================================== CLÉRIGO
const VERSE_LABEL: Record<Verse, string> = { misericordia: 'Misericórdia', vigilia: 'Vigília', julgamento: 'Julgamento' };
function resonance(f: Figure): Verse | null {
  const l = f.res?.liturgia ?? [];
  return l.length ? l[l.length - 1] : null;
}
function supportTargets(c: Ctx, f: Figure) {
  return heroes(c).filter((h) => inSupportZone(f, h));
}
/** Cleric heal amount modifiers: Misericórdia (first heal technique +1), Graça aos Feridos. */
function clericHealBonus(c: Ctx, f: Figure, t: Figure): number {
  let b = 0;
  if (resonance(f) === 'misericordia' && canUse(f, 'activation', 'versoMis')) {
    markUse(f, 'activation', 'versoMis');
    b += 1;
  }
  if (hasTalent(f, 'c_graca_feridos') && halfOrLess(t) && canUse(f, 'activation', 'gracaFeridos')) {
    markUse(f, 'activation', 'gracaFeridos');
    b += 1;
  }
  return b;
}
function afterClericHeal(c: Ctx, f: Figure, healed: number) {
  if (healed > 0 && hasItem(f, 'bastao_peregrino')) pushOps(c, [{ op: 'call', fn: 'clerigo:bastaoStep', args: { id: f.id } }], false);
}

const clerigoActions: ActionDef[] = [
  {
    id: 'c_palavra',
    name: 'Palavra Sagrada',
    ap: 2,
    kind: 'attack',
    icon: 'holy_ring',
    text: 'Distância, Espírito + Precisão, Dano 1. Impulso: Empurrar 1.',
    source: C('§18.4'),
    targeting: { type: 'enemy', reach: 'distancia' },
    preview: () => ({ dice: ['espirito', 'precisao'], dano: 1, cat: 'distancia' }),
    execute: (c, f, cmd) => startHeroAttack(c, { sourceId: f.id, targetId: cmd.targetIds![0], techId: 'c_palavra', name: 'Palavra Sagrada', cat: 'distancia', dice: diceOf(f, ['espirito', 'precisao']), dano: 1, school: 'holy', data: { offensive: true }, pre: cmd.pre }),
    attackOptions: () => [impulsoOpt('c_pal:empurrar', 'Impulso: Empurrar 1')],
    afterAttackOption: (c, f, a, r, opt, out) => {
      const t = tryFig(c, a.targetId);
      if (opt === 'c_pal:empurrar' && out.hit && t) push(c, t, f.id);
    },
  },
  {
    id: 'c_censura',
    name: 'Palavra de Censura',
    ap: 2,
    kind: 'attack',
    icon: 'holy_ring',
    text: 'Distância, Espírito + Precisão, Dano 2.',
    source: C('§18.4'),
    targeting: { type: 'enemy', reach: 'distancia' },
    preview: () => ({ dice: ['espirito', 'precisao'], dano: 2, cat: 'distancia' }),
    execute: (c, f, cmd) => startHeroAttack(c, { sourceId: f.id, targetId: cmd.targetIds![0], techId: 'c_censura', name: 'Palavra de Censura', cat: 'distancia', dice: diceOf(f, ['espirito', 'precisao']), dano: 2, school: 'holy', data: { offensive: true }, pre: cmd.pre }),
  },
  {
    id: 'c_prece',
    name: 'Prece Restauradora',
    ap: 2,
    kind: 'support',
    icon: 'act_heal',
    text: 'Espírito + Determinação. Com Sucesso cure 2; cada Sucesso adicional +1 (máx. 4). Impulso remove Veneno 1 ou Sangramento 1. Não em Caído.',
    source: H('§18.4', 'Q-PRECE: limite da carta = cura máxima 4.'),
    targeting: { type: 'ally', range: 'supportOrSelf' },
    execute: (c, f, cmd) =>
      startHeroAttack(c, { sourceId: f.id, targetId: cmd.targetIds![0], techId: 'c_prece', name: 'Prece Restauradora', cat: 'global', dice: diceOf(f, ['espirito', 'determinacao']), dano: 0, school: 'holy', control: true, data: { support: true, keepFurtivo: true }, pre: cmd.pre }),
    attackOptions: (c, f, a) => {
      const t = tryFig(c, a.targetId);
      const out: AttackOption[] = [];
      if (t?.conditions.veneno) out.push(impulsoOpt('c_prece:veneno', 'Impulso: remover Veneno 1', 1, 'prece'));
      if (t?.conditions.sangramento) out.push(impulsoOpt('c_prece:sangue', 'Impulso: remover Sangramento 1', 1, 'prece'));
      if (hasTalent(f, 'c_purificacao') && t?.conditions.queimando) out.push(impulsoOpt('c_prece:fogo', 'Impulso: remover Queimando', 1, 'prece'));
      return out;
    },
    onResolve: (c, f, a, r, out) => {
      const t = tryFig(c, a.targetId);
      if (!out.hit || !t) return;
      const amount = Math.min(4, 2 + Math.max(0, r.successes - 1)) + clericHealBonus(c, f, t);
      const healed = heal(c, t, amount, f.id, { technique: true });
      afterClericHeal(c, f, healed);
    },
    afterAttackOption: (c, f, a, r, opt, out) => {
      const t = tryFig(c, a.targetId);
      if (!t || !out.hit) return;
      if (opt === 'c_prece:veneno') t.conditions.veneno = Math.max(0, t.conditions.veneno - 1);
      if (opt === 'c_prece:sangue') t.conditions.sangramento = Math.max(0, t.conditions.sangramento - 1);
      if (opt === 'c_prece:fogo') setCond(c, t, 'queimando', false);
      c.events.push({ type: 'condition', targetId: t.id, condition: 'veneno', added: false });
    },
  },
  {
    id: 'c_bencao',
    name: 'Bênção da Vigília',
    ap: 1,
    kind: 'support',
    icon: 'bless',
    text: 'Alvo na zona de suporte; a próxima Defesa do alvo aumenta o dado principal em 1 Grau até sua próxima Ativação. Não acumula.',
    source: C('§18.4 / Solução física'),
    targeting: { type: 'ally', range: 'supportOrSelf' },
    validate: (c, f, cmd) => (targetOf(c, cmd).conditions.bencao ? 'O alvo já tem Bênção (não acumula).' : null),
    execute: (c, f, cmd) => {
      const t = targetOf(c, cmd);
      applyCondition(c, t, 'bencao', 1, f.id);
      if (resonance(f) === 'vigilia' && canUse(f, 'activation', 'versoVig')) {
        markUse(f, 'activation', 'versoVig');
        stepLater(c, t, 1, false, 'Verso da Vigília');
      }
    },
  },
  {
    id: 'c_guia',
    name: 'Guia do Peregrino',
    ap: 1,
    kind: 'move',
    icon: 'act_passo',
    text: 'Você ou aliado na zona de suporte faz Passo 1; se Guardado, Passo 2.',
    source: C('§18.4'),
    targeting: { type: 'ally', range: 'supportOrSelf' },
    execute: (c, f, cmd) => {
      const t = targetOf(c, cmd);
      pushOps(c, [{ op: 'step', figureId: t.id, steps: t.conditions.guardado ? 2 : 1, ignoreEngagement: false, reason: 'Guia do Peregrino' }], false);
    },
  },
  {
    id: 'c_amem',
    name: 'AMÉM',
    ap: 0,
    kind: 'support',
    icon: 'verso',
    text: 'Gratuito, uma vez quando a Liturgia estiver completa; resolve pela maioria dos Versos e depois esvazia.',
    source: C('§18.4 AMÉM'),
    targeting: { type: 'none' },
    available: (c, f) => ((f.res?.liturgia.length ?? 0) < 3 ? 'A Liturgia precisa de 3 Versos.' : null),
    execute: (c, f) => pushOps(c, [{ op: 'call', fn: 'clerigo:amem', args: { id: f.id } }], false),
  },
];

const clerigo: ClassDef = {
  id: 'clerigo',
  name: 'Clérigo',
  epithet: 'A voz que levanta',
  hp: 12,
  armor: 0,
  attrs: { espirito: 8, determinacao: 8, precisao: 6, guarda: 6, arcano: 6, agilidade: 4, poder: 4, sombra: 4 },
  proficiencies: ['Sagrado'],
  startingItems: ['bastao_peregrino', 'sino_vigilia', 'censario_julgamento', 'vestes_consagradas'],
  resourceName: 'Liturgia',
  description: 'Compõe a Liturgia verso a verso — Misericórdia, Vigília, Julgamento — e a encerra com um AMÉM decisivo. Intercessão cancela Condições.',
  passives: [
    { name: 'Liturgia', text: 'Possui 3 espaços de Verso. No início de cada Ativação coloque gratuitamente o próximo Verso. O último Verso colocado é a Ressonância atual (Misericórdia: primeira cura +1; Vigília: primeira proteção concede Passo 1; Julgamento: primeira ofensiva contra Exposto/Quebrado pode gastar 1 Impulso para +1 Dano).' },
    { name: 'Intercessão — Reação', text: 'Quando você ou aliado na zona de suporte receberia uma Condição, gaste Reação e role Espírito. Com Sucesso, cancele a Condição; o Dano permanece.' },
    { name: 'Zona de suporte', text: 'Sua coluna + colunas adjacentes, em qualquer fileira.' },
  ],
  actions: clerigoActions,
  talentPaths: [
    { id: 'misericordia', name: 'Misericórdia' },
    { id: 'vigilia', name: 'Vigília' },
    { id: 'liturgista', name: 'Liturgista' },
  ],
  source: C('§18.4'),
  accent: '#e8e0c8',
  onActivationStart: (c, f) => {
    if ((f.res?.liturgia.length ?? 0) < 3) pushOps(c, [{ op: 'call', fn: 'clerigo:versePrompt', args: { id: f.id } }], false);
  },
  attackOptions: (c, f, a, r) => {
    if (!a.data['offensive'] || resonance(f) !== 'julgamento' || r.impulsos < 1 || !canUse(f, 'activation', 'versoJul')) return [];
    const t = tryFig(c, a.targetId);
    if (!t || !(a.targetWasExposto || a.targetWasQuebrado || t.conditions.quebrado)) return [];
    return [{ id: 'c_verso_jul', label: 'Verso do Julgamento: Impulso → +1 Dano', source: 'class:clerigo', cost: { impulso: 1 }, requiresHit: true }];
  },
  applyAttackOption: (c, f, a, r, opt, out) => {
    if (opt === 'c_verso_jul') {
      markUse(f, 'activation', 'versoJul');
      out.addDano += 1;
    }
  },
};

// =============================================================================== ARQUEIRO
function miraValue(f: Figure) {
  return f.res?.mira ?? 0;
}
function setMira(c: Ctx, f: Figure, v: number) {
  f.res!.mira = Math.max(0, Math.min(3, v));
  c.events.push({ type: 'resource', figureId: f.id, resource: 'mira', value: f.res!.mira });
}
function bowAttack(id: string, name: string, dice: ('weapon' | [any, any]), dano: number, text: string, extra: Partial<ActionDef> = {}, ignoreArmor = 0): ActionDef {
  return {
    id,
    name,
    ap: 2,
    kind: 'attack',
    icon: 'act_attack_distancia',
    text,
    source: C('§18.5'),
    targeting: { type: 'enemy', reach: 'distancia' },
    available: (c, f) => (!weaponOf(f)?.bow ? 'Requer arma de Arco equipada.' : null),
    validate: (c, f, cmd) => (bowAllows(f, targetOf(c, cmd)) ? null : 'Fora das Faixas permitidas pelo arco.'),
    preview: (c, f) => ({ dice: dice === 'weapon' ? weaponOf(f)?.dice : dice, dano, cat: 'distancia' }),
    execute: (c, f, cmd) => {
      const t = targetOf(c, cmd);
      weaponAttack(c, f, cmd, { techId: id, name, dice: dice === 'weapon' ? 'weapon' : dice, dano, cat: 'distancia', school: 'arrow', ignoreArmor, data: { ideal: inIdeal(f, t, String(f.counters.combat['olhoFalcao'] ?? '')) } });
    },
    ...extra,
  };
}
const arqueiroActions: ActionDef[] = [
  bowAttack('ar_disparo', 'Disparo Básico', 'weapon', 2, 'Dados e Distância da arma, Dano 2. Pode gastar Mira.'),
  bowAttack('ar_medido', 'Tiro Medido', 'weapon', 2, 'Dados da arma, Dano 2. Se o alvo estiver na Faixa Ideal e você tinha Mira no início, aumente o menor dado em 1 Grau sem gastar Mira. Impulso: Passo 1.', {
    attackOptions: () => [impulsoOpt('ar_med:passo', 'Impulso: Passo 1', 1, undefined, false)],
    afterAttackOption: (c, f, a, r, opt) => {
      if (opt === 'ar_med:passo') stepLater(c, f, 1, false, 'Tiro Medido');
    },
  }),
  {
    id: 'ar_mirar',
    name: 'Mirar',
    ap: 1,
    kind: 'utility',
    icon: 'mira',
    text: '1 AP, uma vez por Ativação, somente se não estiver Engajado: ganhe 1 Mira (máximo 3).',
    source: C('§18.5'),
    targeting: { type: 'none' },
    limit: 'activation',
    available: (c, f) => (isEngaged(f, c.S.figures) ? 'Engajado: não pode Mirar.' : miraValue(f) >= 3 ? 'Mira no máximo.' : null),
    execute: (c, f) => {
      const resp = hasTalent(f, 'ar_respiracao') && (f.movedThisActivation ?? 0) === 0;
      setMira(c, f, miraValue(f) + (resp ? 2 : 1));
      if (resp) f.counters.activation['respiracao'] = 1;
      log(c, 'resource', `${f.name} mira (${f.res!.mira}).`);
    },
  },
  {
    id: 'ar_passo',
    name: 'Passo do Caçador',
    ap: 1,
    kind: 'move',
    icon: 'act_passo',
    text: 'Passo 2, ignora custo adicional de Engajamento e não reduz Mira.',
    source: C('§18.5'),
    targeting: { type: 'move', steps: 2, ignoreEngagement: true },
    hidden: (c, f) => hasTalent(f, 'ar_passos_leves'),
    execute: (c, f, cmd) => heroMove(c, f, cmd.sector!, { kind: 'passo', ignoreEngagement: true }),
  },
  bowAttack('ar_perfurante', 'Flecha Perfurante', ['precisao', 'determinacao'], 2, 'Precisão + Determinação, Dano 2. Ignora 1 Armadura; pode somar gasto de Mira para perfuração. Impulso pode aplicar Quebrado depois do Dano.', {
    attackOptions: () => [impulsoOpt('ar_perf:quebrado', 'Impulso: Quebrado depois do Dano')],
    afterAttackOption: (c, f, a, r, opt, out) => {
      const t = tryFig(c, a.targetId);
      if (opt === 'ar_perf:quebrado' && out.hit && t && isActive(t)) applyCondition(c, t, 'quebrado', 1, f.id);
    },
  }, 1),
  bowAttack('ar_contencao', 'Flecha de Contenção', ['precisao', 'agilidade'], 1, 'Precisão + Agilidade, Dano 1. Ao acertar aplica Imobilizado; contra Boss converte conforme regra de Boss.', {
    onResolve: (c, f, a, r, out) => {
      const t = tryFig(c, a.targetId);
      if (!out.hit || !t || !isActive(t)) return;
      // HIPÓTESE Q-CONTENCAO: Boss/Miniboss converts Imobilizado to Exposto (same conversion as Atordoado).
      if (t.isBoss || t.isMiniboss) applyCondition(c, t, 'exposto', 1, f.id);
      else applyCondition(c, t, 'imobilizado', 1, f.id);
    },
  }),
];

const arqueiro: ClassDef = {
  id: 'arqueiro',
  name: 'Arqueiro',
  epithet: 'A linha clara',
  hp: 10,
  armor: 0,
  attrs: { precisao: 8, agilidade: 8, determinacao: 6, poder: 6, sombra: 6, guarda: 4, espirito: 4, arcano: 4 },
  proficiencies: ['Arco'],
  startingItems: ['arco_curto', 'arco_recurvo', 'arco_longo', 'couro_cacador'],
  resourceName: 'Mira',
  description: 'Lê a Formação em Faixas — Próxima, Média, Longa — e acumula Mira para rerrolar, perfurar Armadura ou ignorar Cobertura.',
  passives: [
    { name: 'Mira', text: 'Comece o Combate com 1 Mira, máximo 3. Gastos: rerrolar dado; ignorar Armadura; ignorar Cobertura. A primeira Reposição/Troca voluntária da Ativação reduz 1 Mira. Passos e movimentos forçados não reduzem Mira.' },
    { name: 'Faixas', text: 'Próxima: Frente contra Frente. Média: fileiras diferentes. Longa: Retaguarda contra Retaguarda. A coluna não altera a Faixa.' },
    { name: 'Tiro de Interceptação — Reação', text: 'Quando um inimigo termina um movimento voluntário de 2+ conexões num Setor que seu arco pode atingir, gaste Reação + 1 Mira: Ataque com os dados da arma, Dano 1.' },
  ],
  actions: arqueiroActions,
  talentPaths: [
    { id: 'atirador', name: 'Atirador' },
    { id: 'cacador', name: 'Caçador' },
    { id: 'sentinela', name: 'Sentinela' },
  ],
  source: C('§18.5'),
  accent: '#5f8a4a',
  onCombatStart: (c, f) => {
    f.res!.mira = 1;
  },
  onActivationStart: (c, f) => {
    f.counters.activation['miraAtStart'] = miraValue(f);
  },
  preAttack: (c, f, a) => {
    if (a.techId === 'ar_medido' && a.data['ideal'] && (f.counters.activation['miraAtStart'] ?? 0) > 0) a.dice = raiseLowest(a.dice, 1, 'Tiro Medido');
  },
  attackOptions: (c, f, a) => {
    if (!weaponOf(f)?.bow || a.spell) return [];
    const m = miraValue(f);
    const out: AttackOption[] = [];
    const pierce = hasTalent(f, 'ar_bodkin') ? 2 : 1;
    if (m >= 1) out.push({ id: 'mira:armor', label: `Mira: ignorar ${pierce} Armadura`, source: 'class:arqueiro', cost: { mira: 1 }, requiresHit: true });
    if (m >= 2 && a.techId === 'ar_perfurante') out.push({ id: 'mira:armor2', label: `Mira: +${pierce} perfuração adicional`, source: 'class:arqueiro', cost: { mira: 1 }, requiresHit: true });
    if (m >= 1) out.push({ id: 'mira:cover', label: 'Mira: ignorar Cobertura', source: 'class:arqueiro', cost: { mira: 1 }, requiresHit: true });
    return out;
  },
  applyAttackOption: (c, f, a, r, opt, out) => {
    const pierce = hasTalent(f, 'ar_bodkin') ? 2 : 1;
    if (opt === 'mira:armor' || opt === 'mira:armor2') out.addIgnoreArmor += pierce;
    if (opt === 'mira:cover') out.ignoreCover = true;
    if (opt.startsWith('mira:')) c.events.push({ type: 'resource', figureId: f.id, resource: 'mira', value: f.res!.mira });
  },
  onMoved: (c, f, info) => {
    if (!info.voluntary || (info.kind !== 'reposicionar' && info.kind !== 'troca')) return;
    if (!canUse(f, 'activation', 'miraLoss')) return;
    markUse(f, 'activation', 'miraLoss');
    if (hasItem(f, 'arco_raposa')) return log(c, 'item', 'Arco da Raposa: a primeira Reposição não reduz Mira.');
    if (hasItem(f, 'arco_curto') && canUse(f, 'activation', 'arcoCurto')) {
      markUse(f, 'activation', 'arcoCurto');
      return log(c, 'item', 'Arco Curto: ignora a primeira perda de Mira por movimento.');
    }
    if (miraValue(f) > 0) {
      setMira(c, f, miraValue(f) - 1);
      log(c, 'resource', `${f.name} perde 1 Mira ao se reposicionar (${f.res!.mira}).`);
    }
  },
};

// =============================================================================== LADINO
const MAX_BRECHAS = (f: Figure) => (hasTalent(f, 'l_brecha_mortal') ? 3 : 2);
function canHide(c: Ctx, f: Figure): boolean {
  if (enemies(c).some((e) => adjacent(e, f))) return false;
  if (hasCover(c, f)) return true;
  const p = parseSector(f.sector);
  if (p.row !== 'R') return false;
  const allyFront = heroes(c).some((h) => h.id !== f.id && h.sector === `H:F${p.col}`);
  const enemyFront = enemies(c).some((e) => e.sector === `E:F${p.col}`);
  return allyFront || !enemyFront;
}
function addBrecha(c: Ctx, f: Figure, t: Figure, reason: string) {
  if (!canUse(f, 'activation', `brecha:${t.id}`)) return false;
  if (t.conditions.brechas >= MAX_BRECHAS(f)) return false;
  markUse(f, 'activation', `brecha:${t.id}`);
  t.conditions.brechas++;
  c.events.push({ type: 'condition', targetId: t.id, condition: 'furtivo', added: false });
  log(c, 'resource', `${t.name} recebe 1 Brecha (${t.conditions.brechas}) — ${reason}.`);
  return true;
}
function rogueAttack(id: string, name: string, dice: 'weapon' | [any, any], dano: number, text: string, extra: Partial<ActionDef> = {}): ActionDef {
  return {
    id,
    name,
    ap: 2,
    kind: 'attack',
    icon: 'item_dagger',
    text,
    source: C('§18.6'),
    targeting: { type: 'enemy', reach: 'weapon' },
    preview: (c, f) => ({ dice: dice === 'weapon' ? weaponOf(f)?.dice : dice, dano }),
    execute: (c, f, cmd) => weaponAttack(c, f, cmd, { techId: id, name, dice: dice === 'weapon' ? 'weapon' : dice, dano, school: 'shadow' }),
    ...extra,
  };
}
const ladinoActions: ActionDef[] = [
  rogueAttack('l_finesse', 'Golpe de Finesse', 'weapon', 2, 'Dados/alcance da arma, Dano 2. Cria/gasta Brechas normalmente.'),
  {
    id: 'l_finta',
    name: 'Finta',
    ap: 1,
    kind: 'utility',
    icon: 'cond_brecha',
    text: 'Inimigo Adjacente recebe 1 Brecha respeitando limite; depois Passo 1 ignorando custo de sair de Engajamento. Termina Furtivo.',
    source: C('§18.6'),
    targeting: { type: 'enemy', reach: 'global', adjacentOnly: true },
    execute: (c, f, cmd) => {
      addBrecha(c, f, targetOf(c, cmd), 'Finta');
      setCond(c, f, 'furtivo', false);
      stepLater(c, f, 1, true, 'Finta');
    },
  },
  {
    id: 'l_passo_sombrio',
    name: 'Passo Sombrio',
    ap: 1,
    kind: 'move',
    icon: 'act_passo',
    text: 'Passo 2 ignorando Engajamento; pode atravessar aliados. Se terminar atendendo os requisitos de Esconder-se, fique Furtivo gratuitamente.',
    source: C('§18.6 / §51.3'),
    targeting: { type: 'move', steps: 2, ignoreEngagement: true },
    hidden: (c, f) => hasTalent(f, 'l_passos_fantasmas'),
    execute: (c, f, cmd) => {
      heroMove(c, f, cmd.sector!, { kind: 'passo', ignoreEngagement: true });
      if (canHide(c, f)) applyCondition(c, f, 'furtivo', 1, f.id);
    },
  },
  {
    id: 'l_esconder',
    name: 'Esconder-se',
    ap: 1,
    kind: 'utility',
    icon: 'cond_furtivo',
    text: 'Somente sem inimigo Adjacente e com Cobertura, ou na Retaguarda sem exposição direta da coluna (aliado na Frente da coluna OU nenhum inimigo na Frente adversária da coluna). Fique Furtivo.',
    source: C('§51.2'),
    targeting: { type: 'none' },
    limit: 'activation',
    available: (c, f) => (f.conditions.furtivo ? 'Já Furtivo.' : canHide(c, f) ? null : 'Requisitos de Esconder-se não atendidos.'),
    execute: (c, f) => applyCondition(c, f, 'furtivo', 1, f.id),
  },
  rogueAttack('l_arteria', 'Corte na Artéria', ['sombra', 'precisao'], 1, 'Sombra + Precisão, Dano 1. Se gastar ao menos 1 Brecha e causar Dano: Sangramento 1. Impulso: +1 Dano, máximo uma vez.', {
    attackOptions: () => [impulsoOpt('l_art:dano', 'Impulso: +1 Dano')],
    applyAttackOption: (c, f, a, r, opt, out) => {
      if (opt === 'l_art:dano') out.addDano += 1;
    },
    onResolve: (c, f, a, r, out) => {
      const main = out.results.find((x) => x.targetId === a.targetId);
      const t = tryFig(c, a.targetId);
      if (main && main.final > 0 && out.spent.some((s) => s.startsWith('brecha:')) && t && isActive(t)) applyCondition(c, t, 'sangramento', 1, f.id);
    },
  }),
  rogueAttack('l_desequilibrio', 'Golpe de Desequilíbrio', ['sombra', 'agilidade'], 1, 'Sombra + Agilidade, Dano 1. Se causar Dano: Exposto. Impulso: Passo 1.', {
    attackOptions: () => [impulsoOpt('l_des:passo', 'Impulso: Passo 1', 1, undefined, false)],
    afterAttackOption: (c, f, a, r, opt) => {
      if (opt === 'l_des:passo') stepLater(c, f, 1, false, 'Golpe de Desequilíbrio');
    },
    onResolve: (c, f, a, r, out) => {
      const main = out.results.find((x) => x.targetId === a.targetId);
      const t = tryFig(c, a.targetId);
      if (main && main.final > 0 && t && isActive(t)) applyCondition(c, t, 'exposto', 1, f.id);
    },
  }),
];

const ladino: ClassDef = {
  id: 'ladino',
  name: 'Ladino',
  epithet: 'A brecha na guarda',
  hp: 11,
  armor: 0,
  attrs: { sombra: 8, agilidade: 8, precisao: 6, poder: 6, determinacao: 6, guarda: 4, espirito: 4, arcano: 4 },
  proficiencies: ['Finesse'],
  startingItems: ['adagas_gemeas', 'rapieira', 'lamina_serrilhada', 'couro_sombras'],
  resourceName: 'Brechas',
  description: 'Começa Furtivo, cria Brechas e as converte em Ponto Fraco, Escapar ou um Golpe Furtivo devastador. Evasão o tira do perigo.',
  passives: [
    { name: 'Furtivo', text: 'Não é invisibilidade. Começa Furtivo se nenhum inimigo estiver Adjacente. Para Alvo Padrão da IA conta como +2 conexões. Termina ao resolver Ataque/Técnica hostil, ao sofrer Dano ou quando um inimigo se torna Adjacente.' },
    { name: 'Brechas', text: 'Máximo 2 por alvo; no máximo 1 nova Brecha no mesmo alvo por Ativação. Fontes: Furtivo, aliado pressionando o alvo, Exposto, Imobilizado. Gastos: 1 — Ponto Fraco (+1 Sucesso); 1 — Escapar (Passo 2 depois); 2 — Golpe Furtivo (+2 Dano, ignora 1 Armadura).' },
    { name: 'Evasão — Reação', text: 'Antes de uma Defesa contra Ataque inimigo: adicione Agilidade (ou D4 se a Defesa já usa Agilidade), máximo 3 dados. Se a Defesa produzir Impulso, depois do Ataque Passo 1. Não pode usar enquanto Imobilizado.' },
  ],
  actions: ladinoActions,
  talentPaths: [
    { id: 'assassino', name: 'Assassino' },
    { id: 'sombra', name: 'Sombra' },
    { id: 'sabotador', name: 'Sabotador' },
  ],
  source: C('§18.6 / §51'),
  accent: '#3f8f8a',
  onCombatStart: (c, f) => {
    if (!enemies(c).some((e) => adjacent(e, f))) applyCondition(c, f, 'furtivo', 1, f.id);
  },
  preAttack: (c, f, a) => {
    if (!a.weapon) return;
    const t = tryFig(c, a.targetId);
    if (!t || t.side !== 'E') return;
    // HIPÓTESE Q-BRECHA: Brechas are created when the Ladino declares an Attack and a source applies.
    const pressing = heroes(c).some((h) => h.id !== f.id && adjacent(h, t));
    const src = a.furtivoAtDeclare ? 'Furtivo' : t.conditions.exposto || a.targetWasExposto ? 'Exposto' : t.conditions.imobilizado ? 'Imobilizado' : pressing ? 'aliado pressionando' : t.conditions.sangramento > 0 && hasTalent(f, 'l_cacador_feridas') ? 'Sangrando' : null;
    if (src) addBrecha(c, f, t, src);
  },
  attackOptions: (c, f, a) => {
    const t = tryFig(c, a.targetId);
    if (!t || t.side !== 'E' || a.control) return [];
    const b = t.conditions.brechas;
    const out: AttackOption[] = [];
    if (b >= 1) out.push({ id: 'brecha:pontoFraco', label: 'Brecha: Ponto Fraco (+1 Sucesso)', source: 'class:ladino', cost: { brecha: 1 } });
    if (b >= 1) out.push({ id: 'brecha:escapar', label: 'Brecha: Escapar (Passo 2 depois)', source: 'class:ladino', cost: { brecha: 1 } });
    if (b >= 2) out.push({ id: 'brecha:golpeFurtivo', label: 'Brechas ×2: Golpe Furtivo (+2 Dano, ignora 1 Armadura)', source: 'class:ladino', cost: { brecha: 2 }, requiresHit: true });
    return out;
  },
  applyAttackOption: (c, f, a, r, opt, out) => {
    if (opt === 'brecha:golpeFurtivo') {
      out.addDano += 2;
      out.addIgnoreArmor += 1;
    }
  },
  afterAttackOption: (c, f, a, r, opt, out) => {
    if (opt === 'brecha:escapar') stepLater(c, f, 2, false, 'Escapar');
    if (opt === 'brecha:golpeFurtivo' && hasTalent(f, 'l_ponto_vital') && canUse(f, 'activation', 'pontoVital')) {
      const main = out.results.find((x) => x.targetId === a.targetId);
      const t = tryFig(c, a.targetId);
      if (main && main.final > 0 && t && isActive(t)) {
        markUse(f, 'activation', 'pontoVital');
        applyCondition(c, t, 'sangramento', 1, f.id);
      }
    }
  },
  defenseReactions: (c, h, d) => {
    if (h.id !== d.targetId || h.conditions.imobilizado || d.dice.length >= 3) return [];
    const useAgi = d.attack.def === 'agilidade';
    return [{ heroId: h.id, kind: 'evasao', label: `Evasão (${h.name}): +${useAgi ? 'D4' : `Agilidade D${h.attrs!.agilidade}`}`, addDie: useAgi ? 4 : h.attrs!.agilidade }];
  },
  applyReaction: (c, h, d, kind) => {
    if (kind !== 'evasao') return;
    const useAgi = d.attack.def === 'agilidade';
    d.dice.push(useAgi ? { grade: 4, source: 'Evasão' } : { ...heroDie(h, 'agilidade'), source: 'Evasão (Agilidade)' });
    log(c, 'defense', `${h.name} usa Evasão.`);
  },
  afterDefense: (c, h, d, final) => {
    if (!d.reactionsUsed.some((r) => r.heroId === h.id && r.kind === 'evasao')) return;
    if ((d.roll?.impulsos ?? 0) > 0) stepLater(c, h, hasTalent(h, 'l_evasao_perfeita') ? 2 : 1, false, 'Evasão');
    if (final === 0 && hasTalent(h, 'l_evasao_perfeita')) applyCondition(c, h, 'guardado', 1, h.id);
  },
};

export const CLASSES: ClassDef[] = [guerreiro, paladino, arcanista, clerigo, arqueiro, ladino];

// =============================================================================== class handlers
export const CLASS_HANDLERS: Record<string, (c: Ctx, a: Record<string, unknown>) => void> = {
  'paladino:promptJudge': (c, a) => {
    const f = tryFig(c, a.id as string);
    if (f && isActive(f)) promptJudge(c, f);
  },
  'paladino:julgar': (c, a) => {
    const f = fig(c, a.figureId as string);
    const t = tryFig(c, a.optionId as string);
    if (t && isActive(t)) judge(c, f, t);
  },
  'arcanista:recoverPrompt': (c, a) => {
    const f = fig(c, a.id as string);
    const spent = (Object.keys(f.res!.runes) as RuneId[]).filter((r) => !f.res!.runes[r]);
    if (!spent.length) return;
    c.S.pending = {
      id: newId(c, 'p'),
      controllers: [f.id],
      kind: 'choice',
      prompt: `${(a.reason as string) ?? 'Matriz Rúnica'}: recupere 1 Runa Esgotada.`,
      figureId: f.id,
      handler: 'arcanista:recover',
      options: spent.map((r) => ({ id: r, label: RUNE_LABEL[r] })),
      args: { left: ((a.n as number) ?? 1) - 1 },
    };
  },
  'arcanista:recover': (c, a) => {
    const f = fig(c, a.figureId as string);
    f.res!.runes[a.optionId as RuneId] = true;
    log(c, 'resource', `${f.name} recupera ${RUNE_LABEL[a.optionId as RuneId]}.`);
    c.events.push({ type: 'resource', figureId: f.id, resource: 'runes', value: Object.values(f.res!.runes).filter(Boolean).length });
    if ((a.left as number) > 0) CLASS_HANDLERS['arcanista:recoverPrompt'](c, { id: f.id, n: a.left });
  },
  'arcanista:teleport': (c, a) => {
    const f = fig(c, a.figureId as string);
    const t = fig(c, a.targetId as string);
    const dest = a.optionId as SectorKey;
    const extra = leaveEngagementCost(c, t, dest, false);
    f.ap = Math.max(0, (f.ap ?? 0) - extra);
    heroMove(c, t, dest, { kind: 'teleport', ignoreEngagement: false });
  },
  'arcanista:dobraEnemy': (c, a) => {
    const f = fig(c, a.id as string);
    const list = enemies(c).filter((e) => !e.isBoss && !e.isMiniboss && connections(e.sector).some((k) => hasRoom(c.S.figures, k, e.id)));
    if (!list.length) return;
    c.S.pending = {
      id: newId(c, 'p'),
      controllers: [f.id],
      kind: 'choice',
      prompt: 'Dobra Espacial: mova um inimigo não-Boss 1 conexão (ou não mova).',
      figureId: f.id,
      handler: 'arcanista:dobraPick',
      options: [{ id: 'none', label: 'Não mover inimigo' }, ...list.map((e) => ({ id: e.id, label: e.name, detail: e.sector }))],
      args: {},
    };
  },
  'arcanista:dobraPick': (c, a) => {
    if (a.optionId === 'none') return;
    const f = fig(c, a.figureId as string);
    const e = fig(c, a.optionId as string);
    const dests = connections(e.sector).filter((k) => hasRoom(c.S.figures, k, e.id));
    c.S.pending = {
      id: newId(c, 'p'),
      controllers: [f.id],
      kind: 'choice',
      prompt: `Dobra Espacial: destino de ${e.name}.`,
      figureId: f.id,
      handler: 'arcanista:dobraMove',
      options: dests.map((k) => ({ id: k, label: k })),
      args: { enemyId: e.id },
    };
  },
  'arcanista:dobraMove': (c, a) => {
    const e = fig(c, a.enemyId as string);
    const { forcedMove } = require_core();
    forcedMove(c, e, a.optionId as SectorKey, a.figureId as string);
  },
  'sigil:trigger': (c, a) => {
    const s = c.S.battlefield.sigils.find((x) => x.id === a.sigilId);
    const e = tryFig(c, a.enemyId as string);
    if (!s || !e || !isActive(e)) return;
    const owner = tryFig(c, s.ownerId);
    removeSigil(c, s.id);
    if (!owner) return;
    log(c, 'attack', `Sigilo ativado sob ${e.name}!`);
    if (s.kind === 'detonacao')
      startHeroAttack(c, { sourceId: owner.id, targetId: e.id, techId: 'a_detonacao', name: 'Runa de Detonação', cat: 'global', dice: focusDice(owner), dano: 2, school: 'arcane', spell: true, data: { noBleed: true, keepFurtivo: true, intent: 'ruina' } });
    else
      startHeroAttack(c, { sourceId: owner.id, targetId: e.id, techId: 'a_estase_trigger', name: 'Selo de Estase', cat: 'global', dice: focusDice(owner), dano: 0, school: 'arcane', spell: true, control: true, data: { noBleed: true, keepFurtivo: true } });
  },
  'clerigo:versePrompt': (c, a) => {
    const f = fig(c, a.id as string);
    c.S.pending = {
      id: newId(c, 'p'),
      controllers: [f.id],
      kind: 'choice',
      prompt: `${f.name}: coloque o próximo Verso da Liturgia (${f.res!.liturgia.length}/3).`,
      figureId: f.id,
      handler: 'clerigo:verse',
      options: (['misericordia', 'vigilia', 'julgamento'] as Verse[]).map((v) => ({
        id: v,
        label: VERSE_LABEL[v],
        detail: v === 'misericordia' ? 'Primeira cura da Ativação +1 HP' : v === 'vigilia' ? 'Primeira proteção concede Passo 1 ao alvo' : 'Primeira ofensiva contra Exposto/Quebrado: Impulso → +1 Dano',
      })),
      args: {},
    };
  },
  'clerigo:verse': (c, a) => {
    const f = fig(c, a.figureId as string);
    f.res!.liturgia.push(a.optionId as Verse);
    log(c, 'resource', `${f.name} entoa o Verso ${VERSE_LABEL[a.optionId as Verse]} (${f.res!.liturgia.length}/3).`);
    c.events.push({ type: 'resource', figureId: f.id, resource: 'liturgia', value: f.res!.liturgia.length });
  },
  'clerigo:amem': (c, a) => {
    const f = fig(c, a.id as string);
    const l = f.res!.liturgia.slice();
    f.res!.liturgia = hasTalent(f, 'c_liturgia_eterna') ? [l[l.length - 1]] : [];
    const n = (v: Verse) => l.filter((x) => x === v).length;
    c.events.push({ type: 'resource', figureId: f.id, resource: 'amem', value: 1 });
    log(c, 'resource', `AMÉM! (${l.map((v) => VERSE_LABEL[v]).join(' · ')})`);
    if (hasTalent(f, 'c_antifona') && !f.reaction) f.reaction = true;
    if (n('misericordia') >= 2) {
      const total = n('misericordia') === 3 ? 6 : 4;
      const targets = supportTargets(c, f).filter((h) => h.hp < h.maxHp);
      if (!targets.length) return;
      c.S.pending = { id: newId(c, 'p'), controllers: [f.id], kind: 'allocate', prompt: `AMÉM — Misericórdia: distribua ${total} de cura na zona de suporte (máx. 3 por alvo).`, figureId: f.id, handler: 'clerigo:amemHeal', total, maxPer: 3, targets: targets.map((t) => t.id), args: { cleanse: n('misericordia') === 3 } };
      return;
    }
    if (n('vigilia') >= 2) {
      const group = [f, ...heroes(c).filter((h) => h.id !== f.id && adjacent(h, f))];
      for (const h of group) applyCondition(c, h, 'guardado', 1, f.id);
      if (n('vigilia') === 3) for (const h of group) stepLater(c, h, 1, false, 'AMÉM — Vigília');
      return;
    }
    if (n('julgamento') >= 2) {
      const list = enemies(c);
      if (!list.length) return;
      c.S.pending = { id: newId(c, 'p'), controllers: [f.id], kind: 'choice', prompt: 'AMÉM — Julgamento: escolha um inimigo à Distância (1 Dano Direto + Exposto + Quebrado).', figureId: f.id, handler: 'clerigo:amemJudge', options: list.map((e) => ({ id: e.id, label: e.name, detail: e.sector })), args: { three: n('julgamento') === 3 } };
      return;
    }
    // um de cada: até 3 heróis na zona de suporte escolhem individualmente
    const zone = supportTargets(c, f).slice(0, 3);
    pushOps(c, zone.map((h) => ({ op: 'call' as const, fn: 'clerigo:amemEachPrompt', args: { clericId: f.id, heroId: h.id } })), true);
  },
  'clerigo:amemHeal': (c, a) => {
    const f = fig(c, a.figureId as string);
    const alloc = a.alloc as Record<string, number>;
    let first: Figure | null = null;
    for (const [id, n] of Object.entries(alloc)) {
      if (n <= 0) continue;
      const t = fig(c, id);
      const healed = heal(c, t, n, f.id, { technique: false });
      if (healed && !first) first = t;
    }
    if (a.cleanse && first) {
      first.conditions.veneno = 0;
      first.conditions.sangramento = 0;
      setCond(c, first, 'queimando', false);
      log(c, 'heal', `AMÉM purifica ${first.name}.`);
    }
  },
  'clerigo:amemJudge': (c, a) => {
    const f = fig(c, a.figureId as string);
    const t = fig(c, a.optionId as string);
    const { dealDamage } = require_core();
    dealDamage(c, t, 1, { direct: true, sourceId: f.id, school: 'holy', label: 'AMÉM — Julgamento' });
    if (isActive(t)) {
      applyCondition(c, t, 'exposto', 1, f.id);
      applyCondition(c, t, 'quebrado', 1, f.id);
    }
    if (a.three) for (const e of enemies(c)) if (e.id !== t.id && adjacent(e, t)) applyCondition(c, e, 'exposto', 1, f.id);
  },
  'clerigo:amemEachPrompt': (c, a) => {
    const h = tryFig(c, a.heroId as string);
    if (!h || !isActive(h)) return;
    c.S.pending = { id: newId(c, 'p'), controllers: [h.id], kind: 'choice', prompt: `AMÉM: ${h.name} escolhe sua graça.`, figureId: h.id, handler: 'clerigo:amemEach', options: [{ id: 'cura', label: 'Curar 1' }, { id: 'guardado', label: 'Receber Guardado' }, { id: 'passo', label: 'Passo 1' }], args: { clericId: a.clericId } };
  },
  'clerigo:amemEach': (c, a) => {
    const h = fig(c, a.figureId as string);
    if (a.optionId === 'cura') heal(c, h, 1, a.clericId as string);
    if (a.optionId === 'guardado') applyCondition(c, h, 'guardado', 1, a.clericId as string);
    if (a.optionId === 'passo') pushOps(c, [{ op: 'step', figureId: h.id, steps: 1, ignoreEngagement: false, reason: 'AMÉM' }]);
  },
  'clerigo:bastaoStep': (c, a) => {
    const f = fig(c, a.id as string);
    if (!canUse(f, 'activation', 'bastao')) return;
    markUse(f, 'activation', 'bastao');
    const opts = heroes(c).filter((h) => stepDestinations(c, h, 1, false).length);
    if (!opts.length) return;
    c.S.pending = { id: newId(c, 'p'), controllers: [f.id], kind: 'choice', prompt: 'Bastão do Peregrino: você ou um herói faz Passo 1.', figureId: f.id, handler: 'clerigo:bastaoPick', options: [{ id: 'none', label: 'Não usar' }, ...opts.map((h) => ({ id: h.id, label: h.name }))], args: {} };
  },
  'clerigo:bastaoPick': (c, a) => {
    if (a.optionId === 'none') return;
    pushOps(c, [{ op: 'step', figureId: a.optionId as string, steps: 1, ignoreEngagement: false, reason: 'Bastão do Peregrino' }]);
  },
  'reaction:afterEnemyMove': (c, a) => {
    const e = tryFig(c, a.enemyId as string);
    if (!e || !isActive(e)) return;
    const from = a.from as SectorKey;
    const dist = Math.abs(Number(from[3]) - Number(e.sector[3])) + (from[2] === e.sector[2] ? 0 : 1);
    for (const ar of heroes(c)) {
      if (ar.typeId !== 'arqueiro' || !ar.reaction || ar.conditions.semReacoes || (ar.res?.mira ?? 0) < 1 || !weaponOf(ar)?.bow) continue;
      const need = hasTalent(ar, 'ar_olhos_corredor') ? 1 : 2;
      if (dist < need) continue;
      if (!canTarget(ar.sector, e, 'distancia', c.S.figures, 'H') || !bowAllows(ar, e)) continue;
      c.S.pending = {
        id: newId(c, 'p'),
        controllers: [ar.id],
        kind: 'choice',
        prompt: `Tiro de Interceptação: ${e.name} se moveu para ${e.sector}. Gastar Reação + 1 Mira?`,
        figureId: ar.id,
        handler: 'arqueiro:intercept',
        options: [
          { id: 'yes', label: 'Disparar (Dano 1)' },
          { id: 'no', label: 'Não reagir' },
        ],
        args: { enemyId: e.id },
      };
      return;
    }
  },
  'arqueiro:intercept': (c, a) => {
    if (a.optionId !== 'yes') return;
    const ar = fig(c, a.figureId as string);
    const e = tryFig(c, a.enemyId as string);
    if (!e || !isActive(e)) return;
    ar.reaction = false;
    ar.res!.mira -= 1;
    c.events.push({ type: 'resource', figureId: ar.id, resource: 'mira', value: ar.res!.mira });
    weaponAttack(c, ar, { actionId: 'ar_intercept', figureId: ar.id, targetIds: [e.id] }, { techId: 'ar_intercept', name: 'Tiro de Interceptação', dice: 'weapon', dano: 1, cat: 'distancia', school: 'arrow', data: { noBleed: true } });
  },
  'item:fivela': (c, a) => {
    const t = fig(c, a.targetId as string);
    const kind = a.kind as 'push' | 'pull';
    if (a.optionId === 'none') {
      kind === 'push' ? push(c, t, a.sourceId as string) : pull(c, t, a.sourceId as string);
      return;
    }
    markUse(t, 'combat', 'fivela');
    if (a.optionId === 'ignore') {
      log(c, 'item', `Fivela de Ferro: ${t.name} ignora o movimento.`);
      return;
    }
    const moved = kind === 'push' ? push(c, t, a.sourceId as string) : pull(c, t, a.sourceId as string);
    if (moved) applyCondition(c, t, 'guardado', 1, t.id);
  },
};

// lazy access to core functions not imported above (keeps the import list readable)
import * as Core from '@mosteiro/core';
function require_core() {
  return Core;
}
