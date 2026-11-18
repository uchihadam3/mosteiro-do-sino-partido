/**
 * Equipamentos D1 (Regra Mestra §16–§27, §57). Effects implemented as engine hooks.
 * `implemented: false` marks items whose text is too open for a faithful digital rule yet (see OPEN_DESIGN_QUESTIONS).
 */
import {
  adjacent,
  applyCondition,
  canUse,
  connections,
  enemies,
  hasCover,
  hasRoom,
  heroes,
  isActive,
  isEngaged,
  log,
  markUse,
  parseSector,
  push,
  pushOps,
  raiseLowest,
  reg,
  setCond,
  sk,
  spendUnspentImpulso,
  stepDestinations,
  tryFig,
  type ActionDef,
  type AttackOption,
  type Ctx,
  type Figure,
  type ItemDef,
} from '@mosteiro/core';
import { inIdeal, orbeOptionId } from '../characters/common';

const C = (section: string) => ({ section, status: 'CANONICO' as const });
const H = (section: string, note: string) => ({ section, status: 'HIPOTESE' as const, note });
const W = (section: string) => ({ section, status: 'WATCH' as const });

const imp = (id: string, label: string, cost = 1, requiresHit = true, group?: string): AttackOption => ({ id, label, source: '', cost: { impulso: cost }, requiresHit, group });
const isMain = (a: { targetId: string }, out: { results: { targetId: string; final: number }[] }) => out.results.find((r) => r.targetId === a.targetId);

function weapon(base: Partial<ItemDef> & Pick<ItemDef, 'id' | 'name' | 'rarity' | 'text' | 'source'>): ItemDef {
  return { slot: 'weapon', icon: 'item_sword', implemented: true, ...base } as ItemDef;
}
function armor(base: Partial<ItemDef> & Pick<ItemDef, 'id' | 'name' | 'rarity' | 'text' | 'source' | 'armor'>): ItemDef {
  return { slot: 'armor', icon: base.armor ? 'item_armor_medium' : 'item_armor_light', implemented: true, ...base } as ItemDef;
}
function acc(base: Partial<ItemDef> & Pick<ItemDef, 'id' | 'name' | 'rarity' | 'text' | 'source'>): ItemDef {
  return { slot: 'accessory', icon: 'item_accessory_amulet', implemented: true, ...base } as ItemDef;
}

