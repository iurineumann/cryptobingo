// Testes para lobbyController (Issue #268).
// Cobre: cache hit/miss, dados compartilhados, dados por jogador, edge cases.

import { Request, Response } from 'express';

jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_table_rows: jest.fn() } } },
}));

jest.mock('../database/redis', () => ({
    redisClient: {
        get:   jest.fn(async () => null),
        setEx: jest.fn(async () => 'OK'),
    },
}));

jest.mock('../models/RoomMetadata', () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));

import { rpcClient } from '@cryptobingo/blockchain-core';
import { redisClient } from '../database/redis';
import RoomMetadataModel from '../models/RoomMetadata';
import { getLobby, getLobbyMe } from './lobbyController';

const mockGetTableRows = rpcClient.v1.chain.get_table_rows as jest.Mock;
const mockRedisGet  = redisClient.get as jest.Mock;
const mockRedisSetEx = redisClient.setEx as jest.Mock;
const mockRoomFind = RoomMetadataModel.find as jest.Mock;

// ── Helpers ──────────────────────────────────────────────────────────────

function makeRes() {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res as Response;
}

function makeReq(overrides: Record<string, any> = {}): Request {
    return {
        params: {},
        query:  {},
        body:   {},
        user:   undefined,
        ...overrides,
    } as unknown as Request;
}

function mockGame(gameId: string, roomId: string, status: string) {
    return {
        game_id: gameId, room_id: roomId, status,
        ticket_price: { quantity: '5.0000 WAX', contract: 'eosio.token' },
        total_wagered: { quantity: '100.0000 WAX', contract: 'eosio.token' },
        gametype_id: '1', drawn_balls: [], end_time: 0, campaign_id: '0',
        sponsor_pool: [], golden_ball_num: 0, golden_multiplier: 0, total_paid: 0,
    };
}

function mockRoom(roomId: string) {
    return {
        room_id: roomId, sponsor: 'sponsor1', gametype_id: '1', status: 'active',
        ticket_price_min:     { quantity: '5.0000 WAX', contract: 'eosio.token' },
        ticket_price_max:     { quantity: '50.0000 WAX', contract: 'eosio.token' },
        ticket_price_default: { quantity: '10.0000 WAX', contract: 'eosio.token' },
        weight: '100', max_tickets_per_player: 10, current_game_id: '0',
        nft_template_allowlist: [], sponsor_room: false, created_at: Date.now() - 10000, paused_at: 0,
    };
}

function mockGametype(id: string, base_multiplier: number, rules: any[]) {
    return {
        gametype_id: id, name: `GT ${id}`, base_multiplier,
        rules, draw_mode: 'standard', max_balls: 0, golden_ball_after: 0,
        master_weight_ovrd: 0, stages: [],
    };
}

function mockBalance(quantity: string) {
    return { balance: { quantity, contract: 'eosio.token' } };
}

function mockTicket(ticketId: string) {
    return { ticket_id: ticketId, owner: 'player1', matrix: [], state: 4096, game_id: '100' };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSetEx.mockResolvedValue('OK');
});

// ── GET /api/v1/lobby ────────────────────────────────────────────────────

