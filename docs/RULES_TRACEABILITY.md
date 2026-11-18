# Rastreabilidade de regras — REGRA MESTRA V2 PASS 14 → código → testes

Fonte: `01_REGRA_MESTRA_V2_PASS14.md` (seções §0–§62). Precedência aplicada: Pass 14 > decisões posteriores no próprio
documento (§49–§61 prevalecem sobre trechos anteriores) > Livros V2 v0.3 quando compatíveis. A §61 governa as
descobertas do Básico; a §58 (Relicário pelo Avançado) não é usada.

Legenda de **status de implementação**:

- **implementado**: a regra está no código e é exercida pelo fluxo normal.
- **parcial**: implementado com lacunas descritas na coluna de notas.
- **N/A Básico**: fora do escopo do Modo Básico D1 (Avançado, Arena, produção física).
- **pendente**: não implementado.

A coluna "status na Mestra" repete o rótulo da seção no documento (CANÔNICO, APROVADO PARA PLAYTEST, WATCH…).
Hipóteses adotadas pelo código estão em [`OPEN_DESIGN_QUESTIONS.md`](OPEN_DESIGN_QUESTIONS.md) (ids `Q-…`).

Abreviações de testes:

- `core/rules` = `packages/core/test/rules.test.ts`
- `content/combat` = `packages/content/test/combat.test.ts`
- `content/campaign` = `packages/content/test/campaign.test.ts`
- `e2e/<spec>` = `e2e/<spec>.spec.ts` (Playwright)

"Autoplay" significa que a regra é exercida pelas campanhas completas de `autoplayCampaign`
(`packages/content/src/sim/autoplay.ts`) nos testes de campanha, sem asserção específica sobre ela.

## Regras gerais e combate

