# Progresso

Revisão de 2026-11-18, feita lendo o código e rodando as verificações listadas abaixo. Mapeamento dos testes de aceite
01–16 do prompt mestre: [`ACCEPTANCE.md`](ACCEPTANCE.md).

## 1. Estado atual

O Modo Básico da Dungeon 1 é jogável do Pórtico até Severin, com as duas rotas, Capela, Raro de rota, Relicário e
Cripta/Vigia, para 1 a 5 heróis, sozinho, em hot-seat ou online. O motor roda headless e um jogador automático completa
todas as combinações de party e rota (seção 3).

O que **não** está pronto: Modo Avançado, Arena, Dungeons 2–8, talentos T2–T4, 7 itens com efeito pendente e alguns
pontos de UX listados na seção 4.

## 2. Verificações executadas nesta revisão

| Verificação | Comando | Resultado |
|---|---|---|
| Testes unitários/integração (Vitest) | `npx vitest run` | **43 passaram** em 3 arquivos: `packages/core/test/rules.test.ts` (14), `packages/content/test/combat.test.ts` (10), `packages/content/test/campaign.test.ts` (19) |
| Typecheck | `npm run typecheck` | sem erros |
| Build de produção | `npm run build` | sem erros (chunks: `index` 615 kB, `three` 573 kB, `react` 141 kB, antes do gzip) |
| Pipelines Python | `python3 -m pytest tools/python -q` | **503 passaram**: áudio 225, modelos 126, texturas/ícones 152 |
| Lint | `npm run lint` | **falha**: ESLint 9 não encontra `eslint.config.*` (o repositório não tem configuração) |
| E2E (Playwright) | `npm run e2e` | **não executado nesta revisão** (lento). `test-results/.last-run.json` local registra a última execução como `passed` |

Specs E2E (11 testes):

| Spec | Testes | O que verifica |
|---|---|---|
| `e2e/layout.spec.ts` | 8 (4 viewports × 2) | Tela inicial e HUD de combate com 5 heróis cabem sem rolagem em 1920×1080, 1366×768, 844×390 (celular paisagem) e 1024×768; cards dos heróis dentro da tela; sem spoilers; sem erros de página |
| `e2e/campaign.spec.ts` | 1 | Novo jogo (3 classes) → preparação → exploração; autosave em IndexedDB; recarregar e "Continuar" restaura fase e party |
| `e2e/combat.spec.ts` | 1 | GAL-E01 jogado só com cliques: Ativação, pendências `attackPost` e `defense` aparecem, Ciclo 2 começa; sem spoilers |
| `e2e/online.spec.ts` | 1 | Dois navegadores via relay (`ws://127.0.0.1:8790`): party 2+1, assentos aplicados, cliente não age por herói alheio, "Partir" exige voto dos dois, mesmo estado nos dois |

## 3. Campanhas completas por autoplay

Rodado com `autoplayCampaign` (mesmas sementes dos testes de campanha para o caminho principal; sementes `full-*` para
o full clear). Todas terminaram em vitória, sem erros de comando.

| Party | Rota | Só obrigatórios: encontros | Ouro | Full clear (opcionais + decifrar): encontros | Ouro |
|---|---|---|---|---|---|
| 1 | Leste | GAL, SCR, SAL, CAM | 8 | GAL, CAP, SCR, RARO-L, CRI, SAL, CAM | 11 |
| 1 | Oeste | GAL, CAN, CAR, SAL, CAM | 8 | GAL, CAP, CAN, CAR, RARO-O, CRI, SAL, CAM | 11 |
| 2 | Leste | GAL, SCR, SAL, CAM | 11 | GAL, CAP, SCR, RARO-L, CRI, SAL, CAM | 15 |
| 2 | Oeste | GAL, CAN, CAR, SAL, CAM | 11 | GAL, CAP, CAN, CAR, RARO-O, CRI, SAL, CAM | 15 |
| 3 | Leste | GAL, SCR, SAL, CAM | 14 | GAL, CAP, SCR, REL, RARO-L, CRI, SAL, CAM | 19 |
| 3 | Oeste | GAL, CAN, CAR, SAL, CAM | 14 | GAL, CAP, CAN, CAR, RARO-O, CRI, SAL, CAM | 19 |
| 4 | Leste | GAL, SCR, SAL, CAM | 17 | GAL, CAP, SCR, REL, RARO-L, CRI, SAL, CAM | 23 |
| 4 | Oeste | GAL, CAN, CAR, SAL, CAM | 17 | GAL, CAP, CAN, CAR, RARO-O, CRI, SAL, CAM | 23 |
| 5 | Leste | GAL, SCR, SAL, CAM | 20 | GAL, CAP, SCR, REL, RARO-L, CRI, SAL, CAM | 27 |
| 5 | Oeste | GAL, CAN, CAR, SAL, CAM | 20 | GAL, CAP, CAN, CAR, RARO-O, CRI, SAL, CAM | 27 |

Os ouros conferem com a §31 (rota principal 8/11/14/17/20; full clear 11/15/19/23/27). Com 1–2 heróis o autoplay não
leva Arcanista nem Arqueiro (as classes são escolhidas em ordem), então não decifra as Sete Linhas e não abre o
Relicário. O autoplay usa heurísticas simples; vencer com ele não diz nada sobre o balanceamento para jogadores humanos.

