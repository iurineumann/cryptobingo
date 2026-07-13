// apps/worker-game-loop/src/services/combo-payment-regression.test.ts
//
// TESTES DE REGRESSÃO — PAGAMENTO DE COMBINAÇÕES (ADR-016 / ADR-030)
// ===================================================================
// Objetivo: travar o comportamento correto do pagamento de combinações e
// impedir que correções futuras reintroduzam os bugs abaixo. Cada suite
// mapeia UM ponto corrigido e falha em vermelho se a regressão voltar.
//
// Incidentes cobertos:
//   • Jogo 1783899157059 — pago só ROW_3 (padrão) por fail-open do combo ctx.
//   • Jogo 1783965535490 — zombie em `drawn`: fail-stale servia combo obsoleto
//     p/ gametype sem combos on-chain → claimcombo falhava → jogo travava.
//   • Jogo 1783971954643 — cartela #10979199230376478643 fez "2x Simples"
//     mas recebeu 1.00x (padrão) em vez de 3.00x: combos no MongoDB mas
//     `combinations: []` on-chain (DRIFT). Corrigido via setcombos (tx c9882551).
//
// Pontos validados:
//   1. computePayoutAmount: combo weight → payout correto (3.00x, 6.00x, 15.00x).
//   2. selectBestPayout: promove N padrões simples para o combo de maior tier.
//   3. bestSatisfiedCombo: "2x Simples" satisfeito com 2 padrões simples.
//   4. fetchComboContext: contrato com combos vazio ⇒ contexto vazio (NÃO
//      fail-stale) — evita servir combo fantasma p/ gametype sem combos.
//   5. fetchComboContext: fail-stale APENAS em falha de rede (não em vazio).
//   6. E2E: cartela 2x Simples paga 3.00x, não 1.00x (o bug do jogo 1783971954643).

import {
    computePayoutAmount,
    selectBestPayout,
    applyDrawnBalls,
    checkWinPatterns,
    type WinResult,
} from './evaluator';
import {
    fetchComboContext,
    bestSatisfiedCombo,
    isComboSatisfied,
    clearComboCache,
    type ComboContext,
} from './combinationEvaluator';
import type { BlockchainTicketRecord } from '@cryptobingo/shared-types';

jest.mock('./patternCache', () => ({
    fetchPatternsWithCache: jest.fn().mockResolvedValue([]),
}));

function makeTicket(matrix: number[], state = 0x00001000): BlockchainTicketRecord {
    return { ticket_id: '1', owner: 'jogador1', matrix, state } as BlockchainTicketRecord;
}

// Combos on-chain REAIS do gametype 1 (weights hundredths), sincronizados via
// setcombos (tx c9882551). combo_id = índice canônico off-chain.
const GT1_COMBOS = [
    { combo_id: 0, name: '5x Simples', weight: 1500, clauses: [{ type: 'n_of_type' as const, pattern_type: 'simple', count: 5 }] },
    { combo_id: 1, name: '4x Simples', weight: 1000, clauses: [{ type: 'n_of_type' as const, pattern_type: 'simple', count: 4 }] },
    { combo_id: 2, name: '3x Simples', weight: 600,  clauses: [{ type: 'n_of_type' as const, pattern_type: 'simple', count: 3 }] },
    { combo_id: 3, name: '2x Simples', weight: 300,  clauses: [{ type: 'n_of_type' as const, pattern_type: 'simple', count: 2 }] },
];

const GT1_PATTERNS = [
    { name: 'ROW_1', mask: 268n,           weight: 100 },
    { name: 'ROW_2', mask: 8589952n,       weight: 100 },
    { name: 'ROW_3', mask: 8659208n,       weight: 100 },
    { name: 'ROW_4', mask: 275969032n,     weight: 100 },
    { name: 'DIAG_TR_BL', mask: 1118480n,  weight: 100 },
    { name: 'DIAG_TL_BR', mask: 17043521n, weight: 100 },
    { name: 'BINGO_B', mask: 1082401n,     weight: 100 },
    { name: 'BINGO_N', mask: 1081344n,     weight: 100 },
    { name: 'MASTER',  mask: 33554431n,    weight: 100 },
    { name: 'ROW_0',   mask: 33n,          weight: 100 },
];

const patternTypeByName = new Map<string, string>(
    GT1_PATTERNS.map(p => [p.name, p.name === 'MASTER' ? 'master' : p.name.startsWith('BINGO_') ? 'special' : 'simple']),
);
const comboCtx: ComboContext = { combos: GT1_COMBOS, patternTypeByName, patternNameById: new Map() };

