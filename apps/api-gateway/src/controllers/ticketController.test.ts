import {
    generateBingoMatrix,
    computeTicketHash,
    matrixRedisKey,
} from './ticketController';

// ==========================================
// generateBingoMatrix
// ==========================================

describe('generateBingoMatrix', () => {
    it('retorna exatamente 24 elementos', () => {
        const matrix = generateBingoMatrix();
        expect(matrix.length).toBe(24);
    });

    it('todos os números estão entre 1 e 75', () => {
        for (let i = 0; i < 100; i++) {
            const matrix = generateBingoMatrix();
            for (const n of matrix) {
                expect(n).toBeGreaterThanOrEqual(1);
                expect(n).toBeLessThanOrEqual(75);
            }
        }
    });

    it('coluna N emite 4 números (FREE SPACE omitido no row 2)', () => {
        // matrix[N_row0] = [10], N_row1 = [11], N_row3 = [12], N_row4 = [13]
        for (let i = 0; i < 50; i++) {
            const matrix = generateBingoMatrix();
            const colN = [matrix[10], matrix[11], matrix[12], matrix[13]];
            expect(colN.length).toBe(4);
            for (const n of colN) {
                expect(n).toBeGreaterThanOrEqual(31);
                expect(n).toBeLessThanOrEqual(45);
            }
        }
    });

    it('coluna B contém 5 números entre 1-15', () => {
        for (let i = 0; i < 20; i++) {
            const matrix = generateBingoMatrix();
            const colB = matrix.slice(0, 5);
            expect(colB.length).toBe(5);
            for (const n of colB) {
                expect(n).toBeGreaterThanOrEqual(1);
                expect(n).toBeLessThanOrEqual(15);
            }
        }
    });

    it('coluna O contém 5 números entre 61-75', () => {
        for (let i = 0; i < 20; i++) {
            const matrix = generateBingoMatrix();
            const colO = matrix.slice(19, 24);
            expect(colO.length).toBe(5);
            for (const n of colO) {
                expect(n).toBeGreaterThanOrEqual(61);
                expect(n).toBeLessThanOrEqual(75);
            }
        }
    });

    it('não contém números duplicados na mesma cartela', () => {
        for (let i = 0; i < 50; i++) {
            const matrix = generateBingoMatrix();
            const unique = new Set(matrix);
            expect(unique.size).toBe(24);
        }
    });
});

// ==========================================
// computeTicketHash — serialização determinística
// ==========================================

describe('computeTicketHash', () => {
    const MATRIX = [
        1,  2,  3,  4,  5,
        16, 17, 18, 19, 20,
        31, 32, 33, 34,
        46, 47, 48, 49, 50,
        61, 62, 63, 64, 65,
    ];

    it('produz hash determinístico para mesmas entradas', () => {
        const h1 = computeTicketHash(MATRIX, '1', 'jogador1');
        const h2 = computeTicketHash(MATRIX, '1', 'jogador1');
        expect(h1.array).toEqual(h2.array);
    });

    it('produz hash diferente para conta diferente', () => {
        const h1 = computeTicketHash(MATRIX, '1', 'jogador1');
        const h2 = computeTicketHash(MATRIX, '1', 'jogador2');
        expect(h1.array).not.toEqual(h2.array);
    });

    it('produz hash diferente para game_id diferente', () => {
        const h1 = computeTicketHash(MATRIX, '1', 'jogador1');
        const h2 = computeTicketHash(MATRIX, '2', 'jogador1');
        expect(h1.array).not.toEqual(h2.array);
    });

    it('produz hash diferente para matriz diferente', () => {
        const diffMatrix = [
            2,  3,  4,  5,  6,
            16, 17, 18, 19, 20,
            31, 32, 33, 34,
            46, 47, 48, 49, 50,
            61, 62, 63, 64, 65,
        ];
        const h1 = computeTicketHash(MATRIX, '1', 'jogador1');
        const h2 = computeTicketHash(diffMatrix, '1', 'jogador1');
        expect(h1.array).not.toEqual(h2.array);
    });
});

// ==========================================
// matrixRedisKey
// ==========================================

describe('matrixRedisKey', () => {
    const MATRIX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];

    it('inclui game_id no prefixo da chave', () => {
        const key = matrixRedisKey('42', MATRIX);
        expect(key).toMatch(/^game:42:matrix:/);
    });

    it('produz chave determinística (SHA-256 hex)', () => {
        const k1 = matrixRedisKey('1', MATRIX);
        const k2 = matrixRedisKey('1', MATRIX);
        expect(k1).toBe(k2);
    });

    it('produz chave diferente para diferentes game_ids', () => {
        const k1 = matrixRedisKey('1', MATRIX);
        const k2 = matrixRedisKey('2', MATRIX);
        expect(k1).not.toBe(k2);
    });
});
