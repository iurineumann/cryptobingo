# TODO.md — Tarefas Imediatas e Dívidas Técnicas

> Última auditoria de estado real: 2026-06-03
> Itens marcados como DEBT que já estavam implementados foram movidos para DONE.

---

## [DONE] Sprint — ABI Manual + Ricardian + Tailwind v4 (2026-05-26)

[DONE] bingo.abi reescrito manualmente e sincronizado com bingo.hpp.
[DONE] Contratos Ricardianos completos (17 actions, formato WAX, Lei 14.790/2023).
[DONE] Frontend migrado para Tailwind CSS v4 (globals.css, globals.design.css, useTheme.ts).

## [DONE] Sprint — Admin + Multi-Role + B2B + Compliance (2026-05-26)

[DONE] Painel Admin completo: Dashboard, Patterns, Gametypes, Sponsors, Compliance, Users, Player.
[DONE] statisticsController.ts — RTP, games history, ledger sync.
[DONE] Compliance Ledger PostgreSQL (games_history + transactions_ledger).
[DONE] Multi-role dev login (5 perfis).

## [DONE] Sprint — ADR-010 Rooms + ADR-011 Drop Vault — Infra (2026-05-27)

[DONE] ADR-010 e ADR-011 documentados.
[DONE] roomController.ts — CRUD rooms + sponsor endpoint.
[DONE] roomManager.ts — onGameResolved + auto-criação de partidas.
[DONE] rabbitmq.ts — hooks onGameResolved + 3 auto-advance polls.
[DONE] invertedIndex.ts — buildInvertedIndex O(1).
[DONE] ChatPanel.tsx — chat por sala via Socket.io.

## [DONE] Sprint — Contrato C++ v2 + Rooms + Drop Vault (2026-05-31)

[DONE] bingo.hpp + bingo.cpp — tabela rooms completa (5 actions: createroom, activateroom, pauseroom, closeroom, setroommeta), room_drop_chance_bps.
[DONE] bingo.hpp + bingo.cpp — Drop Vault completo: tabelas dropdeposits + dropallocs + singleton dropstate, actions allocatedrop + deallocdrop + reclaimasset + execdrop, on_notify atomicassets::transfer (onnfttransfer) e deposit() com memo 'vault'.
[DONE] bingo.abi v2.0 — 31 actions, 12 tabelas, 14 structs, completo e sincronizado.
[DONE] dropWorker.ts — 3 fases: Fase 0 (room chance BPS), Fase 1A/1B (seleção NFT/token com Fisher-Yates), Fase 2 (seleção vencedor). Integrado ao onGameResolved.
[DONE] dropController.ts — 6 endpoints de vault (/vault/deposits, /vault/allocations, allocate, deallocate, reclaim).
[DONE] VaultAdmin.tsx — painel admin com grid de depósitos, alocações e reclaim.
[DONE] RoomsAdmin.tsx — admin de salas com seção Drops.

## [DONE] Sprint — Motor de Jogo + Calibração RTP (2026-05-31)

[DONE] Weight decimal (2 casas) — pattern_rule.weight uint8→uint16 (hundredths).
[DONE] Remove limite de 12 patterns/rules do contrato e frontend.
[DONE] Suggest Combinations — 3 estratégias + calibração iterativa até RTP ≈ 85%.
[DONE] Metadata upsert — patternController persiste rules + combinations.

## [DONE] Sprint — ADR-012/013/014 + TicketCard + Replay (2026-06-02)

[DONE] ADR-012 (Draw Modes: fixed/first_full/golden_ball), ADR-013 (Multi-Match), ADR-014 (Orchestration).
[DONE] TicketCard.tsx — componente compartilhado com sort/group por fase (GamePhase).
[DONE] Sort/Group System — combinedScore, multi-pattern priority, winnerMap com patternCount/totalPrize.
[DONE] ReplayRoom.tsx — reescrito com TicketCard, padrões, banners, goldenBall, gameEnded.
[DONE] useReplay.ts — patterns, patternWinCount, combinationCount, winners, goldenBall, gameEnded.
[DONE] MyHistoryPage.tsx + useGamesHistory.ts — histórico pessoal com Load More, deduplicação.
[DONE] RoomHistoryPanel.tsx + useRoomHistory.ts — histórico geral de sala.

## [DONE] Sprint — ADR-015 URL Routing + Stats Públicas (2026-06-03)

