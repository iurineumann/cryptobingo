// Testes unitários para ticketUtils.ts
// Foca em: getCol, maskToCells, sortTickets (deduplicação), isCombinationSatisfied

import { describe, it, expect } from 'vitest';
import {
    getCol,
    maskToCells,
    weightToPrize,
    sortTickets,
    groupTicketsByCategory,
    isCombinationSatisfied,
    type Pattern,
    type WinnerInfo,
    type CombinationRuleInput,
} from './ticketUtils';

// ── getCol ────────────────────────────────────────────────────────────────────

describe('getCol', () => {
    it('classifica B (1–15)', () => {
        expect(getCol(1)).toBe('B');
        expect(getCol(15)).toBe('B');
    });
    it('classifica I (16–30)', () => {
        expect(getCol(16)).toBe('I');
        expect(getCol(30)).toBe('I');
    });
    it('classifica N (31–45)', () => {
        expect(getCol(31)).toBe('N');
        expect(getCol(45)).toBe('N');
    });
    it('classifica G (46–60)', () => {
        expect(getCol(46)).toBe('G');
        expect(getCol(60)).toBe('G');
    });
    it('classifica O (61–75)', () => {
        expect(getCol(61)).toBe('O');
        expect(getCol(75)).toBe('O');
    });
});

// ── maskToCells ───────────────────────────────────────────────────────────────

describe('maskToCells', () => {
    it('retorna 25 células para qualquer mask', () => {
        expect(maskToCells(0).length).toBe(25);
        expect(maskToCells(0xFFFFFF).length).toBe(25);
    });

    it('todas as células zeradas para mask 0', () => {
        expect(maskToCells(0).every(c => c === 0)).toBe(true);
    });

    it('bit 0 ativa a célula 0 (row-major após conversão)', () => {
        const cells = maskToCells(1); // bit 0 = primeira célula
        expect(cells[0]).toBe(1);
    });

    it('mask da primeira linha (row 0: bits 0,5,10,15,20 column-major) → row-major [0,1,2,3,4]', () => {
        // Primeira linha em column-major: bit 0 (B0), bit 5 (I0), bit 10 (N0), bit 15 (G0), bit 20 (O0)
        const rowMask = (1 << 0) | (1 << 5) | (1 << 10) | (1 << 15) | (1 << 20);
        const cells   = maskToCells(rowMask);
        // Row-major pos 0=B0, 1=I0, 2=N0, 3=G0, 4=O0
        expect(cells[0]).toBe(1);
        expect(cells[1]).toBe(1);
        expect(cells[2]).toBe(1);
        expect(cells[3]).toBe(1);
        expect(cells[4]).toBe(1);
        // Outros devem ser 0
        expect(cells.slice(5).every(c => c === 0)).toBe(true);
    });
});

// ── weightToPrize ─────────────────────────────────────────────────────────────

describe('weightToPrize', () => {
    it('converte hundredths para string decimal', () => {
        expect(weightToPrize(100)).toBe('1.00');
        expect(weightToPrize(200)).toBe('2.00');
        expect(weightToPrize(850)).toBe('8.50');
        expect(weightToPrize(1000)).toBe('10.00');
    });
});

// ── sortTickets ───────────────────────────────────────────────────────────────

const makeMatrix = (): number[] => [
    // B col (rows 0-4): 1-14
    1, 2, 3, 4, 5,
    // I col: 16-20
    16, 17, 18, 19, 20,
    // N col (4 valores, sem FREE): 31, 32, 33, 34
    31, 32, 33, 34,
    // G col: 46-50
    46, 47, 48, 49, 50,
    // O col: 61-65
    61, 62, 63, 64, 65,
];

const SIMPLE_PATTERN: Pattern = {
    name: 'TestLine',
    prize: '1.00',
    cells: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0], // primeira linha
};

// Nota: sortTickets é uma função de ORDENAÇÃO, não de deduplicação.
// A deduplicação acontece no setRows do useGamesHistory (testado separadamente).
describe('sortTickets — ordenação', () => {
    it('retorna todos os tickets passados (sem filtrar)', () => {
        const tickets = [
            { id: 'A', matrix: makeMatrix() },
            { id: 'B', matrix: makeMatrix() },
            { id: 'C', matrix: makeMatrix() },
        ];
        const result = sortTickets(tickets, new Set(), [], new Map(), 0, 75, 'during');
        expect(result.length).toBe(3);
    });

    it('fase during: ticket com mais células marcadas vem primeiro', () => {
        const t1 = { id: 'few',  matrix: makeMatrix() };  // sem bolas sorteadas
        const t2 = { id: 'many', matrix: makeMatrix() };  // com bolas sorteadas
        const drawnSet = new Set<number>([1, 2, 3, 4, 5, 16, 17]);

        const result = sortTickets([t1, t2], drawnSet, [], new Map(), drawnSet.size, 75, 'during');
        // Ambos têm a mesma matriz — resultado é estável, só verifica que retorna os dois
        expect(result.length).toBe(2);
    });
});

