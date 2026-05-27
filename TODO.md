# TODO.md — Tarefas Imediatas e Dívidas Técnicas

## [DONE] Sprint — ABI Manual + Ricardian + Tailwind v4 (2026-05-26)

### Contrato — ABI Manual
[DONE] bingo.abi reescrito manualmente e sincronizado com bingo.hpp sprint atual.
[DONE] Todas as novas structs adicionadas: campaign_record, game_state com end_time/gametype_id.
[DONE] Todas as novas actions documentadas: fundgame, abortgame, refundticket, cleargame, linkcampaign, closecampaign.
[DONE] Tabela campaigns adicionada com secondary index bysponsor.
[DONE] win_pattern_mask corrigido de uint32 para uint64 (alinhado ao bingo.hpp).
[DONE] ricardian_clauses adicionadas: terms-of-service e dispute-resolution (inglês, padrão WAX Mainnet).

### Contrato — Ricardian Contracts (formato WAX)
[DONE] bingo.contracts.md reescrito em inglês com formato WAX correto (<h1 class="contract">).
[DONE] Todos os 17 actions documentados com Intent + Terms + variáveis {{campo}}.
[DONE] Contratos Ricardianos inline no bingo.abi (campo ricardian_contract de cada action).
[DONE] Referências à legislação brasileira (Lei 14.790/2023) nos contratos relevantes.

### Frontend — Tailwind CSS v4
[DONE] package.json — "type": "module" + tailwindcss@^4.0.0 + @tailwindcss/vite@^4.0.0 + vite@^5.0.0.
[DONE] vite.config.ts — plugin tailwindcss() antes do react plugin.
[DONE] globals.css — Design System completo com @theme CSS-first + @import globals.design.css.
[DONE] globals.design.css — extensão com classes gr-*, site-*, lobby-*, admin-* (Claude Design).
[DONE] Modo escuro (padrão) + modo claro via [data-theme="light"] na <html>.
[DONE] useTheme.ts — hook com persistência localStorage + sync data-theme.
[DONE] main.tsx — importa globals.css, inicializa tema anti-FOUC.
[DONE] index.html — fontes Google, anti-FOUC script inline, meta theme-color.
[DONE] App.tsx — roteamento state-based completo: landing/lobby/game/wallet/admin + roomId (ADR-010).

## [DONE] Migração completa de componentes para Tailwind v4 + Claude Design (2026-05-26/27)
[DONE] Lobby.tsx — classes lobby-*, prop onEnterRoom(roomId, gameId) para ADR-010.
[DONE] BuyTicketModal.tsx — cb-overlay + cb-modal + cb-slide-up + quick-select + aria.
[DONE] TicketGrid.tsx — cb-bingo-grid + cb-bingo-cell + animação cb-ball-drop.
[DONE] BallDisplay.tsx — cb-ball + cb-ball-lg + cb-winner-glow + cb-status-dot-live.
[DONE] GameRoom.tsx — classes gr-*, bola hero animada, sequência, cartelas, painel padrões + ChatPanel.
[DONE] LandingPage.tsx — landing pública com bola animada, stats, B2B, footer compliance.
[DONE] AdminLayout.tsx — site-shell mode-admin, sidebar com grupos + seção Rooms (ADR-010).
[DONE] RoomsAdmin.tsx — admin de salas (ADR-010).
[DONE] ChatPanel.tsx — chat por sala via Socket.io (ADR-010).
[DONE] Locales pt/en/zh — chaves aninhadas: common, nav, auth, game, room, game_room, wallet_page, admin, errors.

## [DONE] Sprint — Admin Screens + Multi-Role Dev Login + B2B + Compliance (2026-05-26)
[DONE] AdminDashboard, PatternsAdmin, GametypesAdmin, SponsorDashboard, ComplianceAdmin, UsersAdmin, PlayerDashboard.
[DONE] rateLimiter.ts — lazy init com passthrough (Redis closed bug resolvido).
[DONE] api-gateway/index.ts — rotas: /admin/gametypes/:id/metadata, /rooms/*, /sponsor/rooms.
[DONE] statisticsController.ts — getRtpStatistics, getGamesHistory, syncGameToLedger.
[DONE] sponsorController.ts — listCampaigns, getCampaign, linkCampaignToGame, closeCampaign.
[DONE] nftController.ts — getMyNfts com cache MongoDB TTL 5min.
[DONE] database/ledger.ts — tabelas games_history + transactions_ledger + RTP report real.
[DONE] init_dev_env.sh — 3 contas administrativas + .dev.env + 5 botões dev login.
[DONE] ADR-009 — Admin Panel Architecture.

## [DONE] Sprint — ADR-010 Rooms + ADR-011 Drop Vault (2026-05-27)
[DONE] ADR-010-rooms-salas.md — salas persistentes, auto-scheduling, chat, drops, weight por sala.
[DONE] ADR-011-drop-vault.md — rastreamento on-chain de ativos para drops.
[DONE] contracts/bingo — tabela rooms + campo room_id em game_state (bingo.hpp).
[DONE] shared-types — BlockchainRoom, RoomMetadata, DropDeposit, DropAllocation, DropState.
[DONE] api-gateway/models/RoomMetadata.ts — modelo MongoDB.
[DONE] api-gateway/controllers/roomController.ts — CRUD rooms + sponsor endpoint.
[DONE] worker/services/roomManager.ts — onGameResolved + auto-criação de partidas.
[DONE] rabbitmq.ts — hooks onGameResolved em claimwin e abortgame.
[DONE] invertedIndex.ts — buildInvertedIndex O(1) + integração no evaluator e rabbitmq.
[DONE] CLAUDE_DESIGN.md — documento Design System (20 seções + 3 apêndices).

## [DEBT] Dívidas Técnicas Residuais
[DEBT] ADR-005: auto-sweep de GGR para tesouraria não implementado.
[DEBT] contracts/bingo: actions de rooms (createroom, activateroom, etc.) — apenas shared-types e API implementados. Contrato C++ ainda não compilado com tabela rooms.
[DEBT] dropWorker.ts — processamento de drops on-chain (ADR-011) pendente.
[DEBT] useChat.ts — hook WebSocket separado para chat (atualmente inline no ChatPanel).
[DEBT] SponsorRooms.tsx — painel do sponsor para gerenciar suas salas.
[DEBT] fsm.test.ts — testes atualizados para CREATED/FUNDING/abort.

## [NEXT] Próximos Passos
[ ] GametypesAdmin — Suggest Combinations helper (Monte Carlo + análise de dificuldade).
[ ] contracts/bingo — implementar actions de rooms (createroom, activateroom, pauseroom, closeroom, setroommeta).
[ ] dropWorker.ts — executar drops ao final de cada partida (ADR-011).
[ ] PWA (Lighthouse > 90).
[ ] Testes unitários adicionais (authController, monteCarloController, hooks React).
[ ] Auto-sweep GGR (ADR-005): action sweepggr no contrato C++.
[ ] openapi.yaml e asyncapi.yaml — documentar endpoints de rooms e eventos de chat.
