import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchGamePrizeTransactions } from '../api';

beforeEach(() => vi.clearAllMocks());

describe('fetchGamePrizeTransactions', () => {
    it('fetches prizes for a gameId', async () => {
        const data = { items: [{ ticketId: '42' }], total: 1, gameId: '1' };
        mockFetch.mockResolvedValue({ ok: true, json: async () => data });
        const result = await fetchGamePrizeTransactions('1');
        expect(result).toEqual(data);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/games/1/prizes'),
            expect.anything(),
        );
    });

    it('throws on non-ok response', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 500 });
        await expect(fetchGamePrizeTransactions('1')).rejects.toThrow();
    });
});
