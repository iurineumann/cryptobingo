# Prize Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement prize pipeline — worker persiste PrizeTx + BuyInTx no MongoDB, API expõe endpoint, frontend EventFeed exibe status em tempo real (preparing → confirming → confirmed).

**Architecture:** Worker evaluator persiste após on-chain tx + emite 3 WS events. API Gateway lê do MongoDB. EventFeed gerencia Map<ticketId, status> atualizado via WS + fallback API.

**Tech Stack:** Node 22, TS 6, Mongoose 9, Express 5, React 19, prom-client, MongoDB, PostgreSQL

## Global Constraints
- `prom-client` já instalado (worker 9091, api 9092)
- Mongoose schemas seguem padrão `Content.ts` (export model, timestamps, lean)
- WS events usam `emitToRoom(gameId, event, payload)` do broadcaster
- Testes frontend: vitest + jsdom + @testing-library/react
- Testes backend: jest + mocks mongoose (Estilo B)
- i18n: chaves em pt/en/zh (`game_room.prize_preparing`, `game_room.prize_confirming`)
- SonarQube antes de cada commit

---

## File Structure

```
packages/shared-types/src/index.ts              # MODIFY: add PrizeTx + BuyInTx
apps/worker-game-loop/src/models/PrizeTx.ts      # CREATE: Mongoose schema (collection prizetxs)
apps/worker-game-loop/src/models/BuyInTx.ts      # CREATE: Mongoose schema (collection buyintxs)
apps/worker-game-loop/src/services/prizeTransactionsService.ts  # CREATE: savePrizeTx, saveBuyInTx
apps/worker-game-loop/src/services/prizeMetrics.ts               # CREATE: prom-client metrics
apps/worker-game-loop/src/services/evaluator.ts   # MODIFY: persist + emit após claimwin/combo/stage
apps/worker-game-loop/src/services/broadcaster.ts # MODIFY: winType in WinnerPayload + new events
apps/api-gateway/src/models/PrizeTx.ts            # CREATE: read-only schema
apps/api-gateway/src/controllers/prizeController.ts       # CREATE: listGamePrizes
apps/api-gateway/src/controllers/__tests__/prizeController.test.ts  # CREATE: tests
apps/api-gateway/src/index.ts                     # MODIFY: add route
apps/frontend/src/services/api.ts                 # MODIFY: add fetchGamePrizeTransactions
apps/frontend/src/components/gameroom/EventFeed.tsx       # MODIFY: status states + WS
apps/frontend/src/components/gameroom/EventFeed.test.tsx  # MODIFY: status tests
apps/frontend/src/components/GameRoom.tsx          # MODIFY: pass gameId to EventFeed
apps/frontend/src/components/replayroom/ReplaySummary.tsx # MODIFY: fetch prizes + EventFeed
apps/frontend/src/components/replayroom/ReplaySummary.test.tsx # MODIFY: prize fetch test
apps/frontend/src/styles/globals.design.css        # MODIFY: pointer-events fix
infra/grafana/dashboards/cryptobingo-worker.json   # MODIFY: prize panels
```

---

### Task 1: shared-types — PrizeTx + BuyInTx

**Files:**
- Modify: `packages/shared-types/src/index.ts` (append after line 574)

**Interfaces:**
- Consumes: nothing
- Produces: `PrizeTx`, `BuyInTx` interfaces

- [ ] **Step 1: Add interfaces to shared-types**

Append before closing of file:
```typescript
export interface PrizeTx {
    gameId:    string;
    account:   string;
    ticketId:  string;
    winType:   'pattern' | 'combo' | 'stage';
    patternMask?: string;
    comboId?:    number;
    stageNumber?: number;
    winLabel:     string;
    weight:       number;
    amount:       string;
    currency:     string;
    transactionId?: string;
    goldenMultiplier?: number;
    ticketPrice: string;
    claimedAt:   string;
}

export interface BuyInTx {
    gameId:      string;
    account:     string;
    ticketId:    string;
    amount:      string;
    currency:    string;
    purchasedAt: string;
}
```

- [ ] **Step 2: Build shared-types**