describe('getLobby', () => {
    it('[REG] retorna dados agregados com metadata', async () => {
        mockGetTableRows
            .mockImplementationOnce(async () => ({ rows: [mockGame('100', '1', 'funding')], more: false }))
            .mockImplementationOnce(async () => ({ rows: [mockRoom('1')], more: false }))
            .mockImplementationOnce(async () => ({ rows: [mockGametype('1', 100, [{ weight: 500 }])], more: false }));

        mockRoomFind.mockReturnValue({
            lean: jest.fn().mockResolvedValue([{ room_id: '1', name: 'Sala Teste' }]),
        });

        const res = makeRes();
        await getLobby(makeReq(), res);

        expect(res.status).toHaveBeenCalledWith(200);
        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.games).toHaveLength(1);
        expect(body.rooms).toHaveLength(1);
        expect(body.gametypes).toHaveLength(1);
        expect(body.rooms[0].metadata).toBeDefined();
        expect(body.rooms[0].metadata.name).toBe('Sala Teste');
    });

    it('[REG] cache hit: retorna sem chamar RPC', async () => {
        const cached = JSON.stringify({ games: [], rooms: [], gametypes: [] });
        mockRedisGet.mockResolvedValue(cached);

        const res = makeRes();
        await getLobby(makeReq(), res);

        expect(mockGetTableRows).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('[REG] sala sem metadata → metadata: null', async () => {
        mockGetTableRows
            .mockImplementationOnce(async () => ({ rows: [mockGame('100', '1', 'funding')], more: false }))
            .mockImplementationOnce(async () => ({ rows: [mockRoom('1')], more: false }))
            .mockImplementationOnce(async () => ({ rows: [mockGametype('1', 100, [])], more: false }));

        mockRoomFind.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

        const res = makeRes();
        await getLobby(makeReq(), res);

        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.rooms[0].metadata).toBeNull();
    });

    it('[REG] salva cache apos cache miss', async () => {
        mockGetTableRows
            .mockImplementationOnce(async () => ({ rows: [], more: false }))
            .mockImplementationOnce(async () => ({ rows: [], more: false }))
            .mockImplementationOnce(async () => ({ rows: [], more: false }));

        mockRoomFind.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

        const res = makeRes();
        await getLobby(makeReq(), res);

        expect(mockRedisSetEx).toHaveBeenCalledWith(
            'lobby:shared', 2, expect.any(String),
        );
    });

    it('[REG] blockchain down → 503', async () => {
        mockGetTableRows.mockRejectedValue(new Error('Connection refused'));

        const res = makeRes();
        await getLobby(makeReq(), res);

        expect(res.status).toHaveBeenCalledWith(503);
    });
});

// ── GET /api/v1/lobby/me ─────────────────────────────────────────────────

describe('getLobbyMe', () => {
    function setupHappyPath() {
        mockGetTableRows
            .mockImplementationOnce(async () => ({ rows: [mockBalance('100.0000 WAX')], more: false }))
            .mockImplementationOnce(async () => ({ rows: [
                mockGame('100', '1', 'funding'),
                mockGame('101', '1', 'archived'),
            ], more: false }))
            .mockImplementationOnce(async () => ({ rows: [mockTicket('1'), mockTicket('2')], more: false }))
            .mockImplementationOnce(async () => ({ rows: [mockTicket('3')], more: false }));
    }

    it('[REG] retorna dados do jogador', async () => {
        setupHappyPath();

        const req = makeReq({ user: { wallet: 'player1' } });
        const res = makeRes();
        await getLobbyMe(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.balances).toHaveLength(1);
        expect(body.myTickets).toEqual({ '1': 2 });
        expect(body.playerRoomIds).toContain('1');
    });

    it('[REG] sem auth → 401', async () => {
        const res = makeRes();
        await getLobbyMe(makeReq(), res);

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('[REG] cache hit: retorna sem chamar RPC', async () => {
        mockRedisGet.mockResolvedValue(JSON.stringify({
            balances: [], myTickets: {}, playerRoomIds: [],
        }));

        const req = makeReq({ user: { wallet: 'player1' } });
        const res = makeRes();
        await getLobbyMe(req, res);

        expect(mockGetTableRows).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('[REG] usa cache key por wallet lowercase', async () => {
        mockGetTableRows
            .mockImplementationOnce(async () => ({ rows: [], more: false }))
            .mockImplementationOnce(async () => ({ rows: [], more: false }));

        const req = makeReq({ user: { wallet: 'Player1' } }); // uppercase
        const res = makeRes();
        await getLobbyMe(req, res);

        expect(mockRedisSetEx).toHaveBeenCalledWith(
            'lobby:me:player1', 2, expect.any(String),
        );
    });

    it('[REG] sem funding games → myTickets vazio', async () => {
        mockGetTableRows
            .mockImplementationOnce(async () => ({ rows: [], more: false }))
            .mockImplementationOnce(async () => ({ rows: [
                mockGame('102', '2', 'archived'),
            ], more: false }));

        const req = makeReq({ user: { wallet: 'player1' } });
        const res = makeRes();
        await getLobbyMe(req, res);

        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.myTickets).toEqual({});
    });

    it('[REG] blockchain down → 503', async () => {
        mockGetTableRows.mockRejectedValue(new Error('RPC timeout'));

        const req = makeReq({ user: { wallet: 'player1' } });
        const res = makeRes();
        await getLobbyMe(req, res);

        expect(res.status).toHaveBeenCalledWith(503);
    });
});
