/**
 * Árvores de Talentos V2 (§18, §29). T1 is available early (first point arrives after Dungeon 1);
 * T2 after Dungeon 3, T3 after Dungeon 5, T4 after Dungeon 7. T1 talents are implemented in the engine.
 * T2–T4 are catalogued with canonical text and flagged `implemented: false` until the campaign reaches them
 * (several T2–T4 already have engine hooks by id, e.g. Guarda Experiente, Ponta Bodkin, Julgamento Final).
 */
import {
  applyCondition,
  canTarget,
  enemies,
  heal,
  heroMove,
  isActive,
  log,
  newId,
  pushOps,
  startHeroAttack,
  type ActionDef,
  type Ctx,
  type TalentDef,
  type Verse,
} from '@mosteiro/core';
import { diceOf, weaponAttack } from './common';

const C = (section: string) => ({ section, status: 'CANONICO' as const });

function t(classId: string, path: string, tier: 1 | 2 | 3 | 4, id: string, name: string, text: string, implemented: boolean, extra: Partial<TalentDef> = {}): TalentDef {
  return { id, classId, path, tier, name, text, implemented, source: C(`§18 ${classId} — ${path} T${tier}`), ...extra };
}

// ---------------------------------------------------------------- T1 actions
const investida: ActionDef = {
  id: 'g_investida',
  name: 'Investida',
  tier: 'I',
  ap: 2,
  kind: 'attack',
  icon: 'act_attack_melee',
  text: '2 AP; Passo até 2; depois Ataque Corpo a Corpo Poder + Agilidade, Dano 2; acerto inicia Sequência I; Impulso Passo 1.',
  source: C('§18.1 Vanguarda T1'),
  targeting: { type: 'move', steps: 2, ignoreEngagement: false },
  execute: (c, f, cmd) => {
    heroMove(c, f, cmd.sector!, { kind: 'passo', ignoreEngagement: false });
    const list = enemies(c).filter((e) => canTarget(f.sector, e, 'cac', c.S.figures, 'H'));
    if (!list.length) {
      log(c, 'attack', 'Investida: nenhum alvo Corpo a Corpo após o Passo.');
      return;
    }
    c.S.pending = {
      id: newId(c, 'p'),
      controllers: [f.id],
      kind: 'choice',
      prompt: 'Investida: escolha o alvo Corpo a Corpo.',
      figureId: f.id,
      handler: 'talent:investidaAttack',
      options: list.map((e) => ({ id: e.id, label: e.name, detail: e.sector })),
      args: { pre: cmd.pre ?? [] },
    };
  },
  attackOptions: () => [{ id: 'g_inv:passo', label: 'Impulso: Passo 1', source: '', cost: { impulso: 1 } }],
  afterAttackOption: (c, f, a, r, opt) => {
    if (opt === 'g_inv:passo') pushOps(c, [{ op: 'step', figureId: f.id, steps: 1, ignoreEngagement: false, reason: 'Investida', origin: 'class' }], false);
  },
  onResolve: (c, f, a, r, out) => {
    if (out.hit && f.res) {
      f.res.sequencia = 1;
      f.res.seqAdvanced = true;
      c.events.push({ type: 'resource', figureId: f.id, resource: 'sequencia', value: 1 });
    }
  },
};
const segundoFolego: ActionDef = {
  id: 'g_segundo_folego',
  name: 'Segundo Fôlego',
  ap: 1,
  kind: 'support',
  icon: 'act_heal',
  text: '1 AP, uma vez por Dungeon; cure 3 e remova Sangramento 1; não enquanto Caído.',
  source: C('§18.1 Veterano T1'),
  targeting: { type: 'none' },
  limit: 'dungeon',
  execute: (c, f) => {
    heal(c, f, 3, f.id);
    if (f.conditions.sangramento > 0) f.conditions.sangramento--;
  },
};
const golpeRuptura: ActionDef = {
  id: 'g_ruptura',
  name: 'Golpe de Ruptura',
  tier: 'II',
  ap: 2,
  kind: 'attack',
  icon: 'act_attack_melee',
  text: '2 AP; Poder + Determinação, Dano 2. Ligada de I e acertando: Sequência II e Quebrado depois do Dano.',
  source: C('§18.1 Executor T1'),
  targeting: { type: 'enemy', reach: 'weapon' },
  execute: (c, f, cmd) => weaponAttack(c, f, cmd, { techId: 'g_ruptura', name: 'Golpe de Ruptura', dice: ['poder', 'determinacao'], dano: 2, data: { linked: (f.res?.sequencia ?? 0) === 1 } }),
  onResolve: (c, f, a, r, out) => {
    if (!out.hit || !a.data['linked'] || !f.res) return;
    f.res.sequencia = 2;
    f.res.seqAdvanced = true;
    c.events.push({ type: 'resource', figureId: f.id, resource: 'sequencia', value: 2 });
    const tg = c.S.figures.find((x) => x.id === a.targetId);
    if (tg && isActive(tg)) applyCondition(c, tg, 'quebrado', 1, f.id);
  },
};
const golpeVeredito: ActionDef = {
  id: 'p_veredito',
  name: 'Golpe do Veredito',
  ap: 2,
  kind: 'attack',
  icon: 'act_attack_melee',
  text: '2 AP, Poder + Espírito, Dano 2; contra Julgado sem Smite, Impulso aplica Quebrado depois do Dano.',
  source: C('§18.2 Julgamento T1'),
  targeting: { type: 'enemy', reach: 'weapon' },
  execute: (c, f, cmd) => weaponAttack(c, f, cmd, { techId: 'p_veredito', name: 'Golpe do Veredito', dice: ['poder', 'espirito'], dano: 2, school: 'holy' }),
  attackOptions: (c, f, a) => (a.targetWasJulgado ? [{ id: 'p_ver:quebrado', label: 'Impulso (sem Smite): Quebrado depois do Dano', source: '', cost: { impulso: 1 }, requiresHit: true }] : []),
  afterAttackOption: (c, f, a, r, opt, out) => {
    if (opt !== 'p_ver:quebrado' || !out.hit || out.spent.includes('smite')) return;
    const tg = c.S.figures.find((x) => x.id === a.targetId);
    if (tg && isActive(tg)) applyCondition(c, tg, 'quebrado', 1, f.id);
  },
};
const refrao: ActionDef = {
  id: 'c_refrao',
  name: 'Refrão',
  ap: 1,
  kind: 'support',
  icon: 'verso',
  text: 'Uma vez por Combate, depois do Verso gratuito, pague 1 AP para colocar um segundo Verso do mesmo tipo.',
  source: C('§18.4 Liturgista T1'),
  targeting: { type: 'none' },
  limit: 'combat',
  available: (c, f) => {
    const l = f.res?.liturgia ?? [];
    return !l.length ? 'Nenhum Verso colocado.' : l.length >= 3 ? 'Liturgia completa.' : null;
  },
  execute: (c, f) => {
    const l = f.res!.liturgia;
    l.push(l[l.length - 1] as Verse);
    log(c, 'resource', `${f.name}: Refrão (${l.length}/3).`);
  },
};
const passosLeves: ActionDef = {
  id: 'ar_passo_leve',
  name: 'Passo do Caçador',
  ap: 1,
  kind: 'move',
  icon: 'act_passo',
  text: 'Passos Leves: Passo 3, ignora custo adicional de Engajamento, não reduz Mira e pode atravessar aliado.',
  source: C('§18.5 Caçador T1'),
  targeting: { type: 'move', steps: 3, ignoreEngagement: true },
  execute: (c, f, cmd) => heroMove(c, f, cmd.sector!, { kind: 'passo', ignoreEngagement: true }),
};
const passosFantasmas: ActionDef = {
  id: 'l_passo_fantasma',
  name: 'Passo Sombrio',
  ap: 1,
  kind: 'move',
  icon: 'act_passo',
  text: 'Passos Fantasmas: Passo 3 ignorando Engajamento; atravessa aliados e inimigos comuns. Se terminar atendendo Esconder-se, fique Furtivo.',
  source: C('§18.6 Sombra T1'),
  targeting: { type: 'move', steps: 3, ignoreEngagement: true },
  execute: (c, f, cmd) => {
    heroMove(c, f, cmd.sector!, { kind: 'passo', ignoreEngagement: true });
    pushOps(c, [{ op: 'call', fn: 'ladino:tryHide', args: { id: f.id } }], false);
  },
};