// ============================================================================ starting weapons (§19)
const STARTING: ItemDef[] = [
  weapon({
    id: 'espada_longa',
    name: 'Espada Longa',
    rarity: 'inicial',
    classId: 'guerreiro',
    proficiency: ['Marcial'],
    dice: ['poder', 'precisao'],
    dano: 2,
    cat: 'cac',
    icon: 'item_sword',
    text: 'Poder + Precisão, Dano 2, Corpo a Corpo. Uma vez por Ativação, após Ataque, 1 Impulso → Guardado.',
    source: C('§19 Guerreiro'),
    attackOptions: (c, f, a, r) => (a.weapon && r.impulsos > 0 && canUse(f, 'activation', 'espadaLonga') ? [imp('espada_longa:guardado', 'Espada Longa: Impulso → Guardado', 1, false)] : []),
    afterAttackOption: (c, f, a, r, opt) => {
      if (opt !== 'espada_longa:guardado') return;
      markUse(f, 'activation', 'espadaLonga');
      applyCondition(c, f, 'guardado', 1, f.id);
    },
  }),
  weapon({
    id: 'machado_batalha',
    name: 'Machado de Batalha',
    rarity: 'inicial',
    classId: 'guerreiro',
    proficiency: ['Marcial'],
    dice: ['poder', 'determinacao'],
    dano: 2,
    cat: 'cac',
    icon: 'item_axe',
    text: 'Poder + Determinação, Dano 2. Após Dano, 2 Impulsos → Quebrado; em Tempo Pesado custa 1 Impulso.',
    source: C('§19 Guerreiro'),
    attackOptions: (c, f, a, r) => {
      if (!a.weapon) return [];
      const cost = f.tempo === 'pesado' ? 1 : 2;
      return r.impulsos >= cost ? [imp('machado_batalha:quebrado', `Machado: ${cost} Impulso(s) → Quebrado`, cost)] : [];
    },
    afterAttackOption: (c, f, a, r, opt, out) => {
      const m = isMain(a, out);
      const t = tryFig(c, a.targetId);
      if (opt === 'machado_batalha:quebrado' && m && m.final > 0 && t && isActive(t)) applyCondition(c, t, 'quebrado', 1, f.id);
    },
  }),
  weapon({
    id: 'lanca',
    name: 'Lança',
    rarity: 'inicial',
    classId: 'guerreiro',
    proficiency: ['Marcial'],
    dice: ['poder', 'agilidade'],
    dano: 2,
    cat: 'alcance',
    icon: 'item_spear',
    text: 'Poder + Agilidade, Dano 2, Alcance. Após Ataque, 1 Impulso → Empurrar 1 ou Passo 1.',
    source: C('§19 Guerreiro'),
    attackOptions: (c, f, a) => (a.weapon ? [imp('lanca:empurrar', 'Lança: Impulso → Empurrar 1', 1, true, 'lanca'), imp('lanca:passo', 'Lança: Impulso → Passo 1', 1, false, 'lanca')] : []),
    afterAttackOption: (c, f, a, r, opt, out) => {
      const t = tryFig(c, a.targetId);
      if (opt === 'lanca:empurrar' && out.hit && t) push(c, t, f.id);
      if (opt === 'lanca:passo') pushOps(c, [{ op: 'step', figureId: f.id, steps: 1, ignoreEngagement: false, reason: 'Lança', origin: 'weapon' }], false);
    },
  }),
  weapon({
    id: 'martelo_guerra',
    name: 'Martelo de Guerra',
    rarity: 'inicial',
    classId: 'guerreiro',
    proficiency: ['Marcial'],
    dice: ['poder', 'guarda'],
    dano: 2,
    cat: 'cac',
    icon: 'item_hammer',
    text: 'Poder + Guarda, Dano 2. Com 2+ Sucessos, após Dano → Exposto.',
    source: C('§19 Guerreiro'),
    afterAttack: (c, f, a, r, out) => {
      const m = isMain(a, out);
      const t = tryFig(c, a.targetId);
      if (a.weapon && r.successes >= 2 && m && m.final > 0 && t && isActive(t)) applyCondition(c, t, 'exposto', 1, f.id);
    },
  }),
  weapon({
    id: 'espada_escudo_juramento',
    name: 'Espada e Escudo do Juramento',
    rarity: 'inicial',
    classId: 'paladino',
    proficiency: ['Marcial', 'Sagrado'],
    dice: ['poder', 'guarda'],
    dano: 2,
    cat: 'cac',
    icon: 'item_sword',
    text: 'Poder + Guarda, Dano 2. Enquanto na Frente, você recebe Cobertura e aliado na Retaguarda da mesma coluna recebe Cobertura.',
    source: C('§19 Paladino'),
    grantsCover: (c, owner, target) => {
      const p = parseSector(owner.sector);
      if (p.row !== 'F') return false;
      return target.id === owner.id || target.sector === sk('H', 'R', p.col);
    },
  }),
  weapon({
    id: 'martelo_juramento',
    name: 'Martelo do Juramento',
    rarity: 'inicial',
    classId: 'paladino',
    proficiency: ['Marcial', 'Sagrado'],
    dice: ['poder', 'determinacao'],
    dano: 2,
    cat: 'cac',
    icon: 'item_hammer',
    text: 'Poder + Determinação, Dano 2. 1 Impulso no acerto → ignore 1 Armadura.',
    source: C('§19 Paladino'),
    attackOptions: (c, f, a) => (a.weapon ? [imp('martelo_juramento:pierce', 'Martelo: Impulso → ignorar 1 Armadura')] : []),
    applyAttackOption: (c, f, a, r, opt, out) => {
      if (opt === 'martelo_juramento:pierce') out.addIgnoreArmor += 1;
    },
  }),
  weapon({
    id: 'lanca_alvorada',
    name: 'Lança da Alvorada',
    rarity: 'inicial',
    classId: 'paladino',
    proficiency: ['Marcial', 'Sagrado'],
    dice: ['poder', 'espirito'],
    dano: 2,
    cat: 'alcance',
    icon: 'item_spear',
    text: 'Poder + Espírito, Dano 2, Alcance. Da Retaguarda contra a Frente e 1 Impulso → você/aliado na Frente da coluna recebe Guardado.',
    source: C('§19 Paladino'),
    attackOptions: (c, f, a) => {
      const t = tryFig(c, a.targetId);
      if (!a.weapon || !t || parseSector(f.sector).row !== 'R' || parseSector(t.sector).row !== 'F') return [];
      return [imp('lanca_alvorada:guard', 'Lança da Alvorada: Impulso → Guardado na Frente da coluna', 1, false)];
    },
    afterAttackOption: (c, f, a, r, opt) => {
      if (opt !== 'lanca_alvorada:guard') return;
      const front = heroes(c).filter((h) => h.sector === sk('H', 'F', parseSector(f.sector).col) && !h.conditions.guardado);
      applyCondition(c, front[0] ?? f, 'guardado', 1, f.id);
    },
  }),
  weapon({
    id: 'cajado_runico',
    name: 'Cajado Rúnico',
    rarity: 'inicial',
    classId: 'arcanista',
    proficiency: ['Arcano'],
    focus: true,
    dice: ['arcano', 'espirito'],
    dano: 1,
    cat: 'distancia',
    icon: 'item_staff',
    text: 'Foco: Arcano + Espírito, Dano 1, Distância. Após Canalizar, Passo 1.',
    source: C('§19 Arcanista'),
  }),
  weapon({
    id: 'varinha_prismatica',
    name: 'Varinha Prismática',
    rarity: 'inicial',
    classId: 'arcanista',
    proficiency: ['Arcano'],
    focus: true,
    dice: ['arcano', 'precisao'],
    dano: 1,
    cat: 'distancia',
    icon: 'item_wand',
    text: 'Foco: Arcano + Precisão, Dano 1. Uma vez por Ativação, antes de feitiço de Raio, aumente um dado em 1 Grau.',
    source: C('§19 Arcanista'),
    preAttack: (c, f, a) => {
      if (a.spell && a.data['form'] === 'raio' && canUse(f, 'activation', 'varinha')) {
        markUse(f, 'activation', 'varinha');
        a.dice = raiseLowest(a.dice, 1, 'Varinha');
      }
    },
  }),
  weapon({
    id: 'orbe_gravitico',
    name: 'Orbe Gravítico',
    rarity: 'inicial',
    classId: 'arcanista',
    proficiency: ['Arcano'],
    focus: true,
    dice: ['arcano', 'determinacao'],
    dano: 1,
    cat: 'distancia',
    icon: 'item_orb',
    text: 'Foco: Arcano + Determinação, Dano 1. Uma vez por Ativação, quando feitiço mover não-Boss, mude a direção para Setor conectado legal.',
    source: H('§19 Arcanista', 'Q-ORBE: vale para o Puxar do Poço Gravitacional (a Dobra já escolhe o destino); só quando o feitiço realmente moveria o alvo; escolha feita junto com os gastos da rolagem.'),
    // Q-ORBE: the redirection is offered as a free post-roll option (one target, one connected Sector with room);
    // it applies only if the spell would really move the target (valid Puxar with room) — Poço resolves it via spellPull.
    attackOptions: (c, f, a, r) => {
      if (!a.spell || a.data['forcedMove'] !== 'pull' || r.successes < 1 || !canUse(f, 'activation', 'orbeGravitico')) return [];
      const out: AttackOption[] = [];
      for (const id of [a.targetId, ...a.extraTargets]) {
        const t = tryFig(c, id);
        if (!t || !isActive(t) || t.isBoss || t.isMiniboss) continue;
        const p = parseSector(t.sector);
        const normal = sk(p.side, 'F', p.col);
        if (p.row !== 'R' || !hasRoom(c.S.figures, normal, t.id)) continue;
        for (const k of connections(t.sector)) {
          if (k !== normal && hasRoom(c.S.figures, k, t.id)) out.push({ id: orbeOptionId(t.id, k), label: `Orbe Gravítico: desviar ${t.name} para ${k}`, source: '', cost: {}, requiresHit: true, group: 'orbe_gravitico' });
        }
      }
      return out;
    },
  }),
  weapon({
    id: 'bastao_peregrino',
    name: 'Bastão do Peregrino',
    rarity: 'inicial',
    classId: 'clerigo',
    proficiency: ['Sagrado'],
    focus: true,
    dice: ['espirito', 'precisao'],
    dano: 1,
    cat: 'distancia',
    icon: 'item_staff',
    text: 'Espírito + Precisão, Dano 1, Distância. Após Técnica que restaure HP, você ou herói faz Passo 1.',
    source: C('§19 Clérigo'),
  }),
  weapon({
    id: 'sino_vigilia',
    name: 'Sino da Vigília',
    rarity: 'inicial',
    classId: 'clerigo',
    proficiency: ['Sagrado'],
    focus: true,
    icon: 'item_bell',
    text: 'Intercessão falha em outro → o Clérigo recebe a Condição; se falhar em si → 1 Dano Direto e rerrole Espírito.',
    source: C('§19 Clérigo'),
  }),
  weapon({
    id: 'censario_julgamento',
    name: 'Censário do Julgamento',
    rarity: 'inicial',
    classId: 'clerigo',
    proficiency: ['Sagrado'],
    focus: true,
    icon: 'item_censer',
    text: 'Ataque que cause Dano contra alvo já Exposto/Quebrado pode gastar 1 Impulso → Queimando até o fim do Ciclo.',
    source: C('§19 Clérigo'),
    attackOptions: (c, f, a) => (!a.control && !a.data['support'] && (a.targetWasExposto || a.targetWasQuebrado) ? [imp('censario:fogo', 'Censário: Impulso → Queimando')] : []),
    afterAttackOption: (c, f, a, r, opt, out) => {
      const m = isMain(a, out);
      const t = tryFig(c, a.targetId);
      if (opt === 'censario:fogo' && m && m.final > 0 && t && isActive(t)) applyCondition(c, t, 'queimando', 1, f.id);
    },
  }),
  weapon({
    id: 'arco_curto',
    name: 'Arco Curto',
    rarity: 'inicial',
    classId: 'arqueiro',
    proficiency: ['Arco'],
    dice: ['precisao', 'agilidade'],
    dano: 2,
    cat: 'distancia',
    bow: { faixas: ['proxima', 'media'], ideal: 'proxima' },
    icon: 'item_bow',
    text: 'Precisão + Agilidade, Dano 2, Distância. Próxima e Média; Faixa Ideal Próxima. Uma vez por Ativação ignore a primeira perda de Mira por movimento.',
    source: C('§18.5 / §19'),
  }),
  weapon({
    id: 'arco_recurvo',
    name: 'Arco Recurvo',
    rarity: 'inicial',
    classId: 'arqueiro',
    proficiency: ['Arco'],
    dice: ['precisao', 'agilidade'],
    dano: 2,
    cat: 'distancia',
    bow: { faixas: ['proxima', 'media', 'longa'], ideal: 'media' },
    icon: 'item_bow',
    text: 'Precisão + Agilidade, Dano 2. Próxima, Média e Longa; Faixa Ideal Média. Depois de Ataque em Ideal com Impulso, Passo 1 sem gastar Impulso.',
    source: C('§18.5 / §19'),
    afterAttack: (c, f, a, r) => {
      const t = tryFig(c, a.targetId);
      if (a.weapon && r.impulsos > 0 && t && inIdeal(f, t)) pushOps(c, [{ op: 'step', figureId: f.id, steps: 1, ignoreEngagement: false, reason: 'Arco Recurvo', origin: 'weapon' }], false);
    },
  }),
  weapon({
    id: 'arco_longo',
    name: 'Arco Longo',
    rarity: 'inicial',
    classId: 'arqueiro',
    proficiency: ['Arco'],
    dice: ['precisao', 'determinacao'],
    dano: 2,
    cat: 'distancia',
    bow: { faixas: ['media', 'longa'], ideal: 'longa', noAdjacent: true },
    icon: 'item_bow',
    text: 'Precisão + Determinação, Dano 2. Média e Longa; Faixa Ideal Longa; não ataca Próxima nem alvo Adjacente. Acerto em Ideal sem movimento voluntário anterior: 1 Impulso → +1 Dano.',
    source: C('§18.5 / §19'),
    attackOptions: (c, f, a) => {
      const t = tryFig(c, a.targetId);
      return a.weapon && t && inIdeal(f, t) && (f.movedThisActivation ?? 0) === 0 ? [imp('arco_longo:dano', 'Arco Longo: Impulso → +1 Dano')] : [];
    },
    applyAttackOption: (c, f, a, r, opt, out) => {
      if (opt === 'arco_longo:dano') out.addDano += 1;
    },
  }),
  weapon({
    id: 'adagas_gemeas',
    name: 'Adagas Gêmeas',
    rarity: 'inicial',
    classId: 'ladino',
    proficiency: ['Finesse'],
    dice: ['sombra', 'agilidade'],
    dano: 2,
    cat: 'cac',
    icon: 'item_dagger',
    text: 'Sombra + Agilidade, Dano 2. Após Ataque que gastou Brecha, 1 Impulso → Passo 1.',
    source: C('§19 Ladino'),
    attackOptions: (c, f, a) => (a.weapon ? [imp('adagas:passo', 'Adagas: Impulso → Passo 1 (se gastou Brecha)', 1, false)] : []),
    afterAttackOption: (c, f, a, r, opt, out) => {
      if (opt === 'adagas:passo' && out.spent.some((s) => s.startsWith('brecha:'))) pushOps(c, [{ op: 'step', figureId: f.id, steps: 1, ignoreEngagement: false, reason: 'Adagas Gêmeas', origin: 'weapon' }], false);
    },
  }),
  weapon({
    id: 'rapieira',
    name: 'Rapieira',
    rarity: 'inicial',
    classId: 'ladino',
    proficiency: ['Finesse'],
    dice: ['precisao', 'agilidade'],
    dano: 2,
    cat: 'cac',
    icon: 'item_rapier',
    text: 'Precisão + Agilidade, Dano 2. Contra alvo com Brecha pode declarar sem gastar Brecha; 2+ Sucessos → +1 Dano.',
    source: C('§19 Ladino'),
    applyAttackOption: () => undefined,
    attackOptions: () => [],
    preAttack: () => undefined,
    afterAttack: () => undefined,
    // bonus computed before damage through a synthetic always-on option
    onGuardConsumed: undefined,
  }),
  weapon({
    id: 'lamina_serrilhada',
    name: 'Lâmina Serrilhada',
    rarity: 'inicial',
    classId: 'ladino',
    proficiency: ['Finesse'],
    dice: ['sombra', 'determinacao'],
    dano: 2,
    cat: 'cac',
    icon: 'item_dagger',
    text: 'Sombra + Determinação, Dano 2. Após Dano, se gastou exatamente 1 Brecha, 1 Impulso → Sangramento 1.',
    source: C('§19 Ladino'),
    attackOptions: (c, f, a) => (a.weapon ? [imp('lamina:sangrar', 'Lâmina: Impulso → Sangramento 1 (se gastou exatamente 1 Brecha)')] : []),
    afterAttackOption: (c, f, a, r, opt, out) => {
      const brechas = out.spent.filter((s) => s === 'brecha:pontoFraco' || s === 'brecha:escapar').length;
      const m = isMain(a, out);
      const t = tryFig(c, a.targetId);
      if (opt === 'lamina:sangrar' && brechas === 1 && !out.spent.includes('brecha:golpeFurtivo') && m && m.final > 0 && t && isActive(t)) applyCondition(c, t, 'sangramento', 1, f.id);
    },
  }),
];
// Rapieira: automatic +1 Dano when target had a Brecha, no Brecha spent, and 2+ Successes.
const rapieira = STARTING.find((i) => i.id === 'rapieira')!;
rapieira.attackOptions = (c, f, a, r) =>
  a.weapon && a.targetHadBrecha && r.successes >= 2 ? [{ id: 'rapieira:dano', label: 'Rapieira: sem gastar Brecha, 2+ Sucessos → +1 Dano', source: '', cost: {}, requiresHit: true, group: 'rapieira' }] : [];
