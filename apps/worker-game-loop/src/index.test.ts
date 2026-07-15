// apps/worker-game-loop/src/index.test.ts
//
// Regressão: o blockchainIndexer nunca era iniciado no bootstrap do worker,
// deixando a tabela games_history vazia e zerando os stats públicos da landing
// (GET /api/stats/game -> total_games:0). Ver issue: worker-indexer-bootstrap.
//
// Este teste garante que bootstrap() invoca startBlockchainIndexer().

// ── Mocks de todos os side-effects do bootstrap ──────────────────────────────
const mockStartMetricsServer   = jest.fn();
const mockStartBroadcaster     = jest.fn();
const mockStartBurnSyncCron    = jest.fn();
const mockConnectRedis         = jest.fn().mockResolvedValue(undefined);
const mockConnectRabbitMQ      = jest.fn();
const mockAutoLockFundingGames = jest.fn();
const mockAutoStartLockedGames = jest.fn();
const mockAutoClaimDrawnGames  = jest.fn();
const mockRecoverStuckGames    = jest.fn().mockResolvedValue(undefined);
const mockEnsureFirstGame      = jest.fn();
const mockStartBlockchainIndexer = jest.fn().mockResolvedValue(undefined);

jest.mock('./instrumentation', () => ({}), { virtual: true });

jest.mock('mongoose', () => ({
    __esModule: true,
    default: { connect: jest.fn().mockResolvedValue(undefined) },
    connect: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./services/rabbitmq', () => ({
    connectRabbitMQ:       (...a: any[]) => mockConnectRabbitMQ(...a),
    autoLockFundingGames:  (...a: any[]) => mockAutoLockFundingGames(...a),
    autoStartLockedGames:  (...a: any[]) => mockAutoStartLockedGames(...a),
    autoClaimDrawnGames:   (...a: any[]) => mockAutoClaimDrawnGames(...a),
    recoverStuckGames:     (...a: any[]) => mockRecoverStuckGames(...a),
}));

jest.mock('./services/broadcaster', () => ({
    startBroadcaster: (...a: any[]) => mockStartBroadcaster(...a),
}));

jest.mock('./services/metrics', () => ({
    startMetricsServer: (...a: any[]) => mockStartMetricsServer(...a),
}));

jest.mock('./services/roomManager', () => ({
    ensureFirstGameForActiveRooms: (...a: any[]) => mockEnsureFirstGame(...a),
}));

jest.mock('./services/redis', () => ({
    connectRedis: (...a: any[]) => mockConnectRedis(...a),
}));

jest.mock('./services/burnCron', () => ({
    startBurnSyncCron: (...a: any[]) => mockStartBurnSyncCron(...a),
}));

jest.mock('./services/blockchainIndexer', () => ({
    startBlockchainIndexer: (...a: any[]) => mockStartBlockchainIndexer(...a),
}));

jest.mock('./services/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('worker bootstrap — wiring do blockchainIndexer', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        process.env = { ...OLD_ENV, MICROSERVICE_PRIVATE_KEY: 'x', JWT_SECRET: 'y' };
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
        process.env = OLD_ENV;
    });

    it('bootstrap() inicia o blockchainIndexer (popula games_history)', async () => {
        const { bootstrap } = require('./index');
        await bootstrap();
        expect(mockStartBlockchainIndexer).toHaveBeenCalledTimes(1);
    });
});