Run: `pnpm --filter @cryptobingo/shared-types build`
Expected: `tsc` compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/index.ts
git commit -m "feat(types): PrizeTx + BuyInTx interfaces p/ prize pipeline"
```

---

### Task 2: Worker Models — PrizeTx + BuyInTx schemas

**Files:**
- Create: `apps/worker-game-loop/src/models/PrizeTx.ts`
- Create: `apps/worker-game-loop/src/models/BuyInTx.ts`

**Interfaces:**
- Consumes: `PrizeTx`, `BuyInTx` from shared-types
- Produces: Mongoose models `PrizeTx`, `BuyInTx`

- [ ] **Step 1: Create `PrizeTx.ts`**

```typescript
import mongoose, { Schema, Document } from 'mongoose';
import type { PrizeTx as IPrizeTx } from '@cryptobingo/shared-types';

export interface PrizeTxDocument extends Omit<IPrizeTx, 'claimedAt'>, Document {
    claimedAt: Date;
}

const PrizeTxSchema = new Schema<PrizeTxDocument>(
    {
        gameId:    { type: String, required: true, index: true },
        account:   { type: String, required: true, index: true },
        ticketId:  { type: String, required: true },
        winType:   { type: String, enum: ['pattern', 'combo', 'stage'], required: true },
        patternMask:  String,
        comboId:      Number,
        stageNumber:  Number,
        winLabel:     { type: String, required: true },
        weight:       { type: Number, required: true },
        amount:       { type: String, required: true },
        currency:     { type: String, required: true },
        transactionId: String,
        goldenMultiplier: { type: Number, default: 1 },
        ticketPrice:  { type: String, required: true },
        claimedAt:    { type: Date, required: true },
    },
    { timestamps: true },
);

PrizeTxSchema.index({ gameId: 1, ticketId: 1, winType: 1 }, { unique: true });

export const PrizeTx = mongoose.model<PrizeTxDocument>('PrizeTx', PrizeTxSchema);
export default PrizeTx;
```

- [ ] **Step 2: Create `BuyInTx.ts`**

```typescript
import mongoose, { Schema, Document } from 'mongoose';
import type { BuyInTx as IBuyInTx } from '@cryptobingo/shared-types';

export interface BuyInTxDocument extends Omit<IBuyInTx, 'purchasedAt'>, Document {
    purchasedAt: Date;
}

const BuyInTxSchema = new Schema<BuyInTxDocument>(
    {
        gameId:   { type: String, required: true, index: true },
        account:  { type: String, required: true, index: true },
        ticketId: { type: String, required: true },
        amount:   { type: String, required: true },
        currency: { type: String, required: true },
        purchasedAt: { type: Date, required: true },
    },
    { timestamps: true },
);

BuyInTxSchema.index({ gameId: 1, ticketId: 1 }, { unique: true });

export const BuyInTx = mongoose.model<BuyInTxDocument>('BuyInTx', BuyInTxSchema);
export default BuyInTx;
```

- [ ] **Step 3: Write test for PrizeTx schema**

Create `apps/worker-game-loop/src/models/__tests__/PrizeTx.test.ts`:
```typescript
import { PrizeTx, PrizeTxDocument } from '../PrizeTx';

describe('PrizeTx Schema', () => {
    it('has required fields', () => {
        const paths = PrizeTx.schema.paths;
        expect(paths.gameId).toBeDefined();
        expect(paths.account).toBeDefined();
        expect(paths.ticketId).toBeDefined();
        expect(paths.winType).toBeDefined();
        expect(paths.winLabel).toBeDefined();
        expect(paths.weight).toBeDefined();
        expect(paths.amount).toBeDefined();
        expect(paths.currency).toBeDefined();
        expect(paths.claimedAt).toBeDefined();
    });

    it('winType enum accepts pattern/combo/stage', () => {
        const enumValues = (PrizeTx.schema.paths.winType as any).options.enum;
        expect(enumValues).toEqual(['pattern', 'combo', 'stage']);
    });

    it('has unique compound index', () => {
        const index = PrizeTx.schema.indexes().find(i =>
            i[0]?.gameId === 1 && i[0]?.ticketId === 1 && i[0]?.winType === 1
        );
        expect(index).toBeDefined();
        expect(index?.[1]?.unique).toBe(true);
    });
});
```

- [ ] **Step 4: Write test for BuyInTx schema**

Create `apps/worker-game-loop/src/models/__tests__/BuyInTx.test.ts`:
```typescript
import { BuyInTx } from '../BuyInTx';

