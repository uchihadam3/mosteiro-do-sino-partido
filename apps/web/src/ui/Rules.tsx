import React from 'react';
import { Icon } from './Icon';
import { Sheet } from './Settings';
import './menus.css';

/** In-game quick reference (Livro de Regras R14 + core of the Regra Mestra). No Dungeon secrets here (§37). */
const RULES: { t: string; icon: string; p?: string; li?: string[] }[] = [
  {
    t: 'Ciclo',
    icon: 'tempo_tatico',
    li: ['Restaure as Reações.', 'Revele 1 Intenção por tipo de inimigo.', 'Cada herói escolhe seu Tempo.', 'Rápidos agem → Táticos → Pesados (heróis antes dos inimigos em cada faixa).', 'Fim do Ciclo.'],
  },
  {
    t: 'Tempo',
    icon: 'tempo_rapido',
    li: ['Rápido: 2 AP + 1 Passo gratuito.', 'Tático: 3 AP.', 'Pesado: 3 AP + uma vez na Ativação aumente 1 Grau de um dado apropriado (máx. D12).'],
  },
  { t: 'Formação 5×2', icon: 'act_swap', p: 'Cada lado tem Frente e Retaguarda em 5 colunas. Máximo 2 figuras por Setor. Conexões: vizinhos na mesma fileira e Frente↔Retaguarda da mesma coluna. Sem diagonal.' },
  { t: 'Engajamento', icon: 'act_defend', p: 'Frentes opostas da mesma coluna ficam Engajadas. Sair voluntariamente custa +1 AP por ação/efeito. Entrar numa Frente que Engaja encerra o deslocamento.' },
  {
    t: 'Alcances',
    icon: 'act_attack_distancia',
    li: [
      'Corpo a Corpo: da Frente, mesma coluna; a Frente inimiga protege a Retaguarda.',
      'Alcance: Frente ou Retaguarda, mesma coluna.',
      'Distância: qualquer alvo; Cobertura reduz 1 Dano final.',
      'Global: ignora a Formação.',
    ],
  },
  { t: 'Dados', icon: 'dice_d12', li: ['1–2: 0 Sucessos', '3–5: 1 Sucesso', '6–8: 1 Sucesso + 1 Impulso', '9–11: 2 Sucessos + 1 Impulso', '12: 3 Sucessos + Crítico'] },
  { t: 'Ataque de herói', icon: 'act_attack_melee', p: 'Precisa de 1 Sucesso. Dano bruto = Dano base + Sucessos além do primeiro + modificadores. Crítico: +1 Dano e ignora 1 Armadura. Depois: Armadura → Guardado → Cobertura.' },
  { t: 'Ataque inimigo', icon: 'armor', p: 'Inimigos não rolam Ataque: a Intenção informa Dano e Defesa. O herói rola Defesa; cada Sucesso bloqueia 1 Dano. Depois Armadura, Guardado e Cobertura. Dano Direto ignora Defesa, Armadura e Cobertura.' },
  { t: 'Reações', icon: 'reaction', p: '1 por herói por Ciclo. Ajuda: +D4 na Defesa sua ou de aliado Adjacente (máx. 3 dados). Reações de classe usam o mesmo recurso.' },
  {
    t: 'Caído e Trauma',
    icon: 'cond_caido',
    li: [
      '0 HP: Caído.',
      'Um aliado Adjacente gasta 2 AP para Levantar (25% do HP máximo, +1 Trauma).',
      'Cada Trauma: −2 HP máximo na Dungeon. Com 2 Traumas, cair de novo = Derrotado.',
      'Todos fora de ação = Game Over. True solo: 2 fichas de Último Fôlego.',
    ],
  },
  { t: 'IA inimiga', icon: 'mira', p: 'Alvo Padrão: herói que exige menos conexões para o inimigo atacar; empate → menor HP; empate absoluto → a party decide. Furtivo conta +2 conexões.' },
  { t: 'Base', icon: 'loc_claustro', p: 'Ao concluir a Dungeon: HP restaurado, Cantil recarregado, +1 Maestria e +1 Ponto de Talento por herói. Loja com Vitrine de 4 Comuns e 2 Raros.' },
];

export function RulesModal({ onClose }: { onClose(): void }) {
  return (
    <Sheet kicker="Referência rápida" title="Regras" onClose={onClose} wide>
      <div className="m-rules">
        {RULES.map((r, i) => (
          <details key={r.t} className="m-rule" open={i === 0}>
            <summary>
              <span className="m-ico-disc">
                <Icon id={r.icon} />
              </span>
              <span className="t">{r.t}</span>
              <span className="chev" aria-hidden />
            </summary>
            {r.p && <p>{r.p}</p>}
            {r.li && (
              <ul>
                {r.li.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </details>
        ))}
      </div>
    </Sheet>
  );
}
