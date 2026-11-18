# Cobertura de conteúdo — Dungeon 1, Modo Básico

Gerado a partir do código (`packages/content/src`), conferido contra a Regra Mestra Pass 14 (§18–§27, §34, §43, §44,
§61). Os dados abaixo foram extraídos do `Registry` em tempo de execução (`installContent()`), não digitados à mão.
`CONTENT_VERSION = 'd1-basico-pass14-0.1.0'`.

Legenda: **✔** implementado · **◐** parcial/interpretação (`HIPOTESE`) · **✘** `implemented: false` (o efeito do texto
não é aplicado; a UI mostra "Efeito parcialmente implementado nesta versão").

## 1. Classes (`packages/content/src/characters/classes.ts`)

Todas as 6 classes conferem com §18 em HP, Armadura inicial e Graus de atributo.

| Classe | HP / Arm. | Atributos D8 | Recurso | Proficiência | Itens iniciais |
|---|---|---|---|---|---|
| Guerreiro | 14 / 1 | Poder, Determinação | Sequência (I→II→III) | Marcial | Espada Longa, Machado de Batalha, Lança, Martelo de Guerra, Cota de Malha |
| Paladino | 13 / 1 | Poder, Espírito | Convicção (máx. 3) + Julgado | Marcial, Sagrado | Espada e Escudo do Juramento, Martelo do Juramento, Lança da Alvorada, Cota do Juramento |
| Arcanista | 11 / 0 | Arcano, Precisão | Matriz Rúnica (6 Runas) + Instabilidade (máx. 3) | Arcano | Cajado Rúnico, Varinha Prismática, Orbe Gravítico ◐ (Q-ORBE), Vestes do Aprendiz ◐ |
| Clérigo | 12 / 0 | Espírito, Determinação | Liturgia (3 Versos) + AMÉM | Sagrado | Bastão do Peregrino, Sino da Vigília, Censário do Julgamento, Vestes Consagradas |
| Arqueiro | 10 / 0 | Precisão, Agilidade | Mira (começa 1, máx. 3) + Faixas | Arco | Arco Curto, Arco Recurvo, Arco Longo, Couro do Caçador ◐ (Q-COURO-CACADOR) |
| Ladino | 11 / 0 | Sombra, Agilidade | Brechas (nos alvos) + Furtivo | Finesse | Adagas Gêmeas, Rapieira, Lâmina Serrilhada, Couro das Sombras |

Na criação, as duas primeiras armas da lista viram Primária/Secundária e as demais vão para o Armazém
(`campaign.ts` → `makeHero`); a tela de preparação permite trocar.

### Ações por classe (além das universais)

