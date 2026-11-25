# Remake — Mosteiro do Sino Partido

O dono do projeto pediu (2026-11-25): "remake completo", "virar um jogo de verdade", "extremamente fácil de entender",
"tutorial interativo — faça para aprender, sem muito texto", "mais bonito e interessante na batalha e na exploração",
"história, introdução com logo da produtora, logo do jogo, cutscenes", liberdade total para mudar batalha/exploração
(inclusive exploração em tempo real controlando o personagem), "pesquise jogos parecidos", "não economize".
Joga no celular **em pé e deitado** (gira sozinho) e no PC.

Lembrete horário ativo (trigger `trig_01BYrF6qvn9TEHjvW8Z8HQJG`, minuto :17): continuar sem parar durante a noite.
**Desligar quando o dono voltar** (delete_trigger).

## Pilares
1. **Clareza total** — sempre existe UMA coisa brilhando que você pode fazer agora; consequências mostradas antes de confirmar (estilo Into the Breach).
2. **Aprender fazendo** — tutorial interativo com foco/realce, uma ação por vez, frases curtas; dicas contextuais na primeira vez que algo aparece.
3. **Mundo vivo** — explorar o mosteiro andando em tempo real; inimigos visíveis no mapa; tocar neles começa a batalha no mesmo lugar.
4. **História** — produtora + logo + abertura cinematográfica; personagens com fala; cutscenes antes dos chefes e no final.
5. **Beleza e "juice"** — luz, partículas, impacto, transições, som em cada ação.

## Fases
| # | Fase | Dono | Estado |
|---|---|---|---|
| F0 | Pontos de extensão no Diorama (`addFrameHook`, `cameraController`, `pointerOverride`, `setEnvironmentVisible`, `impulse`, modos `world`/`cinema`) | líder | ✅ |
| F1 | **Batalha fácil**: tocar no inimigo = prévia (chance de acerto, dano) + confirmar; herói da vez auto-selecionado; fim de turno automático sem AP; Tempo pré-escolhido ("Lutar!" direto); faixa de iniciativa com retratos; banners "Sua vez"/"Vez dos inimigos"; prévias de ameaça | líder | ✅ |
| F2 | **Tutorial interativo** (motor de passos + foco/realce + mão apontando + mentor com 1 frase) cobrindo: andar, porta, 1ª batalha (selecionar, atacar, dados, defesa), Tempo, Reações/Impulsos, mapa/segredos, saque/equipar; dicas "na primeira vez" | líder | ✅ |
| F3 | **Exploração em tempo real** (`apps/web/src/world`): sala = cenário do local; joystick/WASD/tocar-para-andar; party seguindo; portas = caminhos; inimigos no mapa → transição para batalha; objetos de lore/segredo; minimapa; funciona em pé/deitado/PC | agente World | ✅ |
| F4 | **História e cinema** (`apps/web/src/cinema`): splash da produtora, logo do jogo (SVG), abertura cinematográfica (câmera + legendas + música), cutscenes de chefes (Cantor, Vigia, Severin), final; roteiro em `docs/STORY.md`; elenco (mentor, Abade Severin) | agente Cinema | ✅ |
| F5 | **Pesquisa** de jogos parecidos → `docs/RESEARCH.md` com padrões concretos aplicados | agente Pesquisa | ✅ |
| F6 | **Beleza/juice**: hit-stop, câmera lenta no crítico, números de dano, partículas, transições, luzes; som em todas as interações | líder + agentes | 🔶 |
| F8 | **Arte e animação**: cenários refeitos com o kit KayKit Dungeon Remastered (CC0, mesmo estilo dos personagens), luz/pós-processamento, coreografia de combate (avanço, hit-stop, câmera, crítico em câmera lenta, mortes), vida no idle; cenas por dungeon | agente Arte | ✅ |
| F7 | **QA e publicação**: E2E novos (tutorial, mundo, cinema), celular em pé/deitado (384×832, 832×384), PC; publicar; prints | líder | 🔶 |

## Escopo do jogo
- O jogo completo tem **6 dungeons**. O remake foca na Dungeon 1, mas tudo (cenários, mundo, cutscenes, tutorial, conteúdo,
  equipamentos e inimigos novos) é estruturado por dungeon para as próximas entrarem sem retrabalho.

## Decisões de design
- Batalha continua **tática por turnos** (motor de regras testado), mas a interface esconde a complexidade:
  regras avançadas aparecem só quando relevantes; tudo tem padrão inteligente; o jogador pode jogar só tocando
  no herói brilhando e no inimigo.
- Exploração vira **tempo real**; as escolhas de caminho do motor de campanha viram portas físicas no cenário
  (o motor não muda: entrar numa porta envia o mesmo comando `explore`).
- Mesmo cenário para explorar e lutar: ao encostar nos inimigos o tabuleiro **surge** no chão da sala.
- Produtora: **Uchihadam Production** (nome dado pelo dono; constante `STUDIO` em `apps/web/src/cinema/brand.ts`).

## Registro
- 2026-11-25 — F0 feito; agentes World, Cinema, Pesquisa e Arte disparados; líder em F1/F2. Produtora: Uchihadam Production.
- 2026-11-25 — F1 feito (prévia de ataque em 2 toques, inimigos atacáveis brilham, linhas de ameaça, fluxo automático,
  Tempo pré-escolhido + linha do tempo, chamadas de turno, chance de bloqueio, impulsos auto-gastos), **dados 3D de verdade**
  e dano flutuante grande. F2: capítulo da 1ª batalha + dicas de primeira vez + ligar/desligar/rever. Pesquisa pronta em
  docs/RESEARCH.md. Falta no F2: capítulos de exploração (após World), saque/equipar, mentor Irmão Anselmo (após Cinema).
- 2026-11-25 (tarde) — Batalha: desfazer movimento; previsão exata (simula o golpe ~100× nas regras reais: acerto %,
  dano mín–máx, chance de derrubar, dados, Impulso); caveira sobre inimigos que dá para derrubar; dados que se explicam
  (✗ ✓ ✦ ✹, "azar: só 1 em N", legenda nas primeiras rolagens); dica e botão Encerrar quando não há ataque.
- 2026-11-25 (tarde) — Integrados: Arte (salas KayKit para os 11 locais, luz/pós por qualidade, tabuleiro novo,
  coreografia de golpe/crítico/morte), World (exploração em tempo real, portas = caminhos, batalha nasce na sala),
  Cinema (splash Uchihadam Production, logo, abertura de 51 s, chefes, final, docs/STORY.md). Tutorial: Irmão Anselmo
  como mentor + capítulo "primeiros passos" no mundo. Próximo: F6 polimento (juice, sons), F7 E2E de mundo/cinema,
  verificação em pé/deitado/PC; Cárceres em pé renderizou preto numa captura (investigar).
