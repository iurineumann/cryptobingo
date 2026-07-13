import {
    applyDrawnBalls,
    checkWinPatterns,
    selectBestPayout,
} from './evaluator';
import { bestSatisfiedCombo, type ComboContext } from './combinationEvaluator';
import type { BlockchainTicketRecord } from '@cryptobingo/shared-types';

function makeTicket(matrix: number[], state = 0x00001000): BlockchainTicketRecord {
    return {
        ticket_id: '1',
        owner: 'jogador1',
        matrix,
        state,
    } as BlockchainTicketRecord;
}

const ROW0_MASK = 1082401n; // bits 0,5,10,15,20
const COLB_MASK = 1082401n
    ? 1082401n & (1n << 0n) | (1n << 1n) | (1n << 2n) | (1n << 3n) | (1n << 4n)
    : 0n;

// ==========================================
// applyDrawnBalls — bitmask após bolas
// ==========================================

describe('applyDrawnBalls', () => {
    const MATRIX = [
        1,  2,  3,  4,  5,   // B
        16, 17, 18, 19, 20,  // I
        31, 32, 33, 34,      // N (sem FREE SPACE)
        46, 47, 48, 49, 50,  // G
        61, 62, 63, 64, 65,  // O
    ];

    it('retorna estado inicial com bit 12 setado (FREE SPACE)', () => {
        const state = applyDrawnBalls(makeTicket(MATRIX), []);
        expect(state & (1 << 12)).toBe(1 << 12);
        expect(state).toBe(0x00001000);
    });

    it('seta bit 0 quando bola B-1 (matrix[0]=1) é sorteada', () => {
        const state = applyDrawnBalls(makeTicket(MATRIX), [1]);
        expect(state & (1 << 0)).toBe(1 << 0);
    });

    it('seta bit 24 quando bola O-5 (matrix[23]=65) é sorteada', () => {
        const state = applyDrawnBalls(makeTicket(MATRIX), [65]);
        expect(state & (1 << 24)).toBe(1 << 24);
    });

    it('marca múltiplos bits corretamente', () => {
        const state = applyDrawnBalls(makeTicket(MATRIX), [1, 16, 31, 46, 61]);
        // bits 0 (B0), 5 (I0), 10 (N0), 15 (G0), 20 (O0) → ROW_0
        expect(state & (1 << 0)).toBe(1 << 0);
        expect(state & (1 << 5)).toBe(1 << 5);
        expect(state & (1 << 10)).toBe(1 << 10);
        expect(state & (1 << 15)).toBe(1 << 15);
        expect(state & (1 << 20)).toBe(1 << 20);
    });

    it('ignora bola não presente na cartela', () => {
        const state = applyDrawnBalls(makeTicket(MATRIX), [99]);
        expect(state).toBe(0x00001000);
    });

    it('lida com bit_index > 12 corretamente (shift -1 no matrix index)', () => {
        const state = applyDrawnBalls(makeTicket(MATRIX), [33]);
        // ball 33 está em matrix[12] = 33 (terceiro número da col N, depois do FREE SPACE)
        // bit_index = 13 (pula o 12 que é FREE SPACE)
        expect(state & (1 << 13)).toBe(1 << 13);
    });
});

// ==========================================
// checkWinPatterns — modo dinâmico com weights
// ==========================================

describe('checkWinPatterns', () => {
    const patterns = [
        { name: 'ROW_0', mask: ROW0_MASK, weight: 5 },
        { name: 'COL_B', mask: 31n, weight: 3 },           // bits 0-4
    ];

    it('retorna padrões vencedores quando estado bate', () => {
        const state = (1 << 0) | (1 << 5) | (1 << 10) | (1 << 15) | (1 << 20) | 0x00001000;
        const wins = checkWinPatterns(state, patterns);
        expect(wins.length).toBe(1);
        expect(wins[0].name).toBe('ROW_0');
    });

    it('retorna múltiplos padrões quando estado bate em vários', () => {
        // ROW_0 e COL_B compartilham o bit 0
        const state = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) |
                       (1 << 5) | (1 << 10) | (1 << 15) | (1 << 20) | 0x00001000;
        const wins = checkWinPatterns(state, patterns);
        expect(wins.length).toBe(2);
    });

    it('retorna array vazio quando nenhum padrão bate', () => {
        const state = 0x00001000; // só FREE SPACE
        const wins = checkWinPatterns(state, patterns);
        expect(wins.length).toBe(0);
    });
    it('max_weight rule: primeiro padrão da lista pode não ser o vencedor', () => {
        // Configura: COL_B (weight 3) aparece antes de ROW_0 (weight 5)
        const reversed = [patterns[1], patterns[0]];
        const state = (1 << 0) | (1 << 5) | (1 << 10) | (1 << 15) | (1 << 20) | 0x00001000;
        const wins = checkWinPatterns(state, reversed);
        expect(wins.length).toBe(1);
        // max_weight rule: deve selecionar ROW_0 (weight 5) sobre COL_B (weight 3)
        const best = wins.reduce((a, b) => b.weight > a.weight ? b : a);
        expect(best.name).toBe('ROW_0');
        expect(best.weight).toBe(5);
    });
});