| Classe | Ações (id · nome · AP) | Passivas / Reação |
|---|---|---|
| Guerreiro | `guerreiro_basico` Ataque com Arma 2 ◐ (Q-BASICO) · `g_corte` Corte de Abertura I 2 · `g_passo_tatico` Passo Tático II 1 · `g_pressao` Pressão de Aço II 2 · `g_decisivo` Golpe Decisivo III 2 | Sequência; Riposta (1/Ciclo) |
| Paladino | `paladino_basico` Ataque com Arma 2 ◐ (Q-BASICO) · `p_golpe_radiante` Golpe Radiante 2 · `p_passo_juramento` Passo do Juramento 1 · `p_protecao` Proteção Sagrada 1 · `p_imposicao` Imposição das Mãos 2 | Convicção e Julgamento ◐ (Q-JULGADO); Smite; Égide (Reação) |
| Arcanista | `a_centelha` Centelha Arcana 2 · `a_canalizar` Canalizar 1, 1×/Ativação ◐ (Q-CANALIZAR) · nove combinações: `a_lanca` Lança Arcana 2 · `a_grilhoes` Grilhões Arcanos 2 · `a_fio` Fio de Salto 1 · `a_ruptura` Ruptura Arcana 2 · `a_poco` Poço Gravitacional 2 · `a_dobra` Dobra Espacial 2 · `a_detonacao` Runa de Detonação 2 · `a_estase` Selo de Estase 2 · `a_portais` Portais Gêmeos 2 (custos de 2 AP sem valor impresso: Q-FEITICO) · `a_estase_trigger` gatilho do Selo 0 ◐ (Q-SIGILO) | Matriz Rúnica; Sobrecarga; Instabilidade; Barreira Rúnica (Reação, +D6) |
| Clérigo | `c_palavra` Palavra Sagrada 2 · `c_censura` Palavra de Censura 2 · `c_prece` Prece Restauradora 2 ◐ (Q-PRECE) · `c_bencao` Bênção da Vigília 1 · `c_guia` Guia do Peregrino 1 · `c_amem` AMÉM 0 | Liturgia; Intercessão (Reação); Zona de suporte |
| Arqueiro | `ar_disparo` Disparo Básico 2 · `ar_medido` Tiro Medido 2 · `ar_mirar` Mirar 1, 1×/Ativação · `ar_passo` Passo do Caçador 1 · `ar_perfurante` Flecha Perfurante 2 · `ar_contencao` Flecha de Contenção 2 ◐ (Q-CONTENCAO) | Mira; Faixas; Tiro de Interceptação (Reação) ◐ (Q-INTERCEPT) |
| Ladino | `l_finesse` Golpe de Finesse 2 · `l_finta` Finta 1 · `l_passo_sombrio` Passo Sombrio 1 · `l_esconder` Esconder-se 1, 1×/Ativação · `l_arteria` Corte na Artéria 2 · `l_desequilibrio` Golpe de Desequilíbrio 2 | Furtivo; Brechas ◐ (Q-BRECHA; máx. 2 por alvo, 1 nova por Ativação; gastos Ponto Fraco/Escapar/Golpe Furtivo); Evasão (Reação) |

### Ações universais (`packages/core/src/universal.ts` + `items/d1.ts`)

Reposicionar (1 AP, +1 para sair de Engajamento) · Passo (Rápido) 0 AP · Trocar (1 AP) · Trocar Arma (1 AP,
1×/Ativação) · Beber do Cantil (1 AP, 1×/Ativação) · Levantar (2 AP) · Apagar Chamas (1 AP) · `usar:<consumível>` para
cada consumível de 1 AP na Mochila (1 consumível por Ativação). Ações de objetivo aparecem só nos encontros com
objetivo: Decifrar as Sete Linhas (SCR-E01) e Acionar Contrapeso (CAM-E01).

## 2. Talentos (`packages/content/src/characters/talents.ts`)

72 talentos (6 classes × 3 caminhos × T1–T4). **Somente os 18 de T1 têm `implemented: true`.** Os 54 de T2–T4 existem
com texto e aparecem na árvore da Base, mas não têm efeito (`hooksOf` ignora talentos não implementados) e são
bloqueados pela regra de tier (§29: T2 após D3, T3 após D5, T4 após D7), então não são alcançáveis na D1.

Heróis começam com 0 Pontos de Talento; o primeiro ponto chega no retorno à Base depois da D1. Na prática, **nenhum
talento está ativo durante a campanha da D1**.

| Classe | Caminho → T1 implementado |
|---|---|
| Guerreiro | Vanguarda → Investida I (ação `g_investida`) · Veterano → Segundo Fôlego (ação `g_segundo_folego`, 1×/Dungeon) · Executor → Golpe de Ruptura II (ação `g_ruptura`) |
| Paladino | Bastião → Escudo da Fé · Julgamento → Golpe do Veredito (ação `p_veredito`) · Graça → Mãos Misericordiosas |
| Arcanista | Evocador → Destruição Focada · Geômetra → Inscrição Distante · Tecelão → Canalização Estável |
| Clérigo | Misericórdia → Graça aos Feridos · Vigília → Intercessão Firme · Liturgista → Refrão (ação `c_refrao`) |
| Arqueiro | Atirador → Respiração Controlada · Caçador → Passos Leves (ação `ar_passo_leve`) · Sentinela → Olhos no Corredor |
| Ladino | Assassino → Ponto Vital · Sombra → Passos Fantasmas (ação `l_passo_fantasma`) · Sabotador → Mãos de Mestre |

