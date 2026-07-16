// Testes unitários do consumer RabbitMQ — handlers, DLQ e payloads inválidos.
// Estratégia: mockar amqplib + dependências e testar a função consumeMessages
// indiretamente via exposição das funções de processamento.

process.env.RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';
process.env.CONTRACT_ACCOUNT = 'bingogamectr';
process.env.RPC_URL = 'http://localhost:8888';
process.env.CHAIN_ID = '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';
process.env.MICROSERVICE_PRIVATE_KEY = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3';

const mockChannel = {
    assertQueue:    jest.fn().mockResolvedValue({}),
    assertExchange: jest.fn().mockResolvedValue({}),
    bindQueue:      jest.fn().mockResolvedValue({}),
    consume:        jest.fn(),
    ack:            jest.fn(),
    nack:           jest.fn(),
    prefetch:       jest.fn().mockResolvedValue({}),
    checkQueue:     jest.fn().mockResolvedValue({ messageCount: 0, consumerCount: 0 }),
};

jest.mock('amqplib', () => ({
    connect: jest.fn().mockResolvedValue({
        createChannel: jest.fn().mockResolvedValue(mockChannel),
        on: jest.fn(),
    }),
}));
jest.mock('./gameOrchestrator', () => ({
    orchestrateGame: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./blockchain', () => ({
    executeFundGame:    jest.fn().mockResolvedValue('tx-fund'),
    executeLockGame:    jest.fn().mockResolvedValue('tx-lock'),
    executeStartDraw:   jest.fn().mockResolvedValue('tx-draw'),
    executeAbortGame:   jest.fn().mockResolvedValue('tx-abort'),
    microserviceSession: {},
    adminSession:        {},
}));
jest.mock('./broadcaster', () => ({
    notifyGameLocked:  jest.fn(),
    notifyGameAborted: jest.fn(),
    startSlowReveal:   jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./invertedIndex', () => ({
    buildInvertedIndex: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./roomManager', () => ({
    onGameResolved:                jest.fn().mockResolvedValue(undefined),
    ensureFirstGameForActiveRooms: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./redis', () => ({
    redisClient:  { get: jest.fn(), set: jest.fn() },
    connectRedis: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cryptobingo/blockchain-core', () => ({
    fetchGame: jest.fn(),
    rpcClient: { v1: { chain: { get_table_rows: jest.fn() } } },
}));
jest.mock('./metrics', () => ({
    eventsProcessedTotal:     { inc: jest.fn() },
    eventsFailedTotal:        { inc: jest.fn() },
    eventsDeadLetteredTotal:  { inc: jest.fn() },
    eventProcessingDuration:  { startTimer: jest.fn().mockReturnValue(jest.fn()) },
    autoAdvanceRunsTotal:     { inc: jest.fn() },
    autoAdvanceErrorsTotal:   { inc: jest.fn() },
    autoAdvanceGamesTotal:    { inc: jest.fn() },
    oraclePollAttempts:       { observe: jest.fn() },
    workerQueuePublishedTotal:{ inc: jest.fn() },
    setQueueDepth:            jest.fn(),
}));
jest.mock('./prizeMetrics', () => ({
    prizePaymentsTotal:      { inc: jest.fn() },
    prizePaymentsAmountTotal:{ inc: jest.fn() },
    prizePipelineDuration:   { startTimer: jest.fn().mockReturnValue(jest.fn()) },
    prizePersistTotal:       { inc: jest.fn() },
    buyinPersistedTotal:     { inc: jest.fn() },
    prizeRtpRatio:           { set: jest.fn() },
    prizePaymentsTxTotal:    { inc: jest.fn() },
    payoutChunksTotal:       { inc: jest.fn() },
    payoutRetriesTotal:      { inc: jest.fn() },
    payoutRecoveredTotal:    { inc: jest.fn() },
}));
// Fase 1 (#368): lock Redis e publish na fila são novos. O teste original assumia
// "executa sempre" — fingimos lock adquirido e publish no-op para isolar o handler.
jest.mock('./gameLock', () => ({
    acquireOrchestrationLock: jest.fn().mockResolvedValue(true),
    releaseOrchestrationLock: jest.fn().mockResolvedValue(undefined),
    isLocked:                 jest.fn().mockResolvedValue(false),
}));
jest.mock('./rabbitPublisher', () => ({
    publishGameEvent:  jest.fn().mockResolvedValue(undefined),
    getPublishChannel: jest.fn(),
}));

