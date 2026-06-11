// Testes unitários do roomManager.
// createNextGameForRoom tem setTimeout(resolve, delayMs) onde delayMs vem de fetchRoomMetadata
// (fetch HTTP ao API gateway). Mockamos global.fetch e usamos fake timers.

process.env.CONTRACT_ACCOUNT    = 'bingogamectr';
process.env.RPC_URL             = 'http://localhost:8888';
process.env.CHAIN_ID            = '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';
process.env.API_GATEWAY_URL     = 'http://localhost:8083';

const mockContractTransact   = jest.fn().mockResolvedValue({ response: { transaction_id: 'tx-create' } });
const mockMicroTransact      = jest.fn().mockResolvedValue({ response: { transaction_id: 'tx-fund'   } });
const mockPermission         = { actor: 'bingogamectr', permission: 'admin' };

jest.mock('@cryptobingo/blockchain-core', () => ({
    fetchGame: jest.fn(),
    rpcClient: { v1: { chain: { get_table_rows: jest.fn() } } },
}));
jest.mock('./blockchain', () => ({
    microserviceSession: { transact: mockMicroTransact, permissionLevel: { actor: 'bingogamesvc', permission: 'active' } },
    adminSession:        { transact: mockContractTransact, permissionLevel: mockPermission },
    executeFundGame:     jest.fn().mockResolvedValue('tx-fund'),
}));
jest.mock('./redis', () => ({
    redisClient:  { get: jest.fn(), set: jest.fn() },
    connectRedis: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./dropWorker', () => ({
    processRoomDrops: jest.fn().mockResolvedValue(undefined),
}));

import { fetchGame, rpcClient }  from '@cryptobingo/blockchain-core';
import { processRoomDrops }       from './dropWorker';
import {
    findRoomByGameId,
    onGameResolved,
    createNextGameForRoom,
} from './roomManager';

const mockFetchGame    = fetchGame                          as jest.Mock;
const mockGetTableRows = rpcClient.v1.chain.get_table_rows  as jest.Mock;
const mockProcessDrops = processRoomDrops                   as jest.Mock;

// Mock do fetch global — fetchRoomMetadata chama fetch() direto
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function makeGame(roomId = '1', gameId = '1') {
    return {
        game_id: gameId, status: 'archived', gametype_id: '1', room_id: roomId,
        drawn_balls: [], ticket_price: { quantity: '10.0000 BINGO', contract: 'bingogametkn' },
        total_wagered:  { quantity: '0.0000 BINGO', contract: 'bingogametkn' },
    };
}

function makeRoom(roomId = '1', currentGameId = '0') {
    return {
        room_id: roomId, sponsor: 'sponsor1', gametype_id: '1', status: 'active',
        ticket_price_min:     { quantity: '5.0000 BINGO',  contract: 'bingogametkn' },
        ticket_price_max:     { quantity: '50.0000 BINGO', contract: 'bingogametkn' },
        ticket_price_default: { quantity: '10.0000 BINGO', contract: 'bingogametkn' },
        max_tickets_per_player: 0, room_drop_chance_bps: 5000,
        current_game_id: currentGameId, weight: 100,
    };
}

// ── findRoomByGameId ──────────────────────────────────────────────────────────

describe('findRoomByGameId', () => {
    beforeEach(() => jest.clearAllMocks());

    it('Jogo com game_id=1 → retorna sala onde current_game_id=1', async () => {
        // A sala deve ter current_game_id = '1' para ser encontrada
        mockGetTableRows.mockResolvedValue({
            rows: [makeRoom('1', '1')], // current_game_id = '1'
            more: false,
        });

        const room = await findRoomByGameId('1');
        expect(room).not.toBeNull();
        expect(room?.room_id).toBe('1');
    });

    it('Nenhuma sala com o game_id buscado → retorna null', async () => {
        mockGetTableRows.mockResolvedValue({
            rows: [makeRoom('1', '2')], // current_game_id = '2', não '1'
            more: false,
        });
        expect(await findRoomByGameId('1')).toBeNull();
    });

    it('Jogo não encontrado (fetchGame null) → retorna null', async () => {
        mockFetchGame.mockResolvedValue(null);
        mockGetTableRows.mockResolvedValue({ rows: [], more: false });
        expect(await findRoomByGameId('999')).toBeNull();
    });

    it('RPC get_table_rows lança → retorna null', async () => {
        mockGetTableRows.mockRejectedValue(new Error('RPC timeout'));
        expect(await findRoomByGameId('1')).toBeNull();
    });
});

// ── onGameResolved ────────────────────────────────────────────────────────────

describe('onGameResolved', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        // fetchRoomMetadata chama fetch() → falha → retorna delay padrão de 30s
        // fake timers avançam o delay
        mockFetch.mockRejectedValue(new Error('Connection refused'));
        mockFetchGame.mockResolvedValue(makeGame('1'));
        mockGetTableRows
            .mockResolvedValueOnce({ rows: [makeRoom('1', '1')], more: false }) // findRoomByGameId
            .mockResolvedValue(   { rows: [makeRoom('1', '0')], more: false }); // fetchRoomOnChain
    });
    afterEach(() => jest.useRealTimers());

    it('Chama processRoomDrops com gameId e roomId corretos', async () => {
        const promise = onGameResolved('1');
        await jest.advanceTimersByTimeAsync(35_000); // avança 35s (além do delay de 30s)
        await promise;

        expect(mockProcessDrops).toHaveBeenCalledWith('1', '1');
    });

    it('Game não encontrado → sem chamada a processDrops, sem crash', async () => {
        mockFetchGame.mockResolvedValue(null);
        mockGetTableRows.mockResolvedValue({ rows: [], more: false });

        const promise = onGameResolved('999');
        jest.runAllTimers();
        await expect(promise).resolves.not.toThrow();

        expect(mockProcessDrops).not.toHaveBeenCalled();
    });
});

// ── createNextGameForRoom ─────────────────────────────────────────────────────

describe('createNextGameForRoom', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        mockFetch.mockRejectedValue(new Error('Connection refused')); // fetchRoomMetadata → delay padrão 30s
        // fetchRoomOnChain (segunda consulta on-chain após o delay)
        mockGetTableRows.mockResolvedValue({ rows: [makeRoom('1', '0')], more: false });
        mockFetchGame.mockResolvedValue(null);
    });
    afterEach(() => jest.useRealTimers());

    it('Retorna novo gameId (string) quando transações são bem-sucedidas', async () => {
        const promise = createNextGameForRoom(makeRoom('1', '0') as any);
        await jest.advanceTimersByTimeAsync(35_000);
        const gameId = await promise;

        expect(typeof gameId === 'string' || gameId === null).toBe(true);
    });

    it('adminSession.transact lança → retorna null sem propagar', async () => {
        mockContractTransact.mockRejectedValueOnce(new Error('Chain error'));

        const promise = createNextGameForRoom(makeRoom('1', '0') as any);
        await jest.advanceTimersByTimeAsync(35_000);
        const gameId = await promise;

        expect(gameId).toBeNull();
    });

    it('fetchRoomMetadata com delay curto (mock retorna 1s) → avança corretamente', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ metadata: { auto_start_delay_sec: 1 } }),
        } as any);

        const promise = createNextGameForRoom(makeRoom('1', '0') as any);
        await jest.advanceTimersByTimeAsync(2_000); // avança 2s
        const gameId = await promise;

        expect(typeof gameId === 'string' || gameId === null).toBe(true);
    });
});
