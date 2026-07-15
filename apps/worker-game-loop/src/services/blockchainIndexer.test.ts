// TDD — fix #329: total_tickets deve ser a CONTAGEM de tickets, nunca o ticket_id (uint64 gigante).
// Bug: parseInt(ultimoTicket.ticket_id) estoura INTEGER (int32) -> 'value 245046368330606700 is out of range for type integer'.
import { indexGames } from './blockchainIndexer';

const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
const mockGetTableRows = jest.fn();

jest.mock('pg', () => ({
    Pool: jest.fn().mockImplementation(() => ({ query: (...args: any[]) => mockQuery(...args) })),
}));
jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_table_rows: (...args: any[]) => mockGetTableRows(...args) } } },
    Name: { from: (v: any) => v },
    UInt64: { from: (v: any) => v },
}));
jest.mock('./redis', () => ({
    redisClient: { get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue('OK') },
}));
jest.mock('./logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));

const BIG_TICKET_ID = '245046368330606700';

function gameRow(over: Partial<any> = {}) {
    return {
        game_id: BIG_TICKET_ID,
        status: 'archived',
        ticket_price: { quantity: '1.0000 WAX', contract: 'eosio.token' },
        total_wagered: { quantity: '10.0000 WAX' },
        total_paid: 0,
        gametype_id: '1',
        campaign_id: '0',
        end_time: 1784080000,
        ...over,
    };
}

describe('indexGames — total_tickets', () => {
    beforeEach(() => {
        mockQuery.mockClear();
        mockGetTableRows.mockReset();
    });

    it('usa a CONTAGEM de tickets (rows.length), nao o ticket_id gigante', async () => {
        // get_table_rows chamado 2x: (1) games, (2) tickets do jogo
        mockGetTableRows
            .mockResolvedValueOnce({ rows: [gameRow()] }) // games
            .mockResolvedValueOnce({                                       // tickets
                rows: [
                    { ticket_id: BIG_TICKET_ID, owner: 'a', matrix: [], state: 0o2000, game_id: BIG_TICKET_ID },
                    { ticket_id: '245046368330606701', owner: 'b', matrix: [], state: 0o2000, game_id: BIG_TICKET_ID },
                    { ticket_id: '245046368330606702', owner: 'c', matrix: [], state: 0o2000, game_id: BIG_TICKET_ID },
                ],
            });

        await indexGames();

        // O INSERT em games_history é a query com 12 parâmetros ($1..$12)
        const insertCall = mockQuery.mock.calls.find((c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO games_history'));
        expect(insertCall).toBeDefined();
        const params = insertCall![1] as any[];
        const totalTickets = params[6]; // $7 = total_tickets

        // Deve ser a contagem (3), NUNCA o ticket_id gigante (245046368330606700)
        expect(totalTickets).toBe(3);
        expect(totalTickets).not.toBe(Number(BIG_TICKET_ID));
        // E deve caber em INTEGER (int32): |v| <= 2_147_483_647
        expect(Number.isInteger(totalTickets)).toBe(true);
        expect(Math.abs(totalTickets)).toBeLessThanOrEqual(2_147_483_647);
    });

    it('nao quebra com jogo sem tickets (total_tickets = 0)', async () => {
        mockGetTableRows
            .mockResolvedValueOnce({ rows: [gameRow()] })
            .mockResolvedValueOnce({ rows: [] });

        await expect(indexGames()).resolves.toBeUndefined();

        const insertCall = mockQuery.mock.calls.find((c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO games_history'));
        expect(insertCall).toBeDefined();
        expect((insertCall![1] as any[])[6]).toBe(0);
    });

    it('rtp_pct finito mesmo com prêmio >> aposta (RTP alto, sem NaN/Infinity)', async () => {
        // Jogo com wagered pequeno e paid grande -> RTP muito alto (ex: jackpot/sponsor)
        const highRtpGame = gameRow({
            total_wagered: { quantity: '0.0001 WAX' },
            total_paid: 150,
        });
        mockGetTableRows
            .mockResolvedValueOnce({ rows: [highRtpGame] })
            .mockResolvedValueOnce({ rows: [{ ticket_id: '1', owner: 'a', matrix: [], state: 0o2000, game_id: BIG_TICKET_ID }] });

        await expect(indexGames()).resolves.toBeUndefined();

        const insertCall = mockQuery.mock.calls.find((c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO games_history'));
        expect(insertCall).toBeDefined();
        const params = insertCall![1] as any[];
        const rtpPct = params[10]; // $11 = rtp_pct

        expect(Number.isFinite(rtpPct)).toBe(true);
        expect(rtpPct).not.toBe(Infinity);
        expect(rtpPct).not.toBeNaN();
        // 150 / 0.0001 = 1_500_000 -> deve caber em NUMERIC(18,4), nao estourar
        expect(rtpPct).toBe(1500000);
    });
});
