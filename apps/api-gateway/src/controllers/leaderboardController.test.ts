// Testes unitários para leaderboardController (ADR-024).
// Cobre: cache hit, cache miss, filtragem, limites, enriquecimento com nickname, XP ranking.

import { Request, Response } from 'express';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../database', () => ({
    pgPool: { query: jest.fn() },
}));

jest.mock('../database/redis', () => ({
    redisClient: {
        get:   jest.fn(async () => null),
        setEx: jest.fn(async () => 'OK'),
        keys:  jest.fn(async () => []),
        del:   jest.fn(async () => 0),
    },
}));

jest.mock('../models/UserProfile', () => ({
    UserProfile: { find: jest.fn() },
}));

import { pgPool }                    from '../database';
import { redisClient }               from '../database/redis';
import { UserProfile }               from '../models/UserProfile';
import { getLeaderboardGlobal, getLeaderboardByRoom, getLeaderboardXp }
    from './leaderboardController';

const mockQuery       = pgPool.query         as jest.Mock;
const mockRedisGet    = redisClient.get       as jest.Mock;
const mockRedisSetEx  = redisClient.setEx     as jest.Mock;
const mockUserFind    = UserProfile.find      as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res as Response;
}

function makeReq(
    params:  Record<string, string> = {},
    query:   Record<string, string> = {},
): Request {
    return { params, query, body: {} } as unknown as Request;
}

const LEDGER_ROW = {
    wallet_address: 'alice.wam',
    total_won:      '100.5',
    currency:       'WAX',
    games_won:      '3',
};

const PROFILE = { wallet_address: 'alice.wam', nickname: 'Alice' };

function mockDbWithRows(rows: any[]) {
    mockQuery.mockResolvedValue({ rows });
    mockUserFind.mockReturnValue({
        lean: jest.fn(async () =>
            rows.map(r => ({ wallet_address: r.wallet_address, nickname: null }))
        ),
    });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSetEx.mockResolvedValue('OK');
});

// ── GET /api/v1/leaderboard ──────────────────────────────────────────────────

