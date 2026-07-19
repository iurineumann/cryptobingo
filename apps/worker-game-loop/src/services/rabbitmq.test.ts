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
    on:             jest.fn(),
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
    notifyGameLocked:      jest.fn(),
    notifyGameFunded:      jest.fn(),
    notifyGameAborted:     jest.fn(),
    startSlowReveal:       jest.fn().mockResolvedValue(undefined),
    notifyPrizeConfirmed:  jest.fn(),
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
    eventsProcessedTotal:       { inc: jest.fn() },
    eventsFailedTotal:          { inc: jest.fn() },
    eventsDeadLetteredTotal:    { inc: jest.fn() },
    eventProcessingDuration:    { startTimer: jest.fn().mockReturnValue(jest.fn()) },
    autoAdvanceRunsTotal:       { inc: jest.fn() },
    autoAdvanceErrorsTotal:     { inc: jest.fn() },
    autoAdvanceGamesTotal:      { inc: jest.fn() },
    oraclePollAttempts:         { observe: jest.fn() },
    workerQueuePublishedTotal:  { inc: jest.fn() },
    setQueueDepth:              jest.fn(),
    stateWatcherEventsReceived: { inc: jest.fn() },
    stateWatcherPublished:      { inc: jest.fn() },
    stateWatcherErrors:         { inc: jest.fn() },
    stateWatcherReconnections:  { inc: jest.fn() },
    stateWatcherSourceChanges:  { inc: jest.fn() },
    stateWatcherCursorPosition: { set: jest.fn() },
    stateWatcherPublishLatency: { startTimer: jest.fn().mockReturnValue(jest.fn()), observe: jest.fn() },
}));
jest.mock('./prizeMetrics', () => {
    const counter = () => ({ inc: jest.fn(), labels: jest.fn().mockReturnValue({ inc: jest.fn() }) });
    const gauge = () => ({ set: jest.fn() });
    const histogram = () => ({ startTimer: jest.fn().mockReturnValue(jest.fn()) });
    return {
        prizePaymentsTotal:      counter(),
        prizePaymentsAmountTotal:counter(),
        prizePipelineDuration:   histogram(),
        prizePersistTotal:       counter(),
        buyinPersistedTotal:     counter(),
        prizeRtpRatio:           gauge(),
        prizePaymentsTxTotal:    counter(),
        payoutChunksTotal:       counter(),
        payoutRetriesTotal:      counter(),
        payoutRecoveredTotal:    counter(),
    };
});
// Fase 1 (#368): lock Redis e publish na fila são novos. O teste original assumia
// "executa sempre" — fingimos lock adquirido e publish no-op para isolar o handler.
jest.mock('./gameLock', () => ({
    acquireOrchestrationLock: jest.fn().mockResolvedValue(true),
    releaseOrchestrationLock: jest.fn().mockResolvedValue(undefined),
    isLocked:                 jest.fn().mockResolvedValue(false),
    startLockWatchdog:        jest.fn().mockReturnValue({ stop: jest.fn() }),
}));
jest.mock('./rabbitPublisher', () => ({
    publishGameEvent:  jest.fn().mockResolvedValue(undefined),
    getPublishChannel: jest.fn(),
}));

jest.mock('./prizeTransactionsService', () => ({
    savePrizeTx: jest.fn().mockResolvedValue(undefined),
    saveBuyInTx: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./evaluator', () => ({
    computePayoutAmount: jest.fn().mockReturnValue({ amount: 1, currency: 'BINGO' }),
}));

