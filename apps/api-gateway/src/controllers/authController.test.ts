// Testes funcionais do authController (fluxo normal, sem foco em security).

process.env.JWT_SECRET = 'test-secret-32chars-xxxxxxxxxx!!';

jest.mock('../database', () => ({
    pgPool: { query: jest.fn() },
}));
jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_account: jest.fn() } } },
}));
jest.mock('../middleware/auth', () => ({
    revokeToken: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../database/redis', () => ({
    redisClient: { get: jest.fn(), set: jest.fn() },
}));

import express from 'express';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { pgPool }     from '../database';
import { revokeToken } from '../middleware/auth';
import { requestChallenge, verifyChallenge, logout } from './authController';

const mockQuery   = pgPool.query    as jest.Mock;
const mockRevoke  = revokeToken     as jest.Mock;

const FUTURE = new Date(Date.now() + 300_000).toISOString();

function makeAuthApp() {
    const app = express();
    app.use(express.json());
    // Injeta req.user para o logout
    app.use((req: any, _res: any, next: any) => {
        const auth = req.headers.authorization;
        if (auth?.startsWith('Bearer ')) {
            try { req.user = jwt.decode(auth.slice(7)) as any; } catch { /* noop */ }
        }
        next();
    });
    app.post('/auth/challenge', requestChallenge);
    app.post('/auth/verify',   verifyChallenge);
    app.post('/auth/logout',   logout);
    return app;
}

// ── requestChallenge ──────────────────────────────────────────────────────────

describe('requestChallenge', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
    });

    it('Wallet válida → 200 com nonce e expires_at', async () => {
        const res = await request(makeAuthApp())
            .post('/auth/challenge')
            .send({ wallet: 'jogador1' });

        expect(res.status).toBe(200);
        expect(res.body.nonce).toBeDefined();
        expect(res.body.expires_at).toBeDefined();
        expect(typeof res.body.nonce).toBe('string');
        expect(res.body.nonce.length).toBeGreaterThan(16);
    });

    it('pgPool.query chamado para DELETE expired + INSERT nonce', async () => {
        await request(makeAuthApp())
            .post('/auth/challenge')
            .send({ wallet: 'jogador1' });

        expect(mockQuery).toHaveBeenCalledTimes(2); // DELETE expired + INSERT nonce
        const calls = mockQuery.mock.calls.map(([sql]: [string]) => sql.trim().toUpperCase().split(/\s+/)[0]);
        expect(calls).toContain('DELETE');
        expect(calls).toContain('INSERT');
    });
});

// ── logout ────────────────────────────────────────────────────────────────────

describe('logout', () => {
    beforeEach(() => jest.clearAllMocks());

    it('Token com jti → revokeToken chamado com jti + exp', async () => {
        const jti    = 'test-jti-uuid';
        const future = Math.floor(Date.now() / 1000) + 86400;
        const token  = jwt.sign({ wallet: 'jogador1', jti }, 'test-secret-32chars-xxxxxxxxxx!!', { expiresIn: '24h' });

        const res = await request(makeAuthApp())
            .post('/auth/logout')
            .set('Authorization', `Bearer ${token}`)
            .send();

        expect(res.status).toBe(200);
        expect(mockRevoke).toHaveBeenCalledWith(jti, expect.any(Number));
        const calledExp = mockRevoke.mock.calls[0][1] as number;
        expect(calledExp).toBeCloseTo(future, -2); // dentro de 100s de tolerância
    });

    it('Token sem jti → revokeToken não chamado, 200', async () => {
        const token = jwt.sign({ wallet: 'jogador1' }, 'test-secret-32chars-xxxxxxxxxx!!');

        const res = await request(makeAuthApp())
            .post('/auth/logout')
            .set('Authorization', `Bearer ${token}`)
            .send();

        expect(res.status).toBe(200);
        expect(mockRevoke).not.toHaveBeenCalled();
    });

    it('revokeToken lança → logout retorna 200 (não bloqueia o usuário)', async () => {
        mockRevoke.mockRejectedValueOnce(new Error('Redis error'));
        const token = jwt.sign({ wallet: 'jogador1', jti: 'abc' }, 'test-secret-32chars-xxxxxxxxxx!!');

        const res = await request(makeAuthApp())
            .post('/auth/logout')
            .set('Authorization', `Bearer ${token}`)
            .send();

        expect(res.status).toBe(200);
    });

    it('Sem Authorization header → req.user undefined → 200 (sessão sem jti)', async () => {
        const res = await request(makeAuthApp())
            .post('/auth/logout')
            .send();

        expect(res.status).toBe(200);
        expect(mockRevoke).not.toHaveBeenCalled();
    });
});