Nenhum talento tem teste automatizado de efeito.

## 3. Inimigos (`packages/content/src/enemies/d1.ts`)

13 tipos, 6 Intenções cada (§33), conferidos com §34/§43. Todos têm `IntentDef.text` e `plan`. Status na fonte:
APROVADO PARA PLAYTEST; Carrasco = WATCH.

| Inimigo | Nível | HP (1–5) | Arm. | Profano | Passiva | Intenções (Tempo) | Representação 3D |
|---|---|---|---|---|---|---|---|
| Penitente Oco | Comum | 4 | 0 | sim | Multidão Oca | Arrastar-se (R), Fome (R), Unhas Partidas (T), Mordida Cinzenta (T), Agarrar as Pernas (P), Todos Sobre Ele (P) | KayKit Skeleton_Minion |
| Cão de Cinza | Comum | 3 | 0 | não | Caça ao Isolado | Farejar (R), Rodear (R), Bote (T), Rasgar Tendão (T), Atacar e Recuar (T), Matar o Perdido (P) | procedural (`characters.ts`) |
| Besteiro do Claustro | Comum | 3 | 0 | não | Mira Apoiada | Posicionar (R), Recuperar Distância (R), Disparo Limpo (T), Virote Farpado (T), Prender ao Chão (T), Mira Mortal (P) | KayKit Skeleton_Rogue |
| Escudeiro da Cinza | Comum pesado | 6 | 1 | não | Interpor | Parede de Escudo (R), Fincar Posição (R), Borda do Escudo (T), Empurrão (T), Cobrir a Linha (T), Quebra-Joelho (P) | KayKit Skeleton_Warrior |
| Acólito do Sino | Comum suporte | 4 | 0 | sim | Voz do Sino | Bênção Cinzenta (R), Badalada Curta (R), Canto da Fraqueza (T), Chamado à Vigília (T), Badalada Longa (P), Sacrifício do Servo (P) | KayKit Skeleton_Mage |
| Turiferário Cego | Raro | 5 | 0 | sim | Fumo Litúrgico | Erguer o Turíbulo (R), Passos pelo Fumo (R), Brasa do Turíbulo (T), Nuvem Cega (T), Cinza nos Olhos (P), Incenso Mortuário (P) | KayKit Skeleton_Rogue |
| Carcereiro das Correntes | Elite de rota | 6 | 1 | não | Cativo Marcado | Escolher a Presa (R), Gancho (T), Arrastar (T), Varredura de Corrente (T), Algemar (P), Quebrar o Cativo (P) | KayKit Barbarian |
| Carrasco do Contrapeso | Raro/Elite (WATCH) | 7 | 1 | não | Sentença | Medir o Pescoço (R), Passo do Cepo (R), Golpe Lateral (T), Quebrar Postura (T), Cutelo Descendente (P), Execução (P) | KayKit Barbarian |
| Relicário Faminto | Especial | 5 | 0 | não | Tesouro Vivo (começa Guardado) | Salto da Tampa (R), Fechar a Carapaça (R), Língua de Couro (T), Morder a Mão (T), Correr com o Tesouro (T), Cuspir Cacos (P) | procedural (baú com dentes) |
| Cantor da Última Badalada | Elite especial | 8/14/20/26/32 | 0 | sim | Canto (começa 1; NOTA +1; em 3 → Última Badalada obrigatória) | Hino de Ferro (R), Marcha do Coro (R), Verso da Dor (T), Dissonância (T), Respiração de Bronze (T), Silêncio Cortante (P); obrigatória: Última Badalada (P) | KayKit Skeleton_Mage |
| Cavaleiro da Vigília Quebrada | Miniboss | 6/12/17/22/27 | 2 (Fechada) / 0 (Aberta) | não | Guardas; Comandante | Muralha (R, F), Reagrupar (R, F), Investida (T, A), Disciplina de Aço (T, F), Romper a Linha (T, A), Corte de Misericórdia (P, A) | KayKit Knight |
| Vigia das Três Vigílias | Boss secreto | 8/18/27/36/45 | 1 → 0 (Hora Partida) | não | Três Vigílias; Hora Partida | Caçar os Apressados (R), Passo Proibido (R), Medida Exata (T), Centro da Vigília (T), Peso da Terceira Hora (P), Oração Imóvel (P) | KayKit Skeleton_Mage |
| Abade Severin | Boss final | 9/18/26/34/42 | 1 → 0 (Fase 2) | sim | Ressonância; Fases; Convocações (limite 1–5 cumulativo) | Chamar os Penitentes (R, SINO), Verbo Invertido (R), Procissão de Bronze (T, SINO), Círculo do Badalo (T, SINO), Martelo Litúrgico (P), Quebrar o Juramento (P); obrigatória: Terceira Badalada (P) | KayKit Mage |