import { orchestrateGame }  from './gameOrchestrator';
import { executeFundGame, executeLockGame, executeStartDraw, executeAbortGame } from './blockchain';
import { connectRabbitMQ, autoStartDraw, autoClaimDrawnGames, autoStartLockedGames, autoLockFundingGames, updateQueueDepthMetrics, processLockedGame, persistPrizeTx } from './rabbitmq';
import * as RM from './rabbitmq';
import { savePrizeTx } from './prizeTransactionsService';
import { computePayoutAmount } from './evaluator';
import { notifyPrizeConfirmed, notifyGameAborted } from './broadcaster';
import { prizePersistTotal, prizePaymentsTotal, prizePaymentsAmountTotal } from './prizeMetrics';
import { publishGameEvent } from './rabbitPublisher';
import { setQueueDepth } from './metrics';
import { isResourceExhausted, resBackoffMs, resRetryMap, RES_RETRY_MAX } from './retryBackoff';
import { fetchGame, rpcClient } from '@cryptobingo/blockchain-core';
import { acquireOrchestrationLock, releaseOrchestrationLock, startLockWatchdog } from './gameLock';
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

    it('FIX #384: action=fundgame com jogo já fora de CREATED → executeFundGame NÃO chamado (idempotente)', async () => {
        // Recuperação / outra mensagem da fila já avançou o jogo.
        mockFetchGame.mockResolvedValue(makeBlockchainGame({ game_id: '1', status: 'funding' }));
        const msg = makeMsg({ action: 'fundgame', gameId: '1' });
        await processMsg(msg);
        expect(mockFundGame).not.toHaveBeenCalled();
    });

    it('FIX #384: action=fundgame com fetchGame falhando → executa mesmo assim (não deixa travado)', async () => {
        mockFetchGame.mockRejectedValue(new Error('rpc down'));
        const msg = makeMsg({ action: 'fundgame', gameId: '1' });
        await processMsg(msg);
        expect(mockFundGame).toHaveBeenCalledWith('1');
    });

    it('action=lockgame → executeLockGame chamado', async () => {
        // Fonte da verdade do contrato é total_wagered (nao total_tickets inexistente).
        mockFetchGame.mockResolvedValue(makeBlockchainGame({ game_id: '1', status: 'funding', total_wagered: { quantity: '3.0000 BINGO', contract: 'bingogametkn' } }));
        const msg = makeMsg({ action: 'lockgame', gameId: '1' });
        await processMsg(msg);
        expect(mockLockGame).toHaveBeenCalledWith('1');
    });

    it('action=abortgame → executeAbortGame chamado com reason', async () => {
        const msg = makeMsg({ action: 'abortgame', gameId: '1', reason: 'ADMIN_HALT' });
        await processMsg(msg);
        expect(mockAbortGame).toHaveBeenCalledWith('1', expect.any(String));
    });

    // receiverand + startdraw testados com fake timers abaixo
    describe('action=receiverand (B2: event-driven oracle)', () => {
        // Mocks tipados das dependências usadas pelos testes de receiverand
        const mockAcquireLock    = acquireOrchestrationLock as jest.Mock;
        const mockReleaseLock    = releaseOrchestrationLock as jest.Mock;
        const mockStartWatchdog  = startLockWatchdog  as jest.Mock;
        const mockNotifyAborted  = notifyGameAborted  as jest.Mock;

        beforeEach(() => {
            jest.clearAllMocks();
            jest.useFakeTimers({ legacyFakeTimers: false });
            mockAcquireLock.mockResolvedValue(true);
            mockStartWatchdog.mockReturnValue({ stop: jest.fn() });
        });
        afterEach(() => {
            jest.useRealTimers();
        });

        it('receiverand → orchestrateGame chamado (jogo em drawing, lock ok, bolas prontas)', async () => {
            mockFetchGame.mockResolvedValue(makeBlockchainGame({
                game_id: '42', status: 'drawing', drawn_balls: new Array(75).fill(1),
            }));
            const msg = makeMsg({ action: 'receiverand', gameId: '42' });
            const promise = processMsg(msg);
            await jest.advanceTimersToNextTimerAsync();
            await promise;
            expect(mockOrchestrate).toHaveBeenCalledWith('42');
            expect(mockChannel.ack).toHaveBeenCalledWith(msg);
        });

        it('receiverand com jogo já em DRAWN → orchestrateGame NÃO chamado (idempotência por status)', async () => {
            mockFetchGame.mockResolvedValue(makeBlockchainGame({
                game_id: '42', status: 'drawn', drawn_balls: new Array(75).fill(1),
            }));
            const msg = makeMsg({ action: 'receiverand', gameId: '42' });
            await processMsg(msg);
            expect(mockOrchestrate).not.toHaveBeenCalled();
            expect(mockChannel.ack).toHaveBeenCalledWith(msg);
        });

        it('receiverand sem lock → orchestrateGame NÃO chamado (idempotência por lock)', async () => {
            mockFetchGame.mockResolvedValue(makeBlockchainGame({
                game_id: '42', status: 'drawing',
            }));
            mockAcquireLock.mockResolvedValueOnce(false);
            const msg = makeMsg({ action: 'receiverand', gameId: '42' });
            await processMsg(msg);
            expect(mockOrchestrate).not.toHaveBeenCalled();
            // lock não adquirido → break → outer success path acks
            expect(mockChannel.ack).toHaveBeenCalledWith(msg);
        });

        it('receiverand com waitForDrawnBalls retornando null → executeAbortGame + nack', async () => {
            mockFetchGame.mockResolvedValue(makeBlockchainGame({
                game_id: '42', status: 'drawing', drawn_balls: [],
            }));
            const msg = makeMsg({ action: 'receiverand', gameId: '42' });
            const promise = processMsg(msg);
            // waitForDrawnBalls: 75 iterações × 2000ms poll = 150s simulado
            // advanceTimersToNextTimerAsync avança 2s por vez + microtasks
            for (let i = 0; i < 75; i++) {
                await jest.advanceTimersToNextTimerAsync();
            }
            await promise;
            expect(mockAbortGame).toHaveBeenCalledWith('42', 'ORACLE_TIMEOUT');
            expect(mockNotifyAborted).toHaveBeenCalledWith('42', 'ORACLE_TIMEOUT');
            expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
            expect(mockOrchestrate).not.toHaveBeenCalled();
        });

        it('startdraw CONTINUA orquestrando (regressão: polling + executeStartDraw + orchestrateGame)', async () => {
            mockFetchGame.mockResolvedValue(makeBlockchainGame({
                game_id: '42', status: 'drawing', drawn_balls: new Array(75).fill(1),
            }));
            const msg = makeMsg({ action: 'startdraw', gameId: '42' });
            const promise = processMsg(msg);
            await jest.advanceTimersToNextTimerAsync();
            await promise;
            expect(mockStartDraw).toHaveBeenCalledWith('42');
            expect(mockOrchestrate).toHaveBeenCalledWith('42');
            expect(mockChannel.ack).toHaveBeenCalledWith(msg);
        });

        it('BUG FIX (2026-07-18): startdraw com lockAcquired=false → ack SIM, nack NAO (drena fila)', async () => {
            // simula lock já existente (C7.2: executeStartDraw feito por outro caminho)
            (acquireOrchestrationLock as jest.Mock).mockResolvedValueOnce(false);
            // CORREÇÃO RACE: aguarda oráculo confirmar drawn antes de orquestrar.
            // waitForDrawnBalls real roda com fake timers; fetchGame retorna drawn.
            mockFetchGame.mockResolvedValue(makeBlockchainGame({
                game_id: '99', status: 'drawn', drawn_balls: new Array(75).fill(1),
            }));
            const msg = makeMsg({ action: 'startdraw', gameId: '99' });
            const promise = processMsg(msg);
            await jest.advanceTimersToNextTimerAsync();
            await promise;
            expect(mockChannel.ack).toHaveBeenCalledWith(msg);
            expect(mockChannel.nack).not.toHaveBeenCalled();
            expect(mockStartDraw).not.toHaveBeenCalled();
            // orchestrateGame deve ser chamado para garantir o reveal
            expect(mockOrchestrate).toHaveBeenCalledWith('99');
        });

        it('BUG FIX (2026-07-18): startdraw lockAcquired=false 2x seguidas → ambas fazem ack', async () => {
            (acquireOrchestrationLock as jest.Mock).mockResolvedValue(false);
            mockFetchGame.mockResolvedValue(makeBlockchainGame({
                game_id: '111', status: 'drawn', drawn_balls: new Array(75).fill(1),
            }));
            const p1 = processMsg(makeMsg({ action: 'startdraw', gameId: '111' }));
            const p2 = processMsg(makeMsg({ action: 'startdraw', gameId: '222' }));
            await jest.advanceTimersToNextTimerAsync();
            await Promise.all([p1, p2]);
            expect(mockChannel.ack).toHaveBeenCalledTimes(2);
            expect(mockChannel.nack).not.toHaveBeenCalled();
        });
    });

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
        const msg = makeMsg({ action: 'lockgame', gameId: '1' }, 1); // x-death=1
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

    it('DLQ com x-death=2 → backoff 120s + publishGameEvent (não fundgame)', async () => {
        const msg = makeMsg({ action: 'startdraw', gameId: '4' }, 2);
        await processDlq(msg);
        expect(mockChannel.ack).toHaveBeenCalledWith(msg);
        // 30s * 2^2 = 120000
        jest.advanceTimersByTime(120000);
        await Promise.resolve();
        expect(mockPublishGameEvent).toHaveBeenCalledWith(
            'game_loop_events',
            'startdraw',
            expect.any(Object),
        );
    });

    it('DLQ fundgame com x-death=1 → ACK + setTimeout com retry curto (3s)', async () => {
        const msg = makeMsg({ action: 'fundgame', gameId: '5' }, 1);
        await processDlq(msg);
        expect(mockChannel.ack).toHaveBeenCalledWith(msg);
        // Fundgame usa FUNDGAME_DLQ_RETRY_MS=3000, não 30s*2^n
        jest.advanceTimersByTime(3000);
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
    // Fonte da verdade do contrato é total_wagered (nao total_tickets inexistente).
    const recent = makeBlockchainGame({
        game_id:       recentId,
        status,
        total_wagered: { quantity: '10.0000 BINGO', contract: 'bingogametkn' },
    });
    const allGames = [...oldGames, recent];

    mockGetTableRows
        .mockResolvedValueOnce({ rows: allGames })
        .mockResolvedValueOnce({ rows: [] });

    // processLockedGame faz fetchGame(gameId) para decidir abortar ou sortear.
    mockFetchGame.mockResolvedValue(recent);

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

    it('B3: republica startdraw na fila — publishGameEvent chamado, executeStartDraw NÃO chamado diretamente', async () => {
        jest.useFakeTimers();
        await expectReverseScanFindsRecent(
            autoStartLockedGames,
            'locked',
            '9999999998',
            () => {
                expect(mockPublishGameEvent).toHaveBeenCalledWith(
                    'game_loop_events',
                    'startdraw',
                    expect.objectContaining({ gameId: '9999999998' }),
                );
                expect(mockStartDraw).not.toHaveBeenCalled();
            },
        );
    });
});