import { orchestrateGame }  from './gameOrchestrator';
import { executeFundGame, executeLockGame, executeStartDraw, executeAbortGame } from './blockchain';
import { connectRabbitMQ, autoStartDraw, autoClaimDrawnGames, autoStartLockedGames, updateQueueDepthMetrics, processLockedGame } from './rabbitmq';
import { publishGameEvent } from './rabbitPublisher';
import { setQueueDepth } from './metrics';
import { isResourceExhausted, resBackoffMs, resRetryMap, RES_RETRY_MAX } from './retryBackoff';
import { fetchGame, rpcClient } from '@cryptobingo/blockchain-core';
import type { BlockchainGameState } from '@cryptobingo/shared-types';

const mockOrchestrate        = orchestrateGame    as jest.Mock;
const mockFundGame           = executeFundGame    as jest.Mock;
const mockLockGame           = executeLockGame    as jest.Mock;
const mockStartDraw          = executeStartDraw   as jest.Mock;
const mockAbortGame          = executeAbortGame   as jest.Mock;
const mockPublishGameEvent   = publishGameEvent   as jest.Mock;

const mockGetTableRows = rpcClient.v1.chain.get_table_rows as jest.Mock;
const mockFetchGame    = fetchGame as jest.Mock;

function makeBlockchainGame(overrides: Partial<BlockchainGameState>): BlockchainGameState {
    return {
        game_id: '0',
        status: 'aborted',
        ticket_price: { quantity: '5.0000 WAX', contract: 'eosio.token' },
        total_wagered: { quantity: '0.0000 WAX', contract: 'eosio.token' },
        sponsor_pool: [],
        drawn_balls: [],
        campaign_id: '0',
        gametype_id: '0',
        end_time: 0,
        room_id: '0',
        golden_ball_num: 0,
        golden_multiplier: 0,
        total_paid: 0,
        ...overrides,
    } as BlockchainGameState;
}

// Helpers para simular mensagens RabbitMQ
function makeMsg(payload: object, xDeathCount = 0) {
    return {
        content: Buffer.from(JSON.stringify(payload)),
        properties: {
            headers: xDeathCount > 0
                ? { 'x-death': [{ count: xDeathCount }] }
                : {},
        },
        fields: {},
    };
}

// Captura o handler registrado em channel.consume pelo índice da chamada
function captureHandler(index = 0): (msg: any) => Promise<void> {
    const call = mockChannel.consume.mock.calls[index];
    return call?.[1];
}

// ── connectRabbitMQ e consumeMessages ────────────────────────────────────────

