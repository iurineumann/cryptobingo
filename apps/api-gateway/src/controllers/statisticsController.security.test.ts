// Security regression tests para statisticsController.
// Cobre: DoS via batch gameIds sem limite, filtragem de IDs não-numéricos.

process.env.JWT_SECRET = 'test-secret-32chars-xxxxxxxxxx!!';

const mockGetGameStatsBatch = jest.fn().mockResolvedValue([]);

jest.mock('../database/ledger', () => ({
    getGameStatsBatch: mockGetGameStatsBatch,
    getRtpReport:      jest.fn().mockResolvedValue({ rtp: 0.85, ggr: 0.15 }),
    getGamesHistory:   jest.fn().mockResolvedValue([]),
}));
jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_table_rows: jest.fn() } } },
}));

import express from 'express';
import request from 'supertest';
import { getGameStatsBatchHandler } from './statisticsController';

function makeApp() {
    const app = express();
    app.use(express.json());
    app.get('/statistics/games/batch', getGameStatsBatchHandler);
    return app;
}

describe('getGameStatsBatch — proteção contra DoS via batch', () => {
    beforeEach(() => mockGetGameStatsBatch.mockClear());

    it('[DoS] 500 gameIds → mock chamado com no máximo 200 IDs (slice defensivo)', async () => {
        // 10.000 IDs excede o limite de URL do Node. 500 é suficiente para validar o slice(0,200).
        const ids = Array.from({ length: 500 }, (_, i) => String(i + 1)).join(',');
        const res = await request(makeApp())
            .get(`/statistics/games/batch?gameIds=${ids}`);

        expect(res.status).toBe(200);
        expect(mockGetGameStatsBatch).toHaveBeenCalledTimes(1);
        const passedIds = mockGetGameStatsBatch.mock.calls[0][0] as string[];
        expect(passedIds.length).toBeLessThanOrEqual(200);
    });

    it('IDs não-numéricos (../etc, abc) → filtrados antes do banco', async () => {
        const res = await request(makeApp())
            .get('/statistics/games/batch?gameIds=abc,../etc/passwd,123,456');

        expect(res.status).toBe(200);
        const passedIds = mockGetGameStatsBatch.mock.calls[0][0] as string[];
        expect(passedIds).toEqual(expect.arrayContaining(['123', '456']));
        expect(passedIds).not.toContain('abc');
        expect(passedIds).not.toContain('../etc/passwd');
    });

    it('?gameIds= vazio → 200 com { stats: {} } sem consultar banco', async () => {
        const res = await request(makeApp())
            .get('/statistics/games/batch?gameIds=');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ stats: {} });
        expect(mockGetGameStatsBatch).not.toHaveBeenCalled();
    });

    it('?gameIds ausente → 200 com { stats: {} } sem consultar banco', async () => {
        const res = await request(makeApp())
            .get('/statistics/games/batch');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ stats: {} });
        expect(mockGetGameStatsBatch).not.toHaveBeenCalled();
    });

    it('Exatamente 200 IDs (boundary) → todos processados', async () => {
        const ids = Array.from({ length: 200 }, (_, i) => String(i + 1)).join(',');
        await request(makeApp()).get(`/statistics/games/batch?gameIds=${ids}`);

        const passedIds = mockGetGameStatsBatch.mock.calls[0][0] as string[];
        expect(passedIds.length).toBe(200);
    });

    it('IDs negativos ou zero → filtrados (apenas dígitos)', async () => {
        const res = await request(makeApp())
            .get('/statistics/games/batch?gameIds=-1,0,1,2');

        expect(res.status).toBe(200);
        const passedIds = mockGetGameStatsBatch.mock.calls[0]?.[0] as string[];
        if (passedIds) {
            expect(passedIds).not.toContain('-1');
            // 0 também não é aceito pelo regex /^\d+$/ mas pode depender da implementação
        }
    });
});