rapieira.applyAttackOption = (c, f, a, r, opt, out) => {
  if (opt === 'rapieira:dano' && !out.spent.some((s) => s.startsWith('brecha:'))) out.addDano += 1;
};

// ============================================================================ starting armors (§22)
const STARTING_ARMOR: ItemDef[] = [
  armor({ id: 'cota_malha', name: 'Cota de Malha', rarity: 'inicial', classId: 'guerreiro', armor: 1, weight: 'media', icon: 'item_armor_medium', text: 'Armadura 1.', source: C('§22') }),
  armor({ id: 'cota_juramento', name: 'Cota do Juramento', rarity: 'inicial', classId: 'paladino', armor: 1, weight: 'media', icon: 'item_armor_medium', text: 'Armadura 1.', source: C('§22') }),
  armor({
    id: 'vestes_aprendiz',
    name: 'Vestes do Aprendiz',
    rarity: 'inicial',
    classId: 'arcanista',
    armor: 0,
    weight: 'veste',
    icon: 'item_robe',
    text: 'Armadura 0. Uma vez por Combate, depois de usar Barreira Rúnica, recupere 1 Runa Esgotada.',
    source: H('§22', 'Q-VESTES: “recuperação rúnica aprovada da carta” = recuperar 1 Runa.'),
  }),
  armor({
    id: 'vestes_consagradas',
    name: 'Vestes Consagradas',
    rarity: 'inicial',
    classId: 'clerigo',
    armor: 0,
    weight: 'veste',
    icon: 'item_robe',
    text: 'Armadura 0. No início do Combate, você e até 1 aliado Adjacente recebem Guardado.',
    source: C('§22'),
    onCombatStart: (c, f) => {
      applyCondition(c, f, 'guardado', 1, f.id);
      const ally = heroes(c).filter((h) => h.id !== f.id && adjacent(h, f)).sort((a, b) => a.hp - b.hp || a.order - b.order)[0];
      if (ally) applyCondition(c, ally, 'guardado', 1, f.id);
    },
  }),
  armor({
    id: 'couro_cacador',
    name: 'Couro do Caçador',
    rarity: 'inicial',
    classId: 'arqueiro',
    armor: 0,
    weight: 'leve',
    icon: 'item_armor_light',
    text: 'Armadura 0. Uma vez por Combate, depois que um inimigo voluntariamente se tornar Engajado com você, Passo 1 ignorando o custo extra de sair de Engajamento.',
    source: H('§22', 'Q-COURO-CACADOR: o Passo é opcional; o uso por Combate só é gasto se você realmente se mover.'),
    // Q-COURO-CACADOR: the Passo is optional; the once-per-Combat use is spent only if the hero actually moves.
    onEnemyEngaged: (c, f, e) => {
      if (!isActive(f) || !canUse(f, 'combat', 'couroCacador') || !stepDestinations(c, f, 1, true).length) return;
      log(c, 'item', `Couro do Caçador: ${e.name} engaja ${f.name}, que pode dar Passo 1.`);
      pushOps(c, [
        { op: 'step', figureId: f.id, steps: 1, ignoreEngagement: true, reason: 'Couro do Caçador', origin: 'armor' },
        { op: 'call', fn: 'couroCacador:check', args: { id: f.id, from: f.sector } },
      ]);
    },
  }),
  armor({
    id: 'couro_sombras',
    name: 'Couro das Sombras',
    rarity: 'inicial',
    classId: 'ladino',
    armor: 0,
    weight: 'leve',
    icon: 'item_armor_light',
    text: 'Armadura 0. Enquanto Furtivo, você possui Cobertura. Uma vez por Combate, depois que um Ataque de Distância contra você for reduzido por Cobertura, Passo 1 ignorando custo extra de Engajamento.',
    source: C('§22'),
    grantsCover: (c, owner, target) => owner.id === target.id && owner.conditions.furtivo,
    afterDefense: (c, f, d) => {
      if (d.attack.cat === 'distancia' && c.S.flags['__lastDefCover'] && canUse(f, 'combat', 'couroSombras')) {
        markUse(f, 'combat', 'couroSombras');
        pushOps(c, [{ op: 'step', figureId: f.id, steps: 1, ignoreEngagement: true, reason: 'Couro das Sombras' }], false);
      }
    },
  }),
];

// ============================================================================ common weapons (§20)
const COMMON_WEAPONS: ItemDef[] = [
  weapon({
    id: 'espada_balanceada',
    name: 'Espada Balanceada',
    rarity: 'comum',
    proficiency: ['Marcial'],
    dice: ['poder', 'precisao'],
    dano: 2,
    cat: 'cac',
    icon: 'item_sword',
    text: 'Poder + Precisão, Dano 2. Sem movimento voluntário antes, 2+ Sucessos → Guardado.',
    source: C('§20'),
    afterAttack: (c, f, a, r) => {
      if (a.weapon && (f.movedThisActivation ?? 0) === 0 && r.successes >= 2) applyCondition(c, f, 'guardado', 1, f.id);
    },
  }),
  weapon({
    id: 'machado_mao',
    name: 'Machado de Mão',
    rarity: 'comum',
    proficiency: ['Marcial'],
    dice: ['poder', 'determinacao'],
    dano: 2,
    cat: 'cac',
    icon: 'item_axe',
    text: 'Poder + Determinação, Dano 2. Uma vez por Ativação, o Ataque Básico pode atingir a Frente à Distância com Dano 1.',
    source: C('§20'),
  }),
  weapon({
    id: 'lanca_caca',
    name: 'Lança de Caça',
    rarity: 'comum',
    proficiency: ['Marcial'],
    dice: ['poder', 'agilidade'],
    dano: 2,
    cat: 'alcance',
    icon: 'item_spear',
    text: 'Poder + Agilidade, Dano 2, Alcance. Da Retaguarda contra a Frente, Impulso → Passo 1 sem gasto.',
    source: C('§20'),
    afterAttack: (c, f, a, r) => {
      const t = tryFig(c, a.targetId);
      if (a.weapon && r.impulsos > 0 && t && parseSector(f.sector).row === 'R' && parseSector(t.sector).row === 'F') pushOps(c, [{ op: 'step', figureId: f.id, steps: 1, ignoreEngagement: false, reason: 'Lança de Caça', origin: 'weapon' }], false);
    },
  }),
  weapon({
    id: 'besta_mao',
    name: 'Besta de Mão',
    rarity: 'comum',
    proficiency: ['Arco', 'Finesse'],
    dice: ['precisao', 'determinacao'],
    dano: 2,
    cat: 'distancia',
    bow: { faixas: ['proxima', 'media'], ideal: 'proxima' },
    icon: 'item_crossbow',
    text: 'Arco | Finesse. Precisão + Determinação, Dano 2, Faixa Ideal Próxima. Impulso em Próxima → +1 Dano.',
    source: H('§20', 'Q-BESTA: Faixas permitidas = Próxima e Média (como Arco Curto).'),
    attackOptions: (c, f, a) => {
      const t = tryFig(c, a.targetId);
      return a.weapon && t && parseSector(f.sector).row === 'F' && parseSector(t.sector).row === 'F' ? [imp('besta:dano', 'Besta: Impulso em Próxima → +1 Dano')] : [];
    },
    applyAttackOption: (c, f, a, r, opt, out) => {
      if (opt === 'besta:dano') out.addDano += 1;
    },
  }),
  weapon({
    id: 'arco_teixo',
    name: 'Arco de Teixo',
    rarity: 'comum',
    proficiency: ['Arco'],
    dice: ['precisao', 'agilidade'],
    dano: 2,
    cat: 'distancia',
    bow: { faixas: ['proxima', 'media', 'longa'], ideal: 'media' },
    icon: 'item_bow',
    text: 'Precisão + Agilidade, Dano 2, Faixa Ideal Média. Após Dano em alvo na Frente, 1 Impulso → Empurrar 1.',
    source: C('§20'),
    attackOptions: (c, f, a) => {
      const t = tryFig(c, a.targetId);
      return a.weapon && t && parseSector(t.sector).row === 'F' ? [imp('teixo:empurrar', 'Arco de Teixo: Impulso → Empurrar 1')] : [];
    },
    afterAttackOption: (c, f, a, r, opt, out) => {
      const m = isMain(a, out);
      const t = tryFig(c, a.targetId);
      if (opt === 'teixo:empurrar' && m && m.final > 0 && t) push(c, t, f.id);
    },
  }),
  weapon({ id: 'cajado_quartzo', name: 'Cajado de Quartzo', rarity: 'comum', proficiency: ['Arcano'], focus: true, dice: ['arcano', 'espirito'], dano: 1, cat: 'distancia', icon: 'item_staff', text: 'Foco Arcano. Depois de criar Sigilo, Passo 1.', source: H('§20', 'Q-FOCOS-COMUNS: dados do Foco = Arcano + Espírito, Dano 1, Distância.') }),
  weapon({
    id: 'orbe_chumbo',
    name: 'Orbe de Chumbo',
    rarity: 'comum',
    proficiency: ['Arcano'],
    focus: true,
    dice: ['arcano', 'determinacao'],
    dano: 1,
    cat: 'distancia',
    icon: 'item_orb',
    text: 'Foco Arcano. Uma vez por Combate, antes de Teste de Controle, +D6 (máximo 3 dados).',
    source: H('§20', 'Q-FOCOS-COMUNS: dados = Arcano + Determinação, Dano 1, Distância.'),
    preAttack: (c, f, a) => {
      if (a.control && !a.data['support'] && a.dice.length < 3 && canUse(f, 'combat', 'orboChumbo')) {
        markUse(f, 'combat', 'orboChumbo');
        a.dice.push({ grade: 6, source: 'Orbe de Chumbo' });
      }
    },
  }),
  weapon({ id: 'cetro_peregrino', name: 'Cetro do Peregrino', rarity: 'comum', proficiency: ['Sagrado'], focus: true, dice: ['espirito', 'precisao'], dano: 1, cat: 'distancia', icon: 'item_staff', text: 'Foco Sagrado. Depois de Técnica que concede Guardado, você ou herói faz Passo 1.', source: H('§20', 'Q-FOCOS-COMUNS: dados = Espírito + Precisão, Dano 1, Distância. Q-CETRO: Técnica = técnica de classe/talento (AMÉM não conta).'),
    // Q-CETRO: fires after each own Técnica that actually grants Guardado (Proteção Sagrada, Golpe Radiante, Passo Tático).
    onTechniqueGuard: (c, f) => {
      pushOps(c, [{ op: 'call', fn: 'cetro:step', args: { id: f.id } }], false);
    },
  }),
  weapon({
    id: 'maca_consagrada',
    name: 'Maça Consagrada',
    rarity: 'comum',
    proficiency: ['Sagrado', 'Marcial'],
    dice: ['poder', 'espirito'],
    dano: 2,
    cat: 'cac',
    icon: 'item_hammer',
    text: 'Acerto + 1 Impulso → o Ataque torna-se Radiante.',
    source: H('§20', 'Q-MACA: dados = Poder + Espírito, Dano 2, Corpo a Corpo.'),
    attackOptions: (c, f, a) => (a.weapon && !a.radiante ? [imp('maca:radiante', 'Maça: Impulso → Radiante')] : []),
    applyAttackOption: (c, f, a, r, opt, out) => {
      if (opt === 'maca:radiante') out.radiante = true;
    },
  }),
  weapon({
    id: 'adaga_ritual',
    name: 'Adaga Ritual',
    rarity: 'comum',
    proficiency: ['Finesse'],
    dice: ['sombra', 'agilidade'],
    dano: 2,
    cat: 'cac',
    icon: 'item_dagger',
    text: 'Alvo já Exposto/Quebrado, 1 Impulso → +1 Dano.',
    source: H('§20', 'Q-ADAGA: dados = Sombra + Agilidade, Dano 2, Corpo a Corpo.'),
    attackOptions: (c, f, a) => (a.weapon && (a.targetWasExposto || a.targetWasQuebrado) ? [imp('adaga_ritual:dano', 'Adaga Ritual: Impulso → +1 Dano')] : []),
    applyAttackOption: (c, f, a, r, opt, out) => {
      if (opt === 'adaga_ritual:dano') out.addDano += 1;
    },
  }),
];

