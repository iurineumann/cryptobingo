// REGRESSÃO E2E — jogo 1784068761133 (sala 12 / gametype 2 / FIRST_FULL, cartela cheia MASTER)
//
// Bug: o painel da sala exibia "Room paid 100.0000 BINGO" enquanto o contrato pagou
// 1000.0000 BINGO. Causa: orchestrateFirstFull não propagava o master_weight_ovrd
// (1000) para findAllWinners → selectBestPayout, então o worker usava o weight da
// rule (100) em vez do override do MASTER. O contrato (bingo.cpp:1102-1103) aplica
// master_weight_ovrd para o padrão MASTER, logo paga 1 × 100 × 1000 / 100 = 1000.
//
// Este teste monta um ticket MASTER completo e verifica que findAllWinners devolve
// weight === 1000 QUANDO masterWeightOvrd=1000 é propagado, e weight === 100 (rule)
// quando masterWeightOvrd=0. Se a propagação quebrar, o 1º caso falha (vem 100).

jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_table_rows: jest.fn() } } },
    parseHexBytes: jest.fn((hex: string) => Buffer.from(hex, 'hex').toJSON().data),
}));
jest.mock('./combinationEvaluator', () => {
    const actual = jest.requireActual('./combinationEvaluator');
    return {
        ...actual,
        fetchComboContext: jest.fn().mockResolvedValue({ combos: [], patternTypeByName: new Map(), patternNameById: new Map() }),
    };
});
jest.mock('./patternCache', () => ({
    fetchPatternsWithCache: jest.fn(),
}));

import { rpcClient } from '@cryptobingo/blockchain-core';
import { fetchPatternsWithCache } from './patternCache';
import { findAllWinners, computePayoutAmount } from './evaluator';

const mockGetTableRows = rpcClient.v1.chain.get_table_rows as jest.Mock;
const mockFetchPatterns = fetchPatternsWithCache as jest.Mock;

// MASTER mask = 0x1FFFFFF (bits 0..24, toda a cartela 5x5).
const MASTER_MASK = 33554431n;

// Padrões do gametype 2 (First Full): MASTER com weight 100 (rule). O override
// master_weight_ovrd=1000 é aplicado em runtime por selectBestPayout.
const GT2_PATTERNS = [
    { name: 'MASTER', mask: MASTER_MASK, weight: 100 },
];

// matrix 5x5 (24 entradas; bit 12 = FREE SPACE é setado automaticamente).
// bits 0..11  -> matrix[0..11]
// bits 13..24 -> matrix[12..23]
const FULL_MATRIX = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
];
// Todas as 24 bolas da cartela (FREE não tem bola própria).
const FULL_DRAWN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];

function makeMasterTicket() {
    return { ticket_id: '1666747532814183487', owner: 'vencedor1', matrix: FULL_MATRIX, state: 0x1000, game_id: '1784068761133' };
}

describe('REGRESSÃO E2E — First Full MASTER (jogo 1784068761133)', () => {
    beforeEach(() => {
        mockFetchPatterns.mockResolvedValue(GT2_PATTERNS);
        mockGetTableRows.mockResolvedValue({ rows: [makeMasterTicket()], more: false });
    });
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('aplica master_weight_ovrd (1000) no padrão MASTER quando propagado', async () => {
        const winners = await findAllWinners('1784068761133', FULL_DRAWN, '2', 1000);
        expect(winners.length).toBe(1);
        expect(winners[0]!.patternName).toBe('MASTER');
        expect(winners[0]!.weight).toBe(1000);
    });

    it('NÃO aplica override (weight=100 da rule) quando masterWeightOvrd=0', async () => {
        const winners = await findAllWinners('1784068761133', FULL_DRAWN, '2', 0);
        expect(winners.length).toBe(1);
        expect(winners[0]!.weight).toBe(100);
    });

    it('computePayoutAmount: 1 × 100 × 1000 / 100 = 1000 (espelha o pagamento on-chain)', () => {
        const payout = computePayoutAmount('1.0000 BINGO', 100, 1000, 0);
        expect(payout.amount).toBe(1000);
        expect(payout.currency).toBe('BINGO');
    });
});