R = Rápido, T = Tático, P = Pesado; F/A = Guarda Fechada/Aberta.

Interpretações registradas: Q-NOMOVE (Intenção sem Movimento escrito não move), Q-GUARDA (Guarda de entrada no Ciclo 1),
Q-TERCEIRA (Terceira Badalada resolvida além da Intenção revelada), Q-VIGIA-CAT (categoria dos ataques do Vigia),
"Medida Exata" não aplica Exposto em herói (§34: inimigos não usam Exposto em heróis).

O Cão de Cinza: o manifesto de personagens (`apps/web/public/assets/characters/manifest.json`) não tem prefab de cão;
ele é desenhado pelo rig procedural de `apps/web/src/three/characters.ts`, como o Relicário.

## 4. Locais (`D1_LOCATIONS` em `dungeons/d1/index.ts`)

| Código | Local | Público no mapa | Cena 3D | Fonte |
|---|---|---|---|---|
| POR | Pórtico das Cinzas | sim | portico | D1 L01 |
| GAL | Galeria dos Peregrinos | sim | galeria | D1 L02 |
| CLA | Claustro Partido | sim | claustro | D1 L03 |
| SCR | Scriptorium das Sete Linhas | sim | scriptorium | D1 L04 |
| CAN | Canil da Vigília | sim | canil | D1 L05 |
| CAR | Cárceres do Contrapeso | sim | carceres | D1 L06 |
| CAP | Capela do Último Ofício | sim | capela | D1 L07 |
| REL | Relicário do Primeiro Caminho | **não** (revelado por §61.1) | relicario | D1 L08 |
| CRI | Cripta das Três Vigílias | **não** (revelado por §61.4) | cripta | §61.4 B-VIG-01 |
| SAL | Salão da Vigília Quebrada | sim | salao | D1 L09 |
| CAM | Campanário Partido | sim | campanario | D1 L10 |

Cada local tem um texto de chegada (`arrival`) do Livro da Dungeon v0.3. A camada de Exploração Avançada (POIs,
Investigar, Pressão, Busca Profunda, códigos POR/GAL/SCR-xxx) não existe.

Fluxo implementado: POR → GAL-E01 → CLA → (Leste: SCR-E01 | Oeste: CAN-E01 → CAR-E01) → CLA → [opcionais: CAP-E01
antes ou depois da rota; Raro da rota; REL-E01 se revelado; CRI-E01 se revelado] → SAL-E01 (fecha opcionais) → CAM-E01
→ epílogo → Base.

## 5. Encontros e composições (§44)

Colunas 1–5 = tamanho original da party. "+C2" = reforço que entra no fim do Ciclo 2. Todas as composições e ouros
conferem com §44; os totais de ouro conferem com §31 (rota principal 8/11/14/17/20; full clear 11/15/19/23/27,
verificado rodando o autoplay em todas as combinações).

