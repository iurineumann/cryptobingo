import type { BlockchainGameState } from '@cryptobingo/shared-types';

// Mutable reference compartilhado entre beforeEach e testes.
// jest.doMock não é hoisted, então não há TDZ.
let mockClients: Array<{ get_table_rows: jest.Mock }>;

// ── Types & Helpers ───────────────────────────────────────

type ClientModule = {
    fetchGame: (gameId: string) => Promise<BlockchainGameState | null>;
    invalidateGameCache: (gameId: string) => void;
    clearGameCache: () => void;
    rpcClient: any;
};

function loadClient(): ClientModule {
    return require('../client');
}

// ── Setup ─────────────────────────────────────────────────

beforeEach(() => {
    mockClients = [];
    jest.resetModules();
    jest.doMock('@wharfkit/antelope', () => {
        const instances: Array<{ get_table_rows: jest.Mock }> = [];
        mockClients = instances;
        return {
            APIClient: jest.fn(() => {
                const client = { get_table_rows: jest.fn() };
                instances.push(client);
                return {
                    v1: { chain: { get_table_rows: client.get_table_rows } },
                };
            }),
            UInt64: { from: jest.fn((v: string) => v) },
            Name: { from: jest.fn(() => ({ value: 0n })) },
        };
    });
    process.env.RPC_URL = 'http://primary:8888';
    process.env.RPC_URLS = 'http://fallback1:8888,http://fallback2:8888';
    delete process.env.FETCH_GAME_CACHE_TTL_MS;
});

// ── Fixtures ──────────────────────────────────────────────

function makeGameRow(overrides: Record<string, any> = {}) {
    return {
        id: '42',
        status: 'LOCKED',
        drawn_balls: '0a1b2c',
        created_at: 1000,
        game_type: 1,
        room_id: 1,
        stage: 0,
        ...overrides,
    };
}

// ── Testes ────────────────────────────────────────────────

describe('fetchGame', () => {

    test('Fallback multi-RPC: endpoint[0] falha, endpoint[1] retorna sucesso', async () => {
        const client = loadClient();

        mockClients[0].get_table_rows.mockRejectedValue(new Error('RPC primário indisponível'));
        mockClients[1].get_table_rows.mockResolvedValue({ rows: [makeGameRow()] });

        const result = await client.fetchGame('42');

        expect(result).not.toBeNull();
        expect(result!.id).toBe('42');
        expect(result!.status).toBe('LOCKED');
        expect(mockClients[0].get_table_rows).toHaveBeenCalledTimes(1);
        expect(mockClients[1].get_table_rows).toHaveBeenCalledTimes(1);
    });

    test('Cache hit: 2 chamadas, get_table_rows chamado 1x', async () => {
        const client = loadClient();
        mockClients[0].get_table_rows.mockResolvedValue({ rows: [makeGameRow()] });

        const r1 = await client.fetchGame('42');
        const r2 = await client.fetchGame('42');

        expect(r1).not.toBeNull();
        expect(r2).not.toBeNull();
        expect(r1!.id).toBe('42');
        expect(r2!.id).toBe('42');
        expect(mockClients[0].get_table_rows).toHaveBeenCalledTimes(1);
    });

    test('Cache invalidação: invalidateGameCache força novo fetch', async () => {
        const client = loadClient();
        mockClients[0].get_table_rows.mockResolvedValue({ rows: [makeGameRow()] });

        await client.fetchGame('42');
        client.invalidateGameCache('42');
        mockClients[0].get_table_rows.mockClear();
        await client.fetchGame('42');

        expect(mockClients[0].get_table_rows).toHaveBeenCalledTimes(1);
    });

    test('Cache TTL expirado: espera expirar, novo fetch', async () => {
        process.env.FETCH_GAME_CACHE_TTL_MS = '1';
        const client = loadClient();
        mockClients[0].get_table_rows.mockResolvedValue({ rows: [makeGameRow()] });

        await client.fetchGame('42');
        await new Promise(r => setTimeout(r, 10));
        mockClients[0].get_table_rows.mockClear();
        await client.fetchGame('42');

        expect(mockClients[0].get_table_rows).toHaveBeenCalledTimes(1);
    });

    test('Retorno null quando tabela vazia', async () => {
        const client = loadClient();
        mockClients[0].get_table_rows.mockResolvedValue({ rows: [] });

        const result = await client.fetchGame('inexistente');

        expect(result).toBeNull();
        expect(mockClients[0].get_table_rows).toHaveBeenCalledTimes(1);
    });

    test('Erro quando todos endpoints falham', async () => {
        const client = loadClient();
        mockClients[0].get_table_rows.mockRejectedValue(new Error('RPC 1 down'));
        mockClients[1].get_table_rows.mockRejectedValue(new Error('RPC 2 down'));
        mockClients[2].get_table_rows.mockRejectedValue(new Error('RPC 3 down'));

        await expect(client.fetchGame('42')).rejects.toThrow();
        expect(mockClients[0].get_table_rows).toHaveBeenCalledTimes(1);
        expect(mockClients[1].get_table_rows).toHaveBeenCalledTimes(1);
        expect(mockClients[2].get_table_rows).toHaveBeenCalledTimes(1);
    });

    test('drawn_balls convertido de hex para number[]', async () => {
        const client = loadClient();
        mockClients[0].get_table_rows.mockResolvedValue({
            rows: [makeGameRow({ drawn_balls: '0a1b2c' })],
        });

        const result = await client.fetchGame('42');

        expect(result).not.toBeNull();
        expect(result!.drawn_balls).toEqual([10, 27, 44]);
    });

    test('clearGameCache limpa todo o cache', async () => {
        const client = loadClient();
        mockClients[0].get_table_rows.mockResolvedValue({ rows: [makeGameRow()] });

        await client.fetchGame('42');
        client.clearGameCache();
        mockClients[0].get_table_rows.mockClear();
        await client.fetchGame('42');

        expect(mockClients[0].get_table_rows).toHaveBeenCalledTimes(1);
    });

});