// ============================================================
// 1. computePayoutAmount — combo weight → prêmio correto
// ============================================================
describe('REGRESSÃO 1 — computePayoutAmount aplica combo weight (não padrão)', () => {
    // ticket price 1.0000 BINGO, base_multiplier 1
    it('2x Simples (weight 300) → 3.00x → 3.0000 BINGO (NÃO 1.0000)', () => {
        const r = computePayoutAmount('1.0000 BINGO', 1, 300, 0);
        expect(r).toEqual({ amount: 3, currency: 'BINGO' });
        expect(r.amount).not.toBe(1); // o bug pagava 1.0000 (padrão weight 100)
    });
    it('3x Simples (weight 600) → 6.00x → 6.0000 BINGO', () => {
        expect(computePayoutAmount('1.0000 BINGO', 1, 600, 0)).toEqual({ amount: 6, currency: 'BINGO' });
    });
    it('4x Simples (weight 1000) → 10.00x → 10.0000 BINGO', () => {
        expect(computePayoutAmount('1.0000 BINGO', 1, 1000, 0)).toEqual({ amount: 10, currency: 'BINGO' });
    });
    it('5x Simples (weight 1500) → 15.00x → 15.0000 BINGO', () => {
        expect(computePayoutAmount('1.0000 BINGO', 1, 1500, 0)).toEqual({ amount: 15, currency: 'BINGO' });
    });
    it('padrão simples (weight 100) → 1.00x → 1.0000 BINGO (baseline do bug)', () => {
        expect(computePayoutAmount('1.0000 BINGO', 1, 100, 0)).toEqual({ amount: 1, currency: 'BINGO' });
    });
});

// ============================================================
// 2 & 3. bestSatisfiedCombo / selectBestPayout — tier correto
// ============================================================
describe('REGRESSÃO 2 — bestSatisfiedCombo escolhe o tier de combo correto', () => {
    it('2 padrões simples → "2x Simples" (weight 300)', () => {
        const best = bestSatisfiedCombo(['ROW_0', 'ROW_1'], comboCtx);
        expect(best).not.toBeNull();
        expect(best!.name).toBe('2x Simples');
        expect(best!.weight).toBe(300);
    });
    it('3 padrões simples → "3x Simples" (weight 600), maior tier vence', () => {
        const best = bestSatisfiedCombo(['ROW_0', 'ROW_1', 'ROW_2'], comboCtx);
        expect(best!.name).toBe('3x Simples');
        expect(best!.weight).toBe(600);
    });
    it('5 padrões simples → "5x Simples" (weight 1500)', () => {
        const best = bestSatisfiedCombo(['ROW_0', 'ROW_1', 'ROW_2', 'ROW_3', 'ROW_4'], comboCtx);
        expect(best!.name).toBe('5x Simples');
        expect(best!.weight).toBe(1500);
    });
    it('1 padrão só → nenhum combo satisfeito (paga padrão)', () => {
        expect(bestSatisfiedCombo(['ROW_0'], comboCtx)).toBeNull();
    });
    it('isComboSatisfied conta apenas padrões do tipo "simple"', () => {
        const won = new Set(['ROW_0', 'ROW_1', 'MASTER']); // MASTER não conta p/ "n simples"
        expect(isComboSatisfied(GT1_COMBOS[3], won, patternTypeByName, new Map())).toBe(true);  // 2 simples ✓
        expect(isComboSatisfied(GT1_COMBOS[2], won, patternTypeByName, new Map())).toBe(false); // precisa 3 simples
    });
});

describe('REGRESSÃO 3 — selectBestPayout promove combo sobre padrão', () => {
    it('2 padrões simples vencedores → paga "2x Simples" com comboId (NÃO padrão)', () => {
        const wins = [GT1_PATTERNS[9], GT1_PATTERNS[0]]; // ROW_0 + ROW_1
        const r: WinResult = selectBestPayout(makeTicket([]), wins, comboCtx);
        expect(r.patternName).toBe('2x Simples');
        expect(r.weight).toBe(300);
        expect(r.comboId).toBe(3); // comboId presente ⇒ claimcombo, não claimwin
    });
    it('sem comboCtx → cai para padrão (weight 100, sem comboId)', () => {
        const wins = [GT1_PATTERNS[9], GT1_PATTERNS[0]];
        const r = selectBestPayout(makeTicket([]), wins, null);
        expect(r.weight).toBe(100);
        expect(r.comboId).toBeUndefined();
    });
});