| Encontro | Tipo | 1 | 2 | 3 | 4 | 5 | Recompensa | Ouro |
|---|---|---|---|---|---|---|---|---|
| GAL-E01 Os Ajoelhados | obrigatório | 2 Penitentes | 3 Pen. | 3 Pen. +C2 Acólito | 4 Pen. +C2 Acólito | 4 Pen. + Acólito +C2 Besteiro | 1 Consumíveis | 2/3/4/5/6 |
| SCR-E01 Guardiões do Arquivo | rota Leste | Besteiro + Pen. | Besteiro + Escudeiro | Bes. + Esc. + Pen. +C2 Besteiro | 2 Bes. + Esc. + Pen. +C2 Escudeiro | 2 Bes. + 2 Esc. + Pen. +C2 Acólito | 1 Comum + 1 Consumíveis; objetivo Sete Linhas | 2/3/4/5/6 |
| CAN-E01 Cães da Vigília | rota Oeste 1 | 2 Cães | 3 Cães | 3 Cães + Pen. +C2 Cão | 4 Cães + Pen. +C2 Cão | 4 Cães + 2 Pen. +C2 Cão | — | 1/1/2/2/3 |
| CAR-E01 Carcereiro das Correntes | rota Oeste 2 | Carcereiro +C2 Pen. | Carc. + Pen. +C2 Pen. | Carc. + Pen. + Cão +C2 Pen. | Carc. + Esc. + Pen. + Cão +C2 Pen. | Carc. + Esc. + 2 Pen. + Cão +C2 Pen. | 1 Comum + 1 Consumíveis + Manivela Conservada | 1/2/2/3/3 |
| CAP-E01 Último Ofício | opcional | Cantor | Cantor + Acólito | + Escudeiro | + Penitente | + 2º Penitente | Silêncio do Coro + Marca do Silêncio + 1 Consumíveis | 1/1/1/2/2 |
| RARO-L Arquivo do Incenso Morto | raro Leste | Turiferário + Pen. | Tur. + Besteiro | Tur. + Bes. + Pen. | Tur. + Esc. + Bes. + Pen. | Tur. + Esc. + 2 Bes. + Pen. | 1 Comum + Marca da Palavra | 1/1/2/2/2 |
| RARO-O Cela do Contrapeso | raro Oeste | Carrasco | Carr. + Pen. | Carr. + Acólito | Carr. + Aco. + Pen. | Carr. + Aco. + Esc. + Pen. | 1 Comum + Marca do Peso | 1/1/2/2/2 |
| REL-E01 Relicário Faminto | secreto | 1 Relicário | 2 Relicários | 2 Relicários | 2 Rel. + Escudeiro | 2 Rel. + Esc. + Pen. | Manto do Primeiro Caminho (épico) | 0 |
| CRI-E01 Vigia das Três Vigílias | secreto | Vigia | Vigia | Vigia | Vigia | Vigia | 1 Rara | 1/2/2/2/3 |
| SAL-E01 Cavaleiro da Vigília Quebrada | miniboss | Cavaleiro | Cav. + Pen. | Cav. + Pen. + Esc. | Cav. + 2 Esc. + Bes. | Cav. + 2 Esc. + 2 Bes. + Acólito | 1 Rara | 2/2/3/3/4 |
| CAM-E01 Abade Severin | boss | Severin | Severin | Sev. + Pen. | Sev. + Pen. + Aco. + Esc. | Sev. + 2 Pen. + Aco. + Esc. | 1 Comum (fecha o orçamento §30) | 2/3/3/4/4 |

Detalhes por encontro:

- Cobertura estática (Campo de Batalha) e entradas de reforço estão em `ENC[].cover`/`entries`. Severin e Vigia são
  posicionados fixos em `E:F3`; os demais são distribuídos por `layoutEnemies` (bosses/elites no centro, 1 por Setor
  antes de completar 2).
