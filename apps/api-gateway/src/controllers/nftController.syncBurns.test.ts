process.env.JWT_SECRET            = 'test-secret-32chars-xxxxxxxxxx!!';
process.env.CONTRACT_ACCOUNT      = 'bingogamectr';
process.env.MICROSERVICE_ACTOR    = 'bingogamesvc';
process.env.CHAIN_ID              = '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';
process.env.RPC_URL               = 'http://localhost:8888';
process.env.MICROSERVICE_PRIVATE_KEY = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3';

const mockGetTableRows = jest.fn();
const mockTransact     = jest.fn();

jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_table_rows: mockGetTableRows } } },
}));
jest.mock('@wharfkit/session', () => ({
    Session: jest.fn().mockImplementation(() => ({
        permissionLevel: { actor: 'bingogamesvc', permission: 'active' },
        transact: mockTransact,
    })),
}));
jest.mock('@wharfkit/wallet-plugin-privatekey', () => ({
    WalletPluginPrivateKey: jest.fn(),
}));
jest.mock('../models/UserProfile', () => ({ UserProfile: {} }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { syncBurns } from './nftController';

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
        const auth = req.headers.authorization;
        if (auth?.startsWith('Bearer '))
            try { req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as any; } catch { /* sem user */ }
        next();
    });
    app.post('/nfts/sync-burns', syncBurns);
    return app;
}

const TOKEN = jwt.sign({ wallet: 'jogador1', jti: 'x' }, process.env.JWT_SECRET!, { expiresIn: '1h' });

// ── Nenhum template BURN_TO_CLAIM configurado ─────────────────────────────────

describe('syncBurns — sem templates BURN_TO_CLAIM', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // nftconfigs sem regra tipo 4
        mockGetTableRows.mockResolvedValue({ rows: [], more: false });
    });

    it('retorna 200 com recorded=0', async () => {
        const res = await request(makeApp())
            .post('/nfts/sync-burns')
            .set('Authorization', `Bearer ${TOKEN}`);
        expect(res.status).toBe(200);
        expect(res.body.recorded).toBe(0);
    });

    it('não chama transact', async () => {
        await request(makeApp())
            .post('/nfts/sync-burns')
            .set('Authorization', `Bearer ${TOKEN}`);
        expect(mockTransact).not.toHaveBeenCalled();
    });
});

// ── Assets já registrados (idempotência) ──────────────────────────────────────

describe('syncBurns — asset já registrado on-chain', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetTableRows
            // nftconfigs: 1 template BURN_TO_CLAIM (tipo 4)
            .mockResolvedValueOnce({ rows: [{ template_id: 999, collection_name: 'cryptobingo1', rules: [{ type: 4 }] }], more: false })
            // nftburns por owner: asset 111 já registrado
            .mockResolvedValueOnce({ rows: [{ asset_id: '111', owner: 'jogador1' }] })
            // atomicassets::assets do jogador: tem o asset 111
            .mockResolvedValueOnce({ rows: [{ asset_id: '111', template_id: '999', collection_name: 'cryptobingo1' }], more: false, next_key: null });
    });

    it('retorna recorded=1 sem chamar transact (idempotente)', async () => {
        const res = await request(makeApp())
            .post('/nfts/sync-burns')
            .set('Authorization', `Bearer ${TOKEN}`);
        expect(res.status).toBe(200);
        expect(res.body.recorded).toBe(0); // já registrado — nada novo
        expect(mockTransact).not.toHaveBeenCalled();
    });
});

// ── Novo burn detectado ───────────────────────────────────────────────────────

describe('syncBurns — asset queimado detectado', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockTransact.mockResolvedValue({ response: { transaction_id: 'tx-abc' } });
        mockGetTableRows
            // nftconfigs: template 999 com BURN_TO_CLAIM
            .mockResolvedValueOnce({ rows: [{ template_id: 999, collection_name: 'cryptobingo1', rules: [{ type: 4 }] }], more: false })
            // nftburns: asset 222 não registrado
            .mockResolvedValueOnce({ rows: [] })
            // atomicassets: jogador possui asset 222 do template 999
            .mockResolvedValueOnce({ rows: [{ asset_id: '222', template_id: '999', collection_name: 'cryptobingo1' }], more: false, next_key: null });
    });

    it('chama recordburn e retorna recorded=1', async () => {
        const res = await request(makeApp())
            .post('/nfts/sync-burns')
            .set('Authorization', `Bearer ${TOKEN}`);
        expect(res.status).toBe(200);
        expect(res.body.recorded).toBe(1);
        expect(res.body.asset_ids).toContain('222');
        expect(mockTransact).toHaveBeenCalledTimes(1);
    });

    it('action recordburn usa wallet do JWT (não param externo)', async () => {
        await request(makeApp())
            .post('/nfts/sync-burns')
            .set('Authorization', `Bearer ${TOKEN}`);
        const call = mockTransact.mock.calls[0][0];
        expect(call.actions[0].data.owner).toBe('jogador1');
    });
});

// ── Falha on-chain retornada ao cliente ───────────────────────────────────────

describe('syncBurns — falha real no recordburn', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockTransact.mockRejectedValue(new Error('eosio_assert falhou'));
        mockGetTableRows
            .mockResolvedValueOnce({ rows: [{ template_id: 999, collection_name: 'cryptobingo1', rules: [{ type: 4 }] }], more: false })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ asset_id: '333', template_id: '999', collection_name: 'cryptobingo1' }], more: false, next_key: null });
    });

    it('retorna 502 com failed[] populado', async () => {
        const res = await request(makeApp())
            .post('/nfts/sync-burns')
            .set('Authorization', `Bearer ${TOKEN}`);
        expect(res.status).toBe(502);
        expect(res.body.failed).toContain('333');
        expect(res.body.recorded).toBe(0);
    });
});