// ── autoLockFundingGames regressão (B3: já é backup, só confirma) ──────────

describe('autoLockFundingGames — regressão B3', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });
    afterEach(() => jest.useRealTimers());

    it('B3: autoLockFundingGames continua publicando lockgame na fila', async () => {
        const mockFetchGame = fetchGame as jest.Mock;

        // Jogo funding com tickets — deve publicar lockgame
        mockGetTableRows
            .mockResolvedValueOnce({
                rows: [makeBlockchainGame({
                    game_id: '100',
                    status: 'funding',
                    total_wagered: { quantity: '10.0000 BINGO', contract: 'bingogametkn' },
                })],
            })
            .mockResolvedValueOnce({ rows: [] }); // active rooms vazio

        mockFetchGame.mockResolvedValue(
            makeBlockchainGame({
                game_id: '100',
                status: 'funding',
                total_wagered: { quantity: '10.0000 BINGO', contract: 'bingogametkn' },
            })
        );

        await autoLockFundingGames();
        jest.advanceTimersByTime(0);
        await Promise.resolve();

        expect(mockPublishGameEvent).toHaveBeenCalledWith(
            'game_loop_events',
            'lockgame',
            expect.objectContaining({ gameId: '100' }),
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
            // Garante lock livre para este describe (clearAllMocks não zera mockReturnValue;
            // um mockResolvedValueOnce(false) vazado de outro describe não deve abortar o fallback)
            acquireOrchestrationLock.mockResolvedValue(true);
        });

        it('B3: fallback direto — publishGameEvent THROW → executeStartDraw + acquireOrchestrationLock chamados', async () => {
            mockFetchGame.mockResolvedValue(makeBlockchainGame({
                game_id:  '777',
                status:   'locked',
                total_wagered: { quantity: '5.0000 BINGO', contract: 'bingogametkn' },
            }));

            // Simula RabbitMQ down — publishGameEvent lança
            mockPublishGameEvent.mockRejectedValueOnce(new Error('RabbitMQ connection refused'));

            await processLockedGame('777');

            // publishGameEvent foi chamado (antes de falhar)
            expect(mockPublishGameEvent).toHaveBeenCalledWith(
                'game_loop_events',
                'startdraw',
                expect.objectContaining({ gameId: '777' }),
            );
            // Fallback direto: executeStartDraw chamado
            expect(mockStartDraw).toHaveBeenCalledWith('777');
            // Lock adquirido no fallback
            const mockAcquireLock = acquireOrchestrationLock as jest.Mock;
            expect(mockAcquireLock).toHaveBeenCalledWith('777');
            // Abort NÃO chamado
            expect(mockAbortGame).not.toHaveBeenCalled();
        });

        it('B3: NÃO dispara publishGameEvent se LOCKED sem tickets — aborta NO_TICKETS_LOCKED', async () => {
            mockFetchGame.mockResolvedValue(makeBlockchainGame({
                game_id:  '999',
                status:   'locked',
                total_wagered: { quantity: '0.0000 BINGO', contract: 'bingogametkn' },
            }));

            await processLockedGame('999');

            expect(mockAbortGame).toHaveBeenCalledWith('999', 'NO_TICKETS_LOCKED');
            expect(mockPublishGameEvent).not.toHaveBeenCalled();
            expect(mockStartDraw).not.toHaveBeenCalled();
        });

        it('B3: DISPARA republish startdraw em jogo LOCKED COM apostas — publishGameEvent chamado, NÃO executeStartDraw', async () => {
            // Caso real: usuário comprou 25 cartelas (1.0000 BINGO cada = 25 BINGO).
            // B3: processLockedGame agora republica startdraw na fila como backup.
            mockFetchGame.mockResolvedValue(makeBlockchainGame({
                game_id:  '888',
                status:   'locked',
                total_wagered: { quantity: '25.0000 BINGO', contract: 'bingogametkn' },
            }));

            await processLockedGame('888');

            expect(mockPublishGameEvent).toHaveBeenCalledWith(
                'game_loop_events',
                'startdraw',
                expect.objectContaining({ gameId: '888' }),
            );
            expect(mockStartDraw).not.toHaveBeenCalled();
        });
    });
});

