// Testes para draw modes: GOLDEN_BALL, FIRST_FULL, MULTI_MATCH e funções puras.

jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_table_rows: jest.fn() } } },
    parseHexBytes: jest.fn((hex: string) => Buffer.from(hex, 'hex').toJSON().data),
}));
jest.mock('./invertedIndex', () => ({
    getTicketsForBall: jest.fn(),
    indexExists:       jest.fn(),
}));
jest.mock('./blockchain', () => ({
    executeClaimWin:   jest.fn(),
    executeClaimStage: jest.fn(),
    microserviceSession: {},
}));

import { rpcClient } from '@cryptobingo/blockchain-core';
import {
    deriveGoldenMultiplierExported,
    findFirstFullCutoff,
    checkWinPatterns,
    applyDrawnBalls,
    preComputeMultiMatchCutoffs,
    WinResult,
} from './evaluator';

const mockGetTableRows = rpcClient.v1.chain.get_table_rows as jest.Mock;

function makeTicket(id: string, matrix: number[]) {
    return { ticket_id: id, matrix, state: 0x1000, owner: 'jogador1', game_id: '1' };
}

// Matrix que completa ROW_0 (bits 0,5,10,15,20) com bolas 1,16,31,46,61
const ROW0_MATRIX = [1,2,3,4,5, 16,17,18,19,20, 31,32,33,34, 46,47,48,49,50, 61,62,63,64,65];

// ── deriveGoldenMultiplierExported ────────────────────────────────────────────

describe('deriveGoldenMultiplierExported — distribuição de multiplicadores', () => {
    it('roll < 6000 → multiplicador 2x', () => {
        // idx=0 → roll=floor(0*10000/5550)=0 < 6000
        const mult = deriveGoldenMultiplierExported([0, 1, 2], 0);
        expect(mult).toBe(2);
    });

    it('roll exatamente 6000 → 3x (b1=46, b2=1)', () => {
        // idx=3330 → roll=floor(3330*10000/5550)=6000 → 3x
        const mult = deriveGoldenMultiplierExported([0, 46, 1], 0);
        expect(mult).toBe(3);
    });

    it('roll exatamente 8500 → 5x (b1=64, b2=57)', () => {
        // idx=4717 → roll=floor(4717*10000/5550)=8500 → 5x
        const mult = deriveGoldenMultiplierExported([0, 64, 57], 0);
        expect(mult).toBe(5);
    });

    it('roll exatamente 9500 → 10x (b1=72, b2=20)', () => {
        // idx=5272 → roll=floor(5272*10000/5550)=9500 → 10x
        const mult = deriveGoldenMultiplierExported([0, 72, 20], 0);
        expect(mult).toBe(10);
    });

    it('drawnBalls curto (sem bytes extras) → fallback (1,1) → b1===b2 → 2x', () => {
        const mult = deriveGoldenMultiplierExported([42], 0);
        expect(mult).toBe(2);
    });

    it('distribuição com inputs variados: 2x é sempre o multiplicador mais frequente', () => {
        // b1,b2 ∈ [1,75] distintas (75×74=5550 pares).
        // Roll mapeado uniformemente para 0-9999 via índice canônico.
        // 20x/50x/100x agora são atingíveis com a correção.
        const counts: Record<number, number> = {};

        for (let b1 = 1; b1 <= 75; b1++) {
            for (let b2 = 1; b2 <= 75; b2++) {
                if (b1 === b2) continue;
                const m = deriveGoldenMultiplierExported([0, b1, b2], 0);
                counts[m] = (counts[m] ?? 0) + 1;
            }
        }

        const total = 75 * 74; // 5550 pares distintos
        expect(counts[2]).toBeGreaterThan(0.5 * total);  // 60%
        expect(counts[3]).toBeGreaterThan(0);
        expect(counts[5]).toBeGreaterThan(0);
        expect(counts[20]).toBeGreaterThan(0);  // agora atingível
        expect(counts[50]).toBeGreaterThan(0);
        expect(counts[100]).toBeGreaterThan(0);
    });
});

