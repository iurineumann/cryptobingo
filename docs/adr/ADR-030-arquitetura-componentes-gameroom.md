# ADR-030 — Arquitetura de Componentes da GameRoom

**Status:** Aceito
**Data:** 2026-06-23

---

## Problema

`apps/frontend/src/components/GameRoom.tsx` cresceu para **1176 linhas** num único
componente: estado local, efeitos, carga on-chain (`loadGame`), ~15 derivações `useMemo`
(payouts, proximidade, combinações, agrupamento de cartelas) e todo o JSX da sala (navbar,
palco do sorteio, painel de padrões, banners de prêmio, breakdown, confete, cartelas, chat).

Custos acumulados:

1. **Difícil de evoluir.** O redesign planejado da sala (spec
   `docs/superpowers/specs/2026-06-23-gameroom-redesign-design.md` — sorteio cinematográfico,
   cartelas vivas, social ao vivo, painéis de prêmio) exige tocar regiões isoladas. Num
   monólito, qualquer mudança arrisca regressão em todo o resto.
2. **Difícil de testar.** Sem fronteiras, não há como testar uma região (ex: palco) sem montar
   o componente inteiro com todas as dependências on-chain/WS mockadas.
3. **Difícil de raciocinar.** 1176 linhas excedem o que cabe em contexto de uma vez — tanto
   para humanos quanto para edição assistida por IA, onde arquivos focados produzem edições
   mais confiáveis.
4. **Bloqueia modo compacto futuro.** A visão de embeds (Telegram/Discord/WhatsApp) precisa
   reusar regiões isoladas; um monólito força reescrita.

## Decisão

Quebrar `GameRoom.tsx` em um **hook de estado + componentes isolados**, com o `GameRoom`
reduzido a **orquestrador fino** (177 linhas). Sem mudança de comportamento ou markup nesta
fase (Fase 0 do redesign).

Estrutura em `apps/frontend/src/components/gameroom/`:

| Unidade | Responsabilidade |
|---|---|
| `useGameRoomState.ts` | Estado local, efeitos, `loadGame`, wiring `useSlowReveal`, todas as derivações. Exporta `STATUS_DOT`/`WS_STATUS_CLASS`. |
| `GameRoomHeader.tsx` | Navbar: logo, crumb, status, saldo, idioma, status WS, menu. |
| `DrawStage.tsx` | Palco: bola hero (animação `gr-drop`), histórico, progresso. |
| `PatternsPanel.tsx` | Padrões + combinações com proximidade/win-count. |
| `PrizePanels.tsx` | Banners (golden ball, multi-match stages, fim de jogo + breakdown) + confete. |
| `TicketsGrid.tsx` | Cartelas do jogador agrupadas + botão comprar. |
| `RoomSocial.tsx` | Wrapper do `ChatFloating` (placeholder de social; expande na Fase 4). |

Cada unidade tem responsabilidade única, interface explícita (props tipadas) e pode ser
entendida/testada isoladamente. `GameRoom.tsx` chama o hook, desestrutura o estado e compõe os
componentes; mantém apenas UI puramente local (`showBuyModal`/`showPatterns`), refs de layout
(`stageRef`/`patternsRef`) e o `ResizeObserver` que cruza palco↔painel.

**Rede de segurança:** um teste de caracterização
(`gameroom/GameRoom.characterization.test.tsx`) trava os `data-testid` e textos renderizados
antes da extração e foi mantido verde, sem modificação, em todas as 8 extrações — prova de
no-behavior-change.

## Consequências

**Positivas:**
- Habilita as Fases 1–5 do redesign (cada região evolui em PR próprio, com revisor da camada).
- Testável por unidade; rede de caracterização protege futuras mudanças visuais.
- Arquivos focados → edição mais confiável.
- Habilita modo compacto/embeds futuros sem reescrita.

**Negativas / custos:**
- Mais arquivos e props a manter sincronizados (interface `GameRoomState` é a fonte única).
- Indireção: ler a sala completa agora exige navegar 8 arquivos em vez de 1 — mitigado pela
  clareza de responsabilidade de cada um.

## Alternativas descartadas

1. **Manter o monólito.** Custo de evolução/teste já era proibitivo para o redesign; rejeitada.
2. **Rewrite big-bang (GameRoom v2 do zero).** PR gigante, review inviável, alto risco de
   regressão, violaria "commits pequenos / fases verdes". Rejeitada em favor da decomposição
   incremental.

## Referências

- Spec: `docs/superpowers/specs/2026-06-23-gameroom-redesign-design.md`
- Plano: `docs/superpowers/plans/2026-06-23-gameroom-fase0-refactor.md`
- ADR-007 (Slow Reveal — animação dirigida por Sequence ID, preservada)
- ADR-005/010/016 (lógica de payout/combinações — movida verbatim, intocada)