describe('connectRabbitMQ + consumeMessages handlers', () => {
    let processMsg: (msg: any) => Promise<void>;

    beforeAll(async () => {
        jest.clearAllMocks();
        await connectRabbitMQ();
        processMsg = captureHandler(0);  // game_loop_events
    });

    beforeEach(() => jest.clearAllMocks());

    it('Payload JSON malformado → nack sem requeue (DLQ)', async () => {
        const badMsg = { content: Buffer.from('not-json'), properties: { headers: {} }, fields: {} };
        await processMsg(badMsg);
        expect(mockChannel.nack).toHaveBeenCalledWith(badMsg, false, false);
        expect(mockChannel.ack).not.toHaveBeenCalled();
    });

    it('Payload sem campos obrigatórios (sem action/gameId) → nack sem requeue', async () => {
        const msg = makeMsg({ foo: 'bar' });
        await processMsg(msg);
        expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
    });

    it('[DLQ] Mensagem com x-death.count >= MAX_RETRIES → nack sem requeue', async () => {
        const msg = makeMsg({ action: 'claimwin', gameId: '1' }, 5); // 5 >= MAX_RETRIES (3)
        await processMsg(msg);
        expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
        expect(mockOrchestrate).not.toHaveBeenCalled();
    });

    it('action=claimwin → orchestrateGame chamado com gameId', async () => {
        const msg = makeMsg({ action: 'claimwin', gameId: '42' });
        await processMsg(msg);
        expect(mockOrchestrate).toHaveBeenCalledWith('42');
        expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it('action=fundgame → executeFundGame chamado', async () => {
        const msg = makeMsg({ action: 'fundgame', gameId: '1' });
        await processMsg(msg);
        expect(mockFundGame).toHaveBeenCalledWith('1');
    });

    it('action=lockgame → executeLockGame chamado', async () => {
        mockFetchGame.mockResolvedValue(makeBlockchainGame({ game_id: '1', status: 'funding', total_tickets: 3 }));
        const msg = makeMsg({ action: 'lockgame', gameId: '1' });
        await processMsg(msg);
        expect(mockLockGame).toHaveBeenCalledWith('1');
    });

    it('action=abortgame → executeAbortGame chamado com reason', async () => {
        const msg = makeMsg({ action: 'abortgame', gameId: '1', reason: 'ADMIN_HALT' });
        await processMsg(msg);
        expect(mockAbortGame).toHaveBeenCalledWith('1', expect.any(String));
    });

    // startdraw usa waitForDrawnBalls que faz polling por até 150s — testado em harness E2E
    it.todo('action=startdraw → executeStartDraw + waitForDrawnBalls + orchestrateGame (ver fsm.test.ts E2E)');

    it('action=claimwin: orchestrateGame lança → erro swallowed via .catch(), ack chamado', async () => {
        // claimwin usa orchestrateGame(gameId).catch(...) — não propaga para o try/catch externo.
        // O ACK é enviado normalmente e o erro é apenas logado.
        // Isso é intencional: o reveal pode demorar minutos; ACK libera o consumer imediatamente.
        mockOrchestrate.mockRejectedValueOnce(new Error('Orquestração falhou'));

        const msg = makeMsg({ action: 'claimwin', gameId: '1' });
        await processMsg(msg);

        // O ACK é chamado (claimwin usa fire-and-forget para o orchestrator)
        expect(mockChannel.ack).toHaveBeenCalledWith(msg);
        expect(mockChannel.nack).not.toHaveBeenCalled();
    });
});

// ── consumeDeadLetters ─────────────────────────────────────────────────────

describe('consumeDeadLetters (DLQ)', () => {
    let processDlq: (msg: any) => Promise<void>;

    beforeAll(async () => {
        jest.clearAllMocks();
        await connectRabbitMQ();
        processDlq = captureHandler(2);  // game_loop_dead
    });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('DLQ msg com x-death < DLQ_MAX_RETRIES → ACK + setTimeout com backoff', async () => {
        const msg = makeMsg({ action: 'fundgame', gameId: '1' }, 1); // x-death=1
        await processDlq(msg);
        expect(mockChannel.ack).toHaveBeenCalledWith(msg);
        // 30s * 2^1 = 60000
        jest.advanceTimersByTime(60000);
        await Promise.resolve(); // flush microtasks (setTimeout callback)
    });

    it('DLQ msg com x-death >= DLQ_MAX_RETRIES → ACK, sem publish (permanente)', async () => {
        const msg = makeMsg({ action: 'fundgame', gameId: '1' }, 5); // x-death=5 >= 3
        await processDlq(msg);
        expect(mockChannel.ack).toHaveBeenCalledWith(msg);
        // Não deve ter publishado (permanente)
        jest.advanceTimersByTime(120000);
        await Promise.resolve();
        expect(mockPublishGameEvent).not.toHaveBeenCalled();
    });

    it('DLQ msg com x-death=0 → ACK + publish após backoff base (30s)', async () => {
        const msg = makeMsg({ action: 'lockgame', gameId: '2' }, 0);
        await processDlq(msg);
        expect(mockChannel.ack).toHaveBeenCalledWith(msg);
        // Avança 30s para acionar o setTimeout
        jest.advanceTimersByTime(30000);
        await Promise.resolve();
        expect(mockPublishGameEvent).toHaveBeenCalledWith(
            'game_loop_events',
            'lockgame',
            expect.objectContaining({ gameId: '2' }),
        );
    });

    it('DLQ com x-death=2 → backoff 120s + publishGameEvent', async () => {
        const msg = makeMsg({ action: 'fundgame', gameId: '4' }, 2);
        await processDlq(msg);
        expect(mockChannel.ack).toHaveBeenCalledWith(msg);
        // 30s * 2^2 = 120000
        jest.advanceTimersByTime(120000);
        await Promise.resolve();
        expect(mockPublishGameEvent).toHaveBeenCalledWith(
            'game_loop_events',
            'fundgame',
            expect.any(Object),
        );
    });
});

// ── updateQueueDepthMetrics ─────────────────────────────────────────────

describe('updateQueueDepthMetrics', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockChannel.checkQueue = jest.fn().mockResolvedValue({ messageCount: 42, consumerCount: 1 });
    });

    it('chama checkQueue para cada fila gerenciada', async () => {
        await updateQueueDepthMetrics();
        expect(mockChannel.checkQueue).toHaveBeenCalledTimes(4);
        expect(mockChannel.checkQueue).toHaveBeenCalledWith('game_loop_events');
        expect(mockChannel.checkQueue).toHaveBeenCalledWith('game_loop_payouts');
        expect(mockChannel.checkQueue).toHaveBeenCalledWith('game_loop_dead');
        expect(mockChannel.checkQueue).toHaveBeenCalledWith('game_loop_payouts_dead');
    });

    it('setQueueDepth chamado com nome da fila e messageCount', async () => {
        await updateQueueDepthMetrics();
        expect(setQueueDepth).toHaveBeenCalledWith('game_loop_events', 42);
        expect(setQueueDepth).toHaveBeenCalledWith('game_loop_payouts', 42);
        expect(setQueueDepth).toHaveBeenCalledWith('game_loop_dead', 42);
        expect(setQueueDepth).toHaveBeenCalledWith('game_loop_payouts_dead', 42);
    });

    it('checkQueue lança erro → apenas loga, não propaga', async () => {
        mockChannel.checkQueue = jest.fn().mockRejectedValue(new Error('QUEUE_NOT_FOUND'));
        await expect(updateQueueDepthMetrics()).resolves.toBeUndefined();
        // Não deve ter chamado setQueueDepth
        expect(setQueueDepth).not.toHaveBeenCalled();
    });
});

