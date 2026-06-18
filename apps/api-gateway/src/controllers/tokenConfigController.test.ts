process.env.JWT_SECRET       = 'test-secret-32chars-xxxxxxxxxx!!';
process.env.CONTRACT_ACCOUNT = 'bingogamectr';
process.env.CHAIN_ID         = '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';
process.env.RPC_URL          = 'http://localhost:8888';

jest.mock('../models/SystemToken', () => {
    const tokens: any[] = [];
    const create  = jest.fn(async (data: any) => {
        const existing = tokens.find(t => t.contract === data.contract && t.symbol === data.symbol);
        if (existing) { const e: any = new Error('dup'); e.code = 11000; throw e; }
        const doc = { ...data, _id: `id-${tokens.length}`, enabled: true };
        tokens.push(doc);
        return doc;
    });
    const findByIdAndDelete = jest.fn(async (id: string) => {
        const idx = tokens.findIndex(t => t._id === id);
        if (idx < 0) return null;
        return tokens.splice(idx, 1)[0];
    });
    const find = jest.fn((_filter?: any) => ({
        sort: () => ({ lean: async () => tokens.filter(t => t.enabled) }),
    }));
    return {
        __esModule: true,
        default: { find, create, findByIdAndDelete },
        __tokens: tokens,
        __reset: () => tokens.splice(0),
    };
});

import express from 'express';
import request from 'supertest';
import { listTokens, createToken, deleteToken } from './tokenConfigController';

function makeApp() {
    const app = express();
    app.use(express.json());
    app.get('/tokens',       listTokens);
    app.post('/tokens',      createToken);
    app.delete('/tokens/:id', deleteToken);
    return app;
}

beforeEach(() => {
    jest.resetModules();
    const mod = require('../models/SystemToken');
    mod.__reset?.();
    jest.clearAllMocks();
});

// ── listTokens ────────────────────────────────────────────────────────────────

describe('listTokens', () => {
    it('retorna 200 com array tokens', async () => {
        const res = await request(makeApp()).get('/tokens');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.tokens)).toBe(true);
    });
});

// ── createToken ───────────────────────────────────────────────────────────────

describe('createToken', () => {
    it('cria token com campos válidos → 201', async () => {
        const res = await request(makeApp())
            .post('/tokens')
            .send({ contract: 'eosio.token', symbol: 'WAX', precision: 8, label: 'WAX', is_native: true });
        expect(res.status).toBe(201);
        expect(res.body.token.symbol).toBe('WAX');
    });

    it('falta contract → 400', async () => {
        const res = await request(makeApp())
            .post('/tokens')
            .send({ symbol: 'WAX', precision: 8, label: 'WAX' });
        expect(res.status).toBe(400);
    });

    it('falta symbol → 400', async () => {
        const res = await request(makeApp())
            .post('/tokens')
            .send({ contract: 'eosio.token', precision: 8, label: 'WAX' });
        expect(res.status).toBe(400);
    });

    it('falta label → 400', async () => {
        const res = await request(makeApp())
            .post('/tokens')
            .send({ contract: 'eosio.token', symbol: 'WAX', precision: 8 });
        expect(res.status).toBe(400);
    });

    it('precision < 0 → 400', async () => {
        const res = await request(makeApp())
            .post('/tokens')
            .send({ contract: 'eosio.token', symbol: 'WAX', precision: -1, label: 'WAX' });
        expect(res.status).toBe(400);
    });

    it('precision > 18 → 400', async () => {
        const res = await request(makeApp())
            .post('/tokens')
            .send({ contract: 'eosio.token', symbol: 'WAX', precision: 19, label: 'WAX' });
        expect(res.status).toBe(400);
    });

    it('duplicado (contract+symbol) → 409', async () => {
        const app = makeApp();
        await request(app).post('/tokens').send({ contract: 'eosio.token', symbol: 'WAX', precision: 8, label: 'WAX' });
        const res = await request(app).post('/tokens').send({ contract: 'eosio.token', symbol: 'WAX', precision: 8, label: 'WAX2' });
        expect(res.status).toBe(409);
    });
});

// ── deleteToken ───────────────────────────────────────────────────────────────

describe('deleteToken', () => {
    it('ID inválido (não ObjectId) → 400', async () => {
        const res = await request(makeApp()).delete('/tokens/nao-e-object-id');
        expect(res.status).toBe(400);
    });

    it('ID ObjectId válido mas inexistente → 404', async () => {
        const res = await request(makeApp()).delete('/tokens/507f1f77bcf86cd799439011');
        expect(res.status).toBe(404);
    });
});