// ============================================================================ rare weapons (§57)
const RARE_WEAPONS: ItemDef[] = [
  weapon({
    id: 'espada_contrapasso',
    name: 'Espada do Contrapasso',
    rarity: 'raro',
    proficiency: ['Marcial', 'Finesse'],
    dice: ['poder', 'precisao'],
    dano: 2,
    cat: 'cac',
    icon: 'item_sword',
    text: 'Uma vez por Ativação, se você fez Passo antes deste Ataque, aumente o menor dado do Ataque em 1 Grau.',
    source: C('§57'),
    preAttack: (c, f, a) => {
      if (a.weapon && f.steppedThisActivation && canUse(f, 'activation', 'contrapasso')) {
        markUse(f, 'activation', 'contrapasso');
        a.dice = raiseLowest(a.dice, 1, 'Contrapasso');
      }
    },
  }),
  weapon({
    id: 'machado_ruptura',
    name: 'Machado da Ruptura',
    rarity: 'raro',
    proficiency: ['Marcial'],
    dice: ['poder', 'determinacao'],
    dano: 2,
    cat: 'cac',
    icon: 'item_axe',
    text: 'Uma vez por Ativação, depois que este Ataque causar Dano, você pode gastar 1 Impulso para aplicar Quebrado.',
    source: C('§57'),
    attackOptions: (c, f, a) => (a.weapon && canUse(f, 'activation', 'machadoRuptura') ? [imp('ruptura:quebrado', 'Machado da Ruptura: Impulso → Quebrado')] : []),
    afterAttackOption: (c, f, a, r, opt, out) => {
      const m = isMain(a, out);
      const t = tryFig(c, a.targetId);
      if (opt === 'ruptura:quebrado' && m && m.final > 0 && t && isActive(t)) {
        markUse(f, 'activation', 'machadoRuptura');
        applyCondition(c, t, 'quebrado', 1, f.id);
      }
    },
  }),
  weapon({
    id: 'lanca_vigia',
    name: 'Lança do Vigia',
    rarity: 'raro',
    proficiency: ['Marcial', 'Finesse'],
    dice: ['poder', 'agilidade'],
    dano: 2,
    cat: 'alcance',
    icon: 'item_spear',
    text: 'Uma vez por Ativação, se este Ataque for feito da Retaguarda contra a Frente adversária da mesma coluna e causar Dano, receba Guardado.',
    source: C('§57'),
    afterAttack: (c, f, a, r, out) => {
      const m = isMain(a, out);
      const t = tryFig(c, a.targetId);
      if (a.weapon && m && m.final > 0 && t && parseSector(f.sector).row === 'R' && parseSector(t.sector).row === 'F' && canUse(f, 'activation', 'lancaVigia')) {
        markUse(f, 'activation', 'lancaVigia');
        applyCondition(c, f, 'guardado', 1, f.id);
      }
    },
  }),
  weapon({ id: 'arco_raposa', name: 'Arco da Raposa', rarity: 'raro', proficiency: ['Arco'], dice: ['precisao', 'agilidade'], dano: 2, cat: 'distancia', bow: { faixas: ['proxima', 'media', 'longa'], ideal: 'media' }, icon: 'item_bow', text: 'Próxima, Média e Longa; Faixa Ideal Média. A primeira Reposição/Troca voluntária da sua Ativação não reduz Mira.', source: C('§57') }),
  weapon({
    id: 'arco_linha_clara',
    name: 'Arco da Linha Clara',
    rarity: 'raro',
    proficiency: ['Arco'],
    dice: ['precisao', 'determinacao'],
    dano: 2,
    cat: 'distancia',
    bow: { faixas: ['media', 'longa'], ideal: 'longa' },
    icon: 'item_bow',
    text: 'Média e Longa; Faixa Ideal Longa; não ataca Próxima. Uma vez por Ativação, ao acertar na Faixa Ideal sem redução por Cobertura, 1 Impulso → +1 Dano.',
    source: C('§57'),
    attackOptions: (c, f, a) => {
      const t = tryFig(c, a.targetId);
      return a.weapon && t && inIdeal(f, t) && canUse(f, 'activation', 'linhaClara') && (!hasCover(c, t) || a.ignoreCover) ? [imp('linha:dano', 'Linha Clara: Impulso → +1 Dano')] : [];
    },
    applyAttackOption: (c, f, a, r, opt, out) => {
      if (opt === 'linha:dano') {
        markUse(f, 'activation', 'linhaClara');
        out.addDano += 1;
      }
    },
  }),
  weapon({ id: 'varinha_eco', name: 'Varinha do Eco', rarity: 'raro', proficiency: ['Arcano'], focus: true, dice: ['arcano', 'precisao'], dano: 1, cat: 'distancia', icon: 'item_wand', text: 'Centelha: Arcano + Precisão, Dano 1. Uma vez por Combate, depois de um feitiço de Raio que usou duas Runas Prontas, recupere a Runa de Forma Raio.', source: C('§57'),
    afterAttack: (c, f, a) => {
      if (a.spell && a.data['form'] === 'raio' && f.counters.activation['bothReady'] === 1 && canUse(f, 'combat', 'varinhaEco') && f.res) {
        markUse(f, 'combat', 'varinhaEco');
        f.res.runes.raio = true;
        log(c, 'item', 'Varinha do Eco: a Runa Raio retorna.');
      }
    },
  }),
  weapon({ id: 'orbe_espaco_curvo', name: 'Orbe do Espaço Curvo', rarity: 'raro', proficiency: ['Arcano'], focus: true, dice: ['arcano', 'determinacao'], dano: 1, cat: 'distancia', icon: 'item_orb', text: 'Centelha: Arcano + Determinação, Dano 1. Uma vez por Ativação, ao resolver um efeito de Transposição, aumente em 1 conexão/Passo o deslocamento.', source: C('§57') }),
  weapon({
    id: 'bastao_misericordia',
    name: 'Bastão da Misericórdia',
    rarity: 'raro',
    proficiency: ['Sagrado'],
    focus: true,
    dice: ['espirito', 'determinacao'],
    dano: 1,
    cat: 'distancia',
    icon: 'item_staff',
    text: 'Espírito + Determinação, Dano 1, Distância. A primeira vez em cada Combate que uma Técnica sua restaurar HP de outro herói, restaure +1 HP.',
    source: C('§57'),
    onHealOther: (c, f) => {
      if (!canUse(f, 'combat', 'bastaoMis')) return 0;
      markUse(f, 'combat', 'bastaoMis');
      return 1;
    },
  }),
  weapon({
    id: 'martelo_sentenca',
    name: 'Martelo da Sentença',
    rarity: 'raro',
    proficiency: ['Sagrado', 'Marcial'],
    dice: ['poder', 'espirito'],
    dano: 2,
    cat: 'cac',
    icon: 'item_hammer',
    text: 'Uma vez por Ativação, ao acertar um alvo que já esteja Julgado ou Exposto, 1 Impulso → +1 Dano.',
    source: C('§57'),
    attackOptions: (c, f, a) => (a.weapon && (a.targetWasJulgado || a.targetWasExposto) && canUse(f, 'activation', 'sentenca') ? [imp('sentenca:dano', 'Martelo da Sentença: Impulso → +1 Dano')] : []),
    applyAttackOption: (c, f, a, r, opt, out) => {
      if (opt === 'sentenca:dano') {
        markUse(f, 'activation', 'sentenca');
        out.addDano += 1;
      }
    },
  }),
  weapon({
    id: 'adagas_vulto',
    name: 'Adagas do Vulto',
    rarity: 'raro',
    proficiency: ['Finesse'],
    dice: ['sombra', 'agilidade'],
    dano: 2,
    cat: 'cac',
    icon: 'item_dagger',
    text: 'Uma vez por Ativação, depois de resolver este Ataque, se você iniciou o Ataque Furtivo ou o alvo possuía ao menos 1 Brecha, 1 Impulso → Passo 1.',
    source: C('§57'),
    attackOptions: (c, f, a) => (a.weapon && (a.furtivoAtDeclare || a.targetHadBrecha) && canUse(f, 'activation', 'vulto') ? [imp('vulto:passo', 'Adagas do Vulto: Impulso → Passo 1', 1, false)] : []),
    afterAttackOption: (c, f, a, r, opt) => {
      if (opt === 'vulto:passo') {
        markUse(f, 'activation', 'vulto');
        pushOps(c, [{ op: 'step', figureId: f.id, steps: 1, ignoreEngagement: false, reason: 'Adagas do Vulto', origin: 'weapon' }], false);
      }
    },
  }),
];

