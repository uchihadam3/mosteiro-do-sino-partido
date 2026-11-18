# Arquitetura

Este documento descreve como o código está organizado de fato. Tudo aqui foi verificado lendo os arquivos citados.

```
apps/web (React UI + Three.js Diorama + AudioDirector + PWA)
   │  observa estado / DomainEvents         ▲ comandos (CampaignCommand)
   ▼                                        │
apps/web/src/state/session.ts (GameSession: local | host | client)  ──  apps/web/src/net/transport.ts (PeerJS | relay WS)
   │  campaignDispatch(state, cmd)
   ▼
packages/core/src/campaign.ts (redutor de campanha)  ──►  packages/core/src/engine.ts (redutor de combate)
   ▲                                                         ▲
   └──────────── packages/content (Registry + DungeonDef) ───┘   injetado por installContent()
```

## 1. Motor de regras (`packages/core`)

Pacote TypeScript puro: não importa DOM, React nem Three.js (`packages/core/src/types.ts`, cabeçalho). Exporta tudo por
`packages/core/src/index.ts`.

### 1.1 Redutor determinístico

- `dispatch(state, command) → { state, events, error }` (`engine.ts`). O estado de entrada **nunca** é mutado: o
  redutor trabalha num `structuredClone`. Um `RuleError` (regra violada) devolve o estado original e a mensagem em
  PT-BR; qualquer outra exceção é bug e é propagada.
- Comandos de combate (`Command`): `deploy`, `start`, `tempo`, `confirmTempo`, `activate`, `action`, `end`, `answer`,
  `reroll`, `settings`.
- O estado (`CombatState`, `state.ts`) é totalmente serializável: figuras, baralhos de Intenções por tipo, campo de
  batalha (Cobertura, Fumaça, Sigilos, Solo Consagrado, armadilhas, entradas de reforço), objetivos, ondas de reforço,
  estado de boss, fila de operações, decisão pendente, log, RNG e `commandCount`.

### 1.2 Fila de operações (op queue)

A resolução é um interpretador de `Op` (`state.ts`, tipo `Op`; `engine.ts`, `drain`/`runOp`). Exemplos: `enemyActivate`,
`enemyPlan`, `move`, `eAttack`, `defend`, `defendResolve`, `effect`, `heal`, `directDamage`, `smoke`, `summon`,
`finishAttack`, `step`, `call` (handler nomeado do conteúdo), `checkEnd`. `drain` processa a fila até ela esvaziar
ou até surgir uma decisão pendente. Há um limite de 5000 passos por comando (`MAX_STEPS`) para detectar laços.

Com a fila vazia, `drain` decide o próximo passo do fluxo: encerra a Ativação do herói ativo se ele caiu, ativa o
próximo inimigo da faixa ou avança a faixa do Ciclo.

### 1.3 Ciclo e faixas

`BANDS = HR, ER, HT, ET, HP, EP, END` (`types.ts`): Heróis Rápidos, Inimigos Rápidos, Heróis Táticos, Inimigos
Táticos, Heróis Pesados, Inimigos Pesados e fim de Ciclo (§6). `beginCycle` restaura Reações, zera contadores por
Ciclo e chama `revealIntents` **antes** de abrir a fase `tempo`. Os heróis escolhem Tempo individualmente;
`confirmTempo` exige todos definidos. `enterBand` pula faixas vazias; `endCycle` aplica Queimando, expira Fumaça
"até o fim do Ciclo", chama handlers `cycleEnd:<tipo>` e faz entrar as ondas de reforço.

Contadores de limite (`Counters` em `types.ts`): `activation`, `cycle` e `combat`, zerados no escopo correto
(`startHeroActivation`, `beginCycle`, nunca). Limites "uma vez por Dungeon" ficam em `Figure.dungeonUses` e voltam ao
registro do herói na campanha.

### 1.4 Decisões pendentes (`Pending`)

