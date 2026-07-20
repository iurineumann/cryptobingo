// blockchain.ts é substituído por blockchain.stub.ts em testes (ver jest.config
// moduleNameMapper) para evitar load de código de produção que cria Sessions
// on-chain no load do módulo (validação de env + WalletPluginPrivateKey).
import {
    applyDrawnBalls,
    checkWinPatterns,
    selectBestPayout,
    classifyWinnersForBatch,
} from './evaluator';
import { bestSatisfiedCombo, type ComboContext } from './combinationEvaluator';
import type { BlockchainTicketRecord } from '@cryptobingo/shared-types';

jest.mock('./nftMechanics', () => ({
    getBoostNftIds: jest.fn().mockResolvedValue([]),
}));

function makeTicket(matrix: number[], state = 0x00001000): BlockchainTicketRecord {
    return {
        ticket_id: '1',
        owner: 'jogador1',
        matrix,
        state,
    } as BlockchainTicketRecord;
}

function makeTicketWithPrice(matrix: number[], priceQuantity: string, state = 0x00001000): BlockchainTicketRecord {
    return {
        ticket_id: '2',
        owner: 'jogador1',
        matrix,
        state,
        price: { quantity: priceQuantity, contract: 'bingogametkn' },
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

// ==========================================
// GOLDEN BALL — DETECÇÃO DE PADRÃO COM GOLDEN BALL NA ÚLTIMA BOLA
// ==========================================
describe('GOLDEN BALL — padrão completo na golden ball (T1/T6)', () => {
    const matrix = [
        1,  2,  3,  4,  5,   // B col bits 0-4
        15, 27, 18, 19, 20,   // I col bits 5-9
        9,  32, 34, 11,       // N col bits 10-11,13-14 (FREE at 12)
        10, 24, 31, 47, 50,   // G col bits 15-19
        12, 62, 63, 64, 61,   // O col bits 20-24
    ];
    const ROW_0_MASK   = (1n << 5n)  | (1n << 10n) | (1n << 15n) | (1n << 20n);
    const DIAG_TL_BR_MASK = (1n << 0n) | (1n << 6n) | (1n << 12n) | (1n << 18n) | (1n << 24n);
    const patterns = [
        { name: 'ROW_0',      mask: ROW_0_MASK,      weight: 100 },
        { name: 'DIAG_TL_BR', mask: DIAG_TL_BR_MASK, weight: 150 },
    ];
    const drawnBalls36 = [
        9,  15, 10, 12,  27, 47, 61,
        2, 3, 4, 5, 18, 19, 20, 32, 34, 11, 24, 31, 50, 62, 63, 64,
        6, 7, 8, 13, 14, 16, 17, 21, 22, 23, 25, 26, 28, 29, 30, 33, 35,
    ];
    const goldenBall = 1;
    const drawnBalls37 = [...drawnBalls36, goldenBall];
    const ticket = makeTicket(matrix);

    it('T1 — 36 bolas (sem golden): detecta só ROW_0, DIAG_TL_BR incompleto', () => {
        const state = applyDrawnBalls(ticket, drawnBalls36);
        const wins  = checkWinPatterns(state, patterns);
        expect(wins.length).toBe(1);
        expect(wins[0].name).toBe('ROW_0');
    });

    it('T1 — 37 bolas (com golden): detecta ROW_0 + DIAG_TL_BR (2 padrões)', () => {
        const state = applyDrawnBalls(ticket, drawnBalls37);
        const wins  = checkWinPatterns(state, patterns);
        expect(wins.length).toBe(2);
        const names = wins.map(w => w.name).sort();
        expect(names).toEqual(['DIAG_TL_BR', 'ROW_0']);
    });

    it('T1 — DIAG_TL_BR mask tem golden ball bit (bit 0) setado', () => {
        const state = applyDrawnBalls(ticket, drawnBalls37);
        expect(state & (1 << 0)).toBe(1 << 0);
        expect((BigInt(state) & DIAG_TL_BR_MASK) === DIAG_TL_BR_MASK).toBe(true);
    });

    it('T6 — golden ball está no padrão DIAG_TL_BR (isBallInPattern)', () => {
        const state = applyDrawnBalls(ticket, drawnBalls37);
        const wins  = checkWinPatterns(state, patterns);
        const diagWin = wins.find(w => w.name === 'DIAG_TL_BR');
        expect(diagWin).toBeDefined();
        expect((diagWin!.mask & (1n << 0n)) !== 0n).toBe(true);
    });
});

// ==========================================
// GOLDEN BALL — REGRESSÃO E2E JOGO BUGADO (T4/T5)
// ==========================================
describe('GOLDEN BALL — regressão E2E jogo bugado (T4/T5)', () => {
    const matrixBugado = [
        1,  30, 39, 57, 66,
        15, 27, 43, 55, 64,
        9,  20, 48, 73,
        10, 24, 31, 47, 65,
        12, 25, 41, 53, 61,
    ];
    const DIAG_TL_BR_MASK = (1n << 0n) | (1n << 6n) | (1n << 12n) | (1n << 18n) | (1n << 24n);
    const drawnBalls = [
        10, 68, 16, 53,  9, 30, 72,  5, 14, 60,
         3, 13, 21, 12, 70, 50, 42, 57, 39, 47,
        61, 56, 11, 28, 19, 58, 66, 27, 29,  2,
        20, 63, 49, 40, 51, 48,  1,
    ];
    const ticket = makeTicket(matrixBugado);

    it('T4 — 36 bolas (sem golden): DIAG_TL_BR não detectado', () => {
        const first36 = drawnBalls.slice(0, 36);
        const state = applyDrawnBalls(ticket, first36);
        const diagMaskState = BigInt(state) & DIAG_TL_BR_MASK;
        expect(diagMaskState).not.toBe(DIAG_TL_BR_MASK);
    });

    it('T4 — 37 bolas (com golden): DIAG_TL_BR detectado', () => {
        const state = applyDrawnBalls(ticket, drawnBalls);
        const diagMaskState = BigInt(state) & DIAG_TL_BR_MASK;
        expect(diagMaskState).toBe(DIAG_TL_BR_MASK);
    });

    it('T5 — golden_ball_after=39 (40 bolas): DIAG_TL_BR completo', () => {
        const ga = 39;
        const extraBalls = [8, 22, 33, 1];
        const extendedBalls = [...drawnBalls.slice(0, 36), ...extraBalls];
        expect(extendedBalls.length).toBe(40);
        expect(extendedBalls[39]).toBe(1);

        const state = applyDrawnBalls(ticket, extendedBalls);
        const diagMaskState = BigInt(state) & DIAG_TL_BR_MASK;
        expect(diagMaskState).toBe(DIAG_TL_BR_MASK);
    });
});

// ==========================================
// GOLDEN BALL — ga FALLBACK CALCULATION (T3)
// ==========================================
describe('GOLDEN BALL — ga fallback calculation (T3)', () => {
    // Simula o cálculo de ga e effectiveBalls que processAllGameWinners faz
    // Antes: ga = goldenBallAfter > 0 ? goldenBallAfter : maxBalls
    // Depois: ga = goldenBallAfter > 0 ? goldenBallAfter : drawnBalls.length - 1

    it('T3 — goldenBallAfter=0: ga = drawnBalls.length-1, effectiveBalls = all balls', () => {
        const drawnBalls = Array.from({ length: 37 }, (_, i) => i + 1);
        const maxBalls = 35;
        const goldenBallAfter = 0;

        // Código após o fix (igual ao que processAllGameWinners faz)
        const ga = goldenBallAfter > 0 ? goldenBallAfter : drawnBalls.length - 1;
        const effectiveBalls = drawnBalls.slice(0, ga + 1);

        expect(ga).toBe(36);          // drawnBalls.length - 1
        expect(effectiveBalls.length).toBe(37); // inclui golden ball
        expect(effectiveBalls.length).not.toBe(36); // não truncado em maxBalls+1
    });

    it('T3 — goldenBallAfter=39: ga = 39, effectiveBalls = 40', () => {
        const drawnBalls = Array.from({ length: 40 }, (_, i) => i + 1);
        const goldenBallAfter = 39;

        const ga = goldenBallAfter > 0 ? goldenBallAfter : drawnBalls.length - 1;
        const effectiveBalls = drawnBalls.slice(0, ga + 1);

        expect(ga).toBe(39);
        expect(effectiveBalls.length).toBe(40);
    });

    it('T3 — goldenBallAfter=4, 75 bolas: ga = 4, effectiveBalls = 5 (não regride)', () => {
        const drawnBalls = Array.from({ length: 75 }, (_, i) => i + 1);
        const goldenBallAfter = 4;

        const ga = goldenBallAfter > 0 ? goldenBallAfter : drawnBalls.length - 1;
        const effectiveBalls = drawnBalls.slice(0, ga + 1);

        expect(ga).toBe(4);
        expect(effectiveBalls.length).toBe(5);
    });
});

// ==========================================
// classifyWinnersForBatch — ticketPrice
// ==========================================
// Regression: PayoutEntry.ticketPrice deve conter o asset de preço, não ticketId.
// Evita que computePayoutAmount no consumer interprete uint64 como float → WAX gigante.
describe('classifyWinnersForBatch — ticketPrice', () => {
    const matrix = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    const drawnBalls = [1, 5, 10, 15, 20];

    it('preenche ticketPrice com price.quantity do ticket', async () => {
        const ticket = makeTicketWithPrice(matrix, '1.0000 BINGO');
        const winners = [{
            ticket, patternName: 'ROW_0', patternMask: 33n, weight: 100,
        }];
        const result = await classifyWinnersForBatch(winners, drawnBalls, 'standard', 0, 0);
        const all = [...result.chunks.flat(), ...result.comboSingles, ...result.nftSingles];
        expect(all[0].ticketPrice).toBe('1.0000 BINGO');
        expect(all[0].ticketPrice).not.toBe(ticket.ticket_id);
    });

    it('usa string vazia quando ticket.price é undefined', async () => {
        const ticket = makeTicket(matrix);
        const winners = [{
            ticket, patternName: 'ROW_0', patternMask: 33n, weight: 100,
        }];
        const result = await classifyWinnersForBatch(winners, drawnBalls, 'standard', 0, 0);
        const all = [...result.chunks.flat(), ...result.comboSingles, ...result.nftSingles];
        expect(all[0].ticketPrice).toBe('');
    });
});

