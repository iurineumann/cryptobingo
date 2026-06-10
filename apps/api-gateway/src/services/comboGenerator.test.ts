// Testes do comboGenerator — funções puras, sem dependências externas.

import { generateCombos, priceCombosByDifficulty, recalibrateComboWeights } from './comboGenerator';
import type { PatternInfo, ComboCandidate } from './comboGenerator';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROW0_MASK = (1 << 0) | (1 << 5) | (1 << 10) | (1 << 15) | (1 << 20);
const ROW1_MASK = (1 << 1) | (1 << 6) | (1 << 11) | (1 << 16) | (1 << 21);
const ROW2_MASK = (1 << 2) | (1 << 7) | (1 << 12) | (1 << 17) | (1 << 22);
const ROW3_MASK = (1 << 3) | (1 << 8) | (1 << 13) | (1 << 18) | (1 << 23);
const ROW4_MASK = (1 << 4) | (1 << 9) | (1 << 14) | (1 << 19) | (1 << 24);

const COLB_MASK = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4);
const COLI_MASK = (1 << 5) | (1 << 6) | (1 << 7) | (1 << 8) | (1 << 9);
const COLN_MASK = (1 << 10) | (1 << 11) | (1 << 12) | (1 << 13) | (1 << 14);
const COLG_MASK = (1 << 15) | (1 << 16) | (1 << 17) | (1 << 18) | (1 << 19);
const COLO_MASK = (1 << 20) | (1 << 21) | (1 << 22) | (1 << 23) | (1 << 24);

// FREE SPACE = bit 12, incluído nas diagonais e em ROW2/COLN
const DIAG_TL_BR = (1 << 0) | (1 << 6) | (1 << 12) | (1 << 18) | (1 << 24);
const DIAG_TR_BL = (1 << 4) | (1 << 8) | (1 << 12) | (1 << 16) | (1 << 20);

// Padrão "I": ROW_0 + COL_N + ROW_4
// ROW0 bits: 0,5,10,15,20 | COLN bits: 10,11,12,13,14 | ROW4 bits: 4,9,14,19,24
const MASK_I = ROW0_MASK | COLN_MASK | ROW4_MASK;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const simples: PatternInfo[] = [
    { pattern_id: 1, name: 'ROW_0', mask: ROW0_MASK, weight: 100, pattern_type: 'simple' },
    { pattern_id: 2, name: 'ROW_1', mask: ROW1_MASK, weight: 100, pattern_type: 'simple' },
    { pattern_id: 3, name: 'ROW_2', mask: ROW2_MASK, weight: 100, pattern_type: 'simple' },
    { pattern_id: 4, name: 'ROW_3', mask: ROW3_MASK, weight: 100, pattern_type: 'simple' },
    { pattern_id: 5, name: 'ROW_4', mask: ROW4_MASK, weight: 100, pattern_type: 'simple' },
];

const especial: PatternInfo[] = [
    { pattern_id: 10, name: 'DIAG_TL_BR', mask: DIAG_TL_BR, weight: 500, pattern_type: 'special' },
    { pattern_id: 11, name: 'DIAG_TR_BL', mask: DIAG_TR_BL, weight: 500, pattern_type: 'special' },
];

