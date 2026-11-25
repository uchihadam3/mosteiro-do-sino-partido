# Pesquisa: como os melhores jogos tornam tática complexa fácil e divertida

> Fase F5 do remake ([`REMAKE_PLAN.md`](REMAKE_PLAN.md)), 2026-11-25; [n] aponta para a seção 8. Tudo aqui é apresentação,
> padrão inteligente, roteiro de tutorial ou seed: nenhuma regra do motor muda. Comando novo = **(decisão do líder)**.

## 1. Resumo executivo: as 15 mudanças de maior impacto

1. **A Intenção se lê num olhar.** Cada tipo inimigo mostra um ícone com o número exato, o selo de Tempo e uma seta até o
   alvo, e no herói pisca a fatia de PV que ele vai perder ("−2"; caveira se for letal) [1][2][3][6].
2. **Prever antes de confirmar, em dois toques.** Tocar no inimigo abre a Previsão (acerto %, dano mín–máx, chance de
   matar, efeito do Impulso), e só o botão dourado executa: inspecionar nunca dispara uma ação [7][8][22].
3. **Uma faixa do Ciclo com 6 casas (HR→ER→HT→ET→HP→EP).** Escolher um Tempo desliza o retrato do herói, ao vivo, para
   antes ou depois do golpe inimigo [34][32][30].
4. **Jogar em 60 segundos.** Splash ≤2 s, logo ≤3 s, um único botão e uma abertura que termina com o herói andando no
   Pórtico; a primeira luta é roteirizada e impossível de perder [11][50][16][20].
5. **Padrões inteligentes escondem cada regra até ela importar.** O Tempo vem sugerido com o motivo, o Impulso é gasto
   sozinho até ser ensinado e a Reação só aparece quando muda o resultado [11][56].
6. **Uma coisa brilhando e uma frase de até 8 palavras.** Um único elemento dourado por vez; a dica só aparece para quem
   erra ou hesita, sem pausar [15][12].
7. **Dados que se explicam.** Cada face vira ✗, ✓, ✦ ou ✹ e voa até o alvo, e um erro improvável ganha uma explicação
   curta [28][29].
8. **Juice com hierarquia.** O hit-stop cresce com o dano, a tela treme só no crítico e na morte, a câmera lenta fica para
   o golpe final e o som vem em camadas, sempre respeitando "Reduzir movimento" [51][52][53][49].
9. **Explorar com joystick flutuante e tocar-para-andar ao mesmo tempo,** com botão de contexto grande, câmera 3/4 fixa e
   paredes que desbotam [42][14][63].
10. **A batalha nasce na própria sala.** O inimigo percebe a party, a câmera sobe e os setores emergem do piso, com uma
    transição diferente para comum, miniboss, chefe e segredo [41][40][39].
11. **Guiar com luz e som, não com setas.** Uma trilha de brasas acende sob demanda, velas marcam o caminho principal e o
    sino rachado serve de farol [61][60].
12. **Voz e drama.** O mentor diz uma frase por evento marcante, os barks são curtos e têm prioridade e cooldown, e
    Caído, Último Fôlego e o crítico decisivo ganham uma pausa dramática [18][19][62].
13. **Lore sem paredão de texto.** Tocar num objeto mostra uma linha e o texto completo vai para um Arquivo que se
    preenche jogando; cutscenes de chefe duram até 30 s e podem ser puladas segurando o dedo [31][48].
14. **Ergonomia por orientação.** Em pé, tudo o que se toca fica no terço inferior; deitado, sob o polegar direito. Alvos
    têm ≥44 pt e nada depende de hover [46][47][42][13][21].
15. **Sessões de 5–8 minutos, com recompensa em cada sala.** O autosave roda a cada comando, "Continuar" volta ao ponto
    exato e o espólio tem cerimônia [58][12].

## 2. Onboarding e tutorial

### 2.1 Princípios

- **Fazer, não ler.** Frases de até 8 palavras, uma mecânica por passo e mensagens adaptativas que não pausam o jogo
  [15]. O cenário ensina, como o 1-1 de Mario [59].
- **A primeira luta é roteirizada e não dá para perder.** O Hogger do Hearthstone não tem poder heroico nem mulligan, e as
  cartas custam 0 [16]; o Darkest Dungeon começa com 2 heróis numa estrada sem recuo [20]. Aqui, o GAL-E01
  usa **seed fixa e escolhas guiadas**: como o motor é determinístico, os dados saem como planejado.
