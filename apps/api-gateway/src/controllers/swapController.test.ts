// Testes do swapController — ADR-021 Checkout Multi-Moeda

process.env.SWAP_CONTRACT = 'bingo.swap';

const mockRedisGet = jest.fn().mockResolvedValue(null);
const mockRedisSet = jest.fn().mockResolvedValue('OK');

jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_table_rows: jest.fn() } } },
}));
jest.mock('../database/redis', () => ({
    redisClient: { get: mockRedisGet, set: mockRedisSet },
}));

import express from 'express';
import request from 'supertest';
import { rpcClient } from '@cryptobingo/blockchain-core';
import { listSwapPools, getSwapQuote } from './swapController';

const mockGetTableRows = rpcClient.v1.chain.get_table_rows as jest.Mock;

const POOL_WAX_BINGO = {
    pool_id:         '1',
    sym_a:           { sym: '4,BINGO', contract: 'bingo.token' },
    sym_b:           { sym: '8,WAX',   contract: 'eosio.token' },
    reserve_a:       '1000000000',  // 100000.0000 BINGO
    reserve_b:       '500000000',   // 5.00000000 WAX (escala 8 dec)
    lp_supply:       '700000000',
    fee_bps:         30,
    service_fee_bps: 100,
};

function makeApp() {
    const app = express();
    app.use(express.json());
    app.get('/api/v1/swap/pools', listSwapPools);
    app.get('/api/v1/swap/quote', getSwapQuote);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
});

describe('GET /api/v1/swap/pools', () => {
    it('retorna lista de pools formatada', async () => {
        mockGetTableRows.mockResolvedValue({ rows: [POOL_WAX_BINGO] });

        const res = await request(makeApp()).get('/api/v1/swap/pools');

        expect(res.status).toBe(200);
        expect(res.body.pools).toHaveLength(1);
        expect(res.body.pools[0]).toMatchObject({
            pool_id:         '1',
            token_a:         { contract: 'bingo.token', symbol: 'BINGO', precision: 4 },
            token_b:         { contract: 'eosio.token', symbol: 'WAX',   precision: 8 },
            fee_bps:         30,
            service_fee_bps: 100,
        });
    });

    it('retorna do cache Redis quando disponível', async () => {
        mockRedisGet.mockResolvedValue(JSON.stringify([POOL_WAX_BINGO]));

        const res = await request(makeApp()).get('/api/v1/swap/pools');

        expect(res.status).toBe(200);
        expect(mockGetTableRows).not.toHaveBeenCalled();
    });

    it('retorna 502 se nodeos falhar', async () => {
        mockGetTableRows.mockRejectedValue(new Error('nodeos offline'));

        const res = await request(makeApp()).get('/api/v1/swap/pools');

        expect(res.status).toBe(502);
    });
});

describe('GET /api/v1/swap/quote', () => {
    beforeEach(() => {
        mockGetTableRows.mockResolvedValue({ rows: [POOL_WAX_BINGO] });
    });

    it('retorna 400 se parâmetros obrigatórios ausentes', async () => {
        const res = await request(makeApp())
            .get('/api/v1/swap/quote?from_contract=bingo.token&from_symbol=4,BINGO');

        expect(res.status).toBe(400);
    });

    it('calcula amount_in para BINGO→WAX com fee dupla', async () => {
        // Queremos 1.00000000 WAX = 100000000 unidades
        const res = await request(makeApp())
            .get('/api/v1/swap/quote')
            .query({
                from_contract: 'bingo.token',
                from_symbol:   '4,BINGO',
                to_contract:   'eosio.token',
                to_symbol:     '8,WAX',
                amount_out:    '100000000',
            });

        expect(res.status).toBe(200);
        const quote = res.body;
        expect(quote.pool_id).toBe('1');
        expect(BigInt(quote.amount_in)).toBeGreaterThan(0n);
        expect(quote.amount_out).toBe('100000000');
        expect(quote.fee_bps).toBe(30);
        expect(quote.service_fee_bps).toBe(100);
        expect(quote.price_impact_pct).toBeGreaterThan(0);
        expect(quote.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
        expect(quote.quote_id).toBeTruthy();
    });

    it('min_out é ~0.5% menor que amount_out', async () => {
        const res = await request(makeApp())
            .get('/api/v1/swap/quote')
            .query({
                from_contract: 'bingo.token',
                from_symbol:   '4,BINGO',
                to_contract:   'eosio.token',
                to_symbol:     '8,WAX',
                amount_out:    '100000000',
            });

        expect(res.status).toBe(200);
        const minOut = BigInt(res.body.min_out);
        const out    = BigInt(res.body.amount_out);
        // min_out deve ser ~99.5% de amount_out (arredondado para baixo)
        expect(minOut).toBe((out * 9950n) / 10000n);
    });

    it('TTL respeita janela de funding restante', async () => {
        const nowSec     = Math.floor(Date.now() / 1000);
        const gameEndIn  = nowSec + 15; // funding fecha em 15s

        const res = await request(makeApp())
            .get('/api/v1/swap/quote')
            .query({
                from_contract: 'bingo.token',
                from_symbol:   '4,BINGO',
                to_contract:   'eosio.token',
                to_symbol:     '8,WAX',
                amount_out:    '100000000',
                game_end_time: String(gameEndIn),
            });

        expect(res.status).toBe(200);
        // expires_at deve ser <= nowSec + 10 (15 - 5s buffer)
        expect(res.body.expires_at).toBeLessThanOrEqual(nowSec + 11);
    });

    it('retorna 404 para par sem pool', async () => {
        const res = await request(makeApp())
            .get('/api/v1/swap/quote')
            .query({
                from_contract: 'fake.token',
                from_symbol:   '4,FAKE',
                to_contract:   'eosio.token',
                to_symbol:     '8,WAX',
                amount_out:    '100000000',
            });

        expect(res.status).toBe(404);
    });

    it('retorna 422 para amount_out maior que reserva', async () => {
        const res = await request(makeApp())
            .get('/api/v1/swap/quote')
            .query({
                from_contract: 'bingo.token',
                from_symbol:   '4,BINGO',
                to_contract:   'eosio.token',
                to_symbol:     '8,WAX',
                amount_out:    '999999999999', // maior que reserve_b
            });

        expect(res.status).toBe(422);
    });

    it('aceita par na ordem inversa (WAX→BINGO)', async () => {
        const res = await request(makeApp())
            .get('/api/v1/swap/quote')
            .query({
                from_contract: 'eosio.token',
                from_symbol:   '8,WAX',
                to_contract:   'bingo.token',
                to_symbol:     '4,BINGO',
                amount_out:    '100000',  // 10.0000 BINGO
            });

        expect(res.status).toBe(200);
        expect(BigInt(res.body.amount_in)).toBeGreaterThan(0n);
    });
});
