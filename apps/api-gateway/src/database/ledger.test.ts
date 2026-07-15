// apps/api-gateway/src/database/ledger.test.ts
//
// Regressão: getPlatformSummary deve retornar { totals, by_token[] } com
// agregação multi-token (ADR-055). total_prizes do transactions_ledger,
// avg_rtp_pct de games_history.total_paid_out / (ticket_price * total_tickets).

jest.mock('./index', () => ({
    pgPool: { query: jest.fn() },
}));

import { pgPool } from './index';
import { getPlatformSummary } from './ledger';

const mockQuery = pgPool.query as jest.Mock;

function rowFor(sql: string): { rows: any[] } {
    // Query 1: games by token (GROUP BY ticket_symbol)
    if (sql.includes('ticket_symbol') && sql.includes('GROUP BY')) {
        return {
            rows: [
                { token: 'WAX',   total_games: 485, total_paid_out: '0',     total_wagered: '0' },
                { token: 'BINGO', total_games: 152, total_paid_out: '129.2', total_wagered: '152' },
            ],
        };
    }
    // Query 2: claim_win by currency
    if (sql.includes('claim_win') && sql.includes('GROUP BY')) {
        return {
            rows: [
                { token: 'BINGO', total_prizes: '1135.00' },
            ],
        };
    }
    // Query 3: players by currency (COUNT DISTINCT wallet_address)
    if (sql.includes('wallet_address') && sql.includes('GROUP BY')) {
        return {
            rows: [
                { token: 'WAX',   total_players: 1 },
                { token: 'BINGO', total_players: 1 },
            ],
        };
    }
    return { rows: [] };
}

describe('getPlatformSummary — multi-token (ADR-055)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockQuery.mockImplementation((sql: string) => Promise.resolve(rowFor(sql)));
    });

    it('retorna structure { totals, by_token[], generated_at }', async () => {
        const summary = await getPlatformSummary();
        expect(summary).toHaveProperty('totals');
        expect(summary).toHaveProperty('by_token');
        expect(summary).toHaveProperty('generated_at');
        expect(Array.isArray(summary.by_token)).toBe(true);
        expect(typeof summary.generated_at).toBe('string');
    });

    it('by_token contem WAX e BINGO com dados corretos', async () => {
        const summary = await getPlatformSummary();
        const wax   = summary.by_token.find(t => t.token === 'WAX');
        const bingo = summary.by_token.find(t => t.token === 'BINGO');

        expect(wax).toBeDefined();
        expect(bingo).toBeDefined();

        // WAX: 485 games, sem prizes (claim_win só BINGO), RTP 0 (paid_out=0)
        expect(wax!.total_games).toBe(485);
        expect(wax!.total_prizes).toBe(0);
        expect(wax!.avg_rtp_pct).toBe(0);
        expect(wax!.total_players).toBe(1);

        // BINGO: 152 games, prizes 1135 do claim_win, RTP = 129.2/152*100 = 85.0
        expect(bingo!.total_games).toBe(152);
        expect(bingo!.total_prizes).toBe(1135);
        expect(bingo!.avg_rtp_pct).toBe(85);
        expect(bingo!.total_players).toBe(1);
    });

    it('totals = soma dos tokens', async () => {
        const summary = await getPlatformSummary();
        expect(summary.totals.total_games).toBe(637);   // 485 + 152
        expect(summary.totals.total_players).toBe(2);   // 1 + 1
    });

    it('usa claim_win do transactions_ledger para total_prizes', async () => {
        await getPlatformSummary();
        const claimWinQuery = mockQuery.mock.calls.find(
            (c: any[]) => String(c[0]).includes('claim_win') && String(c[0]).includes('GROUP BY')
        );
        expect(claimWinQuery).toBeDefined();
    });
});