describe('BuyInTx Schema', () => {
    it('has required fields', () => {
        const paths = BuyInTx.schema.paths;
        expect(paths.gameId).toBeDefined();
        expect(paths.account).toBeDefined();
        expect(paths.ticketId).toBeDefined();
        expect(paths.amount).toBeDefined();
        expect(paths.currency).toBeDefined();
        expect(paths.purchasedAt).toBeDefined();
    });

    it('has unique compound index on gameId + ticketId', () => {
        const index = BuyInTx.schema.indexes().find(i =>
            i[0]?.gameId === 1 && i[0]?.ticketId === 1
        );
        expect(index).toBeDefined();
        expect(index?.[1]?.unique).toBe(true);
    });
});
```

- [ ] **Step 5: Run tests**

Run: `npx jest apps/worker-game-loop/src/models/__tests__/`
Expected: Both test files pass.

- [ ] **Step 6: Commit**

```bash
git add apps/worker-game-loop/src/models/
git commit -m "feat(worker): PrizeTx + BuyInTx Mongoose schemas"
```

---

### Task 3: Worker prizeTransactionsService

**Files:**
- Create: `apps/worker-game-loop/src/services/prizeTransactionsService.ts`
- Create: `apps/worker-game-loop/src/services/__tests__/prizeTransactionsService.test.ts`

**Interfaces:**
- Consumes: `PrizeTx`, `BuyInTx` models, `PrizeTx`, `BuyInTx` shared-types
- Produces: `savePrizeTx(input)`, `saveBuyInTx(input)`

- [ ] **Step 1: Write failing tests**

Create `apps/worker-game-loop/src/services/__tests__/prizeTransactionsService.test.ts`:
```typescript
import { savePrizeTx, saveBuyInTx } from '../prizeTransactionsService';

jest.mock('../../models/PrizeTx', () => ({
    PrizeTx: {
        findOneAndUpdate: jest.fn(),
    },
}));

jest.mock('../../models/BuyInTx', () => ({
    BuyInTx: {
        findOneAndUpdate: jest.fn(),
    },
}));

import { PrizeTx } from '../../models/PrizeTx';
import { BuyInTx } from '../../models/BuyInTx';

const mockPrizeUpsert = PrizeTx.findOneAndUpdate as jest.Mock;
const mockBuyInUpsert = BuyInTx.findOneAndUpdate as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('savePrizeTx', () => {
    const INPUT = {
        gameId: '1', account: 'alice.wam', ticketId: '42',
        winType: 'pattern' as const, winLabel: 'Linha 1', weight: 150,
        amount: '3.5000', currency: 'BINGO', ticketPrice: '2.0000',
        claimedAt: new Date().toISOString(),
    };

    it('upserts by gameId + ticketId + winType', async () => {
        mockPrizeUpsert.mockResolvedValue({ ...INPUT, _id: 'abc' });
        const result = await savePrizeTx(INPUT);
        expect(mockPrizeUpsert).toHaveBeenCalledWith(
            { gameId: '1', ticketId: '42', winType: 'pattern' },
            expect.objectContaining({ $setOnInsert: expect.anything() }),
            { upsert: true, new: true },
        );
        expect(result).toBeDefined();
    });

    it('throws on db error', async () => {
        mockPrizeUpsert.mockRejectedValue(new Error('Mongo down'));
        await expect(savePrizeTx(INPUT)).rejects.toThrow('Mongo down');
    });
});

describe('saveBuyInTx', () => {
    const INPUT = {
        gameId: '1', account: 'alice.wam', ticketId: '42',
        amount: '2.0000', currency: 'BINGO',
        purchasedAt: new Date().toISOString(),
    };

    it('upserts by gameId + ticketId', async () => {
        mockBuyInUpsert.mockResolvedValue({ ...INPUT, _id: 'abc' });
        await saveBuyInTx(INPUT);
        expect(mockBuyInUpsert).toHaveBeenCalledWith(
            { gameId: '1', ticketId: '42' },
            expect.objectContaining({ $setOnInsert: expect.anything() }),
            { upsert: true, new: true },
        );
    });
});
```

- [ ] **Step 2: Run tests to see them fail**

Run: `npx jest apps/worker-game-loop/src/services/__tests__/prizeTransactionsService.test.ts`
Expected: FAIL — `savePrizeTx` / `saveBuyInTx` not defined.

- [ ] **Step 3: Implement the service**

Create `apps/worker-game-loop/src/services/prizeTransactionsService.ts`:
```typescript
import { PrizeTx } from '../models/PrizeTx';
import { BuyInTx } from '../models/BuyInTx';

