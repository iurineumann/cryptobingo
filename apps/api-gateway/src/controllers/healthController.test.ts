// Testes do healthController — liveness e readiness probes.

import express from 'express';
import request from 'supertest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('mongoose', () => ({
    connection: { readyState: 1 },
}));

jest.mock('../database', () => ({
    pgPool: {
        connect: jest.fn().mockResolvedValue({
            query:   jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
            release: jest.fn(),
        }),
    },
}));

jest.mock('../database/redis', () => ({
    redisClient: { isOpen: true },
}));

import { livenessCheck, readinessCheck } from './healthController';

function makeApp() {
    const app = express();
    app.get('/health/live',  livenessCheck);
    app.get('/health/ready', readinessCheck);
    return app;
}

// ── Liveness ──────────────────────────────────────────────────────────────────

describe('GET /health/live', () => {
    it('retorna 200 com status alive', async () => {
        const res = await request(makeApp()).get('/health/live');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('alive');
        expect(typeof res.body.uptime_s).toBe('number');
    });
});

// ── Readiness — todas as deps OK ──────────────────────────────────────────────

describe('GET /health/ready — todas as deps ok', () => {
    it('retorna 200 com status ready e todos os checks ok', async () => {
        const res = await request(makeApp()).get('/health/ready');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ready');
        expect(res.body.checks.mongo).toBe('ok');
        expect(res.body.checks.postgres).toBe('ok');
        expect(res.body.checks.redis).toBe('ok');
    });
});

// ── Readiness — MongoDB degradado ─────────────────────────────────────────────

describe('GET /health/ready — MongoDB offline', () => {
    beforeEach(() => {
        const mongoose = require('mongoose');
        mongoose.connection.readyState = 0; // disconnected
    });

    afterEach(() => {
        const mongoose = require('mongoose');
        mongoose.connection.readyState = 1;
    });

    it('retorna 503 com mongo fail', async () => {
        const res = await request(makeApp()).get('/health/ready');
        expect(res.status).toBe(503);
        expect(res.body.status).toBe('degraded');
        expect(res.body.checks.mongo).toBe('fail');
    });
});

// ── Readiness — Redis offline ─────────────────────────────────────────────────

describe('GET /health/ready — Redis offline', () => {
    beforeEach(() => {
        const { redisClient } = require('../database/redis');
        redisClient.isOpen = false;
    });

    afterEach(() => {
        const { redisClient } = require('../database/redis');
        redisClient.isOpen = true;
    });

    it('retorna 503 com redis fail', async () => {
        const res = await request(makeApp()).get('/health/ready');
        expect(res.status).toBe(503);
        expect(res.body.status).toBe('degraded');
        expect(res.body.checks.redis).toBe('fail');
    });
});

// ── Readiness — PostgreSQL offline ───────────────────────────────────────────

describe('GET /health/ready — PostgreSQL offline', () => {
    beforeEach(() => {
        const { pgPool } = require('../database');
        (pgPool.connect as jest.Mock).mockRejectedValueOnce(new Error('connection refused'));
    });

    it('retorna 503 com postgres fail', async () => {
        const res = await request(makeApp()).get('/health/ready');
        expect(res.status).toBe(503);
        expect(res.body.status).toBe('degraded');
        expect(res.body.checks.postgres).toBe('fail');
    });
});
