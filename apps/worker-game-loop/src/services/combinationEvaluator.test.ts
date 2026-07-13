// apps/worker-game-loop/src/services/combinationEvaluator.test.ts
//
// ADR-016 — testes da avaliação pura de combinações (sem rede/chain).

import {
    isComboSatisfied,
    bestSatisfiedCombo,
    type ComboDef,
    type ComboContext,
} from './combinationEvaluator';

// gametype 3: ids 1-7 simple (ROW_0..ROW_4, DIAG_TL_BR, DIAG_TR_BL),
// 8-12 special (BINGO_*), 13 master.
const patternNameById = new Map<string, string>([
    ['1', 'ROW_0'], ['2', 'ROW_1'], ['3', 'ROW_2'], ['4', 'ROW_3'], ['5', 'ROW_4'],
    ['6', 'DIAG_TL_BR'], ['7', 'DIAG_TR_BL'],
    ['8', 'BINGO_B'], ['13', 'MASTER'],
]);
const patternTypeByName = new Map<string, string>([
    ['ROW_0', 'simple'], ['ROW_1', 'simple'], ['ROW_2', 'simple'], ['ROW_3', 'simple'],
    ['ROW_4', 'simple'], ['DIAG_TL_BR', 'simple'], ['DIAG_TR_BL', 'simple'],
    ['BINGO_B', 'special'], ['MASTER', 'master'],
]);

// Combinações "N Simples" (n_of_type simple), pesos ×2,5 progressivos.
const combos: ComboDef[] = [
    { combo_id: 0, name: '2 Simples', weight: 250,  clauses: [{ type: 'n_of_type', pattern_type: 'simple', count: 2 }] },
    { combo_id: 1, name: '3 Simples', weight: 625,  clauses: [{ type: 'n_of_type', pattern_type: 'simple', count: 3 }] },
    { combo_id: 2, name: '4 Simples', weight: 1563, clauses: [{ type: 'n_of_type', pattern_type: 'simple', count: 4 }] },
    { combo_id: 3, name: '5 Simples', weight: 3906, clauses: [{ type: 'n_of_type', pattern_type: 'simple', count: 5 }] },
    { combo_id: 4, name: '6 Simples', weight: 9766, clauses: [{ type: 'n_of_type', pattern_type: 'simple', count: 6 }] },
];

const ctx: ComboContext = { combos, patternTypeByName, patternNameById };

describe('isComboSatisfied — n_of_type', () => {
    const c2 = combos[0]; // 2 Simples
    const c6 = combos[4]; // 6 Simples

    it('satisfaz "2 Simples" com exatamente 2 padrões simples', () => {
        const won = new Set(['ROW_0', 'DIAG_TL_BR']);
        expect(isComboSatisfied(c2, won, patternTypeByName, patternNameById)).toBe(true);
    });

    it('NÃO satisfaz "2 Simples" com apenas 1 simples', () => {
        const won = new Set(['ROW_0']);
        expect(isComboSatisfied(c2, won, patternTypeByName, patternNameById)).toBe(false);
    });

    it('padrões special/master não contam como simple', () => {
        const won = new Set(['ROW_0', 'BINGO_B', 'MASTER']);
        expect(isComboSatisfied(c2, won, patternTypeByName, patternNameById)).toBe(false);
    });

    it('satisfaz "6 Simples" com 6+ simples', () => {
        const won = new Set(['ROW_0', 'ROW_1', 'ROW_2', 'ROW_3', 'ROW_4', 'DIAG_TL_BR']);
        expect(isComboSatisfied(c6, won, patternTypeByName, patternNameById)).toBe(true);
    });

    it('NÃO satisfaz "6 Simples" com 5 simples', () => {
        const won = new Set(['ROW_0', 'ROW_1', 'ROW_2', 'ROW_3', 'ROW_4']);
        expect(isComboSatisfied(c6, won, patternTypeByName, patternNameById)).toBe(false);
    });
});

describe('isComboSatisfied — all_of / any_of', () => {
    const allOf: ComboDef = { combo_id: 9, name: 'B+Master', weight: 500, clauses: [{ type: 'all_of', pattern_ids: ['8', '13'] }] };
    const anyOf: ComboDef = { combo_id: 10, name: 'Qualquer diag', weight: 300, clauses: [{ type: 'any_of', pattern_ids: ['6', '7'] }] };

    it('all_of exige TODOS os pattern_ids (resolvidos por nome)', () => {
        expect(isComboSatisfied(allOf, new Set(['BINGO_B', 'MASTER']), patternTypeByName, patternNameById)).toBe(true);
        expect(isComboSatisfied(allOf, new Set(['BINGO_B']), patternTypeByName, patternNameById)).toBe(false);
    });

    it('any_of exige AO MENOS UM pattern_id', () => {
        expect(isComboSatisfied(anyOf, new Set(['DIAG_TL_BR']), patternTypeByName, patternNameById)).toBe(true);
        expect(isComboSatisfied(anyOf, new Set(['ROW_0']), patternTypeByName, patternNameById)).toBe(false);
    });

    it('all_of casa quando a cartela tem os NOMES diretamente', () => {
        // wonPatternNames já contém nomes; ids são resolvidos via patternNameById
        expect(isComboSatisfied(allOf, new Set(['BINGO_B', 'MASTER', 'ROW_0']), patternTypeByName, patternNameById)).toBe(true);
    });
});