export async function savePrizeTx(input: Record<string, unknown>): Promise<unknown> {
    const filter = {
        gameId:   input.gameId as string,
        ticketId: input.ticketId as string,
        winType:  input.winType as string,
    };
    return PrizeTx.findOneAndUpdate(filter, { $setOnInsert: input }, { upsert: true, new: true }).lean();
}

export async function saveBuyInTx(input: Record<string, unknown>): Promise<unknown> {
    const filter = {
        gameId:   input.gameId as string,
        ticketId: input.ticketId as string,
    };
    return BuyInTx.findOneAndUpdate(filter, { $setOnInsert: input }, { upsert: true, new: true }).lean();
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx jest apps/worker-game-loop/src/services/__tests__/prizeTransactionsService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker-game-loop/src/services/prizeTransactionsService.ts
git add apps/worker-game-loop/src/services/__tests__/prizeTransactionsService.test.ts
git commit -m "feat(worker): prizeTransactionsService — savePrizeTx + saveBuyInTx"
```

---

### Task 4: Worker prizeMetrics

**Files:**
- Create: `apps/worker-game-loop/src/services/prizeMetrics.ts`

- [ ] **Step 1: Create the metrics file**

```typescript
import { Counter, Histogram, Gauge } from 'prom-client';
import { registry } from './metrics';

export const prizePaymentsTotal = new Counter({
    name: 'worker_prize_payments_total',
    help: 'Total de prêmios pagos por tipo e moeda',
    labelNames: ['winType', 'currency'] as const,
    registers: [registry],
});

export const prizePaymentsAmountTotal = new Counter({
    name: 'worker_prize_payment_amount_total',
    help: 'Soma total dos valores pagos por moeda',
    labelNames: ['currency'] as const,
    registers: [registry],
});

export const prizePipelineDuration = new Histogram({
    name: 'worker_prize_pipeline_duration_ms',
    help: 'Duração entre etapas do pipeline de prêmio',
    labelNames: ['action'] as const,
    buckets: [100, 500, 1000, 2500, 5000, 10000, 30000, 60000],
    registers: [registry],
});

export const prizePersistTotal = new Counter({
    name: 'worker_prize_persist_total',
    help: 'Resultado da persistência de prêmio no MongoDB',
    labelNames: ['result'] as const,
    registers: [registry],
});

export const buyinPersistedTotal = new Counter({
    name: 'worker_buyin_persisted_total',
    help: 'Total de buy-ins persistidos por moeda',
    labelNames: ['currency'] as const,
    registers: [registry],
});

export const prizeRtpRatio = new Gauge({
    name: 'worker_prize_rtp_ratio',
    help: 'RTP da partida atual (prizes / buyins)',
    labelNames: ['currency'] as const,
    registers: [registry],
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/worker-game-loop/src/services/prizeMetrics.ts
git commit -m "feat(worker): prizeMetrics — counters, histograms, gauge p/ prize pipeline"
```

---

### Task 5: Worker evaluator integration + broadcaster events

**Files:**
- Modify: `apps/worker-game-loop/src/services/evaluator.ts`
- Modify: `apps/worker-game-loop/src/services/broadcaster.ts`

- [ ] **Step 1: Add `winType` to `WinnerPayload` in broadcaster.ts**

```typescript
export interface WinnerPayload {
    account:     string;
    ticket_id:   string;
    win_pattern: string;
    winType:     'pattern' | 'combo' | 'stage';
    payouts:     string[];
}
```

- [ ] **Step 2: Add new event emitters in broadcaster.ts**

```typescript
export function notifyPrizeTxSent(gameId: string, ticketId: string): void {
    io.to(`game:${gameId}`).emit('prize_tx_sent', {
        event: 'prize_tx_sent',
        game_id: parseInt(gameId, 10),
        payload: { ticketId },
    });
}

export function notifyPrizeConfirmed(
    gameId: string, ticketId: string, transactionId: string, amount: string, currency: string,
): void {
    io.to(`game:${gameId}`).emit('prize_confirmed', {
        event: 'prize_confirmed',
        game_id: parseInt(gameId, 10),
        payload: { ticketId, transactionId, amount, currency },
    });
}
```

- [ ] **Step 3: Integrate evaluator.ts**

In evaluator, after each `executeClaimWin`/`executeClaimCombo`/`executeClaimStage` returns txHash:
1. Import `savePrizeTx`, `saveBuyInTx` from prizeTransactionsService
2. Import `notifyPrizeTxSent`, `notifyPrizeConfirmed` from broadcaster
3. Import prize metrics from prizeMetrics
4. After tx submitted: call `notifyPrizeTxSent(gameId, ticketId)`
5. After tx confirmed + save: call `notifyPrizeConfirmed(gameId, ticketId, txHash, amount, currency)`
6. Before closeGame: iterate all tickets, call `saveBuyInTx` for each
7. Increment metrics at each step

_(Note: evaluator.ts is ~700 lines — exact insertion points require reading the file. Apply inline during execution.)_

- [ ] **Step 4: Commit**

```bash
git add apps/worker-game-loop/src/services/broadcaster.ts
git add apps/worker-game-loop/src/services/evaluator.ts
git commit -m "feat(worker): prize pipeline integration — evaluator + broadcaster WS events"
```

---

### Task 6: API PrizeTx model + controller + route

**Files:**
- Create: `apps/api-gateway/src/models/PrizeTx.ts`
- Create: `apps/api-gateway/src/controllers/prizeController.ts`
- Create: `apps/api-gateway/src/controllers/__tests__/prizeController.test.ts`
- Modify: `apps/api-gateway/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api-gateway/src/controllers/__tests__/prizeController.test.ts`:
```typescript
import { Request, Response } from 'express';

jest.mock('../../models/PrizeTx', () => ({
    PrizeTx: { find: jest.fn() },
}));

import { PrizeTx } from '../../models/PrizeTx';
import { listGamePrizes } from '../prizeController';

const mockFind = PrizeTx.find as jest.Mock;

function makeRes() {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res as Response;
}

function makeReq(gameId: string, opts: Record<string, string> = {}): Request {
    return { params: { gameId }, query: opts } as unknown as Request;
}

function makePrize(overrides = {}) {
    return {
        gameId: '1', account: 'alice.wam', ticketId: '42',
        winType: 'pattern', winLabel: 'Linha 1', weight: 150,
        amount: '3.5000', currency: 'BINGO', transactionId: 'tx123',
        goldenMultiplier: 1, ticketPrice: '2.0000',
        claimedAt: new Date('2026-06-29').toISOString(),
        ...overrides,
    };
}

beforeEach(() => jest.clearAllMocks());

describe('listGamePrizes', () => {
    it('retorna 200 com lista vazia se nenhum prize', async () => {
        mockFind.mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });
        const res = makeRes();
        await listGamePrizes(makeReq('1'), res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ items: [], total: 0, gameId: '1' });
    });

    it('retorna 200 com prizes ordenados por claimedAt desc', async () => {
        const prize1 = makePrize({ ticketId: '1', claimedAt: '2026-06-29T10:00:00Z' });
        const prize2 = makePrize({ ticketId: '2', claimedAt: '2026-06-29T11:00:00Z' });
        const mockSort = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([prize2, prize1]) });
        mockFind.mockReturnValue({ sort: mockSort });
        const res = makeRes();
        await listGamePrizes(makeReq('1'), res);
        expect(mockSort).toHaveBeenCalledWith({ claimedAt: -1 });
        expect(res.json).toHaveBeenCalledWith({ items: [prize2, prize1], total: 2, gameId: '1' });
    });

    it('retorna 400 se gameId inválido', async () => {
        const res = makeRes();
        await listGamePrizes(makeReq(''), res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('retorna 500 se MongoDB falhar', async () => {
        mockFind.mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockRejectedValue(new Error('Mongo down')) }) });
        const res = makeRes();
        await listGamePrizes(makeReq('1'), res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});
