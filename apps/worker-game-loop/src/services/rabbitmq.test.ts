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
}));

import { orchestrateGame }  from './gameOrchestrator';
import { executeFundGame, executeLockGame, executeStartDraw, executeAbortGame } from './blockchain';
import { connectRabbitMQ, autoClaimDrawnGames, autoStartLockedGames } from './rabbitmq';
import { fetchGame, rpcClient } from '@cryptobingo/blockchain-core';
import type { BlockchainGameState } from '@cryptobingo/shared-types';

const mockOrchestrate    = orchestrateGame    as jest.Mock;
const mockFundGame       = executeFundGame    as jest.Mock;
const mockLockGame       = executeLockGame    as jest.Mock;
const mockStartDraw      = executeStartDraw   as jest.Mock;
const mockAbortGame      = executeAbortGame   as jest.Mock;

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

// Captura o handler registrado em channel.consume
function captureHandler(): (msg: any) => Promise<void> {
    const call = mockChannel.consume.mock.calls[0];
    return call?.[1];
}

// ── connectRabbitMQ e consumeMessages ────────────────────────────────────────

describe('connectRabbitMQ + consumeMessages handlers', () => {
    let processMsg: (msg: any) => Promise<void>;

    beforeAll(async () => {
        jest.clearAllMocks();
        await connectRabbitMQ();
        processMsg = captureHandler();
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

// ── autoClaimDrawnGames ─────────────────────────────────────────────────────

describe('autoClaimDrawnGames', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('reverse:true + limit:200 encontra jogo drawn recente entre >100 jogos antigos', async () => {
        const oldGames = Array.from({ length: 101 }, (_, i) =>
            makeBlockchainGame({ game_id: String(i + 1), status: 'aborted' })
        );
        const recentDrawn = makeBlockchainGame({
            game_id: '9999999999',
            status: 'drawn',
        });
        const allGames = [...oldGames, recentDrawn];

        mockGetTableRows
            .mockResolvedValueOnce({ rows: allGames })
            .mockResolvedValueOnce({ rows: [] });

        await autoClaimDrawnGames();

        expect(mockGetTableRows).toHaveBeenNthCalledWith(1, expect.objectContaining({
            limit: 200,
            reverse: true,
        }));
        expect(mockOrchestrate).toHaveBeenCalledWith('9999999999');
    });
});

// ── autoStartLockedGames ──────────────────────────────────────────────────

describe('autoStartLockedGames', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    it('reverse:true + limit:200 encontra jogo locked recente entre >100 jogos antigos', async () => {
        jest.useFakeTimers();

        const oldGames = Array.from({ length: 101 }, (_, i) =>
            makeBlockchainGame({ game_id: String(i + 1), status: 'aborted' })
        );
        const recentLocked = makeBlockchainGame({
            game_id: '9999999998',
            status: 'locked',
        });
        const allGames = [...oldGames, recentLocked];

        mockGetTableRows
            .mockResolvedValueOnce({ rows: allGames })
            .mockResolvedValueOnce({ rows: [] });

        await autoStartLockedGames();

        expect(mockGetTableRows).toHaveBeenNthCalledWith(1, expect.objectContaining({
            limit: 200,
            reverse: true,
        }));
        // processLockedGame chama autoStartDraw sem await, mas executeStartDraw
        // é chamado síncrono na função — comprova que o jogo recente foi encontrado
        expect(mockStartDraw).toHaveBeenCalledWith('9999999998');
    });
});