- **Capítulos curtos.** O Clash Royale usa 5 tutoriais [11]; o Marvel Snap espalha as mecânicas por várias partidas
  [10][66] e preferiu mudar uma carta a criar uma regra [9]. "Já sei jogar" pula tudo, a Ajuda revê cada lição [11] e
  um holofote com uma mão mostra onde olhar [57].
- **Party sugerida: Guerreiro + Clérigo.** Com 2 heróis, o GAL-E01 tem 3 Penitentes e nenhum reforço; com 3, um Acólito
  chega no fim do Ciclo 2.

### 2.2 Os primeiros 10 minutos

| # | min | Jogador faz | Destaque | Mentor |
|---|---|---|---|---|
| 1 | 0:00 | Abre o jogo | Splash ≤2 s, logo ≤3 s; um toque pula | — |
| 2 | 0:05 | Toca "Começar" | Um único botão dourado, sem menu | — |
| 3 | 0:10 | Vê a abertura (40–60 s) | Legendas; "segure para pular" | (narração) |
| 4 | 1:00 | Arrasta o polegar (PC: WASD) | Polegar-fantasma; brasas até a bacia de cinzas | "Arraste para andar." |
| 5 | 1:20 | Toca na bacia | Bacia brilha; botão com ícone de mão | "Toque para examinar." |
| 6 | 2:00 | Vai à porta interna | Velas acesas só nessa porta | "Toque na porta." |
| 7 | 2:20 | Entra na Galeria | Um Penitente ergue a cabeça: "!" | "Encoste neles para lutar." |
| 8 | 2:45 | Lê a Intenção | Garra "2", seta até ele, "−2" piscando no PV | "Eles vão atacar. Ataque primeiro!" |
| 9 | 3:00 | Toca no Penitente | Previsão "Acerto 75% · Dano 2" | "Toque no inimigo." / "Confirme." |
| 10 | 3:10 | Vê os dados (a seed garante o acerto) | As faces viram ✓; legenda "1–2 ✗" | "Só 1 e 2 erram." |
| 11 | 3:30 | Toca "Defender" | Dado de Guarda; escudos estouram | "Cada ✓ bloqueia 1 de dano." |
| 12 | 4:15 | Se move (Ciclo 2) | Só os setores válidos acendem; custo em pips | "Corpo a corpo: mesma coluna." |
| 13 | 5:15 | Escolhe o Tempo (Ciclo 3) | O retrato desliza para antes da Intenção | "Rápido age antes deles." |
| 14 | 6:15 | Escolhe um Impulso (a seed garante um ✦) | O ✦ voa até "Empurrar 1" | "Impulso! Escolha um extra." |
| 15 | 7:00 | Recebe Ajuda (Ciclo 4) | Anel no Clérigo ao lado; "+D4" | "Aliado ao lado pode ajudar." |
| 16 | 7:45 | Vence | Baú e botão "Equipar" | "Equipe com um toque." |
| 17 | 8:30 | Chega ao Claustro | Arcadas Leste ("curta") e Oeste ("longa") | "Escolha seu caminho." |
| 18 | 9:30 | Continua | Vela do autosave; linha "Próximo objetivo" | "Seu progresso é salvo sozinho." |

O motor de passos espera eventos reais (comando, movimento, dado), escurece o resto e grava o que já foi ensinado.

### 2.3 Dicas na primeira vez

Cada dica aparece uma vez, sem pausar, e fica no glossário (toque longo no ícone), como o detalhe que o Into the Breach
no celular deixa a um toque [5].

- **Posição:** Cobertura "−1 de dano à distância." · alvo protegido "A Frente protege a Retaguarda." · Engajamento
  "Sair do combate custa +1 PA."
- **Condições:** "Sangrando: perde PV ao mover ou atacar." · "Veneno: dano no fim da sua vez." · "Queimando: 1 dano por
  Ciclo. 1 PA apaga." · "Imobilizado: não anda." · "Atordoado: −1 PA."
- **Estados:** "Exposto: próximo ataque usa dado maior." · "Quebrado: −1 armadura no próximo golpe." · "Guardado: próximo
  dano −1."