## 4. Limitações conhecidas

Regras e conteúdo:

1. **Talentos**: só T1 tem efeito (18 de 72). Heróis começam com 0 Pontos de Talento, então nenhum talento está ativo
   durante a D1; os T1 implementados não têm teste.
2. **7 itens com `implemented: false`** (Orbe Gravítico, Couro do Caçador, Cetro do Peregrino, Malha do Peregrino,
   Luvas de Empunhadura, Faixa do Sobrevivente, Grevas do Ímpeto). O Couro do Caçador é a armadura inicial equipada do
   Arqueiro; cinco deles estão nos baralhos de loot/Vitrine e podem ser sorteados.
3. Várias interpretações de texto vago (ver [`OPEN_DESIGN_QUESTIONS.md`](OPEN_DESIGN_QUESTIONS.md)), incluindo algumas
   não marcadas no código: Terceira Badalada como ação extra de Severin (Q-TERCEIRA), categoria Global nos ataques do
   Vigia (Q-VIGIA-CAT), escolha do Manto depois de ver as Intenções (Q-MANTO-ORDEM).
4. Base: cartas da Vitrine não compradas não voltam ao pool; Reserva do Mercador não tem visita seguinte; `leaveBase`
   encerra a campanha (`complete`) porque não existe Dungeon 2.
5. Condições não persistem entre combates; o uso de consumíveis fora de combate (`useOutOfCombat`) descarta o item sem
   efeito e não tem botão na UI.
6. Modo Avançado, Arena/PvP e Dungeons 2–8 não existem.
7. O conteúdo não é validado por schema em tempo de execução: `zod` está declarado como dependência, mas não é usado.

Testes:

8. Poucas habilidades de classe têm teste direto (`g_corte`, `ar_disparo`, `reposicionar`, `levantar`); o resto é
   exercido apenas pelo autoplay. Condições (§15), Empurrar/Puxar, Reações, Furtivo/Esconder-se e efeitos de itens não
   têm testes unitários.
9. Asserções fracas: o teste de Cobertura só verifica se o disparo acertar e não testa Dano Direto apesar do nome; os
   testes de caminho principal aceitam `gameover` como resultado; o teste da Cripta só verifica as Marcas se a Cripta
   foi revelada; o teste da Base retorna cedo se a campanha não vencer. Com as sementes atuais todos chegam à vitória,
   mas uma mudança de semente pode esconder regressões.
10. Composição exata por party só é assertada para GAL-E01 com 5 heróis.
11. A regra "falha em Sete Linhas impede nova tentativa no mesmo Ciclo" não tem teste direto.

App e ferramentas:

12. `npm run lint` falha (sem `eslint.config.*`); `npm run sim` aponta para `tools/sim/run-sim.ts`, que não existe (use
    `npx tsx tools/sim/quick.ts` ou `tools/sim/combatlog.ts`). `tools/python/audit/` e `tools/python/sim/` estão vazios.
13. A opção "Legendas de áudio" não mostra nada: `AudioDirector.onCaption` nunca é atribuído
    (`apps/web/src/audio/AudioDirector.ts:36,133`).
14. Online: `buy`, `sell`, `transfer`, `assignLoot`, `deploy`, `useOutOfCombat` e `raiseOutOfCombat` não são
    restritos por assento (`apps/web/src/state/session.ts` → `permission`); qualquer jogador conectado pode executá-los.
    O modo PeerJS depende do servidor de sinalização público do PeerJS.
15. A UI é só PT-BR; não há camada de localização.
16. Desempenho: há presets, modo Auto com degradação por FPS e painel de desempenho, mas **não há baseline de FPS medido
    e registrado** em desktop ou mobile.
17. `tools/python/models/blender/reexport_glb.py` nunca foi executado (Blender indisponível); o pipeline de modelos não
    depende dele.
18. O renderer usa Three.js direto, não React Three Fiber como sugerido no prompt.

## 5. Próximos passos sugeridos

1. Adicionar `eslint.config.js` (typescript-eslint já está nas devDependencies) e corrigir o script `sim`.
2. Testes unitários por habilidade de classe, por condição (§15) e por Intenção de cada inimigo, com sementes fixas e
   estados montados à mão; endurecer os testes condicionais listados no item 9.
3. Decidir com o design as questões da seção B de `OPEN_DESIGN_QUESTIONS.md`, em especial Q-TERCEIRA, Q-MANTO-ORDEM e
   Q-CONDICOES-ENTRE-COMBATES, e então marcar no código.
4. Implementar os 7 itens pendentes ou retirá-los dos baralhos até lá.
5. Ligar `AudioDirector.onCaption` a um componente de legenda.
6. Restringir por assento os comandos de inventário/loja/loot no modo online.
7. Medir e registrar baseline de FPS (desktop intermediário e Android intermediário) com o `PerfPanel`.
8. Generalizar o que ainda é específico da D1 (`BossState`, `leaveBase`, baralhos globais) antes da Dungeon 2;
   preparar a camada do Modo Avançado (§38/§58) sem alterar o combate.
9. Usar `zod` para validar o conteúdo no `installContent()` ou remover a dependência.
