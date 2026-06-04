// Security regression tests para o módulo rateLimiter.
// Cobre: comportamento fail-open quando RedisStore falha.

jest.mock('rate-limit-redis', () => ({
    RedisStore: jest.fn().mockImplementation(() => {
        throw new Error('Redis connection failed');
    }),
}));

jest.mock('../database/redis', () => ({
    redisClient: { sendCommand: jest.fn() },
}));

import { Request, Response, NextFunction } from 'express';
import express from 'express';
import request from 'supertest';
import { initRateLimiters, authLimiter } from './rateLimiter';

describe('initRateLimiters — fail-open quando RedisStore falha', () => {
    it('Não lança exceção quando RedisStore falha no construtor', () => {
        // RedisStore está mockado para lançar — initRateLimiters não deve propagar
        expect(() => initRateLimiters()).not.toThrow();
    });

    it('authLimiter passa a requisição sem 429 quando Redis falhou (passthrough ativo)', async () => {
        initRateLimiters(); // RedisStore lança, fallback para passthrough

        const app = express();
        app.get('/test', authLimiter, (_req: Request, res: Response) => {
            res.json({ ok: true });
        });

        // Múltiplos requests sem 429 (passthrough ativo)
        for (let i = 0; i < 5; i++) {
            const res = await request(app).get('/test');
            expect(res.status).toBe(200);
        }
    });

    // ADR-PENDING: implementar fallback in-memory para rate limiting
    // Quando Redis está indisponível, brute-force em /auth/challenge é possível.
    // Mitigação futura: express-rate-limit com MemoryStore como fallback.
    it.todo('ADR-PENDING: fallback in-memory previne brute-force mesmo sem Redis');
});