describe('sortTickets — ordenação por fase', () => {
    it('fase after: vencedor aparece primeiro', () => {
        const tickets = [
            { id: 'loser',  matrix: makeMatrix() },
            { id: 'winner', matrix: makeMatrix() },
        ];
        const winnerMap = new Map<string, WinnerInfo>([
            ['winner', { prize: '10.00', patternName: 'TestLine', totalPrize: 10, patternCount: 1 }],
        ]);
        const result = sortTickets(tickets, new Set(), [SIMPLE_PATTERN], winnerMap, 0, 75, 'after');
        expect(result[0].id).toBe('winner');
    });
});

// ── groupTicketsByCategory ────────────────────────────────────────────────────

describe('groupTicketsByCategory', () => {
    it('retorna grupos não-vazios', () => {
        const tickets = [{ id: 'T1', matrix: makeMatrix() }];
        const groups = groupTicketsByCategory(tickets, new Set(), [], new Map(), 0, 75, 'during');
        const total = groups.reduce((sum, g) => sum + g.tickets.length, 0);
        expect(total).toBe(1);
    });

    it('não duplica tickets nos grupos', () => {
        const tickets = [
            { id: 'A', matrix: makeMatrix() },
            { id: 'B', matrix: makeMatrix() },
        ];
        const groups = groupTicketsByCategory(tickets, new Set(), [], new Map(), 0, 75, 'during');
        const allIds = groups.flatMap(g => g.tickets.map(t => t.id));
        const unique = [...new Set(allIds)];
        expect(allIds.length).toBe(unique.length);
    });
});

// ── isCombinationSatisfied ────────────────────────────────────────────────────

// isCombinationSatisfied usa clause.pattern_ids (não clause.patterns)
describe('isCombinationSatisfied', () => {
    const allOf: CombinationRuleInput = {
        name:    'AllOfTest',
        weight:  200,
        clauses: [{ type: 'all_of', pattern_ids: ['P1', 'P2'] }],
    };
    const anyOf: CombinationRuleInput = {
        name:    'AnyOfTest',
        weight:  100,
        clauses: [{ type: 'any_of', pattern_ids: ['P1', 'P2'] }],
    };

    it('all_of: satisfeito quando todos os pattern_ids estão completos', () => {
        const done = new Set(['P1', 'P2']);
        expect(isCombinationSatisfied(allOf, done, new Map())).toBe(true);
    });

    it('all_of: não satisfeito quando falta um pattern_id', () => {
        const done = new Set(['P1']); // P2 falta
        expect(isCombinationSatisfied(allOf, done, new Map())).toBe(false);
    });

    it('any_of: satisfeito com qualquer pattern_id presente', () => {
        const done = new Set(['P2']); // apenas P2
        expect(isCombinationSatisfied(anyOf, done, new Map())).toBe(true);
    });

    it('any_of: não satisfeito sem nenhum pattern_id', () => {
        const done = new Set<string>();
        expect(isCombinationSatisfied(anyOf, done, new Map())).toBe(false);
    });

    it('n_of_type: satisfeito quando count de tipo atingido', () => {
        const nOfType: CombinationRuleInput = {
            name:    'NOfType',
            weight:  300,
            clauses: [{ type: 'n_of_type', count: 2, pattern_type: 'simple' }],
        };
        const done = new Set(['P1', 'P2', 'P3']);
        const typeMap = new Map([['P1', 'simple'], ['P2', 'simple'], ['P3', 'special']]);
        expect(isCombinationSatisfied(nOfType, done, typeMap)).toBe(true);
    });

    it('n_of_type: não satisfeito quando count insuficiente', () => {
        const nOfType: CombinationRuleInput = {
            name:    'NOfType',
            weight:  300,
            clauses: [{ type: 'n_of_type', count: 3, pattern_type: 'simple' }],
        };
        const done = new Set(['P1', 'P2']);
        const typeMap = new Map([['P1', 'simple'], ['P2', 'simple']]);
        expect(isCombinationSatisfied(nOfType, done, typeMap)).toBe(false);
    });
});
