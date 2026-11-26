/**
 * Plain-language face of every hero action: one short line that says what it DOES (not the rules text), shown on
 * the skill cards, in the targeting strip and in the hero's kit sheet. The full rules text stays one tap away.
 * New classes/dungeons add their lines here; anything missing falls back to a line built from the rules preview.
 */
import type { ActionDef } from '@mosteiro/core';

export const SKILL_LINE: Record<string, string> = {
  // shared
  reposicionar: 'Anda 1 casa',
  trocar: 'Troca de lugar com um aliado vizinho',
  trocarArma: 'Troca para a outra arma',
  cantil: 'Bebe do cantil: cura 3 de vida',
  levantar: 'Levanta um aliado caído ao lado',
  apagarFogo: 'Apaga o fogo de você ou de um vizinho',
  // Guerreiro — a muralha que avança: golpes em sequência (I → II → Decisivo)
  guerreiro_basico: 'Golpe com a arma no inimigo à frente',
  g_corte: 'Golpe que abre a Sequência (passo I)',
  g_passo_tatico: 'Anda 2 casas, mesmo cercado',
  g_pressao: 'Golpe da Sequência II: deixa o alvo Exposto',
  g_decisivo: 'Finalizador: +2 de dano se vier depois da Pressão',
  // Paladino — escudo sagrado e cura
  paladino_basico: 'Golpe com a arma no inimigo à frente',
  p_golpe_radiante: 'Golpe sagrado (forte contra mortos-vivos)',
  p_passo_juramento: 'Anda 2 casas na direção do alvo ou de um aliado',
  p_protecao: 'Protege um aliado: o próximo dano é 1 menor',
  p_imposicao: 'Cura um aliado vizinho gastando Convicção',
  // Arcanista — magias à distância e controle
  a_centelha: 'Raio mágico à distância (grátis de runas)',
  a_canalizar: 'Recupera uma runa ou acalma a magia',
  a_lanca: 'Lança mágica à distância, dano 2',
  a_grilhoes: 'Prende o inimigo: ele não anda',
  a_fio: 'Teleporta você ou um aliado até 2 casas',
  a_ruptura: 'Explosão em 2 casas: dano 1 em cada inimigo',
  a_poco: 'Puxa os inimigos de trás para a frente',
  a_detonacao: 'Armadilha: explode quando um inimigo pisar',
  a_estase: 'Armadilha que prende quem pisar',
  a_portais: 'Cria dois portais para seus heróis atravessarem',
  // Clérigo — cura e palavras sagradas à distância
  c_palavra: 'Palavra sagrada à distância, dano 1',
  c_censura: 'Palavra de censura à distância, dano 2',
  c_prece: 'Cura um aliado (2 a 4 de vida)',
  c_bencao: 'O aliado se defende melhor na próxima vez',
  c_guia: 'Faz você ou um aliado andar 1 casa',
  c_amem: 'Liturgia completa: libera o efeito dos versos',
  // Arqueiro — tiros de longe e mira
  ar_disparo: 'Tiro com o arco, dano 2',
  ar_medido: 'Tiro mais preciso na distância ideal',
  ar_mirar: 'Mira: o próximo tiro fica melhor',
  ar_passo: 'Anda 2 casas sem perder a mira',
  ar_perfurante: 'Flecha que atravessa 1 de armadura',
  ar_contencao: 'Flecha que prende o inimigo no lugar',
  // Ladino — brechas, sangramento e furtividade
  l_finesse: 'Golpe rápido com a arma, dano 2',
  l_finta: 'Abre uma brecha no inimigo e recua 1 casa',
  l_passo_sombrio: 'Anda 2 casas, passa por aliados, pode se esconder',
  l_esconder: 'Fica furtivo (escondido)',
  l_arteria: 'Corte que faz sangrar se usar uma brecha',
  l_desequilibrio: 'Golpe que deixa o alvo Exposto',
};

export const CLASS_ROLE: Record<string, { role: string; how: string }> = {
  guerreiro: { role: 'Fica na frente e bate forte', how: 'Encadeie Corte → Pressão → Golpe Decisivo para o maior dano.' },
  paladino: { role: 'Protege e cura os aliados', how: 'Fique perto do grupo; use Proteção antes do ataque inimigo.' },
  arcanista: { role: 'Magia à distância e controle', how: 'Fique atrás. Prenda, puxe e exploda grupos de inimigos.' },
  clerigo: { role: 'Cura e ataca de longe', how: 'Fique atrás e cure quem estiver com pouca vida.' },
  arqueiro: { role: 'Dano à distância', how: 'Fique atrás, use Mirar e atire de longe.' },
  ladino: { role: 'Golpes traiçoeiros', how: 'Abra brechas com a Finta e faça sangrar.' },
};

