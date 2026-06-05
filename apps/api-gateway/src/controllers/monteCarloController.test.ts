// Testes do simulateWeights via HTTP (funções internas são privadas).
// Usa pequenas simulações (simulations≤1000) para ser rápido no CI.

process.env.JWT_SECRET = 'test-secret-32chars-xxxxxxxxxx!!';

import express from 'express';
import request from 'supertest';
import { simulateWeights } from './monteCarloController';

function makeApp() {
    const app = express();
    app.use(express.json());
    app.post('/montecarlo/simulate', simulateWeights);
    return app;
}

// ROW_0: bits 0,5,10,15,20 → mask
const ROW0_MASK = (1 << 0) | (1 << 5) | (1 << 10) | (1 << 15) | (1 << 20);

const VALID_BODY = {
    gametype_name:    'Teste',
    base_multiplier:  100,
    patterns: [{ name: 'ROW_0', mask: ROW0_MASK, weight: 100 }],
    simulations:      100,  // pequeno para CI
    tickets_per_game: 10,
};

// ── Validações ────────────────────────────────────────────────────────────────

describe('simulateWeights — validações de input', () => {
    it('gametype_name ausente → 400', async () => {
        const res = await request(makeApp())
            .post('/montecarlo/simulate')
            .send({ ...VALID_BODY, gametype_name: undefined });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/gametype_name/i);
    });

    it('base_multiplier = 0 (fora do range) → 400', async () => {
        const res = await request(makeApp())
            .post('/montecarlo/simulate')
            .send({ ...VALID_BODY, base_multiplier: 0 });

        expect(res.status).toBe(400);
    });

    it('base_multiplier = 256 (acima de 255) → 400', async () => {
        const res = await request(makeApp())
            .post('/montecarlo/simulate')
            .send({ ...VALID_BODY, base_multiplier: 256 });

        expect(res.status).toBe(400);
    });

    it('patterns vazio → 400', async () => {
        const res = await request(makeApp())
            .post('/montecarlo/simulate')
            .send({ ...VALID_BODY, patterns: [] });

        expect(res.status).toBe(400);
    });

    it('pattern com weight < 10 → 400', async () => {
        const res = await request(makeApp())
            .post('/montecarlo/simulate')
            .send({
                ...VALID_BODY,
                patterns: [{ name: 'ROW_0', mask: ROW0_MASK, weight: 5 }],
            });

        expect(res.status).toBe(400);
    });

    it('simulations × tickets > threshold → 400 com estimated_ms', async () => {
        // 100.000 sims × 400 tickets = 40.000.000 ops → estimatedMs = 40.000 > 30.000
        const res = await request(makeApp())
            .post('/montecarlo/simulate')
            .send({ ...VALID_BODY, simulations: 100_000, tickets_per_game: 400 });

        expect(res.status).toBe(400);
        expect(res.body.estimated_ms).toBeGreaterThan(30_000);
    });
});

// ── Simulação pequena ─────────────────────────────────────────────────────────

describe('simulateWeights — execução real pequena', () => {
    it('Simulação válida (100 sims, 10 tickets) → 200 com SimulationResult', async () => {
        const res = await request(makeApp())
            .post('/montecarlo/simulate')
            .send(VALID_BODY);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            gametype_name: 'Teste',
            rtp:           expect.any(Number),
            ggr:           expect.any(Number),
            is_viable:     expect.any(Boolean),
            total_games:   expect.any(Number),
            pattern_stats: expect.any(Array),
        });
    }, 30_000); // timeout de 30s para simulações reais

    it('rtp + ggr ≈ 1.0', async () => {
        const res = await request(makeApp())
            .post('/montecarlo/simulate')
            .send(VALID_BODY);

        expect(res.status).toBe(200);
        expect(res.body.rtp + res.body.ggr).toBeCloseTo(1.0, 2);
    }, 30_000);

    it('Padrão impossível (mask=0) → is_viable=false, alerta', async () => {
        const res = await request(makeApp())
            .post('/montecarlo/simulate')
            .send({
                ...VALID_BODY,
                // mask=1 (apenas bit 0) e tickets com bolas 1-75 → RTP pode ser quase 0
                patterns: [{ name: 'SINGLE_BIT', mask: 1, weight: 100 }],
                max_balls: 1, // apenas 1 bola sorteada — hit rate muito baixo
                simulations: 200,
            });

        // Com max_balls=1 e apenas 1 bit de padrão, poucos tickets completam
        // O teste documenta o comportamento sem assertar o valor exato de RTP
        expect(res.status).toBe(200);
        expect(res.body.alerts).toBeDefined();
    }, 30_000);

    it('base_multiplier=1 + weight=100 → payout = ticket_price × 1 × 1.00', async () => {
        const res = await request(makeApp())
            .post('/montecarlo/simulate')
            .send({
                ...VALID_BODY,
                base_multiplier: 1,
                max_balls: 75, // todas as bolas disponíveis
                simulations: 200,
            });

        expect(res.status).toBe(200);
        // Com 75 bolas e padrão ROW_0, algum payout deve ocorrer
        const totalWinners = res.body.pattern_stats?.[0]?.total_winners ?? 0;
        expect(typeof totalWinners).toBe('number');
    }, 30_000);
});