```

- [ ] **Step 2: Run tests to see them fail**

Run: `npx jest apps/api-gateway/src/controllers/__tests__/prizeController.test.ts`
Expected: FAIL — `listGamePrizes` not defined.

- [ ] **Step 3: Create PrizeTx model**

Create `apps/api-gateway/src/models/PrizeTx.ts` (identical schema to worker):
```typescript
import mongoose, { Schema, Document } from 'mongoose';
import type { PrizeTx as IPrizeTx } from '@cryptobingo/shared-types';

export interface PrizeTxDocument extends Omit<IPrizeTx, 'claimedAt'>, Document {
    claimedAt: Date;
}

const PrizeTxSchema = new Schema<PrizeTxDocument>(
    {
        gameId:    { type: String, required: true, index: true },
        account:   { type: String, required: true, index: true },
        ticketId:  { type: String, required: true },
        winType:   { type: String, enum: ['pattern', 'combo', 'stage'], required: true },
        patternMask:  String,
        comboId:      Number,
        stageNumber:  Number,
        winLabel:     { type: String, required: true },
        weight:       { type: Number, required: true },
        amount:       { type: String, required: true },
        currency:     { type: String, required: true },
        transactionId: String,
        goldenMultiplier: { type: Number, default: 1 },
        ticketPrice:  { type: String, required: true },
        claimedAt:    { type: Date, required: true },
    },
    { timestamps: true },
);

