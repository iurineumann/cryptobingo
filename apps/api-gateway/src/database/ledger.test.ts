// apps/api-gateway/src/database/ledger.test.ts
//
// Regressão: getPlatformSummary deve calcular total_prizes a partir do
// transactions_ledger (soma de claim_win), NÃO de games_history.total_paid_out
// (que o contrato não popula -> vem 0). Ver issue #321.
//
// Antes do fix: total_prizes somava SUM(total_paid_out) de games_history (=0).
// Depois: total_prizes = SUM(amount) WHERE action_type='claim_win' no ledger.

jest.mock('./index', () => ({
    pgPool: { query: jest.fn() },
}));

import { pgPool } from './index';
import { getPlatformSummary } from './ledger';

const mockQuery = pgPool.query as jest.Mock;

function rowFor(sql: string): { rows: any[] } {
    if (sql.includes('claim_win')) {
        return { rows: [{ total_prizes: '1135.00' }] };
    }
    if (sql.includes('COUNT(DISTINCT wallet_address)')) {
        return { rows: [{ total_players: 1 }] };
    }
    // query de games_history (total_games / avg_rtp_pct)
    return { rows: [{ total_games: 210, avg_rtp_pct: 0 }] };
}

describe('getPlatformSummary — total_prizes do transactions_ledger', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockQuery.mockImplementation((sql: string) => Promise.resolve(rowFor(sql)));
    });

    it('total_prizes vem da soma dos claim_win (não de games_history.total_paid_out)', async () => {
        const summary = await getPlatformSummary();
        // Prova que a query de prêmios olha o ledger transacional:
        const prizesQuery = mockQuery.mock.calls.find((c: any[]) => String(c[0]).includes('claim_win'));
        expect(prizesQuery).toBeDefined();
        expect(summary.total_prizes).toBe(1135);
    });

    it('total_games vem de games_history; total_players do ledger', async () => {
        const summary = await getPlatformSummary();
        expect(summary.total_games).toBe(210);
        expect(summary.total_players).toBe(1);
        expect(summary.currency).toBe('WAX');
    });
});