// ============================================================================ armors (§22)
const COMMON_ARMOR: ItemDef[] = [
  armor({
    id: 'couro_reforcado',
    name: 'Couro Reforçado',
    rarity: 'comum',
    armor: 0,
    weight: 'leve',
    maxHpBonus: 1,
    text: 'Armadura 0, +1 HP máximo. Uma vez por Combate, quando uma rolagem sua produzir Impulso, gaste 1 Impulso para receber Guardado.',
    source: C('§22'),
    attackOptions: (c, f, a, r) => (r.impulsos > 0 && canUse(f, 'combat', 'couroRef') ? [imp('couroRef:guardado', 'Couro Reforçado: Impulso → Guardado', 1, false)] : []),
    afterAttackOption: (c, f, a, r, opt) => {
      if (opt === 'couroRef:guardado') {
        markUse(f, 'combat', 'couroRef');
        applyCondition(c, f, 'guardado', 1, f.id);
      }
    },
  }),
  armor({
    id: 'manto_viajante',
    name: 'Manto do Viajante',
    rarity: 'comum',
    armor: 0,
    weight: 'veste',
    text: 'Armadura 0. Uma vez por Combate, quando uma rolagem sua produzir Impulso, gaste 1 Impulso para Passo 2.',
    source: C('§22'),
    attackOptions: (c, f, a, r) => (r.impulsos > 0 && canUse(f, 'combat', 'mantoViaj') ? [imp('mantoViaj:passo', 'Manto do Viajante: Impulso → Passo 2', 1, false)] : []),
    afterAttackOption: (c, f, a, r, opt) => {
      if (opt === 'mantoViaj:passo') {
        markUse(f, 'combat', 'mantoViaj');
        pushOps(c, [{ op: 'step', figureId: f.id, steps: 2, ignoreEngagement: false, reason: 'Manto do Viajante' }], false);
      }
    },
  }),
  armor({
    id: 'gibao_batedor',
    name: 'Gibão do Batedor',
    rarity: 'comum',
    armor: 0,
    weight: 'leve',
    text: 'Armadura 0. Uma vez por Ciclo, ao terminar sua Ativação em Cobertura e sem estar Engajado, receba Guardado. WATCH de frequência.',
    source: W('§22'),
    onActivationEnd: (c, f) => {
      if (hasCover(c, f) && !isEngaged(f, c.S.figures) && canUse(f, 'cycle', 'gibao')) {
        markUse(f, 'cycle', 'gibao');
        applyCondition(c, f, 'guardado', 1, f.id);
      }
    },
  }),
  armor({ id: 'cota_escamas', name: 'Cota de Escamas', rarity: 'comum', armor: 1, weight: 'media', text: 'Armadura 1.', source: C('§22') }),
  armor({ id: 'cota_rebitada', name: 'Cota Rebitada', rarity: 'comum', armor: 1, weight: 'media', maxHpBonus: 1, noRapidStep: true, text: 'Armadura 1, +1 HP máximo; não recebe o Passo gratuito do Tempo Rápido. Uma vez por Ativação, em Tempo Rápido, se uma rolagem sua produzir Impulso, gaste 1 para Passo 1. WATCH.', source: W('§22'),
    attackOptions: (c, f, a, r) => (f.tempo === 'rapido' && r.impulsos > 0 && canUse(f, 'activation', 'rebitada') ? [imp('rebitada:passo', 'Cota Rebitada: Impulso → Passo 1', 1, false)] : []),
    afterAttackOption: (c, f, a, r, opt) => {
      if (opt === 'rebitada:passo') {
        markUse(f, 'activation', 'rebitada');
        pushOps(c, [{ op: 'step', figureId: f.id, steps: 1, ignoreEngagement: false, reason: 'Cota Rebitada' }], false);
      }
    },
  }),
  armor({ id: 'placas_campanha', name: 'Placas de Campanha', rarity: 'comum', armor: 1, weight: 'pesada', icon: 'item_armor_heavy', maxHpBonus: 2, noRapidStep: true, repositionExtraCostFirst: 1, text: 'Armadura 1, +2 HP máximo; não recebe o Passo gratuito do Tempo Rápido; primeiro Reposicionar voluntário de cada Ativação custa 2 AP.', source: C('§22') }),
];
const RARE_ARMOR: ItemDef[] = [
  armor({
    id: 'couraca_veterano',
    name: 'Couraça do Veterano',
    rarity: 'raro',
    armor: 1,
    weight: 'pesada',
    icon: 'item_armor_heavy',
    maxHpBonus: 1,
    text: 'Armadura 1, +1 HP máximo. Uma vez por Ciclo, depois de determinar o Dano final de um Ataque inimigo, se sua Defesa produziu Impulso, gaste 1 para reduzir o Dano final em 1; se sofreria 2 ou mais, reduza 2.',
    source: C('§22'),
    reduceEnemyDamage: (c, f, d, cur) => {
      if (cur <= 0 || (d.roll?.impulsos ?? 0) < 1 || !canUse(f, 'cycle', 'couraca')) return 0;
      markUse(f, 'cycle', 'couraca');
      log(c, 'item', `Couraça do Veterano reduz ${cur >= 2 ? 2 : 1} Dano.`);
      return cur >= 2 ? 2 : 1;
    },
  }),
  armor({
    id: 'couro_passo_livre',
    name: 'Couro do Passo Livre',
    rarity: 'raro',
    armor: 0,
    weight: 'leve',
    text: 'Armadura 0. Uma vez por Combate, depois de sofrer Dano de inimigo, Passo 2 ignorando custo extra de Engajamento.',
    source: C('§22'),
    afterDefense: (c, f, d, final) => {
      if (final > 0 && isActive(f) && canUse(f, 'combat', 'passoLivre')) {
        markUse(f, 'combat', 'passoLivre');
        pushOps(c, [{ op: 'step', figureId: f.id, steps: 2, ignoreEngagement: true, reason: 'Couro do Passo Livre' }], false);
      }
    },
  }),
  armor({
    id: 'manto_runico',
    name: 'Manto Rúnico',
    rarity: 'raro',
    armor: 0,
    weight: 'veste',
    icon: 'item_robe',
    text: 'Armadura 0. Uma vez por Ciclo, quando gastar Reação numa rolagem, adicione D4 (máximo 3 dados); se essa rolagem produzir Impulso, gaste 1 para receber Guardado.',
    source: C('§22'),
    applyReaction: (c, h, d) => {
      if (d.targetId === h.id && d.dice.length < 3 && canUse(h, 'cycle', 'mantoRunico')) {
        markUse(h, 'cycle', 'mantoRunico');
        d.dice.push({ grade: 4, source: 'Manto Rúnico' });
        c.S.flags[`__mantoRunico:${h.id}`] = true;
      }
    },
    afterDefense: (c, f, d) => {
      if (c.S.flags[`__mantoRunico:${f.id}`] && (d.roll?.impulsos ?? 0) > 0) applyCondition(c, f, 'guardado', 1, f.id);
      delete c.S.flags[`__mantoRunico:${f.id}`];
    },
  }),
  armor({ id: 'couro_escamas_negras', name: 'Couro de Escamas Negras', rarity: 'raro', armor: 1, weight: 'media', maxHpBonus: -1, text: 'Armadura 1, −1 HP máximo. Uma vez por Ciclo, quando uma rolagem sua produzir Impulso, gaste 1 para ativar até sua próxima Ativação: o primeiro Dano Direto que sofreria é reduzido em 1.', source: C('§22'),
    attackOptions: (c, f, a, r) => (r.impulsos > 0 && canUse(f, 'cycle', 'escamas') ? [imp('escamas:ativar', 'Escamas Negras: Impulso → reduzir próximo Dano Direto', 1, false)] : []),
    afterAttackOption: (c, f, a, r, opt) => {
      if (opt === 'escamas:ativar') {
        markUse(f, 'cycle', 'escamas');
        f.conditions.escamasNegras = true;
      }
    },
  }),
  armor({ id: 'malha_peregrino', name: 'Malha do Peregrino', rarity: 'raro', armor: 1, weight: 'media', text: 'Armadura 1. Uma vez por Ciclo, depois que uma Técnica realmente curar você/aliado Adjacente ou conceder Guardado a outro aliado Adjacente, receba Guardado.', source: H('§22', 'Q-MALHA: “uma Técnica” = Técnica do próprio portador.'),
    // Q-MALHA: only the wearer's own Técnicas count; heals that restore 0 HP and Guardado on yourself don't.
    onTechniqueHeal: (c, f, t, healed) => malhaGuard(c, f, healed > 0 && (t.id === f.id || adjacent(f, t))),
    onTechniqueGuard: (c, f, t) => malhaGuard(c, f, t.id !== f.id && adjacent(f, t)),
  }),
  armor({ id: 'bastiao_ferro', name: 'Bastião de Ferro', rarity: 'raro', armor: 1, weight: 'pesada', icon: 'item_armor_heavy', text: 'Armadura 1. Âncora: ao terminar a Ativação na Frente sem movimento voluntário, pode ficar Ancorado até sua próxima Ativação (sem movimento voluntário; o primeiro Ataque que causar Dano trata sua Armadura como 2). Movimento forçado encerra a Âncora.', source: C('§22'),
    onActivationEnd: (c, f) => {
      if (parseSector(f.sector).row === 'F' && (f.movedThisActivation ?? 0) === 0) {
        f.conditions.ancorado = true;
        f.conditions.ancoradoUsado = false;
        log(c, 'item', `${f.name} finca o Bastião de Ferro (Ancorado).`);
      }
    },
  }),
];