Quando o jogador precisa decidir, o motor grava `state.pending` e para. Tipos: `attackPost` (gastos de Impulso,
Mira, Convicção, Brecha depois da rolagem), `defense` (Reações), `egide`, `conditionResponse` (Intercessão/Selo),
`step` (destino de Passo), `tieBreak` (empate absoluto do Alvo Padrão — "a party decide"), `choice`, `allocate`,
`silencio` (Silêncio do Coro contra Severin). Cada pendência tem `controllers` (ids de figuras cujo dono pode responder);
lista vazia significa "qualquer jogador". O comando `answer` valida o id e o tipo da resposta.

### 1.5 Eventos de domínio

`DomainEvent` (`types.ts`) é a saída para apresentação: `cycleStart`, `intentRevealed`, `bandStart`,
`activationStart/End`, `move`, `attackDeclared`, `roll`, `hit`, `miss`, `damage`, `heal`, `condition`, `guardUsed`,
`armorAbsorb`, `fall`, `rise`, `death`, `spawn`, `smoke`, `sigil`, `resource`, `boss`, `objective`, `secret`, `victory`,
`defeat`. Eles carregam a "escola" visual (`VfxSchool`: metal, holy, profane, arrow etc.). O renderer consome os eventos;
a matemática já foi decidida pelo motor.

### 1.6 RNG

`rng.ts`: sfc32 com seed derivada por cyrb128 de uma string; 12 descartes iniciais; `rollInt` com rejeição para evitar
viés de módulo; `shuffle` Fisher–Yates. O estado do RNG (`a,b,c,d,n`) vive dentro do `CombatState` e do
`CampaignState`, então save/load e réplicas online reproduzem as mesmas rolagens. A semente de cada combate é derivada
da semente da campanha, do encontro e do estado do RNG da campanha (`startEncounter`).

### 1.7 Registry e hooks

`registry.ts` define os contratos que o conteúdo implementa e que o motor consome via `setRegistry` / `reg()`:

- `ClassDef`, `TalentDef`, `ItemDef` estendem `Hooks` (`onCombatStart`, `onActivationStart/End`, `onCycleStart`,
  `preAttack`, `attackOptions`, `applyAttackOption`, `afterAttackOption`, `afterAttack`, `preDefense`,
  `defenseReactions`, `applyReaction`, `afterDefense`, `reduceEnemyDamage`, `onDamaged`, `onMoved`, `onEnemyDefeated`,
  `grantsCover`, `maxHpBonus`, `noRapidStep`, `repositionExtraCostFirst`, `onHealOther`, `onGuardConsumed`, `onCantil`).
  `hooksOf(figura)` agrega classe + itens equipados + talentos com `implemented: true` + hooks globais.
- `ActionDef`: `ap`/`apCost`, `targeting` (`TargetSpec`), `available`, `validate`, `execute`, `limit`
  (`activation`/`cycle`/`combat`/`dungeon`), `source` (`SourceRef` com seção e status `CANONICO | PLAYTEST | WATCH |
  ABERTO | HIPOTESE`).
- `EnemyDef` com `intents` (6 por tipo) e `obligatory`; `IntentDef.plan(c, self)` enfileira as operações da Intenção.
- `handlers`: funções nomeadas chamadas por `op: 'call'`, por `choice` pendentes e por ganchos de convenção
  (`revealOverride:<tipo>`, `tempoConfirmed:<tipo>`, `bandStart:<tipo>`, `afterIntent:<tipo>`, `cycleEnd:<tipo>`,
  `reaction:afterEnemyMove`, `sigil:trigger`, `trap:<tipo>`).

### 1.8 Resolvedor único de alvos

`actionTargets(c, figura, ação)` (`engine.ts`) é a única fonte de alvos legais. O HUD (`apps/web/src/ui/combat/CombatHUD.tsx`)
usa a mesma função para destacar alvos e `actionAvailability` para habilitar/desabilitar botões com o motivo; `doAction`
revalida pelo mesmo resolvedor antes de gastar AP. Legalidade de Formação: `canTarget`, `columnClosed`, `isEngaged`,
`isValidArea2`, `hasRoom` (`board.ts`).