export const TALENTS: TalentDef[] = [
  // ---- Guerreiro
  t('guerreiro', 'vanguarda', 1, 'g_investida_t', 'Investida I', investida.text, true, { actions: [investida] }),
  t('guerreiro', 'vanguarda', 2, 'g_arco_aco', 'Arco de Aço II', '2 AP; ataque até dois inimigos na Frente adversária da sua coluna ou coluna adjacente. Dano 1 em cada; se ligada a I, Dano 2 em cada e Sequência II.', false),
  t('guerreiro', 'vanguarda', 3, 'g_avanco', 'Avanço Implacável', 'Primeira vez por Ativação que derrotar inimigo, Passo 2 e Guardado.', false),
  t('guerreiro', 'vanguarda', 4, 'g_fluxo', 'Fluxo da Batalha', 'Uma vez por Ativação, técnica ligada que derrota inimigo concede +1 AP temporário apenas para Reposicionar, Trocar ou técnica de 1 AP.', false),
  t('guerreiro', 'veterano', 1, 'g_segundo_folego_t', 'Segundo Fôlego', segundoFolego.text, true, { actions: [segundoFolego] }),
  t('guerreiro', 'veterano', 2, 'g_guarda_experiente', 'Guarda Experiente', 'Riposta também pode ativar se o Ataque Corpo a Corpo causar exatamente 1 Dano final.', false),
  t('guerreiro', 'veterano', 3, 'g_finta_mestre', 'Finta do Mestre II', '1 AP; inimigo Adjacente fica Exposto; se Sequência I, avance para II.', false),
  t('guerreiro', 'veterano', 4, 'g_mestre_aco', 'Mestre do Aço', 'Técnicas II e III ligadas aumentam o menor dado de Ataque em 1 Grau.', false),
  t('guerreiro', 'executor', 1, 'g_ruptura_t', 'Golpe de Ruptura II', golpeRuptura.text, true, { actions: [golpeRuptura] }),
  t('guerreiro', 'executor', 2, 'g_ferida', 'Ferida Profunda', 'Uma vez por Ativação, quando aplicar Quebrado, aplique também Sangramento 1.', false),
  t('guerreiro', 'executor', 3, 'g_corte_executor', 'Corte do Executor III', '2 AP; Poder + Precisão, Dano 3. Ligada de II contra Quebrado ou Sangrando: +1 Dano e ignore 1 Armadura; depois zera.', false),
  t('guerreiro', 'executor', 4, 'g_sem_misericordia', 'Sem Misericórdia', 'Finalizador ligado contra alvo Quebrado recebe +2 Dano.', false),
  // ---- Paladino
  t('paladino', 'bastiao', 1, 'p_escudo_fe', 'Escudo da Fé', 'Quando Égide produzir Impulso, depois do Ataque o protegido recebe Guardado.', true, {
    afterEgide: (c: Ctx, p: any, d: any, r: any) => {
      if (r.impulsos > 0) pushOps(c, [{ op: 'guard', targetIds: [d.targetId], sourceId: p.id }], false);
    },
  } as any),
  t('paladino', 'bastiao', 2, 'p_intercessao_sagrada', 'Intercessão Sagrada', 'Aumenta o alcance de suporte da Égide; depois de usá-la em aliado, Passo 1 em direção a ele.', false),
  t('paladino', 'bastiao', 3, 'p_nao_cairas', 'Não Cairás', 'Uma vez por Dungeon, se alvo protegido por Égide cairia a 0, gaste 2 Convicções; ele fica com 1 HP e não cai.', false),
  t('paladino', 'bastiao', 4, 'p_egide_incessante', 'Égide Incessante', 'Depois de gastar sua Reação, pode usar Égide uma segunda vez no mesmo Ciclo pagando 1 Convicção; essa segunda Égide não gera Convicção.', false),
  t('paladino', 'julgamento', 1, 'p_veredito_t', 'Golpe do Veredito', golpeVeredito.text, true, { actions: [golpeVeredito] }),
  t('paladino', 'julgamento', 2, 'p_julgamento_implacavel', 'Julgamento Implacável', 'Quando o Julgado morrer, uma vez por Ciclo marque imediatamente outro inimigo visível como Julgado.', false),
  t('paladino', 'julgamento', 3, 'p_martelo_veredito', 'Martelo do Veredito', '2 AP, Poder + Determinação, Dano 3; contra Julgado, gaste até 2 Convicções; cada uma +1 Dano.', false),
  t('paladino', 'julgamento', 4, 'p_julgamento_final', 'Julgamento Final', 'Contra Julgado com metade ou menos do HP, Smite também ignora 1 Armadura.', false),
  t('paladino', 'graca', 1, 'p_maos_misericordiosas', 'Mãos Misericordiosas', 'Imposição das Mãos cura 3 com 1 Convicção ou 5 com 2.', true),
  t('paladino', 'graca', 2, 'p_toque_purificador', 'Toque Purificador', 'Ao usar Imposição, pague +1 Convicção para remover Veneno, Sangramento ou Queimando.', false),
  t('paladino', 'graca', 3, 'p_graca_compartilhada', 'Graça Compartilhada', '2 AP, 2 Convicções; até 2 personagens em alcance de suporte curam 2 cada.', false),
  t('paladino', 'graca', 4, 'p_farol', 'Farol da Esperança', 'Uma vez por Dungeon, 2 AP, 3 Convicções; você e aliados em alcance de suporte curam 2 e recebem Guardado.', false),
  // ---- Arcanista
  t('arcanista', 'evocador', 1, 'a_destruicao_focada', 'Destruição Focada', 'Uma vez por Ativação, Ruína com Impulso pode gastar 1 Impulso para +1 Dano; não acumula com opção idêntica.', true),
  t('arcanista', 'evocador', 2, 'a_fratura_arcana', 'Fratura Arcana', 'Ruína contra Quebrado ou Exposto ignora 1 Armadura.', false),
  t('arcanista', 'evocador', 3, 'a_reacao_cadeia', 'Reação em Cadeia', 'Uma vez por Ativação, se Ruína derrotar inimigo, outro inimigo Adjacente sofre 1 Dano Direto.', false),
  t('arcanista', 'evocador', 4, 'a_cataclismo', 'Equação do Cataclismo', 'Uma vez por Combate, antes de Ruína, +2 Instabilidade; aumente ambos os dados do feitiço em 1 Grau e +2 Dano.', false),
  t('arcanista', 'geometra', 1, 'a_inscricao_distante', 'Inscrição Distante', 'Aumenta o alcance funcional de colocação de Sigilos em Formação (qualquer coluna).', true),
  t('arcanista', 'geometra', 2, 'a_vinculo_camadas', 'Vínculo em Camadas', 'Controle com 2+ Sucessos também aplica Exposto; se o efeito já aplicaria Exposto, aplique Quebrado.', false),
  t('arcanista', 'geometra', 3, 'a_selo_persistente', 'Selo Persistente', 'Selo de Estase pode ativar duas vezes; após a primeira fica Enfraquecido.', false),
  t('arcanista', 'geometra', 4, 'a_mestre_geometria', 'Mestre da Geometria', 'Mantenha 2 Sigilos ativos; uma vez por Ativação o primeiro Sigilo custa 1 AP a menos, mínimo 1.', false),
  t('arcanista', 'tecelao', 1, 'a_canalizacao_estavel', 'Canalização Estável', 'Canalizar recupera 1 Runa e reduz Instabilidade em 1.', true),
  t('arcanista', 'tecelao', 2, 'a_eco_runico', 'Eco Rúnico', 'Uma vez por Ativação, magia com duas Runas Prontas e 2+ Impulsos recupera uma das Runas usadas.', false),
  t('arcanista', 'tecelao', 3, 'a_dobra_superior', 'Dobra Superior', 'Efeitos de Transposição ganham +1 conexão/Passo de alcance ou deslocamento, respeitando limites especiais.', false),
  t('arcanista', 'tecelao', 4, 'a_tecelao_perfeito', 'Tecelão Perfeito', 'No início da Ativação, recupere 2 Runas Esgotadas em vez de 1.', false),
  // ---- Clérigo
  t('clerigo', 'misericordia', 1, 'c_graca_feridos', 'Graça aos Feridos', 'Uma vez por Ativação, ao curar alvo com metade ou menos do HP, +1 cura; não Cantil.', true),
  t('clerigo', 'misericordia', 2, 'c_purificacao', 'Purificação', 'Prece pode remover Queimando; com 2 Impulsos remova até duas Condições permitidas.', false),
  t('clerigo', 'misericordia', 3, 'c_mao_que_levanta', 'Mão que Levanta', 'Chamado à Vida, 2 AP; levante Caído com Trauma normal e 35% do HP máximo atual em vez de 25%.', false),
  t('clerigo', 'misericordia', 4, 'c_milagre_misericordia', 'Milagre da Misericórdia', 'Uma vez por Dungeon, ao resolver Milagre de Misericórdia, levante um herói Caído na zona de suporte com 25% e Trauma normal.', false),
  t('clerigo', 'vigilia', 1, 'c_intercessao_firme', 'Intercessão Firme', 'Intercessão bem-sucedida também dá Guardado ao protegido.', true),
  t('clerigo', 'vigilia', 2, 'c_vigilia_distante', 'Vigília Distante', 'Amplia a zona/alcance funcional de Intercessão e Bênção conforme Formação.', false),
  t('clerigo', 'vigilia', 3, 'c_solo_consagrado', 'Solo Consagrado', '2 AP; escolha Setor da zona de suporte; ele e os Setores heroicos ortogonalmente conectados: o primeiro Ataque que atingir cada herói ali encontra +1 Armadura, até sua próxima Ativação.', false),
  t('clerigo', 'vigilia', 4, 'c_grande_santuario', 'Grande Santuário', 'Milagre de maioria Vigília também concede +1 Armadura até sua próxima Ativação.', false),
  t('clerigo', 'liturgista', 1, 'c_refrao_t', 'Refrão', refrao.text, true, { actions: [refrao] }),
  t('clerigo', 'liturgista', 2, 'c_verso_corrigido', 'Verso Corrigido', 'Uma vez por Ativação, depois de colocar novo Verso, troque um Verso anterior por outro tipo.', false),
  t('clerigo', 'liturgista', 3, 'c_antifona', 'Antífona', 'Ao resolver AMÉM, recupere sua Reação se gasta e um aliado afetado pode Passo 1.', false),
  t('clerigo', 'liturgista', 4, 'c_liturgia_eterna', 'Liturgia Eterna', 'Depois de AMÉM, mantenha um dos três Versos como primeiro espaço da próxima Liturgia.', false),
  // ---- Arqueiro
  t('arqueiro', 'atirador', 1, 'ar_respiracao', 'Respiração Controlada', 'Quando Mirar antes de movimento voluntário, ganhe 2 Mira em vez de 1; depois não pode Reposicionar/Trocar voluntariamente naquela Ativação, apenas Passos.', true),
  t('arqueiro', 'atirador', 2, 'ar_bodkin', 'Ponta Bodkin', 'Gasto de Mira para perfurar ignora 2 Armadura em vez de 1.', false),
  t('arqueiro', 'atirador', 3, 'ar_olho_falcao', 'Olho de Falcão', 'No início do Combate, escolha uma Faixa legal da arma que não seja sua Faixa Ideal impressa; ela também conta como Ideal até o fim do Combate.', false),
  t('arqueiro', 'atirador', 4, 'ar_tiro_perfeito', 'Tiro Perfeito', 'Uma vez por Combate, gaste 3 Mira; aumente ambos dados do Ataque em 1 Grau, +2 Dano e ignore Cobertura.', false),
  t('arqueiro', 'cacador', 1, 'ar_passos_leves', 'Passos Leves', 'Passo do Caçador vira Passo 3 e pode atravessar aliado.', true, { actions: [passosLeves] }),
  t('arqueiro', 'cacador', 2, 'ar_serrilhada', 'Flecha Serrilhada', '2 AP, dados da arma, Dano 2; se alvo na Faixa Ideal e sofrer Dano, Sangramento 1; Impulso Passo 1; outro Impulso pode aumentar Sangramento até o máximo.', false),
  t('arqueiro', 'cacador', 3, 'ar_abate', 'Abate em Movimento', 'Uma vez por Ativação, ao derrotar com Ataque de Distância, Passo 2; se terminar sem inimigo Adjacente e com alvo válido na Faixa Ideal, +1 Mira.', false),
  t('arqueiro', 'cacador', 4, 'ar_fluxo_cacada', 'Fluxo da Caçada', 'O efeito de posicionamento/Mira do Caçador continua gerando Mira mesmo se gastou no máximo 1 Mira na Ativação.', false),
  t('arqueiro', 'sentinela', 1, 'ar_olhos_corredor', 'Olhos no Corredor', 'Tiro de Interceptação pode disparar com deslocamento voluntário menor que o requisito básico (1+ conexão).', true),
  t('arqueiro', 'sentinela', 2, 'ar_tiro_duplo', 'Tiro Duplo', '2 AP; ataque até dois inimigos válidos próximos entre si; Precisão + Agilidade, Dano 1, mesma rolagem para ambos.', false),
  t('arqueiro', 'sentinela', 3, 'ar_cobertura_fogo', 'Cobertura de Fogo', 'Reação alternativa quando aliado é atacado; gaste Reação +1 Mira; se acertar, aliado recebe Guardado contra aquele Ataque.', false),
  t('arqueiro', 'sentinela', 4, 'ar_zona_morte', 'Zona de Morte', '2 AP +2 Mira; marque uma cadeia curta de Setores; primeiro inimigo que entrar ou iniciar ali permite Ataque de Reação, Dano 2.', false),
  // ---- Ladino
  t('ladino', 'assassino', 1, 'l_ponto_vital', 'Ponto Vital', 'Golpe Furtivo que causar Dano também aplica Sangramento 1, uma vez por Ativação.', true),
  t('ladino', 'assassino', 2, 'l_cacador_feridas', 'Caçador de Feridas', 'Alvo Sangrando também permite criar Brecha automaticamente.', false),
  t('ladino', 'assassino', 3, 'l_brecha_mortal', 'Brecha Mortal', 'Limite de Brechas no alvo sobe para 3; execução de 3 Brechas recebe +3 Dano e ignora 2 Armadura.', false),
  t('ladino', 'assassino', 4, 'l_um_golpe', 'Um Golpe, Uma Morte', 'Uma vez por Combate, alvo com 3 Brechas; gaste todas antes da rolagem, aumente ambos dados em 1 Grau; se acertar, +3 Dano, ignore 2 Armadura e até 2 Impulsos viram +1 Dano cada.', false),
  t('ladino', 'sombra', 1, 'l_passos_fantasmas', 'Passos Fantasmas', 'Passo Sombrio vira Passo 3 e pode atravessar inimigos comuns.', true, { actions: [passosFantasmas] }),
  t('ladino', 'sombra', 2, 'l_evasao_perfeita', 'Evasão Perfeita', 'Impulso da Evasão vira Passo 2; se o Ataque causar zero Dano, receba Guardado.', false),
  t('ladino', 'sombra', 3, 'l_desaparecer', 'Desaparecer à Vista', '1 AP + gaste Reação; sem inimigo Adjacente, fique Furtivo mesmo sem condição normal de esconder.', false),
  t('ladino', 'sombra', 4, 'l_danca_sombras', 'Dança das Sombras', 'Uma vez por Ativação, depois de atacar Furtivo, se fizer Passo e terminar sem inimigo Adjacente, fique Furtivo novamente.', false),
  t('ladino', 'sabotador', 1, 'l_maos_mestre', 'Mãos de Mestre', 'Melhora testes de ferramentas/objetivos do Ladino: +1 Grau no dado de Teste de Objetivo.', true),
  t('ladino', 'sabotador', 2, 'l_bomba_fumaca', 'Bomba de Fumaça', '1 AP, uma vez por Combate; crie Fumaça em Área 2 Setores até sua próxima Ativação. A Fumaça concede Cobertura.', false),
  t('ladino', 'sabotador', 3, 'l_fio_tropeco', 'Fio de Tropeço', '1 AP, uma vez por Combate; armadilha em Setor conectado; primeiro inimigo que entrar sofre 1 Dano Direto, Imobilizado e 1 Brecha.', false),
  t('ladino', 'sabotador', 4, 'l_mestre_emboscada', 'Mestre da Emboscada', 'Inimigo que ativa sua armadilha recebe 2 Brechas e Exposto; Fio de Tropeço pode ser usado duas vezes por Combate.', false),
];

/** Talent unlock tier by number of Dungeons completed (§29). */
export function maxTalentTier(dungeonsCompleted: number): 1 | 2 | 3 | 4 {
  if (dungeonsCompleted >= 7) return 4;
  if (dungeonsCompleted >= 5) return 3;
  if (dungeonsCompleted >= 3) return 2;
  return 1;
}

export const TALENT_HANDLERS: Record<string, (c: Ctx, a: Record<string, unknown>) => void> = {
  'talent:investidaAttack': (c, a) => {
    const f = c.S.figures.find((x) => x.id === a.figureId)!;
    startHeroAttack(c, {
      sourceId: f.id,
      targetId: a.optionId as string,
      techId: 'g_investida',
      name: 'Investida',
      cat: 'cac',
      dice: diceOf(f, ['poder', 'agilidade']),
      dano: 2,
      weapon: true,
      school: 'metal',
      pre: (a.pre as string[]) ?? [],
    });
  },
};