describe('getLeaderboardGlobal', () => {
    it('[REG] retorna entries enriquecidas com nickname', async () => {
        mockQuery.mockResolvedValue({ rows: [LEDGER_ROW] });
        mockUserFind.mockReturnValue({ lean: jest.fn(async () => [PROFILE]) });

        const req = makeReq({}, {});
        const res = makeRes();
        await getLeaderboardGlobal(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.entries).toHaveLength(1);
        expect(body.entries[0]).toMatchObject({ rank: 1, wallet: 'alice.wam', nickname: 'Alice', total_won: 100.5 });
    });

    it('[REG] cache hit: retorna payload sem chamar pgPool', async () => {
        const cached = JSON.stringify({ entries: [], cached_at: '2026-01-01T00:00:00Z', currency_filter: null });
        mockRedisGet.mockResolvedValue(cached);

        const res = makeRes();
        await getLeaderboardGlobal(makeReq(), res);

        expect(mockQuery).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('[REG] respeita ?limit=5 (máx 50)', async () => {
        mockDbWithRows([LEDGER_ROW]);
        const res = makeRes();
        await getLeaderboardGlobal(makeReq({}, { limit: '5' }), res);

        const sql: string = mockQuery.mock.calls[0][0];
        expect(sql).toMatch(/LIMIT/i);
        const params: any[] = mockQuery.mock.calls[0][1];
        expect(params[0]).toBe(5);
    });

    it('[REG] limita ?limit a máximo 50', async () => {
        mockDbWithRows([]);
        const res = makeRes();
        await getLeaderboardGlobal(makeReq({}, { limit: '999' }), res);

        const params: any[] = mockQuery.mock.calls[0][1];
        expect(params[0]).toBe(50);
    });

    it('[REG] filtra por ?currency=WAX', async () => {
        mockDbWithRows([LEDGER_ROW]);
        const res = makeRes();
        await getLeaderboardGlobal(makeReq({}, { currency: 'WAX' }), res);

        const sql: string = mockQuery.mock.calls[0][0];
        expect(sql).toMatch(/currency/i);
        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.currency_filter).toBe('WAX');
    });

    it('[REG] retorna 500 se pgPool falhar', async () => {
        mockQuery.mockRejectedValue(new Error('DB error'));
        const res = makeRes();
        await getLeaderboardGlobal(makeReq(), res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('[REG] salva resultado no Redis após cache miss', async () => {
        mockDbWithRows([LEDGER_ROW]);
        const res = makeRes();
        await getLeaderboardGlobal(makeReq(), res);
        expect(mockRedisSetEx).toHaveBeenCalled();
    });

    it('[REG] wallet sem nickname exibe null', async () => {
        mockQuery.mockResolvedValue({ rows: [LEDGER_ROW] });
        mockUserFind.mockReturnValue({ lean: jest.fn(async () => []) }); // sem perfil

        const res = makeRes();
        await getLeaderboardGlobal(makeReq(), res);
        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.entries[0].nickname).toBeNull();
    });
});

// ── GET /api/v1/leaderboard/rooms/:roomId ────────────────────────────────────

describe('getLeaderboardByRoom', () => {
    it('[REG] retorna entries da sala', async () => {
        mockQuery.mockResolvedValue({ rows: [LEDGER_ROW] });
        mockUserFind.mockReturnValue({ lean: jest.fn(async () => [PROFILE]) });

        const res = makeRes();
        await getLeaderboardByRoom(makeReq({ roomId: '1' }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.room_id).toBe('1');
        expect(body.entries[0].room_id).toBe('1');
    });

    it('[REG] sala sem histórico retorna entries vazio (não 404)', async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        const res = makeRes();
        await getLeaderboardByRoom(makeReq({ roomId: '99' }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.entries).toEqual([]);
    });

    it('[SEC] roomId não-numérico retorna 400', async () => {
        const res = makeRes();
        await getLeaderboardByRoom(makeReq({ roomId: 'abc' }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('[REG] cache hit: não chama pgPool', async () => {
        mockRedisGet.mockResolvedValue(JSON.stringify({ room_id: '1', entries: [], cached_at: '' }));
        const res = makeRes();
        await getLeaderboardByRoom(makeReq({ roomId: '1' }), res);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('[REG] limita ?limit a máximo 20', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        const res = makeRes();
        await getLeaderboardByRoom(makeReq({ roomId: '1' }, { limit: '999' }), res);
        const params: any[] = mockQuery.mock.calls[0][1];
        expect(params[0]).toBe(20);
    });
});

// ── GET /api/v1/leaderboard/xp ───────────────────────────────────────────────

describe('getLeaderboardXp', () => {
    it('[REG] retorna ranking XP ordenado', async () => {
        mockUserFind.mockReturnValue({
            sort:  jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean:  jest.fn(async () => [
                { wallet_address: 'bob.wam', nickname: 'Bob', progression: { xp: 5000, tier: 'Ouro', level: 10, games_played: 20 } },
                { wallet_address: 'alice.wam', nickname: null, progression: { xp: 3000, tier: 'Prata', level: 7, games_played: 12 } },
            ]),
        });

        const res = makeRes();
        await getLeaderboardXp(makeReq(), res);

        expect(res.status).toHaveBeenCalledWith(200);
        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.entries).toHaveLength(2);
        expect(body.entries[0]).toMatchObject({ rank: 1, wallet: 'bob.wam', xp: 5000, tier: 'Ouro' });
        expect(body.entries[1]).toMatchObject({ rank: 2, wallet: 'alice.wam', xp: 3000 });
    });

    it('[REG] cache hit: não chama MongoDB', async () => {
        mockRedisGet.mockResolvedValue(JSON.stringify({ entries: [], cached_at: '' }));
        const res = makeRes();
        await getLeaderboardXp(makeReq(), res);
        expect(mockUserFind).not.toHaveBeenCalled();
    });

    it('[REG] retorna 500 se MongoDB falhar', async () => {
        mockUserFind.mockReturnValue({
            sort:  jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean:  jest.fn(async () => { throw new Error('Mongo down'); }),
        });
        const res = makeRes();
        await getLeaderboardXp(makeReq(), res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('[REG] limita ?limit a máximo 50', async () => {
        mockUserFind.mockReturnValue({
            sort:  jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean:  jest.fn(async () => []),
        });
        const res = makeRes();
        await getLeaderboardXp(makeReq({}, { limit: '200' }), res);
        // limit(N) chamado com no máximo 50
        const limitCall = (mockUserFind().limit as jest.Mock).mock.calls[0][0];
        expect(limitCall).toBe(50);
    });
});
