// Testes funcionais do winningsController.

process.env.JWT_SECRET = 'test-secret-32chars-xxxxxxxxxx!!';

jest.mock('../database', () => ({
    pgPool: { query: jest.fn() },
}));

import express from 'express';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { pgPool } from '../database';
import { getPlayerWinnings, getPlayerWinningsBatch } from './winningsController';

const mockQuery = pgPool.query as jest.Mock;

function makeApp() {
    const app = express();
    app.use(express.json());
    // Injeta req.user
    app.use((req: any, _res: any, next: any) => {
        const auth = req.headers.authorization;
        if (auth?.startsWith('Bearer ')) {
            try { req.user = jwt.verify(auth.slice(7), 'test-secret-32chars-xxxxxxxxxx!!') as any; } catch { /* noop */ }
        }
        next();
    });
    app.get('/winnings/:gameId', getPlayerWinnings);
    app.post('/winnings/batch',  getPlayerWinningsBatch);
    return app;
}

function makeToken(wallet = 'jogador1'): string {
    return jwt.sign({ wallet, jti: 'jti1' }, 'test-secret-32chars-xxxxxxxxxx!!', { expiresIn: '1h' });
}

// ── getPlayerWinnings ─────────────────────────────────────────────────────────

describe('getPlayerWinnings', () => {
    beforeEach(() => jest.clearAllMocks());

    it('total: 12.5000 → { totalWon: 12.5 }', async () => {
        mockQuery.mockResolvedValue({ rows: [{ total: '12.5000' }], rowCount: 1 });

        const res = await request(makeApp())
            .get('/winnings/100')
            .set('Authorization', `Bearer ${makeToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.totalWon).toBe(12.5);
        expect(res.body.gameId).toBe('100');
        expect(res.body.wallet).toBe('jogador1');
    });

    it('total: null → { totalWon: 0 }', async () => {
        mockQuery.mockResolvedValue({ rows: [{ total: null }], rowCount: 1 });

        const res = await request(makeApp())
            .get('/winnings/1')
            .set('Authorization', `Bearer ${makeToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.totalWon).toBe(0);
    });

    it('Sem Authorization → 401', async () => {
        const res = await request(makeApp()).get('/winnings/1');
        expect(res.status).toBe(401);
    });

    it('pgPool lança → 500', async () => {
        mockQuery.mockRejectedValue(new Error('DB error'));

        const res = await request(makeApp())
            .get('/winnings/1')
            .set('Authorization', `Bearer ${makeToken()}`);

        expect(res.status).toBe(500);
    });

    it('Query usa wallet e gameId corretos como parâmetros', async () => {
        mockQuery.mockResolvedValue({ rows: [{ total: '0' }], rowCount: 1 });

        await request(makeApp())
            .get('/winnings/42')
            .set('Authorization', `Bearer ${makeToken('sponsor1')}`);

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('claim_win'),
            ['sponsor1', '42']
        );
    });
});

// ── getPlayerWinningsBatch ────────────────────────────────────────────────────

describe('getPlayerWinningsBatch', () => {
    beforeEach(() => jest.clearAllMocks());

    it('gameIds=[1,2,3] → mapa { 1: 5.0, 2: 0 }', async () => {
        mockQuery.mockResolvedValue({
            rows: [
                { game_id: '1', total: '5.0000' },
                { game_id: '2', total: '0' },
            ],
            rowCount: 2,
        });

        const res = await request(makeApp())
            .post('/winnings/batch')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ gameIds: ['1', '2', '3'] });

        expect(res.status).toBe(200);
        expect(res.body.winnings['1']).toBe(5.0);
        expect(res.body.winnings['2']).toBe(0);
    });

    it('gameIds ausente → 400', async () => {
        const res = await request(makeApp())
            .post('/winnings/batch')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({});

        expect(res.status).toBe(400);
    });

    it('gameIds não-array → 400', async () => {
        const res = await request(makeApp())
            .post('/winnings/batch')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ gameIds: '1,2,3' });

        expect(res.status).toBe(400);
    });

    it('gameIds array vazio → 400', async () => {
        const res = await request(makeApp())
            .post('/winnings/batch')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ gameIds: [] });

        expect(res.status).toBe(400);
    });

    it('Sem Authorization → 401', async () => {
        const res = await request(makeApp())
            .post('/winnings/batch')
            .send({ gameIds: ['1'] });

        expect(res.status).toBe(401);
    });

    it('pgPool lança → 500', async () => {
        mockQuery.mockRejectedValue(new Error('DB error'));

        const res = await request(makeApp())
            .post('/winnings/batch')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ gameIds: ['1', '2'] });

        expect(res.status).toBe(500);
    });
});
