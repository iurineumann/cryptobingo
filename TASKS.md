# Backlog do Projeto CryptoBingo

> Fonte de verdade do backlog. Sincronizado com `TRACE.md`.
> Status: [x] Done | [ ] Pendente
> Última auditoria: 2026-06-04

## Épico 1: Core de Blockchain & Tokenomics
- [x] Contrato C++ completo (buytickets, lockgame, startdraw, claimwin, receiverand).
- [x] Token dedicado `bingo.token`, Utility NFT via `nftconfigs`.
- [x] ADR-001 a ADR-015 definidos e documentados.
- [x] Tabelas `patterns` e `gametypes` on-chain (ADR-004 Fase 2).
- [x] Fórmula `max_weight` no claimwin (ADR-005 Fase 2).
- [x] Tabela `rooms` on-chain + campo `room_id` em `game_state` (ADR-010).
- [x] Tabelas `drop_deposits`, `drop_allocations`, `dropstate` on-chain (ADR-011).
- [x] Actions de rooms no contrato C++: `createroom`, `activateroom`, `pauseroom`, `closeroom`, `setroommeta` + campo `room_drop_chance_bps`.
- [x] Actions de drop vault no contrato C++: `allocatedrop`, `deallocdrop`, `reclaimasset`, `execdrop` + `on_notify` para token deposits (memo 'vault') e NFT transfers (atomicassets).
- [x] ABI v2.0 completo e sincronizado — 31 actions, 12 tabelas, 14 structs.
- [x] Action `sweepggr` no contrato C++ + tabela `ggrpool` + `settreasury` (ADR-005 Fase 4).
- [x] Contrato `bingo.swap` (DEX x*y=k) — AMM constant-product, allowlist de tokens aprovados (`allowedtoks` + `addtoken`/`deltoken`), 6 actions (addtoken/deltoken/createpool/addliq/remliq/canceldep), tabelas pools/pending/lpbalances/allowedtoks, fee_bps configurável, dead shares anti-manipulation. ADR-018.
- [x] `bingo.swap` — taxa de serviço por pool (`service_fee_bps`, ADR-019): `setpoolfee` + `settreasury` (treasury=bingo.game); fee deduzida do `amount_in` antes do AMM, enviada inline para treasury; max 500 bps; campanha fee-zero via `setpoolfee(id, 0)`. Phase 2 (descontos por NFT) planejada no ADR-019.
- [x] `init_dev_env.sh` — conta `bingo.swap` adicionada ao bootstrap; deploy automático do contrato; addtoken WAX+BINGO na allowlist; distribuição de WAX e BINGO ao contrato de swap.
- [x] `shared-types` — tipos `BlockchainSwapState`, `BlockchainAllowedToken`, `BlockchainSwapPool`, `BlockchainPendingDeposit`, `BlockchainLpBalance` exportados.
- [x] Harness E2E Suite 9 (`apps/harness/tests/swap.test.ts`) — addtoken → createpool → addliq → swap WAX→BINGO → swap BINGO→WAX → remliq parcial → canceldep + 7 security guards. ADR-018.

## Épico 2: API Gateway & Infraestrutura Off-Chain
- [x] Express + MongoDB + PostgreSQL + Redis.
- [x] Auth JWT challenge-response (ADR-006).
- [x] `ticketController.ts` — geração Fisher-Yates + ECDSA + dedupe Redis.
- [x] Docker Compose com Redis, RabbitMQ, PostgreSQL, MongoDB, Prometheus, Grafana.
- [x] Rotas `/admin/patterns`, `/admin/gametypes`, `/admin/gametypes/:id/metadata`.
- [x] Rotas `/statistics/rtp`, `/statistics/games`, `/statistics/games/batch`, `/admin/ledger/sync`.
- [x] Rotas `/sponsors/campaigns`, `/nfts/my-assets`.
- [x] Rotas `/rooms/*`, `/sponsor/rooms` (ADR-010).
- [x] Rotas `/vault/*` — `dropController.ts` com 6 endpoints (deposits, allocations, allocate, deallocate, reclaim).
- [x] Rotas `/player/winnings/:gameId`, `/player/winnings/batch` — `winningsController.ts`.
- [x] Rate limiting lazy init + Helmet + CORS restrito.
- [x] Motor de Simulação Monte Carlo (simulateWeights + calibrateWeights).
- [x] Compliance Ledger PostgreSQL (games_history + transactions_ledger).
- [x] `roomController.ts` — CRUD de salas + metadados.
- [x] `openapi.yaml v2.0` — 36 endpoints documentados (rooms, vault, player/winnings, statistics/batch, admin gametypes, nfts).

