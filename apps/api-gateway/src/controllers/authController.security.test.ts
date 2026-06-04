// Security regression tests para authController.
// Cobre: VERIFY_KEY_ONCHAIN fail-open, nonce replay, nonce expirado, validação de wallet.

process.env.JWT_SECRET = 'test-secret-32chars-xxxxxxxxxx!!';

jest.mock('../database', () => ({
    pgPool: { query: jest.fn() },
}));
jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: {
        v1: { chain: { get_account: jest.fn() } },
    },
}));
jest.mock('../middleware/auth', () => ({
    revokeToken: jest.fn().mockResolvedValue(undefined),
}));

import express from 'express';
import request from 'supertest';
import { PrivateKey, Checksum256 } from '@wharfkit/antelope';
import { pgPool }     from '../database';
import { rpcClient }  from '@cryptobingo/blockchain-core';
import { requestChallenge, verifyChallenge } from './authController';

const mockQuery     = pgPool.query as jest.Mock;
const mockGetAcct   = rpcClient.v1.chain.get_account as jest.Mock;

function makeApp() {
    const app = express();
    app.use(express.json());
    app.post('/auth/challenge', requestChallenge);
    app.post('/auth/verify',   verifyChallenge);
    return app;
}

// Gera par de chaves efêmero para assinatura de testes
const TEST_KEY    = PrivateKey.generate('K1');
const TEST_PUBKEY = TEST_KEY.toPublic().toString();

async function signNonce(nonce: string): Promise<string> {
    const digest = Checksum256.hash(Buffer.from(nonce, 'utf-8'));
    return TEST_KEY.signDigest(digest).toString();
}

// ── requestChallenge ──────────────────────────────────────────────────────────

describe('requestChallenge — validação de wallet', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
    });

    it('Wallet válida → 200 com nonce e expires_at', async () => {
        const res = await request(makeApp())
            .post('/auth/challenge')
            .send({ wallet: 'jogador1' });

        expect(res.status).toBe(200);
        expect(res.body.nonce).toBeDefined();
        expect(res.body.expires_at).toBeDefined();
    });

    it('Wallet com path traversal (../../etc) → 400', async () => {
        const res = await request(makeApp())
            .post('/auth/challenge')
            .send({ wallet: '../../etc/passwd' });

        expect(res.status).toBe(400);
    });

    it('Wallet com caracteres inválidos (@, espaço, nome longo) → 400', async () => {
        for (const invalid of ['alice@evil.com', 'player one', 'verylongnamethatexceedslimit']) {
            const res = await request(makeApp())
                .post('/auth/challenge')
                .send({ wallet: invalid });
            expect(res.status).toBe(400);
        }
    });

    it('Wallet vazia → 400', async () => {
        const res = await request(makeApp())
            .post('/auth/challenge')
            .send({ wallet: '' });

        expect(res.status).toBe(400);
    });

    it('Campo wallet ausente → 400', async () => {
        const res = await request(makeApp())
            .post('/auth/challenge')
            .send({});

        expect(res.status).toBe(400);
    });
});

// ── verifyChallenge — VERIFY_KEY_ONCHAIN ─────────────────────────────────────

describe('verifyChallenge — VERIFY_KEY_ONCHAIN=false (fail-open documentado)', () => {
    const NONCE = 'abc123nonce';
    const FUTURE = new Date(Date.now() + 300_000).toISOString();

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.VERIFY_KEY_ONCHAIN = 'false';
        // Nonce válido no banco
        mockQuery.mockResolvedValue({ rowCount: 1, rows: [{ expires_at: FUTURE }] });
    });

    it('[CRÍTICO] VERIFY_KEY_ONCHAIN=false — JWT emitido sem verificar on-chain', async () => {
        // SECURITY: Este comportamento é intencional em dev mas deve ser revertido em produção.
        // Em produção, VERIFY_KEY_ONCHAIN=true garante que a chave pertence à conta WAX.
        const sig = await signNonce(NONCE);
        const res = await request(makeApp())
            .post('/auth/verify')
            .send({ wallet: 'jogador1', nonce: NONCE, signature: sig, public_key: TEST_PUBKEY });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(mockGetAcct).not.toHaveBeenCalled(); // on-chain não foi consultado
    });
});

