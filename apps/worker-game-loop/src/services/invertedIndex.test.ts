// Testes unitários para o Índice Invertido Redis (SPEC.md §3.2).

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPipeline = {
    sAdd:   jest.fn().mockReturnThis(),
    rPush:  jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    del:    jest.fn().mockReturnThis(),
    exec:   jest.fn().mockResolvedValue([]),
};

jest.mock('./redis', () => ({
    redisClient: {
        multi:  jest.fn(() => mockPipeline),
        lRange: jest.fn(),
        sCard:  jest.fn(),
    },
}));

jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient:      { v1: { chain: { get_table_rows: jest.fn() } } },
    parseHexBytes: jest.fn((hex: string) => Buffer.from(hex, 'hex').toJSON().data),
}));

import { redisClient }   from './redis';
import { rpcClient }     from '@cryptobingo/blockchain-core';
import {
    buildInvertedIndex,
    getTicketsForBall,
    indexExists,
    deleteIndex,
    BallEntry,
} from './invertedIndex';

const mockGetTableRows = rpcClient.v1.chain.get_table_rows as jest.Mock;
const mockLRange       = redisClient.lRange as jest.Mock;
const mockSCard        = redisClient.sCard  as jest.Mock;

// Ticket com 24 números fixos (coluna-maior sem FREE SPACE)
function makeTicket(ticketId: string, matrix: number[]) {
    return { ticket_id: ticketId, matrix, state: 0x1000, owner: 'jogador1', game_id: '1' };
}

// Matrix simples: B[1-5], I[16-20], N[31-32,33-34], G[46-50], O[61-65]
const MATRIX_A = [1,2,3,4,5, 16,17,18,19,20, 31,32,33,34, 46,47,48,49,50, 61,62,63,64,65];
const MATRIX_B = [6,7,8,9,10, 21,22,23,24,25, 36,37,38,39, 51,52,53,54,55, 66,67,68,69,70];

// ── buildInvertedIndex ────────────────────────────────────────────────────────

describe('buildInvertedIndex', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPipeline.sAdd.mockReturnThis();
        mockPipeline.rPush.mockReturnThis();
        mockPipeline.expire.mockReturnThis();
        mockPipeline.del.mockReturnThis();
        mockPipeline.exec.mockResolvedValue([]);
    });

    it('2 tickets → rPush chamado 48x (24 bolas × 2 cartelas)', async () => {
        mockGetTableRows.mockResolvedValueOnce({
            rows: [makeTicket('1', MATRIX_A), makeTicket('2', MATRIX_B)],
            more: false,
        });

        await buildInvertedIndex('game1');

        // Cada ticket tem 24 números — cada um gera um rPush
        expect(mockPipeline.rPush).toHaveBeenCalledTimes(48);
    });

    it('2 tickets → expire chamado 76x (1 ticketSet + 75 bolas)', async () => {
        mockGetTableRows.mockResolvedValueOnce({
            rows: [makeTicket('1', MATRIX_A), makeTicket('2', MATRIX_B)],
            more: false,
        });

        await buildInvertedIndex('game1');

        // expire é chamado em expirePipeline: 1 (ticketSet) + 75 (bolas)
        expect(mockPipeline.expire).toHaveBeenCalledTimes(76);
    });

    it('sAdd chamado com chave game:game1:ticket_ids para cada ticket', async () => {
        mockGetTableRows.mockResolvedValueOnce({
            rows: [makeTicket('1', MATRIX_A)],
            more: false,
        });

        await buildInvertedIndex('game1');

        expect(mockPipeline.sAdd).toHaveBeenCalledWith(
            'game:game1:ticket_ids',
            '1'
        );
    });

    it('paginação: more=true continua; more=false para', async () => {
        // Página 1: 100 tickets (more=true)
        const page1 = Array.from({ length: 100 }, (_, i) =>
            makeTicket(String(i + 1), MATRIX_A));
        // Página 2: 1 ticket (more=false)
        const page2 = [makeTicket('101', MATRIX_B)];

        mockGetTableRows
            .mockResolvedValueOnce({ rows: page1, more: true })
            .mockResolvedValueOnce({ rows: page2, more: false });

        await buildInvertedIndex('game1');

        expect(mockGetTableRows).toHaveBeenCalledTimes(2);
    });

    it('Bit 12 (FREE SPACE) nunca aparece como bit_index nos entries', async () => {
        mockGetTableRows.mockResolvedValueOnce({
            rows: [makeTicket('1', MATRIX_A)],
            more: false,
        });

        await buildInvertedIndex('game1');

        const allCalls = mockPipeline.rPush.mock.calls;
        for (const [, entryJson] of allCalls) {
            const entry = JSON.parse(entryJson as string) as BallEntry;
            expect(entry.bit_index).not.toBe(12);
        }
    });
});

// ── getTicketsForBall ─────────────────────────────────────────────────────────

describe('getTicketsForBall', () => {
    beforeEach(() => jest.clearAllMocks());

    it('Redis disponível → retorna array de BallEntry parseado', async () => {
        const entries: BallEntry[] = [
            { ticket_id: '1', bit_index: 0 },
            { ticket_id: '2', bit_index: 5 },
        ];
        mockLRange.mockResolvedValue(entries.map(e => JSON.stringify(e)));

        const result = await getTicketsForBall('game1', 1);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ ticket_id: '1', bit_index: 0 });
    });

    it('Redis lança ECONNREFUSED → retorna [] sem propagar erro', async () => {
        mockLRange.mockRejectedValue(new Error('ECONNREFUSED'));

        const result = await getTicketsForBall('game1', 42);

        expect(result).toEqual([]);
    });

    it('Bola sem entradas → array vazio', async () => {
        mockLRange.mockResolvedValue([]);

        const result = await getTicketsForBall('game1', 99);

        expect(result).toEqual([]);
    });

    it('Chave de bola correta: game:{gameId}:ball:{ball}', async () => {
        mockLRange.mockResolvedValue([]);
        await getTicketsForBall('mygame', 33);

        expect(mockLRange).toHaveBeenCalledWith('game:mygame:ball:33', 0, -1);
    });
});

// ── indexExists ───────────────────────────────────────────────────────────────

describe('indexExists', () => {
    beforeEach(() => jest.clearAllMocks());

    it('sCard = 5 → true', async () => {
        mockSCard.mockResolvedValue(5);
        expect(await indexExists('game1')).toBe(true);
    });

    it('sCard = 0 → false', async () => {
        mockSCard.mockResolvedValue(0);
        expect(await indexExists('game1')).toBe(false);
    });

    it('sCard lança → false (fail-safe)', async () => {
        mockSCard.mockRejectedValue(new Error('Redis down'));
        expect(await indexExists('game1')).toBe(false);
    });
});

// ── deleteIndex ───────────────────────────────────────────────────────────────

describe('deleteIndex', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPipeline.del.mockReturnThis();
        mockPipeline.exec.mockResolvedValue([]);
    });

    it('del chamado 76x (1 ticketSet + 75 bolas)', async () => {
        await deleteIndex('game1');
        expect(mockPipeline.del).toHaveBeenCalledTimes(76);
    });

    it('del chamado com ticketSetKey correto', async () => {
        await deleteIndex('game99');
        expect(mockPipeline.del).toHaveBeenCalledWith('game:game99:ticket_ids');
    });

    it('exec lança → erro swallowed (sem propagação)', async () => {
        mockPipeline.exec.mockRejectedValue(new Error('Pipeline failed'));
        await expect(deleteIndex('game1')).resolves.not.toThrow();
    });
});