describe('bestSatisfiedCombo — max_weight entre combinações aninhadas', () => {
    it('retorna a MAIOR combinação satisfeita (6 simples → "6 Simples")', () => {
        const won = ['ROW_0', 'ROW_1', 'ROW_2', 'ROW_3', 'ROW_4', 'DIAG_TL_BR', 'DIAG_TR_BL'];
        const best = bestSatisfiedCombo(won, ctx);
        expect(best).not.toBeNull();
        expect(best!.combo_id).toBe(4);
        expect(best!.name).toBe('6 Simples');
        expect(best!.weight).toBe(9766);
    });

    it('com 3 simples, a maior satisfeita é "3 Simples"', () => {
        const won = ['ROW_0', 'ROW_1', 'ROW_2'];
        const best = bestSatisfiedCombo(won, ctx);
        expect(best!.combo_id).toBe(1);
        expect(best!.weight).toBe(625);
    });

    it('com 1 simples, nenhuma combinação é satisfeita', () => {
        expect(bestSatisfiedCombo(['ROW_0'], ctx)).toBeNull();
    });

    it('contexto sem combinações → null', () => {
        const emptyCtx: ComboContext = { combos: [], patternTypeByName, patternNameById };
        expect(bestSatisfiedCombo(['ROW_0', 'ROW_1'], emptyCtx)).toBeNull();
    });
});

// ==========================================
// REGRESSÃO — incidente jogo 1783899157059 (sala 10)
// ==========================================
// O worker pagou apenas ROW_3 (padrão único, weight 100) em vez do combo
// "3x Simples" (weight 600), porque fetchComboContext falhou-open (api-gateway
// instável pós-restauração) e retornou contexto VAZIO -> bestSatisfiedCombo null
// -> prêmio rebaixado silenciosamente. O fix torna o fetchComboContext fail-stale:
// mantém o último contexto bem-sucedido.
describe('fetchComboContext — fail-stale (regressão #1783899157059)', () => {
    const { fetchComboContext, clearComboCache } = require('./combinationEvaluator');

    // combos reais do gametype 1 ("N Simples", n_of_type simple)
    const combosGt1 = [
        { combo_id: 0, name: '5x Simples', weight: 1500, clauses: [{ type: 'n_of_type', pattern_type: 'simple', count: 5 }] },
        { combo_id: 1, name: '4x Simples', weight: 1000, clauses: [{ type: 'n_of_type', pattern_type: 'simple', count: 4 }] },
        { combo_id: 2, name: '3x Simples', weight: 600,  clauses: [{ type: 'n_of_type', pattern_type: 'simple', count: 3 }] },
        { combo_id: 3, name: '2x Simples', weight: 300,  clauses: [{ type: 'n_of_type', pattern_type: 'simple', count: 2 }] },
    ];
    const setupGt1 = () => {
        // api-gateway retorna combos + rules (todos simple)
        const okJson = {
            patterns: combosGt1.map((_, i) => ({ pattern_id: String(i + 1), name: `P${i + 1}`, mask: '1', weight: 100 })),
            rules: combosGt1.map((_, i) => ({ pattern_id: String(i + 1), weight: 100, type: 'simple' })),
            combinations: combosGt1,
        };
        return okJson;
    };

    beforeEach(() => { clearComboCache(); jest.resetModules(); });
    afterEach(() => { clearComboCache(); });

    it('mantém o último contexto válido quando o api-gateway falha (não rebaixa prêmio)', async () => {
        const okJson = setupGt1();
        // 1º fetch: sucesso -> popula lastGoodCtx
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => okJson }) as any;
        const first = await fetchComboContext('1');
        expect(first.combos.length).toBe(4);

        // 2º fetch: api-gateway cai (erro de rede) -> deve usar fail-stale, NÃO vazio
        global.fetch = jest.fn().mockRejectedValue(new Error('api-gateway down')) as any;
        const second = await fetchComboContext('1');
        expect(second.combos.length).toBe(4);
        expect(second.patternTypeByName.size).toBeGreaterThan(0);
    });

    it('com contexto válido, 3 padrões simples promovem para "3x Simples" mesmo após falha do gateway', async () => {
        const okJson = setupGt1();
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => okJson }) as any;
        const ctxOk = await fetchComboContext('1');
        // simula a cartela do incidente: 3 padrões simples
        const won = ['ROW_3', 'DIAG_TL_BR', 'DIAG_TR_BL'];
        // patternTypeByName precisa classificar esses nomes como simple
        for (const n of won) ctxOk.patternTypeByName.set(n, 'simple');
        const best = bestSatisfiedCombo(won, ctxOk);
        expect(best).not.toBeNull();
        expect(best!.name).toBe('3x Simples');
        expect(best!.weight).toBe(600);
    });
});