## Épico 3: Game Loop Worker & Motor de Resolução
- [x] RabbitMQ consumidor resiliente (at-least-once delivery + DLQ).
- [x] `lockgame`, `startdraw`, `claimwin`, `closegame` on-chain.
- [x] Motor de Bitmasking O(1) + padrões dinâmicos (ADR-004).
- [x] Índice Invertido Redis O(1) (`invertedIndex.ts`).
- [x] Varredura paginada de tickets (100/página).
- [x] Pipeline claimwin completo → evaluator → blockchain.
- [x] Dead Letter Queue (DLX + DLQ + guard `x-death.count >= MAX_RETRIES`).
- [x] Métricas Prometheus — 8 métricas customizadas + Node.js defaults.
- [x] WebSocket Broadcaster — Socket.io, auth JWT, Slow Reveal 3s/bola, reconciliação.
- [x] Grafana — dashboard provisionado automaticamente com 9 painéis.
- [x] `roomManager.ts` — auto-criação de partidas após game resolved (ADR-010).
- [x] `rabbitmq.ts` — 7 handlers + 3 funções de auto-avanço (autoLock, autoStart, autoClaim).
- [x] `dropWorker.ts` — 3 fases de drop: Fase 0 (room chance), Fase 1A/1B (seleção NFT/token), Fase 2 (seleção vencedor Fisher-Yates). Integrado ao `onGameResolved`.
- [x] ADR-012 (Draw Modes), ADR-013 (Multi-Match), ADR-014 (Orchestration) — implementados.
- [x] `asyncapi.yaml v2.0` — canais game.{id} + room.{id}; eventos: golden_ball, stage_cleared, game_ended, chat:message, chat:sponsor_drop.

## Épico 4: Frontend & Experiência Web3
- [x] Wharfkit (Anchor + Cloud Wallet).
- [x] Auth JWT integrado (`useAuth.ts`).
- [x] Compra de cartelas (`useTicketPurchase.ts` + `BuyTicketModal.tsx`).
- [x] Slow Reveal ao vivo (`useSlowReveal.ts`).
- [x] Cartelas marcadas em tempo real (`TicketCard.tsx` com sort/group por fase).
- [x] `LandingPage.tsx` — pública, stats live de salas, status slow-reveal, botão Histórico por sala.
- [x] `GameRoom.tsx` — sala ao vivo completa (hero ball, cartelas, padrões, chat, navbar com menu).
- [x] `ReplayRoom.tsx` — replay com slow reveal simulado, TicketCard, padrões, banners.
- [x] `App.tsx` — roteamento URL-based via React Router DOM v6 (ADR-015), AuthGuard, AdminGuard, deep links.
- [x] `AdminLayout.tsx` + Painel Admin completo (Dashboard, Patterns, Gametypes, Sponsors, Compliance, Users, Player, Rooms, Vault).
- [x] `VaultAdmin.tsx` — painel admin de vault: depósitos, alocações, reclaim.
- [x] `RoomsAdmin.tsx` — admin de salas com seção Drops.
- [x] `RoomHistoryPanel.tsx` — histórico público de sala (session opcional), barra de resumo lifetime, totalPaidOut.
- [x] `MyHistoryPage.tsx` — histórico pessoal com ROI%, win rate, stats globais da partida.
- [x] Multi-role dev login: 5 perfis.
- [x] i18n pt/en/zh — chaves aninhadas completas.
- [x] `ChatPanel.tsx` — chat por sala via Socket.io (inline).
- [x] `Lobby.tsx` — salas com slow-reveal status, tickets vendidos, botão Histórico para todas as salas.
- [x] `utils/rpc.ts` — fetchTableRows público (sem sessão via proxy Vite).
- [x] `GametypesAdmin` — Suggest Combinations (Monte Carlo + calibração RTP 85%).
- [x] `SponsorRooms.tsx` — painel do sponsor (`/sponsor/rooms`): lista salas próprias, badges de drop, edição de metadata inline.
- [x] `SponsorVault.tsx` — painel vault do sponsor (`/sponsor/vault`): depósitos, alocações, form com dropdown de salas próprias.
- [x] `SponsorLayout.tsx` — shell dedicado `/sponsor/*` com header + sidebar + SponsorGuard.
- [x] Badges "🎁 NFT Drop" / "💰 Token Drop" no Lobby e LandingPage.
- [x] `AdminLayout.tsx` auto-contido — usa `useParams`/`useNavigate` internamente; props `section`/`onNavigate`/`onBackToLobby` removidas.
- [x] `useChat.ts` — hook WebSocket separado extraído do ChatPanel; 12 testes Vitest.
- [x] PWA (manifest + service worker; Lighthouse > 90).

