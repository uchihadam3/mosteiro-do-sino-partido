import { reg, type Attr, type Tempo } from '@mosteiro/core';

export const ATTR_ORDER: Attr[] = ['poder', 'guarda', 'agilidade', 'precisao', 'arcano', 'determinacao', 'espirito', 'sombra'];
export const ATTR_NAME: Record<Attr, string> = { poder: 'Poder', guarda: 'Guarda', agilidade: 'Agilidade', precisao: 'Precisão', arcano: 'Arcano', determinacao: 'Determinação', espirito: 'Espírito', sombra: 'Sombra' };
export const TEMPO_NAME: Record<Tempo, string> = { rapido: 'Rápido', tatico: 'Tático', pesado: 'Pesado' };
export const TEMPO_DESC: Record<Tempo, string> = { rapido: '2 AP + Passo gratuito · age primeiro', tatico: '3 AP · age no meio', pesado: '3 AP + 1 Grau num dado · age por último' };
export const COND_NAME: Record<string, string> = {
  veneno: 'Veneno',
  sangramento: 'Sangramento',
  queimando: 'Queimando',
  quebrado: 'Quebrado',
  exposto: 'Exposto',
  imobilizado: 'Imobilizado',
  atordoado: 'Atordoado',
  guardado: 'Guardado',
  furtivo: 'Furtivo',
  bencao: 'Bênção da Vigília',
  semReacoes: 'Sem Reações',
  ancorado: 'Ancorado',
};
export const COND_TEXT: Record<string, string> = {
  veneno: 'Máx. 3. No fim da própria Ativação: 1 Dano Direto e remove 1.',
  sangramento: 'Máx. 2. Ao se mover ou atacar: remove 1 e sofre 1 Dano Direto.',
  queimando: 'No fim do Ciclo: 1 Dano Direto. 1 AP (você ou aliado Adjacente) apaga. Reaplicar causa 1 Dano Direto imediato.',
  quebrado: 'O próximo Ataque que acertar trata a Armadura como 1 menor.',
  exposto: 'O próximo Ataque contra o alvo aumenta 1 dado em 1 Grau.',
  imobilizado: 'Impede movimento voluntário (até o fim da próxima Ativação).',
  atordoado: '−1 AP na próxima Ativação.',
  guardado: 'Reduz em 1 o próximo Dano sofrido.',
  furtivo: '+2 conexões para o Alvo Padrão da IA. Termina ao atacar, sofrer Dano ou ficar Adjacente a inimigo.',
  bencao: 'A próxima Defesa aumenta o dado principal em 1 Grau.',
  semReacoes: 'Não pode usar Reações até o início da próxima Ativação.',
  ancorado: 'Bastião de Ferro: sem movimento voluntário; o primeiro Ataque que causar Dano trata a Armadura como 2.',
};
export const CLASS_COLOR: Record<string, string> = {
  guerreiro: 'var(--c-guerreiro)',
  paladino: 'var(--c-paladino)',
  arcanista: 'var(--c-arcanista)',
  clerigo: 'var(--c-clerigo)',
  arqueiro: 'var(--c-arqueiro)',
  ladino: 'var(--c-ladino)',
};
export const CLASS_IDS = ['guerreiro', 'paladino', 'arcanista', 'clerigo', 'arqueiro', 'ladino'];

export function itemDef(id: string) {
  return reg().items[id];
}
export const SLOT_LABEL: Record<string, string> = { weapon: 'Arma/Foco', armor: 'Armadura', accessory: 'Acessório', consumable: 'Consumível' };
export const RARITY_LABEL: Record<string, string> = { inicial: 'Inicial', comum: 'Comum', raro: 'Raro', epico: 'Épico' };
export const CAT_LABEL: Record<string, string> = { cac: 'Corpo a Corpo', alcance: 'Alcance', distancia: 'Distância', global: 'Global' };