PrizeTxSchema.index({ gameId: 1, ticketId: 1, winType: 1 }, { unique: true });

export const PrizeTx = mongoose.model<PrizeTxDocument>('PrizeTx', PrizeTxSchema);
export default PrizeTx;
```

- [ ] **Step 4: Create prizeController.ts**

```typescript
import { Request, Response } from 'express';
import { PrizeTx } from '../models/PrizeTx';

export async function listGamePrizes(req: Request, res: Response): Promise<void> {
    const { gameId } = req.params as Record<string, string>;

    if (!gameId || gameId.trim().length === 0) {
        res.status(400).json({ error: 'gameId é obrigatório.' });
        return;
    }

    try {
        const items = await PrizeTx
            .find({ gameId })
            .sort({ claimedAt: -1 })
            .lean();

        res.status(200).json({ items, total: items.length, gameId });
    } catch (err) {
        console.error('[Prize] Erro ao listar prêmios:', err);
        res.status(500).json({ error: 'Erro ao listar prêmios.' });
    }
}
```

- [ ] **Step 5: Route in index.ts**

In `apps/api-gateway/src/index.ts`, inside `registerRoutes()`:
```typescript
import { listGamePrizes } from './controllers/prizeController';

// ── Prize Pipeline (ADR pendente) ──────────────────────────────────
app.get('/api/v1/games/:gameId/prizes', playerLimiter, listGamePrizes);
```

- [ ] **Step 6: Run tests**

Run: `npx jest apps/api-gateway/src/controllers/__tests__/prizeController.test.ts`
Expected: PASS.

- [ ] **Step 7: SonarQube + Commit**

```bash
# SonarQube analyze prizeController.ts and PrizeTx.ts
git add apps/api-gateway/src/models/PrizeTx.ts
git add apps/api-gateway/src/controllers/prizeController.ts
git add apps/api-gateway/src/controllers/__tests__/prizeController.test.ts
git add apps/api-gateway/src/index.ts
git commit -m "feat(api): GET /api/v1/games/:gameId/prizes endpoint"
```

---

### Task 7: Frontend api.ts — fetchGamePrizeTransactions

**Files:**
- Modify: `apps/frontend/src/services/api.ts`

- [ ] **Step 1: Write failing test**

Find or create the test file. If `apps/frontend/src/services/__tests__/api.test.ts` exists, append. Otherwise create:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocking
import { fetchGamePrizeTransactions } from '../api';

beforeEach(() => vi.clearAllMocks());

describe('fetchGamePrizeTransactions', () => {
    it('fetches prizes for a gameId', async () => {
        const data = { items: [{ ticketId: '42' }], total: 1, gameId: '1' };
        mockFetch.mockResolvedValue({ ok: true, json: async () => data });
        const result = await fetchGamePrizeTransactions('1');
        expect(result).toEqual(data);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/games/1/prizes'),
            expect.anything(),
        );
    });

    it('throws on non-ok response', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 500 });
        await expect(fetchGamePrizeTransactions('1')).rejects.toThrow();
    });
});
```

- [ ] **Step 2: Implement fetchGamePrizeTransactions in api.ts**

```typescript
export async function fetchGamePrizeTransactions(gameId: string): Promise<{
    items: import('@cryptobingo/shared-types').PrizeTx[];
    total: number;
}> {
    const res = await fetch(`${API_BASE}/games/${encodeURIComponent(gameId)}/prizes`, {
        headers: publicHeaders(),
    });
    return handleResponse(res);
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @cryptobingo/frontend test -- --testPathPattern api.test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/services/api.ts
git add apps/frontend/src/services/__tests__/api.test.ts
git commit -m "feat(frontend): fetchGamePrizeTransactions"
```