| § | Regra | Status na Mestra | Implementação (arquivo → função/símbolo) | Testes | Status |
|---|---|---|---|---|---|
| §0 | Contrato de precedência; não usar V1 | — | Cabeçalhos de `packages/core/src/types.ts`, `packages/content/src/dungeons/d1/index.ts` (Investigar/Pressão do v0.3 descartados) | — | implementado (processo) |
| §1 | Status CANÔNICO / PLAYTEST / WATCH / ABERTO | — | `packages/core/src/registry.ts` → `Status`, `SourceRef` (acrescenta `HIPOTESE`) | — | implementado |
| §2 | 1–5 heróis, true solo, sem XP por inimigo, ouro compartilhado, wipe = punição máxima | CANÔNICO | `campaign.ts` → `newCampaign` (lança erro fora de 1–5), `CampaignState.gold`, `endCombat` (derrota → `gameover`) | `content/campaign` › D1 ponta a ponta (1–5 heróis) | implementado |
| §3.1 | Modo Básico | CANÔNICO | `packages/content/src/dungeons/d1/index.ts` (`modes: ['basico']`) | `content/campaign` | implementado |
| §3.2 | Modo Avançado | CANÔNICO | Só rótulo "em desenvolvimento" em `apps/web/src/ui/Title.tsx` | — | pendente |
| §4 | Terminologia; limites por Ativação/Ciclo/Combate distintos | CANÔNICO | `types.ts` → `Counters {activation, cycle, combat}`; `effects.ts` → `canUse`/`markUse`; `engine.ts` → `actionAvailability` (`limit`), `Figure.dungeonUses` | indireto | implementado |
| §5 | 5 colunas × 2 fileiras por lado; máx. 2 figuras por Setor; sem 3ª fileira | CANÔNICO | `board.ts` → `sk`, `allSectors`, `SECTOR_CAPACITY`, `hasRoom`, `occupancy` | `core/rules` › máximo 2 figuras por Setor; `content/combat` › GAL-E01 5 heróis (capacidade) | implementado |
| §5.1 | Conexões ortogonais; Frentes opostas conectadas; sem diagonal; atravessar aliado cheio sem terminar | CANÔNICO | `board.ts` → `connections`, `sectorsAdjacent`, `oppositeFront`, `shortestPaths`; `engine.ts` → `stepDestinations` | `core/rules` › conexões ortogonais…; adjacência… | implementado |
| §6 | Reposicionar 1 AP/conexão; Passo; Rápido 2 AP + Passo grátis; Tático 3; Pesado 3 + 1 Grau 1×/Ativação (máx. D12) | CANÔNICO | `universal.ts` → `reposicionar`, `passoRapido`; `state.ts` → `tempoAp`; `engine.ts` → `startHeroActivation`; `attack.ts` → `startHeroAttack` (pre `pesado`); `dice.ts` → `raiseGrade` | `content/combat` › Rápido = 2 AP + Passo; Tático = 3 AP; Pesado = 3 AP | implementado |
| §6 | Ordem do Ciclo HR→ER→HT→ET→HP→EP→fim; Intenções antes do Tempo | CANÔNICO | `types.ts` → `BANDS`; `engine.ts` → `beginCycle`, `revealIntents`, `enterBand`, `endCycle` | `content/combat` › Intenções são reveladas antes da escolha de Tempo; `e2e/combat` | implementado |
| §7 | Engajamento; sair voluntariamente +1 AP por ação/efeito (também no Passo grátis); forçado ignora; entrar encerra deslocamento; inimigo não sai sem permissão | CANÔNICO | `board.ts` → `isEngaged`, `sectorEngaged`; `engine.ts` → `leaveEngagementCost`, `stepDestinations`; `universal.ts` → `repositionCost`, `passoRapido`, `trocar`; `ai.ts` → `enemyPaths` | `core/rules` › Frentes opostas… Engajadas; `content/combat` › sair de Engajamento custa +1 AP | implementado |
| §8 | Coluna Fechada/Aberta; Corpo a Corpo; Alcance; Distância; Global | CANÔNICO | `board.ts` → `canTarget`, `columnClosed` | `core/rules` › Corpo a Corpo…; Coluna aberta…; Alcance…; Distância…; `content/combat` › Corpo a Corpo fora de coluna é rejeitado | implementado |
| §8 | Área 2 Setores (ortogonais, nunca diagonal, até 4 figuras) | CANÔNICO | `board.ts` → `isValidArea2`; `engine.ts` → `actionTargets` (`area2`), `doAction` | `core/rules` › Área 2 Setores: apenas ortogonais | implementado (sem teste de resolução com 4 figuras) |
| §9 | Cobertura −1 no Dano final de Distância, depois dos demais; não acumula; Retaguarda não é Cobertura; Dano Direto ignora; Mira ignora | CANÔNICO | `effects.ts` → `hasCover`; `attack.ts` → `computeHeroDamage`; `defense.ts` → `resolveDefense`; Mira `mira:cover` em `classes.ts` | `content/combat` › Cobertura reduz apenas Distância (asserção condicional ao acerto) | implementado (teste fraco) |
| §10 | Empurrar F→R / Puxar R→F na mesma coluna; sem lateral, sem cadeia; forçado ignora Engajamento/Imobilizado | CANÔNICO | `effects.ts` → `push`, `pull`, `forcedMove` | — | implementado (sem teste) |
| §11 | D4–D12; tabela universal; máx. 3 dados | CANÔNICO | `dice.ts` → `readDie`, `rollDice` (`MAX_DICE = 3`), `raiseGrade`, `lowerGrade` | `core/rules` › converte cada face…; Grau sobe/desce…; rolagens respeitam faces… e máximo de 3 dados | implementado |
| §12 | Ataque de herói: ≥1 Sucesso; Dano bruto = base + Sucessos além do 1º + mods; Crítico +1 Dano e ignora 1 Armadura; depois Armadura, Guardado, Cobertura | CANÔNICO | `attack.ts` → `startHeroAttack`, `finishHeroAttack`, `computeHeroDamage` | indireto (`content/combat` › Cobertura…; autoplay) | implementado (sem teste unitário da fórmula) |
| §13 | Inimigos não rolam; herói rola Defesa; cada Sucesso bloqueia 1; Dano Direto sem Defesa/Armadura/Cobertura | CANÔNICO | `defense.ts` → `runEnemyAttack`, `beginDefense`, `resolveDefense`; `effects.ts` → `dealDamage` (`direct`) | `e2e/combat` (pendência `defense` vista); `content/combat` › true solo (Dano Direto) | implementado |
| §14 | 1 Reação por Ciclo; Ajuda universal +D4 (você ou aliado Adjacente; máx. 3 dados) | CANÔNICO | `engine.ts` → `beginCycle` (restaura); `defense.ts` → `reactionOptions`, `commitDefense`, `heroCanReact` | `e2e/combat` (indireto) | implementado (sem teste unitário) |
| §15 | Veneno (máx. 3, fim da própria Ativação) | CANÔNICO/WATCH | `effects.ts` → `applyCondition`; `engine.ts` → `endHeroActivation`, op `enemyEnd` | — | implementado (sem teste) |
| §15 | Sangramento (máx. 2, movimento/ataque) | CANÔNICO/WATCH | `effects.ts` → `bleedTick`; `attack.ts`; `defense.ts` → `runEnemyAttack`; `engine.ts` op `move` | — | implementado (sem teste) |
| §15/§53 | Queimando (fim de Ciclo 1 Dano Direto; reaplicar = 1 imediato; 1 AP remove de si/Adjacente; inimigo perde após o dano) | CANÔNICO | `engine.ts` → `endCycle`; `effects.ts` → `applyCondition`; `universal.ts` → `apagarFogo` | — | implementado (sem teste) |
| §15 | Quebrado, Exposto, Guardado | CANÔNICO | `attack.ts` → `startHeroAttack` (Exposto), `computeHeroDamage` (Quebrado, Guardado); `effects.ts` → `consumeGuard`; `defense.ts` → `resolveDefense` | — | implementado (sem teste) |
| §15 | Imobilizado | CANÔNICO | `engine.ts` → `stepDestinations`, `endHeroActivation`, op `move`; `universal.ts` | — | implementado (duração: Q-IMOB) |
| §15 | Atordoado (−1 AP; Boss/Miniboss → Exposto) | CANÔNICO | `engine.ts` → `startHeroActivation`; `effects.ts` → `applyCondition` | — | implementado (sem teste) |
| §15 | Radiante × Profano +1 Dano | CANÔNICO | `attack.ts` → `computeHeroDamage` | — | implementado |
| §16 | Loadout (Primária, Secundária, Armadura, 2 Acessórios, Cantil); Trocar Arma 1 AP 1×/Ativação; equipamento travado em Combate | CANÔNICO | `universal.ts` → `trocarArma`; `campaign.ts` → `heroFigure`, `manageInventory` (recusa em combate) | — | implementado (sem teste) |
| §17 | Proficiências por classe | CANÔNICO | `classes.ts` → `proficiencies`; `campaign.ts` → `canWield` | — | implementado (sem teste) |