### 1.9 Pipelines de ataque e defesa

- Herói ataca (`attack.ts`): `startHeroAttack` (Interpor do Escudeiro, Exposto, Pesado, consumíveis pré-rolagem) →
  rolagem → pendência `attackPost` → `finishHeroAttack` → `computeHeroDamage` na ordem Dano bruto → Crítico (+1 Dano,
  ignora 1 Armadura) → Radiante×Profano → Armadura (Quebrado −1) → Guardado → Cobertura (só Distância) → Dano final.
- Inimigo ataca (`defense.ts`): inimigos não rolam. `runEnemyAttack` → `beginDefense` (dados do atributo de Defesa,
  opções de Reação) → `commitDefense` → `resolveDefense` (Sucessos bloqueiam Dano → Armadura → Guardado → Cobertura →
  redutores de itens → janela de Égide) → efeitos `onDamage`/`onZero` → janela de Intercessão (`runEffect`).
- IA (`ai.ts`, `enemyApi.ts`): `defaultTarget` (menos conexões para atacar; alvo já atacável = 0; Furtivo +2; empate
  por menor HP; empate absoluto → `tieBreak`), `enemyPaths` (não sai de Engajamento sem permissão; entrar em Engajamento
  encerra o deslocamento), `pathToAttack`, `approach`, `retreatPath`.

## 2. Camada de campanha (`packages/core/src/campaign.ts`)

Outro redutor puro: `campaignDispatch(state, cmd)`. Comandos de combate são repassados ao `dispatch` do motor; ao fim
do combate, `endCombat` grava HP/Trauma/Cantil/Último Fôlego/consumíveis de volta (`writeBack`), chama
`DungeonDef.onVictory`, sorteia recompensas e entra na fase `reward`.

- Fases: `prep → explore ⇄ combat → reward → explore … → epilogue → base → complete`, além de `gameover`.
- `DungeonDef` (contrato de dungeon): `locations`, `encounters` (composições por tamanho de party, reforços, Cobertura,
  entradas, objetivos, recompensas), `archive` (Arquivo Oculto), `stateCards`, `options(s)`, `choose(s, id)`,
  `onVictory`, `afterRewards`, `combatContext`, `epilogue`. `registerDungeon` adiciona dungeons sem tocar no motor.
- Loot: baralhos `comum`, `raro`, `consumivel` embaralhados na criação da campanha; `lootCount` escala pelo tamanho
  **original** da party (§30); "tudo que foi revelado é encontrado" (§59). Loot não carregado na Mochila é removido.
- Base (`enterBase`, `baseCommand`): restaura HP, remove Trauma, recarrega Cantil, devolve consumíveis usados ao
  suprimento, +1 Maestria e +1 Talento por herói, Vitrine 4 Comuns + 2 Raros, consumíveis 1 de cada nome, preços §31,
  serviços §32, Estoque de Usados.
- Saves: `toEnvelope` / `migrate` com `SCHEMA_VERSION = 1` e checksum FNV-1a do estado; `migrate` recusa formato
  errado, checksum divergente e versão futura (o switch de migração ainda está vazio — só existe a versão 1).

## 3. Conteúdo (`packages/content`)

`installContent()` (`packages/content/src/index.ts`) monta o `Registry` (classes, itens, inimigos, talentos, handlers,
ações universais + ações de consumíveis, ações de objetivo, hook global de consumíveis pré-rolagem), registra os
baralhos de loot e as dungeons `d1` e `test-fixture` (oculta, não canônica). `CONTENT_VERSION = 'd1-basico-pass14-0.1.0'`.

`sim/autoplay.ts` é um jogador automático determinístico que usa apenas comandos normais (passa por toda a validação).
É usado pelos testes de campanha e por `tools/sim`.

Observação: `zod` está em `dependencies` do `package.json` raiz, mas não é importado em nenhum arquivo; o conteúdo não
é validado por schema em tempo de execução (é tipado apenas pelo TypeScript).

