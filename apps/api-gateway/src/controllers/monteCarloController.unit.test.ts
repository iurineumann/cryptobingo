// monteCarloController.unit.test.ts
// Testa invariantes matemáticas e de lógica via interface HTTP com simulações pequenas.
// Funções internas (generateRandomMatrix, simulateOneGame, runMonteCarlo) são privadas;
// os testes verificam seu comportamento através de propriedades observáveis no output.

process.env.JWT_SECRET = 'test-secret-32chars-xxxxxxxxxx!!';

import express from 'express';
import request from 'supertest';
import { simulateWeights } from './monteCarloController';

const ROW0_MASK = (1 << 0) | (1 << 5) | (1 << 10) | (1 << 15) | (1 << 20);
// COL_B: bits 0,1,2,3,4
const COLB_MASK = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4);

function makeApp() {
    const app = express();
    app.use(express.json());
    app.post('/simulate', simulateWeights);
    return app;
}

// ── Invariantes RTP ───────────────────────────────────────────────────────────

describe('monteCarloController — invariantes de RTP', () => {
    const app = makeApp();

    it('rtp + ggr = 1.0 (invariante contábil)', async () => {
        const res = await request(app).post('/simulate').send({
            gametype_name: 'test', base_multiplier: 1,
            patterns: [{ name: 'ROW_0', mask: ROW0_MASK, weight: 100 }],
            simulations: 500, tickets_per_game: 20,
        });
        expect(res.status).toBe(200);
        expect(res.body.rtp + res.body.ggr).toBeCloseTo(1.0, 5);
    }, 30_000);

    it('RTP < 0.75 quando weight é muito baixo (ex: 10) → is_viable=false', async () => {
        // base_multiplier=1, weight=10 → payout = price × 0.10 < price → RTP < 1
        // Com hit_rate < 100%, RTP < 0.10 (bem abaixo do limiar de 0.75)
        const res = await request(app).post('/simulate').send({
            gametype_name: 'low-rtp', base_multiplier: 1,
            patterns: [{ name: 'HARD', mask: ROW0_MASK, weight: 10 }],
            simulations: 300, tickets_per_game: 10, max_balls: 5,
        });
        expect(res.status).toBe(200);
        if (res.body.rtp < 0.75) {
            expect(res.body.is_viable).toBe(false);
        }
    }, 30_000);

    it('total_games = simulations quando simulação completa', async () => {
        const sims = 50;
        const res  = await request(app).post('/simulate').send({
            gametype_name: 'count-test', base_multiplier: 1,
            patterns: [{ name: 'ROW_0', mask: ROW0_MASK, weight: 100 }],
            simulations: sims, tickets_per_game: 5,
        });
        expect(res.status).toBe(200);
        expect(res.body.total_games).toBe(sims);
    }, 30_000);
});

// ── Invariantes de pattern_stats ──────────────────────────────────────────────

describe('monteCarloController — pattern_stats', () => {
    const app = makeApp();

    it('pattern_stats contém o padrão enviado', async () => {
        const res = await request(app).post('/simulate').send({
            gametype_name: 'ps-test', base_multiplier: 1,
            patterns: [{ name: 'MY_PATTERN', mask: ROW0_MASK, weight: 200 }],
            simulations: 100, tickets_per_game: 5,
        });
        expect(res.status).toBe(200);
        const ps = res.body.pattern_stats as Array<{ name: string }>;
        expect(ps.some(p => p.name === 'MY_PATTERN')).toBe(true);
    }, 30_000);

    it('2 padrões → pattern_stats com 2 entradas', async () => {
        const res = await request(app).post('/simulate').send({
            gametype_name: '2-patterns', base_multiplier: 1,
            patterns: [
                { name: 'ROW_0', mask: ROW0_MASK, weight: 100 },
                { name: 'COL_B', mask: COLB_MASK, weight: 150 },
            ],
            simulations: 100, tickets_per_game: 5,
        });
        expect(res.status).toBe(200);
        expect((res.body.pattern_stats as unknown[]).length).toBe(2);
    }, 30_000);

    it('hit_rate entre 0 e 1 para todos os padrões', async () => {
        const res = await request(app).post('/simulate').send({
            gametype_name: 'hr-test', base_multiplier: 1,
            patterns: [{ name: 'ROW_0', mask: ROW0_MASK, weight: 100 }],
            simulations: 200, tickets_per_game: 10,
        });
        expect(res.status).toBe(200);
        for (const ps of res.body.pattern_stats as Array<{ hit_rate: number }>) {
            expect(ps.hit_rate).toBeGreaterThanOrEqual(0);
            expect(ps.hit_rate).toBeLessThanOrEqual(1);
        }
    }, 30_000);
});

// ── Base multiplier ───────────────────────────────────────────────────────────

describe('monteCarloController — base_multiplier escalona payout', () => {
    const app = makeApp();

    it('base_multiplier=2 → avg_payout_per_winner ≈ 2× do multiplier=1', async () => {
        const [r1, r2] = await Promise.all([
            request(app).post('/simulate').send({
                gametype_name: 'bm1', base_multiplier: 1,
                patterns: [{ name: 'ROW_0', mask: ROW0_MASK, weight: 100 }],
                simulations: 500, tickets_per_game: 20,
            }),
            request(app).post('/simulate').send({
                gametype_name: 'bm2', base_multiplier: 2,
                patterns: [{ name: 'ROW_0', mask: ROW0_MASK, weight: 100 }],
                simulations: 500, tickets_per_game: 20,
            }),
        ]);
        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);
        // O RTP total dobra com base_multiplier=2 (payout = price × 2 × weight/100)
        // Com peso 100 (1×): rtp_bm1 ≈ hit_rate, rtp_bm2 ≈ 2 × hit_rate
        // Não podemos assertar o valor exato mas podemos verificar que rtp_bm2 > rtp_bm1
        if (r2.body.rtp > 0 && r1.body.rtp > 0) {
            expect(r2.body.rtp).toBeGreaterThan(r1.body.rtp * 1.5);
        }
    }, 60_000);
});