describe('persistPrizeTx — grava prizetxes p/ jogos non-multimatch (BUG #386)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('grava 1 PrizeTx por entry com winType pattern (chunk_clean)', async () => {
        const entries = [{
            ticketId: 't1', ticketOwner: 'player1', ballCount: 40, patternMask: '0x1FF',
            goldenMultiplier: 0, patternName: 'ROW_1', weight: 100,
            baseMultiplier: 1, ticketPrice: '1.0000 BINGO',
        }] as any;

        await persistPrizeTx('game1', 'chunk_clean', entries, 'txhash-abc');

        expect(savePrizeTx).toHaveBeenCalledTimes(1);
        const arg = (savePrizeTx as jest.Mock).mock.calls[0][0];
        expect(arg.gameId).toBe('game1');
        expect(arg.ticketId).toBe('t1');
        expect(arg.account).toBe('player1');
        expect(arg.winType).toBe('pattern');
        expect(arg.winLabel).toBe('ROW_1');
        expect(arg.transactionId).toBe('txhash-abc');
        expect(arg.amount).toBe('1.0000');
        expect(arg.currency).toBe('BINGO');
        expect(notifyPrizeConfirmed).toHaveBeenCalledWith('game1', 't1', 'txhash-abc', '1.0000', 'BINGO', 'ROW_1');
        expect(prizePersistTotal.labels({ result: 'success' }).inc).toHaveBeenCalled();
    });

    it('usa winType combo quando entry tem comboId (single_combo)', async () => {
        const entries = [{
            ticketId: 't2', ticketOwner: 'player2', ballCount: 40, patternMask: '0x2FF',
            goldenMultiplier: 0, patternName: '2x Simples', weight: 300, comboId: 7,
            baseMultiplier: 1, ticketPrice: '1.0000 BINGO',
        }] as any;

        await persistPrizeTx('game2', 'single_combo', entries, 'txhash-def');

        const arg = (savePrizeTx as jest.Mock).mock.calls[0][0];
        expect(arg.winType).toBe('combo');
        expect(arg.comboId).toBe(7);
        expect(arg.winLabel).toBe('2x Simples');
    });

    it('NÃO lança se savePrizeTx falhar (payout já ocorreu na chain)', async () => {
        (savePrizeTx as jest.Mock).mockRejectedValueOnce(new Error('Mongo down'));

        const entries = [{
            ticketId: 't3', ticketOwner: 'player3', ballCount: 40, patternMask: '0x1FF',
            goldenMultiplier: 0, patternName: 'ROW_1', weight: 100,
            baseMultiplier: 1, ticketPrice: '1.0000 BINGO',
        }] as any;

        await expect(persistPrizeTx('game3', 'chunk_clean', entries, 'txhash-ghi')).resolves.toBeUndefined();
        expect(prizePersistTotal.labels({ result: 'error' }).inc).toHaveBeenCalled();
    });
});