- **Primeiro 12 num D12:** "Crítico! +1 dano, ignora 1 de armadura."
- **Queda:** "Caído! Aliado ao lado levanta: 2 PA." · "Trauma: −2 PV máximo nesta dungeon."
- **Outros:** reforços "Entram aqui no fim do Ciclo N." · Cantil "+3 PV por 1 PA." · objetivo "Fique aqui, gaste PA e
  teste." · Severin "Ressonância 2: ele fica Exposto." · Base "Maestria e Talento novos: gaste aqui." · segredo "Algo
  mudou no mosteiro…" (sem nomes).

## 3. Batalha

### 3.1 Legibilidade

- **Intenções.** Um cartão por tipo ("Penitentes ×3 · Fome · ⚡ · 2") e um mini-ícone numerado em cada figura. As famílias
  de ícone (garra, virote, onda, corrente, pegadas, escudo, sino) sempre combinam número, forma e cor [6]. A seta mostra
  a defesa e o bloqueio esperado ("Guarda D6: bloqueia 1 em 67%").
- **Passivas no número.** Multidão Oca e Caça ao Isolado viram "+1" na seta; a Mira Apoiada do Besteiro risca o ícone de
  Cobertura.
- **Reforços anunciados.** Portal e "fim do Ciclo 2" nos setores de entrada, como os Vek de Into the Breach [3].
- **Ordem visível.** Faixa do Ciclo e um número de ordem sobre cada figura [32]. A armadura vira um escudo numerado que
  racha com Quebrado, como em Octopath [30].
- **Zona de perigo.** Um botão pinta de vermelho os setores atingidos neste Ciclo, como a Danger Area do FEH [23]. O
  destino mostra "−2", "+1 PA", Cobertura ou "Isolado +1", como o XCOM marca um destino flanqueado [25].
- **Só o alvo válido brilha.** Tocar num inválido explica o motivo: "Fora da coluna", "A Frente protege", "Faltam PA".
- **Chefes.** A Ressonância de Severin e o Canto do Cantor são rachaduras que acendem no sino, uma contagem regressiva à
  vista como os contadores do Wildfrost [37].
- **Celular.** As Intenções aparecem grandes no início do Ciclo e depois encolhem para a faixa [5].

### 3.2 Tocar, prever, confirmar

1. **Banner** "Intenções reveladas" por 1 s, com `intent_reveal`.
2. **Tempo** sugerido com o motivo ("Rápido: foge da Fome"); "Lutar!" confirma, e trocar mostra a faixa mudando ao vivo
   [34]. Cada botão diz a consequência: **Rápido** "2 PA + passo · antes deles", **Tático** "3 PA", **Pesado** "3 PA ·
   D8→D10 · age depois".
3. **Herói da vez** selecionado sozinho, com os PA em pips; o inimigo com mais chance de morrer brilha mais.
4. **Previsão** numa folha inferior: "Acerto 75% · Dano 2–3 · Mata 40% · Impulso 38%: Empurrar 1", com o botão dourado
   "Atacar". O motor já fornece `successDistribution`.
   - **Acerto:** D4 50%, D6 67%, D8 75%, D10 80%, D12 83%.
   - **Impulso:** D6 17%, D8 38%, D10 e D12 50%.
   - **Crítico:** só no D12 (8%).

   No FEH, arrastar e segurar mostra a previsão sem atacar [22]; no PC, o hover faz o mesmo.
5. **Mover:** o toque no setor mostra caminho, custo e ameaça, e o segundo toque confirma. Um **desfazer movimento**
   antes de rolar, como em Into the Breach, FE Engage e Tactics Ogre [4][24][33], é **(decisão do líder)**: exige
   snapshot no cliente e, no online, voto.
6. **Fim da ativação** automático sem PA úteis; "Encerrar" só aparece quando há escolha.
7. **Defesa:** a câmera vai ao herói e o botão "Defender" mostra os dados. Uma única Reação é sugerida, com o ganho
   ("Ajuda do Clérigo +D4: +0,5 bloqueio"); como o Ciclo é conhecido, o jogo pode avisar "Guarde a Reação: o Besteiro
   atira depois".
8. **Vez dos inimigos** em ×1, ×2 ou ×3, e um toque acelera; o XCOM 2 ganhou um "Zip Mode" por isso [26].

