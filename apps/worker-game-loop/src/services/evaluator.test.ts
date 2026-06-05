import {
    applyDrawnBalls,
    checkWinPatterns,
} from './evaluator';
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
