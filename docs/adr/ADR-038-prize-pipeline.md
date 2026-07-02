# ADR-038 — Prize Pipeline: Persistência, WebSocket e Frontend

**Status:** Aceito (2026-06-30)
**Data:** 2026-06-30

---

## Problema

Antes deste ADR, prêmios existiam apenas em dois lugares efêmeros:

1. **On-chain** — transação `claimwin`/`claimcombo`/`claimstage` na blockchain WAX. Sem histórico acessível via API REST.
2. **WebSocket efêmero** — evento `winner_found` durante o slow reveal. Desaparecia ao recarregar a página ou reconectar.

**Consequências:**
- ReplayRoom (`ReplaySummary.tsx`) não exibia histórico de prêmios — spinners eternos.
- GameRoom recarregada para jogo arquivado perdia todo o estado de premiação.
- Sem métricas de negócio: RTP real, volume de prêmios por currency, latência do pipeline.
- Sem trilha de auditoria para suporte/contabilidade.

---

## Decisão

### 1. Persistência em MongoDB (Worker)

Duas novas collections gerenciadas pelo worker:

**`prizetxs`** — transação de prêmio paga a um ticket.
Índice único composto: `{ gameId, ticketId, winType }` — garante que cada combinação (jogo, ticket, tipo de vitória) seja paga no máximo uma vez.

**`buyintxs`** — transação de compra de ticket.
Índice único composto: `{ gameId, ticketId }` — um ticket só é comprado uma vez.

### 2. WS Events — 3 Estados de Premiação

Cadeia de eventos WebSocket que o frontend consome para exibir status em tempo real:

```
winner_found ──────────► frontend: status = "preparing"
    ↓
prize_tx_sent ─────────► frontend: status = "confirming"
  { ticketId, winLabel? }
    ↓
  [savePrizeTx MongoDB]
    ↓
prize_confirmed ───────► frontend: status = "confirmed"
  { ticketId, transactionId, amount, currency, winLabel? }
```

- `winner_found`: existe antes deste ADR. Agora carrega `winType` e `winLabel` p/ chave composta no frontend.
- `prize_tx_sent`: disparado **antes** da persistência MongoDB (após tx on-chain bem-sucedida). `winLabel` opcional p/ compatibilidade.
- `prize_confirmed`: disparado **após** `savePrizeTx` no MongoDB resolver. Carrega `transactionId`, `amount`, `currency`, `winLabel`.

`winLabel` opcional nos eventos → clientes antigos ignoram. Clientes atuais usam chave composta `ticket_id:winLabel` p/ diferenciar estágios múltiplos da mesma cartela em MULTI_MATCH.

### 3. API REST — Leitura de Prêmios

```
GET /api/v1/games/:gameId/prizes
  → { items: PrizeTx[], total: number, gameId }
```

Endpoint público (sem auth) — apenas leitura de dados já públicos na blockchain. Usado por:
- `ReplaySummary`: busca no mount e popula EventFeed.
- `GameRoom` (`hydratePrizeStatuses`): popula `prizeStatuses` p/ jogos arquivados onde WS não re-emite eventos.

### 4. Frontend — Três Fontes de Dado

| Fonte | Quando | Prioridade |
|-------|--------|------------|
| WS `winner_found` | Jogo ao vivo | mais recente |
| WS `prize_tx_sent` / `prize_confirmed` | Jogo ao vivo | mais recente |
| API `GET /games/:gameId/prizes` | Jogo arquivado (staticFinalState) | sobrescrita por WS se active |

**Chave composta:** `prizeStatuses` usa chave `ticket_id:winLabel` (não apenas `ticket_id`). Necessário p/ MULTI_MATCH onde mesma cartela vence múltiplos estágios — cada estágio tem pipeline de pagamento independente.

**hydratePrizeStatuses:** função exposta por `useSlowReveal` que injeta dados da API no `prizeStatuses`. Só preenche entries que ainda estão `'preparing'` ou ausentes (não sobrescreve WS ativo). Efeito em `useGameRoomState` dispara quando `isStaticFinalState` = true.

### 5. Observabilidade (Prometheus + Grafana)

Novas métricas no worker (`prizeMetrics.ts`):

