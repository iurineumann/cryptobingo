# ADR-048 — `updateroom` permite editar preços de sala pausada/inativa

- Status: Aceito
- Data: 2026-07-09
- Tags: Infrastructure, Blockchain, Contract, Bugfix
- Corrige/estende: ADR-045 (`updateroom`)

## Contexto

A action `updateroom` (introduzida em ADR-045) altera os 3 preços de
cartela de uma sala. Seu check original (bingo.cpp:1604):

```cpp
check(room_itr->current_game_id == 0,
    "Sala com jogo em andamento nao pode ter precos alterados.");
```

bloqueia qualquer edição de preços quando `current_game_id != 0`.

Porém `pauseroom` (bingo.cpp:1549) **SÓ seta `status = "paused"`** — não
zera `current_game_id` nem aborta o jogo corrente. Consequência: uma sala
pausada retém o `current_game_id` do último jogo, e `updateroom` a trata
como "jogo em andamento" → **sala pausada fica impossível de editar
preços** (`PUT /api/v1/rooms/{id}/settings` → assertion failure).

Reportado em produção testnet: sala 1 `status: paused` +
`current_game_id: 1783630875737` → erro ao editar.

## Decisão

Aproximação **A** (menor risco, não destrói jogo ao pausar): relaxar o
check em `updateroom` para permitir edição quando a sala **não está ativa**
(`status != "active"`). Sala pausada/inativa não tem jogo ativo de fato
(mesmo que `current_game_id` retenha o id do último jogo), logo editar
preços é seguro.

```cpp
check(room_itr->status != "closed"_n, "Sala fechada nao pode ser alterada.");
// Só bloqueia quando status=='active' E há jogo corrente.
check(room_itr->status != "active"_n || room_itr->current_game_id == 0,
    "Sala com jogo em andamento nao pode ter precos alterados.");
```

Mantém o bloqueio para `status == "active"` com `current_game_id != 0`
(jogo real em andamento) e para `status == "closed"` (linha anterior).

**Rejeitada — abordagem B:** fazer `pauseroom` zerar `current_game_id`
(abortando o jogo ao pausar). Deixaria a sala "limpa" mas poderia perder
apostas de um jogo em `funding`/`locked` ao pausar — efeito colateral não
desejado para uma ação administrativa de pausa.

**ABI inalterado:** a assinatura de `updateroom` não mudou; o WASM foi
rebuildado mas o ABI manual (`contracts/bingo/bingo.abi`) permanece igual
(deploy com `setcode` only — `setabi` skipado).

## Consequências

### Positivas
- Sala pausada/inativa editável via `PUT /api/v1/rooms/{id}/settings`.
- Sem regressão: sala `active` com jogo corrente continua bloqueada.
- Sem mudança de ABI → zero impacto em frontend/backend/harness.

### Negativas / trade-offs
- `pauseroom` ainda não zera `current_game_id` (consistência futura).
  Se um jogo estava em `drawing`/`locked` ao pausar, ele "congela" com
  `current_game_id` retido; ao reativar (`activateroom`), o jogo congelado
  volta a ser corrente com preço antigo. Edge case aceitável.

### Verificação
- Deploy testnet: `cleos set contract bingogamectr` → TX `ba55d4f4...`.
- Teste: `PUT /api/v1/rooms/1/settings` em sala 1 `paused` → HTTP 200,
  `transaction_id bf22d87c...`, on-chain `ticket_price_default` atualizou
  de `1.0000 BINGO` para `1.00000000 WAX` mantendo `status: paused`.

## Referências
- Issue #236 (bug report).
- PR #237 (fix + deploy).
- ADR-045 — `updateroom` e modelo de permissões (auth `active`).
- `contracts/bingo/src/bingo.cpp` — `updateroom` (linha ~1604), `pauseroom` (1549).
- `apps/api-gateway/src/controllers/roomController.ts` — `updateRoomSettings`.
- Chaves testnet: RAG `agent://testnet-keys/2026-07-09`.