// Helper: confirma que o scan reverso (limit:200, reverse:true) acha um jogo
// recente de `status` escondido entre >100 jogos antigos (aborted).
async function expectReverseScanFindsRecent(
    target: () => Promise<void>,
    status: string,
    recentId: string,
    assertTarget: () => void,
): Promise<void> {
    const oldGames = Array.from({ length: 101 }, (_, i) =>
        makeBlockchainGame({ game_id: String(i + 1), status: 'aborted' })
    );
    const recent = makeBlockchainGame({ game_id: recentId, status, total_tickets: 5 });
    const allGames = [...oldGames, recent];

    mockGetTableRows
        .mockResolvedValueOnce({ rows: allGames })
        .mockResolvedValueOnce({ rows: [] });

    await target();

    expect(mockGetTableRows).toHaveBeenNthCalledWith(1, expect.objectContaining({
        limit: 200,
        reverse: true,
    }));
    assertTarget();
}

// ── autoClaimDrawnGames ─────────────────────────────────────────────────────

describe('autoClaimDrawnGames', () => {
    beforeEach(() => jest.clearAllMocks());

    it('reverse:true + limit:200 encontra jogo drawn recente entre >100 jogos antigos', async () => {
        await expectReverseScanFindsRecent(
            autoClaimDrawnGames,
            'drawn',
            '9999999999',
            () => expect(mockOrchestrate).toHaveBeenCalledWith('9999999999'),
        );
    });
});

// ── autoStartLockedGames ──────────────────────────────────────────────────

describe('autoStartLockedGames', () => {
    beforeEach(() => jest.clearAllMocks());
    afterEach(() => jest.useRealTimers());

    it('reverse:true + limit:200 encontra jogo locked recente entre >100 jogos antigos', async () => {
        jest.useFakeTimers();
        await expectReverseScanFindsRecent(
            autoStartLockedGames,
            'locked',
            '9999999998',
            // processLockedGame chama autoStartDraw sem await, mas executeStartDraw
            // é chamado síncrono na função — comprova que o jogo recente foi encontrado
            () => expect(mockStartDraw).toHaveBeenCalledWith('9999999998'),
        );
    });
});