**Layout.** Em pé, faixa no topo, tabuleiro no meio (as 5 colunas cabem) e ações no terço inferior. Deitado, Intenções à
esquerda e ações à direita. Menus ficam nos cantos superiores, com um só botão amarelo por tela [42][12][13]. Metade das
pessoas usa o celular com uma mão, e o toque erra menos no centro (7 mm) que nos cantos (12 mm) [46][47].

**Honestidade com o dado.** O XCOM 2 esconde um bônus de mira após erros [27]. Nós mostramos o número real e explicamos o
azar ("1 em 4"): punição explicada preserva a confiança [29]. Cada `DomainEvent` tem som e efeito (`block_shield`,
`guard_break`, `cond_*`, `dice_critical`), detalhados na seção 6.

### 3.3 Esconder e revelar a complexidade

| Mecânica | Antes de ser ensinada | Quando e como aparece |
|---|---|---|
| Tempo | Sugerido; "Lutar!" confirma | Batalha 1, Ciclo 3: 3 botões com a consequência |
| PA | Pips; a vez termina sozinha | Sempre: custo em pips em cada botão |
| Impulsos | Gasto automático, com aviso | 1º ✦: cartões com um recomendado; Ajustes "Automático/Perguntar" |
| Reação | Sugerida só se muda o resultado | Ciclo 4: ícone de mão no retrato (1 por Ciclo) |
| Coluna, Engajamento, Cobertura | Só aparecem alvos e custos válidos | 1ª vez: motivo em 4 palavras, "+1 PA", escudo "−1" |
| Condições | Ícone com número | 1ª aplicação: dica de 1 linha |
| Caído, Levantar, Trauma | — | 1º herói caído: pausa e "Levantar (2 PA)" no aliado |
| Mecânica de classe (Sequência, Julgado, Matriz Rúnica, Liturgia, Faixas, Furtivo) | O botão diz o efeito em palavras | 1º uso: medidor no retrato |
| Objetivos | Marcador no setor | Início do encontro: "Fique aqui · PA · Teste" |

Quem aprende primeiro um núcleo pequeno domina melhor o avançado [56]; o Monster Train 2 tirou do jogo base um sistema
complexo demais [38].

## 4. Exploração em tempo real

### 4.1 Controles

| | Em pé | Deitado | PC |
|---|---|---|---|
| Andar | Joystick flutuante na metade de baixo, que some quando parado [42]; ou tocar no chão | Joystick flutuante à esquerda; ou tocar no chão | WASD/setas ou clique |
| Interagir | Tocar no objeto, ou botão de contexto ≥56 pt no canto inferior direito, com ícone [42] | Botão sob o polegar direito | E, Espaço ou clique |
| Câmera | Fixa; pinça faz zoom | Arrastar à direita gira ±25° (opcional) | Roda do mouse faz zoom |
| Menus | No topo | No topo | Esc, M, I |

O Brawl Stars testou joystick e tocar-para-andar em pé; o joystick venceu, e a mira de dois polegares levou o jogo à
paisagem [14]. Sem mira em tempo real, um polegar basta, como no Archero [45]; o joystick fixo é a crítica comum ao
Genshin [43].

### 4.2 Câmera

- **Enquadramento e movimento.** Visão 3/4 de cima, com ângulo fixo por sala, como no Diablo Immortal, feito primeiro
  para celular [44]. Segue com ~0,25 s de atraso e olha à frente; em pé, sobe para caber a largura da sala.
- **Oclusão e entrada.** Paredes entre câmera e herói desbotam [63]. Ao entrar, um plano de 1,2 s vai da porta ao herói
  e mostra a saída.

### 4.3 Guiar o jogador

- **Portas.** Velas acesas = caminho principal, porta escura = opcional, corrente = trancada; cada escolha do `explore`
  vira uma porta com placa curta.
- **Trilha de brasas.** Acende sob demanda (bússola, ou 20 s parado) e some conforme o jogador explora, como em Fable II
  [61]. Cinza e chamas se inclinam para o objetivo, como o vento de Ghost of Tsushima [60].
- **Marco.** O Campanário aparece nas janelas e o sino (`bell_toll_short`) toca a cada local novo.
- **Ambiente.** Som e luz contam a sala, como em Grimrock e Dreadrock [36][35].