## Épico 5: Qualidade & Documentação
- [x] ADR-001 a ADR-015 documentados.
- [x] `CLAUDE_DESIGN.md` — Design System completo.
- [x] `architecture.md` — topologia CQRS, Kubernetes, blockchain interaction (atualizado).
- [x] Testes backend: `fsm.test.ts`, `dropWorker.test.ts`, `evaluator.test.ts`, `dropController.test.ts`, `ticketController.test.ts`.
- [x] `openapi.yaml v2.0` — 36 endpoints documentados.
- [x] `asyncapi.yaml v2.0` — canais game + room; todos os eventos reais do broadcaster.
- [x] Testes frontend (Vitest) — 43 testes: ticketUtils, rpc, useGamesHistory, useChat.
- [x] `BlockchainDropDeposit`, `BlockchainDropAllocation`, `BlockchainDropState` exportados de `shared-types`.
- [x] PWA — `vite-plugin-pwa` + manifest + Workbox cache-first.
- [x] `docs/SPEC.md` — reescrito com ADR-010 (Rooms), ADR-011 (Drop Vault), ADR-012 (Draw Modes), ADR-013 (Multi-Match), ADR-014 (Orchestration), ADR-015 (Routing). 6 seções novas/expandidas.
- [x] Testes api-gateway (Jest) — 105 testes: authController (func + security + onchain), roomController, monteCarloController, statisticsController (func + security), winningsController, dropController.security, auth.security, rateLimiter.security, helmet.security.
- [x] Testes worker-game-loop (Jest) — 92 testes: evaluator.drawmodes, gameOrchestrator, rabbitmq, roomManager, invertedIndex.
- [x] CI/CD — `.github/workflows/ci.yml` (GitHub Actions: unit + frontend + E2E DUNE manual).
- [x] K8s hardening — `infra/k8s/`: namespace, secrets template, configmap, RBAC mínimo, NetworkPolicies (default-deny + regras por serviço), Deployments com securityContext (runAsNonRoot/readOnly/drop ALL caps), HPA (api+worker+frontend), PodDisruptionBudget, Ingress TLS+rate-limit, ServiceMonitor Prometheus, overlays dev/prod (Kustomize).
- [x] Testes de carga k6 — `tests/k6/smoke.js` + `tests/k6/load.js`.
- [x] `NftAdmin.tsx` + `TokenAdmin.tsx` — painéis de assets na seção 'assets' do AdminLayout.
- [x] `healthController.ts` — probes Kubernetes `/health/live` e `/health/ready` (5 testes).
- [x] `dropWorker.ts` — tipos internos substituídos por `BlockchainDrop*` de shared-types.
- [x] `sweepggr` + `settreasury` — contrato C++ + ABI + ADR-005 Fase 4 documentada.
- [x] Prize calc bugs fixed — `buildWinnerPayloads` + `processAllGameWinners` usam `ticket.price?.quantity` (ADR-010); `computeWinnerMap` usa combination weights no frontend.
- [x] `computeWinnerMap` extraído para `ticketUtils.ts` — testável isoladamente.
- [x] 57 novos testes QA: `evaluator.payout.test.ts` (34), `ticketUtils.test.ts` +23, `gameOrchestrator.test.ts` +7.
- [x] `patternCache.ts` — Redis TTL 1h, fail-open; `GET /api/v1/gametypes/:gametypeId/patterns`.
- [x] Harness E2E 20/20 — ABI `orng.wax` corrigido (tabela `reqs` adicionada manualmente); `init_dev_env.sh` usa ABI hand-maintained. Total: 273 testes passando.
- [x] E2E de UI com Cypress (ADR-017) — 17 specs, 112 testes Tier 1 (PR-gate) + 21 testes Tier 2 (nightly). Jornadas player/admin/sponsor (vault, drops, gametypes/combos). Skill `e2e-ui-cypress` + revisor `e2e-reviewer`; seletores `data-testid`; CI `e2e-ui` (PR) + `e2e-ui-real` (nightly 03:00 UTC).