- CAM-E01 declara teto de 10 inimigos ativos (`enemyCap: 10`); os demais usam o teto ordinário 8 (§33).
- SAL-E01: Guarda inicial Aberta quando a rota foi Oeste (Cárceres), Fechada caso contrário (`combatContext`).
- CAM-E01 recebe `hasManivela` (Manivela Conservada) e `hasSilencio` (Silêncio do Coro) do estado da campanha.
- A §44 diz para Severin "recompensas finais conforme orçamento aprovado da Dungeon"; o código fecha o orçamento da §30
  (2 Comuns, 1 Rara, 2 Consumíveis na rota principal) com 1 Comum e o ouro restante. Essa distribuição é uma escolha
  do código, documentada em `dungeons/d1/index.ts`.

## 6. Objetivos de batalha (`dungeons/d1/objectives.ts`)

| Objetivo | Encontro | Custo | Teste | Posição | Efeito |
|---|---|---|---|---|---|
| Decifrar as Sete Linhas | SCR-E01 | 1 AP | Arcano ou Precisão, 1 Sucesso; 1 tentativa da party por Ciclo | Retaguarda dos heróis ◐ (Q-POS-SETE) ou Corda e Gancho | Sete Linhas + B-SCR-01 + Passagem Decifrada → REL ao fim do encontro |
| Acionar Contrapeso (Oeste/Norte/Leste) | CAM-E01 | 1 AP (1–2 heróis) / 2 AP (3–5); Manivela −1 AP e +D6 1×/Combate | Poder ou Precisão, 1 Sucesso | colunas 1/3/5 ◐ (Q-POS-CONTRAPESO) ou Corda e Gancho | −1 Ressonância e marca usado; falha: não reduz e não repete aquele Contrapeso no Ciclo |

Bônus aplicáveis ao Teste de Objetivo: Pesado (+1 Grau), Mãos de Mestre, Kit de Campo (+D6), Lente Rúnica (+D8),
Estojo do Arrombador (rerrolagem após falha).

## 7. Arquivo Oculto e cartas de estado

| Código | Título | Quando aparece |
|---|---|---|
| B-SCR-01 | Arquivo Oculto · B-SCR-01 | Imediatamente após o sucesso em Sete Linhas, ainda no combate |
| B-VIG-01 | Arquivo Oculto · B-VIG-01 | Após recolher recompensas quando a party tem Marca do Silêncio + (Palavra ou Peso) |
| CAM-610 | Epílogo · O Silêncio ("O Coro Calou") | Fim da D1 com Silêncio do Coro |
| CAM-620 | Epílogo · A Última Vibração ("Sino Partido") | Fim da D1 sem Silêncio do Coro |

Cartas de estado (`STATE_CARDS`): Manivela Conservada, Silêncio do Coro, Marca do Silêncio, Marca da Palavra, Marca do
Peso (as três Marcas têm a linha de verificação da §61.4), Sete Linhas.

## 8. Segredos e anti-spoiler

| Segredo | Condição | Onde | Teste |
|---|---|---|---|
| Relicário do Primeiro Caminho (REL-E01) | Sucesso em Sete Linhas durante SCR-E01 (§61.1) | `objectives.ts` → `seteLinhas`; `D1.onVictory` | `content/campaign` › Relicário só é revelado… |
| Cripta das Três Vigílias / Vigia (CRI-E01) | Marca do Silêncio (Capela) + Marca da Palavra (Raro Leste) ou do Peso (Raro Oeste) (§61.4) | `D1.afterRewards` | `content/campaign` › Cripta/Vigia: nunca antes de… |
| Encontro Raro de rota | Concluir a rota escolhida; máx. 1 (§61.2) | `D1.afterRewards`, `D1.options` | `content/campaign` › No máximo 1 Raro… |

