# História — Mosteiro do Sino Partido

Roteiro, elenco e regras de narrativa do remake. Construído sobre os textos canônicos da Dungeon 1
(`packages/content/src/dungeons/d1/index.ts`: chegadas, intros/outros de encontro, Arquivo, epílogos) e sobre o lore
dos inimigos (`packages/content/src/enemies/d1.ts`). Nada aqui muda regras do jogo.
Implementação das cenas: `apps/web/src/cinema/` (roteiros em `d1.ts`).

## Premissa

O Mosteiro do Sino guardava um sino que só podia soar uma vez: a **Última Badalada**, a que chamaria toda alma ao
alcance do som a se ajoelhar diante do juízo. Há décadas, o **Abade Severin** decidiu que a hora tinha chegado.
Tirou a corda das mãos do sineiro e tocou o sino até rachá-lo. A badalada não terminou — o som **ficou preso dentro
do bronze** ("O som nunca parou — apenas ficou do lado de dentro").

Desde então o mosteiro é cinza. Os monges que estavam ajoelhados nunca se levantaram (Penitentes Ocos); os acólitos
ainda tocam sinos de mão para fiéis que não vêm; os cães da Vigília caçam peregrinos perdidos. E o sino, rachado,
**tenta terminar a sua badalada**: o Cantor afina uma nota por noite, e cada noite o chamado desce a montanha mais
alto. Quando a nota final chegar, algo no Campanário vai responder.

## Tom

Gótico melancólico, nunca gore. Silêncio, cinza, bronze, vela. Frases curtas. Humor seco só na voz do mentor.
O horror é a **devoção que não acabou** — ninguém aqui é maligno por gosto; todos ficaram presos no mesmo instante.
Vitória = silêncio. A recompensa emocional do capítulo é o momento em que o sino **não** toca.

## Por que a party está lá

Os heróis são **peregrinos do Refúgio dos Peregrinos**, a hospedaria ao pé da montanha (a Base do jogo).
Toda noite o sino chama mais alto; na última, metade do Refúgio subiu a trilha dormindo. A party foi a única que
acordou a tempo. Eles sobem para **calar o sino** antes que a badalada termine — e para trazer de volta quem subiu.

## Elenco

### Irmão Anselmo, o Último Sineiro — mentor e narrador
- **Quem é:** o sineiro do mosteiro por quarenta anos. Na noite da Última Badalada, Severin tirou a corda das mãos
  dele. Anselmo morreu na escada do campanário; ficou o lampião — e a voz.
- **Como aparece:** uma **luz de lampião espectral** que flutua à frente da party (cutscenes e mundo); nos balões do
  tutorial, o retrato `MentorPortrait` (capuz em sombra, olhos claros de fantasma, barba branca iluminada pelo
  lampião, a corda do sino no ombro).
- **Personalidade:** cansado, gentil, humor seco, culpa contida ("eu devia ter cortado a corda"). Fala pouco, frases de
  3 a 9 palavras, metáforas de sino. Chama a party de **peregrinos**. Nunca grita, nunca explica regra comprida.
