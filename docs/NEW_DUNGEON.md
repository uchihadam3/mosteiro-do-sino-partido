# Como adicionar uma dungeon (D2–D6)

O jogo foi estruturado para seis dungeons. Uma dungeon nova é **dados**: nenhum motor (regras, mundo em tempo real,
cenários, cinema, tutorial) precisa mudar. Este guia lista cada ponto onde uma dungeon entra.

## 1. Regras e conteúdo (`packages/content`)

Crie `packages/content/src/dungeons/dN/` seguindo `d1/`:

| O quê | Onde | Observação |
|---|---|---|
| Definição (`DungeonDef`) | `dungeons/dN/index.ts` | `locations`, `encounters`, `startNode`, `links` (linhas do mapa), `options()` e `choose()` (os caminhos), `stateCards`, `archive`, `epilogue()` |
| Locais (`LocationDef`) | idem | `map: {x, y}` decide a parede da porta no mundo em tempo real; `scene` aponta para a sala em `ROOMS`; `revisit` é o texto opcional de volta a um local central |
| Caminhos (`ExploreOption`) | `options()` | `kind`: `combat` / `travel` / `narrative` / `finish`. `secret: true` marca passagens secretas (cor própria, som de descoberta) |
| Inimigos novos | `enemies/dN.ts` | `EnemyDef` + handlers (Intenções). Ids únicos entre todas as dungeons |
| Itens novos | `items/dN.ts` | Equipamento continua entre dungeons; ids únicos |
| Saque | `loot` do pack | Pools `comum` / `raro` / `consumivel` só desta dungeon |

Depois registre o pack em `packages/content/src/index.ts`:

```ts
export const DUNGEON_PACKS: DungeonPack[] = [
  { def: D1, enemies: D1_ENEMIES, enemyHandlers: ENEMY_HANDLERS, items: ITEMS, itemHandlers: ITEM_HANDLERS, loot: LOOT_POOLS },
  { def: D2, enemies: D2_ENEMIES, enemyHandlers: D2_HANDLERS, items: D2_ITEMS, itemHandlers: D2_ITEM_HANDLERS, loot: D2_LOOT },
];
```

`packages/content/test/packs.test.ts` verifica ids únicos, saque que existe, linhas do mapa válidas e handlers que
não colidem com os de classe/talento.

## 2. Cenários (`apps/web/src/three/scenes.ts`)

- Um `THEMES[id]`: escala do kit KayKit, altura gótica das paredes, tintas do atlas, heráldica, paleta e luz base.
- Um `ROOMS[sceneId]` por local: paredes por lado (`door` marca a saída), piso, props, tochas, luzes, partículas,
  céu. O tabuleiro tático fica livre automaticamente; o contrato `walk` (limites, colisores, saídas) sai pronto
  para o mundo em tempo real.
- Peças novas do kit: rode `tools/python/kaykit/build_kit.py <pasta Assets do KayKit>` (determinístico).

## 3. Cinema (`apps/web/src/cinema`)

- Crie `dN.ts` como `d1.ts` e chame `registerCutscene({ dungeonId: 'dN', id, trigger, scene, setup, shots })`:
  abertura do capítulo, apresentação de chefes e final. Os gatilhos (`trigger`) são os mesmos da D1.
- Personagens e falas: atualize `docs/STORY.md` (o esboço dos 6 capítulos já está lá).

## 4. Personagens (modelos)

Inimigos novos usam `apps/web/src/three/characters.ts` (KayKit Adventurers/Skeletons). Um design de personagem
entregue em HTML segue a skill `port-character-design`.

## 5. Tutorial e dicas

As dicas de "primeira vez" em `apps/web/src/tutorial/steps.ts` (`TIPS`) disparam por situação, não por dungeon. Uma
mecânica nova ganha uma dica nova lá (uma frase de até 8 palavras, com alvo na tela).

## 6. Verificação

1. `npm run typecheck` e `npx vitest run`.
2. `npx playwright test` (o `newplayer.spec.ts` cobre o começo; adicione um caminho da dungeon nova ao `campaign.spec.ts`).
3. Celular em pé (384×832), deitado (832×384) e PC.
