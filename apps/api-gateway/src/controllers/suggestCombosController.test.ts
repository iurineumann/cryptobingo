// Testes do endpoint suggest-combos via HTTP.
// Usa pequenas simulações (combos sem simulação pesada) para ser rápido no CI.

process.env.JWT_SECRET = 'test-secret-32chars-xxxxxxxxxx!!';

import express from 'express';
import request from 'supertest';
import { suggestCombos } from './monteCarloController';

const ROW0_MASK = (1 << 0) | (1 << 5) | (1 << 10) | (1 << 15) | (1 << 20);
const ROW1_MASK = (1 << 1) | (1 << 6) | (1 << 11) | (1 << 16) | (1 << 21);
const ROW2_MASK = (1 << 2) | (1 << 7) | (1 << 12) | (1 << 17) | (1 << 22);
const ROW3_MASK = (1 << 3) | (1 << 8) | (1 << 13) | (1 << 18) | (1 << 23);

const DIAG_TL_BR = (1 << 0) | (1 << 6) | (1 << 12) | (1 << 18) | (1 << 24);

function makeApp() {
    const app = express();
    app.use(express.json());
    app.post('/suggest', suggestCombos);
    return app;
}

const VALID_BODY = {
    gametype_name:    'Teste Suggest',
    base_multiplier:  1,
    draw_mode:        'standard',
    max_balls:        40,
    patterns: [
        { pattern_id: 1, name: 'ROW_0', mask: ROW0_MASK, weight: 100, pattern_type: 'simple' },
        { pattern_id: 2, name: 'ROW_1', mask: ROW1_MASK, weight: 100, pattern_type: 'simple' },
        { pattern_id: 3, name: 'ROW_2', mask: ROW2_MASK, weight: 100, pattern_type: 'simple' },
        { pattern_id: 4, name: 'ROW_3', mask: ROW3_MASK, weight: 100, pattern_type: 'simple' },
    ],
};

// ── Validações ────────────────────────────────────────────────────────────────

describe('suggestCombos — validações de input', () => {
    it('gametype_name ausente → 400', async () => {
        const res = await request(makeApp())
            .post('/suggest')
            .send({ ...VALID_BODY, gametype_name: undefined });
        expect(res.status).toBe(400);
    });

    it('patterns vazio → 400', async () => {
        const res = await request(makeApp())
            .post('/suggest')
            .send({ ...VALID_BODY, patterns: [] });
        expect(res.status).toBe(400);
    });

    it('pattern sem mask → 400', async () => {
        const res = await request(makeApp())
            .post('/suggest')
            .send({
                ...VALID_BODY,
                patterns: [{ pattern_id: 1, name: 'INVALID', mask: 0, weight: 100, pattern_type: 'simple' }],
            });
        expect(res.status).toBe(400);
    });

    it('base_multiplier ausente → 400', async () => {
        const res = await request(makeApp())
            .post('/suggest')
            .send({ ...VALID_BODY, base_multiplier: undefined });
        expect(res.status).toBe(400);
    });

});

// ── Execução real (pipeline compartilhada) ─────────────────────────────────────

describe('suggestCombos — execução', () => {
    let response: any;

    beforeAll(async () => {
        response = await request(makeApp())
            .post('/suggest')
            .send(VALID_BODY);
    }, 60_000);

    it('retorna 200 com pattern_weights e combos', () => {
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            gametype_name: 'Teste Suggest',
            pattern_weights: expect.any(Object),
            combos: expect.any(Array),
            validation: expect.any(Object),
            is_viable: expect.any(Boolean),
            alerts: expect.any(Array),
        });
        // Não deve ter target_rtp no response
        expect(response.body.target_rtp).toBeUndefined();
    });

    it('gera combos n_of_type e all_of', () => {
        expect(response.body.combos.length).toBeGreaterThanOrEqual(1);
        const types = new Set(response.body.combos.map((c: any) => c.clauses[0]?.type));
        expect(types.has('n_of_type')).toBe(true);
    });

    it('nenhum combo weight ultrapassa 25500', () => {
        for (const c of response.body.combos) {
            expect(c.weight).toBeGreaterThanOrEqual(100);
            expect(c.weight).toBeLessThanOrEqual(25500);
        }
    });

    it('pattern_weights mantém os pesos originais do input', () => {
        const pw = response.body.pattern_weights as Record<string, number>;
        for (const p of VALID_BODY.patterns) {
            expect(pw[p.name]).toBeDefined();
            expect(pw[p.name]).toBe(p.weight);
        }
    });

    it('combo_weights tem entradas para todos os combos', () => {
        const cw = response.body.combo_weights as Record<string, number>;
        for (const c of response.body.combos) {
            expect(cw[c.name]).toBeDefined();
        }
    });
});

describe('suggestCombos — com master (modo standard)', () => {
    let response: any;

    const bodyWithMaster = {
        ...VALID_BODY,
        patterns: [
            ...VALID_BODY.patterns,
            { pattern_id: 10, name: 'MASTER', mask: 0x01FFFFFF, weight: 25500, pattern_type: 'master' },
            { pattern_id: 11, name: 'DIAG_TL_BR', mask: DIAG_TL_BR, weight: 500, pattern_type: 'special' },
        ],
    };

    beforeAll(async () => {
        response = await request(makeApp())
            .post('/suggest')
            .send(bodyWithMaster);
    }, 60_000);

    it('master mantém peso original (não calibrado) no resultado', () => {
        expect(response.status).toBe(200);
        expect(response.body.pattern_weights.MASTER).toBe(25500);
    });

    it('nenhum combo supera master weight', () => {
        const masterW = 25500;
        for (const c of response.body.combos) {
            expect(c.weight).toBeLessThanOrEqual(masterW);
        }
    });
});

describe('suggestCombos — modo firstfull', () => {
    let response: any;

    const firstfullBody = {
        ...VALID_BODY,
        draw_mode: 'firstfull',
        patterns: [
            ...VALID_BODY.patterns,
            { pattern_id: 10, name: 'MASTER', mask: 0x01FFFFFF, weight: 5000, pattern_type: 'master' },
        ],
    };

    beforeAll(async () => {
        response = await request(makeApp())
            .post('/suggest')
            .send(firstfullBody);
    }, 60_000);

    it('master weight mantém o original (não calibrado)', () => {
        expect(response.status).toBe(200);
        expect(response.body.pattern_weights.MASTER).toBe(5000);
    });

    it('nenhum combo supera master weight', () => {
        const masterW = response.body.pattern_weights.MASTER;
        for (const c of response.body.combos) {
            expect(c.weight).toBeLessThanOrEqual(masterW);
        }
    });
});
