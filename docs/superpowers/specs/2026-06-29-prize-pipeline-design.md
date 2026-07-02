# Prize Pipeline — EventFeed com status em tempo real + observabilidade

**Data:** 2026-06-29
**Status:** Design aprovado
**ADR:** Pendente (criar após implementação)

## 1. Problema

EventFeed na GameRoom mostra spinners eternos — `tx_id` nunca é populado porque o worker não persiste prêmios no MongoDB. ReplayRoom não tem EventFeed. Sem métricas de negócio (RTP real, volume de prêmios).

## 2. Arquitetura

```
Worker (evaluator.ts)
  │
  │  winner_found ──────────► Frontend: status="preparing"
  │  { ticketId, account, winLabel, winType }
  │
  │  claimwin/claimcombo/claimstage (on-chain tx)
  │
  │  prize_tx_sent ─────────► Frontend: status="confirming"
  │  { ticketId }
  │
  │  tx confirmada
  │  Persiste BuyInTx (todos tickets)
  │  Persiste PrizeTx (vencedores) no MongoDB (collection `prizetxs`)
  │  prize_confirmed ───────► Frontend: status="confirmed"
  │  { ticketId, transactionId, amount, currency }
  │
  ▼
API Gateway
  GET /api/v1/games/:gameId/prizes  ───► MongoDB `prizetxs`
  │                                     (ReplayRoom + fallback GameRoom)
  ▼
Frontend
  GameRoom: EventFeed escuta WS winner_found/prize_tx_sent/prize_confirmed
  ReplayRoom: busca API + renderiza EventFeed (idêntico)
```

## 3. Tipos Compartilhados

Em `packages/shared-types/src/index.ts`:

```typescript
export interface PrizeTx {
  gameId:    string
  account:   string
  ticketId:  string
  winType:   'pattern' | 'combo' | 'stage'
  patternMask?: string
  comboId?:    number
  stageNumber?: number
  winLabel:     string
  weight:       number
  amount:       string
  currency:     string
  transactionId?: string
  goldenMultiplier?: number
  ticketPrice: string  // permite RTP por ticket
  claimedAt:   string
}

export interface BuyInTx {
  gameId:      string
  account:     string
  ticketId:    string
  amount:      string
  currency:    string
  purchasedAt: string
}
```

## 4. Worker Changes

### Models (`apps/worker-game-loop/src/models/`)
- `PrizeTx.ts` — Mongoose schema (collection `prizetxs`), unique index `{ gameId, ticketId, winType }`
- `BuyInTx.ts` — Mongoose schema (collection `buyintxs`), unique index `{ gameId, ticketId }`

### Services (`apps/worker-game-loop/src/services/`)

**`prizeTransactionsService.ts`**:
- `savePrizeTx(input)` — upsert PrizeTx
- `saveBuyInTx(input)` — upsert BuyInTx

**`prizeMetrics.ts`** (prom-client):
- `prizePaymentsTotal` — Counter `{ winType, currency }`
- `prizePaymentsAmountTotal` — Counter `{ currency }`
- `prizePipelineDuration` — Histogram `{ action: 'prepare'|'send'|'confirm' }`
- `prizePersistTotal` — Counter `{ result: 'success'|'duplicate'|'error' }`
- `buyinPersistedTotal` — Counter `{ currency }`
- `prizeRtpRatio` — Gauge `{ currency }`

**`evaluator.ts`** — inserções:
- Loop `findAllWinners`: após processar cada ticket, `saveBuyInTx` + `buyinPersistedTotal.inc`
- Após `executeClaimWin/combo/stage` com `txHash`:
  1. `prizePipelineDuration.observe({ action: 'send' })`
  2. Emit WS `prize_tx_sent { ticketId }`
  3. `savePrizeTx({ ...txHash, ... })`
  4. Emit WS `prize_confirmed { ticketId, txHash, amount, currency }`
  5. `prizePaymentsTotal.inc`, `prizePaymentsAmountTotal.inc`
  6. `prizePipelineDuration.observe({ action: 'confirm' })`
  7. `prizePersistTotal.inc({ result: 'success' })`

**`broadcaster.ts`** — novos eventos + winType no winner_found:
- `winner_found` payload atual: adicionar `winType: 'pattern' | 'combo' | 'stage'`
- `emitToRoom(gameId, 'prize_tx_sent', { ticketId })`
- `emitToRoom(gameId, 'prize_confirmed', { ticketId, transactionId, amount, currency })`

### Grafana Dashboard

Adicionar ao `cryptobingo-worker` dashboard:
- Pagamentos/min por winType (barra empilhada)
- RTP acumulado por currency (gauge)
- Latência pipeline prize p50/p95 (heatmap)
- Persistência: sucessos vs erros (barra)

## 5. API Gateway Changes

