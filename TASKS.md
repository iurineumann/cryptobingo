# Backlog do Projeto CryptoBingo

> Fonte de verdade do backlog. Sincronizado com `TRACE.md`.
> Status: [x] Done | [ ] Pendente

## Épico 1: Core de Blockchain & Tokenomics
- [x] Contrato C++ completo (buytickets, lockgame, startdraw, claimwin, receiverand).
- [x] Token dedicado `bingo.token`, Utility NFT via `nftconfigs`.
- [x] ADR-001 a ADR-011 definidos e documentados.
- [x] Tabelas `patterns` e `gametypes` on-chain (ADR-004 Fase 2).
- [x] Fórmula `max_weight` no claimwin (ADR-005 Fase 2).
- [x] Tabela `rooms` on-chain + campo `room_id` em `game_state` (ADR-010 — shared-types OK, contrato C++ em andamento).
- [x] Tabelas `drop_deposits`, `drop_allocations`, `dropstate` (ADR-011 — shared-types OK, contrato C++ pendente).
- [ ] Actions de rooms no contrato C++ (createroom, activateroom, pauseroom, closeroom, setroommeta).
- [ ] Actions de drop vault no contrato C++ (deposittoken, depositnft, allocatedrop, reclaimasset, execdrop).
- [ ] Contrato `bingo.swap` (DEX x*y=k).

## Épico 2: API Gateway & Infraestrutura Off-Chain
- [x] Express + MongoDB + PostgreSQL + Redis.
- [x] Auth JWT challenge-response (ADR-006).
- [x] `ticketController.ts` — geração Fisher-Yates + ECDSA + dedupe Redis.
- [x] `openapi.yaml` v1.4.0 (endpoints completos: admin, statistics, sponsors, nfts).
- [x] Docker Compose com Redis, RabbitMQ, PostgreSQL, MongoDB, Prometheus, Grafana.
- [x] Rotas `/admin/patterns`, `/admin/gametypes`, `/admin/gametypes/:id/metadata`.
- [x] Rotas `/statistics/rtp`, `/statistics/games`, `/admin/ledger/sync`.
- [x] Rotas `/sponsors/campaigns`, `/nfts/my-assets`.
- [x] Rotas `/rooms/*`, `/sponsor/rooms` (ADR-010).
- [x] Rate limiting lazy init + Helmet + CORS restrito.
- [x] Motor de Simulação Monte Carlo (simulateWeights).
- [x] Compliance Ledger PostgreSQL (games_history + transactions_ledger).
- [x] roomController.ts — CRUD de salas + metadados.
- [ ] Rotas de Drop Vault (ADR-011) — deposittoken, allocatedrop, reclaimasset.
- [ ] openapi.yaml atualizado com rooms e drop vault.

## Épico 3: Game Loop Worker & Motor de Resolução
- [x] RabbitMQ consumidor resiliente (at-least-once delivery).
- [x] `lockgame`, `startdraw`, `claimwin` on-chain.
- [x] Motor de Bitmasking O(1) com 12 padrões (ADR-004).
- [x] Índice Invertido Redis O(1) (invertedIndex.ts + integração evaluator + rabbitmq).
- [x] Varredura paginada de tickets (100/página).
- [x] Pipeline claimwin completo → evaluator → blockchain.
- [x] **Dead Letter Queue** — DLX + DLQ + guard `x-death.count >= MAX_RETRIES`.
- [x] **Métricas Prometheus** — `metrics.ts` com 8 métricas customizadas + Node.js defaults.
- [x] **WebSocket Broadcaster** — Socket.io, auth JWT, rooms, Slow Reveal 3s/bola, reconciliação.
- [x] **Grafana** — dashboard provisionado automaticamente com 9 painéis.
- [x] `roomManager.ts` — auto-criação de partidas após game resolved (ADR-010).
- [x] `rabbitmq.ts` — hooks `onGameResolved` em `claimwin` e `abortgame` (ADR-010).
- [ ] `dropWorker.ts` — processamento de drops on-chain ao final de cada partida (ADR-011).
- [ ] asyncapi.yaml atualizado com eventos de chat e sponsor_drop.

## Épico 4: Frontend & Experiência Web3
- [x] Wharfkit (Anchor + Cloud Wallet).
- [x] Auth JWT integrado (useAuth.ts).
- [x] Compra de cartelas (useTicketPurchase.ts + BuyTicketModal.tsx).
- [x] Visualização de cartelas (TicketGrid.tsx).
- [x] Slow Reveal ao vivo (useSlowReveal.ts + BallDisplay.tsx).
- [x] Cartelas marcadas em tempo real conforme bolas são sorteadas.
- [x] LandingPage.tsx — página pública para visitantes não autenticados.
- [x] GameRoom.tsx — tela de sala ao vivo (gr-*, bola hero, cartelas, padrões, chat).
- [x] App.tsx — roteamento state-based: landing/lobby/game/wallet/admin + roomId.
- [x] AdminLayout.tsx — shell admin com site-*, sidebar com grupos + seção Rooms.
- [x] Painel Administrativo (ADR-009): Dashboard, Patterns, Gametypes, Sponsors, Compliance, Users, Player, Rooms.
- [x] Multi-role dev login: 5 perfis (Jogador 1/2, Game Admin, Contract Admin, Sponsor).
- [x] globals.design.css — classes gr-*, site-*, lobby-*, admin-* (Claude Design).
- [x] Locales pt/en/zh — chaves aninhadas completas.
- [x] ChatPanel.tsx — chat por sala via Socket.io (ADR-010).
- [ ] Lobby.tsx — refatorar para listar salas (rooms) em vez de games (ADR-010).
- [ ] SponsorRooms.tsx — painel do sponsor para gerenciar suas salas.
- [ ] useChat.ts — hook WebSocket separado para chat.
- [ ] GametypesAdmin — Suggest Combinations helper (Monte Carlo + dificuldade).
- [ ] PWA (Lighthouse > 90).

## Épico 5: Documentação
- [x] ADR-001 a ADR-011 criados e documentados.
- [x] `openapi.yaml` v1.4.0, `asyncapi.yaml` v1.0.0.
- [x] `CLAUDE_DESIGN.md` — Design System completo para Claude Design.
- [ ] `openapi.yaml` — endpoints de rooms e drop vault.
- [ ] `asyncapi.yaml` — eventos de chat e sponsor_drop.
- [ ] `docs/SPEC.md` — atualizar com rooms (ADR-010).
- [ ] `docs/architecture.md` — FSM da sala, diagramas.