// ============================================================
// 4 & 5. fetchComboContext — vazio on-chain NÃO usa fail-stale
// ============================================================
describe('REGRESSÃO 4 — contrato sem combos ⇒ contexto vazio (evita zombie/drift)', () => {
    const realFetch = global.fetch;
    const ON_CHAIN = [{ name: 'ROW_0', mask: 33n, weight: 100 }];
    const bodyWithCombos = {
        patterns: [{ pattern_id: '1', name: 'ROW_0', mask: '33', weight: 100 }],
        rules: [{ pattern_id: '1', weight: 100, type: 'simple' }],
        combinations: [{ combo_id: 3, name: '2x Simples', weight: 300, clauses: [{ type: 'n_of_type', pattern_type: 'simple', count: 2 }] }],
    };
    const bodyEmptyCombos = { ...bodyWithCombos, combinations: [] };

    beforeEach(() => clearComboCache());
    afterEach(() => { (global as any).fetch = realFetch; jest.restoreAllMocks(); });

    it('gateway retorna combos vazio ⇒ ctx.combos vazio (NÃO serve combo fantasma)', async () => {
        (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => bodyEmptyCombos });
        const ctx = await fetchComboContext('1', ON_CHAIN as any);
        expect(ctx.combos).toHaveLength(0);
    });

    it('após ter combos, se gateway volta a retornar vazio ⇒ NÃO usa fail-stale', async () => {
        // 1º fetch: com combos (popula lastGoodCtx)
        (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => bodyWithCombos });
        const ok = await fetchComboContext('1', ON_CHAIN as any);
        expect(ok.combos).toHaveLength(1);
        clearComboCache('1'); // expira cache curto, mantém lastGoodCtx
        // 2º fetch: combos vazio (contrato sem combos) ⇒ DEVE retornar vazio, não o stale
        (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => bodyEmptyCombos });
        const empty = await fetchComboContext('1', ON_CHAIN as any);
        expect(empty.combos).toHaveLength(0); // regressão do jogo 1783965535490
    });

    it('fail-stale SÓ em falha de REDE: gateway lança ⇒ usa último ctx válido', async () => {
        (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => bodyWithCombos });
        await fetchComboContext('1', ON_CHAIN as any); // popula lastGoodCtx
        clearComboCache('1');
        (global as any).fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
        const stale = await fetchComboContext('1', ON_CHAIN as any);
        expect(stale.combos).toHaveLength(1); // fail-stale em falha de rede é seguro
    });
});

// ============================================================
// 6. E2E — cartela 2x Simples paga 3.00x (bug jogo 1783971954643)
// ============================================================
// Cartela com 2 padrões simples vencedores (ROW_0 + ROW_1) DEVE ser paga como
// "2x Simples" (weight 300 = 3.00x), não como padrão comum (weight 100 = 1.00x).
describe('REGRESSÃO 6 — E2E cartela "2x Simples" paga 3.00x (não 1.00x)', () => {
    // matrix onde ROW_0 (bolas B1,I16,N31,G46,O61) e ROW_1 formam 2 linhas
    const MATRIX = [
        1, 2, 3, 4, 5,      // B
        16, 17, 18, 19, 20, // I
        31, 32, 33, 34,     // N (sem FREE)
        46, 47, 48, 49, 50, // G
        61, 62, 63, 64, 65, // O
    ];
    // bolas que completam ROW_0 (1,16,31,46,61) e ROW_1 (2,17,32,47,62)
    const DRAWN = [1, 16, 31, 46, 61, 2, 17, 32, 47, 62];

    // padrões ROW_0 e ROW_1 pelas máscaras reais da matrix column-major
    const ROWS = [
        { name: 'ROW_0', mask: (1n<<0n)|(1n<<5n)|(1n<<10n)|(1n<<15n)|(1n<<20n), weight: 100 },
        { name: 'ROW_1', mask: (1n<<1n)|(1n<<6n)|(1n<<11n)|(1n<<16n)|(1n<<21n), weight: 100 },
    ];
    const ctx: ComboContext = {
        combos: GT1_COMBOS,
        patternTypeByName: new Map([['ROW_0', 'simple'], ['ROW_1', 'simple']]),
        patternNameById: new Map(),
    };

    it('detecta 2 padrões simples e promove para "2x Simples" (weight 300)', () => {
        const ticket = makeTicket(MATRIX, 0x00001000);
        const state = applyDrawnBalls(ticket, DRAWN);
        const wins = checkWinPatterns(state, ROWS);
        expect(wins.map(w => w.name).sort()).toEqual(['ROW_0', 'ROW_1']);

        const payout = selectBestPayout(ticket, wins, ctx);
        expect(payout.patternName).toBe('2x Simples');
        expect(payout.weight).toBe(300);
        expect(payout.comboId).toBe(3);
    });

    it('valor final: 1.0000 BINGO × 1 × 300/100 = 3.0000 (o jogador recebe o devido)', () => {
        const ticket = makeTicket(MATRIX, 0x00001000);
        const state = applyDrawnBalls(ticket, DRAWN);
        const wins = checkWinPatterns(state, ROWS);
        const payout = selectBestPayout(ticket, wins, ctx);
        const amount = computePayoutAmount('1.0000 BINGO', 1, payout.weight, 0);
        expect(amount).toEqual({ amount: 3, currency: 'BINGO' });
        expect(amount.amount).not.toBe(1); // o bug pagava 1.0000
    });
});
