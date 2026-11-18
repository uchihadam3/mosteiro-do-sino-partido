# Questões de design em aberto e hipóteses adotadas

Quando a Regra Mestra Pass 14 é vaga ou silenciosa, o código adota a interpretação mais conservadora que encontrou e a
marca. Nenhuma das hipóteses abaixo é regra oficial; todas devem ser confirmadas ou corrigidas pelo design.

Como achar no código:

- `source: H('§…', 'Q-…')` → `SourceRef` com `status: 'HIPOTESE'` (a UI de inventário mostra "Interpretação
  provisória").
- Comentários `// HIPÓTESE Q-…`.
- `implemented: false` em itens/talentos (efeito não aplicado).

A seção A lista as hipóteses **marcadas no código**. A seção B lista interpretações que encontrei ao revisar o código
e que **não estão marcadas** como hipótese; os ids `Q-…` da seção B foram criados neste documento.

## A. Hipóteses marcadas no código

| Id | Pergunta | Interpretação adotada | Onde |
|---|---|---|---|
| Q-BASICO | Classes marciais têm um "Ataque Básico" com os dados da arma? A §20 cita "Ataque Básico" (Machado de Mão) e a §19 dá dados/Dano a cada arma, mas a §18 não lista essa ação. | Guerreiro e Paladino ganham "Ataque com Arma" (2 AP, dados/Dano/categoria da Primária). | `packages/content/src/characters/classes.ts` → `ataqueBasico` (linha ~55) |
| Q-JULGADO | O Paladino marca o Julgado "gratuitamente" só no início do Combate? E se o Julgado morrer? | No início do Combate e, se não houver Julgado vivo, no início de cada Ativação do Paladino, uma nova marca gratuita. | `classes.ts` → hooks do Paladino `onActivationStart` (~364) |
| Q-FEITICO | Custo dos feitiços do Arcanista sem AP impresso na §18.3 (só Fio de Salto diz 1 AP). | 2 AP para Lança Arcana, Grilhões, Ruptura, Poço, Dobra, Detonação, Estase, Portais. | `classes.ts` (~468) |
| Q-SIGILO | Alcance de colocação de Sigilos ("aumenta o alcance funcional" na Inscrição Distante implica um alcance base). | Base: Setor inimigo a até 1 coluna do Arcanista; Inscrição Distante: qualquer coluna. Ação `a_estase_trigger` (0 AP) resolve o gatilho do Selo. | `classes.ts` → `sigilInRange` (~439) |
| Q-CANALIZAR | "Reduza Instabilidade conforme regra atual" — quanto? | −1 Instabilidade. | `classes.ts` (~533) |
| Q-PRECE | "Até o limite da carta" na Prece Restauradora. | Cura máxima 4. | `classes.ts` (~887) |
| Q-CONTENCAO | Flecha de Contenção contra Boss "converte conforme regra de Boss"; a §15 só define conversão para Atordoado. | Boss/Miniboss recebe Exposto em vez de Imobilizado. | `classes.ts` (~1080) |
| Q-BRECHA | Quando a Brecha é criada (as fontes estão listadas, o momento não). | Ao declarar um Ataque com arma do Ladino, se houver fonte (Furtivo, Exposto, Imobilizado, aliado Adjacente ao alvo; Sangrando com Caçador de Feridas). | `classes.ts` → `preAttack` do Ladino (~1287) |
| Q-VESTES | "Recuperação rúnica aprovada da carta" nas Vestes do Aprendiz. | Recuperar 1 Runa, 1×/Combate, depois de usar Barreira Rúnica. | `packages/content/src/items/d1.ts` (~409) |
| Q-BESTA | Faixas permitidas da Besta de Mão (a §20 só dá Ideal Próxima). | Próxima e Média, como o Arco Curto. | `items/d1.ts` (~515) |
| Q-FOCOS-COMUNS | Dados, Dano e categoria de Cajado de Quartzo, Orbe de Chumbo e Cetro do Peregrino (a §20 só dá o efeito). | Cajado: Arcano+Espírito; Orbe de Chumbo: Arcano+Determinação; Cetro: Espírito+Precisão; todos Dano 1, Distância. | `items/d1.ts` (~546, ~558, ~566) |
| Q-MACA | Dados/Dano/categoria da Maça Consagrada. | Poder+Espírito, Dano 2, Corpo a Corpo. | `items/d1.ts` (~577) |
| Q-ADAGA | Dados/Dano/categoria da Adaga Ritual. | Sombra+Agilidade, Dano 2, Corpo a Corpo. | `items/d1.ts` (~593) |
| Q-LENTE | Lente de Bronze ("depois de revelar Intenções, escolha inimigo visível; até o fim do Ciclo, antes do primeiro Ataque contra ele, aumente um dado em 1 Grau"). | **Simplificada**: 1×/Combate, +1 Grau no primeiro dado de um Ataque seu (opção pré-rolagem), sem escolher o inimigo após a revelação. | `items/d1.ts` (~939) |
| (Orbe Gravítico) | Redirecionar o movimento de feitiço para Setor conectado legal. | Não implementado (`implemented: false`); Poço/Dobra usam o destino padrão. | `items/d1.ts` (~222–234) |
| Q-NOMOVE | Intenção sem Movimento escrito pode mover? | Não move (ex.: Matar o Perdido, Quebrar o Juramento, Verbo Invertido). | `packages/content/src/enemies/d1.ts` (~260 e usos de `noMove`) |
| Q-GUARDA | A Guarda do Cavaleiro "muda quando a Intenção é revelada"; a entrada define Aberta/Fechada. Qual prevalece no Ciclo 1? | No Ciclo 1 vale a Guarda de entrada (Fechada; Aberta se a rota foi pelos Cárceres); a partir do Ciclo 2 a Intenção revelada define. | `enemies/d1.ts` → `cavaleiro.onReveal` (~1109) |
| Q-POS-SETE | Posição exigida para Decifrar as Sete Linhas (§36 exige "posição", a carta não diz qual). | Qualquer Setor de Retaguarda dos heróis ("a parede atrás da party"); Corda e Gancho dispensa. | `packages/content/src/dungeons/d1/objectives.ts` (~72) |
| Q-POS-CONTRAPESO | Posição de cada Contrapeso de Severin. | Oeste = coluna 1, Norte = coluna 3, Leste = coluna 5, qualquer fileira; Corda e Gancho dispensa. | `objectives.ts` (~121) |
| Q-LEVANTAR-FORA | Herói Caído ao fim do combate pode ser Levantado fora de Combate? | Sim, mesmo resultado (25% do HP + 1 Trauma), sem AP, se houver herói em pé. Não há botão na UI para isso hoje; o comando existe no redutor. | `packages/core/src/campaign.ts` → `raiseOutOfCombat` (~702) |
| Q-REINF | O que acontece se o campo for limpo antes do Ciclo em que um reforço está previsto (§44 "fim do Ciclo 2 entra…")? | Os reforços previstos entram antecipadamente; a vitória só ocorre sem ondas pendentes. | `packages/core/src/engine.ts` → `checkEnd` (~477) |
| Q-IMOB | Duração de Imobilizado (§15 só diz "impede movimento voluntário"). | Removido no fim da próxima Ativação que a figura afetada encerrar. O código prevê uma exceção (`counters.activation['imobAppliedNow']`) para estender a duração quando aplicado durante a própria Ativação, mas essa chave nunca é definida em lugar nenhum; por isso, um Imobilizado aplicado durante a própria Ativação (ex.: Selo de Estase disparado no início da Ativação do inimigo) dura só aquela Ativação. | `engine.ts` → `endHeroActivation` (~538) e op `enemyEnd` (~957) |

## B. Interpretações não marcadas no código

| Id (neste doc) | Pergunta | O que o código faz | Onde |
|---|---|---|---|
| Q-TERCEIRA | A Terceira Badalada de Severin substitui a Intenção normal (as "Intenções obrigatórias que substituem compra normal" da §33) ou é um efeito adicional na fase Pesada? | É resolvida **além** da Intenção revelada, no início da faixa Inimigos Pesados, se Ressonância ainda for 3; se Severin tiver uma Intenção Pesada, faz as duas. A Intenção obrigatória `sev_terceira` existe em `severin.obligatory` com `plan` vazio e nunca é revelada (não há `revealOverride:severin`). O Cantor, ao contrário, substitui a Intenção (`revealOverride:cantor`). | `enemies/d1.ts` → handler `bandStart:severin` (~1595), `severin.obligatory` (~1420) |
| Q-VIGIA-CAT | Categoria de ataque das Intenções do Vigia sem movimento (Caçar os Apressados, Medida Exata, Centro da Vigília, Peso da Terceira Hora, Oração Imóvel). | `global` (ignora Formação); só Passo Proibido (mova 2) usa Corpo a Corpo. | `enemies/d1.ts` → `vigiaAttack` (~1203) |
| Q-RESERVA | Quando inimigos da Reserva (excesso acima do teto) entram? | Só quando não resta nenhum inimigo ativo; então entram nas entradas livres. | `engine.ts` → `checkEnd` (~464) |
| Q-TETO-SEVERIN | Severin declara teto 10 (§33 "boss/horda pode declarar teto 10")? | Sim (`enemyCap: 10`). Coerente com o máximo de 7 Penitentes em 5 heróis da §34 (2 iniciais + 5 convocados, mais Severin, Acólito e Escudeiro = 10). | `dungeons/d1/index.ts` (CAM-E01) |
| Q-LEVANTAR-ORDEM | Em Levantar (§50.2: "retorna com 25% do HP máximo atual… recebe 1 Trauma") e Último Fôlego (§50.6: "receba 1 Trauma; retorne com 25%"), o 25% é calculado antes ou depois da redução de HP máximo pelo novo Trauma? | Depois: primeiro aplica o Trauma (−2 HP máx.), depois 25% do novo máximo, arredondado para cima. Ex.: Guerreiro 14 HP → 12 máx., volta com 3. | `packages/core/src/effects.ts` → `raiseHero`, `heroFalls` |
| Q-INTERCEPT | Tiro de Interceptação: a §18.5 diz só "conforme condição de alcance da arma; usa Reação e Mira conforme carta V2". | Dispara quando um inimigo termina movimento voluntário de 2+ conexões num Setor que o arco atinge; custa Reação + 1 Mira; Ataque com os dados da arma, Dano 1 (Olhos no Corredor reduz para 1+ conexão). Marcado como CANONICO no código. | `classes.ts` (passiva ~1101, handler `reaction:afterEnemyMove` ~1534) |
| Q-INTERPOR | Interpor do Escudeiro diz "pode receber o Ataque". Quem decide? | Automático: sempre que as condições valem e o Escudeiro tem o uso do Ciclo, ele intercepta. | `packages/core/src/attack.ts` → `startHeroAttack` (~43) |
| Q-MANTO-ORDEM | Manto do Primeiro Caminho: a escolha CAMINHO/REFÚGIO é "antes das primeiras Intenções". | A escolha é pedida depois que as Intenções do Ciclo 1 já foram reveladas: `startCombat` enfileira o prompt e chama `beginCycle` → `revealIntents` antes de a fila ser processada. O jogador vê as Intenções ao escolher. | `engine.ts` → `startCombat`; `items/d1.ts` → `MANTO.onCombatStart` (~900) |
| Q-CONDICOES-ENTRE-COMBATES | Condições (Veneno, Sangramento, Queimando…) persistem entre Combates da mesma Dungeon? A §28 diz que a Base "remove Condições normais", o que sugere que elas poderiam persistir dentro da Dungeon. | Não persistem: o `HeroRecord` não guarda condições e cada combate começa com `emptyConditions()`. Por isso o uso fora de Combate de Antídoto/Bandagem/Unguento não tem efeito. | `campaign.ts` → `heroFigure`, `writeBack`, `useOutOfCombat` |
| Q-TALENTO-INICIAL | §29 "T1 disponível cedo": o herói começa a D1 com algum Ponto de Talento? | Não: começa com 0 e ganha 1 ao voltar à Base após a D1. Nenhum talento fica ativo durante a D1. | `campaign.ts` → `makeHero` (`talentPoints: 0`), `enterBase` |
| Q-RECOMPENSA-SEVERIN | §44: recompensas de Severin "conforme orçamento aprovado da Dungeon". | 1 Comum + ouro 2/3/3/4/4, para fechar exatamente o orçamento da §30 e o ouro da §31 em ambas as rotas. | `dungeons/d1/index.ts` (CAM-E01) |
| Q-VITRINE | §31: "Não comprado retorna ao pool depois de partir". | Não implementado: as cartas tiradas para a Vitrine saem do baralho e não voltam ao sair da Base (`leaveBase` só muda a fase). Sem efeito prático hoje porque não existe D2. | `campaign.ts` → `enterBase`, `drawShop`, `baseCommand` |

## C. Fora do escopo por decisão (não são ambiguidades)

- Modo Avançado (§3.2, §38, §58): não implementado; o menu mostra "em desenvolvimento".
- Arena/PvP (§39, §45–§48): não implementada.
- Talentos T2–T4 (54): texto presente, `implemented: false`; inalcançáveis na D1 pela §29.
- Itens com `implemented: false` (7): Orbe Gravítico, Couro do Caçador, Cetro do Peregrino, Malha do Peregrino, Luvas de
  Empunhadura, Faixa do Sobrevivente, Grevas do Ímpeto (ver `CONTENT_COVERAGE_D1.md`).