### Models
- `PrizeTx.ts` — schema idêntico ao worker (read model)

### Controllers
**`prizeController.ts`**:
- `listGamePrizes(req, res)` — GET /api/v1/games/:gameId/prizes
  - Valida gameId → 400
  - Busca `PrizeTx.find({ gameId }).sort({ claimedAt: -1 }).lean()`
  - Retorna `{ items: PrizeTx[], total: number, gameId }` (vazio se sem prizes)
  - Erro → 500

### Métricas
- `api_prize_requests_total` — Counter `{ method, status_code }`

### Rotas
`app.get('/api/v1/games/:gameId/prizes', playerLimiter, listGamePrizes)`

## 6. Frontend Changes

### `api.ts`
- `fetchGamePrizeTransactions(gameId)` → `{ items, total }`

### `EventFeed.tsx` — evolução
- Estado: `Map<ticketId, FeedEntry>` onde:
  ```
  interface FeedEntry {
    account: string
    winLabel: string
    winType: 'pattern' | 'combo' | 'stage'
    status: 'preparing' | 'confirming' | 'confirmed'
    transactionId?: string
    amount?: string
    currency?: string
  }
  ```
- WS handlers:
  - `winner_found` → entry `status: 'preparing'`
  - `prize_tx_sent` → entry `status: 'confirming'`
  - `prize_confirmed` → entry `status: 'confirmed'` + txId/amount
- Display:
  - `preparing`: `cb-spinner` + i18n `"Processando pagamento..."`
  - `confirming`: `cb-spinner` + i18n `"Confirmando na blockchain..."`
  - `confirmed`: link explorer + amount
- Fallback: quando `isDrawing` transitiona `true→false` (game ended), busca API p/ completar entries `preparing`/`confirming` que não receberam WS a tempo
- Modo replay: recebe dados via prop (não WS), usa mesma renderização

### `GameRoom.tsx`
- Remove `feedWinners` derivation antiga
- Passa `gameId` p/ EventFeed

### `ReplaySummary.tsx`
- `useEffect` busca `fetchGamePrizeTransactions(gameId)`
- Passa `winners` p/ EventFeed (modo replay)

### CSS
- `.gr-event-feed` → `pointer-events: auto`
- Ajustes p/ status text inline com spinner

## 7. TDD & QA

Ordem estrita: test → code → pass.

### shared-types
- Test: `pnpm build` compila sem erros

### Worker models
- Test: instancia schema, valida required fields, unique index composite

### Worker prizeTransactionsService
- Test: `savePrizeTx` insere doc, upsert não duplica, campos corretos
- Test: `saveBuyInTx` insere doc, upsert não duplica

### Worker prizeMetrics
- Test: counters incrementam, labels corretos

### API prizeController
- Test (Estilo B, mocks):
  - lista vazia → 200 `{ items: [], total: 0 }`
  - 1 prize → 200 com item
  - múltiplos prizes → sorted by claimedAt desc
  - gameId inválido → 400
  - MongoDB erro → 500

### API route
- Test (Estilo A, supertest):
  - GET 200 com 2 prizes mockados
  - GET 200 com lista vazia (game válido sem prizes)

### Frontend api.ts
- Test: `fetchGamePrizeTransactions` faz fetch correto, retorna parsed

### EventFeed evolution
- Test: status `preparing` mostra mensagem + spinner
- Test: status `confirming` mostra mensagem + spinner
- Test: status `confirmed` mostra link explorer
- Test: transição preparing → confirming → confirmed
- Test: WS events atualizam estado interno

### ReplaySummary
- Test: busca API no mount, renderiza EventFeed com dados

### SonarQube (obrigatório antes de cada commit)
- Varredura em cada arquivo modificado após testes verdes
- 0 BLOCKER/CRITICAL/MAJOR — se aparecer, corrigir antes do próximo passo
- Só commitar após SonarQube limpo

## 8. Ordem de Implementação

| # | Passo | Testes |
|---|---|---|
| 1 | shared-types: `PrizeTx` + `BuyInTx` | build |
| 2 | Worker: PrizeTx + BuyInTx models | jest |
| 3 | Worker: prizeTransactionsService | jest |
| 4 | Worker: prizeMetrics | jest |
| 5 | Worker: integrar evaluator.ts | — |
| 6 | Worker: novos WS events broadcaster | — |
| 7 | API: PrizeTx model | — |
| 8 | API: prizeController | jest |
| 9 | API: rota index.ts | jest |
| 10 | Frontend: fetchGamePrizeTransactions | vitest |
| 11 | Frontend: EventFeed evolution | vitest |
| 12 | Frontend: GameRoom integration | — |
| 13 | Frontend: ReplaySummary integration | vitest |
| 14 | Grafana: painéis prize | — |