/** The short line for a card; falls back to "Ataque · dano N" from the rules preview. */
export function skillLine(def: ActionDef, dano?: number): string {
  const line = SKILL_LINE[def.id];
  if (line) return line;
  if ((def.kind === 'attack' || def.kind === 'spell') && dano !== undefined) return `Ataque, dano ${dano}`;
  const first = def.text.split(/[.;]/)[0];
  return first.length > 48 ? `${first.slice(0, 46)}…` : first;
}

export const KIND_LABEL: Record<string, string> = { attack: 'Ataque', spell: 'Magia', control: 'Controle', move: 'Movimento', support: 'Apoio', utility: 'Preparo' };

/** What an action CAUSES, as small icon tags read from its rules text (damage, heal, conditions, movement, area…). */
export interface SkillTag {
  icon: string;
  label: string;
  tone: 'dmg' | 'heal' | 'bad' | 'good' | 'move' | 'info';
}
const TAG_RULES: [RegExp, SkillTag][] = [
  [/\bcur[ae]/i, { icon: 'act_heal', label: 'Cura', tone: 'heal' }],
  [/Sangramento/i, { icon: 'cond_sangramento', label: 'Sangra', tone: 'bad' }],
  [/Veneno/i, { icon: 'cond_veneno', label: 'Veneno', tone: 'bad' }],
  [/Queimando/i, { icon: 'cond_queimando', label: 'Fogo', tone: 'bad' }],
  [/Imobiliz/i, { icon: 'cond_imobilizado', label: 'Prende', tone: 'bad' }],
  [/Exposto|Expor/i, { icon: 'cond_exposto', label: 'Expõe', tone: 'bad' }],
  [/Quebrado/i, { icon: 'cond_quebrado', label: 'Quebra armadura', tone: 'bad' }],
  [/Ignora 1 Armadura|ignore 1 Armadura/i, { icon: 'armor', label: 'Fura armadura', tone: 'dmg' }],
  [/Guardado/i, { icon: 'cond_guardado', label: 'Protege', tone: 'good' }],
  [/Empurrar/i, { icon: 'act_push', label: 'Empurra', tone: 'move' }],
  [/\bpuxa/i, { icon: 'act_pull', label: 'Puxa', tone: 'move' }],
  [/Passo|teleporte|Mova/i, { icon: 'act_passo', label: 'Move', tone: 'move' }],
  [/Furtivo/i, { icon: 'cond_furtivo', label: 'Esconde', tone: 'good' }],
  [/Brecha/i, { icon: 'cond_brecha', label: 'Brecha', tone: 'bad' }],
  [/Área/i, { icon: 'act_area', label: 'Área', tone: 'info' }],
];
export function skillTags(def: ActionDef, dano?: number): SkillTag[] {
  const out: SkillTag[] = [];
  if ((def.kind === 'attack' || def.kind === 'spell') && dano !== undefined) out.push({ icon: 'act_attack_melee', label: `Dano ${dano}`, tone: 'dmg' });
  if (/Distância/i.test(def.text)) out.push({ icon: 'act_attack_distancia', label: 'De longe', tone: 'info' });
  else if (/Corpo a Corpo/i.test(def.text)) out.push({ icon: 'act_attack_melee', label: 'Corpo a corpo', tone: 'info' });
  for (const [re, tag] of TAG_RULES) if (re.test(def.text) && !out.some((t) => t.label === tag.label)) out.push(tag);
  return out.slice(0, 5);
}
/** Who an action can be used on, in words. */
export function targetWords(def: ActionDef): string {
  switch (def.targeting.type) {
    case 'enemy':
      return 'Num inimigo';
    case 'ally':
      return 'Em você ou num aliado';
    case 'none':
      return 'Em você mesmo';
    case 'move':
    case 'sector':
      return 'Num lugar do campo';
    case 'area2':
      return 'Em 2 casas vizinhas';
    case 'sectors2':
      return 'Em 2 casas';
    default:
      return '';
  }
}