## Classes e equipamentos

| § | Regra | Status na Mestra | Implementação | Testes | Status |
|---|---|---|---|---|---|
| §18.1 | Guerreiro: Sequência, Riposta, 4 habilidades-base | CANÔNICO | `classes.ts` → `guerreiroActions` (`g_corte`, `g_passo_tatico`, `g_pressao`, `g_decisivo`); Riposta em `defense.ts` → `applyDefenseDamage` | `content/combat` usa `g_corte` (validação/AP); autoplay | implementado (testes de habilidade ausentes) |
| §18.2 | Paladino: Convicção/Julgado, Smite, Égide, 4 habilidades-base | CANÔNICO | `classes.ts` (`p_golpe_radiante`, `p_passo_juramento`, `p_protecao`, `p_imposicao`; hooks do Paladino); Égide em `defense.ts` → `resolveEgide` | autoplay; `e2e/combat` (prompt de Julgar) | implementado (Q-JULGADO) |
| §18.3 | Arcanista: Matriz Rúnica, Canalizar, Sobrecarga, Instabilidade, Barreira Rúnica, Centelha, 9 combinações, limites de Sigilos/Portais | CANÔNICO | `classes.ts` (`a_centelha`, `a_canalizar`, `a_lanca`, `a_grilhoes`, `a_fio`, `a_ruptura`, `a_poco`, `a_dobra`, `a_detonacao`, `a_estase`, `a_portais`, `placeSigil`) | autoplay | implementado (Q-FEITICO, Q-SIGILO, Q-CANALIZAR) |
| §18.4 | Clérigo: Liturgia/AMÉM, Intercessão, zona de suporte, Bênção da Vigília | CANÔNICO | `classes.ts` (`c_palavra`, `c_censura`, `c_prece`, `c_bencao`, `c_guia`, `c_amem`); `effects.ts` → `inSupportZone`; `defense.ts` → `runEffect` (Intercessão) | autoplay | implementado (Q-PRECE) |
| §18.4 | Solo Consagrado (Vigília T3) | CANÔNICO | Suporte no motor (`Battlefield.consecrated`, `defense.ts` → `resolveDefense`), talento `c_solo_consagrado` com `implemented: false` | — | pendente (T3) |
| §18.5 | Arqueiro: Mira, Faixas, Tiro de Interceptação, 5 habilidades-base + Mirar | CANÔNICO | `classes.ts` (`ar_disparo`, `ar_medido`, `ar_mirar`, `ar_passo`, `ar_perfurante`, `ar_contencao`, handler `reaction:afterEnemyMove`); `board.ts` → `faixaOf` | `core/rules` › Faixas do Arqueiro; `content/combat` usa `ar_disparo` | implementado (Q-CONTENCAO; Tiro de Interceptação interpretado, ver Q-INTERCEPT) |
| §18.6 / §51 | Ladino: Furtivo, Brechas, Evasão, Esconder-se, 5 habilidades-base | CANÔNICO | `classes.ts` (`l_finesse`, `l_finta`, `l_passo_sombrio`, `l_esconder`, `l_arteria`, `l_desequilibrio`); `ai.ts` → `defaultTarget` (+2); `effects.ts` → `dealDamage`/`afterEnterSector` (fim de Furtivo) | autoplay | implementado (Q-BRECHA; sem teste dedicado) |
| §18 (Talentos) | 3 caminhos × T1–T4 por classe | CANÔNICO | `packages/content/src/characters/talents.ts` (72 talentos; 18 T1 com `implemented: true`, 54 T2–T4 `false`) | `content/campaign` › retorno à Base… T1 compra e T2 bloqueado | parcial (só T1 tem efeito) |
| §19 | Armas/Focos iniciais | CANÔNICO | `items/d1.ts` → `STARTING` | — | parcial (Orbe Gravítico `implemented: false`) |
| §20 | 10 armas comuns | CANÔNICO | `items/d1.ts` → `COMMON_WEAPONS` | — | parcial (Cetro do Peregrino `implemented: false`; dados de alguns focos/armas são Q-…) |
| §21 / §57 | 10 armas raras (textos integrais) | CANÔNICO | `items/d1.ts` → `RARE_WEAPONS` | — | implementado (sem teste) |
| §22 | 18 armaduras | APROVADAS/PLAYTEST | `items/d1.ts` → `STARTING_ARMOR`, `COMMON_ARMOR`, `RARE_ARMOR` | — | parcial (Couro do Caçador e Malha do Peregrino `implemented: false`) |
| §23 | 16 acessórios | CANÔNICO/PLAYTEST | `items/d1.ts` → `COMMON_ACC`, `RARE_ACC` | — | parcial (Luvas de Empunhadura, Faixa do Sobrevivente, Grevas do Ímpeto `implemented: false`; Lente de Bronze simplificada Q-LENTE) |
| §24 / §54 | 10 consumíveis; 1 por Ativação; Gratuito/Reativo; uso fora de Combate | CANÔNICO | `items/d1.ts` → `CONSUMABLES`, `consumableActions`, `applyPreRollConsumables`; `campaign.ts` → `useOutOfCombat` | — | parcial (uso fora de Combate descarta o item sem efeito e não tem UI) |
| §25 | Manto do Primeiro Caminho (CAMINHO/REFÚGIO) | CANÔNICO | `items/d1.ts` → `MANTO`, handler `manto:prompt`/`manto:choose`; `universal.ts` → `trocarArma` (CAMINHO) | autoplay (REL-E01 em 3+ heróis) | implementado (ver nota de ordem em OPEN_DESIGN_QUESTIONS, Q-MANTO-ORDEM) |
| §26 | Cantil: 2 cargas, 3 HP, 1 AP em si, 1×/Ativação; fora de Combate sem AP; recarrega entre Dungeons | CANÔNICO | `universal.ts` → `cantil`; `campaign.ts` → `drinkCantil`, `enterBase` | — | implementado (sem teste) |
| §27 | Mochila 7 / 5 / 4; o que não ocupa; sem Espólio ilimitado | CANÔNICO | `campaign.ts` → `backpackCapacity`, `assignLoot`, `collectRewards` (não carregado → removido) | — | implementado (sem teste) |

