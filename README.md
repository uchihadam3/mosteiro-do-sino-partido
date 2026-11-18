# Mosteiro do Sino Partido — V2 (digital)

Versão digital do dungeon crawler tático cooperativo **Mosteiro do Sino Partido — V2**, cobrindo a
**Dungeon 1 no Modo Básico**. A fonte de verdade das regras é a **REGRA MESTRA V2 — PASS 14**; o código cita as
seções (`§`) que implementa e marca como `HIPOTESE` tudo o que é interpretação (ver
[`docs/OPEN_DESIGN_QUESTIONS.md`](docs/OPEN_DESIGN_QUESTIONS.md)).

O Modo Avançado aparece no menu como "Modo Avançado — em desenvolvimento" e **não está implementado**. Arena/PvP
também não.

## O que existe hoje

- **Motor de regras puro em TypeScript** (`packages/core`): redutor determinístico com RNG sfc32 serializado no
  estado, Formação 5×2 por lado com Setores e conexões (sem grid), Engajamento, Coluna Fechada/Aberta, categorias
  Corpo a Corpo/Alcance/Distância/Global, Área 2 Setores, Cobertura, Empurrar/Puxar, tabela universal de dados
  D4–D12, Ciclo com Tempos Rápido/Tático/Pesado, Intenções inimigas reveladas antes da escolha de Tempo,
  Reações, condições, Caído/Trauma/Derrotado/Último Fôlego, IA inimiga com Alvo Padrão e desempate pela party.
- **Conteúdo da D1** (`packages/content`): 6 classes com recursos próprios, árvores de talentos (somente T1
  implementado em regras), 13 inimigos com 6 Intenções cada, 84 itens (7 com `implemented: false`), 11 encontros
  com composições exatas da §44 para 1–5 heróis, objetivos de batalha (Sete Linhas, Contrapesos), segredos do
  Básico pela §61 (Relicário e Cripta/Vigia), Base com loja, serviços, Maestria e Talentos.
- **Campanha** (`packages/core/src/campaign.ts`): rotas Leste/Oeste, Capela, Raro de rota, recompensas por tamanho
  original da party (§30), ouro (§31), Mochila (§27), Armazém, epílogo e retorno à Base.
- **App web** (`apps/web`): React + Three.js (sem React Three Fiber), dioramas 3D por local, personagens animados
  (KayKit CC0), VFX, HUD tático, áudio procedural, painel de desempenho, presets de qualidade com modo Auto, PWA
  instalável com atualização, saves em IndexedDB, hot-seat local (1–5 heróis distribuídos entre jogadores no mesmo
  dispositivo) e **co-op online** com anfitrião autoritativo.
- **Pipelines Python** (`tools/python`): áudio, texturas, ícones e modelos de cenário gerados proceduralmente;
  processamento dos personagens KayKit. Todos com testes pytest.

