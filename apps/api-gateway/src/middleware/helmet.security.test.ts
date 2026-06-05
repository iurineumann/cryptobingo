// helmet.security.test.ts
// Verifica os headers de segurança HTTP configurados via Helmet.
// Usa um app Express mínimo com apenas o middleware de headers — sem rotas de negócio.

import express from 'express';
import request from 'supertest';
import helmet  from 'helmet';

function makeSecureApp() {
    const app = express();
    app.use(helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        contentSecurityPolicy:     false,
        crossOriginEmbedderPolicy: false,
    }));
    app.get('/ping', (_req, res) => res.json({ ok: true }));
    return app;
}

describe('Helmet — headers de segurança', () => {
    let app: express.Express;

    beforeAll(() => { app = makeSecureApp(); });

    it('X-Frame-Options presente', async () => {
        const res = await request(app).get('/ping');
        expect(res.headers['x-frame-options']).toBeTruthy();
    });

    it('X-Content-Type-Options: nosniff', async () => {
        const res = await request(app).get('/ping');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('Content-Security-Policy ausente (desabilitado — gerenciado pelo Vite)', async () => {
        const res = await request(app).get('/ping');
        // TODO: habilitar CSP via vite-plugin-csp quando deploy for estabilizado
        expect(res.headers['content-security-policy']).toBeUndefined();
    });

    it('X-DNS-Prefetch-Control presente', async () => {
        const res = await request(app).get('/ping');
        expect(res.headers['x-dns-prefetch-control']).toBeTruthy();
    });

    it('Strict-Transport-Security presente (HSTS)', async () => {
        // NODE_ENV=test não desabilita HSTS (Helmet o ativa por padrão)
        const res = await request(app).get('/ping');
        expect(res.headers['strict-transport-security']).toBeTruthy();
    });
});
