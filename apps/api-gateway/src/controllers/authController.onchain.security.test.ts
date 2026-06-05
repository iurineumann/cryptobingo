// Testes de segurança para VERIFY_KEY_ONCHAIN=true.
// Este arquivo define process.env ANTES de qualquer import para garantir que
// a constante de módulo seja inicializada corretamente.

// DEVE ser o primeiro statement — antes de qualquer import ou jest.mock
process.env.JWT_SECRET          = 'test-secret-32chars-xxxxxxxxxx!!';
process.env.VERIFY_KEY_ONCHAIN  = 'true';

const mockGetAccount = jest.fn();
const mockPgQuery    = jest.fn();

jest.mock('../database', () => ({ pgPool: { query: mockPgQuery } }));
jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_account: mockGetAccount } } },
}));
jest.mock('../middleware/auth', () => ({ revokeToken: jest.fn().mockResolvedValue(undefined) }));

import express         from 'express';
import request         from 'supertest';
import { PrivateKey, Checksum256 } from '@wharfkit/antelope';
import { verifyChallenge }         from './authController';

const TEST_KEY    = PrivateKey.generate('K1');
const TEST_PUBKEY = TEST_KEY.toPublic().toString();

async function signNonce(nonce: string): Promise<string> {
    const digest = Checksum256.hash(Buffer.from(nonce, 'utf-8'));
    return TEST_KEY.signDigest(digest).toString();
}

function makeApp() {
    const app = express();
    app.use(express.json());
    app.post('/auth/verify', verifyChallenge);
    return app;
}

const NONCE  = 'onchain-test-nonce';
const FUTURE = new Date(Date.now() + 300_000).toISOString();

describe('verifyChallenge — VERIFY_KEY_ONCHAIN=true', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPgQuery.mockResolvedValue({ rowCount: 1, rows: [{ expires_at: FUTURE }] });
    });

    it('[CRÍTICO] Chave on-chain diferente da assinada → 401 Não autorizada', async () => {
        const differentKey = PrivateKey.generate('K1').toPublic().toString();
        mockGetAccount.mockResolvedValue({
            permissions: [{
                perm_name:     'active',
                required_auth: { keys: [{ key: { toString: () => differentKey } }] },
            }],
        });

        const sig = await signNonce(NONCE);
        const res = await request(makeApp())
            .post('/auth/verify')
            .send({ wallet: 'jogador1', nonce: NONCE, signature: sig, public_key: TEST_PUBKEY });

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/não autorizada/i);
        expect(mockGetAccount).toHaveBeenCalledWith('jogador1');
    });

    it('Chave on-chain IGUAL à assinada → 200 JWT emitido', async () => {
        mockGetAccount.mockResolvedValue({
            permissions: [{
                perm_name:     'active',
                required_auth: { keys: [{ key: { toString: () => TEST_PUBKEY } }] },
            }],
        });

        const sig = await signNonce(NONCE);
        const res = await request(makeApp())
            .post('/auth/verify')
            .send({ wallet: 'jogador1', nonce: NONCE, signature: sig, public_key: TEST_PUBKEY });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
    });

    it('RPC on-chain lança (ECONNREFUSED) → fail-open (login permitido com log)', async () => {
        // SECURITY: Comportamento intencional — não bloqueia usuários durante indisponibilidade do nó.
        // Em ambientes de alta segurança, considerar fail-closed com circuit breaker.
        mockGetAccount.mockRejectedValue(new Error('ECONNREFUSED'));

        const sig = await signNonce(NONCE);
        const res = await request(makeApp())
            .post('/auth/verify')
            .send({ wallet: 'jogador1', nonce: NONCE, signature: sig, public_key: TEST_PUBKEY });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
    });
});