- **Função de jogo:** guia (tutorial e dicas de primeira vez), narrador das cutscenes, lembrete de objetivo.
- **Regras de voz:** presente do indicativo, imperativo curto, sem jargão de regra ("Ataque", não "Ação de Ataque
  Corpo a Corpo"). Não nomeia segredos antes da revelação.

**Falas de exemplo** (cutscenes, tutorial e dicas):
1. "Faz décadas que o sino rachou."
2. "E o som ficou preso no bronze."
3. "Toda noite ele chama mais alto. Os peregrinos atendem."
4. "Vocês vieram calá-lo. Sigam a minha luz."
5. "Eu fui o último sineiro deste lugar."
6. "Toque no herói que brilha. É a vez dele."
7. "Escolha o alvo. Eu mostro o golpe antes."
8. "Está vendo o sinal sobre a cabeça dele? É o que ele vai fazer."
9. "Quem fica na frente protege quem está atrás."
10. "Os dados decidem. Sorte não é pecado."
11. "Cada porta é um caminho. Escolham com calma."
12. "Este lugar guarda segredos. Olhem duas vezes."
13. "Ouviram? Ele afinou mais uma nota." (Capela)
14. "Ele não guardava Severin. Guardava o caminho contra ele." (Salão)
15. "Descansem. O sino não descansa — vocês podem."
16. "Ele tirou a corda das minhas mãos." (antes de Severin)
17. "Quarenta anos eu esperei por este silêncio."
18. "Agora eu posso descansar."
19. "Mas o eco… foi mais longe que o sino."

### Abade Severin — "O Sino Partido" (chefe final)
- Abade que confundiu fé com pressa. Acreditou que o mundo merecia o juízo e quis antecipá-lo.
- Desde a noite da badalada, vive **sob o sino**, no Campanário, com o martelo litúrgico. A rachadura vibra sem que
  ninguém toque; os Penitentes respondem quando ele chama.
- Voz: solene, imperativa, nunca se justifica. Fala: **"Ajoelhem-se. A última badalada é minha."**
- Ao cair: ajoelha sob o sino; "a última vibração morre antes de se tornar badalada" (outro canônico).

### Cantor da Última Badalada (Capela do Último Ofício — opcional)
- A voz que **afina o sino**: "cada nota afina o sino que ninguém toca". Sobe uma nota a cada respiração; quando chegar
  ao fim, o Campanário responde.
- Vencê-lo corta a Corda do Coro (estado **Silêncio do Coro**) — é o que permite o epílogo "O Coro Calou".
- Card: **CANTOR DA ÚLTIMA BADALADA · A voz que afina o sino**.

### Vigia das Três Vigílias (Cripta das Três Vigílias — SEGREDO)
- Mais antigo que Severin: o último guardião da regra fundadora das **três vigílias da noite** (as três horas = os três
  Tempos do combate: Rápido, Tático, Pesado). Nunca terminou o seu turno; "conhece a sua hora — e espera por ela".
- Três velas apagadas, três lanternas — uma por vigília. Ao ser vencido: "Pela primeira vez em séculos, ninguém vigia a
  Cripta."
- Só existe para o jogador depois da revelação (Marcas do Silêncio + Palavra ou Peso → Arquivo B-VIG-01).
- Card: **VIGIA DAS TRÊS VIGÍLIAS · Ele conta as horas**. Fala de Anselmo: "Nem eu sabia que ele ainda vigiava."

### Outros do Capítulo I
- **Cavaleiro da Vigília Quebrada** (Salão): "Ele não guardava Severin. Guardava o caminho contra ele." Hoje não guarda nada.
- **Penitentes Ocos, Acólitos do Sino, Cães da Vigília, Besteiros do Claustro, Escudeiros da Cinza, Turiferário,
  Carcereiro, Carrasco, Relicário Faminto (segredo)** — lore canônico nas fichas de inimigo.

## Capítulo I — Mosteiro do Sino Partido (roteiro jogável)

| Momento | Local | Batida de história |
|---|---|---|
| Abertura | Trilha → Pórtico das Cinzas | Cutscene. Noite, chuva, o sino toca sozinho; Anselmo se apresenta e guia até o Pórtico. Título "Capítulo I". |
| 1 | Pórtico das Cinzas | Chegada canônica (estátua do monge sem olhos, bacia de cinzas). Tutorial de andar/porta. |
| 2 | Galeria dos Peregrinos | Os Ajoelhados erguem a cabeça: primeira batalha (tutorial de combate). |
| 3 | Claustro Partido | A escolha de rota (Leste: Scriptorium · Oeste: Canil → Cárceres). |
| 4 | Scriptorium / Canil / Cárceres | Rotas; Marcas; o segredo das Sete Linhas (Relicário). |
| 5 | Capela do Último Ofício | Opcional. Cutscene do Cantor. Silêncio do Coro. |
| 6 | Cripta das Três Vigílias | Segredo. Cutscene do Vigia. |
| 7 | Salão da Vigília Quebrada | Cavaleiro (miniboss). |
| 8 | Campanário Partido | Cutscene de Severin → batalha final. |
| Final | Campanário | Cutscene: o sino silencia, Anselmo se despede, o gancho do eco. Depois o epílogo canônico. |

Epílogos (canônicos): **CAM-610 "O Coro Calou"** (com Silêncio do Coro) e **CAM-620 "Sino Partido"**. A cutscene final
varia uma fala conforme o caso ("Nada. Nem um eco." / "Uma última vibração… e nada.").

## Arco em 6 dungeons (esboço — a definir com o dono, sem regras novas)

O Capítulo I cala o sino, mas a badalada interrompida não sumiu: **o eco desceu a montanha**. Cada capítulo seguinte é
um lugar onde o eco se assentou e prendeu outras devoções no mesmo instante.

1. **Mosteiro do Sino Partido** — o sino e Severin. *(jogável)*
2. **(provisório) A Vila Submersa** — o eco desceu o rio; sinos tocam debaixo d'água.
3. **(provisório) As Minas do Sal Branco** — mineiros que cavam no ritmo de uma batida que ninguém toca.
4. **(provisório) A Biblioteca do Silêncio** — quem escreveu a regra das badaladas, e por quê.
5. **(provisório) O Farol dos Afogados** — a luz que chama peregrinos para o mar, como o sino chamava para a montanha.
6. **(provisório) A Última Badalada** — onde o eco nasceu; Anselmo (ou o que restou dele) pede o último silêncio.

O Refúgio dos Peregrinos é a casa entre capítulos. Anselmo pode voltar como voz no capítulo 6 (decisão aberta).

## Cutscenes (implementadas)

Registradas por dungeon (`registerCutscene({ dungeonId, id, trigger, … })`), tocam uma vez por campanha
(`localStorage mosteiro.cinema.seen.v1`, chave = id da campanha), sempre puláveis ("Pular", Esc) e com toque para
avançar a fala. São locais: nunca enviam comandos, então o jogo online segue normalmente.

| id | Gatilho | Duração | Falas |
|---|---|---|---|
| `abertura` | nova campanha chega ao Pórtico (`beginDungeon`) | ~51 s | 6 falas de Anselmo + card "Capítulo I" |
| `cantor` | início do combate CAP-E01 (fase de posicionamento) | ~12 s | card + 1 fala |
| `vigia` | início do combate CRI-E01 (segredo já revelado) | ~13 s | card + 2 falas |
| `severin` | início do combate CAM-E01 | ~13 s | card + fala de Severin + 1 fala |
| `final` | fase `epilogue` após o Campanário | ~25 s | 6 falas (uma varia pelo epílogo) |

## Regras anti-spoiler
- Nomes secretos (Relicário do Primeiro Caminho, Cripta das Três Vigílias, Relicário Faminto, Vigia das Três
  Vigílias, B-SCR-01, B-VIG-01) nunca aparecem na tela antes da revelação. A cutscene do Vigia só dispara quando o
  combate dele começa — o que exige a revelação.
- Mentor e cutscenes não insinuam segredos ainda não descobertos ("olhem duas vezes" é o limite).
- Nada de "???" na interface.
