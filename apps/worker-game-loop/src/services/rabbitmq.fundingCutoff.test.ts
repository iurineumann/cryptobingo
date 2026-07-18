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
    notifyGameFunded:  jest.fn(),
    notifyGameLocked:  jest.fn(),
    notifyGameAborted: jest.fn(),
    startSlowReveal:   jest.fn().mockResolvedValue(undefined),
    notifyPrizeConfirmed: jest.fn(),
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
jest.mock('./payoutSaga', () => ({
    setPayoutPlan:           jest.fn(),
    recordPayoutCompletion:  jest.fn().mockResolvedValue(undefined),
    triggerCloseGame:        jest.fn(),
    getPayoutProgress:       jest.fn(),
}));
jest.mock('./prizeTransactionsService', () => ({
    savePrizeTx: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./evaluator', () => ({
    computePayoutAmount: jest.fn().mockReturnValue('0.0000 WAX'),
}));
jest.mock('./rabbitPublisher', () => ({
    publishGameEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./chatSystemHelper', () => ({
    sendGameLockedMessage:  jest.fn().mockResolvedValue(undefined),
    sendDrawStartedMessage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./xpEngine', () => ({
    awardTicketPurchaseXP: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('dotenv', () => ({
    config: jest.fn(),
}));

import { isGamePastCutoff } from './rabbitmq';
import type { BlockchainGameState } from '@cryptobingo/shared-types';

describe('isGamePastCutoff (ADR-056 consumo on-chain)', () => {
    // cutoff em MILISEGUNDOS (Date.now()), espelhando autoLockFundingGames.
    const cutoff = Date.now() - 60_000;
    const OLD_EPOCH = '1';

    // Contrato retorna funded_at em SEGUNDOS (sec_since_epoch). Helper converte.
    const secAgo = (msAgo: number) => Math.floor((Date.now() - msAgo) / 1000);

    function makeGame(overrides: Partial<BlockchainGameState>): BlockchainGameState {
        return {
            game_id: '100',
            status: 'funding',
            ticket_price: { quantity: '5.0000 WAX', contract: 'eosio.token' },
            total_wagered: { quantity: '0.0000 WAX', contract: 'eosio.token' },
            sponsor_pool: [],
            drawn_balls: [],
            campaign_id: '0',
            gametype_id: '1',
            end_time: 0,
            room_id: '0',
            ...overrides,
        };
    }

    it('funded_at 65s atras (<= cutoff) retorna true', async () => {
        const game = makeGame({ funded_at: secAgo(65_000) });
        await expect(isGamePastCutoff(game, cutoff)).resolves.toBe(true);
    });

    it('funded_at 30s atras (> cutoff) retorna false', async () => {
        const game = makeGame({ funded_at: secAgo(30_000) });
        await expect(isGamePastCutoff(game, cutoff)).resolves.toBe(false);
    });

    it('funded_at undefined -> fallback game_id epoch antigo -> true', async () => {
        const game = makeGame({ game_id: OLD_EPOCH, funded_at: undefined });
        await expect(isGamePastCutoff(game, cutoff)).resolves.toBe(true);
    });

    it('funded_at 0 -> fallback game_id -> true', async () => {
        const game = makeGame({ game_id: OLD_EPOCH, funded_at: 0 });
        await expect(isGamePastCutoff(game, cutoff)).resolves.toBe(true);
    });

    it('funded_at em SEGUNDOS (contrato real) converte para ms corretamente', async () => {
        // funded_at há 10s em segundos -> 10_000ms atrás -> ainda > cutoff (60s) -> false
        const game = makeGame({ funded_at: secAgo(10_000) });
        await expect(isGamePastCutoff(game, cutoff)).resolves.toBe(false);
    });
});