## 4. Sessão e modelo online (`apps/web/src/state/session.ts`, `apps/web/src/net/transport.ts`)

`GameSession` é o único ponto de entrada de comandos na UI. Papéis:

- `local`: solo ou hot-seat. O dispositivo aplica tudo; `localSeat = '*'` controla todos os heróis (os nomes de
  jogadores na criação da party servem para atribuição de assentos, não há bloqueio entre eles localmente).
- `host`: **autoritativo**. Recebe `cmd` dos clientes, verifica `permission(state, seat, cmd)`, aplica o mesmo
  `campaignDispatch` e transmite `state` + `events` + votos + assentos para todos. Responde a cada comando com
  `reject` (erro vazio = aceito).
- `client`: envia comandos ao anfitrião e recebe o estado; não avalia regras localmente, logo não há dessincronização
  de dados nem dados rolados no cliente. Timeout de 8 s por comando.

Permissões por assento (`permission`): em combate, `tempo`/`activate`/`end`/`action` só para heróis do próprio
assento; `reroll` só para o dono do ataque pendente; respostas de `defense` só podem gastar Reações dos próprios
heróis; demais pendências exigem ser dono de um dos `controllers` (ou qualquer um se a lista for vazia). Fora de
combate, `equip`, `unequip`, `mastery`, `talent`, `drinkCantil`, `renameHero` exigem ser dono; `assignSeat` só o
anfitrião. Os demais comandos (por exemplo `buy`, `sell`, `transfer`, `assignLoot`, `deploy`) **não** são restritos
por assento.

Votação (ready-check): `explore:<opção>`, `collectRewards`, `beginDungeon` e `leaveBase` viram votos quando há mais de
um assento conectado; o comando só é aplicado quando todos os assentos conectados apoiam a mesma proposta (cada
jogador apoia uma proposta por vez).

Lobby: o anfitrião mantém `LobbyState` (heróis + assento); clientes só editam heróis do próprio assento. Reconexão:
o cliente guarda o assento em `sessionStorage` e o reenvia no `hello`.

Transportes:

- `PeerTransport` (PeerJS/WebRTC). Id do anfitrião = `mosteiro-sino-` + código da sala (6 caracteres de um alfabeto
  sem ambíguos, gerado com `crypto.getRandomValues`). Usa o servidor de sinalização público padrão do PeerJS.
- `RelayTransport` (WebSocket) contra `apps/server/relay.mjs`, um roteador burro por sala (`join`, `to: '*' | id`,
  aviso `left`).

## 5. Renderer (`apps/web/src/three`)

- Three.js 0.170 direto, **sem React Three Fiber**. `Diorama.ts` cria `WebGLRenderer`, `EffectComposer` (RenderPass,
  UnrealBloom, shader de gradação com vinheta/grão/flash, OutputPass) e uma fila de animação própria.
- `Diorama.play(events)` enfileira tarefas a partir dos `DomainEvent`s; `skip()` esvazia a fila (botão e tecla Espaço no
  HUD); a velocidade vem de `settings.animSpeed` (1×–3×). As posições são reconciliadas com o estado do motor quando a
  fila fica ociosa; a animação nunca bloqueia o motor.
- `scenes.ts`: um diorama por local (portico, galeria, claustro, scriptorium, canil, carceres, capela, relicario,
  cripta, salao, campanario) montado com os GLBs do kit procedural; o tabuleiro tático fica na origem.
- `skinned.ts`: personagens KayKit animados (biblioteca de animação compartilhada por nome de osso, armas em slots de
  mão). `characters.ts`: rigs procedurais (fallback e o Relicário Faminto, que não tem GLB KayKit).
- `vfx.ts`: partículas/sprites por escola de dano.
- Qualidade (`setQuality`): `low` desliga sombras e bloom, densidade de VFX 0,45, DPR 1; `medium` DPR até 1,5, VFX
  0,75; `high` DPR até 2. `auto` escolhe `medium` em mobile e `high` em desktop e degrada um nível depois de quadros
  sustentados abaixo de 40 FPS. `PerfPanel.tsx` mostra FPS, ms por quadro, draw calls, triângulos, geometrias,
  texturas, tempo de carga da cena e heap (quando o navegador expõe).