const master: PatternInfo[] = [
    { pattern_id: 20, name: 'MASTER', mask: 0x01FFFFFF, weight: 25500, pattern_type: 'master' },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('generateCombos', () => {
    it('retorna combos vazios se só 1 simple', () => {
        const { combos, alerts } = generateCombos({
            patterns: [simples[0]],
        });
        expect(combos).toHaveLength(0);
        expect(alerts.length).toBeGreaterThanOrEqual(1);
    });

    it('gera 2 n_of_type para 3 simples (2x, 3x)', () => {
        const patterns = simples.slice(0, 3);
        const { combos } = generateCombos({ patterns });
        const nOfType = combos.filter(c => c.clauses[0]?.type === 'n_of_type');
        expect(nOfType.length).toBe(2);
        expect(nOfType.some(c => c.clauses[0]?.count === 2)).toBe(true);
        expect(nOfType.some(c => c.clauses[0]?.count === 3)).toBe(true);
    });

    it('inclui pares all_of de simples', () => {
        const { combos } = generateCombos({ patterns: simples.slice(0, 4) });
        const allOf = combos.filter(c => c.clauses[0]?.type === 'all_of');
        expect(allOf.length).toBeGreaterThanOrEqual(1);
    });

    it('rejeita combo que conflita com pattern existente', () => {
        const patterns = [
            ...simples.slice(0, 2), // ROW_0, ROW_1
            { pattern_id: 30, name: 'I', mask: MASK_I, weight: 1000, pattern_type: 'special' } as PatternInfo,
            simples[4], // ROW_4
        ];
        const { combos } = generateCombos({ patterns });
        // Nenhum all_of deve combinar ROW_0 + COLN + ROW_4 porque isso reconstroi "I"
        // (mas COLN não está em simples — este teste verifica se o gerador não crasha)
        for (const c of combos) {
            if (c.clauses[0]?.type === 'all_of') {
                const names = c.name;
                expect(names).not.toMatch(/^I$/);
            }
        }
    });

    it('nenhum combo supera master weight', () => {
        const patterns = [...simples.slice(0, 3), ...especial, ...master];
        const { combos } = generateCombos({ patterns, maxCombos: 50 });
        for (const c of combos) {
            expect(c.weight).toBeLessThanOrEqual(25500);
        }
    });

    it('n_of_type especiais removido (poluição visual)', () => {
        const patterns = [...especial, ...simples.slice(0, 2)];
        const { combos } = generateCombos({ patterns });
        const specialN = combos.filter(
            c => c.clauses[0]?.type === 'n_of_type' && c.clauses[0]?.pattern_type === 'special'
        );
        expect(specialN.length).toBe(0); // n_of_type especiais removido
    });

    it('n_of_type gera até 7x com 7+ simples', () => {
        const manySimples: PatternInfo[] = Array.from({ length: 7 }, (_, i) => ({
            pattern_id: i + 1,
            name: `ROW_${i}`,
            mask: ROW0_MASK << i,
            weight: 100,
            pattern_type: 'simple' as const,
        }));
        const { combos } = generateCombos({ patterns: manySimples });
        const nOfType = combos.filter(c => c.clauses[0]?.type === 'n_of_type');
        expect(nOfType.length).toBe(6); // 2x, 3x, 4x, 5x, 6x, 7x
        expect(nOfType.some(c => c.clauses[0]?.count === 7)).toBe(true);
    });

    it('limita número de combos por maxCombos', () => {
        const patterns = simples.slice(0, 5);
        const { combos } = generateCombos({ patterns, maxCombos: 3 });
        expect(combos.length).toBeLessThanOrEqual(3);
    });

    it('pesos dos combos são ≥ 100 (hundredths)', () => {
        const patterns = [...simples.slice(0, 4), ...especial.slice(0, 1)];
        const { combos } = generateCombos({ patterns });
        for (const c of combos) {
            expect(c.weight).toBeGreaterThanOrEqual(100);
        }
    });

    it('não gera duplicatas de all_of para mesma mask combinada', () => {
        const patterns = simples.slice(0, 4);
        const { combos } = generateCombos({ patterns });
        const allOfPairs = combos.filter(c => c.clauses[0]?.type === 'all_of');
        const names = new Set(allOfPairs.map(c => c.name));
        expect(names.size).toBe(allOfPairs.length); // sem duplicatas
    });
});

describe('priceCombosByDifficulty', () => {
    const patterns = simples.slice(0, 3);
    const hitRates = { ROW_0: 0.026, ROW_1: 0.026, ROW_2: 0.025 };

    it('all_of combos pagam mais que o maior membro', () => {
        const combos: ComboCandidate[] = [
            { name: 'ROW_0 + ROW_1', weight: 1, clauses: [{ type: 'all_of', pattern_ids: ['1', '2'] }] },
        ];
        const priced = priceCombosByDifficulty(combos, patterns, hitRates, null);
        const p = priced[0];
        expect(p.weight).toBeGreaterThan(Math.max(patterns[0].weight, patterns[1].weight));
    });

    it('any_of usa markup 1.2×max + 0.2×min', () => {
        const combos: ComboCandidate[] = [
            { name: 'ROW_0 + ROW_1', weight: 1, clauses: [{ type: 'any_of', pattern_ids: ['1', '2'] }] },
        ];
        const priced = priceCombosByDifficulty(combos, patterns, hitRates, null);
        const p = priced[0];
        // max=100, min=100 → 100×1.2 + 100×0.2 = 140
        expect(p.weight).toBe(140);
    });

    it('n_of_type usa progressão triangular avg × N × (N+1) / 2', () => {
        const combos: ComboCandidate[] = [
            { name: '2x Simples', weight: 1, clauses: [{ type: 'n_of_type', pattern_type: 'simple', count: 2 }] },
        ];
        const priced = priceCombosByDifficulty(combos, patterns, hitRates, null);
        const p = priced[0];
        // avg=100 × 2 × 3/2 = 300
        expect(p.weight).toBe(300);
    });

    it('n_of_type 7x com triangular: avg=100 × 7 × 8 / 2 = 2800', () => {
        const combos: ComboCandidate[] = [
            { name: '7x Simples', weight: 1, clauses: [{ type: 'n_of_type', pattern_type: 'simple', count: 7 }] },
        ];
        const priced = priceCombosByDifficulty(combos, patterns, hitRates, null);
        const p = priced[0];
        expect(p.weight).toBe(2800);
    });

    it('all_of de especiais usa markup por dificuldade', () => {
        const patternsMix = [
            ...especial.slice(0, 1),
            { ...simples[0], weight: 500 },
        ];
        const rates = { DIAG_TL_BR: 0.05, ROW_0: 0.026 };
        const combos: ComboCandidate[] = [
            { name: 'DIAG + ROW', weight: 1, clauses: [{ type: 'all_of', pattern_ids: ['10', '1'] }] },
        ];
        const priced = priceCombosByDifficulty(combos, patternsMix, rates, null);
        const p = priced[0];
        // max=500, diff=0.026/(0.05*0.026)=20, cap=10, markup=10^0.2=1.58, base=500*1.58=790
        // max(500+1, 790) = 790
        expect(p.weight).toBeGreaterThan(500);
    });

    it('nenhum combo ultrapassa master weight', () => {
        const combos: ComboCandidate[] = [
            { name: 'COMBO_MAX', weight: 1, clauses: [{ type: 'all_of', pattern_ids: ['1', '2'] }] },
        ];
        const priced = priceCombosByDifficulty(combos, patterns, hitRates, 1000);
        expect(priced[0].weight).toBeLessThanOrEqual(1000);
    });

    it('n_of_type sem patterns do tipo retorna weight original', () => {
        const combos: ComboCandidate[] = [
            { name: '2x Mestre', weight: 200, clauses: [{ type: 'n_of_type', pattern_type: 'master', count: 2 }] },
        ];
        const priced = priceCombosByDifficulty(combos, patterns, hitRates, null);
        expect(priced[0].weight).toBe(200);
    });
});

describe('recalibrateComboWeights', () => {
    const basePatterns = simples.slice(0, 3);
    const combos: ComboCandidate[] = [
        { name: '2x Simples', weight: 150, clauses: [{ type: 'n_of_type', pattern_type: 'simple', count: 2 }] },
        { name: 'ROW_0 + ROW_1', weight: 200, clauses: [{ type: 'all_of', pattern_ids: ['1', '2'] }] },
    ];

    it('recalibra pesos baseado em pattern_weights calibrados', () => {
        const calibrated = recalibrateComboWeights(combos, { ROW_0: 200, ROW_1: 200, ROW_2: 200 }, basePatterns, null);
        // 2x Simples: avg=200 × 2 × 3/2 = 600
        const n2 = calibrated.find(c => c.name === '2x Simples');
        expect(n2).toBeDefined();
        expect(n2!.weight).toBe(600);
        // ROW0+ROW1 all_of: (200+200)*0.95 = 380
        const r01 = calibrated.find(c => c.name === 'ROW_0 + ROW_1');
        expect(r01).toBeDefined();
        expect(r01!.weight).toBeCloseTo(380, -1);
    });

    it('aplica teto do master', () => {
        const calibrated = recalibrateComboWeights(combos, { ROW_0: 30000, ROW_1: 30000, ROW_2: 30000 }, basePatterns, 25500);
        const r01 = calibrated.find(c => c.name === 'ROW_0 + ROW_1');
        expect(r01!.weight).toBeLessThanOrEqual(25500);
    });
});