## Campanha, economia e Dungeon 1

| § | Regra | Status na Mestra | Implementação | Testes | Status |
|---|---|---|---|---|---|
| §28 | HP persiste entre Combates; Base restaura HP, remove estados, recarrega Cantil; consumíveis usados não voltam à mochila | CANÔNICO | `campaign.ts` → `writeBack`, `enterBase` | `content/campaign` › retorno à Base… | implementado (D1 → Base; não há D2) |
| §29 | +1 Maestria e +1 Talento após D1–D7; custos de Maestria; T2/T3/T4 após D3/D5/D7 | CANÔNICO | `campaign.ts` → `enterBase`, `baseCommand` (`MASTERY_COST`), `talents.ts` → `maxTalentTier` | `content/campaign` › retorno à Base concede +1 Maestria e +1 Talento; T1 compra e T2 bloqueado | implementado |
| §30 | Loot por encontro; escala por party original; orçamento da rota; full clear | CANÔNICO | `campaign.ts` → `lootCount`, `endCombat`, `draw`; `d1/index.ts` → `ENC[].rewards` | `content/campaign` › D1 ponta a ponta (ouro); full clear verificado manualmente por autoplay (ouro 11/15/19/23/27) | implementado |
| §31 | Vitrine 4+2; usados; preços 8/4, 14/7, 24/12, inicial 0; consumíveis 1 de cada; ouro 8/11/14/17/20 | OPERACIONAL/PLAYTEST | `campaign.ts` → `enterBase`, `drawShop`, `PRICES`, `baseCommand` | `content/campaign` › ouro da rota principal; Vitrine 4/2 | parcial (cartas não compradas não voltam ao pool) |
| §32 | Nova Remessa Comum/Rara; Reserva do Mercador | APROVADOS | `campaign.ts` → `baseCommand` (`service`) | — | parcial (sem próxima visita na D1; Reserva não pode ser exercida) |
| §33 | 6 Intenções por tipo, 1 por tipo por Ciclo, reembaralhar; Alvo Padrão; Movimento; Reforços (teto 8/10, Reserva, não ativa no Ciclo de entrada); Intenções obrigatórias | CANÔNICO | `engine.ts` → `newTypeState`, `revealIntents`, `spawnEnemy`, `checkEnd`; `ai.ts` → `defaultTarget`, `enemyPaths`, `pathToAttack`; `enemyApi.ts` → `attackIntent` | `content/combat` › mesmo seed… (inclui IA); autoplay | implementado (Q-REINF, Q-RESERVA) |
| §34 | Bestiário D1 (13 perfis), HP de Cantor/Cavaleiro/Vigia/Severin, limite cumulativo de Convocações | PLAYTEST / CANÔNICO (Convocações) | `packages/content/src/enemies/d1.ts` → `D1_ENEMIES`, `severinSummonLimit`, handler `severin:chamar` | autoplay | implementado |
| §35 | Fluxo D1 Básico; rotas; Capela; Raro; boss secreto; Relicário; Cavaleiro (Guarda Aberta via Cárceres); Severin | PLAYTEST | `d1/index.ts` → `D1.options`, `D1.choose`, `D1.afterRewards`, `D1.combatContext` | `content/campaign` › D1 ponta a ponta; Segredos do Básico §61 | implementado |
| §36 | Objetivos: posição + AP + Teste; 1 tentativa da party por Ciclo; Sete Linhas; Contrapesos; Manivela | APROVADA | `d1/objectives.ts` → `seteLinhas`, `contrapeso`, `objectiveTest` | `content/campaign` › Relicário só é revelado com Sete Linhas | parcial (falha/repetição no Ciclo não tem teste direto; posições são Q-POS-SETE e Q-POS-CONTRAPESO) |
| §37 | Anti-spoiler: mapa só com locais revelados; sem "???"; Arquivo por código | CANÔNICO | `campaign.ts` → `beginDungeon` (`revealed` = públicos); `d1/index.ts` (REL/CRI `public: false`); `apps/web/src/ui/Explore.tsx` | `content/campaign` › mapa público não contém REL nem Cripta; Cripta/Vigia: nunca antes de…; `e2e/*` → `expectNoSpoilers` | implementado |
| §38 | Exploração Avançada | APROVADA | — | — | N/A Básico (pendente) |
| §39, §45–§48 | Arena / PvP | PLAYTEST/APROVADO | — | — | N/A (fora de escopo) |
| §40 | Itens obsoletos (grid, Rodada, HP antigo de Severin, Espólio ilimitado, mochila 4 universal…) | — | Conformidade: tabuleiro por Setores (`board.ts`), Severin 9/18/26/34/42, `backpackCapacity`, loot não carregado removido | — | implementado (conformidade) |
| §41 | WATCH (Carrasco, Gibão, Cota Rebitada…) | WATCH | `SourceRef.status = 'WATCH'` em `enemies/d1.ts` (Carrasco) e `items/d1.ts` (Gibão, Cota Rebitada) | — | implementado (marcação) |
| §42, §49 | Continuidade / estado do desenvolvimento | — | — | — | N/A |
| §43 | Fichas e Intenções de todos os 13 inimigos | PLAYTEST | `enemies/d1.ts` (cada `IntentDef` tem `text` e `plan`); handlers de Cantor, Vigia, Severin, Cavaleiro, Turiferário, Relicário, Carrasco | autoplay (todos os tipos aparecem nas campanhas completas) | implementado (Q-NOMOVE, Q-GUARDA, Q-TERCEIRA, Q-VIGIA-CAT; sem teste por Intenção) |
| §44 | Composições exatas por tamanho de party | PLAYTEST | `d1/index.ts` → `ENC[].compositions`, `reinforcements`; `campaign.ts` → `layoutEnemies` | `content/combat` › GAL-E01 com 5 heróis…; `e2e/layout` (5 heróis) | implementado (só GAL-E01 tem asserção de composição) |
| §50.1 | Caído: não age/move/reage, ocupa o Setor, não Engaja, ignorado pela IA | CANÔNICO | `effects.ts` → `heroFalls`; `board.ts` → `occupancy`, `isEngaged`; `effects.ts` → `heroes(c)` (só ativos) | `core/rules` › … Caído não engaja | implementado |
| §50.2 | Levantar: Adjacente, 2 AP, 25% do HP máx. atual (arred. p/ cima), 1 Trauma | CANÔNICO | `universal.ts` → `levantar`; `effects.ts` → `raiseHero`; fora de combate `campaign.ts` → `raiseOutOfCombat` (Q-LEVANTAR-FORA) | `content/combat` › party: herói Caído pode ser Levantado… | implementado (ordem Trauma→25%: Q-LEVANTAR-ORDEM) |
| §50.3 | Trauma −2 HP máx. na Dungeon; com 2 Traumas, cair = Derrotado | CANÔNICO | `effects.ts` → `heroFalls`, `raiseHero`; `campaign.ts` → `recordMaxHp`, `enterBase` (zera) | `content/combat` › true solo… (termina Derrotado) | implementado |
| §50.4–§50.5 | Derrotado; Game Over se todos Caídos/Derrotados | CANÔNICO | `engine.ts` → `checkEnd`; `campaign.ts` → `endCombat` (`gameover`) | `content/combat` › true solo… (`S.result === 'defeat'`) | implementado |
| §50.6 | Último Fôlego (true solo, 2 fichas por Dungeon) | CANÔNICO | `effects.ts` → `heroFalls`; `campaign.ts` → `newCampaign`, `enterBase` | `content/combat` › true solo: ao cair gasta Último Fôlego… | implementado |
| §51.1–§51.3 | Furtivo (+2 conexões na IA, fim ao atacar/sofrer Dano/inimigo Adjacente), Esconder-se, interações | CANÔNICO | `classes.ts` (Ladino, `l_esconder`, `l_passo_sombrio`); `ai.ts`; `effects.ts`; `attack.ts`; Bomba de Fumaça em `items/d1.ts` | autoplay | implementado (sem teste) |
| §52, §55, §56, §60, §61.7, §62 | Gates C/D (componentes físicos) | — | Quantidade de consumíveis 4×10 refletida em `LOOT_POOLS.consumivel` | — | N/A |
| §58 | Relicário pelo Modo Avançado (SCR-240/320/710) | CANÔNICO (Avançado) | Não usado no Básico (`d1/index.ts`, cabeçalho) | — | N/A Básico |
| §59 | Recompensa: revelar exatamente a quantidade; tudo é encontrado; sem escolha | CANÔNICO | `campaign.ts` → `endCombat`, `draw` | indireto | implementado |
| §61.1 | Sete Linhas → B-SCR-01 → Passagem Decifrada → REL após o Scriptorium, antes do Salão | CANÔNICO | `objectives.ts` → `seteLinhas`; `campaign.ts` → `campaignDispatch` (`readArchive`); `d1/index.ts` → `onVictory`, `options` (`go_rel`) | `content/campaign` › Relicário só é revelado com Sete Linhas decifradas | implementado |
| §61.2 | Uma oportunidade de Raro após a rota escolhida; máx. 1 por campanha | CANÔNICO | `d1/index.ts` → `afterRewards` (`rareOffered`), `options` (`go_rare`) | `content/campaign` › No máximo 1 Raro de rota… | implementado |
| §61.3 | Capela antes ou depois da rota, sempre antes do Salão | CANÔNICO | `d1/index.ts` → `options` (`go_cap` enquanto `!salaoStarted`) | `content/campaign` › Iniciar o Salão encerra as oportunidades opcionais | implementado |
| §61.4 | Silêncio + (Palavra ou Peso) → B-VIG-01 → Cripta/Vigia | CANÔNICO | `d1/index.ts` → `afterRewards` (verificação das Marcas), `STATE_CARDS[].secretLine` | `content/campaign` › Cripta/Vigia: nunca antes de Silêncio + Palavra/Peso (asserção principal condicional à revelação) | implementado |
| §61.5 | Separação Básico × Avançado | CANÔNICO | Sem Investigar/Pressão/Busca Profunda no Básico | — | implementado |
| §61.6 | Auditoria ponta a ponta do Básico | CANÔNICO | Campanhas completas por autoplay | `content/campaign` › D1 ponta a ponta (10 casos) | implementado |

## Referências do Livro de Regras v0.3 citadas no código

O código também cita seções do Livro de Regras Oficial V2 v0.3 quando compatíveis: `R03` (adjacência,
`board.ts`), `R04` (Ciclo, `engine.ts`), `R05` (Reposicionar/Trocar, `universal.ts`), `R06` (ataque/defesa, `attack.ts`,
`defense.ts`), `R07` (Sangramento, Caído — reincorporado pela §50), `R08` (IA, `ai.ts`). Textos narrativos dos locais
citam o Livro da Dungeon 1 v0.3 (`D1 L01`…`L10`, `CAM-610`, `CAM-620`, `SAL-020`).
