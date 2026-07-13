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

describe('initRateLimiters — fallback MemoryStore quando RedisStore falha', () => {
    it('Não lança exceção quando RedisStore falha no construtor', () => {
        // RedisStore está mockado para lançar — initRateLimiters não deve propagar
        expect(() => initRateLimiters()).not.toThrow();
    });

    it('authLimiter funciona com MemoryStore quando Redis falhou (dentro do limite)', async () => {
        initRateLimiters(); // RedisStore lança, fallback para MemoryStore

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

    it('fallback in-memory previne brute-force mesmo sem Redis', async () => {
        // initRateLimiters tenta RedisStore que está mockado para lançar.
        // Com fallback, createLimiter usa MemoryStore embutido do express-rate-limit.
        initRateLimiters();

        const app = express();
        app.get('/auth/test', authLimiter, (_req: Request, res: Response) => {
            res.json({ ok: true });
        });

        // authLimiter: 20 req/min — primeiras 20 passam
        for (let i = 0; i < 20; i++) {
            const res = await request(app).get('/auth/test');
            expect(res.status).toBe(200);
        }

        // 21a requisição bloqueada (429) pelo MemoryStore
        const blocked = await request(app).get('/auth/test');
        expect(blocked.status).toBe(429);
        expect(blocked.body).toHaveProperty('error');
        expect(blocked.body).toHaveProperty('retry_after');
    });
});