/** Malha do Peregrino: once per Cycle the wearer receives Guardado (not spent while already Guardado). */
function malhaGuard(c: Ctx, f: Figure, ok: boolean) {
  if (!ok || !isActive(f) || f.conditions.guardado || !canUse(f, 'cycle', 'malha')) return;
  markUse(f, 'cycle', 'malha');
  log(c, 'item', `Malha do Peregrino: ${f.name} recebe Guardado.`);
  applyCondition(c, f, 'guardado', 1, f.id);
}

export const MANTO: ItemDef = armor({
  id: 'manto_primeiro_caminho',
  name: 'Manto do Primeiro Caminho',
  rarity: 'epico',
  armor: 1,
  weight: 'leve',
  icon: 'item_cloak_epic',
  text: 'Armadura Leve, Armadura 1. No início do Combate escolha: CAMINHO — uma vez por Ciclo, depois de TROCAR ARMA, Passo 1. REFÚGIO — ao escolher, receba Guardado; uma vez por Ciclo, a primeira vez que seu Guardado for consumido, reduz 2 Dano em vez de 1.',
  source: C('§25'),
  onCombatStart: (c, f) => {
    pushOps(c, [{ op: 'call', fn: 'manto:prompt', args: { id: f.id } }], false);
  },
  onGuardConsumed: (c, f) => {
    if (f.manto === 'refugio' && canUse(f, 'cycle', 'refugio')) {
      markUse(f, 'cycle', 'refugio');
      return 1;
    }
    return 0;
  },
});