O mapa (`apps/web/src/ui/Explore.tsx`) desenha só os locais em `state.revealed`. Os testes E2E verificam que
"???", "Relicário do Primeiro Caminho", "Cripta das Três Vigílias", "Relicário Faminto", "Vigia das Três Vigílias",
"B-SCR-01" e "B-VIG-01" não aparecem no texto da página nas telas visitadas. Os nomes existem no bundle JavaScript
(dados de conteúdo), como o prompt admite.

## 9. Itens (`packages/content/src/items/d1.ts`) — 84 no total

### Armas/Focos iniciais (§19) — 19

| Item | Classe | Dados · Dano · Categoria | Status |
|---|---|---|---|
| Espada Longa | Guerreiro | Poder+Precisão · 2 · CaC | ✔ |
| Machado de Batalha | Guerreiro | Poder+Determinação · 2 · CaC | ✔ |
| Lança | Guerreiro | Poder+Agilidade · 2 · Alcance | ✔ |
| Martelo de Guerra | Guerreiro | Poder+Guarda · 2 · CaC | ✔ |
| Espada e Escudo do Juramento | Paladino | Poder+Guarda · 2 · CaC | ✔ |
| Martelo do Juramento | Paladino | Poder+Determinação · 2 · CaC | ✔ |
| Lança da Alvorada | Paladino | Poder+Espírito · 2 · Alcance | ✔ |
| Cajado Rúnico | Arcanista | Arcano+Espírito · 1 · Distância | ✔ |
| Varinha Prismática | Arcanista | Arcano+Precisão · 1 · Distância | ✔ |
| Orbe Gravítico | Arcanista | Arcano+Determinação · 1 · Distância | ◐ (Q-ORBE: desvia o Puxar do Poço Gravitacional) |
| Bastão do Peregrino | Clérigo | Espírito+Precisão · 1 · Distância | ✔ |
| Sino da Vigília | Clérigo | (efeito sobre Intercessão) | ✔ |
| Censário do Julgamento | Clérigo | (Queimando com Impulso) | ✔ |
| Arco Curto / Arco Recurvo | Arqueiro | Precisão+Agilidade · 2 · Distância | ✔ |
| Arco Longo | Arqueiro | Precisão+Determinação · 2 · Distância | ✔ |
| Adagas Gêmeas | Ladino | Sombra+Agilidade · 2 · CaC | ✔ |
| Rapieira | Ladino | Precisão+Agilidade · 2 · CaC | ✔ |
| Lâmina Serrilhada | Ladino | Sombra+Determinação · 2 · CaC | ✔ |

### Armas comuns (§20) — 10

Espada Balanceada ✔ · Machado de Mão ✔ · Lança de Caça ✔ · Besta de Mão ◐ (Q-BESTA) · Arco de Teixo ✔ ·
Cajado de Quartzo ◐ (Q-FOCOS-COMUNS) · Orbe de Chumbo ◐ (Q-FOCOS-COMUNS) · Cetro do Peregrino ◐ (Q-FOCOS-COMUNS, Q-CETRO) ·
Maça Consagrada ◐ (Q-MACA) · Adaga Ritual ◐ (Q-ADAGA).

### Armas raras (§21/§57) — 10

Espada do Contrapasso ✔ · Machado da Ruptura ✔ · Lança do Vigia ✔ · Arco da Raposa ✔ · Arco da Linha Clara ✔ ·
Varinha do Eco ✔ · Orbe do Espaço Curvo ✔ · Bastão da Misericórdia ✔ · Martelo da Sentença ✔ · Adagas do Vulto ✔.

### Armaduras (§22) — 18 + Manto (§25)