## 6. Áudio (`apps/web/src/audio/AudioDirector.ts`)

Web Audio com barramentos master/música/SFX/ambiência, crossfade de música por contexto, ambiência por local, SFX com
variantes e loops por `loopStart`/`loopEnd` do `manifest.json`. Nada toca antes do primeiro gesto do usuário. Volumes e
mudo vêm de `settings.ts`. Todos os arquivos de `apps/web/public/assets/audio` são gerados por
`tools/python/audio/build_audio.py`.

Limitação: existe a opção "Legendas de áudio", mas o callback `onCaption` do `AudioDirector` nunca é atribuído pela UI,
então nenhuma legenda aparece hoje.

## 7. PWA (`apps/web/src/pwa`)

- `vite.config.ts` emite `sw.js` com `__BUILD_ID__` substituído e `version.json`.
- `sw.js`: shell por build (cache-first para js/css/fontes com hash), assets grandes em stale-while-revalidate,
  navegação network-first com fallback offline para `index.html`; caches de shell antigos são apagados no `activate`.
- `register.ts`: registra o SW só em produção, captura `beforeinstallprompt`, detecta worker em espera e expõe
  `applyUpdate()` (mensagem `SKIP_WAITING` → `controllerchange` → recarga). Verifica atualizações a cada 30 min e ao
  voltar o foco.
- `public/manifest.webmanifest`: `display: fullscreen`, `orientation: landscape`, `lang: pt-BR`.

## 8. Persistência (`apps/web/src/state/persistence.ts`)

IndexedDB `mosteiro-sino-partido`, store `saves`, chaves `auto`, `auto-backup`, `slot1..3`. Autosave com debounce de
350 ms em cada `commit` da sessão; antes de gravar o novo autosave, o anterior vai para `auto-backup`. `loadSlot('auto')`
cai para o backup se o envelope não passar em `migrate`. Exportação/importação em JSON. Preferências do dispositivo
ficam em `localStorage` (`mosteiro.settings.v1`).

## 9. Extensibilidade

### Dungeons 2–8

Uma nova dungeon é um `DungeonDef` registrado com `registerDungeon` mais, se necessário, novos inimigos/itens/handlers
no `Registry`. Nada no motor cita a D1 por nome. O teste `Dungeon de teste não canônica é plugável e oculta`
(`packages/content/test/campaign.test.ts`) prova isso com `packages/content/src/dungeons/test-fixture.ts`
(`canonical: false`, `hidden: true`).

Pontos que ainda são específicos da D1 e precisarão de generalização:

- `BossState` (`state.ts`) tem campos fixos de bosses da D1 (Ressonância, Contrapesos, Canto, Guarda do Cavaleiro,
  Vigia). Uma D2 com bosses novos teria de estender esse tipo ou usar `flags`.
- `layoutEnemies`/`heroFigure` e `CampaignState.mode` (`'basico'` apenas).
- `leaveBase` leva a campanha para `complete`; não há transição para uma Dungeon 2.
- Os baralhos de loot são globais (`setLootPools`), não por dungeon.
- `persistence.ts` resume saves como "Dungeon 1".

### Modo Avançado

`DungeonDef.modes` aceita `'avancado'` e `LocationDef` tem `code`/`scene`/`ambience`, mas não há camada de Locais,
Investigar, Pressão, Busca Profunda nem códigos POR/GAL/SCR-xxx do Avançado (§38, §58). `CampaignState.mode` só aceita
`'basico'`.

### Arena / PvP

Não implementada. O motor já separa lados (`Side = 'H' | 'E'`), mas inimigos são guiados por Intenções e heróis por
comandos; um modo herói×herói precisaria de outra política de controle para o lado `E`.