Estado detalhado, números de testes e limitações conhecidas: [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Início rápido

Requisitos: Node.js e npm com suporte a workspaces (o repositório não declara `engines`; o ambiente de
desenvolvimento usa Node 22.23 / npm 10.9). Para os pipelines: Python 3.11+ (o ambiente atual usa 3.13).

```bash
npm install            # instala todos os workspaces
npm run dev            # servidor Vite em http://localhost:5173 (host liberado na rede local)
npm run build          # tsc --noEmit + vite build → apps/web/dist
npm run preview        # serve o build de produção
npm run typecheck      # tsc -b packages/core packages/content apps/web
npm test               # Vitest: motor + conteúdo + campanha (43 testes)
npm run test:watch     # Vitest em modo watch
npm run e2e            # Playwright (sobe o Vite na porta 5173 e o relay na 8790)
```

Sobre o E2E:

- O Playwright usa o Chromium que ele mesmo baixa (`npx playwright install chromium`) ou um navegador já
  instalado via `PW_CHROMIUM=/caminho/para/chrome npm run e2e`.
- WebGL roda via SwiftShader (`--use-angle=swiftshader`), então funciona em máquina sem GPU, mas é lento
  (timeout de 240 s por teste).

Simulação e lint:

```bash
npm run sim -- 20 1-5                                     # 20 campanhas D1 por linha (1–5 heróis × 2 rotas), vitórias/ouro/erros
npm run lint                                              # ESLint 9 (flat config em eslint.config.js)
```

Simuladores pontuais:

```bash
npx tsx tools/sim/quick.ts 3 leste seed1                     # campanha D1 completa por autoplay (n heróis, rota, semente)
npx tsx tools/sim/combatlog.ts guerreiro,clerigo,ladino GAL-E01 x   # log de um encontro por autoplay
```

### Pipelines Python (opcional — os assets gerados já estão versionados em `apps/web/public/assets`)

Todos os comandos rodam a partir da raiz do repositório.

```bash
# dependências usadas pelos pipelines
python3 -m pip install numpy scipy pillow soundfile shapely pytest cairosvg   # cairosvg: ícones do app e contact sheets
# áudio também exige ffmpeg com libmp3lame no PATH

# Áudio (música, ambiência, SFX — síntese própria)
python3 tools/python/audio/build_audio.py              # tudo
python3 tools/python/audio/build_audio.py --list       # lista os ids
python3 tools/python/audio/build_audio.py --only music_title,ui_click

# Texturas PBR, sprites de VFX e ícones SVG
python3 tools/python/textures/build_textures.py
python3 tools/python/textures/build_icons.py
python3 tools/python/textures/build_app_icons.py       # ícones PWA 192/512 (precisa de cairosvg)

# Modelos de cenário (GLB gerados por numpy, sem Blender)
python3 tools/python/models/build_models.py
python3 tools/python/models/audit_models.py            # auditoria estrutural (exit 1 em erro)
python3 tools/python/models/render_preview.py --out /tmp/models_contact.png

# Personagens: processa os pacotes KayKit (baixados à parte) para apps/web/public/assets/characters
python3 tools/python/characters/build_characters.py /caminho/para/kaykit

# Testes dos pipelines (503 testes: áudio 225, modelos 126, texturas/ícones 152)
python3 -m pytest tools/python -q
```

`tools/python/models/blender/reexport_glb.py` é um script bpy **não testado** (o Blender não estava disponível) e não
faz parte do pipeline.

## Como jogar online

Tela inicial → **Jogar Online**. Um jogador cria a sala (código de 6 caracteres) e os demais entram com o código.

- **Padrão: PeerJS (WebRTC).** Funciona a partir de hospedagem estática. A sinalização usa o broker público do
  PeerJS; os dados vão por canal WebRTC entre os navegadores.
- **Alternativa: relay WebSocket próprio** (LAN, rede sem WebRTC, testes):

  ```bash
  node apps/server/relay.mjs [porta]      # padrão 8787 (ou $PORT)
  ```

  No lobby, abra "Avançado: servidor de retransmissão próprio" e informe `ws://<ip-do-servidor>:<porta>`.
  O relay só roteia mensagens dentro da sala; não executa regras.

O dispositivo do anfitrião é a autoridade: valida cada comando contra o assento dono do herói, aplica o mesmo redutor
puro e transmite o estado. Decisões de party (explorar uma opção, seguir após recompensas, iniciar a expedição,
partir da Base) exigem o voto de todos os jogadores conectados. Detalhes em
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Instalar como app (PWA) e atualizações

- O build gera `sw.js` carimbado com o id do build e `version.json`. O service worker não é registrado em `npm run dev`.
- Quando o navegador oferece instalação, aparece o botão de instalar na tela inicial e em Configurações.
- Ao detectar um build novo, o app baixa em segundo plano e mostra **"Atualizar agora"**; o autosave é gravado antes
  de recarregar. Assets grandes (modelos, texturas, áudio, ícones, personagens) usam stale-while-revalidate e
  funcionam offline depois do primeiro carregamento.
- Para publicar em subcaminho: `BASE_PATH=/subcaminho/ npm run build`.

## Saves

- **IndexedDB** (`mosteiro-sino-partido`): autosave com debounce a cada comando aplicado, **backup rotativo** do
  autosave anterior e **3 slots manuais** (menu de Pausa).
- Cada save é um envelope versionado (`schemaVersion`) com checksum FNV-1a; se o autosave estiver corrompido, o jogo
  carrega o backup.
- **Exportar** (Pausa) baixa um `.json`; **Importar arquivo** (tela inicial → Carregar) valida o checksum antes de abrir.
- O RNG faz parte do estado salvo: recarregar não refaz rolagens nem loot.

## Estrutura do repositório

```
apps/
  web/            React + Three.js + PWA (src/app, src/ui, src/three, src/audio, src/state, src/net, src/pwa)
  server/relay.mjs  relay WebSocket opcional para co-op online
packages/
  core/           motor de regras puro (sem DOM/Three/React) + camada de campanha
  content/        classes, talentos, inimigos, itens e Dungeon 1 (dados + handlers), autoplay headless
e2e/              Playwright: layout, campanha/save, ciclo de combate, co-op online
tools/
  python/         pipelines de áudio, texturas/ícones, modelos e personagens (+ pytest)
  sim/            scripts tsx de simulação (quick.ts, combatlog.ts)
docs/             documentação (abaixo)
```

## Documentação

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): motor, campanha, sessão/online, renderer, áudio, PWA, extensibilidade.
- [`docs/RULES_TRACEABILITY.md`](docs/RULES_TRACEABILITY.md): seção da Regra Mestra → código → testes.
- [`docs/CONTENT_COVERAGE_D1.md`](docs/CONTENT_COVERAGE_D1.md): classes, talentos, inimigos, encontros, itens, segredos.
- [`docs/OPEN_DESIGN_QUESTIONS.md`](docs/OPEN_DESIGN_QUESTIONS.md): ambiguidades e hipóteses adotadas.
- [`docs/PROGRESS.md`](docs/PROGRESS.md): estado atual, testes, limitações, próximos passos.
- [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md): testes de aceite 01–16 do prompt mestre → cobertura.
- [`LICENSES.md`](LICENSES.md): terceiros e assets gerados.