| Raridade | Itens |
|---|---|
| Inicial | Cota de Malha ✔ · Cota do Juramento ✔ · Vestes do Aprendiz ◐ (Q-VESTES) · Vestes Consagradas ✔ · Couro do Caçador ◐ (Q-COURO-CACADOR) · Couro das Sombras ✔ |
| Comum | Couro Reforçado ✔ · Manto do Viajante ✔ · Gibão do Batedor ✔ (WATCH) · Cota de Escamas ✔ · Cota Rebitada ✔ (WATCH) · Placas de Campanha ✔ |
| Rara | Couraça do Veterano ✔ · Couro do Passo Livre ✔ · Manto Rúnico ✔ · Couro de Escamas Negras ✔ · Malha do Peregrino ◐ (Q-MALHA) · Bastião de Ferro ✔ |
| Épica | Manto do Primeiro Caminho ✔ (só pelo REL-E01) |

### Acessórios (§23) — 16

| Raridade | Itens |
|---|---|
| Comum | Botas de Trilha ✔ · Fivela de Ferro ✔ · Pingente de Âmbar ✔ · Lente de Bronze ◐ (Q-LENTE, simplificada) · Kit de Campo ✔ · Luvas de Empunhadura ◐ (Q-LUVAS) · Faixa do Sobrevivente ◐ (Q-FAIXA) · Corda e Gancho ✔ |
| Raro | Grevas do Ímpeto ◐ (Q-GREVAS) · Anel do Julgamento ✔ · Ícone da Mãe Velada ✔ · Lente Rúnica ✔ · Aljava Serrilhada ✔ · Estojo do Arrombador ✔ · Broche do Abrigo ✔ · Talismã do Último Passo ✔ |

### Consumíveis (§24) — 10 (preço)

Antídoto (2) ✔ · Bandagem Compressiva (2) ✔ · Unguento Contra Chamas (2) ✔ · Frasco de Ácido (3) ✔ · Fogo Alquímico (3)
✔ · Bomba de Fumaça (4) ✔ · Óleo de Afiação (3, gratuito antes do ataque) ✔ · Tônico de Foco (3, gratuito antes da
rolagem) ✔ · Pó Cegante (3) ✔ · Selo de Resistência (4, reativo) ✔.

O uso fora de Combate (§24: Antídoto, Bandagem, Unguento) existe só no redutor (`useOutOfCombat`): ele descarta o item
sem efeito (as condições são limpas ao fim de cada combate no fluxo digital) e não há botão na UI.

### Resumo dos itens `implemented: false` (0)

Nenhum. Os 7 itens que estavam pendentes agora têm efeito, todos com uma interpretação marcada (◐) e teste em
`packages/content/test/items.test.ts`:

| Item | Tipo | Hipótese |
|---|---|---|
| Orbe Gravítico | arma inicial do Arcanista | Q-ORBE |
| Couro do Caçador | armadura inicial do Arqueiro (equipada por padrão) | Q-COURO-CACADOR |
| Cetro do Peregrino | arma comum | Q-CETRO (e Q-FOCOS-COMUNS) |
| Malha do Peregrino | armadura rara | Q-MALHA |
| Luvas de Empunhadura | acessório comum | Q-LUVAS |
| Faixa do Sobrevivente | acessório comum | Q-FAIXA |
| Grevas do Ímpeto | acessório raro | Q-GREVAS |

## 10. Baralhos de loot (`LOOT_POOLS`)

| Baralho | Conteúdo | Cartas |
|---|---|---|
| Comum | 10 armas comuns + 6 armaduras comuns + 8 acessórios comuns | 24 |
| Raro | 10 armas raras + 6 armaduras raras + 8 acessórios raros | 24 |
| Consumível | 4 cópias de cada um dos 10 consumíveis (§56.1) | 40 |

Os baralhos são embaralhados uma vez na criação da campanha com o RNG da campanha. Equipamento é único (sai do baralho
ao ser revelado); consumíveis usados ou deixados voltam ao baralho de consumíveis. Quantidade por recompensa segue
`lootCount` (§30) pelo tamanho original da party. O Manto do Primeiro Caminho não está em baralho: é recompensa fixa do
REL-E01. A Vitrine da Base sai dos mesmos baralhos Comum/Raro.
