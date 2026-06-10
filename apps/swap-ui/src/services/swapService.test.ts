// apps/swap-ui/src/services/swapService.test.ts
// Testes unitários do swapService do bingo.swap DEX.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch antes dos imports
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
    fetchSwapPools,
    fetchSwapQuote,
    fetchTokenBalance,
    fetchUserLpPositions,
    fetchPendingDeposits,
} from './swapService';

// ─── Fixtures ────────────────────────────────

const POOL: import('@cryptobingo/shared-types').SwapPoolSummary = {
    pool_id:         1,
    token_a:         { contract: 'bingo.token', symbol: '4,BINGO', precision: 4 },
    token_b:         { contract: 'eosio.token', symbol: '8,WAX',   precision: 8 },
    reserve_a:       1_000_000_0000,
    reserve_b:         500_000_00000000,
    fee_bps:         30,
    service_fee_bps: 50,
};

const QUOTE: import('@cryptobingo/shared-types').SwapQuote = {
    quote_id:          'q-abc',
    pool_id:           1,
    from_contract:     'bingo.token',
    from_symbol:       '4,BINGO',
    to_contract:       'eosio.token',
    to_symbol:         '8,WAX',
    amount_in:         12500,
    amount_in_display: '1.2500 BINGO',
    amount_out:        100_000_000,
    min_out:           99_500_000,
    fee_bps:           30,
    service_fee_bps:   50,
    price_impact_pct:  0.01,
    expires_at:        9_999_999_999,
};

function ok(body: unknown) {
    return Promise.resolve({
        ok:   true,
        json: () => Promise.resolve(body),
    } as Response);
}

function fail(status: number, body: unknown) {
    return Promise.resolve({
        ok:   false,
        status,
        json: () => Promise.resolve(body),
    } as Response);
}

beforeEach(() => mockFetch.mockReset());

// ─── fetchSwapPools ───────────────────────────

describe('fetchSwapPools', () => {
    it('retorna lista de pools', async () => {
        mockFetch.mockReturnValueOnce(ok({ pools: [POOL] }));
        const pools = await fetchSwapPools();
        expect(pools).toHaveLength(1);
        expect(pools[0].pool_id).toBe(1);
    });

    it('lança erro em resposta HTTP não-ok', async () => {
        mockFetch.mockReturnValueOnce(fail(502, { error: 'nodeos off' }));
        await expect(fetchSwapPools()).rejects.toThrow('nodeos off');
    });

    it('chama /api/v1/swap/pools', async () => {
        mockFetch.mockReturnValueOnce(ok({ pools: [] }));
        await fetchSwapPools();
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/swap/pools'));
    });
});

// ─── fetchSwapQuote ───────────────────────────

describe('fetchSwapQuote', () => {
    it('retorna cotação válida', async () => {
        mockFetch.mockReturnValueOnce(ok(QUOTE));
        const q = await fetchSwapQuote({
            fromContract: 'bingo.token',
            fromSymbol:   '4,BINGO',
            toContract:   'eosio.token',
            toSymbol:     '8,WAX',
            amountOut:    '100000000',
        });
        expect(q.amount_in_display).toBe('1.2500 BINGO');
        expect(q.min_out).toBe(99_500_000);
    });

    it('lança erro 404 (pool não encontrado)', async () => {
        mockFetch.mockReturnValueOnce(fail(404, { error: 'pool not found' }));
        await expect(fetchSwapQuote({
            fromContract: 'x', fromSymbol: '4,X',
            toContract:   'y', toSymbol:   '4,Y',
            amountOut:    '100',
        })).rejects.toThrow('pool not found');
    });

    it('inclui parâmetros na query string', async () => {
        mockFetch.mockReturnValueOnce(ok(QUOTE));
        await fetchSwapQuote({
            fromContract: 'bingo.token',
            fromSymbol:   '4,BINGO',
            toContract:   'eosio.token',
            toSymbol:     '8,WAX',
            amountOut:    '500000000',
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('from_contract=bingo.token');
        expect(url).toContain('amount_out=500000000');
    });
});

// ─── fetchTokenBalance ────────────────────────

describe('fetchTokenBalance', () => {
    it('retorna saldo em unidades mínimas', async () => {
        mockFetch.mockReturnValueOnce(ok({
            rows: [{ balance: '10.0000 BINGO' }],
        }));
        const bal = await fetchTokenBalance('user.wax', 'bingo.token', 'BINGO');
        expect(bal).toBe(100000n);
    });

    it('retorna 0n quando conta sem saldo', async () => {
        mockFetch.mockReturnValueOnce(ok({ rows: [] }));
        const bal = await fetchTokenBalance('user.wax', 'bingo.token', 'BINGO');
        expect(bal).toBe(0n);
    });

    it('retorna 0n em caso de erro de rede', async () => {
        mockFetch.mockRejectedValueOnce(new Error('network error'));
        const bal = await fetchTokenBalance('user.wax', 'bingo.token', 'BINGO');
        expect(bal).toBe(0n);
    });

    it('lida com saldo WAX de 8 casas decimais', async () => {
        mockFetch.mockReturnValueOnce(ok({
            rows: [{ balance: '2.50000000 WAX' }],
        }));
        const bal = await fetchTokenBalance('user.wax', 'eosio.token', 'WAX');
        expect(bal).toBe(250000000n);
    });
});

// ─── fetchUserLpPositions ─────────────────────

describe('fetchUserLpPositions', () => {
    it('retorna posições LP do usuário', async () => {
        mockFetch.mockReturnValueOnce(ok({
            rows: [{ pool_id: 1, lp_amount: '50.0000 BINLP1' }],
        }));
        const pos = await fetchUserLpPositions('user.wax');
        expect(pos).toHaveLength(1);
        expect(pos[0].pool_id).toBe(1);
        expect(pos[0].lp_amount).toBe(500000n);
        expect(pos[0].lp_symbol).toBe('BINLP1');
    });

    it('retorna [] em caso de erro', async () => {
        mockFetch.mockRejectedValueOnce(new Error('rpc'));
        const pos = await fetchUserLpPositions('user.wax');
        expect(pos).toEqual([]);
    });
});

// ─── fetchPendingDeposits ─────────────────────

describe('fetchPendingDeposits', () => {
    it('retorna depósitos pendentes', async () => {
        mockFetch.mockReturnValueOnce(ok({
            rows: [{ pool_id: 1, depositor: 'user.wax', amount_a: '10.0000 BINGO', amount_b: '5.00000000 WAX' }],
        }));
        const deps = await fetchPendingDeposits('user.wax');
        expect(deps).toHaveLength(1);
        expect(deps[0].pool_id).toBe(1);
    });

    it('retorna [] em caso de erro', async () => {
        mockFetch.mockRejectedValueOnce(new Error('rpc'));
        const deps = await fetchPendingDeposits('user.wax');
        expect(deps).toEqual([]);
    });
});
