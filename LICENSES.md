# Licenças e procedência

Este arquivo lista o material de terceiros usado pelo projeto e a origem dos assets gerados. As licenças de pacotes npm
foram lidas do campo `license` de cada `node_modules/<pacote>/package.json` instalado; as de pacotes Python, dos
metadados instalados (`importlib.metadata`).

**Licença do próprio projeto:** o repositório **não tem arquivo `LICENSE`** nem campo `license` nos `package.json`.
O jogo "Mosteiro do Sino Partido — V2" (regras, textos, nomes) pertence ao seu autor; esta documentação não atribui
licença a ele. Ver a nota sobre assets gerados na seção 3.

## 1. Assets de terceiros incluídos no build

### KayKit — personagens


- **KayKit Adventurers 1.0** e **KayKit Skeletons 1.0**, por **Kay Lousberg** (kaylousberg.com).
- Licença: **CC0 1.0 Universal** (domínio público). Atribuição não é exigida; é feita aqui por cortesia.
- Uso: modelos base, rig e animações dos heróis e de 11 inimigos, além de acessórios (armas, escudos, aljava, grimório).
  Os arquivos não são usados como vieram: `tools/python/characters/build_characters.py` filtra as animações, remove
  acessórios por variante, aplica gradação de cor nas texturas e regrava GLBs compactos em
  `apps/web/public/assets/characters/` (o `manifest.json` dessa pasta repete a licença).
- Os pacotes originais não estão no repositório; o script recebe o caminho deles como argumento.

### KayKit — Dungeon Remastered (cenários)

- **KayKit Dungeon Remastered 1.0**, por **Kay Lousberg** (kaylousberg.com).
- Licença: **CC0 1.0 Universal** (domínio público). Atribuição não é exigida; é feita aqui por cortesia.
- Uso: paredes, pisos, pilares, escadas, portas, tochas/velas, móveis, estandartes e objetos de todas as salas
  (`apps/web/src/three/scenes.ts`). `tools/python/kaykit/build_kit.py` copia só as peças usadas, tira a textura
  que cada GLB repetia (um único atlas `dungeon_texture.png`, reduzido para 512²), quantiza a geometria
  (`KHR_mesh_quantization`) e separa as chamas em um nó próprio; saída em `apps/web/public/assets/kaykit-dungeon/`
  (o `manifest.json` dessa pasta repete a licença).
- O pacote original não está no repositório; o script recebe o caminho dele como argumento.

### Fontes (via `@fontsource`)

| Pacote | Versão | Licença |
|---|---|---|
| `@fontsource/cinzel` | 5.1.0 | OFL-1.1 |
| `@fontsource/eb-garamond` | 5.1.0 | OFL-1.1 |
| `@fontsource/alegreya-sans` | 5.1.0 | OFL-1.1 |

## 2. Dependências npm

### Runtime (entram no bundle do app)

| Pacote | Versão | Licença |
|---|---|---|
| three | 0.170.0 | MIT |
| react | 18.3.1 | MIT |
| react-dom | 18.3.1 | MIT |
| scheduler | 0.23.2 | MIT |
| loose-envify | 1.4.0 | MIT |
| js-tokens | 4.0.0 | MIT |
| peerjs | 1.5.4 | MIT |
| peerjs-js-binarypack | 2.1.0 | MIT |
| @msgpack/msgpack | 2.8.0 | ISC |
| webrtc-adapter | 9.0.6 | BSD-3-Clause |
| sdp | 3.2.3 | MIT |
| eventemitter3 | 4.0.7 | MIT |
| zod | 3.23.8 | MIT (declarado, não usado pelo código) |

O relay opcional `apps/server/relay.mjs` usa `ws` 8.18.0 (MIT).

O modo online PeerJS usa, em tempo de execução, o servidor de sinalização público padrão do PeerJS (serviço de
terceiros, não incluído no repositório).

### Desenvolvimento (não entram no bundle)

| Pacote | Versão | Licença |
|---|---|---|
| vite | 5.4.21 | MIT |
| @vitejs/plugin-react | 4.3.4 | MIT |
| typescript | 5.6.3 | Apache-2.0 |
| vitest | 2.1.8 | MIT |
| @playwright/test / playwright-core | 1.49.1 | Apache-2.0 |
| tsx | 4.19.2 | MIT |
| eslint | 9.15.0 | MIT |
| typescript-eslint | 8.15.0 | MIT |
| prettier | 3.3.3 | MIT |
| ws | 8.18.0 | MIT |
| @types/* | — | MIT |

Para a lista completa de dependências transitivas: `npm ls --all`.

## 3. Assets gerados pelo projeto

Todo o resto do conteúdo de `apps/web/public/assets/` é gerado por código deste repositório, sem samples, gravações,
malhas, texturas ou ícones de terceiros:

| Pasta | Gerador | Declaração de licença no gerador |
|---|---|---|
| `assets/audio/` (música, ambiência, SFX) | `tools/python/audio/build_audio.py` + `sinosynth/` (síntese própria) | `tools/python/audio/README.md`: obra original, dedicada ao domínio público sob **CC0 1.0** |
| `assets/textures/` (PBR, sprites de VFX) | `tools/python/textures/build_textures.py`, `sprites.py` | `tools/python/textures/README.md`: obra original; "mesma licença do restante do repositório" |
| `assets/icons/` (SVG + sprite) e `public/icons/app-*.png` | `tools/python/textures/build_icons.py`, `build_app_icons.py` | idem texturas |
| `assets/models/` (cenário GLB) | `tools/python/models/build_models.py` (numpy, sem Blender) | `tools/python/models/README.md`: geometria original; "coberta pela licença do próprio projeto" |
| `assets/characters/` | derivados do KayKit (seção 1) | CC0 1.0 (origem KayKit) |
| `assets/kaykit-dungeon/` | `tools/python/kaykit/build_kit.py` a partir do KayKit Dungeon Remastered (seção 1) | CC0 1.0 (origem KayKit) |

Atenção: como o repositório não declara licença própria, as texturas, ícones e modelos de cenário ficam, na prática,
sem licença explícita até que o dono do projeto escolha uma. Só o áudio tem declaração explícita (CC0).

## 4. Ferramentas usadas pelos pipelines Python (não distribuídas)

| Ferramenta | Versão no ambiente | Licença |
|---|---|---|
| numpy | 2.5.3 | BSD-3-Clause (com partes 0BSD, MIT, Zlib, CC0-1.0) |
| scipy | 1.18.1 | BSD |
| Pillow | 12.3.0 | MIT-CMU |
| soundfile | 0.14.0 | BSD-3-Clause |
| shapely | 2.2.0 | BSD-3-Clause |
| cairosvg (opcional) | 2.9.1 | LGPL-3.0-or-later |
| pytest | 9.1.1 | MIT |
| ffmpeg + libmp3lame | 6.1.1 (pacote do sistema) | LGPL/GPL conforme o build do sistema |

Essas ferramentas só produzem os arquivos; nenhum código delas é incluído no app.