---

### Task 8: Frontend EventFeed evolution — status states + WS

**Files:**
- Modify: `apps/frontend/src/components/gameroom/EventFeed.tsx`
- Modify: `apps/frontend/src/components/gameroom/EventFeed.test.tsx`

- [ ] **Step 1: Write failing tests for status states**

In EventFeed.test.tsx, add test group:
```typescript
describe('EventFeed — status states', () => {
    it('status preparing mostra spinner + mensagem', () => {
        render(<EventFeed
            loading={false}
            winners={[{ account: 'alice', pattern_name: 'Linha 1', status: 'preparing' }]}
            error={null}
        />);
        expect(screen.getByTestId('gr-event-feed-item-0')).toBeDefined();
        expect(screen.getByText('Processando pagamento...')).toBeDefined();
    });

    it('status confirming mostra spinner + mensagem', () => {
        render(<EventFeed
            loading={false}
            winners={[{ account: 'alice', pattern_name: 'Linha 1', status: 'confirming' }]}
            error={null}
        />);
        expect(screen.getByText('Confirmando na blockchain...')).toBeDefined();
    });

    it('status confirmed mostra link explorer + amount', () => {
        render(<EventFeed
            loading={false}
            winners={[{
                account: 'alice', pattern_name: 'Linha 1',
                status: 'confirmed', tx_id: 'tx123', amount: '3.5000',
            }]}
            error={null}
        />);
        const link = screen.getByTestId('gr-event-feed-tx-0');
        expect(link).toBeDefined();
        expect(link.getAttribute('href')).toContain('tx123');
        expect(screen.getByText('3.5000')).toBeDefined();
    });

    it('status sem tx_id (preparing/confirming) não renderiza link', () => {
        render(<EventFeed
            loading={false}
            winners={[{ account: 'alice', pattern_name: 'Linha 1', status: 'preparing' }]}
            error={null}
        />);
        expect(screen.queryByTestId('gr-event-feed-tx-0')).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cryptobingo/frontend test -- --testPathPattern EventFeed.test`
Expected: The new tests fail because EventFeedWinner doesn't have `status` field yet.

- [ ] **Step 3: Add test locales**

Add to i18n locale files (pt, en, zh):
```json
{
    "game_room": {
        "prize_preparing": "Processando pagamento...",
        "prize_confirming": "Confirmando na blockchain..."
    }
}
```

- [ ] **Step 4: Update EventFeedWinner interface and component**

```typescript
export interface EventFeedWinner {
    account:      string;
    pattern_name: string;
    status:       'preparing' | 'confirming' | 'confirmed';
    tx_id?:       string;
    amount?:      string;
}
```

Update render logic:
```typescript
{winners.map((w, idx) => (
    <div key={idx} data-testid={`gr-event-feed-item-${idx}`} className="ev">
        <span>{w.account}</span>
        <span>{w.pattern_name}</span>
        {w.status === 'preparing' && (
            <><span className="cb-spinner" /> {t('game_room.prize_preparing')}</>
        )}
        {w.status === 'confirming' && (
            <><span className="cb-spinner" /> {t('game_room.prize_confirming')}</>
        )}
        {w.status === 'confirmed' && w.tx_id && (
            <a
                href={`${explorerUrl}/transaction/${w.tx_id}`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`gr-event-feed-tx-${idx}`}
            >
                {w.amount} 🔗
            </a>
        )}
    </div>
))}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm --filter @cryptobingo/frontend test -- --testPathPattern EventFeed.test`
Expected: All tests PASS (existing + new).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/gameroom/EventFeed.tsx
git add apps/frontend/src/components/gameroom/EventFeed.test.tsx
git add apps/frontend/src/locales/pt/
git add apps/frontend/src/locales/en/
git add apps/frontend/src/locales/zh/
git commit -m "feat(frontend): EventFeed status states preparing/confirming/confirmed"
```

---

### Task 9: Frontend GameRoom + ReplaySummary integration

**Files:**
- Modify: `apps/frontend/src/components/GameRoom.tsx`
- Modify: `apps/frontend/src/components/replayroom/ReplaySummary.tsx`
- Modify: `apps/frontend/src/components/replayroom/ReplaySummary.test.tsx`

- [ ] **Step 1: Update GameRoom.tsx — pass gameId to EventFeed**

Remove old `feedWinners` derivation. Pass `gameId` as prop.

```typescript
<EventFeed
    loading={isDrawing && winners.length === 0}
    winners={feedWinners}
    error={null}
    gameId={gameId}
