# ADR-056 — `funded_at` on-chain na struct `games` (raiz real da race do lobby)

- Status: Proposta (aguardando aprovação do usuário antes de mexer no `.cpp`/`.abi`)
- Data: 2026-07-17
- Tags: Blockchain, Contract, Bugfix, Lobby, Funding
- Corrige/estende: Fase 1 (#392 funded_at off-chain / PR #396; #393 fundgame DLQ / PR #397; #394 lock Redis / PR #398; #395 FUNDING_WINDOW_SEC / PR #399)
- Issue: #401

## Contexto

A race do lobby (salas `created` longas → `funding` → fechadas com <60s reais;
status incoerentes no card) tem raiz em usar `game_id = Date.now()` como
**t0 da janela de funding**.

Cadeia confirmada por código (Fase 1, 2026-07-16):

1. `roomManager.ts:64` — `generateGameId()` retorna `String(Date.now())`.
   Em `createNextGameForRoom` há `sleep(autoStartDelaySec)` (default 30s) ANTES
   de gerar o id (roomManager.ts:77→96), depois loop de confirmação on-chain
   (até 10s) e só então `publishGameEvent('fundgame')` (roomManager.ts:128) →
   consumer assíncrono executa `fundgame`.
   → O `game_id` é **≥30s mais antigo** que o efetivo início do funding.
2. `bingo.cpp:228` — `fundgame` SÓ troca `status` (`created→funding`);
   **não grava timestamp**. `creategame` (bingo.cpp:224) seta `end_time = 0`
   e só o preenche em `lock`/`draw` (bingo.cpp:1450/1484).
   → **Não há `funded_at` em lugar nenhum**.
3. Worker `rabbitmq.ts:882` — `cutoff = Date.now() - 60s`; trava se
   `Number(gameId) <= cutoff`. Frontend `Lobby.tsx:202` — `closeAt = game_id + 60s`.
   Como `game_id` antecede o funding, a janela real é corroída pela latência
   creategame→funding (piorada por DLQ backoff, issue #393).

A Fase 1 aplicou **quick-wins OFF-CHAIN**: `funded_at` gravado em Redis no
consumer `fundgame` (PR #396, issue #392) e consumido por worker/frontend/gateway.
Isso elimina o sintoma na maioria dos casos, mas continua dependendo do
**off-chain** como fonte-de-verdade — perde ao restart do Redis, em nós
distintos, ou se o consumer `fundgame` falhar antes de gravar.

A raiz real exige `funded_at` **on-chain**: fonte-de-verdade única,
imutável, visível a qualquer nó/serviço.

## Decisão

Adicionar `funded_at` à struct `games` (`game_state`, bingo.hpp:44) como
**`eosio::binary_extension<uint32_t>`** (padrão do repo para campos novos
retrocompatíveis — ver `config_state.oracle_account` bingo.hpp:23,
`gametype_record.combinations` bingo.hpp:271, `room_record` campos
bingo.hpp:302-306), gravado em `fundgame` (bingo.cpp:228).

```cpp
// bingo.hpp — struct game_state (linha ~57, após total_paid)
eosio::binary_extension<uint32_t> funded_at;  // ADR-056: epoch sec do início do funding
```

```cpp
// bingo.cpp — fundgame (linha ~232, no modify após trocar status)
games.modify(game_itr, same_payer, [&](auto& g) {
    g.status    = "funding"_n;
    g.funded_at = current_time_point().sec_since_epoch();  // ADR-056
});
```

**Por que `binary_extension` e não campo direto:** linhas de `games` já
escritas em produção (sem `funded_at`) desserializam sem quebrar — o campo
ausente é tratado como default. Sem `binary_extension`, o WASM exigiria
re-serialize todas as linhas existentes (quebra retrocompatibilidade de
leitura). O repo já usa esse padrão para exatamente esse caso.

**Por que `uint32_t` (epoch sec) e não `time_point_sec`:** `time_point_sec`
já é `uint32_t` internamente; usar `uint32_t` direto no `binary_extension`
evita qualquer fricção de ABI com o tipo custom. Worker/frontend já
convertem epoch↔Date.

**Consumo (após deploy):**
- Worker `rabbitmq.ts:882`: `cutoff` baseado em `game.funded_at ?? game.game_id`
  (fallback para jogos antigos sem o campo).
- Frontend `Lobby.tsx:202`: `closeAt = (funded_at ?? game_id) + 60s`.
- api-gateway `lobbyController.ts` (PR #396): `funded_at` já é anexado;
  passa a vir do contrato (Redis off-chain vira cache/fallback).

**ABI:** o `binary_extension` altera o ABI de `games` (campo opcional). Deploy
exige `setcode` + `setabi` (diferente de ADR-048 que skipou ABI). O
`bingo.abi` manual em `contracts/bingo/bingo.abi` deve ser atualizado e o
WASM rebuildado.

## Consequências

### Positivas
- Fonte-de-verdade única e imutável para o t0 do funding.
- Elimina dependência de Redis off-chain para o `funded_at` (ou o mantém
  como cache/fallback para latência).
- Resolve a raiz real da race (não só o sintoma, como a Fase 1).
- Retrocompatível (binary_extension): jogos antigos sem `funded_at` continuam
  válidos; fallback `game_id` preservado no worker/frontend.

### Negativas / trade-offs
- Mexe em contrato on-chain (irreversível após deploy mainnet) → exige
  aprovação explícita do usuário + deploy testnet primeiro.
- `setabi` altera o ABI → todos os consumidores (frontend/worker/harness)
  devem ler o novo campo (já preparados pela Fase 1).
- Janela de 60s (`FUNDING_WINDOW_SEC`, PR #399) continua sendo a CONSTANTE;
  o `funded_at` só define O QUANDO ela começa.

## Verificação (após aprovação + deploy testnet)
1. `cleos set contract bingogamectr` (setcode + setabi) na testnet.
2. `creategame` → `fundgame` → checar `funded_at` na row `games` via `cleos get table`.
3. Worker: jogo em `funding` com `funded_at` recente NÃO trava imediatamente
   (cutoff baseado em `funded_at`, não `game_id`).
4. Frontend: `closeAt` do card reflete `funded_at + 60s` (não fecha antes).
5. Jogo antigo (sem `funded_at`) ainda funciona com fallback `game_id`.

## Referências
- Issues Fase 1: #392 (PR #396), #393 (PR #397), #394 (PR #398), #395 (PR #399).
- Issue Fase 2: #401 (esta), #402 (fila lockgame), #403 (push broadcaster),
  #404 (watchdog lock), #405 (trust-proxy XFF).
- RAG: `agent://bugs/2026-07-16-lobby-funding-race-consolidado-3personas`
- RAG: `agent://backlog/2026-07-17-fase2-estrutural-pendencias`
- `contracts/bingo/include/bingo.hpp` — struct `game_state` (:44), padrão
  `binary_extension` em `config_state` (:23), `gametype_record` (:271),
  `room_record` (:302-306).
- `contracts/bingo/src/bingo.cpp` — `fundgame` (:228), `creategame` (:224),
  `lockgame`/`draw` setando `end_time` (:1450/1484).
- `apps/worker-game-loop/src/services/roomManager.ts` — `generateGameId` (:64),
  `createNextGameForRoom` (:71-131).
- `apps/worker-game-loop/src/services/rabbitmq.ts` — autolock cutoff (:882).
- `apps/frontend/src/components/Lobby.tsx` — `closeAt` (:202).
