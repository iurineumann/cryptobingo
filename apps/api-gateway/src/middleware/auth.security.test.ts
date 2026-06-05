// Security regression tests para o middleware requireAuth.
// Cobre: blacklist fail-open, token revogado, ausência de jti, header ausente, token malformado.

// JWT_SECRET deve ser definido antes do primeiro import do módulo auth.ts
process.env.JWT_SECRET = 'test-secret-32chars-xxxxxxxxxx!!';

import express, { Request, Response } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../database/redis', () => ({
    redisClient: {
        get: jest.fn(),
        set: jest.fn(),
    },
}));

// Importar APÓS definir env e mocks
import { requireAuth } from './auth';
import { redisClient } from '../database/redis';

const mockRedisGet = redisClient.get as jest.Mock;

// ── App mínimo para testes ─────────────────────────────────────────────────────

function makeApp() {
    const app = express();
    app.use(express.json());
    app.get('/protected', requireAuth, (req: Request, res: Response) => {
        res.json({ wallet: req.user?.wallet });
    });
    return app;
}

function makeToken(payload: object, secret = 'test-secret-32chars-xxxxxxxxxx!!'): string {
    return jwt.sign(payload, secret, { expiresIn: '1h' });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('requireAuth — blacklist fail-open (ADR-006)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('[BLACKLIST FAIL-OPEN] Redis lança ECONNREFUSED → token aceito (comportamento documentado)', async () => {
        // Redis indisponível durante verificação de blacklist
        mockRedisGet.mockRejectedValue(new Error('ECONNREFUSED'));

        const token = makeToken({ wallet: 'jogador1', jti: 'some-jti-value' });
        const res   = await request(makeApp())
            .get('/protected')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.wallet).toBe('jogador1');
        // Documentar: fail-open é intencional em dev, deve ser avaliado para produção
    });

    it('[REGRESSÃO] Token com jti na blacklist → 401 Token revogado', async () => {
        mockRedisGet.mockResolvedValue('1'); // jti na blacklist

        const token = makeToken({ wallet: 'jogador1', jti: 'revoked-jti' });
        const res   = await request(makeApp())
            .get('/protected')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/revogado/i);
        expect(mockRedisGet).toHaveBeenCalledWith('jwt:blacklist:revoked-jti');
    });

    it('Token sem jti → blacklist não consultada', async () => {
        const token = makeToken({ wallet: 'jogador1' }); // sem jti
        const res   = await request(makeApp())
            .get('/protected')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(mockRedisGet).not.toHaveBeenCalled();
    });

    it('Header Authorization ausente → 401 imediato sem consultar Redis', async () => {
        const res = await request(makeApp()).get('/protected');

        expect(res.status).toBe(401);
        expect(mockRedisGet).not.toHaveBeenCalled();
    });

    it('Bearer token malformado → 401 sem vazar stack interno', async () => {
        const res = await request(makeApp())
            .get('/protected')
            .set('Authorization', 'Bearer invalid.token.here');

        expect(res.status).toBe(401);
        // Não deve vazar detalhes da lib jwt nem stack traces
        expect(JSON.stringify(res.body)).not.toContain('jsonwebtoken');
        expect(JSON.stringify(res.body)).not.toContain('stack');
        expect(JSON.stringify(res.body)).not.toContain('at ');
    });

    it('Token assinado com secret diferente → 401', async () => {
        const token = makeToken({ wallet: 'hacker' }, 'wrong-secret');
        const res   = await request(makeApp())
            .get('/protected')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(401);
    });

    it('Token expirado → 401', async () => {
        const token = jwt.sign(
            { wallet: 'jogador1', jti: 'expired-jti' },
            'test-secret-32chars-xxxxxxxxxx!!',
            { expiresIn: -1 } // já expirado
        );
        const res = await request(makeApp())
            .get('/protected')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(401);
    });

    it('Token válido sem jti na blacklist → 200 com wallet injetado', async () => {
        mockRedisGet.mockResolvedValue(null); // jti não revogado

        const token = makeToken({ wallet: 'sponsor1111', jti: 'valid-jti' });
        const res   = await request(makeApp())
            .get('/protected')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.wallet).toBe('sponsor1111');
    });
});