/>
```

- [ ] **Step 2: Update ReplaySummary.tsx — fetch prizes + render EventFeed**

Add useEffect:
```typescript
const [prizeWinners, setPrizeWinners] = useState<EventFeedWinner[]>([]);
const [prizesLoading, setPrizesLoading] = useState(true);

useEffect(() => {
    if (!gameId) return;
    fetchGamePrizeTransactions(gameId)
        .then(data => {
            setPrizeWinners(data.items.map(p => ({
                account: p.account,
                pattern_name: p.winLabel,
                status: 'confirmed' as const,
                tx_id: p.transactionId,
                amount: p.amount,
            })));
        })
        .catch(() => { /* silent */ })
        .finally(() => setPrizesLoading(false));
}, [gameId]);
```

Render:
```tsx
<EventFeed
    loading={prizesLoading}
    winners={prizeWinners}
    error={null}
/>
```

- [ ] **Step 3: Update ReplaySummary test**

```typescript
import { fetchGamePrizeTransactions } from '../../services/api';
vi.mock('../../services/api', () => ({
    fetchGamePrizeTransactions: vi.fn(),
}));

it('[REG] busca prizes via API quando gameId está disponível', async () => {
    const mockData = { items: [{ account: 'alice', winLabel: 'Linha 1', transactionId: 'tx1', amount: '3.5000' }], total: 1 };
    (fetchGamePrizeTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);
    render(<ReplaySummary gameId="1" {...otherProps} />);
    await waitFor(() => expect(fetchGamePrizeTransactions).toHaveBeenCalledWith('1'));
});
```

- [ ] **Step 4: Run frontend tests**

Run: `pnpm --filter @cryptobingo/frontend test`
Expected: All 248+ tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/GameRoom.tsx
git add apps/frontend/src/components/replayroom/
git commit -m "feat(frontend): GameRoom + ReplaySummary — EventFeed integration with WS/API"
```

---

### Task 10: CSS + Grafana panels

**Files:**
- Modify: `apps/frontend/src/styles/globals.design.css`
- Modify: `infra/grafana/dashboards/cryptobingo-worker.json`

- [ ] **Step 1: Fix pointer-events in CSS**

```css
.gr-event-feed {
    pointer-events: auto;
}
.gr-event-feed a {
    pointer-events: auto;
    color: var(--cb-accent);
    text-decoration: underline;
}
```

- [ ] **Step 2: Grafana dashboard panels**

Add to `cryptobingo-worker` dashboard JSON (within `"panels"` array):
- Panel: "Pagamentos/min" — `rate(worker_prize_payments_total[5m])` by winType
- Panel: "RTP acumulado" — `worker_prize_rtp_ratio` gauge
- Panel: "Latência pipeline" — `worker_prize_pipeline_duration_ms` heatmap p50/p95

- [ ] **Step 3: SonarQube + Commit**

```bash
# SonarQube analyze all modified files
git add apps/frontend/src/styles/globals.design.css
git commit -m "fix(css): pointer-events no EventFeed + Grafana prize panels"
```

---

### Task 11: Final verification

- [ ] **Step 1: Full test suite**

```bash
pnpm --filter @cryptobingo/api-gateway test
pnpm --filter @cryptobingo/frontend test
pnpm --filter @cryptobingo/worker-game-loop test
```

All suites must PASS.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --project apps/api-gateway/tsconfig.build.json --noEmit
npx tsc --project apps/frontend/tsconfig.build.json --noEmit 2>/dev/null || npx tsc --noEmit
```

- [ ] **Step 3: Full SonarQube varredura**

```bash
# Analyze each modified file
```

0 BLOCKER/CRITICAL/MAJOR.

- [ ] **Step 4: Push + PR**

```bash
git push origin feature/prize-pipeline
gh pr create --base develop --head feature/prize-pipeline --title "feat(prize): prize pipeline — EventFeed status, persistência, API, métricas" --body "Closes #N"
```