### 4.4 Transição para a batalha (cerca de 1,5 s)

**0,0 s** o inimigo percebe ("!") e o mundo desacelera (0,3×) · **0,3 s** a câmera sobe e a música abaixa · **0,6 s** a
luz desenha a grade e os setores emergem do piso (`whoosh_transition`) · **1,2 s** as figuras deslizam e entra
`music_combat` · **1,5 s** banner "Intenções reveladas".

O modelo é Chrono Trigger [41] e Legends: Arceus [40]. Como nos Pokémon de Game Boy, a transição muda com o tipo de luta
[39]: comum, redemoinho de cinza; miniboss, sino longo; chefe, cutscene; segredo, `sting_secret` dourado. Os inimigos
ficam parados e visíveis, sem perseguição.

### 4.5 Segredos

- **Sinais.** Brilho intermitente, sussurro perto dos interativos e bilhetes de "um visitante anterior" como pista [35].
- **Contagem.** Um contador "segredos 1/2" por local, sem dizer qual falta [36].
- **Anti-spoiler.** Nada de silhueta, nome ou "???" antes de `st.revealed` (§37).
- **Revelação.** Toca `sting_secret`, a câmera mostra a passagem aberta e o local entra no mapa.

## 5. História e cinema

- **Splash e logo.** Uchihadam dura até 2 s (entra em 0,4 s, fica 1,2 s, sai em 0,4 s) e o logo até 3 s, com a badalada
  rachada; um toque pula [50]. Nas próximas vezes, o jogo abre direto no título, com "Continuar" [11].
- **Abertura.** Dura 40–60 s, é feita no motor, mostra legendas desde o primeiro som [48], pula com 0,8 s de toque
  segurado e termina no herói já jogável no Pórtico [50].
- **Cutscenes.** As de chefe (Cantor, Cavaleiro, Severin) têm até 30 s e o final, 60–90 s, com letterbox e falas de até 2
  linhas. Cada uma ensina a mecânica do chefe: a de Severin mostra a Ressonância subindo.
- **Mentor e narrador.** Uma frase por evento marcante. O narrador do Darkest Dungeon entra "de vez em quando", trata o
  sucesso como surpresa e a derrota como inevitável, e guarda as melhores falas [19].
- **Barks.** Até 6 palavras: 1ª vista de um tipo, crítico, morte, PV baixo, aliado Caído ou Levantado, espólio raro,
  segredo. Uma fila com prioridade e cooldown dá 8–12 s entre falas e repete uma fala só após ~10 min [62]. Exemplos:
  Guerreiro "Fica de pé. Eu seguro."; Clérigo "Respira. Ainda não é a hora."; Ladino "Ele nem me viu."
- **Drama.** Caído, Último Fôlego, Trauma e o crítico decisivo ganham faixa, pausa e tela cheia, como as Aflições [18],
  no máximo um por Ciclo.
- **Lore.** Uma linha ao tocar (o porteiro cego, a bacia de cinzas, as Sete Linhas); o resto vai para um Arquivo que se
  preenche jogando, como o Codex de Hades. O mentor reage ao que aconteceu ("O Canil de novo?"), porque Hades quer que o
  jogador sinta que "o jogo está prestando atenção" [31].
- **Derrota.** O wipe continua sendo a punição máxima (§2), mas destrava uma linha do Arquivo. O Hades quis "tirar a dor
  de morrer" [31].

## 6. Beleza e juice

Game feel = controle + espaço + polimento [54]; camadas pequenas transformam um jogo sem graça [51][52], e o Hearthstone
trata a interface como objeto físico [17]. Quanto maior o evento, maior o efeito, e um efeito grande por vez.