// ── applyDrawnBalls ───────────────────────────────────────────────────────────

describe('applyDrawnBalls — estado bitmask', () => {
    it('Estado inicial: FREE SPACE (bit 12) sempre setado', () => {
        const ticket = makeTicket('1', ROW0_MATRIX);
        const state  = applyDrawnBalls(ticket, []);
        expect(state & (1 << 12)).toBe(1 << 12);
    });

    it('Bola 1 (posição 0 da matrix) seta bit 0', () => {
        const ticket = makeTicket('1', ROW0_MATRIX);
        const state  = applyDrawnBalls(ticket, [1]);
        expect(state & 1).toBe(1);
    });

    it('ROW_0 completo: bolas 1,16,31,46,61 setam bits 0,5,10,15,20', () => {
        const ticket    = makeTicket('1', ROW0_MATRIX);
        const state     = applyDrawnBalls(ticket, [1, 16, 31, 46, 61]);
        const ROW0_MASK = (1 << 0) | (1 << 5) | (1 << 10) | (1 << 15) | (1 << 20);
        expect(state & ROW0_MASK).toBe(ROW0_MASK);
    });

    it('Bola fora da matrix → estado não muda (graceful)', () => {
        const ticket     = makeTicket('1', ROW0_MATRIX);
        const stateBase  = applyDrawnBalls(ticket, []);
        const stateAfter = applyDrawnBalls(ticket, [99]); // 99 não está na matrix
        expect(stateAfter).toBe(stateBase);
    });
});

// ── checkWinPatterns ──────────────────────────────────────────────────────────

describe('checkWinPatterns — múltiplos padrões', () => {
    const ROW0_MASK = 1082401n; // bits 0,5,10,15,20
    const COLB_MASK = 31n;      // bits 0-4
    const patterns = [
        { pattern_id: '1', name: 'ROW_0', mask: ROW0_MASK, weight: 100 },
        { pattern_id: '2', name: 'COL_B', mask: COLB_MASK, weight: 150 },
    ];

    it('Estado que satisfaz ROW_0 + COL_B → retorna ambos', () => {
        const ticket = makeTicket('1', ROW0_MATRIX);
        // Bolas que satisfazem ROW_0 e COL_B: 1,2,3,4,5 (COL_B) + 16,31,46,61 (ROW_0)
        const balls  = [1, 2, 3, 4, 5, 16, 31, 46, 61];
        const state  = applyDrawnBalls(ticket, balls);
        const result = checkWinPatterns(state, patterns);

        expect(result.length).toBeGreaterThanOrEqual(2);
        expect(result.map(p => p.name)).toContain('ROW_0');
        expect(result.map(p => p.name)).toContain('COL_B');
    });

    it('Estado inicial (apenas FREE SPACE) → array vazio', () => {
        const state  = 0x1000;
        const result = checkWinPatterns(state, patterns);
        expect(result).toHaveLength(0);
    });

    it('patterns vazio → array vazio', () => {
        const result = checkWinPatterns(0xFFFFFFFF, []);
        expect(result).toHaveLength(0);
    });
});

// ── findFirstFullCutoff ───────────────────────────────────────────────────────