// ============================================================================ accessories (§23)
const COMMON_ACC: ItemDef[] = [
  acc({ id: 'botas_trilha', name: 'Botas de Trilha', rarity: 'comum', icon: 'item_accessory_boots', text: 'Uma vez por Combate, depois de Reposicionar, Passo 1; regras normais de Engajamento.', source: C('§23'),
    onMoved: (c, f, info) => {
      if (info.kind === 'reposicionar' && info.voluntary && canUse(f, 'combat', 'botas')) {
        markUse(f, 'combat', 'botas');
        pushOps(c, [{ op: 'step', figureId: f.id, steps: 1, ignoreEngagement: false, reason: 'Botas de Trilha' }], false);
      }
    },
  }),
  acc({ id: 'fivela_de_ferro', name: 'Fivela de Ferro', rarity: 'comum', icon: 'item_accessory_ring', text: 'Uma vez por Combate, quando um inimigo aplicar Empurrar/Puxar: ignore o movimento ou resolva-o; se realmente mover ao menos 1 conexão, receba Guardado.', source: C('§23') }),
  acc({ id: 'pingente_ambar', name: 'Pingente de Âmbar', rarity: 'comum', text: 'Uma vez por Dungeon, depois de beber o Cantil durante Combate: +1 HP de cura ou remova 1 Veneno/Sangramento/Queimando.', source: C('§23'),
    onCantil: (c, f) => {
      if ((f.dungeonUses?.['pingente'] ?? 0) >= 1) return;
      f.dungeonUses = { ...(f.dungeonUses ?? {}), pingente: 1 };
      const C2 = f.conditions;
      if (C2.veneno || C2.sangramento || C2.queimando) {
        if (C2.queimando) setCond(c, f, 'queimando', false);
        else if (C2.sangramento) C2.sangramento--;
        else C2.veneno--;
        log(c, 'item', 'Pingente de Âmbar remove uma Condição.');
      } else {
        f.hp = Math.min(f.maxHp, f.hp + 1);
        log(c, 'item', 'Pingente de Âmbar: +1 HP.');
      }
    },
  }),
  acc({ id: 'lente_bronze', name: 'Lente de Bronze', rarity: 'comum', icon: 'item_accessory_lens', text: 'Uma vez por Combate, depois de revelar Intenções, escolha inimigo visível; até o fim do Ciclo, antes do primeiro Ataque contra ele, aumente um dado em 1 Grau.', source: H('§23', 'Q-LENTE: simplificado — uma vez por Combate, +1 Grau no primeiro dado de um Ataque seu (opção pré-rolagem).'),
    preAttack: (c, f, a) => {
      if (a.pre.includes('lente') && canUse(f, 'combat', 'lente')) {
        markUse(f, 'combat', 'lente');
        a.dice = raiseLowest(a.dice, 1, 'Lente');
      }
    },
  }),
  acc({ id: 'kit_campo', name: 'Kit de Campo', rarity: 'comum', text: 'Uma vez por Combate, antes de Teste de Objetivo/Campo de Batalha seu ou de aliado Adjacente, adicione D6, máximo 3 dados.', source: C('§23') }),
  acc({ id: 'luvas_empunhadura', name: 'Luvas de Empunhadura', rarity: 'comum', text: 'Uma vez por Ativação, quando Empurrar/Puxar válido contra inimigo comum falhar apenas porque o destino está cheio, se a rolagem de origem produziu Impulso, gaste 1 para aplicar Exposto. Boss não conta.', source: H('§23', 'Q-LUVAS: “inimigo comum” = categoria Comum; o Impulso gasto é um que nenhuma opção da rolagem usou, gasto automaticamente.'),
    // Q-LUVAS: "inimigo comum" = enemy tier 'comum' (not Raro/Elite/Especial/Miniboss/Boss). The Impulso must be one of the
    // source roll's Impulsos left unspent by the chosen options; it is spent automatically (it would be lost otherwise).
    onForcedMoveBlocked: (c, f, t) => {
      if (t.side !== 'E' || !isActive(t) || t.isBoss || t.isMiniboss || reg().enemies[t.typeId]?.tier !== 'comum') return;
      if (!canUse(f, 'activation', 'luvas') || !spendUnspentImpulso(c, f)) return;
      markUse(f, 'activation', 'luvas');
      log(c, 'item', `Luvas de Empunhadura: ${f.name} gasta 1 Impulso e deixa ${t.name} Exposto.`);
      applyCondition(c, t, 'exposto', 1, f.id);
    },
  }),
  acc({ id: 'faixa_sobrevivente', name: 'Faixa do Sobrevivente', rarity: 'comum', text: 'Uma vez por Combate, quando Veneno/Sangramento/Queimando causar Dano Direto, reduza esse Dano em 1; a Condição continua.', source: H('§23', 'Q-FAIXA: automático no primeiro Dano Direto dessas Condições, antes do Guardado.'),
    // Q-FAIXA: applied automatically to the first such Dano Direto of the Combat (incl. Queimando reaplicado), before
    // Guardado (so a 1-Dano tick does not consume Guardado); the Condition is not removed.
    reduceConditionDamage: (c, f, cond, amount) => {
      if (amount <= 0 || !canUse(f, 'combat', 'faixa')) return 0;
      markUse(f, 'combat', 'faixa');
      log(c, 'item', `Faixa do Sobrevivente: ${f.name} reduz em 1 o Dano Direto de ${cond === 'veneno' ? 'Veneno' : cond === 'sangramento' ? 'Sangramento' : 'Queimando'}.`);
      return 1;
    },
  }),
  acc({ id: 'corda_gancho', name: 'Corda e Gancho', rarity: 'comum', text: 'Uma vez por Combate, para Objetivo/Interação de Campo de Batalha no mesmo Setor ou Adjacente, trate um Setor aliado conectado como Adjacente e pague o custo normal.', source: C('§23') }),
];
const RARE_ACC: ItemDef[] = [
  acc({ id: 'grevas_impeto', name: 'Grevas do Ímpeto', rarity: 'raro', icon: 'item_accessory_boots', text: 'Uma vez por Ciclo, o primeiro efeito de Habilidade de Classe ou Assinatura de Arma/Foco que conceder Passo 1 pode conceder Passo 2. Não melhora Passo já 2+, Passo Rápido, Acessório ou Armadura.', source: H('§23', 'Q-GREVAS: vale para o Passo 1 que o portador recebe (de qualquer Habilidade de Classe ou Assinatura de Arma/Foco); o primeiro do Ciclo consome o uso.'),
    // Q-GREVAS: "Assinatura de Arma/Foco" = the effect printed on a weapon/focus card (origin 'weapon'); "Habilidade de
    // Classe" = class techniques, passives, reactions, AMÉM and talents (origin 'class'). The first eligible Passo 1 the
    // wearer receives in the Cycle offers up to 2 connections (choosing 1 or not moving is allowed) and spends the use.
    stepBonus: (c, f, info) => {
      if (info.steps !== 1 || (info.origin !== 'class' && info.origin !== 'weapon') || !canUse(f, 'cycle', 'grevas')) return 0;
      markUse(f, 'cycle', 'grevas');
      log(c, 'item', `Grevas do Ímpeto: o Passo 1 de ${f.name} (${info.reason}) pode ser Passo 2.`);
      return 1;
    },
  }),
  acc({ id: 'anel_julgamento', name: 'Anel do Julgamento', rarity: 'raro', icon: 'item_accessory_ring', text: 'Uma vez por Ciclo, depois de Ataque que cause Dano contra inimigo que já estava Exposto/Quebrado, receba Guardado. Afinidade Paladino: se o alvo estiver Julgado, pode dar esse Guardado a aliado Adjacente.', source: C('§23'),
    afterAttack: (c, f, a, r, out) => {
      const m = isMain(a, out);
      if (m && m.final > 0 && (a.targetWasExposto || a.targetWasQuebrado) && canUse(f, 'cycle', 'anelJulg')) {
        markUse(f, 'cycle', 'anelJulg');
        applyCondition(c, f, 'guardado', 1, f.id);
      }
    },
  }),
  acc({ id: 'icone_mae_velada', name: 'Ícone da Mãe Velada', rarity: 'raro', text: 'Uma vez por Combate, depois do Cantil, você ou aliado Adjacente recebe Guardado. Afinidade Clérigo: primeira Técnica do Combate que realmente curar recupera +1 HP.', source: C('§23'),
    onCantil: (c, f) => {
      if (canUse(f, 'combat', 'icone')) {
        markUse(f, 'combat', 'icone');
        applyCondition(c, f, 'guardado', 1, f.id);
      }
    },
    onHealOther: (c, f) => {
      if (f.typeId !== 'clerigo' || !canUse(f, 'combat', 'iconeCura')) return 0;
      markUse(f, 'combat', 'iconeCura');
      return 1;
    },
  }),
  acc({ id: 'lente_runica', name: 'Lente Rúnica', rarity: 'raro', icon: 'item_accessory_lens', text: 'Uma vez por Combate, antes de Teste de Controle/Objetivo/Campo de Batalha seu, adicione D8 (máximo 3 dados). Afinidade Arcanista: em Teste de Controle, use D10.', source: C('§23'),
    preAttack: (c, f, a) => {
      if (a.control && !a.data['support'] && a.dice.length < 3 && canUse(f, 'combat', 'lenteRunica')) {
        markUse(f, 'combat', 'lenteRunica');
        a.dice.push({ grade: f.typeId === 'arcanista' ? 10 : 8, source: 'Lente Rúnica' });
      }
    },
  }),
  acc({ id: 'aljava_serrilhada', name: 'Aljava Serrilhada', rarity: 'raro', text: 'Uma vez por Ciclo, depois de Ataque com arma de Arco que causar Dano, se a rolagem produziu Impulso, gaste 1 para Sangramento 1. Afinidade Arqueiro: primeira vez por Combate na Faixa Ideal, ganhe 1 Mira.', source: C('§23'),
    attackOptions: (c, f, a) => (a.weapon && a.school === 'arrow' && canUse(f, 'cycle', 'aljava') ? [imp('aljava:sangrar', 'Aljava Serrilhada: Impulso → Sangramento 1')] : []),
    afterAttackOption: (c, f, a, r, opt, out) => {
      const m = isMain(a, out);
      const t = tryFig(c, a.targetId);
      if (opt !== 'aljava:sangrar' || !m || m.final <= 0 || !t || !isActive(t)) return;
      markUse(f, 'cycle', 'aljava');
      applyCondition(c, t, 'sangramento', 1, f.id);
      if (f.typeId === 'arqueiro' && inIdeal(f, t) && canUse(f, 'combat', 'aljavaMira') && f.res) {
        markUse(f, 'combat', 'aljavaMira');
        f.res.mira = Math.min(3, f.res.mira + 1);
      }
    },
  }),
  acc({ id: 'estojo_arrombador', name: 'Estojo do Arrombador', rarity: 'raro', text: 'Uma vez por Combate, depois de falha sua ou de aliado Adjacente em Teste de Objetivo/Campo de Batalha, rerrole 1 dado e aceite o novo resultado. Afinidade Ladino: se o Teste for seu, rerrole até 2 dados.', source: C('§23') }),
  acc({ id: 'broche_abrigo', name: 'Broche do Abrigo', rarity: 'raro', text: 'Uma vez por Ciclo, depois que Guardado for consumido reduzindo Dano inimigo, Passo 1; regras normais de Engajamento.', source: C('§23'),
    onGuardConsumed: (c, f) => {
      if (canUse(f, 'cycle', 'broche') && isActive(f)) {
        markUse(f, 'cycle', 'broche');
        pushOps(c, [{ op: 'step', figureId: f.id, steps: 1, ignoreEngagement: false, reason: 'Broche do Abrigo' }], false);
      }
      return 0;
    },
  }),
  acc({ id: 'talisma_ultimo_passo', name: 'Talismã do Último Passo', rarity: 'raro', text: 'Uma vez por Combate, no início da sua Ativação com 3 HP ou menos, Passo 2 ignorando custo extra de Engajamento; se terminar na Retaguarda não Engajado, receba Guardado.', source: C('§23'),
    onActivationStart: (c, f) => {
      if (f.hp <= 3 && canUse(f, 'combat', 'talisma')) {
        markUse(f, 'combat', 'talisma');
        pushOps(c, [{ op: 'step', figureId: f.id, steps: 2, ignoreEngagement: true, reason: 'Talismã do Último Passo' }, { op: 'call', fn: 'talisma:check', args: { id: f.id } }], false);
      }
    },
  }),
];

