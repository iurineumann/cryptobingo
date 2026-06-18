// Security regression tests para profileController.
// Cobre: verifyProfileSignature (replay, chave inválida, modo dev/prod),
// updatePreferences BOLA (wallet do JWT, nunca de body), campos sensíveis sem sig.

process.env.JWT_SECRET       = 'test-secret-32chars-xxxxxxxxxx!!';
process.env.CONTRACT_ACCOUNT = 'bingogamectr';
process.env.CHAIN_ID         = '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';
process.env.RPC_URL          = 'http://localhost:8888';

const mockGetAccount   = jest.fn();
const mockFindOneUpdate = jest.fn();

jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_account: mockGetAccount } } },
}));
jest.mock('../models/UserProfile', () => ({
    __esModule: true,
    default: {
        findOneAndUpdate: mockFindOneUpdate,
        findOne: jest.fn(),
    },
    UserProfile: {},
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrivateKey, Checksum256 } from '@wharfkit/antelope';
import { updatePreferences } from './profileController';

const TEST_KEY    = PrivateKey.generate('K1');
const TEST_PUBKEY = TEST_KEY.toPublic().toString();

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
        const auth = req.headers.authorization;
        if (auth?.startsWith('Bearer '))
            try { req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as any; } catch { /* sem user */ }
        next();
    });
    app.put('/profile', updatePreferences);
    return app;
}

function makeToken(wallet: string) {
    return jwt.sign({ wallet, jti: 'x' }, process.env.JWT_SECRET!, { expiresIn: '1h' });
}

function signPayload(wallet: string, ts: number, bodyJson: string): string {
    const payload = `UPDATE_PROFILE:${wallet}:${ts}:${bodyJson}`;
    const digest  = Checksum256.hash(Buffer.from(payload, 'utf-8'));
    return TEST_KEY.signDigest(digest).toString();
}

function mockAccountWithKey() {
    mockGetAccount.mockResolvedValue({
        permissions: [{
            perm_name: 'active',
            required_auth: { keys: [{ key: TEST_PUBKEY }] },
        }],
    });
}

// ── Campos sensíveis exigem WAX signature ─────────────────────────────────────

describe('updatePreferences — campos sensíveis sem assinatura', () => {
    beforeEach(() => jest.clearAllMocks());

    it('nickname sem signature → 400', async () => {
        const res = await request(makeApp())
            .put('/profile')
            .set('Authorization', `Bearer ${makeToken('jogador1')}`)
            .send({ nickname: 'novo' });
        expect(res.status).toBe(400);
    });

    it('avatar_nft_asset_id sem signature → 400', async () => {
        const res = await request(makeApp())
            .put('/profile')
            .set('Authorization', `Bearer ${makeToken('jogador1')}`)
            .send({ avatar_nft_asset_id: '12345' });
        expect(res.status).toBe(400);
    });

    it('locale sem signature → aceito (campo não-sensível)', async () => {
        mockFindOneUpdate.mockResolvedValue({ wallet_address: 'jogador1', preferences: { locale: 'en-US' } });
        const res = await request(makeApp())
            .put('/profile')
            .set('Authorization', `Bearer ${makeToken('jogador1')}`)
            .send({ locale: 'en-US' });
        expect(res.status).toBe(200);
    });
});

// ── verifyProfileSignature — modo digest (dev) ────────────────────────────────

describe('updatePreferences — WAX signature modo dev (digest)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFindOneUpdate.mockResolvedValue({ wallet_address: 'jogador1', nickname: 'novo' });
        mockAccountWithKey();
    });

    it('assinatura válida → 200', async () => {
        const ts       = Date.now();
        const bodyJson = JSON.stringify({ nickname: 'novo' });
        const sig      = signPayload('jogador1', ts, bodyJson);

        const res = await request(makeApp())
            .put('/profile')
            .set('Authorization', `Bearer ${makeToken('jogador1')}`)
            .send({ nickname: 'novo', signature: sig, ts });
        expect(res.status).toBe(200);
    });

    it('assinatura de chave diferente → 401', async () => {
        const otherKey = PrivateKey.generate('K1');
        const ts       = Date.now();
        const bodyJson = JSON.stringify({ nickname: 'hack' });
        const payload  = `UPDATE_PROFILE:jogador1:${ts}:${bodyJson}`;
        const digest   = Checksum256.hash(Buffer.from(payload, 'utf-8'));
        const sig      = otherKey.signDigest(digest).toString();

        const res = await request(makeApp())
            .put('/profile')
            .set('Authorization', `Bearer ${makeToken('jogador1')}`)
            .send({ nickname: 'hack', signature: sig, ts });
        expect(res.status).toBe(401);
    });

    it('ts expirado (> 5 min) → 401', async () => {
        const ts       = Date.now() - 6 * 60 * 1000;
        const bodyJson = JSON.stringify({ nickname: 'antigo' });
        const sig      = signPayload('jogador1', ts, bodyJson);

        const res = await request(makeApp())
            .put('/profile')
            .set('Authorization', `Bearer ${makeToken('jogador1')}`)
            .send({ nickname: 'antigo', signature: sig, ts });
        expect(res.status).toBe(401);
    });
});

// ── BOLA — wallet do JWT, nunca do body ──────────────────────────────────────

describe('updatePreferences — BOLA: wallet isolada pelo JWT', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFindOneUpdate.mockResolvedValue({ wallet_address: 'vitima', nickname: 'meu' });
        mockAccountWithKey();
    });

    it('body com wallet diferente não afeta qual perfil é atualizado', async () => {
        const ts       = Date.now();
        const bodyJson = JSON.stringify({ nickname: 'meu' });
        const sig      = signPayload('vitima', ts, bodyJson);

        await request(makeApp())
            .put('/profile')
            .set('Authorization', `Bearer ${makeToken('vitima')}`)
            .send({ nickname: 'meu', signature: sig, ts, wallet: 'atacante' }); // campo extra ignorado

        const filter = mockFindOneUpdate.mock.calls[0][0];
        expect(filter.wallet_address).toBe('vitima');
    });
});

// ── Validação de nickname ─────────────────────────────────────────────────────

describe('updatePreferences — validação de nickname', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAccountWithKey();
    });

    it('nickname vazio → 400', async () => {
        const ts       = Date.now();
        const bodyJson = JSON.stringify({ nickname: '' });
        const sig      = signPayload('jogador1', ts, bodyJson);

        const res = await request(makeApp())
            .put('/profile')
            .set('Authorization', `Bearer ${makeToken('jogador1')}`)
            .send({ nickname: '', signature: sig, ts });
        expect(res.status).toBe(400);
    });

    it('nickname > 32 chars → 400', async () => {
        const nick     = 'a'.repeat(33);
        const ts       = Date.now();
        const bodyJson = JSON.stringify({ nickname: nick });
        const sig      = signPayload('jogador1', ts, bodyJson);

        const res = await request(makeApp())
            .put('/profile')
            .set('Authorization', `Bearer ${makeToken('jogador1')}`)
            .send({ nickname: nick, signature: sig, ts });
        expect(res.status).toBe(400);
    });
});
