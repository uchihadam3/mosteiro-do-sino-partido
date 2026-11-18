import React from 'react';

/** In-game quick reference (Livro de Regras R14 + core of the Regra Mestra). No Dungeon secrets here (§37). */
export function RulesModal({ onClose }: { onClose(): void }) {
  const items: [string, string][] = [
    ['Ciclo', 'Restaure Reações → revele 1 Intenção por tipo inimigo → cada herói escolhe Tempo → Heróis Rápidos → Inimigos Rápidos → Heróis Táticos → Inimigos Táticos → Heróis Pesados → Inimigos Pesados → fim de Ciclo.'],
    ['Tempo', 'Rápido: 2 AP + 1 Passo gratuito. Tático: 3 AP. Pesado: 3 AP + uma vez na Ativação aumente 1 Grau de um dado apropriado (máx. D12).'],
    ['Formação 5×2', 'Cada lado tem Frente e Retaguarda em 5 colunas. Máximo 2 figuras por Setor. Conexões: vizinhos na mesma fileira e Frente↔Retaguarda da mesma coluna. Sem diagonal.'],
    ['Engajamento', 'Frentes opostas da mesma coluna ficam Engajadas. Sair voluntariamente custa +1 AP por ação/efeito. Entrar numa Frente que Engaja encerra o deslocamento.'],
    ['Alcances', 'Corpo a Corpo: da Frente, mesma coluna; a Frente inimiga protege a Retaguarda. Alcance: Frente ou Retaguarda, mesma coluna. Distância: qualquer alvo; Cobertura reduz 1 Dano final. Global: ignora a Formação.'],
    ['Dados', '1–2: 0 Sucessos · 3–5: 1 Sucesso · 6–8: 1 Sucesso + 1 Impulso · 9–11: 2 Sucessos + 1 Impulso · 12: 3 Sucessos + Crítico.'],
    ['Ataque de herói', 'Precisa de 1 Sucesso. Dano bruto = Dano base + Sucessos além do primeiro + modificadores. Crítico: +1 Dano e ignora 1 Armadura. Depois: Armadura → Guardado → Cobertura.'],
    ['Ataque inimigo', 'Inimigos não rolam Ataque: a Intenção informa Dano e Defesa. O herói rola Defesa; cada Sucesso bloqueia 1 Dano. Depois Armadura, Guardado e Cobertura. Dano Direto ignora Defesa, Armadura e Cobertura.'],
    ['Reações', '1 por herói por Ciclo. Ajuda: +D4 na Defesa sua ou de aliado Adjacente (máx. 3 dados). Reações de classe usam o mesmo recurso.'],
    ['Caído e Trauma', '0 HP: Caído. Um aliado Adjacente gasta 2 AP para Levantar (25% do HP máximo, +1 Trauma; cada Trauma −2 HP máximo na Dungeon). Com 2 Traumas, cair de novo = Derrotado. Todos fora de ação = Game Over. True solo: 2 fichas de Último Fôlego.'],
    ['IA inimiga', 'Alvo Padrão: herói que exige menos conexões para o inimigo atacar; empate → menor HP; empate absoluto → a party decide. Furtivo conta +2 conexões.'],
    ['Base', 'Ao concluir a Dungeon: HP restaurado, Cantil recarregado, +1 Maestria e +1 Ponto de Talento por herói. Loja com Vitrine de 4 Comuns e 2 Raros.'],
  ];
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel ornate" style={{ width: 'min(860px, 96vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="kicker">Livro de Regras · referência rápida</div>
        <h2 className="h2">Regras V2</h2>
        <div className="divider" />
        <div className="body scroll-y" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '10px 22px' }}>
          {items.map(([t, d]) => (
            <div key={t} className="tech" style={{ gridTemplateColumns: '1fr' }}>
              <b>{t}</b>
              <p>{d}</p>
            </div>
          ))}
        </div>
        <div className="actions">
          <button className="btn primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