// ============================================================================ consumables (§24)
function consumable(id: string, name: string, price: number, text: string, icon: string, def: ItemDef['consumable']): ItemDef {
  return { id, name, slot: 'consumable', rarity: 'comum', price, text, source: C('§24'), icon, implemented: true, consumable: def };
}
export const CONSUMABLES: ItemDef[] = [
  consumable('antidoto', 'Antídoto', 2, '1 AP — você ou aliado Adjacente. Remova todo Veneno do alvo. Fora de Combate: sem AP.', 'item_consumable_vial', {
    timing: 'ap1',
    outOfCombat: true,
    targeting: { type: 'ally', range: 'selfOrAdjacent' },
    execute: (c, f, cmd) => {
      const t = tryFig(c, cmd.targetIds![0])!;
      t.conditions.veneno = 0;
      c.events.push({ type: 'condition', targetId: t.id, condition: 'veneno', added: false });
      log(c, 'item', `Antídoto: ${t.name} livre de Veneno.`);
    },
  }),
  consumable('bandagem', 'Bandagem Compressiva', 2, '1 AP — você ou aliado Adjacente. Remova até 2 Sangramentos. Fora de Combate: sem AP.', 'item_bandage', {
    timing: 'ap1',
    outOfCombat: true,
    targeting: { type: 'ally', range: 'selfOrAdjacent' },
    execute: (c, f, cmd) => {
      const t = tryFig(c, cmd.targetIds![0])!;
      t.conditions.sangramento = Math.max(0, t.conditions.sangramento - 2);
      c.events.push({ type: 'condition', targetId: t.id, condition: 'sangramento', added: false });
      log(c, 'item', `Bandagem: Sangramento de ${t.name} estancado.`);
    },
  }),
  consumable('unguento', 'Unguento Contra Chamas', 2, '1 AP — você ou aliado Adjacente. Remova Queimando; até o fim do Ciclo, o alvo não pode receber Queimando.', 'item_consumable_vial', {
    timing: 'ap1',
    outOfCombat: true,
    targeting: { type: 'ally', range: 'selfOrAdjacent' },
    execute: (c, f, cmd) => {
      const t = tryFig(c, cmd.targetIds![0])!;
      setCond(c, t, 'queimando', false);
      t.conditions.imuneQueimando = true;
    },
  }),
  consumable('acido', 'Frasco de Ácido', 3, '1 AP — Distância. Escolha 1 inimigo válido. Aplique Quebrado. Não causa Dano.', 'item_consumable_vial', {
    timing: 'ap1',
    targeting: { type: 'enemy', reach: 'distancia' },
    execute: (c, f, cmd) => applyCondition(c, tryFig(c, cmd.targetIds![0])!, 'quebrado', 1, f.id),
  }),
  consumable('fogo_alquimico', 'Fogo Alquímico', 3, '1 AP — Distância. Escolha 1 inimigo válido. Aplique Queimando.', 'item_bomb', {
    timing: 'ap1',
    targeting: { type: 'enemy', reach: 'distancia' },
    execute: (c, f, cmd) => applyCondition(c, tryFig(c, cmd.targetIds![0])!, 'queimando', 1, f.id),
  }),
  consumable('bomba_fumaca', 'Bomba de Fumaça', 4, '1 AP — Alcance; Área 2 Setores. Fumaça até o fim do Ciclo: concede Cobertura. Ladino num desses Setores sem inimigo Adjacente fica Furtivo.', 'item_bomb', {
    timing: 'ap1',
    targeting: { type: 'area2', side: 'H' },
    execute: (c, f, cmd) => {
      pushOps(c, [{ op: 'smoke', sectors: cmd.sectors!, until: { kind: 'endOfCycle' }, sourceId: f.id }, { op: 'call', fn: 'smoke:rogueCheck', args: { sectors: cmd.sectors } }], false);
    },
  }),
  consumable('oleo_afiacao', 'Óleo de Afiação', 3, 'Gratuito, antes de um Ataque com Arma equipada: +1 Dano. Não se aplica a Focos.', 'item_consumable_vial', { timing: 'free-pre-attack', targeting: { type: 'none' } }),
  consumable('tonico_foco', 'Tônico de Foco', 3, 'Gratuito, antes de uma rolagem sua: aumente 1 dado em 1 Grau (máximo D12).', 'item_consumable_vial', { timing: 'free-pre-roll', targeting: { type: 'none' } }),
  consumable('po_cegante', 'Pó Cegante', 3, '1 AP — Alcance. Escolha 1 inimigo válido. Aplique Exposto.', 'item_consumable_vial', {
    timing: 'ap1',
    targeting: { type: 'enemy', reach: 'alcance' },
    execute: (c, f, cmd) => applyCondition(c, tryFig(c, cmd.targetIds![0])!, 'exposto', 1, f.id),
  }),
  consumable('selo_resistencia', 'Selo de Resistência', 4, 'Reativo — sem AP e sem Reação. Ao receber Atordoado ou Imobilizado, descarte para cancelar apenas essa Condição.', 'item_scroll', { timing: 'reactive', targeting: { type: 'none' } }),
];

/** Óleo/Tônico pre-roll consumption: invoked by a global preAttack hook through the class registry. */
export function applyPreRollConsumables(c: Ctx, f: Figure, a: { pre: string[]; weapon: boolean; dice: { grade: any; source: string }[]; bonusDano: number }) {
  for (const p of a.pre) {
    if (!p.startsWith('oleo:') && !p.startsWith('tonico:')) continue;
    const uid = p.split(':')[1];
    const idx = f.backpack?.findIndex((i) => i.uid === uid) ?? -1;
    if (idx < 0) continue;
    if (!canUse(f, 'activation', 'consumivel')) continue;
    const it = f.backpack![idx];
    if (p.startsWith('oleo:') && it.itemId === 'oleo_afiacao' && a.weapon) {
      markUse(f, 'activation', 'consumivel');
      f.backpack!.splice(idx, 1);
      a.bonusDano += 1;
      log(c, 'item', 'Óleo de Afiação: +1 Dano.');
    }
    if (p.startsWith('tonico:') && it.itemId === 'tonico_foco') {
      markUse(f, 'activation', 'consumivel');
      f.backpack!.splice(idx, 1);
      a.dice = raiseLowest(a.dice as any, 1, 'Tônico');
      log(c, 'item', 'Tônico de Foco: +1 Grau.');
    }
  }
}

/** One action per consumable in the backpack (max 1 Consumível per Activation, §24). */
export function consumableActions(): ActionDef[] {
  return CONSUMABLES.filter((d) => d.consumable?.timing === 'ap1').map((d) => ({
    id: `usar:${d.id}`,
    name: d.name,
    ap: 1,
    kind: 'utility' as const,
    icon: d.icon,
    text: d.text,
    source: d.source,
    targeting: d.consumable!.targeting,
    hidden: (c, f) => !f.backpack?.some((i) => i.itemId === d.id),
    available: (c, f) => (!canUse(f, 'activation', 'consumivel') ? 'Máximo 1 Consumível por Ativação.' : null),
    execute: (c, f, cmd) => {
      const idx = f.backpack!.findIndex((i) => i.itemId === d.id);
      f.backpack!.splice(idx, 1);
      markUse(f, 'activation', 'consumivel');
      log(c, 'item', `${f.name} usa ${d.name}.`);
      d.consumable!.execute!(c, f, cmd);
    },
  }));
}

export const ITEMS: ItemDef[] = [...STARTING, ...STARTING_ARMOR, ...COMMON_WEAPONS, ...RARE_WEAPONS, ...COMMON_ARMOR, ...RARE_ARMOR, MANTO, ...COMMON_ACC, ...RARE_ACC, ...CONSUMABLES];

export const LOOT_POOLS = {
  comum: [...COMMON_WEAPONS, ...COMMON_ARMOR, ...COMMON_ACC].map((i) => i.id),
  raro: [...RARE_WEAPONS, ...RARE_ARMOR, ...RARE_ACC].map((i) => i.id),
  /** §56: 4 copies of each of the 10 Consumables = 40 cards. */
  consumivel: CONSUMABLES.flatMap((i) => [i.id, i.id, i.id, i.id]),
};

export const ITEM_HANDLERS: Record<string, (c: Ctx, a: Record<string, unknown>) => void> = {
  'manto:prompt': (c, a) => {
    const f = tryFig(c, a.id as string);
    if (!f) return;
    c.S.pending = {
      id: `p-manto-${f.id}-${c.S.nextId++}`,
      controllers: [f.id],
      kind: 'choice',
      prompt: `${f.name} — Manto do Primeiro Caminho: escolha para todo o Combate.`,
      figureId: f.id,
      handler: 'manto:choose',
      options: [
        { id: 'caminho', label: 'CAMINHO', detail: 'Uma vez por Ciclo, depois de TROCAR ARMA, Passo 1.' },
        { id: 'refugio', label: 'REFÚGIO', detail: 'Receba Guardado agora; uma vez por Ciclo seu Guardado reduz 2 Dano.' },
      ],
      args: {},
    };
  },
  'manto:choose': (c, a) => {
    const f = tryFig(c, a.figureId as string)!;
    f.manto = a.optionId as 'caminho' | 'refugio';
    log(c, 'item', `${f.name} veste o Manto: ${f.manto === 'caminho' ? 'CAMINHO' : 'REFÚGIO'}.`);
    if (f.manto === 'refugio') applyCondition(c, f, 'guardado', 1, f.id);
  },
  'smoke:rogueCheck': (c, a) => {
    const sectors = a.sectors as string[];
    for (const h of heroes(c)) if (h.typeId === 'ladino' && sectors.includes(h.sector) && !enemies(c).some((e) => adjacent(e, h))) applyCondition(c, h, 'furtivo', 1, h.id);
  },
  'couroCacador:check': (c, a) => {
    const f = tryFig(c, a.id as string);
    if (f && f.sector !== a.from) markUse(f, 'combat', 'couroCacador');
  },
  'cetro:step': (c, a) => {
    const f = tryFig(c, a.id as string);
    if (!f || !isActive(f)) return;
    const opts = heroes(c).filter((h) => stepDestinations(c, h, 1, false).length);
    if (!opts.length) return;
    c.S.pending = {
      id: `p-cetro-${f.id}-${c.S.nextId++}`,
      controllers: [f.id],
      kind: 'choice',
      prompt: 'Cetro do Peregrino: você ou um herói faz Passo 1.',
      figureId: f.id,
      handler: 'cetro:pick',
      options: [{ id: 'none', label: 'Não usar' }, ...opts.map((h) => ({ id: h.id, label: h.name }))],
      args: {},
    };
  },
  'cetro:pick': (c, a) => {
    if (a.optionId === 'none') return;
    pushOps(c, [{ op: 'step', figureId: a.optionId as string, steps: 1, ignoreEngagement: false, reason: 'Cetro do Peregrino', origin: 'weapon' }]);
  },
  'talisma:check': (c, a) => {
    const f = tryFig(c, a.id as string);
    if (f && isActive(f) && parseSector(f.sector).row === 'R' && !isEngaged(f, c.S.figures)) applyCondition(c, f, 'guardado', 1, f.id);
  },
  'ladino:tryHide': (c, a) => {
    const f = tryFig(c, a.id as string);
    if (!f) return;
    const p = parseSector(f.sector);
    const noAdj = !enemies(c).some((e) => adjacent(e, f));
    const ok = noAdj && (hasCover(c, f) || (p.row === 'R' && (heroes(c).some((h) => h.id !== f.id && h.sector === sk('H', 'F', p.col)) || !enemies(c).some((e) => e.sector === sk('E', 'F', p.col)))));
    if (ok) applyCondition(c, f, 'furtivo', 1, f.id);
  },
};