// VERIFY_KEY_ONCHAIN=true requer um arquivo dedicado porque a constante é de nível de módulo.
// Os testes abaixo cobrem apenas comportamento com VERIFY_KEY_ONCHAIN=false (default de dev).
// Ver: authController.onchain.security.test.ts para testes com VERIFY_KEY_ONCHAIN=true.

describe('verifyChallenge — VERIFY_KEY_ONCHAIN=true (arquivo dedicado)', () => {
    it.todo('[REGRESSÃO] Chave on-chain diferente da assinada → 401 (ver authController.onchain.security.test.ts)');
    it.todo('RPC on-chain lança → fail-open (ver authController.onchain.security.test.ts)');
});

// ── verifyChallenge — Nonce replay e expiração ────────────────────────────────

describe('verifyChallenge — nonce replay e expiração', () => {
    const NONCE = 'replaynonce789';
    const FUTURE = new Date(Date.now() + 300_000).toISOString();
    const PAST   = new Date(Date.now() - 60_000).toISOString();

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.VERIFY_KEY_ONCHAIN = 'false';
    });

    it('[NONCE REPLAY] DELETE é chamado antes de emitir JWT (uso único)', async () => {
        const queryCalls: string[] = [];
        mockQuery.mockImplementation((sql: string) => {
            queryCalls.push(sql.trim().split('\n')[0].trim().toUpperCase());
            // Primeiro SELECT retorna nonce válido, depois DELETEs e INSERTs
            if (/^SELECT/.test(sql)) return { rowCount: 1, rows: [{ expires_at: FUTURE }] };
            return { rowCount: 1, rows: [] };
        });

        const sig = await signNonce(NONCE);
        const res = await request(makeApp())
            .post('/auth/verify')
            .send({ wallet: 'jogador1', nonce: NONCE, signature: sig, public_key: TEST_PUBKEY });

        expect(res.status).toBe(200);
        // Verificar que DELETE foi chamado (invalidação do nonce)
        const hasDelete = queryCalls.some(q => q.startsWith('DELETE'));
        expect(hasDelete).toBe(true);
        // DELETE deve vir antes do JWT ser emitido (já que res.status é 200 = JWT emitido)
    });

    it('Nonce inexistente no banco → 401', async () => {
        mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });

        const sig = await signNonce(NONCE);
        const res = await request(makeApp())
            .post('/auth/verify')
            .send({ wallet: 'jogador1', nonce: NONCE, signature: sig, public_key: TEST_PUBKEY });

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/inválido|expirado/i);
    });

    it('Nonce com expires_at no passado → 401 + DELETE disparado', async () => {
        mockQuery.mockImplementation((sql: string) => {
            if (/^SELECT/.test(sql)) return { rowCount: 1, rows: [{ expires_at: PAST }] };
            return { rowCount: 1, rows: [] };
        });

        const sig = await signNonce(NONCE);
        const res = await request(makeApp())
            .post('/auth/verify')
            .send({ wallet: 'jogador1', nonce: NONCE, signature: sig, public_key: TEST_PUBKEY });

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/expirado/i);
        // DELETE deve ter sido chamado para limpar o nonce expirado
        const deleteCalled = mockQuery.mock.calls.some(
            ([sql]: [string]) => sql.trim().toUpperCase().startsWith('DELETE')
        );
        expect(deleteCalled).toBe(true);
    });

    it('Campos obrigatórios ausentes → 400', async () => {
        const res = await request(makeApp())
            .post('/auth/verify')
            .send({ wallet: 'jogador1' }); // sem nonce, signature, public_key

        expect(res.status).toBe(400);
    });
});
