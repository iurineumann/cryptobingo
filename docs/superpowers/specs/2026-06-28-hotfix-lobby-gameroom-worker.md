# Spec — Hotfix Lobby + GameRoom + Worker

- **Data:** 2026-06-28
- **Autor:** Célula de Engenharia
- **Status:** Em execução
- **Escopo:** Correção de bugs críticos visíveis em Lobby, GameRoom e worker-game-loop, pré-requisito para GameRoom Fase 0 (refactor)
- **Branch:** `feature/hotfix-lobby-gameroom-worker`
- **Stack:** React 19 + Vite + TS (vitest), Worker (jest), i18next, Wharfkit

## 1. Motivação

Durante exploração da codebase (2026-06-28) identificamos 4 áreas com bugs visíveis que afetam
a experiência do usuário e a corretude do jogo:

1. **Lobby** — refresh lento (8s/2s), nome da sala sumindo, prêmio máximo incorreto
2. **GameRoom layout** — online counter e reaction bar mal posicionados, stats panel fora de ordem
3. **i18n** — labels de seção de cartelas hardcoded em inglês
4. **Worker draw modes** — Golden Ball mostra 36/75, multiplier sem animação; Multi Match sem slow reveal, draw todas 75 bolas

Nenhuma mudança de economia (RTP 85% / GGR 15%), contrato C++ ou API.

## 2. Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `apps/frontend/src/components/Lobby.tsx` | POLL constants, room name condicional, maxPrizeVal formula |
| `apps/frontend/src/components/Lobby.test.tsx` | **Novo** — testes |
| `apps/frontend/src/components/GameRoom.tsx` | Reposicionar MatchStats |
| `apps/frontend/src/components/gameroom/RoomSocial.tsx` | Mover online counter e reaction bar |
| `apps/frontend/src/components/ticketUtils.ts` | groupTicketsByCategory aceitar t() |
| `apps/frontend/src/locales/pt.json` | +ticket_section keys |
| `apps/frontend/src/locales/en.json` | +ticket_section keys |
| `apps/frontend/src/locales/zh.json` | +ticket_section keys |
| `apps/worker-game-loop/src/services/evaluator.ts` | DEFAULT_DRAW_BALLS, golden/multimatch dispatch |
| `apps/worker-game-loop/src/services/gameOrchestrator.ts` | Slow reveal gate, golden animation, max_balls |
| `apps/worker-game-loop/src/services/evaluator.test.ts` | **Novos** testes |

## 3. Fora de escopo

- Refatoração do GameRoom monólito (Fase 0 — já planejada)
- Sorteio cinematográfico (Fase 1)
- Cartelas vivas + near-miss (Fase 2)
- Prêmios/celebração (Fase 3)
- Social ao vivo (Fase 4)
- Mudanças em contrato C++, API, ou economia