describe('Retry backoff helpers', () => {
    beforeEach(() => {
        resRetryMap.clear();
    });

    describe('isResourceExhausted', () => {
        it('reconhece "account cpu limit" como recurso exaurido', () => {
            expect(isResourceExhausted(new Error('reached account cpu limit'))).toBe(true);
        });

        it('reconhece "billed CPU time" como recurso exaurido', () => {
            expect(isResourceExhausted(new Error('billed CPU time (200 us) is greater than the maximum billable CPU time for the transaction (150 us)'))).toBe(true);
        });

        it('reconhece "subjective cpu" como recurso exaurido', () => {
            expect(isResourceExhausted(new Error('subjective cpu bandwidth limit exceeded'))).toBe(true);
        });

        it('reconhece "net usage" como recurso exaurido', () => {
            expect(isResourceExhausted(new Error('net usage exceeds available capacity'))).toBe(true);
        });

        it('reconhece "expired by" como recurso exaurido', () => {
            expect(isResourceExhausted(new Error('expired by the network'))).toBe(true);
        });

        it('retorna false para erro genérico', () => {
            expect(isResourceExhausted(new Error('assertion failure: game not found'))).toBe(false);
        });

        it('retorna false para erro sem mensagem', () => {
            expect(isResourceExhausted(new Error())).toBe(false);
        });

        it('retorna false para err sem message', () => {
            expect(isResourceExhausted({ code: 500 })).toBe(false);
        });
    });

    describe('resBackoffMs', () => {
        it('count=0 → 60000 (backoff base)', () => {
            expect(resBackoffMs('game-0')).toBe(60_000);
        });

        it('count=1 → 120000 (2× base)', () => {
            resRetryMap.set('game-1', { count: 1, lastAttempt: Date.now() });
            expect(resBackoffMs('game-1')).toBe(120_000);
        });

        it('count=5 → 1.8M (saturado em max)', () => {
            resRetryMap.set('game-5', { count: 5, lastAttempt: Date.now() });
            expect(resBackoffMs('game-5')).toBe(1_800_000);
        });

        it('count=10 → 1.8M (saturado em max)', () => {
            resRetryMap.set('game-10', { count: 10, lastAttempt: Date.now() });
            expect(resBackoffMs('game-10')).toBe(1_800_000);
        });
    });

    describe('autoStartDraw com resource exhaustion', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            resRetryMap.clear();
        });

        it('quando executeStartDraw lança "account cpu limit" → backoff incrementado, sem abort', async () => {
            mockStartDraw.mockRejectedValueOnce(new Error('reached account cpu limit'));

            await autoStartDraw('cpu-test-game');

            // resRetryMap deve ter entrada com count=1
            const entry = resRetryMap.get('cpu-test-game');
            expect(entry).toBeDefined();
            expect(entry!.count).toBe(1);

            // Não deve ter chamado abort nem orchestrate
            expect(mockAbortGame).not.toHaveBeenCalled();
            expect(mockOrchestrate).not.toHaveBeenCalled();
        });
    });

    describe('processLockedGame — defesa anti-draw-sem-cartelas (BUG A)', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            resRetryMap.clear();
        });

        it('NÃO dispara startdraw em jogo LOCKED sem apostas (total_wagered=0) — aborta NO_TICKETS_LOCKED', async () => {
            mockFetchGame.mockResolvedValue(makeBlockchainGame({
                game_id:  '999',
                status:   'locked',
                total_wagered: { quantity: '0.0000 BINGO', contract: 'bingogametkn' },
            }));

            await processLockedGame('999');

            expect(mockAbortGame).toHaveBeenCalledWith('999', 'NO_TICKETS_LOCKED');
            expect(mockStartDraw).not.toHaveBeenCalled();
        });

        it('DISPARA startdraw em jogo LOCKED COM apostas (total_wagered>0) — NÃO aborta (BUG #382)', async () => {
            // Caso real: usuário comprou 25 cartelas (1.0000 BINGO cada = 25 BINGO).
            // A defesa #378 usava game?.total_tickets (inexistente no contrato) e
            // abortava TODOS os jogos LOCKED. Fonte da verdade é total_wagered.
            mockFetchGame.mockResolvedValue(makeBlockchainGame({
                game_id:  '888',
                status:   'locked',
                total_wagered: { quantity: '25.0000 BINGO', contract: 'bingogametkn' },
            }));

            await processLockedGame('888');

            expect(mockStartDraw).toHaveBeenCalledWith('888');
            expect(mockAbortGame).not.toHaveBeenCalled();
        });
    });
});