[DONE] ADR-015 — React Router DOM v6: BrowserRouter, AuthGuard, AdminGuard, deep links.
[DONE] App.tsx — roteamento URL-based completo, /room/:roomId/history público.
[DONE] utils/rpc.ts — fetchTableRows público (sem sessão via proxy Vite).
[DONE] fetchBatchGameStats — endpoint GET /api/v1/statistics/games/batch (público).
[DONE] useRoomHistory.ts — session opcional, enriquecimento com totalPaidOut do ledger.
[DONE] RoomHistoryPanel.tsx — session opcional (visitantes), barra de resumo lifetime.
[DONE] LandingPage.tsx — stats live por sala (tickets, status slow-reveal, countdown), botão Histórico.
[DONE] Lobby.tsx — botão Histórico para todas as salas (★ = participou), chips de tickets vendidos.
[DONE] MyHistoryPage.tsx — ROI% por partida, win rate, stats globais (allTickets, totalWagered, totalPaidOut).
[DONE] GameRoom.tsx — navbar completa com menu, theme toggle, language change, onGoToHistory/Wallet/Admin.

---

## [DEBT] Dívidas Técnicas Reais (auditadas em 2026-06-04)

[DONE] `useChat.ts` — extraído de ChatPanel.tsx; 12 testes Vitest (2026-06-04).
[DEBT] `DropDeposit`, `DropAllocation`, `DropState` — tipos definidos apenas internamente no dropWorker.ts; não exportados do `shared-types`. Outros serviços não podem importá-los.
[DEBT] `fsm.test.ts` — testes desatualizados para CREATED/FUNDING/abort (game loop mudou).

---

[DONE] `SponsorLayout.tsx` + `SponsorRooms.tsx` + `SponsorVault.tsx` — painel sponsor em `/sponsor/*` com layout dedicado, sidebar, edição de metadata e gestão de vault com dropdown de salas próprias.
[DONE] Badges 🎁 NFT Drop / 💰 Token Drop no Lobby e LandingPage via `room.metadata.drops`.
[DONE] `AdminLayout.tsx` auto-contido — usa `useParams`/`useNavigate` diretamente; props `section`/`onNavigate`/`onBackToLobby` removidas; wrapper `AdminPage` eliminado.

## [NEXT] Próximos Passos Reais

[DONE] `openapi.yaml v2.0` — 36 paths: rooms, vault, player/winnings, statistics/batch, admin gametypes, nfts, patterns DELETE.
[DONE] `asyncapi.yaml v2.0` — canal game.{id} + room.{id}; eventos: golden_ball, stage_cleared, game_ended, sync_response, chat:message, chat:sponsor_drop.
[DONE] `shared-types` — `BlockchainDropDeposit`, `BlockchainDropAllocation`, `BlockchainDropState` exportados.
[DONE] Vitest v1.6.1 — 31 testes: ticketUtils (21), rpc (4), useGamesHistory (6). Fix: `isCombinationSatisfied` usa `pattern_ids` (não `patterns`); `sortTickets` não deduplica (isso é do `setRows`).
[DONE] PWA — `vite-plugin-pwa v1.3.0`: manifest CryptoBingo, Workbox cache-first, navigateFallbackDenylist para /v1|/api|/socket.io, runtime caching Google Fonts. `index.html` com `<link rel="manifest">`.

[DONE] `docs/SPEC.md` — reescrito: §1.5 Rooms, §1.6 Drop Vault, §2.3-2.5 actions ADR-010/011/012/013, §3.4 orquestração ADR-014, §4 eventos WebSocket v2, §5 Frontend routing ADR-015, §6.3 Compliance.

## [DONE] Sprint — game-admin-assets (2026-06-04)

[DONE] `NftAdmin.tsx` — painel AtomicAssets: coleções, schemas, templates, assets (mint/burn/transfer).
[DONE] `TokenAdmin.tsx` — painel bingo.token: supply, saldos internos/externos, issue/retire/transfer.
[DONE] `AdminLayout.tsx` — integra NftAdmin + TokenAdmin na seção 'assets' (ADR-015 routing).
[DONE] `useChat.ts` — hook extraído do ChatPanel; 12 testes Vitest.
[DONE] Testes api-gateway — 105 passing (authController func+security+onchain, roomController, monteCarlo, statistics func+security, winnings, drop.security, auth.security, rateLimiter.security, helmet.security).
[DONE] Testes worker-game-loop — 92 passing (evaluator.drawmodes, gameOrchestrator, rabbitmq, roomManager, invertedIndex).
[DONE] CI/CD — `.github/workflows/ci.yml` (GitHub Actions: unit + frontend + E2E DUNE manual).
[DONE] k6 — `tests/k6/smoke.js` + `tests/k6/load.js`.
[DONE] i18n — 75 novas chaves (`nft_` + `token_`) em pt/en/zh.

### Baixa prioridade / Futuro
[ ] `DropDeposit/DropAllocation/DropState` — exportar de shared-types (atualmente só em dropWorker.ts).
[ ] `fsm.test.ts` — atualizar para FSM atual (FUNDING/LOCKED/DRAWING/DRAWN).
[ ] `sweepggr` — action no contrato C++ para auto-sweep GGR para tesouraria (ADR-005).
[ ] `bingo.swap` — contrato DEX x*y=k (fora do escopo atual).