| P | Efeito | Parâmetros |
|---|---|---|
| P0 | Hit-stop | 60–80 ms com dano 1–2; 120–160 ms com dano ≥3 ou crítico; congela atacante e alvo [65][53] |
| P0 | Números | Escala 0→1,25→1 em 180 ms (easeOutBack), sobem 30 px e somem em 600 ms. Cores: branco (dano), dourado (crítico), roxo (Dano Direto), verde (cura), azul (bloqueio) |
| P0 | PV com rastro | O trecho perdido some após 300 ms; a Intenção pisca esse mesmo trecho antes |
| P0 | Flash | Alvo branco por 2 quadros; herói ferido ganha vinheta vermelha de 250 ms |
| P0 | Dados físicos | Rolam 600–800 ms (`dice_roll` → `dice_land`); as faces viram ícones que voam; o crítico explode em dourado (`dice_critical`) |
| P0 | Toque | Botão encolhe a 0,94× em 80 ms e volta com overshoot; telas entram em 225 ms e saem em 195 ms [55]; só o botão principal pulsa |
| P1 | Tremor | 4–8 px por 150–250 ms, só em crítico, morte e golpe de chefe; "Reduzir movimento" desliga [49] |
| P1 | Câmera lenta | 0,3× por 0,35 s com zoom de 8% no golpe final; no máximo uma por Ciclo |
| P1 | Partículas | Penitentes e Cães viram cinza; faíscas no metal; motas douradas (Radiante), névoa roxa (Profano) |
| P1 | Som | Whoosh (`swing_*`), impacto do material (`hit_flesh`, `hit_metal`) e voz; a música abaixa no crítico |
| P1 | Luz | Tochas, contraluz no herói ativo, chão vermelho sob os alvos, sino brilhando conforme a Ressonância |
| P1 | Banners | Entram em 250 ms, ficam 900 ms e saem em 200 ms (`turn_start`, `cycle_start`) |
| P2 | Vibração | Android: 10 ou 30 ms. O Safari do iOS não tem `navigator.vibrate` [64] |
| P2 | Espólio | O baú treme 0,4 s, abre com a luz da raridade e toca `sting_reward` |

**Desempenho.** Em celular fraco, corte partículas e luzes antes; hit-stop, números e som ficam.

## 7. Retenção e motivação

- **Sessão.** Mediana de 5–6 min no celular; quartil superior, 8–9 min [58]. Cada sala é um encontro de 4–7 min, com
  autosave a cada comando e "Continuar" no meio da luta.
- **Progresso visível.** O mapa se ilumina e há sempre um "Próximo objetivo"; Bestiário (13 perfis), Arquivo e segredos
  contados por local.
- **Recompensa por sala.** O espólio é fixo (§59), então a graça é a cerimônia, como nos baús do Clash Royale [67]; setas
  verdes e vermelhas comparam o item, e "Equipar" vem sugerido.
- **Base.** +1 Maestria e +1 Talento chegam com animação e um único botão.
- **Rejogar.** "Finais 1/2", as rotas Leste e Oeste, parties de 1 a 5 heróis e os segredos.
- **Derrota que ensina.** Um resumo mostra os 3 momentos decisivos e a Intenção que causou cada um [29]. "Tentar de novo"
  fica a um toque.
- **Sem armadilhas.** Nada de login diário ou timers: quem traz o jogador de volta é a história, como em Hades [31].
- **Co-op.** De quem é a vez, prévia do alvo compartilhada e votos com contagem.

## 8. Fontes