// ==========================================
// REGRESSÃO E2E — jogo 1783899157059 (sala 10 / gametype 1)
// ==========================================
// Cartela 16742076291605053501 deveria pagar "3x Simples" (3 padrões simples:
// ROW_3 + DIAG_TL_BR + DIAG_TR_BL). Usa os dados EXATOS decodificados da
// partida: matrix on-chain (column-major), 40 bolas sorteadas, padrões do
// gametype 1 e contexto de combinação (fail-stale). Reproduz o caminho real
// applyDrawnBalls -> checkWinPatterns -> selectBestPayout.
describe('E2E — jogo 1783899157059 (caminho real do worker)', () => {
    // matrix on-chain (24 bytes, column-major) + state=4096 (FREE bit 12 setado)
    const ONCHAIN_MATRIX = [5, 10, 9, 7, 12, 16, 26, 18, 19, 28, 39, 40, 44, 32, 50, 60, 57, 49, 48, 65, 72, 69, 63, 75];
    const DRAWN_BALLS_40 = [75, 71, 3, 62, 23, 34, 13, 59, 43, 58, 45, 57, 44, 55, 5, 21, 53, 7, 26, 19, 42, 24, 27, 56, 8, 70, 40, 31, 12, 2, 68, 65, 60, 20, 47, 37, 36, 49, 28, 63];

    // padrões do gametype 1 (masks on-chain: ROW_3=8659208, DIAG_TL_BR=17043521, etc.)
    const GT1_PATTERNS = [
        { name: 'ROW_1', mask: 268n,             weight: 100 },
        { name: 'ROW_2', mask: 8589952n,         weight: 100 },
        { name: 'ROW_3', mask: 8659208n,         weight: 100 },
        { name: 'ROW_4', mask: 275969032n,       weight: 100 },
        { name: 'DIAG_TR_BL', mask: 1118480n,    weight: 100 },
        { name: 'DIAG_TL_BR', mask: 17043521n,   weight: 100 },
        { name: 'BINGO_B', mask: 1082401n,       weight: 100 },
        { name: 'BINGO_I', mask: 33818641n,      weight: 100 },
        { name: 'BINGO_N', mask: 1081344n,       weight: 100 },
        { name: 'BINGO_G', mask: 34603056n,      weight: 100 },
        { name: 'BINGO_O', mask: 33818624n,      weight: 100 },
        { name: 'MASTER', mask: 33554431n,       weight: 100 },
        { name: 'ROW_0', mask: 33n,              weight: 100 },
    ];

    // combos "N Simples" do gametype 1 (n_of_type simple)
    const GT1_COMBOS = [
        { combo_id: 0, name: '5x Simples', weight: 1500, clauses: [{ type: 'n_of_type' as const, pattern_type: 'simple', count: 5 }] },
        { combo_id: 1, name: '4x Simples', weight: 1000, clauses: [{ type: 'n_of_type' as const, pattern_type: 'simple', count: 4 }] },
        { combo_id: 2, name: '3x Simples', weight: 600,  clauses: [{ type: 'n_of_type' as const, pattern_type: 'simple', count: 3 }] },
        { combo_id: 3, name: '2x Simples', weight: 300,  clauses: [{ type: 'n_of_type' as const, pattern_type: 'simple', count: 2 }] },
    ];
    const patternTypeByName = new Map<string, string>(
        GT1_PATTERNS.map(p => [p.name, p.name === 'MASTER' ? 'master' : p.name.startsWith('BINGO_') ? 'special' : 'simple']),
    );
    const comboCtx: ComboContext = { combos: GT1_COMBOS, patternTypeByName, patternNameById: new Map() };
    const ticket = makeTicket(ONCHAIN_MATRIX, 4096);

    it('applyDrawnBalls + 40 bolas detecta exatamente 3 padrões simples', () => {
        const state = applyDrawnBalls(ticket, DRAWN_BALLS_40);
        const wins = checkWinPatterns(state, GT1_PATTERNS);
        const names = wins.map(w => w.name).sort();
        expect(names).toEqual(['DIAG_TL_BR', 'DIAG_TR_BL', 'ROW_3'].sort());
    });

    it('selectBestPayout promove 3 padrões simples para "3x Simples" (600)', () => {
        const state = applyDrawnBalls(ticket, DRAWN_BALLS_40);
        const wins = checkWinPatterns(state, GT1_PATTERNS);
        const result = selectBestPayout(ticket, wins, comboCtx);
        expect(result.patternName).toBe('3x Simples');
        expect(result.weight).toBe(600);
    });

    it('bestSatisfiedCombo isolado confirma "3x Simples"', () => {
        const best = bestSatisfiedCombo(['ROW_3', 'DIAG_TL_BR', 'DIAG_TR_BL'], comboCtx);
        expect(best).not.toBeNull();
        expect(best!.name).toBe('3x Simples');
        expect(best!.weight).toBe(600);
    });
});

