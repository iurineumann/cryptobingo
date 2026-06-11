// Testes do leaderboardController — rankings globais e por sala. Ref: ADR-024.
// Estratégia: mockar pgPool, Redis e UserProfile; testar cache, filtros e validações.

const mockPgQuery    = jest.fn();
const mockRedisGet   = jest.fn();
const mockRedisSetEx = jest.fn();
const mockMongoFind  = jest.fn();

jest.mock('../database', () => ({
    pgPool: { query: mockPgQuery },
}));

jest.mock('../database/redis', () => ({
    redisClient: {
        get:   mockRedisGet,
        setEx: mockRedisSetEx,
    },
}));

jest.mock('../models/UserProfile', () => ({
    UserProfile: {
        find: (..._args: any[]) => ({ lean: mockMongoFind }),
    },
}));

import express from 'express';
import request from 'supertest';
import { getLeaderboardGlobal, getLeaderboardByRoom } from './leaderboardController';

function makeApp() {
    const app = express();
    app.use(express.json());
    app.get('/leaderboard',            getLeaderboardGlobal);
    app.get('/leaderboard/rooms/:roomId', getLeaderboardByRoom);
    return app;
}

const LEDGER_ROWS = [
    { wallet_address: 'alice.wam',  total_won: '500.0000', currency: 'WAX', games_won: '5' },
    { wallet_address: 'bob.wam',    total_won: '300.0000', currency: 'WAX', games_won: '3' },
    { wallet_address: 'charlie.wam', total_won: '100.0000', currency: 'WAX', games_won: '1' },
];

const PROFILES = [
    { wallet_address: 'alice.wam', nickname: 'Alice' },
];

// ── getLeaderboardGlobal ──────────────────────────────────────────────────────

describe('getLeaderboardGlobal', () => {
    beforeEach(() => jest.clearAllMocks());

    it('serve do cache Redis quando hit', async () => {
        const cached = { entries: [{ rank: 1, wallet: 'alice.wam' }], cached_at: '2026-01-01T00:00:00Z', currency_filter: null };
        mockRedisGet.mockResolvedValue(JSON.stringify(cached));

        const res = await request(makeApp()).get('/leaderboard');

        expect(res.status).toBe(200);
        expect(res.body.entries[0].wallet).toBe('alice.wam');
        expect(mockPgQuery).not.toHaveBeenCalled();
    });

    it('consulta PG e enriquece com nicknames quando cache miss', async () => {
        mockRedisGet.mockResolvedValue(null);
        mockPgQuery.mockResolvedValue({ rows: LEDGER_ROWS });
        mockMongoFind.mockResolvedValue(PROFILES);
        mockRedisSetEx.mockResolvedValue('OK');

        const res = await request(makeApp()).get('/leaderboard');

        expect(res.status).toBe(200);
        expect(res.body.entries).toHaveLength(3);
        expect(res.body.entries[0]).toMatchObject({
            rank:      1,
            wallet:    'alice.wam',
            nickname:  'Alice',
            total_won: 500,
            currency:  'WAX',
            games_won: 5,
        });
        // Bob sem nickname → null
        expect(res.body.entries[1].nickname).toBeNull();
        expect(mockRedisSetEx).toHaveBeenCalled();
    });

    it('filtra por currency quando parâmetro informado', async () => {
        mockRedisGet.mockResolvedValue(null);
        mockPgQuery.mockResolvedValue({ rows: [] });
        mockMongoFind.mockResolvedValue([]);

        await request(makeApp()).get('/leaderboard?currency=BINGO');

        expect(mockPgQuery).toHaveBeenCalledWith(
            expect.stringContaining('tl.currency = $'),
            expect.arrayContaining(['BINGO']),
        );
    });

    it('limita resultados com parâmetro limit (máx 50)', async () => {
        mockRedisGet.mockResolvedValue(null);
        mockPgQuery.mockResolvedValue({ rows: [] });
        mockMongoFind.mockResolvedValue([]);

        await request(makeApp()).get('/leaderboard?limit=999');

        // limit deve ser clampado a 50
        expect(mockPgQuery).toHaveBeenCalledWith(
            expect.any(String),
            expect.arrayContaining([50]),
        );
    });

    it('fail-open: Redis indisponível não bloqueia a requisição', async () => {
        mockRedisGet.mockRejectedValue(new Error('Redis down'));
        mockPgQuery.mockResolvedValue({ rows: LEDGER_ROWS });
        mockMongoFind.mockResolvedValue(PROFILES);
        mockRedisSetEx.mockRejectedValue(new Error('Redis down'));

        const res = await request(makeApp()).get('/leaderboard');

        expect(res.status).toBe(200);
    });

    it('500 quando PG lança exceção', async () => {
        mockRedisGet.mockResolvedValue(null);
        mockPgQuery.mockRejectedValue(new Error('PG down'));

        const res = await request(makeApp()).get('/leaderboard');

        expect(res.status).toBe(500);
    });
});

// ── getLeaderboardByRoom ──────────────────────────────────────────────────────

describe('getLeaderboardByRoom', () => {
    beforeEach(() => jest.clearAllMocks());

    it('400 para roomId não numérico', async () => {
        const res = await request(makeApp()).get('/leaderboard/rooms/abc');

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/roomId/i);
    });

    it('200 com entries vazia quando sala sem histórico', async () => {
        mockRedisGet.mockResolvedValue(null);
        mockPgQuery.mockResolvedValue({ rows: [] });

        const res = await request(makeApp()).get('/leaderboard/rooms/42');

        expect(res.status).toBe(200);
        expect(res.body.entries).toEqual([]);
        expect(res.body.room_id).toBe('42');
    });

    it('filtra por sala via LIKE no memo', async () => {
        mockRedisGet.mockResolvedValue(null);
        mockPgQuery.mockResolvedValue({ rows: LEDGER_ROWS });
        mockMongoFind.mockResolvedValue([]);
        mockRedisSetEx.mockResolvedValue('OK');

        await request(makeApp()).get('/leaderboard/rooms/7');

        expect(mockPgQuery).toHaveBeenCalledWith(
            expect.stringContaining('memo LIKE'),
            expect.arrayContaining(['room:7:%']),
        );
    });

    it('adiciona room_id em cada entry', async () => {
        mockRedisGet.mockResolvedValue(null);
        mockPgQuery.mockResolvedValue({ rows: [LEDGER_ROWS[0]] });
        mockMongoFind.mockResolvedValue([]);
        mockRedisSetEx.mockResolvedValue('OK');

        const res = await request(makeApp()).get('/leaderboard/rooms/3');

        expect(res.body.entries[0].room_id).toBe('3');
    });

    it('serve do cache Redis quando hit', async () => {
        const cached = { room_id: '5', entries: [{ rank: 1, wallet: 'alice.wam' }], cached_at: '2026-01-01T00:00:00Z' };
        mockRedisGet.mockResolvedValue(JSON.stringify(cached));

        const res = await request(makeApp()).get('/leaderboard/rooms/5');

        expect(res.status).toBe(200);
        expect(res.body.room_id).toBe('5');
        expect(mockPgQuery).not.toHaveBeenCalled();
    });
});