| Métrica | Tipo | Labels |
|---------|------|--------|
| `prize_payments_total` | Counter | `winType`, `currency` |
| `prize_payments_amount_total` | Counter | `currency` |
| `prize_pipeline_duration` | Histogram | `action: prepare/send/confirm` |
| `prize_persist_total` | Counter | `result: success/duplicate/error` |
| `buyin_persisted_total` | Counter | `currency` |
| `prize_rtp_ratio` | Gauge | `currency` |

---

## Trade-offs e Decisões

### Por que não buscar da blockchain?

A chain WAX não mantém histórico de ações por escopo de forma eficiente. `get_actions` é limitado e não indexa por `game_id`. MongoDB oferece consulta flexível e rápida.

### Por que índice único `{ gameId, ticketId, winType }`?

Impede duplicação de prêmio mesmo se o worker reiniciar e reprocessar o mesmo ticket. Sem ele, uma falha entre `executeClaimStage` e `savePrizeTx` poderia criar dois registros para o mesmo prêmio.

### Por que `winLabel` opcional nos WS events?

Backward compatibility com clientes que não usam chave composta. Clientes antigos ignoram o campo e continuam usando chave `ticket_id` (funciona p/ jogos standard onde cada ticket ganha no máximo uma vez).

### Por que não unificar winner_found com prize_tx_sent?

`winner_found` é detectado pelo evaluator (análise de cartelas). `prize_tx_sent` só ocorre após a transação on-chain ser submetida. Separar permite ao frontend mostrar "preparando pagamento" mesmo se a blockchain demorar.

---

## Exemplo de Fluxo Completo (MULTI_MATCH)

```
1. Stage 1 cutoff → winner_found(stage_1) → frontend preparing
2. executeClaimStage → txHash
3. prize_tx_sent(ticket#42, "stage_1") → frontend confirming
4. savePrizeTx → MongoDB
5. prize_confirmed(ticket#42, txHash, amount, "BINGO", "stage_1") → frontend confirmed
   prizeStatuses["42:stage_1"] = { status:'confirmed', tx_id, amount, currency }

6. Stage 2 cutoff → winner_found(stage_2) → frontend preparing
   prizeStatuses["42:stage_1"] = confirmed (inalterado)
   prizeStatuses["42:stage_2"] = preparing (novo)
```

---

## Implementação

### Arquivos criados/modificados

| Camada | Arquivo | Mudança |
|--------|---------|---------|
| Types | `packages/shared-types/src/index.ts` | Interfaces `PrizeTx`, `BuyInTx` |
| Worker | `apps/worker-game-loop/src/models/PrizeTx.ts` | Mongoose schema + unique index |
| Worker | `apps/worker-game-loop/src/models/BuyInTx.ts` | Mongoose schema + unique index |
| Worker | `apps/worker-game-loop/src/services/prizeTransactionsService.ts` | `savePrizeTx`, `saveBuyInTx` |
| Worker | `apps/worker-game-loop/src/services/prizeMetrics.ts` | Counters, histograms, gauges |
| Worker | `apps/worker-game-loop/src/services/evaluator.ts` | `payMultiMatchStage` + `processAllGameWinners` chamam prize pipeline |
| Worker | `apps/worker-game-loop/src/services/broadcaster.ts` | `notifyPrizeTxSent` + `notifyPrizeConfirmed` c/ winLabel |
| Worker | `apps/worker-game-loop/src/services/gameOrchestrator.ts` | Reorder: `winner_found` antes de `processAllGameWinners` |
| API | `apps/api-gateway/src/models/PrizeTx.ts` | Mongoose schema (leitura) |
| API | `apps/api-gateway/src/controllers/prizeController.ts` | Controller `listGamePrizes` |
| API | `apps/api-gateway/src/index.ts` | Rota `GET /games/:gameId/prizes` |
| Frontend | `apps/frontend/src/services/api.ts` | `fetchGamePrizeTransactions` |
| Frontend | `apps/frontend/src/hooks/useSlowReveal.ts` | `hydratePrizeStatuses` + chave composta |
| Frontend | `apps/frontend/src/components/gameroom/useGameRoomState.ts` | Efeito API p/ staticFinalState |
| Frontend | `apps/frontend/src/components/gameroom/EventFeed.tsx` | 3 estados + status inline |
| Frontend | `apps/frontend/src/components/gameroom/GameRoom.tsx` | `feedWinners` usa `localWinners` |
| Frontend | `apps/frontend/src/components/replayroom/ReplaySummary.tsx` | Busca API + EventFeed |
| Grafana | `infra/grafana/dashboards/worker-game-loop.json` | Painéis prize |