1. Game Developer, Into the Breach e clareza: https://www.gamedeveloper.com/design/-i-into-the-breach-i-dev-on-ui-design-sacrifice-cool-ideas-for-the-sake-of-clarity-every-time-
2. Game Developer, Into the Breach (IGF): https://www.gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-
3. Kotaku, análise de Into the Breach: https://kotaku.com/into-the-breach-the-kotaku-review-1823365331
4. PC Gamer, dicas de Into the Breach: https://www.pcgamer.com/into-the-breach-tips/
5. PocketGamer.biz, Into the Breach no celular: https://www.pocketgamer.biz/interview/79115/subset-games-matthew-davis-into-the-breach-netflix/
6. Wikipedia, Slay the Spire: https://en.wikipedia.org/wiki/Slay_the_Spire
7. Android Central, Slay the Spire no Android: https://www.androidcentral.com/slay-spire-android-game-week
8. TheSixthAxis, Slay the Spire mobile: https://www.thesixthaxis.com/2021/03/03/slay-the-spire-mobile-review/
9. Mobilegamer.biz, onboarding do Marvel Snap: https://mobilegamer.biz/second-dinner-reveals-the-secrets-of-marvel-snaps-onboarding-and-card-design/
10. GameRant, Marvel Snap: https://gamerant.com/marvel-snap-best-mobile-card-game/
11. Apple, Onboarding for Games: https://developer.apple.com/app-store/onboarding-for-games/
12. The Rookies, UX do Clash Royale: https://www.therookies.co/blog/game-design-ux-best-practices-detailed-breakdown-of-clash-royale/
13. PocketGamer.biz, modo retrato: https://www.pocketgamer.biz/comment-and-opinion/62882/how-portrait-mode-trumped-tablet-first-gaming/
14. Newsweek, controles do Brawl Stars: https://www.newsweek.com/entertainment/video-games/brawl-stars-update-landscape-controls-upgrade-system-new-mode-838786
15. Game Developer, 10 dicas de tutorial (PvZ): https://www.gamedeveloper.com/design/gdc-2012-10-tutorial-tips-from-i-plants-vs-zombies-i-creator-george-fan
16. Hearthstone Wiki, Hogger: https://hearthstone.fandom.com/wiki/Hogger_(boss)
17. Blizzard Watch, UI do Hearthstone: https://blizzardwatch.com/2015/03/07/gdc-takes-a-look-behind-the-scenes-of-hearthstone-development
18. Game Developer, Aflições do Darkest Dungeon: https://www.gamedeveloper.com/design/game-design-deep-dive-i-darkest-dungeon-s-i-affliction-system
19. Game Developer, narrador do Darkest Dungeon: https://www.gamedeveloper.com/business/-i-darkest-dungeon-i-designing-for-despair-and-kicking-you-when-you-re-down
20. Darkest Dungeon Wiki, Estrada Velha: https://darkestdungeon.wiki.gg/wiki/Locations_(Darkest_Dungeon)
21. 148Apps e App Store, Darkest Dungeon no tablet: https://148apps.com/reviews/darkest-dungeon-tablet-edition-review · https://apps.apple.com/us/app/id1199831446
22. Guia oficial do FEH, previsão de combate: https://new-guide.fire-emblem-heroes.com/en-GB/feh-3460.html
23. Guia oficial do FEH, Danger Area: https://new-guide.fire-emblem-heroes.com/en-GB/feh-1110.html
24. GINX, Time Crystal do FE Engage: https://www.ginx.tv/en/engage-rewind
25. UFOpaedia, cobertura no XCOM: https://ufopaedia.org/index.php/Cover_(EU2012)
26. GameBanshee, Zip Mode do XCOM 2: https://gamebanshee.com/kxh9w
27. Giant Bomb, mira oculta no XCOM 2: https://www.giantbomb.com/profile/mirado/blog/xcom-2-is-un-fair/112632/
28. Game Informer, Sid Meier: https://gameinformer.com/b/news/archive/2010/03/12/sid-meier-gamers-arent-logical
29. GameDev.net, Sid Meier: https://www.gamedev.net/blogs/entry/2111213-the-psychology-of-game-design-sid-meier
30. Gamer Guides e Nintendo Life, Octopath: https://www.gamerguides.com/octopath-traveler/guide/the-basics/game-mechanics/battle-system · https://www.nintendolife.com/guides/octopath-traveler-beginners-faq-best-characters-breaks-and-boosts-and-path-actions-explained
31. Game Developer, narrativa de Hades: https://www.gamedeveloper.com/design/how-supergiant-weaves-narrative-rewards-into-i-hades-i-cycle-of-perpetual-death
32. Game8, turnos em Triangle Strategy: https://game8.co/games/Triangle-Strategy/archives/368789
33. RPGamer e Gematsu, Tactics Ogre Reborn: https://rpgamer.com/review/tactics-ogre-reborn-review/ · https://www.gematsu.com/2022/10/tactics-ogre-reborn-details-skills-battlefield-wheel-of-fortune-chariot-tarot-world-tarot-more-classes-and-characters
34. Giant Bomb, CTB do FFX: https://giantbomb.com/wiki/Concepts/Conditional_Turn_Based_Battle
35. GamingonPhone, Dungeons of Dreadrock: https://gamingonphone.com/interviews/indie-spotlight-how-dungeons-of-dreadrock-2-builds-on-its-legacy
36. Engadget e GameBanshee, Legend of Grimrock: https://www.engadget.com/2012-04-27-legend-of-grimrock-review.html · https://gamebanshee.com/legendofgrimrock/secrets.php
37. Wildfrost Wiki e PC Gamer, contadores: https://wildfrostwiki.com/Counter · https://www.pcgamer.com/wildfrosts-cute-art-disguises-a-deckbuilder-thats-cold-as-ice
38. GamePressure, Monster Train 2: https://www.gamepressure.com/newsroom/shiny-shoe-ceo-mark-cooke-explains-why-monster-train-needed-a-seq/zd8975
39. pokered, transições de batalha: https://v10.next.forgejo.org/foster/pokered/src/branch/master/engine/battle/battle_transitions.asm
40. Pokémon Legends: Arceus, site oficial: https://legends.arceus.pokemon.com/en-ca/gameplay
41. Game Developer, Chrono Trigger: https://gamedeveloper.com/design/four-key-design-decisions-to-i-chrono-trigger-i-s-sense-of-freedom
42. Apple HIG, Game controls: https://developer.apple.com/design/human-interface-guidelines/game-controls
43. Game8 e Destructoid, Genshin no celular: https://game8.co/games/Genshin-Impact/archives/296710 · https://vip-develop.destructoid.com/?p=260491
44. Blizzard, Diablo Immortal: https://news.blizzard.com/en-us/article/23797159/pc
45. Game Developer, Archero: https://gamedeveloper.com/design/finding-the-fun-archero-part-1---gameplay
46. UXmatters, como seguramos o celular: https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php
47. UXmatters, precisão do toque: https://www.uxmatters.com/mt/archives/2017/07/design-for-fingers-touch-and-people-part-3.php
48. Game Accessibility Guidelines, orientações e legendas: https://gameaccessibilityguidelines.com/allow-play-in-both-landscape-and-portrait/ · https://gameaccessibilityguidelines.com/ensure-subtitles-captions-are-or-can-be-turned-on-before-any-sound-is-played
49. Xbox Accessibility Guideline 117: https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117
50. Game Developer, introduções imersivas: https://www.gamedeveloper.com/design/how-to-create-immersive-game-intros
51. GDC Vault, Juice It or Lose It: https://gdcvault.com/play/1016487/Juice-It-or-Lose
52. Game Developer, Vlambeer: https://gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games
53. Kotaku e Source Gaming, Sakurai e o hit-stop: https://kotaku.com/super-smash-bros-masahiro-sakurai-game-design-youtube-1849457235 · https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/
54. Wikipedia, Game feel: https://en.wikipedia.org/wiki/Game_feel
55. Material Design, duração e easing: https://m1.material.io/motion/duration-easing.html
56. Nielsen Norman Group, Progressive Disclosure: https://www.nngroup.com/articles/progressive-disclosure/
57. Creative Bloq, Celia Hodent: https://www.creativebloq.com/features/how-neuroscience-and-ux-impacts-video-game-design
58. GameDevReports, GameAnalytics 2025: https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks
59. Game Developer, World 1-1: https://gamedeveloper.com/design/how-miyamoto-built-i-super-mario-bros-i-legendary-world-1-1
60. Android Central e USgamer, Ghost of Tsushima: https://www.androidcentral.com/ghost-tsushima-creative-director-interview · https://www.usgamer.net/articles/ghost-of-tsushima-interview-guiding-wind-sie-japan-studio
61. GamesRadar, trilha de Fable 2: https://gamesradar.com/fable-2-fresh-look/2
62. Pulse Geek e Stray Spark, barks: https://pulsegeek.com/articles/dialogue-barks-timing-and-cooldown-best-practices/ · https://www.strayspark.studio/docs/godot-dialog-system/barks
63. gamedev.net, oclusão estilo Diablo: https://gamedev.net/blogs/33/entry-2259316-third-person-camera-ghosting-blender-cycles-baking-other-stuff/
64. MDN e caniuse, Vibration API: https://developer.mozilla.org/docs/Web/API/Vibration_API · https://caniuse.com/vibration
65. Game Juice, hit-stop: https://gamejuice.pages.dev/articles/hit-stop-frame-trick
66. Massively OP, Marvel Snap: https://massivelyop.com/2022/11/11/first-impressions-of-marvel-snap-an-addictive-mobile-card-game-by-hearthstones-former-director/
67. Game Developer, desconstrução do Clash Royale: https://www.gamedeveloper.com/design/clash-royale---deconstructing-supercell-s-next-billion-dollar-game
