// Testes funcionais do statisticsController.

process.env.JWT_SECRET       = 'test-secret-32chars-xxxxxxxxxx!!';
process.env.CONTRACT_ACCOUNT = 'bingogamectr';
process.env.RPC_URL          = 'http://localhost:8888';
process.env.CHAIN_ID         = '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';

const mockGetRtpReport    = jest.fn();
const mockGetRecentGames  = jest.fn();
const mockUpsertHistory   = jest.fn();
const mockGetStatsBatch   = jest.fn();

jest.mock('../database/ledger', () => ({
    getRtpReport:    mockGetRtpReport,
    getRecentGames:  mockGetRecentGames,
    upsertGameHistory: mockUpsertHistory,
    getGameStatsBatch: mockGetStatsBatch,
}));
jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_table_rows: jest.fn() } } },
}));

import express from 'express';
import request from 'supertest';
import { rpcClient } from '@cryptobingo/blockchain-core';
import {
    getRtpStatistics,
    getGamesHistory,
    getGameStatsBatchHandler,
    syncGameToLedger,
} from './statisticsController';

const mockGetTableRows = rpcClient.v1.chain.get_table_rows as jest.Mock;

function makeApp() {
    const app = express();
    app.use(express.json());
    app.get('/statistics/rtp',             getRtpStatistics);
    app.get('/statistics/games',           getGamesHistory);
    app.get('/statistics/games/batch',     getGameStatsBatchHandler);
    app.post('/statistics/ledger/sync',    syncGameToLedger);
    return app;
}

// ── getRtpStatistics ──────────────────────────────────────────────────────────

describe('getRtpStatistics', () => {
    beforeEach(() => jest.clearAllMocks());

    it('?days=30 → getRtpReport(30, "WAX") chamado', async () => {
        mockGetRtpReport.mockResolvedValue({ rtp: 0.85, ggr: 0.15 });

        await request(makeApp()).get('/statistics/rtp?days=30');

        expect(mockGetRtpReport).toHaveBeenCalledWith(30, 'WAX');
    });

    it('?days=500 → clampado para 365', async () => {
        mockGetRtpReport.mockResolvedValue({ rtp: 0.85 });

        await request(makeApp()).get('/statistics/rtp?days=500');

        const calledDays = mockGetRtpReport.mock.calls[0][0];
        expect(calledDays).toBeLessThanOrEqual(365);
    });

    it('?currency=BINGO → passado ao getRtpReport', async () => {
        mockGetRtpReport.mockResolvedValue({ rtp: 0.8 });

        await request(makeApp()).get('/statistics/rtp?currency=bingo');

        expect(mockGetRtpReport).toHaveBeenCalledWith(expect.any(Number), 'BINGO');
    });

    it('getRtpReport lança → 500', async () => {
        mockGetRtpReport.mockRejectedValue(new Error('DB error'));

        const res = await request(makeApp()).get('/statistics/rtp');

        expect(res.status).toBe(500);
    });
});

// ── getGamesHistory ───────────────────────────────────────────────────────────

describe('getGamesHistory', () => {
    beforeEach(() => jest.clearAllMocks());

    it('?limit=10 → getRecentGames(10) chamado', async () => {
        mockGetRecentGames.mockResolvedValue([]);

        await request(makeApp()).get('/statistics/games?limit=10');

        expect(mockGetRecentGames).toHaveBeenCalledWith(10);
    });

    it('?limit=200 → clampado para 100', async () => {
        mockGetRecentGames.mockResolvedValue([]);

        await request(makeApp()).get('/statistics/games?limit=200');

        const calledLimit = mockGetRecentGames.mock.calls[0][0];
        expect(calledLimit).toBeLessThanOrEqual(100);
    });

    it('Retorna { games, count }', async () => {
        const games = [{ game_id: '1' }, { game_id: '2' }];
        mockGetRecentGames.mockResolvedValue(games);

        const res = await request(makeApp()).get('/statistics/games');

        expect(res.status).toBe(200);
        expect(res.body.games).toHaveLength(2);
        expect(res.body.count).toBe(2);
    });
});

// ── syncGameToLedger ──────────────────────────────────────────────────────────

describe('syncGameToLedger', () => {
    beforeEach(() => jest.clearAllMocks());

    it('gameId ausente → 400', async () => {
        const res = await request(makeApp())
            .post('/statistics/ledger/sync')
            .send({});

        expect(res.status).toBe(400);
    });

    it('Jogo não encontrado on-chain → 404', async () => {
        mockGetTableRows.mockResolvedValue({ rows: [], more: false });

        const res = await request(makeApp())
            .post('/statistics/ledger/sync')
            .send({ gameId: '999' });

        expect(res.status).toBe(404);
    });

    it('Sucesso → upsertGameHistory chamado + 200', async () => {
        mockGetTableRows.mockResolvedValue({
            rows: [{
                game_id: '1', status: 'archived', gametype_id: '0',
                ticket_price: { quantity: '10.0000 BINGO', contract: 'bingogametkn' },
                total_wagered:   { quantity: '80.0000 BINGO', contract: 'bingogametkn' },
                drawn_balls: [],
            }],
            more: false,
        });
        mockUpsertHistory.mockResolvedValue(undefined);

        const res = await request(makeApp())
            .post('/statistics/ledger/sync')
            .send({ gameId: '1' });

        expect(res.status).toBe(200);
        expect(mockUpsertHistory).toHaveBeenCalled();
    });

    it('RPC lança → 500', async () => {
        mockGetTableRows.mockRejectedValue(new Error('RPC error'));

        const res = await request(makeApp())
            .post('/statistics/ledger/sync')
            .send({ gameId: '1' });

        expect(res.status).toBe(500);
    });
});
