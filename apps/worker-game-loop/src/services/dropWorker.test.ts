import { randomInt, fisherYatesShuffle, hasSufficientBalance } from './dropWorker';

jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_table_rows: jest.fn() } } },
}));
jest.mock('./blockchain', () => ({
    microserviceSession: { transact: jest.fn(), permissionLevel: { actor: 'test', permission: 'active' } },
}));
jest.mock('./broadcaster', () => ({
    io: { of: jest.fn(() => ({ to: jest.fn(() => ({ emit: jest.fn() })) })) },
}));
jest.mock('./redis', () => ({
    redisClient: { set: jest.fn().mockResolvedValue('OK'), isOpen: true },
}));
jest.mock('pg', () => {
    const mPool = { query: jest.fn(), connect: jest.fn() };
    return { Pool: jest.fn(() => mPool) };
});

describe('randomInt', () => {
    it('retorna número entre 0 e max-1', () => {
        for (let i = 0; i < 100; i++) {
            const n = randomInt(10);
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThan(10);
        }
    });

    it('retorna 0 quando max=1', () => {
        expect(randomInt(1)).toBe(0);
    });
});

describe('fisherYatesShuffle', () => {
    it('retorna array com mesmo comprimento', () => {
        const arr = [1, 2, 3, 4, 5];
        const shuffled = fisherYatesShuffle(arr);
        expect(shuffled.length).toBe(arr.length);
    });

    it('não modifica o array original', () => {
        const arr = [1, 2, 3, 4, 5];
        const copy = [...arr];
        fisherYatesShuffle(arr);
        expect(arr).toEqual(copy);
    });

    it('contém os mesmos elementos após shuffle', () => {
        const arr = [1, 2, 3, 4, 5];
        const shuffled = fisherYatesShuffle(arr);
        expect(shuffled.sort()).toEqual(arr.sort());
    });

    it('retorna array vazio para entrada vazia', () => {
        expect(fisherYatesShuffle([])).toEqual([]);
    });

    it('retorna array de 1 elemento inalterado', () => {
        expect(fisherYatesShuffle([42])).toEqual([42]);
    });
});

describe('hasSufficientBalance', () => {
    const baseAlloc = {
        alloc_id: '1', deposit_id: '1', owner: 'test', room_id: '1',
        asset_type: 'token', token_contract: 'eosio.token', token_symbol: 'WAX',
        quantity_per_drop: { quantity: '10.0000 WAX', contract: 'eosio.token' },
        quantity_distributed: { quantity: '0.0000 WAX', contract: 'eosio.token' },
        nft_asset_id: '', nft_template_id: 0, nft_collection: '',
        drop_chance_bps: 5000, drops_executed: 0, status: 'active', allocated_at: 0,
    };

    it('retorna true quando saldo é suficiente', () => {
        const dep = {
            deposit_id: '1', owner: 'test', asset_type: 'token',
            quantity_remaining: { quantity: '100.0000 WAX', contract: 'eosio.token' },
            status: 'deposited',
        };
        expect(hasSufficientBalance(dep, baseAlloc)).toBe(true);
    });

    it('retorna false quando saldo é insuficiente', () => {
        const dep = {
            deposit_id: '1', owner: 'test', asset_type: 'token',
            quantity_remaining: { quantity: '5.0000 WAX', contract: 'eosio.token' },
            status: 'deposited',
        };
        expect(hasSufficientBalance(dep, baseAlloc)).toBe(false);
    });

    it('retorna true quando saldo é exatamente igual', () => {
        const dep = {
            deposit_id: '1', owner: 'test', asset_type: 'token',
            quantity_remaining: { quantity: '10.0000 WAX', contract: 'eosio.token' },
            status: 'deposited',
        };
        expect(hasSufficientBalance(dep, baseAlloc)).toBe(true);
    });

    it('retorna false para quantity malformatada (parse 0)', () => {
        const dep = {
            deposit_id: '1', owner: 'test', asset_type: 'token',
            quantity_remaining: { quantity: '0.0000 WAX', contract: 'eosio.token' },
            status: 'deposited',
        };
        expect(hasSufficientBalance(dep, baseAlloc)).toBe(false);
    });
});