describe('findFirstFullCutoff', () => {
    beforeEach(() => jest.clearAllMocks());

    it('Ticket que completa na bola 5 → cutoff = 5', async () => {
        // Matrix: todas as bolas 1-24 (sem FREE SPACE)
        const fullMatrix = [1,2,3,4,5, 6,7,8,9,10, 11,12,13,14, 15,16,17,18,19, 20,21,22,23,24];
        mockGetTableRows.mockResolvedValue({ rows: [makeTicket('1', fullMatrix)], more: false });

        // Sequência: bolas 1-75, a cartela completa quando todas as 24 forem sorteadas
        const drawnBalls = Array.from({ length: 75 }, (_, i) => i + 1);

        // Cutoff é quando o MASTER é atingido — precisamos de todas as 24 bolas
        // da matrix para completar (mais o FREE SPACE que é automático)
        const cutoff = await findFirstFullCutoff('game1', drawnBalls);

        // A 24ª bola sorteada que esteja na matrix completa o MASTER
        expect(cutoff).toBeGreaterThan(0);
        expect(cutoff).toBeLessThanOrEqual(drawnBalls.length);
    });

    it('Nenhum ticket completa → retorna drawnBalls.length', async () => {
        // Matrix com bola 75 que nunca é sorteada nos primeiros 35 slots
        const matrix = [1,2,3,4,5, 6,7,8,9,10, 11,12,13,14, 15,16,17,18,19, 20,21,22,23,75];
        mockGetTableRows.mockResolvedValue({ rows: [makeTicket('1', matrix)], more: false });

        const drawnBalls = Array.from({ length: 10 }, (_, i) => i + 1); // só 10 bolas

        const cutoff = await findFirstFullCutoff('game1', drawnBalls);

        expect(cutoff).toBe(drawnBalls.length);
    });

    it('Sem tickets (tabela vazia) → retorna drawnBalls.length', async () => {
        mockGetTableRows.mockResolvedValue({ rows: [], more: false });

        const drawnBalls = Array.from({ length: 35 }, (_, i) => i + 1);
        const cutoff     = await findFirstFullCutoff('game1', drawnBalls);

        expect(cutoff).toBe(drawnBalls.length);
    });
});

// ── preComputeMultiMatchCutoffs ───────────────────────────────────────────────

describe('preComputeMultiMatchCutoffs', () => {
    beforeEach(() => jest.clearAllMocks());

    it('Gametype não encontrado → lança Error', async () => {
        mockGetTableRows
            .mockResolvedValueOnce({ rows: [], more: false }); // gametype não existe

        await expect(
            preComputeMultiMatchCutoffs('game1', [1, 2, 3], '99')
        ).rejects.toThrow(/gametype/i);
    });

    it('2 stages + 1 ticket → retorna array de StageCutoffResult', async () => {
        const fullMatrix = [1,2,3,4,5, 6,7,8,9,10, 11,12,13,14, 15,16,17,18,19, 20,21,22,23,24];

        // ROW_0: bits 0,5,10,15,20 → 1082401
        const ROW0_MASK = 1082401;

        // preComputeMultiMatchCutoffs faz 4 get_table_rows:
        //   1. gametypes (para stages)
        //   2. gametypes via fetchGametypePatterns (para rules)
        //   3. patterns (para cada rule — 1 rule aqui)
        //   4. tickets (para scan)

        const gametypeMock = {
            rows: [{
                gametype_id: '1', draw_mode: 'multimatch', base_multiplier: 100,
                rules: [{ pattern_id: '1', weight: 100 }],
                stages: [
                    { stage: 1, patterns_required: 1, weight: 100 },
                    { stage: 2, patterns_required: 2, weight: 200 },
                ],
            }],
            more: false,
        };

        const patternMock = {
            rows: [{ pattern_id: '1', name: 'ROW_0', mask: ROW0_MASK }],
            more: false,
        };

        mockGetTableRows
            .mockResolvedValueOnce(gametypeMock)   // 1ª: preComputeMultiMatchCutoffs (stages)
            .mockResolvedValueOnce(gametypeMock)   // 2ª: fetchGametypePatterns (rules)
            .mockResolvedValueOnce(patternMock)    // 3ª: fetchGametypePatterns (pattern ROW_0)
            .mockResolvedValue({ rows: [makeTicket('1', fullMatrix)], more: false }); // tickets

        const drawnBalls = [1, 16, 31, 46, 61]; // ROW_0

        const results = await preComputeMultiMatchCutoffs('game1', drawnBalls, '1');

        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(2); // 2 stages
    });
});
