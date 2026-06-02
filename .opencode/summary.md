# Cryptobingo — Anchored Summary

## Goal
- Provide player game history and visual replay that simulates the live slow-reveal experience for past games.
- Keep lobby working exactly as before, with replay as a bonus feature.

## Constraints & Preferences
- TypeScript strict, Node >= 18, pnpm >= 8, React 18 + Vite 5 + Tailwind CSS v4
- Frontend uses `session.client.v1.chain.get_table_rows()` directly (no blockchain-core package in frontend)
- Replay works entirely client-side (fetch game state + tickets via RPC, simulate ball reveal locally)
- No React Router — state-based routing via `section`/`page` state
- Wharfkit for wallet auth; `UInt64.from()` for numeric scopes in `get_table_rows`
- On-chain `bytes` fields (`matrix`, `drawn_balls`) arrive as hex strings — must be parsed client-side
- i18next for all visible text (pt-BR, en-US, zh-CN)
- Lobby reads data directly from blockchain (doesn't depend on backend for on-chain tables)

## Progress
### Done
- **Worker auto-advance**: `autoLockFundingGames()`, `autoStartLockedGames()`, `autoClaimDrawnGames()` in `rabbitmq.ts` with polling in `index.ts` (15s/30s intervals). Game lifecycle now completes automatically without RabbitMQ messages.
- **`init_dev_env.sh` fix**: Added `orng_mock` deploy to `orng.wax`, changed mount from `contracts/bingo` to `contracts/`. Manual deploy of `orng_mock.wasm` + `.abi` on waxdev.
- **Hex-bytes serialization fix**: `fetchGame()` / `fetchPlayerTickets()` in `packages/blockchain-core/src/client.ts` parse hex → `number[]`. `normalizeTickets()` in `evaluator.ts` and `invertedIndex.ts`. Package rebuilt.
- **Game `1780325932276`**: Completed full lifecycle via `receiverand` → `claimwin` → `closegame` → `archived`.
- **`useReplay.ts`**: Hook that fetches game state + player tickets via RPC, parses hex `drawn_balls`, simulates sequential ball reveal with configurable speed (0.5×–8×), play/pause/restart/skip-to-end controls.
- **`ReplayRoom.tsx`**: Full-screen replay room reusing `TicketGrid` + hero-ball CSS (`gr-*` classes), with replay control bar (play/pause, speed selector, progress bar, restart, skip-to-end).
- **`useGamesHistory.ts`**: Hook that fetches games from blockchain with cursor-based pagination, filters by `roomId` when specified, checks player tickets per game via `Promise.allSettled` on secondary index queries, returns `GameHistoryRow[]`.
- **`RoomHistoryPanel.tsx`**: Table of past games in a specific room (date, game ID, tickets count, total spent, "View Replay" link), with "Load More" pagination. Not currently wired in App.tsx but available for future use.
- **`MyHistoryPage.tsx`**: Dedicated history page across all rooms, accessible via nav tab "Histórico". Same table layout with extra "Room" column, filter-by-room dropdown, pagination.
- **Lobby.tsx**: Completamente refatorado para arquitetura room-centric. Um card por sala ativa (de `fetchRooms()`); cada card mostra o jogo atual da sala (match por `room_id`). Status do jogo determina CTA: `funding` → Comprar, `drawing/locked/drawn` → Assistir, sem jogo → "⏳ Próximo jogo em breve". Replay (📽) é botão secundário pequeno que só aparece se `playerRoomIds.has(room.room_id)` — verifica participação em qualquer jogo arquivado/sorteado da sala. Clicar no Replay abre modal inline com `RoomHistoryPanel` (histórico de partidas + link para ReplayRoom). Jogos sem sala (`room_id='0'`) mostram como fallback abaixo dos cards. `watchGameId`/slow-reveal/`playerTickets` removidos (Watch agora sempre navega para GameRoom). `playerGameIds` → `playerRoomIds` (agrega por room, não por game).
- **RoomsAdmin.tsx**: Fix de persistência no edit: `updateRoomMetadata` (MongoDB) e `updateRoomSettings` (blockchain) agora têm error handling separado. Falha no settings mostra aviso `(config on-chain não atualizada)` mas NÃO bloqueia o sucesso da metadata; modal fecha e rooms recarregam normalmente. New locale: `admin.rooms_error_settings` (pt/en/zh).
- **App.tsx**: Added routes `replay` (full-screen ReplayRoom), `room_history` (full-screen RoomHistoryPanel), `my_history` (in-shell MyHistoryPage). Nav tabs: "Salas" | "Histórico" | "Carteira".
- **Locales**: Full `replay.*` section in pt/en/zh (~30 keys each: room_history_title, my_history_title, view_replay, col_date/col_room/col_game/col_tickets/col_spent/col_action, filter_room/filter_all/room_option, no_history, back_to_lobby, etc.). `nav.my_history` and `common.load_more` added across all locales.

### In Progress
- (none — all tasks from this session complete)

### Blocked
- (none)

## Key Decisions
- **Replay is client-side only**: No backend endpoint needed. Hooks fetch game + tickets via RPC, simulate ball reveal with `setInterval` at configurable speed.
- **Replay button requires participation check**: Lobby checks `tickets` table (secondary index by owner) for each completed game during `loadBlockchainData`. Stored as `Set<string> gameIds` — button only renders if player has tickets.
- **Room history vs single-game replay**: Lobby "Replay" button navigates directly to `ReplayRoom` (single game). Room history table (`RoomHistoryPanel`) is a separate view for browsing all past games in a room before picking one to replay.
- **`canWatch` unchanged**: Original statuses `drawing`/`locked`/`drawn`. Replay is purely additive.
- **`playerGameIds` populated in batch**: During each `loadBlockchainData` cycle, completed games are detected and a parallel `Promise.allSettled` queries their `tickets` table. Non-blocking — UI renders without waiting, replay buttons appear after check completes.
- **Cursor-based pagination for game history**: `useGamesHistory` uses `UInt64.from(lastGameId).add(1)` as next `lower_bound` cursor, sorted descending by game_id client-side.

## Critical Context
- `drawn_balls` is `uint8_t[75]` on-chain → serialized as hex string in `get_table_rows` response. Must parse with `parseHexBytes()` (strip `0x` prefix, iterate 2 chars at a time, `parseInt(..., 16)`).
- Same hex parsing applies to `matrix` (24-position column-major array) in tickets.
- `UInt64.from(gameId)` is the standard pattern for all `get_table_rows` calls with numeric keys.
- `index_position: 'secondary'` + `key_type: 'i64'` required for querying tickets by owner.
- Tickets table scope is `UInt64.from(gameId)` — secondary index on `owner` (name converted to i64 via `Name.from(actor).value`).
- The worker (`pnpm dev` on port 8085) uses `ts-node-dev --respawn` via Turbo. `@cryptobingo/blockchain-core` must be rebuilt (`pnpm --filter @cryptobingo/blockchain-core build`) after edits to `client.ts`.
- Games table loads up to 20 entries per polling cycle (15s interval in Lobby).

## Relevant Files
- **`apps/frontend/src/hooks/useReplay.ts`**: Timer-based sequential ball reveal, playback controls.
- **`apps/frontend/src/hooks/useGamesHistory.ts`**: Game history fetch + ticket participation check + pagination.
- **`apps/frontend/src/components/ReplayRoom.tsx`**: Full-screen replay with hero ball, ball strip, TicketGrid, controls.
- **`apps/frontend/src/components/RoomHistoryPanel.tsx`**: Room-specific past games table.
- **`apps/frontend/src/components/MyHistoryPage.tsx`**: Cross-room game history with filters + pagination.
- **`apps/frontend/src/components/Lobby.tsx`**: `playerGameIds` Set, conditional replay button, unchanged core flow.
- **`apps/frontend/src/App.tsx`**: Routes: `replay`, `room_history`, `my_history`. Nav tabs updated.
- **`apps/frontend/src/locales/en.json`**: `replay.*` section, `nav.my_history`, `common.load_more`.
- **`apps/frontend/src/locales/pt.json`**: Same keys in Portuguese.
- **`apps/frontend/src/locales/zh.json`**: Same keys in Chinese.
- **`apps/worker-game-loop/src/services/rabbitmq.ts`**: `autoLockFundingGames`, `autoStartLockedGames`, `autoClaimDrawnGames`.
- **`apps/worker-game-loop/src/index.ts`**: Polling intervals for auto-advance functions.
- **`packages/blockchain-core/src/client.ts`**: `parseHexBytes`, `fetchGame`, `fetchPlayerTickets` with hex normalization.
- **`init_dev_env.sh`**: orng_mock deploy + contracts mount.
