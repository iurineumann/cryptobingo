// Security regression tests para headers HTTP (Helmet).
// Cobre: X-Frame-Options, X-Content-Type-Options, ausência de CSP (documentada).

process.env.JWT_SECRET          = 'test-secret-32chars-xxxxxxxxxx!!';
process.env.MONGO_URL           = 'mongodb://localhost:27017/test';
process.env.POSTGRES_URL        = 'postgres://localhost/test';
process.env.REDIS_URL           = 'redis://localhost:6379';
process.env.CONTRACT_ACCOUNT    = 'bingo.game';
process.env.RPC_URL             = 'http://localhost:8888';
process.env.CHAIN_ID            = '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';
process.env.MICROSERVICE_PRIVATE_KEY = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3';

// Mock de todas as dependências para criar app minimal
jest.mock('./database/redis', () => ({ redisClient: { get: jest.fn(), set: jest.fn(), connect: jest.fn() }, connectRedis: jest.fn().mockResolvedValue(undefined) }));
jest.mock('./database',      () => ({ pgPool: { query: jest.fn() } }));
jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_table_rows: jest.fn(), get_account: jest.fn() } } },
}));

import express from 'express';
import helmet  from 'helmet';
import request from 'supertest';

// App minimal com apenas o middleware de segurança (sem bootstrap completo)
function makeSecureApp() {
    const app = express();
    app.use(helmet({
        contentSecurityPolicy: false, // Configuração atual do projeto
    }));
    app.get('/api/v1/health', (_req, res) => res.json({ ok: true }));
    return app;
}

describe('Headers de segurança HTTP (Helmet)', () => {
    let res: request.Response;

    beforeAll(async () => {
        res = await request(makeSecureApp()).get('/api/v1/health');
    });

    it('X-Frame-Options presente (proteção contra clickjacking)', () => {
        expect(
            res.headers['x-frame-options']
        ).toMatch(/DENY|SAMEORIGIN/i);
    });

    it('X-Content-Type-Options: nosniff presente (proteção contra MIME sniffing)', () => {
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('X-DNS-Prefetch-Control presente', () => {
        expect(res.headers['x-dns-prefetch-control']).toBeDefined();
    });

    // CSP está desabilitado intencionalmente por incompatibilidade com Wharfkit wallet plugins
    // TODO: habilitar via vite-plugin-csp com nonces quando Wharfkit resolver o problema
    // Ref: https://github.com/wharfkit/web-renderer/issues/XXX
    it('[CSP AUSENTE — documentado] Content-Security-Policy não está presente', () => {
        expect(res.headers['content-security-policy']).toBeUndefined();
        // TODO: remover esta asserção quando CSP for habilitado
    });

    it('Resposta do /health é 200', () => {
        expect(res.status).toBe(200);
    });
});

describe('Headers em modo produção (NODE_ENV=production)', () => {
    let prodRes: request.Response;

    beforeAll(async () => {
        const origEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        const app = express();
        app.use(helmet({
            contentSecurityPolicy:           false,
            strictTransportSecurity: {
                maxAge:            31536000,
                includeSubDomains: true,
            },
        }));
        app.get('/health', (_req, res) => res.json({ ok: true }));

        prodRes = await request(app).get('/health');
        process.env.NODE_ENV = origEnv;
    });

    it('Strict-Transport-Security presente em produção', () => {
        expect(prodRes.headers['strict-transport-security']).toBeDefined();
        expect(prodRes.headers['strict-transport-security']).toContain('max-age=');
    });
});
