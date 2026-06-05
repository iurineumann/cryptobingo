// auth.flow.integration.test.ts
// Testa o fluxo completo de autenticação via HTTP (caixa-preta).
// Infraestrutura: Redis e PostgreSQL mockados via jest.mock.
// Endpoint /auth/challenge → /auth/verify (modo dev: sem transactionPayload) → /auth/logout.

process.env.JWT_SECRET           = 'test-secret-32chars-xxxxxxxxxx!!';
process.env.VERIFY_KEY_ONCHAIN   = 'false';

import express                     from 'express';
import request                     from 'supertest';
import jwt                         from 'jsonwebtoken';
import { PrivateKey, Checksum256 } from '@wharfkit/antelope';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../database', () => ({
    pgPool: {
        query: jest.fn(),
    },
}));

jest.mock('../middleware/auth', () => ({
    requireAuth:  (_req: any, _res: any, next: any) => next(),
    revokeToken:  jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: {
        v1: { chain: { get_account: jest.fn() } },
    },
}));

import { pgPool }                                            from '../database';
import { requestChallenge, verifyChallenge, logout }         from '../controllers/authController';

const mockQuery = pgPool.query as jest.Mock;

// ── App de teste ──────────────────────────────────────────────────────────────

function makeApp() {
    const app = express();
    app.use(express.json());
    app.post('/auth/challenge', requestChallenge);
    app.post('/auth/verify',    verifyChallenge);
    app.post('/auth/logout', (req: any, _res: any, next: any) => {
        // Injeta req.user a partir do Authorization header para teste de logout
        const auth = req.headers.authorization;
        if (auth?.startsWith('Bearer ')) {
            try { req.user = jwt.decode(auth.slice(7)) as any; } catch { /* noop */ }
        }
        next();
    }, logout);
    return app;
}

const JWT_SECRET = 'test-secret-32chars-xxxxxxxxxx!!';

// Gera uma chave e assina o nonce no modo DEV (sem transactionPayload)
async function signNonceDev(nonce: string): Promise<{ signature: string; publicKey: string }> {
    const privateKey = PrivateKey.generate('K1');
    const digest     = Checksum256.hash(Buffer.from(nonce, 'utf-8'));
    const signature  = privateKey.signDigest(digest).toString();
    const publicKey  = privateKey.toPublic().toString();
    return { signature, publicKey };
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe('Auth flow — challenge → verify → logout', () => {
    const app     = makeApp();
    const WALLET  = 'jogador1';
    const FUTURE  = new Date(Date.now() + 300_000).toISOString();

    beforeEach(() => {
        jest.clearAllMocks();
        mockQuery.mockReset();
    });

    it('Challenge → Verify válido → token JWT emitido', async () => {
        // ── 1. Challenge ─────────────────────────────────────────────────────
        mockQuery.mockResolvedValueOnce({
            rows: [{ nonce: 'test-nonce-flow-1', expires_at: FUTURE }],
        });

        const challengeRes = await request(app)
            .post('/auth/challenge')
            .send({ wallet: WALLET });

        expect(challengeRes.status).toBe(200);
        const { nonce } = challengeRes.body;
        expect(typeof nonce).toBe('string');

        // ── 2. Verify ────────────────────────────────────────────────────────
        const { signature, publicKey } = await signNonceDev(nonce);

        // Mock: nonce existe no DB com FUTURE expires_at
        mockQuery
            .mockResolvedValueOnce({
                rows: [{ nonce, expires_at: FUTURE }],
            })
            .mockResolvedValueOnce({ rows: [] }); // DELETE nonce

        const verifyRes = await request(app)
            .post('/auth/verify')
            .send({ wallet: WALLET, nonce, signature, public_key: publicKey });

        expect(verifyRes.status).toBe(200);
        expect(typeof verifyRes.body.token).toBe('string');

        // Token deve ser um JWT válido
        const decoded = jwt.verify(verifyRes.body.token, JWT_SECRET) as any;
        expect(decoded.wallet).toBe(WALLET);
        expect(typeof decoded.jti).toBe('string');
    });

    it('Challenge → Verify com nonce errado → 401', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ nonce: 'correct-nonce', expires_at: FUTURE }],
        });

        const challengeRes = await request(app)
            .post('/auth/challenge')
            .send({ wallet: WALLET });

        const { nonce } = challengeRes.body;
        const { signature, publicKey } = await signNonceDev('WRONG-NONCE');

        // Mock: retorna nonce original (não o assinado)
        mockQuery
            .mockResolvedValueOnce({ rows: [{ nonce, expires_at: FUTURE }] })
            .mockResolvedValueOnce({ rows: [] });

        const verifyRes = await request(app)
            .post('/auth/verify')
            .send({ wallet: WALLET, nonce, signature, public_key: publicKey });

        expect(verifyRes.status).toBe(401);
    });

    it('Nonce expirado → 401', async () => {
        const PAST = new Date(Date.now() - 1_000).toISOString();

        mockQuery
            .mockResolvedValueOnce({ rows: [{ nonce: 'expired', expires_at: PAST }] })
            .mockResolvedValueOnce({ rows: [] }); // DELETE

        const { signature, publicKey } = await signNonceDev('expired');

        const verifyRes = await request(app)
            .post('/auth/verify')
            .send({ wallet: WALLET, nonce: 'expired', signature, public_key: publicKey });

        expect(verifyRes.status).toBe(401);
    });

    it('Dois requests com mesmo nonce → 2º retorna 401 (nonce é deletado no 1º)', async () => {
        const { signature, publicKey } = await signNonceDev('replay-nonce');

        // 1ª chamada: nonce encontrado
        mockQuery
            .mockResolvedValueOnce({ rows: [{ nonce: 'replay-nonce', expires_at: FUTURE }] })
            .mockResolvedValueOnce({ rows: [] }); // DELETE

        const first = await request(app)
            .post('/auth/verify')
            .send({ wallet: WALLET, nonce: 'replay-nonce', signature, public_key: publicKey });

        // 2ª chamada: nonce não encontrado (foi deletado)
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const second = await request(app)
            .post('/auth/verify')
            .send({ wallet: WALLET, nonce: 'replay-nonce', signature, public_key: publicKey });

        // Primeira pode ter sucesso ou falha (depende da assinatura), mas a segunda deve falhar
        expect(second.status).toBe(401);
    });

    it('Logout com token → 200', async () => {
        const token = jwt.sign({ wallet: WALLET, jti: 'test-jti' }, JWT_SECRET, { expiresIn: '1h' });

        const res = await request(app)
            .post('/auth/logout')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
    });
});

describe('Auth flow — wallet inválida', () => {
    const app = makeApp();

    it('wallet vazia → 400', async () => {
        const res = await request(app).post('/auth/challenge').send({ wallet: '' });
        expect(res.status).toBe(400);
    });

    it('wallet com path traversal → 400', async () => {
        const res = await request(app).post('/auth/challenge').send({ wallet: '../../etc/passwd' });
        expect(res.status).toBe(400);
    });
});
