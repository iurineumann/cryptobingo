// Testes de integração para bug #457 — jogos DRAWN sem payout não detectados.
// Estratégia: mockar rpcClient.get_table_rows, acquireOrchestrationLock,
// orchestrateGame, e verificar que recoverStuckGames encontra e processa.

process.env.METRICS_PORT = '0';

const mockGetTableRows = jest.fn();
const mockAcquireLock = jest.fn().mockResolvedValue(true);
const mockOrchestrate = jest.fn().mockResolvedValue(undefined);
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: {
        v1: { chain: { get_table_rows: mockGetTableRows } },
    },
    fetchGame: jest.fn(),
}));

jest.mock('../gameLock', () => ({
    acquireOrchestrationLock: (...a: any[]) => mockAcquireLock(...a),
}));

jest.mock('../gameOrchestrator', () => ({
    orchestrateGame: (...a: any[]) => mockOrchestrate(...a),
}));

jest.mock('../prizeMetrics', () => ({
    prizePaymentsTotal: { inc: jest.fn() },
    prizeTxErrorsTotal: { inc: jest.fn() },
    prizeRtpRatio: { set: jest.fn() },
}));

jest.mock('../logger', () => ({
    logger: {
        info: (...a: any[]) => mockLoggerInfo(...a),
        error: (...a: any[]) => mockLoggerError(...a),
    },
}));

jest.mock('../metrics', () => {
    const m = () => ({ inc: jest.fn(), set: jest.fn(), startTimer: jest.fn() });
    return {
        autoAdvanceRunsTotal: m(), autoAdvanceErrorsTotal: m(),
        autoAdvanceGamesTotal: m(), eventsProcessedTotal: m(),
        eventsFailedTotal: m(), eventsDeadLetteredTotal: m(),
        workerQueuePublishedTotal: m(), payoutRecoveredTotal: m(),
        stateWatcherEventsReceived: m(), stateWatcherPublished: m(),
        stateWatcherErrors: m(), stateWatcherReconnections: m(),
        stateWatcherSourceChanges: m(), stateWatcherCursorPosition: m(),
        stateWatcherPublishLatency: m(),
    };
});

import { recoverStuckGames } from '../rabbitmq';

function makeDrawnGame(id: string, paid: number, qty: string): any {
    return {
        game_id: id, status: 'drawn', total_paid: paid,
        total_wagered: { quantity: qty, contract: 'eosio.token' },
        room_id: 10, gametype_id: 1,
        random_value: 'a000000000000000000000000000000000000000000000000000000000000000',
    };
}

function makeNonDrawn(id: string, st: string, qty = '25.0000 BINGO'): any {
    return {
        game_id: id, status: st, total_paid: 0,
        total_wagered: { quantity: qty, contract: 'bingogametkn' },
        room_id: 11, gametype_id: 2,
    };
}

describe('bug #457 — DRAWN sem payout', () => {
    beforeEach(() => { jest.clearAllMocks(); mockAcquireLock.mockResolvedValue(true); });

    it('drawn c/ total_paid=0 e wagered>0 → orchestrateGame', async () => {
        mockGetTableRows.mockResolvedValue({ rows: [makeDrawnGame('1785109670427', 0, '25.0000 BINGO')] });
        await recoverStuckGames();
        expect(mockLoggerInfo).toHaveBeenCalledWith({ tag: 'Recovery' }, expect.stringContaining('Recovery DRAWN scan:'));
        expect(mockLoggerInfo).toHaveBeenCalledWith({ tag: 'Recovery' }, expect.stringContaining('1785109670427'));
        expect(mockAcquireLock).toHaveBeenCalledWith('1785109670427');
        expect(mockOrchestrate).toHaveBeenCalledWith('1785109670427');
    });

    it('drawn c/ total_paid=0 e wagered=0 → ignorado', async () => {
        mockGetTableRows.mockResolvedValue({ rows: [makeDrawnGame('x', 0, '0.00000000 WAX')] });
        await recoverStuckGames();
        expect(mockAcquireLock).not.toHaveBeenCalled();
        expect(mockOrchestrate).not.toHaveBeenCalled();
    });

    it('drawn c/ total_paid>0 → ignorado', async () => {
        mockGetTableRows.mockResolvedValue({ rows: [makeDrawnGame('x', 90000, '25.0000 BINGO')] });
        await recoverStuckGames();
        expect(mockAcquireLock).not.toHaveBeenCalled();
        expect(mockOrchestrate).not.toHaveBeenCalled();
    });

    it('lock ocupado → não chama orchestrateGame', async () => {
        mockGetTableRows.mockResolvedValue({ rows: [makeDrawnGame('1785109670427', 0, '25.0000 BINGO')] });
        mockAcquireLock.mockResolvedValue(false);
        await recoverStuckGames();
        expect(mockAcquireLock).toHaveBeenCalledWith('1785109670427');
        expect(mockOrchestrate).not.toHaveBeenCalled();
    });

    it('só jogo drawn+unpaid é processado entre vários status', async () => {
        mockGetTableRows.mockResolvedValue({
            rows: [
                makeNonDrawn('g1', 'drawing'),
                makeDrawnGame('g2', 0, '25.0000 BINGO'),
                makeNonDrawn('g3', 'archived'),
            ],
        });
        await recoverStuckGames();
        expect(mockOrchestrate).toHaveBeenCalledTimes(1);
        expect(mockOrchestrate).toHaveBeenCalledWith('g2');
    });
});
